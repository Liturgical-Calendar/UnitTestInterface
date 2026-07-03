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
