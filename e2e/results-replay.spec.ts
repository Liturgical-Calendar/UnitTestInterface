import { test, expect } from '@playwright/test';

test('replays a stored calendars run onto the dashboard', async ({ page, request }) => {
    // Seed a minimal run whose one source-data card will paint green.
    const run = {
        schemaVersion: 1,
        timestamp: '2026-07-03T09:00:00Z',
        runType: 'calendars',
        calendar: 'VA',
        calendarCategory: 'nationalcalendar',
        responseType: 'JSON',
        duration: 1000,
        counts: { successful: 1, failed: 0 },
        timings: { sourceData: 1000, calendarData: 0, unitTests: 0 },
        scaffold: {
            sourceDataChecks: [{ validate: 'proprium-de-sanctis-1970', sourceFile: 'EDITIO_TYPICA_1970', category: 'sourceDataCheck' }],
            years: [],
            unitTests: [],
        },
        sourceDataResults: [{ id: '.proprium-de-sanctis-1970.file-exists', selector: '.proprium-de-sanctis-1970.file-exists', status: 'success', message: null, test: null }],
        calendarDataResults: [],
        unitTestResults: [],
    };
    const save = await request.post('results.php', { data: run });
    const { file } = await save.json();

    await page.goto('/');
    await page.waitForSelector('#pastRunsSelect');
    await page.selectOption('#pastRunsSelect', file);

    await expect(page.locator('#successfulCount')).toHaveText('1');
    await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();
});
