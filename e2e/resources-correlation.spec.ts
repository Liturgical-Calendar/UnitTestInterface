import { test, expect, Page } from '@playwright/test';
import { installReplyingWebSocketStub, sentFrames } from './websocket-stub';

/**
 * The Resources runner attributes frames by `requestId` and ends phases on the terminal frame (#42).
 *
 * Two things this page used to do are being removed here, and each has its own spec below.
 *
 * **It executed CSS selectors the server sent it.** `classes` — `".proprium-de-sanctis-2002.json-valid"`
 * — went straight to `querySelectorAll()`, which made this repository's markup part of the API's
 * contract, and made a selector that matched nothing fail *silently* while the counters advanced
 * anyway. The stub used here therefore sends a selector that deliberately matches nothing: a run that
 * paints its cards regardless can only be attributing frames some other way.
 *
 * **It sized each phase as `checks * 3`.** Three was the undocumented step count, written down in four
 * places across the two runners, and the comparison had to be `>=` because counting frames cannot tell
 * a duplicate from a legitimate one — which meant an extra frame satisfied the threshold early and the
 * *following* phase inherited the overshoot. Completion is now the server's terminal `complete` frame,
 * one per request.
 *
 * The stub plays the server's side, so none of this needs a WebSocket server. The API on :8000 is still
 * required: its responses gate the start button.
 */

/** Start a run and wait for the runner to report it finished. */
const runToCompletion = async (page: Page): Promise<void> => {
    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();
    await expect(page.locator('#startTestRunnerBtnLbl')).toHaveText('Tests Complete', { timeout: 30000 });
};

/**
 * Every check request the page sent, parsed — **both** phases.
 *
 * The two use different actions since the source half moved to opaque ids: routes still go out as
 * `executeValidation`, source data as `validateSource`. Filtering on the first alone would have left
 * every assertion below covering only the resource phase, which is the half that did *not* change.
 */
const validationRequests = async (page: Page): Promise<Array<Record<string, unknown>>> =>
    (await sentFrames(page))
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
        .filter((message) => message.action === 'executeValidation' || message.action === 'validateSource');

test('every request carries a distinct requestId', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');
    await runToCompletion(page);

    const requests = await validationRequests(page);
    expect(requests.length).toBeGreaterThan(0);
    // Both phases are represented, so the assertions below are not silently about one of them.
    expect(requests.some((message) => message.action === 'executeValidation')).toBe(true);
    expect(requests.some((message) => message.action === 'validateSource')).toBe(true);

    const ids = requests.map((message) => message.requestId);
    expect(ids.every((id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id))).toBe(true);
    // Distinct, because attribution is by this value: two requests sharing one would paint each
    // other's cards, which is precisely what sharing a per-*run* token used to allow.
    expect(new Set(ids).size).toBe(ids.length);
});

test('cards are painted even though the server addresses no card', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');
    await runToCompletion(page);

    // Not one card left unpainted, though every frame's `classes` selector matched nothing.
    await expect(page.locator('.resourcedata-tests .card.bg-info')).toHaveCount(0);
    await expect(page.locator('.sourcedata-tests .card.bg-info')).toHaveCount(0);
    expect(await page.locator('.resourcedata-tests .card.bg-success').count()).toBeGreaterThan(0);
    expect(await page.locator('.sourcedata-tests .card.bg-success').count()).toBeGreaterThan(0);
});

test('the totals match the rendered cards, so the terminal frame is not counted', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');
    await runToCompletion(page);

    // The terminal frame reports that a request finished, not that a step passed. Counting it would
    // inflate the totals past the number of cards on the page — the drift #42 describes, reached from
    // the other direction, and the reason the terminal frame had to be gated on `requestId` server-side.
    const rendered = await page.locator('.resourcedata-tests .card, .sourcedata-tests .card').count();
    const successful = await page.locator('#successfulCount').textContent();

    expect(Number(successful)).toBe(rendered);
});

test('the protocol version is declared when the server advertises it, and not otherwise', async ({ page }) => {
    await installReplyingWebSocketStub(page, { protocol: 1 });
    await page.goto('/resources.php');
    await runToCompletion(page);

    const requests = await validationRequests(page);
    expect(requests.every((message) => message.protocol === 1)).toBe(true);
});

test('no protocol is declared to a server that sent no hello', async ({ page }) => {
    // A server predating LiturgicalCalendarAPI#806 section F. Its message schema does not declare
    // `protocol`, and its unknown-property gate is armed by the `requestId` this page now sends — so
    // declaring a version it never advertised would get every message of the run refused.
    await installReplyingWebSocketStub(page, { protocol: null });
    await page.goto('/resources.php');
    await runToCompletion(page);

    const requests = await validationRequests(page);
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.some((message) => 'protocol' in message)).toBe(false);
});

test('a phase whose terminal frames never arrive does not advance on its own', async ({ page }) => {
    // The server has a known hole of exactly this shape: a throw inside a promise's fulfil handler
    // skips the terminal frame (LiturgicalCalendarAPI#823). Removing the frame count trades an
    // overshooting phase for a hanging one, which is why the runner also watches for silence.
    //
    // This spec asserts the first half only — that nothing advances the phase merely because its
    // step frames arrived. The watchdog that eventually rescues it is asserted separately below,
    // where the clock can be moved; here it must NOT fire, and the assertion is deliberately made
    // well inside its window.
    await installReplyingWebSocketStub(page, { omitComplete: true });
    await page.goto('/resources.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    // The step frames still arrive and still paint, so the run is visibly progressing…
    await expect.poll(async () => page.locator('.resourcedata-tests .card.bg-success').count(), { timeout: 20000 })
        .toBeGreaterThan(0);

    // …and the phase does not advance, because nothing said any request had finished.
    await expect(page.locator('#startTestRunnerBtnLbl')).not.toHaveText('Tests Complete');
});

test('the silence watchdog fires only after a real silence, and a frame resets it', async ({ page }) => {
    // The other half of the pair above, tested where it lives.
    //
    // Driving it through the page would mean either waiting a real minute — a spec nobody keeps — or
    // faking the clock, which breaks the runner's own `performance.measure()` bookkeeping. So the
    // watchdog was extracted into the shared protocol module, where it can be given a 60ms window
    // instead of a 60s one and asserted directly. `index.js` inherits the same trade the moment it
    // stops counting frames, which is the other reason it belongs there rather than in one runner.
    await page.goto('/');

    const result = await page.evaluate(async () => {
        const specifier = '/assets/js/wsProtocol.js';
        const { createSilenceWatchdog } = (await import(specifier)) as {
            createSilenceWatchdog: (ms: number, onSilence: () => void) => { restart: () => void; clear: () => void; isRunning: () => boolean };
        };
        const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

        // 250ms window against 25ms between frames — a 10x margin, so a CI scheduling hiccup
        // between two frames cannot look like silence. A 3x margin flakes; this is not the place to
        // discover that, since a spurious firing here would read as the watchdog being wrong.
        const WINDOW = 250;
        const BETWEEN_FRAMES = 25;
        const SILENCE = WINDOW * 2;

        let firedOnSilence = 0;
        const silent = createSilenceWatchdog(WINDOW, () => { firedOnSilence += 1; });
        silent.restart();
        await sleep(SILENCE);

        // A frame arriving inside the window must postpone it, not be ignored.
        let firedOnChatter = 0;
        const chatty = createSilenceWatchdog(WINDOW, () => { firedOnChatter += 1; });
        chatty.restart();
        for (let i = 0; i < 6; i += 1) {
            await sleep(BETWEEN_FRAMES);
            chatty.restart();
        }
        const runningWhileChattering = chatty.isRunning();
        await sleep(SILENCE);

        // And a cleared watchdog stays quiet.
        let firedAfterClear = 0;
        const cleared = createSilenceWatchdog(WINDOW, () => { firedAfterClear += 1; });
        cleared.restart();
        cleared.clear();
        await sleep(SILENCE);

        return { firedOnSilence, firedOnChatter, runningWhileChattering, firedAfterClear, chattyStillRunning: chatty.isRunning() };
    });

    expect(result.firedOnSilence).toBe(1);
    // Frames 25ms apart inside a 250ms window, then a real silence: it fires once, for the silence
    // at the end, and never during the chatter.
    expect(result.firedOnChatter).toBe(1);
    expect(result.runningWhileChattering).toBe(true);
    expect(result.chattyStillRunning).toBe(false);
    expect(result.firedAfterClear).toBe(0);
});

test('a run whose source phase has nothing to check still finishes', async ({ page }) => {
    // A phase ends on the terminal frames of the requests it started, so a phase that starts none
    // would wait for frames that are never coming — and the silence watchdog cannot rescue it,
    // because it only runs while something is outstanding. The run would sit on "Tests Running..."
    // for ever with no diagnostic.
    //
    // Reachable for real: the source list is whatever /validations advertised for the selected rite.
    await page.route('**/validations', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ litcal_validations: [] }) }));
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');

    await runToCompletion(page);

    // The resource phase still ran; only the source phase was empty.
    const requests = await validationRequests(page);
    expect(requests.some((message) => message.action === 'executeValidation')).toBe(true);
    expect(requests.some((message) => message.action === 'validateSource')).toBe(false);
    await expect(page.locator('.sourcedata-tests .card')).toHaveCount(0);
});

/** Trigger what the silence watchdog triggers, without waiting out its sixty-second clock. */
const giveUpNow = (page: Page): Promise<void> =>
    page.evaluate(async () => {
        const specifier = '/assets/js/resources.js';
        const { giveUpOnOutstandingRequests } = (await import(specifier)) as { giveUpOnOutstandingRequests: () => void };
        giveUpOnOutstandingRequests();
    });

const counterValue = async (page: Page, id: string): Promise<number> =>
    Number(await page.locator(`#${id}`).textContent());

test('giving up counts one failure per card left grey', async ({ page }) => {
    // A request that died partway. Its remaining cards stay unpainted, and each one must be counted
    // or the totals badge reads lower than the number of cards on the page — the drift #42 exists to
    // remove, reached from the results side.
    await installReplyingWebSocketStub(page, { stopAfterStep: 'exists' });
    await page.goto('/resources.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    // Wait until the one step the stub does answer has painted everywhere it is going to.
    await expect.poll(async () => page.locator('.resourcedata-tests .card.bg-success').count(), { timeout: 20000 })
        .toBeGreaterThan(0);
    await page.waitForTimeout(200);

    const greyBefore = await page.locator('.resourcedata-tests .card.bg-info').count();
    const failedBefore = await counterValue(page, 'failedCount');
    expect(greyBefore).toBeGreaterThan(0);

    await giveUpNow(page);

    expect(await counterValue(page, 'failedCount')).toBe(failedBefore + greyBefore);
});

test('giving up counts nothing when only the ending is missing', async ({ page }) => {
    // LiturgicalCalendarAPI#823 exactly: every check ran and reported, and the terminal frame was
    // skipped by a throw inside the fulfil handler. Nothing is grey and every counter already agrees
    // with the cards, so counting a failure here would inflate the totals past them.
    await installReplyingWebSocketStub(page, { omitComplete: true });
    await page.goto('/resources.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    await expect.poll(async () => page.locator('.resourcedata-tests .card.bg-info').count(), { timeout: 20000 })
        .toBe(0);

    const failedBefore = await counterValue(page, 'failedCount');
    expect(await page.locator('.resourcedata-tests .card.bg-info').count()).toBe(0);

    await giveUpNow(page);

    // Failures only. `successfulCount` deliberately goes untested here: giving up *advances* the
    // run, so the next phase starts and legitimately paints more successes — asserting it unchanged
    // would be asserting that the rescue does not work.
    expect(await counterValue(page, 'failedCount')).toBe(failedBefore);
});

test('giving up moves the run on rather than throwing', async ({ page }) => {
    // The callback runs at module scope and reaches state that used to live inside the connection
    // closure — where a ReferenceError meant the one safety net between a missing terminal frame and
    // a hung phase was itself broken, silently, because no test reached the timeout.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await installReplyingWebSocketStub(page, { omitComplete: true });
    await page.goto('/resources.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();
    await expect.poll(async () => page.locator('.resourcedata-tests .card.bg-info').count(), { timeout: 20000 })
        .toBe(0);

    // Resource phase, then source phase: each stalls the same way, so two give-ups end the run.
    await giveUpNow(page);
    await expect.poll(async () => page.locator('.sourcedata-tests .card.bg-info').count(), { timeout: 20000 })
        .toBe(0);
    await giveUpNow(page);

    await expect(page.locator('#startTestRunnerBtnLbl')).toHaveText('Tests Complete', { timeout: 20000 });
    expect(pageErrors).toEqual([]);
});
