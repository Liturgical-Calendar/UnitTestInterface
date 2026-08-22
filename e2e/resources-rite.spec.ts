import { test, expect, Page } from '@playwright/test';
import { installReplyingWebSocketStub, installWebSocketStub } from './websocket-stub';

/**
 * Rite scoping on the Resources runner (issue #48).
 *
 * resources.php is the exhaustive page: it health-checks every API path and every calendar the
 * API supports. The rite selection narrows only what is rite-partitioned. National and
 * wider-region resources are Roman-only — RegionalDataParams::validateRiteCompatibility()
 * rejects them under a non-Roman rite — so they disappear under Ambrosian rather than being
 * requested and failing.
 */

const waitForScaffold = async (page: Page) => {
    await page.waitForSelector('.sourcedata-tests > div', { timeout: 20000 });
};

const selectRite = async (page: Page, rite: string) => {
    await page.selectOption('#riteSelect', rite);
    await waitForScaffold(page);
};

const cardMarkup = async (page: Page) =>
    (await page.locator('.sourcedata-tests, .resourcedata-tests').evaluateAll(
        (els) => els.map((e) => e.innerHTML)
    )).join(' ');

test('the rite select mounts and defaults to Roman', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);
    await expect(page.locator('#riteSelect')).toHaveCount(1);
    await expect(page.locator('#riteSelect')).toHaveValue('roman');
});

test('the rite-independent collection endpoints are checked under both rites', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const required = [
        'calendars-path',
        'decrees-path',
        'easter-path',
        'schemas-path',
        'missals-path',
    ];

    const roman = await cardMarkup(page);
    for (const slug of required) {
        expect(roman).toContain(slug);
    }

    await selectRite(page, 'ambrosian');
    const ambrosian = await cardMarkup(page);
    for (const slug of required) {
        expect(ambrosian).toContain(slug);
    }
});

test('the /events and /tests collection checks name the selected rite', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const collectionUrls = async () =>
        page.locator('[title]').evaluateAll(
            (els) => els.map((e) => e.getAttribute('title') ?? '')
                       .filter((t) => /\/(events|tests)\/(roman|ambrosian)$/.test(t))
        );

    expect(await collectionUrls()).toEqual(
        expect.arrayContaining([
            expect.stringMatching(/\/events\/roman$/),
            expect.stringMatching(/\/tests\/roman$/),
        ])
    );

    await selectRite(page, 'ambrosian');
    expect(await collectionUrls()).toEqual(
        expect.arrayContaining([
            expect.stringMatching(/\/events\/ambrosian$/),
            expect.stringMatching(/\/tests\/ambrosian$/),
        ])
    );
});

test('national, wider-region and per-missal checks are Roman-only', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    // Source cards are named by the inventory id the server advertised (#42) — `nation:roman:IT`,
    // `widerregion:roman:Europe`, `sanctorale:roman:EDITIO_TYPICA_2002` — slugified into the card
    // class, so a colon becomes a hyphen. They used to be named by a `validate` string this page
    // invented from the API's on-disk layout, which is what made every layout change a lockstep
    // edit here.
    //
    // The Ambrosian sanctorale is an inventory item of its own (`sanctorale:ambrosian:2024`), so
    // the rite prefix in the id is what separates it from the Roman missals rather than a negative
    // lookbehind on a hand-built name.
    const roman = await cardMarkup(page);
    expect(roman).toContain('nation-roman-');
    expect(roman).toContain('widerregion-roman-');
    expect(roman).toContain('sanctorale-roman-');

    await selectRite(page, 'ambrosian');
    const ambrosian = await cardMarkup(page);
    expect(ambrosian).not.toContain('nation-roman-');
    expect(ambrosian).not.toContain('widerregion-roman-');
    expect(ambrosian).not.toContain('sanctorale-roman-');
});

test('the universal corpus and test corpus follow the rite', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    // Every tier is now addressed by its inventory id, so the rite is a segment of the id itself
    // rather than a prefix baked into a name this page composed.
    const roman = await cardMarkup(page);
    expect(roman).toContain('temporale-roman');
    expect(roman).toContain('test-roman-');
    expect(roman).not.toContain('temporale-ambrosian');

    await selectRite(page, 'ambrosian');
    const ambrosian = await cardMarkup(page);
    expect(ambrosian).toContain('temporale-ambrosian');
    expect(ambrosian).toContain('sanctorale-ambrosian-');
    expect(ambrosian).not.toContain('temporale-roman');
});

test('every per-nation and per-diocese URL names its rite explicitly', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const urls = async () =>
        page.locator('[title]').evaluateAll(
            // Deliberately rite-AGNOSTIC: the rite segment is optional here so that both the
            // correct form (/data/roman/nation/IT) and the buggy unprefixed form
            // (/data/nation/IT) survive the filter and reach the assertion below. Scoped to
            // actual per-nation/per-diocese/per-wider-region paths, excluding the bare
            // collection endpoints (/events/{rite}, /tests/{rite}) already covered by the
            // collection-check test above.
            (els) => els.map((e) => e.getAttribute('title') ?? '')
                       .filter((t) => /\/(data|events)\/(?:(?:roman|ambrosian)\/)?(nation|diocese|widerregion)\//.test(t))
        );

    for (const rite of ['roman', 'ambrosian']) {
        if (rite === 'ambrosian') {
            await selectRite(page, rite);
        }
        const collectedUrls = await urls();
        // A guard against a silently-vacuous loop: if the filter above ever stops matching
        // anything (e.g. a label format change), this fails loudly instead of the loop below
        // running zero times and the test passing for the wrong reason.
        expect(collectedUrls.length).toBeGreaterThan(0);
        for (const url of collectedUrls) {
            // Anchored to the rite currently SELECTED, not merely to some rite: under Ambrosian
            // every Roman-only family (nations, wider regions, missals) is dropped and the
            // diocesan tier is Ambrosian, so a surviving /data/roman/... URL is stale state, not
            // a legitimate mix. An unprefixed /data/nation/IT resolves to Roman silently, which
            // would be a wrong-green under Ambrosian — the rite-agnostic filter above lets that
            // form reach this assertion rather than screening it out.
            expect(url).toMatch(new RegExp(`/(data|events)/${rite}/(nation|diocese|widerregion)/`));
        }
    }
});

test('degrades cleanly when the components-js library itself fails to load', async ({ page }) => {
    // Same failure point as the analogous test in rite-selection.spec.ts, applied to the other
    // runner page (final review of #48, finding 1): a static top-level `import … from
    // '@liturgical-calendar/components-js'` fails evaluation of the whole module — including
    // mountRiteSelect()'s own try/catch — before any of resources.js runs at all.
    // A regex, not a glob: the import map resolves to `assets/components-js/index.js` under
    // APP_ENV=development but to `.../components-js@2.7.0/+esm` otherwise, and
    // '**/components-js/**' matches only the first — so under a production-shaped config the
    // glob would abort nothing and this test would pass without ever exercising the failure.
    await page.route(/components-js(@[^/]+)?\//, (route) => route.abort('failed'));

    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/resources.php');

    await expect(page.locator('#controls-load-failed')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#riteSelect')).toHaveCount(0);
    // ...but the rest of the page's initialisation still ran: setEndpoints(), loadAsyncData() and
    // the WebSocket connect it triggers via setupPage() are not downstream of the failed import.
    await waitForScaffold(page);

    expect(pageErrors).toEqual([]);
});

test('a rapid double rite change does not duplicate checks', async ({ page }) => {
    // Finding 2 (final review of #48): loadAsyncData() had no in-flight guard, and its `.then`
    // pushed into the current module arrays regardless of whether a newer rite change had since
    // started another call. roman -> ambrosian -> roman in quick succession used to take
    // .sourcedata-tests from 64 cards to 124, with 60 duplicate `validate` slugs.
    await page.goto('/resources.php');
    await waitForScaffold(page);

    // Rapid and unawaited between selections: the point is to start the `ambrosian` and `roman`
    // loadAsyncData() calls before either one's fetches (or the page's own initial call) has
    // resolved, which is exactly the race this finding describes.
    await page.selectOption('#riteSelect', 'ambrosian');
    await page.selectOption('#riteSelect', 'roman');
    await waitForScaffold(page);
    // Give any stale, still-in-flight loadAsyncData() call time to (wrongly) resolve and push
    // before asserting — the race is exactly what this delay is here to let finish.
    await page.waitForTimeout(3000);

    const classNamesOf = (selector: string) =>
        page.locator(selector).evaluateAll((els) => els.map((e) => e.className));

    // Every check contributes exactly one `.file-exists` card, carrying its (slugified) `validate`
    // value as a class. A duplicated check would render two cards with the identical class list.
    const sourceFileExists = await classNamesOf('.sourcedata-tests .file-exists');
    const resourceFileExists = await classNamesOf('.resourcedata-tests .file-exists');
    expect(sourceFileExists.length).toBeGreaterThan(0);
    expect(resourceFileExists.length).toBeGreaterThan(0);
    expect(new Set(sourceFileExists).size).toBe(sourceFileExists.length);
    expect(new Set(resourceFileExists).size).toBe(resourceFileExists.length);

    // The counter-vs-card drift finding 2 warns about (and issue #43 exists to prevent): the
    // "Time" badge totals are computed straight from the rendered card counts, so they stay
    // exactly 3x the (now duplicate-free) file-exists counts.
    const totals = await page.evaluate(() => ({
        resource: document.getElementById('totalResourceDataTestsCount')?.textContent,
        source: document.getElementById('totalSourceDataTestsCount')?.textContent,
    }));
    expect(Number(totals.resource)).toBe(resourceFileExists.length * 3);
    expect(Number(totals.source)).toBe(sourceFileExists.length * 3);
});

test('a rite change is blocked for the duration of a run', async ({ page }) => {
    // Finding 3 (final review of #48): resetCheckListsForRite() wipes the rendered cards and
    // swaps both check lists mid-run without touching currentState, currentRunToken or the
    // response counters, and sends no cancelRun. In-flight frames keep arriving with a matching
    // runToken, paint nothing (their cards are gone), still increment the received counter, and
    // can trip the phase gate early — eventually storing a run of all-blue cards. Guarding this by
    // disabling the rite select for the run's duration is simpler than teaching every counter and
    // the run token to survive a mid-run swap, and it prevents the scenario outright.
    await installWebSocketStub(page);
    await page.goto('/resources.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await expect(page.locator('#riteSelect')).toBeEnabled();

    await startBtn.click();
    // The stub never replies, so the run parks after its first batch of requests — enough for the
    // rite select to have been disabled by the run's start.
    await expect(page.locator('#riteSelect')).toBeDisabled();

    // Stopping the run (same button, now in its stop role) must release the control again, so the
    // page is genuinely idle afterwards rather than stuck with an un-selectable rite.
    await startBtn.click();
    await expect(page.locator('#riteSelect')).toBeEnabled();
});

test('a rite change between runs clears the previous rite\'s counters and timers', async ({ page }) => {
    // #53: the rite change wiped and rebuilt the scaffold but left every Successful/Failed badge
    // and every timer holding the previous rite's values, so the page asserted results for a card
    // set that was entirely pending. Worse than merely stale: buildScaffolding() *does* refresh the
    // denominators from the new cards, so a Roman → Ambrosian switch could show more successes than
    // the new rite has checks at all.
    await installReplyingWebSocketStub(page);
    // Two runs to completion, and a completed run POSTs itself to results.php, which retains only
    // the 50 most recent per type. Persisting from here would evict the fixture that
    // results-replay-resources.spec.ts seeds with an older timestamp. Nothing below reads a stored
    // run, so swallow the write.
    await page.route('**/results.php', (route) => route.fulfill({ status: 200, body: '{}' }));
    await page.goto('/resources.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();
    await expect(page.locator('#startTestRunnerBtnLbl')).toHaveText('Tests Complete', { timeout: 30000 });

    const romanSuccesses = Number(await page.locator('#successfulCount').textContent());
    expect(romanSuccesses).toBeGreaterThan(0);
    await expect(page.locator('#total-time')).not.toHaveText('0');

    await selectRite(page, 'ambrosian');

    for (const id of [
        'successfulCount', 'failedCount',
        'successfulResourceDataTestsCount', 'failedResourceDataTestsCount',
        'successfulSourceDataTestsCount', 'failedSourceDataTestsCount',
        'total-time', 'totalResourceDataTestsTime', 'totalSourceDataTestsTime',
    ]) {
        await expect(page.locator(`#${id}`)).toHaveText('0');
    }

    // The DOM reading 0 is only half of it. resetTestUI() used to leave `successfulTests` and
    // `failedTests` untouched — the start-run handler zeroed those two separately — so wiring it up
    // as-is would have shown 0 while the variables still held the old totals, and the next run's
    // first increment would jump straight back to the stale number. Run again and check the total
    // is the Ambrosian run's own, not the Roman one's plus it.
    await expect(startBtn).toBeEnabled();
    await startBtn.click();
    await expect(page.locator('#startTestRunnerBtnLbl')).toHaveText('Tests Complete', { timeout: 30000 });

    const ambrosianSuccesses = Number(await page.locator('#successfulCount').textContent());
    expect(ambrosianSuccesses).toBeGreaterThan(0);
    expect(ambrosianSuccesses).toBeLessThan(romanSuccesses + ambrosianSuccesses);
    // The grand total is exactly the sum of the two phase badges it summarises — impossible if
    // either counter had resumed from a stale value.
    const phases = await page.evaluate(() => ({
        resource: Number(document.getElementById('successfulResourceDataTestsCount')?.textContent),
        source: Number(document.getElementById('successfulSourceDataTestsCount')?.textContent),
    }));
    expect(ambrosianSuccesses).toBe(phases.resource + phases.source);
    // And it cannot claim more checks than the rebuilt scaffold contains.
    const totalChecks = Number(await page.locator('#total-tests-count').textContent());
    expect(ambrosianSuccesses).toBeLessThanOrEqual(totalChecks);
});
