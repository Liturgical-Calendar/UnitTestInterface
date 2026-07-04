import { test, expect } from '@playwright/test';

test('fresh Resources page renders source checks for all async datasets', async ({ page, request }) => {
    // calendars, missals, and tests metadata all arrive in one Promise.all, but
    // setupPage() used to fire mid-loop (from the missals branch, gated only on
    // MetaData+Missals) before the tests element of the same pass was processed —
    // so the per-test source-data cards were pushed into sourceDataChecks but never
    // rendered (and the Time badge totals under-counted) until something re-ran
    // setupPage() (e.g. changing the response format). A fresh page must render them.
    const apiBase = `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}`;
    const res = await request.get(`${apiBase}/tests`);
    const { litcal_tests } = await res.json();
    expect(litcal_tests.length).toBeGreaterThan(0);
    // Mirror common.js slugify(): lowercase, whitespace → '-', strip other punctuation —
    // sourceTemplate() derives the card class via slugify(validate).
    const testSlug = `tests-${litcal_tests[0].name}`
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-_]/g, '');

    await page.goto('/resources.php');
    // The run button enables only once ALL async datasets (metadata, missals, tests)
    // are loaded and the page is set up.
    await expect(page.locator('#startTestRunnerBtn')).toBeEnabled({ timeout: 15000 });

    // The per-test source-data card must be part of the fresh scaffold
    await expect(page.locator(`.sourcedata-tests .${testSlug}.file-exists`)).toHaveCount(1);

    // And the Time badge totals must agree with the rendered cards
    const sourceCards = await page.locator('.sourcedata-tests .file-exists, .sourcedata-tests .json-valid, .sourcedata-tests .schema-valid').count();
    await expect(page.locator('#totalSourceDataTestsCount')).toHaveText(String(sourceCards));
});
