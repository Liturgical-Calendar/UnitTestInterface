import { test, expect, Page } from '@playwright/test';
import { installReplyingWebSocketStub, sentFrames } from './websocket-stub';

/**
 * The Calendars runner attributes frames by `requestId` and ends phases on the terminal frame (#42).
 *
 * The stub addresses every frame at `.stub-addresses-nothing.<step>`, which matches no card on the
 * page. A run that paints its cards regardless can only be attributing frames some other way.
 */
const runToCompletion = async (page: Page): Promise<void> => {
    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();
    await expect(page.locator('#startTestRunnerBtnLbl')).toHaveText('Tests Complete', { timeout: 60000 });
};

test('source-data checks go out as validateSource with an opaque id', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const frames = (await sentFrames(page)).map((raw) => JSON.parse(raw) as Record<string, unknown>);
    const sourceChecks = frames.filter((m) => m.action === 'validateSource');
    expect(sourceChecks.length).toBeGreaterThan(0);

    for (const message of sourceChecks) {
        expect(message.target).toMatchObject({ id: expect.any(String) });
        expect(typeof message.requestId).toBe('string');
        // The retired vocabulary must be gone: the server rejects these outright.
        expect(message).not.toHaveProperty('category');
        expect(message).not.toHaveProperty('validate');
        expect(message).not.toHaveProperty('sourceFile');
        expect(message).not.toHaveProperty('sourceFolder');
    }
    // No repo-relative path may cross the wire any more.
    expect(JSON.stringify(sourceChecks)).not.toContain('jsondata/');
});

test('every request carries a distinct requestId', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const ids = (await sentFrames(page))
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
        .filter((m) => typeof m.requestId === 'string')
        .map((m) => m.requestId as string);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
});

test('the source-data cards are painted despite a selector that matches nothing', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const cards = page.locator('#sourceDataTests .sourcedata-tests .card');
    await expect(cards).not.toHaveCount(0);
    // Every card left blue would mean the page still needs the server's selector to find it.
    await expect(page.locator('#sourceDataTests .sourcedata-tests .bg-info')).toHaveCount(0);
});

/** Trigger what the silence watchdog triggers, without waiting out its sixty-second clock. */
const giveUpNow = (page: Page): Promise<void> =>
    page.evaluate(async () => {
        const specifier = '/assets/js/index.js';
        const { giveUpOnOutstandingRequests } = (await import(specifier)) as { giveUpOnOutstandingRequests: () => void };
        giveUpOnOutstandingRequests();
    });

test('giving up counts one failure per card left grey', async ({ page }) => {
    // A request that died partway. Its remaining cards stay unpainted, and each one must be counted
    // or the totals badge reads lower than the number of cards on the page.
    await installReplyingWebSocketStub(page, { stopAfterStep: 'exists' });
    await page.goto('/index.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    await expect.poll(async () => page.locator('#sourceDataTests .sourcedata-tests .card.bg-success').count(), { timeout: 20000 })
        .toBeGreaterThan(0);
    await page.waitForTimeout(200);

    const greyBefore = await page.locator('#sourceDataTests .sourcedata-tests .card.bg-info').count();
    expect(greyBefore).toBeGreaterThan(0);

    await giveUpNow(page);

    expect(Number(await page.locator('#failedCount').textContent())).toBeGreaterThanOrEqual(greyBefore);
});

test('calendar validation goes out with a typed calendar and no retired properties', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const calendarChecks = (await sentFrames(page))
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
        .filter((m) => m.action === 'validateCalendar');

    expect(calendarChecks.length).toBeGreaterThan(0);
    for (const message of calendarChecks) {
        expect(message.calendar).toMatchObject({ kind: expect.any(String), rite: expect.any(String) });
        expect(message.responseFormat).toBe('JSON');
        expect(typeof message.requestId).toBe('string');
        // Retired on the typed shape; the server rejects the message outright if present.
        expect(message).not.toHaveProperty('category');
        expect(message).not.toHaveProperty('rite');
        expect(message).not.toHaveProperty('responsetype');
    }
    // The stub addresses every frame at `.stub-addresses-nothing.<step>`, matching no card on the
    // page — a green calendar card can only be attributed by requestId, not by the server's selector.
    await expect(page.locator('#calendarDataTests .calendardata-tests .bg-info')).toHaveCount(0);
});

test('unit tests go out as runTest with a typed calendar', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const frames = (await sentFrames(page)).map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(frames.some((m) => m.action === 'executeUnitTest')).toBe(false);

    const testRuns = frames.filter((m) => m.action === 'runTest');
    expect(testRuns.length).toBeGreaterThan(0);
    for (const message of testRuns) {
        expect(typeof message.test).toBe('string');
        expect(message.calendar).toMatchObject({ kind: expect.any(String), rite: expect.any(String) });
        expect(typeof message.year).toBe('number');
        expect(typeof message.requestId).toBe('string');
        expect(message).not.toHaveProperty('category');
        expect(message).not.toHaveProperty('rite');
    }

    // Proof cards were actually rendered and painted, not just that the wire shape is right: the
    // stub addresses every frame at `.stub-addresses-nothing.<step>`, matching no card on the page,
    // so a card painted green/red can only be attributed by requestId, not by the server's selector.
    // Left blue (`.bg-info`, the pending state `appendAccordionItem()` renders every card in) would
    // mean this phase still needs a selector the server composed — the same drift #42 removes for
    // the other two phases, checked here from the unit-test side.
    const cards = page.locator('#specificUnitTests .test-valid');
    await expect(cards).not.toHaveCount(0);
    await expect(page.locator('#specificUnitTests .bg-info')).toHaveCount(0);
});
