import { test, expect, Page } from '@playwright/test';
import { deliverRawFrame, dropStubRoutes, installReplyingWebSocketStub, sentFrames } from './websocket-stub';

// Abort the stub's in-flight `/validations` handler before the context is torn down,
// so a slow upstream fetch cannot be reported as a failure of this file's last test.
// See dropStubRoutes() in websocket-stub.ts.
test.afterEach(dropStubRoutes);

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

    // The calendar-data phase has not started yet: its accordion section is still collapsed
    // (`index.php` renders it `class="accordion-collapse collapse"`, no `show`).
    await expect(page.locator('#calendarDataTests')).not.toHaveClass(/show/);

    await giveUpNow(page);

    // Exactly one failure per grey card — not "at least", which would also pass the over-count
    // `summariseAbandoned()` exists to prevent (every stub frame here is `status: 'pass'`, so
    // nothing else touches `#failedCount` in this window).
    expect(Number(await page.locator('#failedCount').textContent())).toBe(greyBefore);

    // Giving up must also advance the run, not just count the failures: `runTests()`'s
    // `ExecutingValidations` case calls `safeCollapseShow('#calendarDataTests')` when the phase's
    // outstanding set is cleared, so the run having moved on to the calendar-data phase is
    // observable as that accordion section opening.
    await expect(page.locator('#calendarDataTests')).toHaveClass(/show/, { timeout: 5000 });
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
    const cards = page.locator('#specificUnitTests .step-test-validates');
    await expect(cards).not.toHaveCount(0);
    await expect(page.locator('#specificUnitTests .bg-info')).toHaveCount(0);
});

test('per-test accordion counters resolve the test name from target.id, not the retired test property', async ({ page }) => {
    // The server never sends a `test` property on any frame (absent from the published
    // `WebSocketFrame.json` schema); a test-run frame's `target.id` is the real source
    // (`Health::sendTestResult()` builds `target` via `frameTarget($test, [...])`). The stub mirrors
    // that: it derives `target.id` from the outgoing message's own `test` field rather than echoing
    // one back, and sends no `test` property at all — so a page that still read `responseData.test`
    // would leave every per-test counter at "0" here.
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const mismatches = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('#specificUnitTestsAccordion .accordion-item'));
        return items
            .map((item) => ({
                id: item.id,
                total: Number(document.getElementById(`total${item.id}TestsCount`)?.textContent ?? 'NaN'),
                successful: Number(document.getElementById(`successful${item.id}TestsCount`)?.textContent ?? 'NaN'),
            }))
            .filter((entry) => entry.total !== entry.successful);
    });

    // The happy-path stub answers every check with `status: 'pass'`, so every rendered test's
    // successful count should equal its total — a mismatch means the per-test counter for that
    // accordion item never updated, i.e. `#specificUnitTest-undefined` was being queried instead.
    expect(mismatches).toEqual([]);

    const totalTestsRendered = await page.locator('#specificUnitTestsAccordion .accordion-item').count();
    expect(totalTestsRendered).toBeGreaterThan(0);
});

test('a rejected request paints its own cards and ends, instead of stalling the phase (#70)', async ({ page }) => {
    // Every `validateCalendar` message is refused outright, the way production refused all 82 of a
    // General Roman run's ("calendar.id is required for kind rite."). Each rejection names the
    // request it refused and arrives instantly, so the phase has everything it needs to end at once.
    await installReplyingWebSocketStub(page, { rejectActions: ['validateCalendar'] });
    await page.goto('/index.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    // Well inside the sixty-second silence watchdog: before #70 the phase could only end by waiting
    // it out, so a run that finishes this quickly is the fix itself, not merely its side effect.
    await expect(page.locator('#startTestRunnerBtnLbl')).toHaveText('Tests Complete', { timeout: 25000 });

    // Not one card left grey: a rejection is an answer for every step the request registered, and
    // the reason is carried onto each of them.
    await expect(page.locator('.calendardata-tests .bg-info')).toHaveCount(0);
    const rejected = await page.locator('.calendardata-tests .bg-danger').count();
    expect(rejected).toBeGreaterThan(0);

    // One failure per red card — not the single unattributable failure a rejection used to book for
    // a request whose scaffold rendered three of them.
    expect(Number(await page.locator('#failedCalendarDataTestsCount').textContent())).toBe(rejected);
});

test('an unparseable frame costs one failure and does not abandon the phase', async ({ page }) => {
    // The parse-failure branch is the only thing between a garbled frame and a run that wedges with
    // the spinner still turning and nothing in the UI to say why (#43). Nothing reached it before
    // this test, on either page.
    //
    // What it must NOT do is give up on the phase. A frame that cannot be parsed cannot be
    // attributed either — it names no requestId, because there was nothing to read one out of — so
    // the honest cost is one unattributable failure. Abandoning the phase instead would mark every
    // request still in flight as failed on the strength of one bad frame, including the ones the
    // server is answering perfectly well; the silence watchdog is what exists for a phase that has
    // genuinely stopped being answered.
    const pageErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));

    // `omitComplete` holds the first phase open, which is what makes the assertions below
    // deterministic: the phase cannot end on its own, so if it ends, the malformed frame ended it.
    await installReplyingWebSocketStub(page, { omitComplete: true });
    await page.goto('/index.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    // Every step of the source phase answered, no terminal frame: the phase is fully painted and
    // still outstanding.
    await expect.poll(async () => page.locator('.sourcedata-tests .card.bg-info').count(), { timeout: 20000 })
        .toBe(0);

    const failedBefore = Number(await page.locator('#failedCount').textContent());
    const sentBefore = (await sentFrames(page)).length;

    await deliverRawFrame(page, 'this is not JSON {');

    // Exactly one failure, not one per outstanding step.
    await expect.poll(async () => Number(await page.locator('#failedCount').textContent()), { timeout: 10000 })
        .toBe(failedBefore + 1);

    // The phase did not advance: advancing would begin the calendar-data phase and send its
    // messages, so the sent count is the observable that would move if the run had given up.
    await page.waitForTimeout(1000);
    expect((await sentFrames(page)).length).toBe(sentBefore);
    await expect(page.locator('#startTestRunnerBtnLbl')).not.toHaveText('Tests Complete');

    // And the handler did not throw on the way: an exception escaping it means runTests() is never
    // called again, which is the wedge this branch exists to prevent.
    expect(pageErrors).toEqual([]);
});
