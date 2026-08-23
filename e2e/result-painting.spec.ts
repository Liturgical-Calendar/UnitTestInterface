import { test, expect, Page } from '@playwright/test';

/**
 * `applyResultToDom()` robustness (issue #43).
 *
 * The WebSocket run loop is driven entirely from `conn.onmessage`: the next message is only sent
 * once the previous response has been handled. So anything that throws inside that handler stops
 * the run dead — spinner still turning, nothing in the UI to say why, no watchdog to recover.
 *
 * `classes` is a raw CSS selector built server-side by string concatenation, and the client feeds
 * it straight to `querySelectorAll()`. A missing, empty or malformed value therefore used to be a
 * live wedge, reachable today: the server's protocol-error frames (`type: "echobot"`) carry no
 * `classes` at all.
 *
 * These specs pin the painter's contract: it never throws, and it reports how many cards it
 * painted so the caller can notice when the counters are drifting away from the rendered cards.
 * They need no WebSocket server — the module is imported directly in the page context.
 */

/**
 * Call the real `applyResultToDom()` in the page context.
 *
 * The module specifier is held in a variable so TypeScript treats the `import()` as dynamic and
 * does not try to resolve a browser-served path against the e2e tsconfig.
 */
const paint = async (page: Page, responseData: unknown): Promise<number | string> =>
    page.evaluate(async (data) => {
        const specifier = '/assets/js/testResults.js';
        const { applyResultToDom } = (await import(specifier)) as { applyResultToDom: (d: unknown) => number };
        try {
            return applyResultToDom(data);
        } catch (err) {
            // Surfaced as a string so a throw is a readable assertion failure rather than a
            // Playwright evaluation error.
            return `THREW: ${err instanceof Error ? err.message : String(err)}`;
        }
    }, responseData);

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('a response with no classes property paints nothing instead of throwing', async ({ page }) => {
    // This is the shape of the server's `echobot` protocol-error frame.
    expect(await paint(page, { type: 'error', text: 'Invalid message from connection 7' })).toBe(0);
});

test('a response with an empty classes selector paints nothing instead of throwing', async ({ page }) => {
    // querySelectorAll('') is a SyntaxError, which used to escape onmessage.
    expect(await paint(page, { type: 'success', classes: '', text: 'ok' })).toBe(0);
});

test('a response with a malformed classes selector paints nothing instead of throwing', async ({ page }) => {
    expect(await paint(page, { type: 'error', classes: '.((not a selector', text: 'boom' })).toBe(0);
});

test('a null response paints nothing instead of throwing', async ({ page }) => {
    // Reachable through the run loop: a frame of the literal text `null` parses to `null`, and
    // the painter reads `.type` off its argument before anything else.
    expect(await paint(page, null)).toBe(0);
});

test('a non-object response paints nothing instead of throwing', async ({ page }) => {
    expect(await paint(page, 42)).toBe(0);
});

test('a well-formed selector matching no card paints nothing instead of throwing', async ({ page }) => {
    expect(await paint(page, { type: 'success', classes: '.no-such-card.step-exists', text: 'ok' })).toBe(0);
});

test('a matching selector paints the card and reports how many it painted', async ({ page }) => {
    // Build a card with the same shape the templates emit, then target it.
    // Static literal markup mirroring the card templates — no interpolation, no external input.
    await page.evaluate(() => {
        const el = document.createElement('div');
        el.className = 'card text-white bg-info rounded-0 spec-fixture-card step-exists';
        el.innerHTML = '<div class="card-body"><p class="card-text"><i class="fas fa-circle-question"></i> data exists</p></div>';
        document.body.appendChild(el);
    });

    expect(await paint(page, { type: 'success', classes: '.spec-fixture-card.step-exists', text: 'ok' })).toBe(1);

    const card = page.locator('.spec-fixture-card.step-exists');
    await expect(card).toHaveClass(/bg-success/);
    await expect(card).not.toHaveClass(/bg-info/);
});

test('a failing response attaches its message as an error tooltip', async ({ page }) => {
    // Static literal markup mirroring the card templates — no interpolation, no external input.
    await page.evaluate(() => {
        const el = document.createElement('div');
        el.className = 'card text-white bg-info rounded-0 spec-fixture-fail step-validates';
        el.innerHTML = '<div class="card-body"><p class="card-text"><i class="fas fa-circle-question"></i> schema valid</p></div>';
        document.body.appendChild(el);
    });

    expect(await paint(page, { type: 'error', classes: '.spec-fixture-fail.step-validates', text: 'Unable to detect schema' })).toBe(1);

    const card = page.locator('.spec-fixture-fail.step-validates');
    await expect(card).toHaveClass(/bg-danger/);
    await expect(card.locator('.error-tooltip')).toHaveAttribute('data-bs-title', 'Unable to detect schema');
});
