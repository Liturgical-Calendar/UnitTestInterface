import { test, expect, Page } from '@playwright/test';

/**
 * Rite awareness on the Calendars runner (issues #39, #48).
 *
 * #39 made the calendar dropdown rite-aware by hand; #48 replaced it with liturgy-components-js's
 * CalendarSelect linked to a RiteSelect. These specs therefore assert behaviour — what the rite
 * selection does to the calendar list and to the scaffold — rather than the markup of either
 * control, which is now the library's business and may change under us.
 */

const apiBase = `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}`;

/**
 * Waits for setupPage() to have rendered the live scaffold.
 *
 * Deliberately NOT `expect('#startTestRunnerBtn').toBeEnabled()`: the run button also requires a
 * live WebSocket connection, and playwright.config.ts starts no WebSocket server.
 */
const waitForLiveScaffold = async (page: Page) => {
    await page.waitForSelector('.sourcedata-tests > div', { timeout: 15000 });
};

const selectRite = async (page: Page, rite: string) => {
    await page.selectOption('#riteSelect', rite);
    await waitForLiveScaffold(page);
};

test('both controls mount, and the rite select defaults to Roman', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    await expect(page.locator('#riteSelect')).toHaveCount(1);
    await expect(page.locator('#APICalendarSelect')).toHaveCount(1);
    await expect(page.locator('#riteSelect')).toHaveValue('roman');
    // The rite-level calendar is the empty option, and it is selected by default.
    await expect(page.locator('#APICalendarSelect')).toHaveValue('');
});

test('the calendar select partitions by the selected rite', async ({ page, request }) => {
    const metadata = (await (await request.get(`${apiBase}/calendars`)).json()).litcal_metadata;
    const ambrosianDioceses = metadata.diocesan_calendars
        .filter((d: { rite?: string }) => d.rite === 'ambrosian')
        .map((d: { calendar_id: string }) => d.calendar_id);
    expect(ambrosianDioceses.length).toBeGreaterThan(0);

    await page.goto('/');
    await waitForLiveScaffold(page);

    const valuesUnder = async () =>
        page.locator('#APICalendarSelect option').evaluateAll(
            (opts) => opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== '')
        );

    const roman = await valuesUnder();
    for (const id of ambrosianDioceses) {
        expect(roman).not.toContain(id);
    }

    await selectRite(page, 'ambrosian');
    const ambrosian = await valuesUnder();
    for (const id of ambrosianDioceses) {
        expect(ambrosian).toContain(id);
    }
    // The Ambrosian rite has no national tier, so no two-letter nation codes survive.
    expect(ambrosian.filter((v) => /^[A-Z]{2}$/.test(v))).toEqual([]);
});

test('the empty option names the rite-level calendar under each rite', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    const emptyLabel = () =>
        page.locator('#APICalendarSelect option[value=""]').first().textContent();

    const romanLabel = await emptyLabel();
    expect(romanLabel).not.toBe('---');
    expect(romanLabel).not.toBe('');

    await selectRite(page, 'ambrosian');
    const ambrosianLabel = await emptyLabel();
    expect(ambrosianLabel).not.toBe('---');
    expect(ambrosianLabel).not.toBe(romanLabel);
});

test('the rite-level calendar is named by its rite, not by VA', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    // Card classes are built from the calendar id we send; General Roman is now `roman`.
    await expect(page.locator('.calendar-roman').first()).toHaveCount(1);
    await expect(page.locator('.calendar-va')).toHaveCount(0);

    await selectRite(page, 'ambrosian');
    await expect(page.locator('.calendar-ambrosian').first()).toHaveCount(1);
});

test('degrades cleanly when the calendar controls fail to mount', async ({ page }) => {
    // mountCalendarControls() calls ApiClient.init(), whose ApiBase.load() fetches the same
    // /calendars URL fetchMetadataAndTests() fetches afterwards (see index.js's bootstrap:
    // `await mountCalendarControls()` runs strictly before `fetchMetadataAndTests()`). Failing
    // only the first hit reproduces "the library's initial fetch fails" without also breaking
    // the page's own metadata fetch, so the rest of the page can be observed initialising normally.
    let calendarsRequestCount = 0;
    await page.route('**/calendars', async (route) => {
        calendarsRequestCount += 1;
        if (calendarsRequestCount === 1) {
            await route.abort('failed');
        } else {
            await route.continue();
        }
    });

    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/');

    // The failure is surfaced, not swallowed...
    await expect(page.locator('#controls-load-failed')).toBeVisible({ timeout: 10000 });
    // ...neither library control was mounted...
    await expect(page.locator('#riteSelect')).toHaveCount(0);
    await expect(page.locator('#APICalendarSelect')).toHaveCount(0);
    // ...but module evaluation did not abort: fetchMetadataAndTests() and connectWebSocket()
    // still ran, and the live scaffold still builds from the second (successful) /calendars fetch.
    await waitForLiveScaffold(page);

    expect(pageErrors).toEqual([]);
});
