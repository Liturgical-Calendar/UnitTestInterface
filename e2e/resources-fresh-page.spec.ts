import { test, expect } from '@playwright/test';

test('fresh Resources page renders source checks for all async datasets', async ({ page, request }) => {
    // calendars, missals, and tests metadata all arrive in one Promise.all, but
    // setupPage() used to fire mid-loop (from the missals branch, gated only on
    // MetaData+Missals) before the tests element of the same pass was processed —
    // so the per-test source-data cards were pushed into sourceDataChecks but never
    // rendered (and the Time badge totals under-counted) until something re-ran
    // setupPage() (e.g. changing the response format). A fresh page must render them.
    const apiBase = `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}`;
    // Since #42 the source-data list is the API's advertised inventory rather than three metadata
    // endpoints this page derived paths from, so the card to look for is an inventory item — and
    // the test corpus reaches it as items of its own (`test:{rite}:{name}`).
    const res = await request.get(`${apiBase}/validations`);
    const { litcal_validations } = await res.json();
    const romanTest = litcal_validations.find((item: { id: string }) => item.id.startsWith('test:roman:'));
    expect(romanTest).toBeTruthy();
    // Mirror wsProtocol.js idToCardClass(): every character outside [A-Za-z0-9_-] becomes '-',
    // then lowercased. NOT common.js slugify(), which would strip the colons rather than replace
    // them and collapse the id into an unreadable run.
    const testSlug = romanTest.id.replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase();

    await page.goto('/resources.php');
    // The run button enables only once ALL async datasets (metadata, missals, validations)
    // are loaded and the page is set up.
    await expect(page.locator('#startTestRunnerBtn')).toBeEnabled({ timeout: 15000 });

    // The per-test source-data card must be part of the fresh scaffold
    await expect(page.locator(`.sourcedata-tests .${testSlug}.step-exists`)).toHaveCount(1);

    // And the Time badge totals must agree with the rendered cards.
    //
    // The selector comes from `checkCardSelector()` rather than being spelled out here. It used to
    // list `.step-exists, .step-parses, .step-validates`, which stopped counting every card the
    // moment a fourth step (`covers`) joined `STEP_CARD_CLASS` — the badge counted 313 while this
    // counted 270, a disagreement about the test's own locator rather than about the page.
    const cardSelector = await page.evaluate(async () => {
        const { checkCardSelector } = await import('/assets/js/wsProtocol.js' as any);
        return checkCardSelector('.sourcedata-tests') as string;
    });
    const sourceCards = await page.locator(cardSelector).count();
    await expect(page.locator('#totalSourceDataTestsCount')).toHaveText(String(sourceCards));
});
