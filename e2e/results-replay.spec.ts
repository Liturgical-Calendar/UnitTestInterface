import { test, expect } from '@playwright/test';
import { seedStoredRun, removeSeededRuns } from './storedRuns';

// Seeded run files are stored in the real results/ directory, which real users
// browse via the "Past Runs" dropdown — clean them up so e2e fixtures don't
// pollute the UI (they look like broken partial runs when replayed).
test.afterAll(removeSeededRuns);

test('replays a stored calendars run onto the dashboard', async ({ page, request }) => {
    // Seed a small run with mixed statuses across all three phases.
    // scaffold.years = [1970] is intentionally different from the live page's global Years array
    // (~80 entries, 1970..currentYear+25). Under the old code, calDataTestTemplate used
    // Years.length (≈80) instead of cfg.years.length (1) to compute the year index, so the
    // rendered class was .year-<maxYear> while buildScaffolding queried .year-1970 → null →
    // TypeError crash. The calendar-data assertion below directly exercises that cross-year path.
    // No `timestamp` here: seedStoredRun() writes the fixture straight into results/, so the
    // 50-per-type retention cap in results.php never sees it (issue #65).
    const run = {
        schemaVersion: 1,
        runType: 'calendars',
        calendar: 'VA',
        calendarCategory: 'nationalcalendar',
        responseType: 'JSON',
        duration: 1000,
        counts: { successful: 3, failed: 1 },
        timings: { sourceData: 500, calendarData: 400, unitTests: 100 },
        scaffold: {
            sourceDataChecks: [
                { validate: 'proprium-de-sanctis-1970', sourceFile: 'EDITIO_TYPICA_1970', category: 'sourceDataCheck' },
                { validate: 'proprium-de-sanctis-2002', sourceFile: 'EDITIO_TYPICA_2002', category: 'sourceDataCheck' },
            ],
            years: [1970],
            unitTests: [
                { name: 'TestSeedReplay', description: 'seeded unit test', assertions: [{ year: 1970, assertion: 'seeded assertion', expected_value: null }] },
            ],
        },
        sourceDataResults: [
            { id: '.proprium-de-sanctis-1970.step-exists', selector: '.proprium-de-sanctis-1970.step-exists', status: 'success', message: null, test: null },
            { id: '.proprium-de-sanctis-2002.step-parses', selector: '.proprium-de-sanctis-2002.step-parses', status: 'error', message: 'seeded failure', test: null },
        ],
        calendarDataResults: [{ id: '.step-exists.calendar-va.year-1970', selector: '.step-exists.calendar-va.year-1970', status: 'success', message: null, test: null }],
        unitTestResults: [{ id: '.testseedreplay.year-1970.step-test-validates', selector: '.TestSeedReplay.year-1970.step-test-validates', status: 'success', message: null, test: 'TestSeedReplay' }],
    };
    const file = await seedStoredRun(request, run);

    await page.goto('/');
    await page.waitForSelector('#pastRunsSelect');
    // Wait for the live scaffold to finish building (setupPage runs after async
    // metadata fetches); selecting a past run earlier would let setupPage's
    // rebuild clobber the replayed counters afterwards.
    await page.waitForSelector('.sourcedata-tests > div');
    await page.selectOption('#pastRunsSelect', file);

    // Global counters come from the stored counts
    await expect(page.locator('#successfulCount')).toHaveText('3');
    await expect(page.locator('#failedCount')).toHaveText('1');
    // Per-phase Successful/Failed badges must be derived from the stored descriptors
    await expect(page.locator('#successfulSourceDataTestsCount')).toHaveText('1');
    await expect(page.locator('#failedSourceDataTestsCount')).toHaveText('1');
    await expect(page.locator('#successfulCalendarDataTestsCount')).toHaveText('1');
    await expect(page.locator('#failedCalendarDataTestsCount')).toHaveText('0');
    await expect(page.locator('#successfulUnitTestsCount')).toHaveText('1');
    await expect(page.locator('#failedUnitTestsCount')).toHaveText('0');
    // Per-unit-test badge (accordion header) for the seeded test
    await expect(page.locator('#successfultestseedreplayTestsCount')).toHaveText('1');
    // Totals: 2 source checks × 3 cards + 1 year × 3 cards + 1 assertion card = 10
    await expect(page.locator('#total-tests-count')).toHaveText('10');
    // The calendar-data `exists`-step card for year 1970 must be green (bg-success),
    // proving the fix: cfg.years=[1970] drove the render so .year-1970 was found in the DOM.
    await expect(page.locator('.step-exists.calendar-va.year-1970')).toHaveClass(/bg-success/);
    // The failed source-data card carries the stored error message as a tooltip
    await expect(page.locator('.proprium-de-sanctis-2002.step-parses .error-tooltip')).toHaveCount(1);
    await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();
});

test('rebuilds a live scaffold when returning to "— Live —" after a replay', async ({ page, request }) => {
    // Seed a run for Italy (1 sourceDataCheck) — deliberately smaller than any live scaffold, so
    // "the replayed cards are still on screen" is distinguishable from "a live scaffold was rebuilt".
    //
    // **Which** live scaffold changed with the replay-control sync, and this test changed with it.
    // It used to assert the General Roman one, because a replay left the controls alone and
    // returning to Live re-derived state from the untouched selects. `syncControlsToStoredRun()`
    // now points them at the run being shown, so leaving a replay lands on that run's calendar —
    // the deliberate consequence of having the controls describe what is on screen, and the reason
    // nothing stashes a pre-replay selection. What the test is really about is unchanged: the
    // replayed scaffold must be replaced by a live one built from the controls, not left standing.
    //
    // Counts stay measured rather than written down. The live General Roman figure was once
    // hardcoded to 11 and #61 part 2 moved it to 22; pinning a number here only ever bought a
    // second place to edit whenever coverage changed.
    // As above, the timestamp is supplied by seedStoredRun() rather than hardcoded.
    const run = {
        schemaVersion: 1,
        runType: 'calendars',
        calendar: 'IT',
        calendarCategory: 'nationalcalendar',
        responseType: 'JSON',
        duration: 500,
        counts: { successful: 0, failed: 0 },
        timings: { sourceData: 0, calendarData: 0, unitTests: 0 },
        scaffold: {
            sourceDataChecks: [{ validate: 'national-calendar-IT', sourceFile: 'IT', category: 'sourceDataCheck' }],
            years: [],
            unitTests: [],
        },
        sourceDataResults: [],
        calendarDataResults: [],
        unitTestResults: [],
    };
    const file = await seedStoredRun(request, run);

    await page.goto('/');
    await page.waitForSelector('#pastRunsSelect');
    // Wait for live scaffold to be built before replaying (avoids a race where setupPage()
    // fires after selectOption and clobbers the replayed state before we can check it).
    await page.waitForSelector('.sourcedata-tests > div');
    const liveCheckCount = await page.locator('.sourcedata-tests > div').count();
    // Guard the guard: a live scaffold of 1 would make the assertions below indistinguishable from
    // the replayed state, and the test would pass without restoring anything.
    expect(liveCheckCount).toBeGreaterThan(1);

    // Replay the IT run — scaffold should now show 1 source-data check
    await page.selectOption('#pastRunsSelect', file);
    await expect(page.locator('.sourcedata-tests > div')).toHaveCount(1);

    // The controls describe the run while it is on screen, and are inert for as long as it is.
    await expect(page.locator('#APICalendarSelect')).toHaveValue('IT');
    await expect(page.locator('#APICalendarSelect')).toBeDisabled();
    await expect(page.locator('#riteSelect')).toBeDisabled();
    await expect(page.locator('#APIResponseSelect')).toBeDisabled();

    // Return to "— Live —" — resyncLiveStateFromDom() must rebuild a live scaffold from the controls
    await page.selectOption('#pastRunsSelect', '');
    // Rebuilt, not left standing: the replayed scaffold was 1 check and every live one is larger.
    // The exact figure is Italy's live coverage, which is not this test's subject.
    await expect
        .poll(() => page.locator('.sourcedata-tests > div').count(), { timeout: 30_000 })
        .toBeGreaterThan(1);
    // Italy, because that is what the controls now read — not the General Roman calendar this
    // assertion named before the sync landed.
    await expect(page.locator('#APICalendarSelect')).toHaveValue('IT');
    await expect(page.locator('.currentSelectedCalendar').first()).toContainText('IT');
    // And handed back, since this user may run tests.
    await expect(page.locator('#APICalendarSelect')).toBeEnabled();
    await expect(page.locator('#riteSelect')).toBeEnabled();
    await expect(page.locator('#APIResponseSelect')).toBeEnabled();
});
