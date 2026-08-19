import { test, expect, Page } from '@playwright/test';
import { installWebSocketStub, sentFrames } from './websocket-stub';

/**
 * Stopping a run tells the server (UnitTestInterface#43, LiturgicalCalendarAPI#806 section H).
 *
 * Stopping used to be purely local: state was reset, incoming frames were dropped, and the server kept
 * fetching calendars for a run nobody was watching. Both runners must now send `cancelRun` naming the
 * run being abandoned.
 *
 * No WebSocket server is needed: the helper specs import the module directly, and the wiring specs stub
 * `window.WebSocket`. Only the API on :8000 is required, whose responses gate the start button.
 */

/**
 * Call the real `sendCancelRun()` in the page context against a recording fake connection.
 *
 * The module specifier is held in a variable so TypeScript treats the `import()` as dynamic and does not
 * try to resolve a browser-served path against the e2e tsconfig.
 */
const callHelper = async (page: Page, readyState: number, runToken: string | null) =>
    page.evaluate(async ({ readyState, runToken }) => {
        const specifier = '/assets/js/wsProtocol.js';
        const { sendCancelRun } = (await import(specifier)) as {
            sendCancelRun: (conn: unknown, token: string | null) => boolean;
        };
        const sent: string[] = [];
        const conn = { readyState, send: (data: string) => sent.push(data) };
        return { returned: sendCancelRun(conn, runToken), sent };
    }, { readyState, runToken });

test.describe('the sendCancelRun helper', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('sends the cancel frame when the socket is open and the run has a token', async ({ page }) => {
        const { returned, sent } = await callHelper(page, 1, 'run-a');

        expect(returned).toBe(true);
        expect(sent).toHaveLength(1);
        expect(JSON.parse(sent[0])).toEqual({ action: 'cancelRun', runToken: 'run-a' });
    });

    test('sends nothing when the socket is not open', async ({ page }) => {
        // Stop is also reachable while the socket is reconnecting. A closed socket needs no cancel:
        // the server drops the run's queued work when the connection closes.
        const { returned, sent } = await callHelper(page, 3, 'run-a');

        expect(returned).toBe(false);
        expect(sent).toEqual([]);
    });

    test('sends nothing when there is no run to cancel', async ({ page }) => {
        // A cancel carrying no token is a protocol error the server rejects, which the UI would then
        // paint as a failure. Better never to send one.
        const { returned, sent } = await callHelper(page, 1, null);

        expect(returned).toBe(false);
        expect(sent).toEqual([]);
    });
});

/** Start a run, then stop it, returning every frame the page sent. */
const startThenStop = async (page: Page, path: string): Promise<string[]> => {
    await installWebSocketStub(page);
    await page.goto(path);

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });

    await startBtn.click();
    // The stub never replies, so the run parks after its first request. Wait for that request rather
    // than for a fixed delay, so the cancel is provably the *second* thing sent.
    await expect.poll(async () => (await sentFrames(page)).length, { timeout: 10000 }).toBeGreaterThan(0);

    await startBtn.click(); // same button, now in its stop role
    return sentFrames(page);
};

test('the Calendars runner tells the server when a run is stopped', async ({ page }) => {
    const frames = await startThenStop(page, '/');

    const cancel = JSON.parse(frames[frames.length - 1]);
    expect(cancel.action).toBe('cancelRun');

    // The cancel must name the run it is abandoning, not some fresh value.
    expect(cancel.runToken).toBe(JSON.parse(frames[0]).runToken);
});

test('the Resources runner tells the server when a run is stopped', async ({ page }) => {
    const frames = await startThenStop(page, '/resources.php');

    const cancel = JSON.parse(frames[frames.length - 1]);
    expect(cancel.action).toBe('cancelRun');

    expect(cancel.runToken).toBe(JSON.parse(frames[0]).runToken);
});
