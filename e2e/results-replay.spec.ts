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

test('restores live scaffold when returning to "— Live —" after a replay', async ({ page, request }) => {
    // Seed a run for Italy (1 sourceDataCheck) — deliberately different from the live General Roman
    // scaffold, which is larger. After replay, currentSelectedCalendar is clobbered to 'IT' and the
    // scaffold shows only that 1 check. Returning to "— Live —" must re-sync state from the DOM
    // controls and rebuild the scaffold via setupPage(), restoring the live layout.
    //
    // The live count is *measured* before the replay rather than written down. It was hardcoded to
    // 11 — metadata, temporale + i18n, decrees + i18n, and the three editio typica missals with
    // their i18n folders — and #61 part 2 moved it to 22 by adding the rite's lectionary corpus.
    // What this test is about is that returning to Live restores whatever the live scaffold was, so
    // pinning the number here only bought a second place to edit whenever coverage changes.
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

    // Return to "— Live —" — resyncLiveStateFromDom() must rebuild the live scaffold
    await page.selectOption('#pastRunsSelect', '');
    await expect(page.locator('.sourcedata-tests > div')).toHaveCount(liveCheckCount);
    // .currentSelectedCalendar cells must reflect the live dropdown value ('roman'), not 'IT'
    await expect(page.locator('.currentSelectedCalendar').first()).toContainText('roman');
});
