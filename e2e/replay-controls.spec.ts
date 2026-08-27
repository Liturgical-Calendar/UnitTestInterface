import { test, expect, Page } from '@playwright/test';

/**
 * The rite, calendar and response-format controls describe what the dashboard is showing.
 *
 * Three conditions decide whether they accept input — `canRunTests()`, whether a replay is on
 * screen, and whether a run is in flight — and `applyControlAvailability()` on each page derives
 * the answer from all three at once. What this file pins down is the two conditions a test can
 * drive without starting a run:
 *
 *  - an anonymous visitor may look but not aim, because these are inputs to a run they cannot start;
 *  - a replay sets them to the run being shown and holds them inert, so the page never claims to be
 *    on one rite while painting another's cards.
 *
 * It also pins the bug that made the second half necessary to get right: `resourceTemplate()` used
 * to resolve each card's URL from the **live** `resourcePaths` map, which holds the current rite's
 * discovery and not the stored run's, so replaying anything the live map had no key for threw
 * mid-scaffold. See the docblock on `resourceTemplate()` in assets/js/resources.js.
 */

const SCAFFOLD_CONTROLS = ['#riteSelect', '#APICalendarSelect', '#APIResponseSelect'] as const;

/** A stored Calendars run: Roman, national calendar IT, XML — none of them the page's defaults. */
const CALENDARS_RUN = {
    schemaVersion: 1,
    timestamp: '2026-01-01T00:00:00Z',
    runType: 'calendars',
    calendar: 'IT',
    calendarCategory: 'nationalcalendar',
    rite: 'roman',
    responseType: 'XML',
    duration: 1000,
    counts: { successful: 0, failed: 0 },
    timings: { sourceData: 400, calendarData: 400, unitTests: 200 },
    scaffold: {
        sourceDataChecks: [
            { id: 'nation:roman:IT', label: 'Italy', steps: ['exists', 'parses', 'validates'] },
        ],
        years: [2024],
        unitTests: [],
    },
    sourceDataResults: [],
    calendarDataResults: [],
    unitTestResults: [],
};

/**
 * A stored Resources run whose second check names a key the live `resourcePaths` map never holds
 * under any rite. That is the whole point of it: the URL on the rendered card can then only have
 * come from the stored descriptor's `sourceFile`, which is what the fix made it read.
 */
const UNLIVE_KEY = 'data-path-nation-ZZ-zz';
const UNLIVE_URL = 'http://localhost:8000/data/roman/nation/ZZ?locale=zz';
const RESOURCES_RUN = {
    schemaVersion: 1,
    timestamp: '2026-01-02T00:00:00Z',
    runType: 'resources',
    calendar: null,
    rite: 'roman',
    responseType: 'YML',
    duration: 1000,
    counts: { successful: 0, failed: 0 },
    timings: { apiPath: 600, sourceData: 400 },
    scaffold: {
        resourceDataChecks: [
            { validate: 'calendars-path', sourceFile: 'http://localhost:8000/calendars', category: 'resourceDataCheck' },
            { validate: UNLIVE_KEY, sourceFile: UNLIVE_URL, category: 'resourceDataCheck' },
        ],
        sourceDataChecks: [],
    },
    apiPathResults: [],
    sourceDataResults: [],
};

/**
 * Serve one stored run from `results.php`, for both the listing and the `?file=` detail.
 *
 * Routed by predicate rather than by the `**​/results.php` glob the other specs use: that glob does
 * not match the detail fetch, which carries a `?file=` query.
 */
const stubStoredRun = async (page: Page, run: Record<string, unknown>): Promise<string> => {
    const file = `${run.runType}-${(run.timestamp as string).replace(/:/g, '-')}.json`;
    await page.route(
        (url) => url.pathname.endsWith('/results.php'),
        (route) => {
            const isDetail = new URL(route.request().url()).searchParams.has('file');
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(
                    isDetail
                        ? run
                        : [{
                            file,
                            timestamp: run.timestamp,
                            runType: run.runType,
                            calendar: run.calendar,
                            rite: run.rite,
                            responseType: run.responseType,
                            counts: run.counts,
                            duration: run.duration,
                        }]
                ),
            });
        }
    );
    return file;
};

test.describe('logged out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('the scaffold controls are inert, and Past Runs is not', async ({ page }) => {
        await page.goto('/');
        // The loader coming down is what says the page finished; permission is not a readiness
        // condition, so this must happen for an anonymous visitor too (#63).
        await expect(page.locator('.page-loader')).toBeHidden({ timeout: 60_000 });

        for (const selector of SCAFFOLD_CONTROLS) {
            await expect(page.locator(selector), `${selector} should be inert while logged out`).toBeDisabled();
        }
        // Reading stored runs is public, and replaying one is how a visitor who cannot run tests
        // sees any other calendar's scaffold at all — so this one stays live.
        await expect(page.locator('#pastRunsSelect')).toBeEnabled();
    });

    test('the explanation is the same one the Run Tests button gives', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.page-loader')).toBeHidden({ timeout: 60_000 });
        const expected = await page.locator('#startTestRunnerBtn').getAttribute('data-no-permission-title');
        expect(expected).toBeTruthy();
        // A disabled control with no explanation reads as a bug rather than as a policy, and the
        // policy is one policy — so it is not restated in a second translated string.
        await expect(page.locator('#APIResponseSelect')).toHaveAttribute('title', expected!);
    });
});

test.describe('logged in', () => {
    test('a stored format the server no longer offers keeps a valid one selected', async ({ page }) => {
        // CodeRabbit on #94. A stored run carries the format that *was* selected when it ran, and a
        // native select silently becomes `''` when handed a value it has no option for. That blank
        // is not inert here: `resyncLiveStateFromDom()` reads this select back when the replay is
        // closed, so `currentResponseType` would become `''` and every subsequent run would put an
        // empty response format on the wire. The suite already pins the same hazard arriving by
        // another route — see "before hello, and without a socket, JSON is still selectable".
        //
        // Driven on resources.php, whose action advertises only JSON and YML, with a stored run
        // claiming ICS: a format that page's select never holds an option for.
        // Every console message, not only those typed 'warning': Playwright has spelled that type
        // both 'warning' and 'warn' across versions, and the text is what this test is about.
        const messages: string[] = [];
        page.on('console', (m) => messages.push(m.text()));

        const file = await stubStoredRun(page, { ...RESOURCES_RUN, responseType: 'ICS' });
        await page.goto('/resources.php');
        await expect(page.locator('.page-loader')).toBeHidden({ timeout: 60_000 });
        const before = await page.locator('#APIResponseSelect').inputValue();

        await page.selectOption('#pastRunsSelect', file);

        // Kept, not blanked — and said out loud rather than silently tolerated.
        await expect(page.locator('#APIResponseSelect')).toHaveValue(before);
        await expect
            .poll(() => messages.filter((t) => t.includes('response format') && t.includes('ICS')).length)
            .toBeGreaterThan(0);

        // Returning to live is where a blank would have been read into `currentResponseType` and
        // gone on the wire. Asserted as the intended end state rather than as the discriminator:
        // the warning above is what actually distinguishes the guard running from a bare assignment,
        // since a `hello` arriving in between can repopulate the select and hide a transient blank.
        await page.selectOption('#pastRunsSelect', '');
        await expect(page.locator('#APIResponseSelect')).toHaveValue(before);
        expect(await page.evaluate(() => (document.querySelector('#APIResponseSelect') as HTMLSelectElement).value))
            .not.toBe('');
    });

    test('a Calendars replay sets the controls to the run and holds them inert', async ({ page }) => {
        const file = await stubStoredRun(page, CALENDARS_RUN);
        await page.goto('/');
        await expect(page.locator('.page-loader')).toBeHidden({ timeout: 60_000 });
        // The premise: a permitted user has them, and on something other than the stored run.
        for (const selector of SCAFFOLD_CONTROLS) {
            await expect(page.locator(selector)).toBeEnabled();
        }
        await expect(page.locator('#APICalendarSelect')).not.toHaveValue('IT');

        await page.selectOption('#pastRunsSelect', file);

        await expect(page.locator('#riteSelect')).toHaveValue('roman');
        // The one that needs the library to have rebuilt the option set for the run's rite first:
        // a value with no option silently becomes ''.
        await expect(page.locator('#APICalendarSelect')).toHaveValue('IT');
        await expect(page.locator('#APIResponseSelect')).toHaveValue('XML');
        for (const selector of SCAFFOLD_CONTROLS) {
            await expect(page.locator(selector), `${selector} should be inert during a replay`).toBeDisabled();
        }
        await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();

        // Returning to live hands them back — and leaves them on the replayed run's values, which
        // is the agreed consequence of having them describe what is on screen. Nothing is stashed.
        await page.selectOption('#pastRunsSelect', '');
        for (const selector of SCAFFOLD_CONTROLS) {
            await expect(page.locator(selector), `${selector} should be live again`).toBeEnabled();
        }
        await expect(page.locator('#APICalendarSelect')).toHaveValue('IT');
    });

    test('a Resources replay renders each card from the stored run, not from the live path map', async ({ page }) => {
        const errors: string[] = [];
        page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); } });
        page.on('pageerror', (e) => errors.push(e.message));

        const file = await stubStoredRun(page, RESOURCES_RUN);
        await page.goto('/resources.php');
        await expect(page.locator('.page-loader')).toBeHidden({ timeout: 60_000 });

        await page.selectOption('#pastRunsSelect', file);

        // The regression. `data-path-nation-ZZ-zz` is in no live `resourcePaths` map, so before the
        // fix the lookup yielded `undefined`, `escapeHtmlAttr()` threw on it, and `buildScaffolding()`
        // died mid-forEach — after emptying the container — leaving a half-built scaffold, stale
        // counts and the #results-load-failed toast.
        const container = page.locator('#resourceDataTests .resourcedata-tests');
        await expect(container.locator('span.text-break')).toHaveCount(2);
        await expect(container.locator('span.text-break').nth(1)).toHaveText(UNLIVE_URL);
        expect(errors, 'replaying a stored run should raise nothing').toEqual([]);

        // Same two rules as the Calendars page.
        await expect(page.locator('#riteSelect')).toHaveValue('roman');
        await expect(page.locator('#APIResponseSelect')).toHaveValue('YML');
        await expect(page.locator('#riteSelect')).toBeDisabled();
        await expect(page.locator('#APIResponseSelect')).toBeDisabled();
    });
});
