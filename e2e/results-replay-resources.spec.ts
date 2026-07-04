import { test, expect } from '@playwright/test';
import { unlink } from 'fs/promises';
import path from 'path';

// Clean up seeded run files so e2e fixtures don't pollute the real Past Runs dropdown.
const seededFiles: string[] = [];
test.afterAll(async () => {
    for (const file of seededFiles) {
        await unlink(path.join(__dirname, '..', 'results', file)).catch(() => { /* already removed by a parallel project */ });
    }
});

test('replays a stored resources run onto the dashboard', async ({ page, request }) => {
    // Seed a minimal resources run.
    // resourceDataChecks[0].validate = 'calendars-path' → resourceTemplate produces cards with
    // class "calendars-path file-exists" (slugify preserves the already-lowercase hyphenated string).
    // sourceDataChecks[0].validate = 'memorials-from-decrees' → sourceTemplate produces
    // "memorials-from-decrees file-exists".
    // Both selectors are stored as-is; applyResultToDom runs them through slugifySelector, which
    // is a no-op for already-lowercase selectors.
    const run = {
        schemaVersion: 1,
        timestamp: '2026-07-03T10:00:00Z',
        runType: 'resources',
        duration: 1500,
        counts: { successful: 1, failed: 1 },
        timings: { apiPath: 800, sourceData: 700 },
        scaffold: {
            resourceDataChecks: [
                { validate: 'calendars-path', sourceFile: 'http://localhost:8001/calendars', category: 'resourceDataCheck' }
            ],
            sourceDataChecks: [
                { validate: 'memorials-from-decrees', sourceFile: 'jsondata/sourcedata/decrees/decrees.json', category: 'sourceDataCheck' }
            ],
        },
        apiPathResults: [
            { id: '.calendars-path.file-exists', selector: '.calendars-path.file-exists', status: 'success', message: null, test: null }
        ],
        sourceDataResults: [
            { id: '.memorials-from-decrees.json-valid', selector: '.memorials-from-decrees.json-valid', status: 'error', message: 'seeded failure', test: null }
        ],
    };
    const save = await request.post('results.php', { data: run });
    const { file } = await save.json();
    seededFiles.push(file);

    await page.goto('/resources.php');
    await page.waitForSelector('#pastRunsSelect');
    // Wait for the live scaffold to finish rendering (loadAsyncData + setupPage run after
    // metadata/missals/tests fetches complete); selecting a past run before that would let
    // setupPage's rebuild clobber the replayed state.
    // Use the source-data container (#sourceDataTests is open by default with 'collapse show'),
    // not the collapsed resource-data accordion (#resourceDataTests starts collapsed).
    await page.waitForSelector('.sourcedata-tests > div');
    await page.selectOption('#pastRunsSelect', file);

    await expect(page.locator('#successfulCount')).toHaveText('1');
    await expect(page.locator('#failedCount')).toHaveText('1');
    // Per-phase Successful/Failed badges must be derived from the stored descriptors
    await expect(page.locator('#successfulResourceDataTestsCount')).toHaveText('1');
    await expect(page.locator('#failedResourceDataTestsCount')).toHaveText('0');
    await expect(page.locator('#successfulSourceDataTestsCount')).toHaveText('0');
    await expect(page.locator('#failedSourceDataTestsCount')).toHaveText('1');
    // Time badge total: (1 resource check + 1 source check) × 3 cards each = 6.
    // Populated by buildScaffolding, so live runs and replay both get it.
    await expect(page.locator('#total-tests-count')).toHaveText('6');
    // The resource-data file-exists card for calendars-path must be green (bg-success)
    await expect(page.locator('.calendars-path.file-exists')).toHaveClass(/bg-success/);
    await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();
});
