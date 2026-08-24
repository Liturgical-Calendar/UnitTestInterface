import { slugifySelector, escapeHtmlAttr } from './common.js';

/**
 * Paint a single server response (or stored descriptor) onto its target cards.
 *
 * Never throws. `classes` is a raw CSS selector built server-side, so a missing, empty or
 * malformed value used to raise out of `conn.onmessage` — and because the state machine is
 * driven from that handler, the whole run then wedged with no diagnostic (#43).
 *
 * @param {{type: string, classes?: string, text?: string}} responseData
 * @returns {number} how many cards were painted; 0 means the response matched nothing, which
 *                   is worth a warning because the counters increment regardless and the
 *                   totals then drift away from the rendered cards.
 */
export const applyResultToDom = (responseData) => {
    // Guard the argument itself, not just its `classes`: `JSON.parse('null')` yields `null`, and
    // reading `.type` off it throws — which would break the no-throw contract this function
    // documents, in the one code path that exists to keep a bad frame from wedging the run.
    if (null === responseData || 'object' !== typeof responseData) {
        console.warn('Response was not an object; nothing to paint.', responseData);
        return 0;
    }

    const isSuccess = responseData.type === 'success';
    const selector = typeof responseData.classes === 'string' ? responseData.classes.trim() : '';

    if ('' === selector) {
        console.warn('Response carried no `classes` selector; nothing to paint.', responseData);
        return 0;
    }

    let targets;
    try {
        targets = document.querySelectorAll(slugifySelector(selector));
    } catch (selectorError) {
        console.warn(`Response carried an unusable \`classes\` selector "${selector}"; nothing to paint.`, selectorError);
        return 0;
    }

    if (0 === targets.length) {
        console.warn(`No card matched \`classes\` selector "${selector}" — the run totals will drift from the rendered cards.`, responseData);
    }

    targets.forEach((el) => paintCard(el, isSuccess, responseData.text ?? ''));

    return targets.length;
};

/**
 * Paint one card with one outcome.
 *
 * Extracted so the two ways a card is addressed share the painting itself. `applyResultToDom()`
 * finds cards with the server-supplied `classes` selector, which is how a v1 frame — and a stored
 * run replayed from disk, whose descriptors record that selector — arrives; `resources.js` finds
 * them through its own `requestId` registry (#42). What they do to a card once found must not
 * differ, or a replayed run would look different from the run it replays.
 *
 * @param {Element} el - The card to paint.
 * @param {boolean} isSuccess - Whether the step passed.
 * @param {*} text - The server's message, shown in the failure tooltip. Coerced rather than
 *        assumed: `text` is whatever arrived on the wire, and `escapeHtmlAttr()` calls string
 *        methods on it — so a frame carrying a number or an object would throw here, inside the
 *        handler the whole run is driven from (#43).
 * @returns {void}
 */
export const paintCard = (el, isSuccess, text) => {
    // Absent stays absent — an empty tooltip is the existing behaviour for a failure with no
    // message — but anything else present becomes a string before it reaches escapeHtmlAttr().
    const tooltip = (undefined === text || null === text) ? '' : String(text);
    el.classList.remove('bg-info');
    el.classList.add(isSuccess ? 'bg-success' : 'bg-danger');
    const questionIcon = el.querySelector('.fa-circle-question');
    if (questionIcon) {
        questionIcon.classList.remove('fa-circle-question');
        questionIcon.classList.add(isSuccess ? 'fa-circle-check' : 'fa-circle-xmark');
    }
    if (!isSuccess) {
        const cardText = el.querySelector('.card-text');
        if (cardText && !cardText.querySelector('.error-tooltip')) {
            cardText.insertAdjacentHTML(
                'beforeend',
                `<span role="button" class="float-end error-tooltip" data-bs-toggle="tooltip" data-bs-title="${escapeHtmlAttr(tooltip)}"><i class="fas fa-bug fa-beat-fade" aria-hidden="true"></i></span>`
            );
        }
    }
};

/**
 * Accumulates run results in memory so they can be persisted at run completion.
 */
export const createResultCollector = () => {
    const results = [];
    return {
        /**
         * @param {string} phase
         * @param {object} responseData - The frame; read for status, message and test name only.
         * @param {?string} selector - The selector *we* found the card by. Not `responseData.classes`:
         *        that is the server's, and #42 removes our dependence on it. A stored run replays by
         *        applying this string, so it must address our own markup.
         */
        record(phase, responseData, selector) {
            results.push({
                phase,
                selector: selector ?? null,
                status: responseData.type === 'success' ? 'success' : 'error',
                message: responseData.type === 'error' ? (responseData.text ?? null) : null,
                // `responseData.test` is not part of the published `WebSocketFrame.json` schema — the
                // server never sends it; `Health::sendStepResult()` builds
                // `{type, text, classes, responsetype, target, step, status, details}` and nothing
                // else. For a unit-test-phase frame, `target.id` *is* the test name
                // (`Health::sendTestResult()` builds it via `frameTarget($test, [...])`), so it is the
                // real source; `responseData.test` is kept only as a fallback for a stub or server
                // that predates the typed target. Scoped to the `unitTest` phase: `target.id` names
                // something else for every other phase (an inventory id, a calendar), and must not
                // leak into this field for those.
                test: 'unitTest' === phase ? ( responseData.target?.id ?? responseData.test ?? null ) : null,
            });
        },
        all: () => results.slice(),
        reset: () => { results.length = 0; },
    };
};

/**
 * Tallies stored result descriptors by status.
 * @param {Array<{status: string}>} descriptors
 * @returns {{successful: number, failed: number}}
 */
export const countByStatus = (descriptors) => ({
    successful: descriptors.filter((d) => d.status === 'success').length,
    failed: descriptors.filter((d) => d.status !== 'success').length,
});

/** Current UTC time as `YYYY-MM-DDTHH:MM:SSZ` (no milliseconds). */
export const nowIsoStamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/**
 * POST a completed run to the server.
 *
 * A rejection carries the HTTP status on `err.status`. Callers need it to tell a declined save
 * (401 — nobody is logged in, and results.php stores nothing anonymously) from a genuine failure;
 * the run itself succeeded in the first case, so reporting it as a save failure misreads it.
 * Parsing the status back out of the message string would be the fragile alternative.
 */
export const postRunResults = async (payload) => {
    const res = await fetch('results.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = new Error(`Save failed: ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
};

/**
 * Fetch run summaries filtered to a single run type, newest first.
 *
 * Rejects with `err.status` set, like {@link postRunResults}: a 401 here is the ordinary state of
 * an anonymous visitor, not a fault worth logging.
 */
export const fetchRunSummaries = async (runType) => {
    const res = await fetch('results.php', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        const err = new Error(`List failed: ${res.status}`);
        err.status = res.status;
        throw err;
    }
    const all = await res.json();
    return all.filter((r) => r.runType === runType);
};

/**
 * Own one page's Past Runs dropdown: clearing it, and refilling it from results.php.
 *
 * Both runners want identical behaviour and differ only in which run type they list and how they
 * label an option, so the shared half lives here — beside `fetchRunSummaries()`, which it calls —
 * rather than in `common.js`, which holds generic DOM and string helpers with no results.php
 * knowledge and would have to import from this module to do the same job.
 *
 * @param {object} config
 * @param {HTMLSelectElement|null} config.select The dropdown, or null on a page without one
 * @param {string} config.runType `'calendars'` or `'resources'`
 * @param {(summary: object) => string} config.label Option text for one run summary
 * @returns {{load: () => Promise<void>, clear: () => void}}
 */
export const createPastRunsList = ({ select, runType, label }) => {
    // Bumped by every clear, so a load that was in flight when the list was cleared can tell that
    // its results are no longer wanted. Without it a logout landing mid-fetch clears the list and
    // the pending continuation then refills it, leaving the previous session's run filenames in a
    // dropdown the logged-out user still has in their DOM.
    let generation = 0;

    const clear = () => {
        generation++;
        if (!select) {
            return;
        }
        select.value = '';
        while (select.options.length > 1) {
            select.remove(1);
        }
    };

    const load = async () => {
        if (!select) {
            return;
        }
        clear();
        const loading = generation;
        try {
            const summaries = await fetchRunSummaries(runType);
            if (loading !== generation) {
                return;
            }
            for (const summary of summaries) {
                const opt = document.createElement('option');
                opt.value = summary.file;
                opt.textContent = label(summary);
                select.appendChild(opt);
            }
        } catch (err) {
            // A 401 is the ordinary state of an anonymous visitor rather than a fault: results.php
            // declines to list runs for anyone who is not logged in.
            if (401 === err.status) {
                return;
            }
            console.error('Could not load past runs', err);
        }
    };

    return { load, clear };
};

/** Fetch a single stored run's full detail. */
export const fetchRunDetail = async (file) => {
    const res = await fetch(`results.php?file=${encodeURIComponent(file)}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        const err = new Error(`Load failed: ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
};
