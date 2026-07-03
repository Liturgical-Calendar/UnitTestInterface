import { slugifySelector, escapeHtmlAttr } from './common.js';

/**
 * Paint a single server response (or stored descriptor) onto its target cards.
 * @param {{type: string, classes: string, text?: string}} responseData
 */
export const applyResultToDom = (responseData) => {
    const isSuccess = responseData.type === 'success';
    document.querySelectorAll(slugifySelector(responseData.classes)).forEach((el) => {
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
                    `<span role="button" class="float-end error-tooltip" data-bs-toggle="tooltip" data-bs-title="${escapeHtmlAttr(responseData.text ?? '')}"><i class="fas fa-bug fa-beat-fade" aria-hidden="true"></i></span>`
                );
            }
        }
    });
};

/**
 * Accumulates run results in memory so they can be persisted at run completion.
 */
export const createResultCollector = () => {
    const results = [];
    return {
        record(phase, responseData) {
            results.push({
                phase,
                selector: responseData.classes,
                status: responseData.type === 'success' ? 'success' : 'error',
                message: responseData.type === 'error' ? (responseData.text ?? null) : null,
                test: responseData.test ?? null,
            });
        },
        all: () => results.slice(),
        reset: () => { results.length = 0; },
    };
};

/** Current UTC time as `YYYY-MM-DDTHH:MM:SSZ` (no milliseconds). */
export const nowIsoStamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/** POST a completed run to the server. */
export const postRunResults = async (payload) => {
    const res = await fetch('results.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
    }
    return res.json();
};

/** Fetch run summaries filtered to a single run type, newest first. */
export const fetchRunSummaries = async (runType) => {
    const res = await fetch('results.php', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`List failed: ${res.status}`);
    }
    const all = await res.json();
    return all.filter((r) => r.runType === runType);
};

/** Fetch a single stored run's full detail. */
export const fetchRunDetail = async (file) => {
    const res = await fetch(`results.php?file=${encodeURIComponent(file)}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`Load failed: ${res.status}`);
    }
    return res.json();
};
