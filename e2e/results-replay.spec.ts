import { test, expect } from '@playwright/test';

test('replays a stored calendars run onto the dashboard', async ({ page, request }) => {
    // Seed a minimal run whose one source-data card and one calendar-data card will paint green.
    // scaffold.years = [1970] is intentionally different from the live page's global Years array
    // (~80 entries, 1970..currentYear+25). Under the old code, calDataTestTemplate used
    // Years.length (≈80) instead of cfg.years.length (1) to compute the year index, so the
    // rendered class was .year-<maxYear> while buildScaffolding queried .year-1970 → null →
    // TypeError crash. The calendar-data assertion below directly exercises that cross-year path.
    const run = {
        schemaVersion: 1,
        timestamp: '2026-07-03T09:00:00Z',
        runType: 'calendars',
        calendar: 'VA',
        calendarCategory: 'nationalcalendar',
        responseType: 'JSON',
        duration: 1000,
        counts: { successful: 2, failed: 0 },
        timings: { sourceData: 500, calendarData: 500, unitTests: 0 },
        scaffold: {
            sourceDataChecks: [{ validate: 'proprium-de-sanctis-1970', sourceFile: 'EDITIO_TYPICA_1970', category: 'sourceDataCheck' }],
            years: [1970],
            unitTests: [],
        },
        sourceDataResults: [{ id: '.proprium-de-sanctis-1970.file-exists', selector: '.proprium-de-sanctis-1970.file-exists', status: 'success', message: null, test: null }],
        calendarDataResults: [{ id: '.file-exists.calendar-va.year-1970', selector: '.file-exists.calendar-va.year-1970', status: 'success', message: null, test: null }],
        unitTestResults: [],
    };
    const save = await request.post('results.php', { data: run });
    const { file } = await save.json();

    await page.goto('/');
    await page.waitForSelector('#pastRunsSelect');
    // Wait for the live scaffold to finish building (setupPage runs after async
    // metadata fetches); selecting a past run earlier would let setupPage's
    // rebuild clobber the replayed counters afterwards.
    await page.waitForSelector('.sourcedata-tests > div');
    await page.selectOption('#pastRunsSelect', file);

    await expect(page.locator('#successfulCount')).toHaveText('2');
    // The calendar-data file-exists card for year 1970 must be green (bg-success),
    // proving the fix: cfg.years=[1970] drove the render so .year-1970 was found in the DOM.
    await expect(page.locator('.file-exists.calendar-va.year-1970')).toHaveClass(/bg-success/);
    await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();
});

test('restores live scaffold when returning to "— Live —" after a replay', async ({ page, request }) => {
    // Seed a run for Italy (1 sourceDataCheck) — deliberately different from the live VA
    // scaffold which has 6 sourceDataChecks (sourceDataChecks const in index.js).
    // After replay, currentSelectedCalendar is clobbered to 'IT' and the scaffold shows
    // only 1 check. Returning to "— Live —" must re-sync state from the DOM controls and
    // rebuild the scaffold via setupPage(), restoring the 6-check VA layout.
    const run = {
        schemaVersion: 1,
        timestamp: '2026-07-03T11:00:00Z',
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
    const save = await request.post('results.php', { data: run });
    const { file } = await save.json();

    await page.goto('/');
    await page.waitForSelector('#pastRunsSelect');
    // Wait for live scaffold to be built before replaying (avoids a race where setupPage()
    // fires after selectOption and clobbers the replayed state before we can check it).
    await page.waitForSelector('.sourcedata-tests > div');

    // Replay the IT run — scaffold should now show 1 source-data check
    await page.selectOption('#pastRunsSelect', file);
    await expect(page.locator('.sourcedata-tests > div')).toHaveCount(1);

    // Return to "— Live —" — resyncLiveStateFromDom() must rebuild the VA scaffold (6 checks)
    await page.selectOption('#pastRunsSelect', '');
    await expect(page.locator('.sourcedata-tests > div')).toHaveCount(6);
    // .currentSelectedCalendar cells must reflect the live dropdown value ('VA'), not 'IT'
    await expect(page.locator('.currentSelectedCalendar').first()).toContainText('VA');
});
