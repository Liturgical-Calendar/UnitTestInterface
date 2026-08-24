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

/**
 * The /validations inventory ids the source-data scaffold currently checks, one per check.
 *
 * sourceDataCheckTemplate() puts `item.id` in each check's caption `title`, so this reads the ids
 * themselves rather than the card classes they are slugified into — exact, and directly comparable
 * against what the API advertises.
 */
const checkIds = async (page: Page): Promise<string[]> =>
    page.locator('.sourcedata-tests p span[title]').evaluateAll(
        (els) => els.map((e) => e.getAttribute('title') ?? '')
    );

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
    // ...but module evaluation did not abort: fetchMetadataAndTests() and wsClient.connect()
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
    // wsClient.connect() are not downstream of the failed dynamic import.
    await waitForLiveScaffold(page);

    expect(pageErrors).toEqual([]);
});

test('the source-data scaffold follows the rite, and covers i18n folders', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    // Exact class TOKENS, not a joined-string substring. Card classes are idToCardClass(item.id)
    // — a colon-separated /validations inventory id with every character outside [A-Za-z0-9_-]
    // replaced by '-', not a slug derived from a repo-relative path (#42):
    // temporale:roman -> temporale-roman, temporale:roman:i18n -> temporale-roman-i18n. Under
    // this vocabulary every non-i18n class is a PREFIX of its own i18n partner
    // ('temporale-roman' ⊂ 'temporale-roman-i18n'), so a substring check on the joined string
    // would still pass with the non-i18n card missing entirely — silently un-pinning exactly the
    // coverage a missing card would lose. Splitting each class list into tokens keeps
    // 'temporale-roman' and 'temporale-roman-i18n' as two distinct, independently-assertable
    // tokens.
    const classTokens = async () => {
        const classes = await page.locator('.sourcedata-tests .card').evaluateAll(
            (els) => els.map((e) => e.className)
        );
        const tokens = new Set<string>();
        classes.forEach((c: string) => c.split(/\s+/).forEach((t: string) => tokens.add(t)));
        return tokens;
    };

    const roman = await classTokens();
    expect(roman.has('temporale-roman')).toBe(true);
    expect(roman.has('temporale-roman-i18n')).toBe(true);
    expect(roman.has('decrees-roman')).toBe(true);
    expect(roman.has('decrees-roman-i18n')).toBe(true);
    expect(roman.has('temporale-ambrosian')).toBe(false);

    // #61: the calendar-specific tier carries its i18n folders too, not only the universal corpus.
    // The rite-level Roman scaffold's calendar-specific tier is its editio typica missals, so the
    // invariant to pin is the pairing: every missal card on the page has a translations card next
    // to it. (Stated as a pairing rather than as a literal missal id so a new editio typica, or a
    // missal that gains or loses translations upstream, does not have to be edited in here.)
    const missalCards = [...roman].filter((t) => /^sanctorale-roman-[a-z0-9_]+$/.test(t));
    expect(missalCards.length).toBeGreaterThan(0);
    for (const missal of missalCards) {
        expect(roman.has(`${missal}-i18n`)).toBe(true);
    }

    await selectRite(page, 'ambrosian');
    const ambrosian = await classTokens();
    expect(ambrosian.has('temporale-ambrosian')).toBe(true);
    expect(ambrosian.has('temporale-ambrosian-i18n')).toBe(true);
    expect(ambrosian.has('sanctorale-ambrosian')).toBe(true);
    expect(ambrosian.has('sanctorale-ambrosian-i18n')).toBe(true);
    // The Roman corpus is gone, not merely joined: an Ambrosian scaffold's universal corpus is
    // its own temporale/sanctorale, never the Roman decrees.
    expect(ambrosian.has('decrees-roman')).toBe(false);
});

test('a non-Roman diocese whose nation has no national calendar still builds a scaffold', async ({ page, request }) => {
    // A diocese implies a national calendar under the Roman rite but not under a rite that has no
    // national layer: `CalendarHandler::loadDiocesanCalendarData()` leaves `NationalCalendar` null
    // for an Ambrosian diocese, and `validateRiteCompatibility()` throws if it is set.
    // `lugano_ch` (Ambrosian, nation CH) is where that shows in the data today: the API ships no
    // `nations/CH` calendar, so `/calendars` carries the diocese but advertises no
    // `nation:roman:CH` inventory item. buildNonVASourceDataChecks() used to treat that as fatal
    // for *any* non-rite calendar, so selecting Lugano logged "No national calendar metadata found
    // for CH", bailed out of setupPage() before it rebuilt anything, and left the page under its
    // loader showing the previously selected calendar's cards with the Start button refused.
    //
    // Derived from the live metadata rather than hardcoding lugano_ch, so this keeps testing the
    // invariant ("a diocese of a rite with no national layer is checkable") rather than one row of
    // the API's data. The Roman half of the same rule is pinned by the test below.
    const metadata = (await (await request.get(`${apiBase}/calendars`)).json()).litcal_metadata;
    const nations: string[] = metadata.national_calendars.map((n: { calendar_id: string }) => n.calendar_id);
    const orphan = metadata.diocesan_calendars.find(
        (d: { nation: string, rite: string }) => 'roman' !== d.rite && false === nations.includes(d.nation)
    );
    test.skip(undefined === orphan, 'every non-Roman diocese\'s nation has a national calendar');

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    await page.goto('/');
    await waitForLiveScaffold(page);
    await selectRite(page, orphan.rite);
    await page.selectOption('#APICalendarSelect', orphan.calendar_id);
    await waitForLiveScaffold(page);

    // The scaffold is the selected diocese's, not the previous calendar's...
    const tokens = new Set<string>(
        (await page.locator('.sourcedata-tests .card').evaluateAll((els) => els.map((e) => e.className)))
            .flatMap((c: string) => c.split(/\s+/))
    );
    expect(tokens.has(`diocese-${orphan.rite}-${orphan.calendar_id}`.toLowerCase())).toBe(true);
    // ...and the absent national tier is absent rather than composed into cards that cannot exist.
    expect([...tokens].some((t) => t.startsWith(`nation-roman-${orphan.nation}`.toLowerCase()))).toBe(false);

    // The page finished setting itself up: the loader came down and the run is offerable.
    await expect(page.locator('.page-loader')).toBeHidden();
    expect(consoleErrors.filter((t) => t.includes('No national calendar metadata found'))).toEqual([]);
});

test('a non-Roman diocesan scaffold is its rite\'s corpus plus the diocese, and nothing Roman', async ({ page, request }) => {
    // An Ambrosian diocese inherits no Roman layer at all — not the national tier, and not the Roman
    // universal corpus either. `CalendarHandler::calculateAmbrosianCalendar()` reads exactly three
    // things: the Ambrosian temporale, the Ambrosian sanctorale, and the diocese's own file. It
    // never calls `calculateUniversalCalendar()` or `applyNationalCalendar()`, and
    // `validateRiteCompatibility()` throws if `NationalCalendar` is set for the rite at all.
    //
    // The scaffold used to be built with `rite: 'roman'` regardless, so `milano_it` checked 26 items
    // of which 19 named source data its calendar never reads: `nation:roman:IT`,
    // `widerregion:roman:Europe`, the IT missals, `temporale:roman`, `decrees:roman` and the whole
    // ten-section `lectionary:roman:*` corpus.
    //
    // Stated as an equality against the rite-level scaffold rather than as a list of expected ids:
    // the claim is precisely "the same corpus, plus this diocese", and a list would have to be
    // re-edited every time the API adds a section to either rite.
    const metadata = (await (await request.get(`${apiBase}/calendars`)).json()).litcal_metadata;
    const nations: string[] = metadata.national_calendars.map((n: { calendar_id: string }) => n.calendar_id);
    // Deliberately one whose nation *does* have a national calendar (an Italian Ambrosian diocese,
    // not lugano_ch): that is the case the old code scaffolded a full Roman tier for, so it is the
    // one that pins the change rather than merely re-testing the CH bail-out above.
    const diocese = metadata.diocesan_calendars.find(
        (d: { nation: string, rite: string }) => 'roman' !== d.rite && nations.includes(d.nation)
    );
    test.skip(undefined === diocese, 'no non-Roman diocese in a nation that has a national calendar');

    await page.goto('/');
    await waitForLiveScaffold(page);
    await selectRite(page, diocese.rite);
    // Selecting a rite selects that rite's empty (rite-level) option, so this is the rite-level scaffold.
    const riteLevel = new Set(await checkIds(page));
    expect(riteLevel.size).toBeGreaterThan(1);

    await page.selectOption('#APICalendarSelect', diocese.calendar_id);
    // Polled rather than waited on a selector that is already present: the scaffold is rebuilt in
    // place, so `waitForLiveScaffold()` would return on the *previous* one.
    await expect.poll(async () => (await checkIds(page)).some((id) => id.startsWith(`diocese:${diocese.rite}:`)))
        .toBe(true);
    const diocesan = await checkIds(page);

    // Nothing Roman anywhere in it.
    expect(diocesan.filter((id) => id.includes(':roman'))).toEqual([]);
    // What the diocese adds is the diocese, and only the diocese.
    const added = diocesan.filter((id) => false === riteLevel.has(id));
    expect(added.length).toBeGreaterThan(0);
    expect(added.filter((id) => false === id.startsWith(`diocese:${diocese.rite}:${diocese.calendar_id}`))).toEqual([]);
    // ...and it takes nothing away: the rite's own corpus is still checked beneath it.
    expect([...riteLevel].filter((id) => false === diocesan.includes(id))).toEqual([]);
});

test('a Roman diocese whose national calendar is missing is refused, not scaffolded', async ({ page, request }) => {
    // The other half of the same rule, and the reason the guard is keyed on the rite rather than
    // dropped: under the Roman rite a diocese *does* imply a national calendar, in the API and not
    // merely by convention. `CalendarHandler::loadDiocesanCalendarData()` sets `NationalCalendar` to
    // the diocese's nation unconditionally on the Roman path, and
    // `CalendarParams::validateNationalCalendar()` rejects a nation absent from
    // `national_calendars_keys` — so a Roman diocese whose nation had no national calendar could not
    // have its calendar generated at all. Metadata saying otherwise is wrong, and scaffolding a
    // diocese the API cannot serve would be a run that reports on nothing.
    //
    // components-js's CalendarSelect enforces the same rule and throws outright ("this is a metadata
    // defect, not a recoverable runtime condition"), which is what makes the state reachable here at
    // all: the library and this page fetch `/calendars` separately, so the guard defends the case
    // where the two fetches disagree — the library mounts from a consistent payload, and `MetaData`
    // is then missing the nation. Failing only the fetches after the library's reproduces exactly
    // that, and is the only way to reach the guard without the library refusing first.
    const metadata = (await (await request.get(`${apiBase}/calendars`)).json()).litcal_metadata;
    const nations: string[] = metadata.national_calendars.map((n: { calendar_id: string }) => n.calendar_id);
    const victim = metadata.diocesan_calendars.find(
        (d: { nation: string, rite: string }) => 'roman' === d.rite && nations.includes(d.nation)
    );
    test.skip(undefined === victim, 'no Roman diocese to withhold a national calendar from');

    // mountCalendarControls() awaits ApiClient.init() strictly before fetchMetadataAndTests() runs,
    // so request 1 is the library's and the rest are the page's own.
    let calendarsRequestCount = 0;
    await page.route('**/calendars', async (route) => {
        calendarsRequestCount += 1;
        if (calendarsRequestCount === 1) {
            await route.continue();
            return;
        }
        const response = await route.fetch();
        const body = await response.json();
        body.litcal_metadata.national_calendars = body.litcal_metadata.national_calendars.filter(
            (n: { calendar_id: string }) => n.calendar_id !== victim.nation
        );
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    await page.goto('/');
    await waitForLiveScaffold(page);
    await page.selectOption('#APICalendarSelect', victim.calendar_id);

    // Said out loud, naming both the nation and the diocese that needed it...
    await expect.poll(
        () => consoleErrors.filter((t) => t.includes('No national calendar metadata found')),
        { timeout: 10000 }
    ).not.toEqual([]);
    const reported = consoleErrors.filter((t) => t.includes('No national calendar metadata found'));
    expect(reported.some((t) => t.includes(victim.nation) && t.includes(victim.calendar_id))).toBe(true);

    // ...and refused rather than half-built: setupPage() bails above the scaffold rebuild, so no
    // card for the diocese is ever drawn and the loader handleCalendarSelectChange() raised is never
    // lowered — the page visibly does not offer a run over a diocese it cannot resolve a national
    // tier for. (Deliberately not asserted through `#startTestRunnerBtn`: playwright.config.ts
    // starts no WebSocket server, so that button is disabled here whatever setupPage() did, and the
    // assertion would pass without exercising the guard at all.)
    const tokens = new Set<string>(
        (await page.locator('.sourcedata-tests .card').evaluateAll((els) => els.map((e) => e.className)))
            .flatMap((c: string) => c.split(/\s+/))
    );
    expect(tokens.has(`diocese-roman-${victim.calendar_id}`.toLowerCase())).toBe(false);
    await expect(page.locator('.page-loader')).toBeVisible();
});

test('an i18n folder card names its folder rather than "undefined"', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);
    const titles = await page.locator('.sourcedata-tests p span[title]').evaluateAll(
        (els) => els.map((e) => e.getAttribute('title'))
    );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles).not.toContain('undefined');
    // The tooltip is the inventory id itself (sourceDataCheckTemplate's `tooltip`), not a
    // repo-relative folder path any more — Ruling 5 restored the universal-corpus i18n ids, so
    // there are genuinely i18n cards to name, and each one's id ends ':i18n' (not the old '/i18n'
    // path suffix).
    expect(titles.some((t) => (t ?? '').endsWith(':i18n'))).toBe(true);
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

    // Expectations come from the library's own `RiteProperties`, not from literals repeated here.
    // The bound is sourced from that table at runtime, so restating 1970/1976 in the spec would make
    // this a third copy of the API's constants and would fail the day the library legitimately moves
    // one. What is under test is the wiring: that the scaffold's first year *is* the library's
    // `minYear` for the selected rite.
    const minYears = await page.evaluate(async () => {
        const mod = await import('@liturgical-calendar/components-js');
        return { roman: mod.RiteProperties.roman.minYear, ambrosian: mod.RiteProperties.ambrosian.minYear };
    });
    // Guard the guard: a table that returned undefined would make every assertion below vacuous.
    expect(Number.isInteger(minYears.roman)).toBe(true);
    expect(minYears.ambrosian).toBeGreaterThan(minYears.roman);

    const roman = await scaffoldYears(page);
    expect(roman[0]).toBe(minYears.roman);
    expect(roman[roman.length - 1]).toBe(thisYear + 25);

    await selectRite(page, 'ambrosian');

    const ambrosian = await scaffoldYears(page);
    expect(ambrosian[0]).toBe(minYears.ambrosian);
    expect(ambrosian[ambrosian.length - 1]).toBe(thisYear + 25);
    // The years between the two floors are the ones the API rejects outright, and the whole point.
    for (let year = minYears.roman; year < minYears.ambrosian; year++) {
        expect(ambrosian).not.toContain(year);
    }
    expect(ambrosian.length).toBe(roman.length - (minYears.ambrosian - minYears.roman));

    // And back, so the range is derived on every rebuild rather than narrowed once.
    await selectRite(page, 'roman');
    expect((await scaffoldYears(page))[0]).toBe(minYears.roman);
});

test('the accordion header names both bounds, and both follow the rite', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    const yearMin = page.locator('#calendarDataHeader .yearMin');
    const yearMax = page.locator('#calendarDataHeader .yearMax');

    // The lower bound used to be baked into the msgid as a literal 1970, so there was nothing to
    // update and the header contradicted the cards under it.
    const minYears = await page.evaluate(async () => {
        const mod = await import('@liturgical-calendar/components-js');
        return { roman: mod.RiteProperties.roman.minYear, ambrosian: mod.RiteProperties.ambrosian.minYear };
    });

    await expect(yearMin).toHaveCount(1);
    await expect(yearMin).toHaveText(String(minYears.roman));
    await expect(yearMax).toHaveText(String(new Date().getFullYear() + 25));

    await selectRite(page, 'ambrosian');
    await expect(yearMin).toHaveText(String(minYears.ambrosian));
    await expect(yearMax).toHaveText(String(new Date().getFullYear() + 25));
});

test('a rite change between runs clears the previous run\'s counters and timers', async ({ page }) => {
    // #53, the Calendars-runner half. `handleCalendarSelectChange()` rebuilt the whole scaffold and
    // never called `resetTestUI()`, so the badges kept asserting the previous run's totals over a
    // card set that was entirely pending. Easier to hit here than on resources.php: it triggers on
    // any calendar change, not only a rite change.
    // `answerOnly` restricts the stub to the source-data phase on purpose: this test's second click
    // needs the run still parked mid-run, in the stop-button role asserted below. Once the stub also
    // learned `validateCalendar` and `runTest`, an unrestricted stub would drive the run all the way to
    // completion before that click lands, flipping the button out of its stop role and popping a
    // completion toast that overlaps it — see the comment further down for what that state actually
    // needs to look like.
    await installReplyingWebSocketStub(page, { answerOnly: ['executeValidation', 'validateSource'] });
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

test('the dashboard-repainting controls are blocked for the duration of a run', async ({ page }) => {
    // resources.php has had this guard since #48 (setScaffoldControlsDisabledForRun); this page had no
    // equivalent, which is why #53 calls the Calendars runner the easier of the two to hit. It
    // matters more now that setupPage() also renarrows `Years` and zeroes the counters: mid-run,
    // buildCalendarsPayload() would persist `counts` from the zeroed counters beside results from
    // resultCollector, which no reset clears, and a `scaffold.years` naming the new rite's range
    // beside descriptors addressed at the old one's years.
    //
    // #pastRunsSelect was omitted when this guard was written, because the reason for the other
    // three was phrased as "these rebuild the scaffold" and Past Runs does not — it repaints the
    // dashboard from a stored run while the live one keeps painting underneath it, and writes
    // #startTestRunnerBtn.disabled directly (selecting "— Live —" sets it false, which during a run
    // is the Stop button).
    //
    // Enumerated rather than asserted one at a time so a control added to the header is a visible
    // omission here rather than a silent one.
    const CONTROLS = ['#riteSelect', '#APICalendarSelect', '#APIResponseSelect', '#pastRunsSelect'];

    await installWebSocketStub(page);
    await page.goto('/');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    for (const sel of CONTROLS) {
        await expect(page.locator(sel)).toBeEnabled();
    }

    // The stub never replies, so the run parks after its first request, still owning the page.
    await startBtn.click();
    for (const sel of CONTROLS) {
        await expect(page.locator(sel)).toBeDisabled();
    }

    // Stopping releases them again, so the page is genuinely idle rather than stuck.
    await startBtn.click();
    for (const sel of CONTROLS) {
        await expect(page.locator(sel)).toBeEnabled();
    }
});
