import { test, expect, Page } from '@playwright/test';
import { installReplyingWebSocketStub, installWebSocketStub } from './websocket-stub';

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

test('degrades cleanly when the components-js library itself fails to load', async ({ page }) => {
    // Distinct failure point from the test above, and the one final review found unprotected
    // (final review of #48, finding 1): before the fix, `@liturgical-calendar/components-js` was
    // imported with a static top-level `import … from`. A static specifier that fails to resolve
    // (a jsDelivr outage, a blocked host in production, a stale symlink in development) fails
    // evaluation of the WHOLE module before any of index.js's own code — including
    // mountCalendarControls()'s try/catch — ever runs. Aborting every request the library itself
    // makes reproduces exactly that: no toast, no scaffold, a spinner forever, and zero
    // `pageerror` (a thrown module-load rejection surfaces to the page as an unhandled promise
    // rejection, not a `pageerror` event, which is why this failure mode is easy to miss).
    // A regex, not a glob: the import map resolves to `assets/components-js/index.js` under
    // APP_ENV=development but to `.../components-js@2.7.0/+esm` otherwise, and
    // '**/components-js/**' matches only the first — so under a production-shaped config the
    // glob would abort nothing and this test would pass without ever exercising the failure.
    await page.route(/components-js(@[^/]+)?\//, (route) => route.abort('failed'));

    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/');

    // The failure is surfaced...
    await expect(page.locator('#controls-load-failed')).toBeVisible({ timeout: 10000 });
    // ...neither library control was mounted...
    await expect(page.locator('#riteSelect')).toHaveCount(0);
    await expect(page.locator('#APICalendarSelect')).toHaveCount(0);
    // ...but the rest of the page's initialisation still ran: fetchMetadataAndTests() and
    // connectWebSocket() are not downstream of the failed dynamic import.
    await waitForLiveScaffold(page);

    expect(pageErrors).toEqual([]);
});

test('the source-data scaffold follows the rite, and covers i18n folders', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    const cardClasses = async () =>
        page.locator('.sourcedata-tests .card').evaluateAll(
            (els) => els.map((e) => e.className)
        );

    // The four i18n-folder checks send category: 'sourceDataCheck' (not 'universalcalendar')
    // with hyphenated validate slugs — see wsProtocol.js's UNIVERSAL_CHECKS docblock for why:
    // Health::executeValidation() only recognises sourceFolder under sourceDataCheck, and sending
    // it under universalcalendar closes the connection instead of returning a result.
    const roman = (await cardClasses()).join(' ');
    expect(roman).toContain('propriumdetempore');
    expect(roman).toContain('proprium-de-tempore-i18n');
    expect(roman).toContain('memorialsfromdecrees');
    expect(roman).toContain('memorials-from-decrees-i18n');
    expect(roman).not.toContain('ambrosianpropriumdetempore');

    await selectRite(page, 'ambrosian');
    const ambrosian = (await cardClasses()).join(' ');
    expect(ambrosian).toContain('ambrosianpropriumdetempore');
    expect(ambrosian).toContain('ambrosian-proprium-de-tempore-i18n');
    expect(ambrosian).toContain('ambrosianpropriumdesanctis');
    expect(ambrosian).toContain('ambrosian-proprium-de-sanctis-i18n');
    // The Roman corpus is gone, not merely joined.
    expect(ambrosian).not.toContain('memorialsfromdecrees');
});

test('an i18n folder card names its folder rather than "undefined"', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);
    const titles = await page.locator('.sourcedata-tests p span[title]').evaluateAll(
        (els) => els.map((e) => e.getAttribute('title'))
    );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles).not.toContain('undefined');
    expect(titles.some((t) => (t ?? '').endsWith('/i18n'))).toBe(true);
});

test('accuracy tests are filtered by rite', async ({ page, request }) => {
    const tests = (await (await request.get(`${apiBase}/tests`)).json()).litcal_tests;
    const ambrosianOnly = tests.filter(
        (t: any) => (t.applies_to?.rite ?? t.appliesTo?.rite) === 'ambrosian'
    );
    test.skip(ambrosianOnly.length === 0, 'no Ambrosian tests published');

    await page.goto('/');
    await waitForLiveScaffold(page);

    const names = async () =>
        page.locator('#specificUnitTestsAccordion .accordion-item').evaluateAll(
            (els) => els.map((e) => e.id)
        );

    const underRoman = (await names()).join(' ');
    for (const t of ambrosianOnly) {
        expect(underRoman).not.toContain(t.name.toLowerCase());
    }

    await selectRite(page, 'ambrosian');
    const underAmbrosian = (await names()).join(' ');
    for (const t of ambrosianOnly) {
        expect(underAmbrosian).toContain(t.name.toLowerCase());
    }
});

/**
 * The calendar-data year range follows the rite (#52).
 *
 * The API's lower bound is rite-dependent — `CalendarParams::YEAR_LOWER_LIMIT` is 1970, but
 * `AMBROSIAN_YEAR_LOWER_LIMIT` is 1976 — and the runner used to build its year list once, at module
 * load, from a hardcoded 1970. Under the Ambrosian rite that requested six years the API answers
 * `400` for, and a `400` costs more than six red cards: `Health::validateCalendar()` emits only two
 * of the three frames the calendar-data phase counts on, so the phase never reached its target and
 * the run never advanced to the unit tests.
 *
 * These specs assert the scaffold's range rather than the wire traffic, because the scaffold is what
 * sizes the phase: the request count is derived from the same array the cards are.
 */

/** The years the calendar-data scaffold currently shows, ascending. */
const scaffoldYears = (page: Page): Promise<number[]> =>
    page.locator('.calendardata-tests p[class*="year-"]').evaluateAll(
        (els) => els
            .map((e) => Number(/\byear-(\d{4})\b/.exec(e.className)?.[1]))
            .filter((y) => !Number.isNaN(y))
            .sort((a, b) => a - b)
    );

test('the calendar-data year range starts at the rite\'s lower bound', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    const thisYear = new Date().getFullYear();

    const roman = await scaffoldYears(page);
    expect(roman[0]).toBe(1970);
    expect(roman[roman.length - 1]).toBe(thisYear + 25);

    await selectRite(page, 'ambrosian');

    const ambrosian = await scaffoldYears(page);
    expect(ambrosian[0]).toBe(1976);
    expect(ambrosian[ambrosian.length - 1]).toBe(thisYear + 25);
    // The six years the API rejects outright are the whole point.
    for (const year of [1970, 1971, 1972, 1973, 1974, 1975]) {
        expect(ambrosian).not.toContain(year);
    }
    expect(ambrosian.length).toBe(roman.length - 6);

    // And back, so the range is derived on every rebuild rather than narrowed once.
    await selectRite(page, 'roman');
    expect((await scaffoldYears(page))[0]).toBe(1970);
});

test('the accordion header names both bounds, and both follow the rite', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    const yearMin = page.locator('#calendarDataHeader .yearMin');
    const yearMax = page.locator('#calendarDataHeader .yearMax');

    // The lower bound used to be baked into the msgid as a literal 1970, so there was nothing to
    // update and the header contradicted the cards under it.
    await expect(yearMin).toHaveCount(1);
    await expect(yearMin).toHaveText('1970');
    await expect(yearMax).toHaveText(String(new Date().getFullYear() + 25));

    await selectRite(page, 'ambrosian');
    await expect(yearMin).toHaveText('1976');
    await expect(yearMax).toHaveText(String(new Date().getFullYear() + 25));
});

test('a rite change between runs clears the previous run\'s counters and timers', async ({ page }) => {
    // #53, the Calendars-runner half. `handleCalendarSelectChange()` rebuilt the whole scaffold and
    // never called `resetTestUI()`, so the badges kept asserting the previous run's totals over a
    // card set that was entirely pending. Easier to hit here than on resources.php: it triggers on
    // any calendar change, not only a rite change.
    await installReplyingWebSocketStub(page);
    // See the note in resources-rite.spec.ts: a completed run POSTs itself to results.php, whose
    // 50-per-type retention would evict the older-timestamped fixtures the replay specs seed.
    await page.route('**/results.php', (route) => route.fulfill({ status: 200, body: '{}' }));
    await page.goto('/');

    // No `waitForLiveScaffold()` here: the run button is the stronger gate — it needs the scaffold
    // *and* an open socket — and its 20s budget survives a cold single-worker `php -S`, which the
    // helper's 15s did not.
    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    // The stub answers the source-data phase only, so the run parks in the calendar-data phase with
    // the source-data badges populated — which is all this needs, and is reached without a server.
    await expect.poll(
        async () => Number(await page.locator('#successfulCount').textContent()),
        { timeout: 20000 }
    ).toBeGreaterThan(0);

    await startBtn.click(); // same button, now in its stop role
    await expect(startBtn).toBeEnabled();

    // Deliberately not `selectRite()`: its wait is for a *visible* scaffold, and a run expands the
    // calendar-data accordion, which collapses the source-data one under it. Wait for the rebuild
    // itself instead — the Ambrosian corpus is smaller than the Roman one — so what follows is
    // asserted against a scaffold that has provably been replaced.
    const romanCards = await page.locator('.sourcedata-tests').first().locator('> div').count();
    await page.selectOption('#riteSelect', 'ambrosian');
    await expect
        .poll(async () => page.locator('.sourcedata-tests').first().locator('> div').count(), { timeout: 20000 })
        .toBeLessThan(romanCards);

    for (const id of [
        'successfulCount', 'failedCount',
        'successfulSourceDataTestsCount', 'failedSourceDataTestsCount',
        'successfulCalendarDataTestsCount', 'failedCalendarDataTestsCount',
        'successfulUnitTestsCount', 'failedUnitTestsCount',
        'total-time', 'totalSourceDataTestsTime', 'totalCalendarDataTestsTime', 'totalUnitTestsTime',
    ]) {
        await expect(page.locator(`#${id}`)).toHaveText('0');
    }

    // Not just the DOM: `resetTestUI()` used to leave `successfulTests` / `failedTests` untouched,
    // so the next increment would jump straight back past the stale total. The second run's first
    // painted frame must read 1.
    await startBtn.click();
    await expect.poll(
        async () => Number(await page.locator('#successfulCount').textContent()),
        { timeout: 20000 }
    ).toBeGreaterThan(0);
    const afterFirstFrames = Number(await page.locator('#successfulCount').textContent());
    expect(afterFirstFrames).toBeLessThanOrEqual(
        Number(await page.locator('#total-tests-count').textContent())
    );
    await startBtn.click();
});

test('the scaffold-rebuilding controls are blocked for the duration of a run', async ({ page }) => {
    // resources.php has had this guard since #48 (setRiteSelectDisabledForRun); this page had no
    // equivalent, which is why #53 calls the Calendars runner the easier of the two to hit. It
    // matters more now that setupPage() also renarrows `Years` and zeroes the counters: mid-run,
    // buildCalendarsPayload() would persist `counts` from the zeroed counters beside results from
    // resultCollector, which no reset clears, and a `scaffold.years` naming the new rite's range
    // beside descriptors addressed at the old one's years.
    await installWebSocketStub(page);
    await page.goto('/');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    for (const sel of ['#riteSelect', '#APICalendarSelect', '#APIResponseSelect']) {
        await expect(page.locator(sel)).toBeEnabled();
    }

    // The stub never replies, so the run parks after its first request, still owning the page.
    await startBtn.click();
    for (const sel of ['#riteSelect', '#APICalendarSelect', '#APIResponseSelect']) {
        await expect(page.locator(sel)).toBeDisabled();
    }

    // Stopping releases them again, so the page is genuinely idle rather than stuck.
    await startBtn.click();
    for (const sel of ['#riteSelect', '#APICalendarSelect', '#APIResponseSelect']) {
        await expect(page.locator(sel)).toBeEnabled();
    }
});
