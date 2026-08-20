import { test, expect, Page } from '@playwright/test';

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

    // Per-missal Roman entries are named `proprium-de-sanctis-{region}-{year}` (or, for the editio
    // typica, `proprium-de-sanctis-{year}` with no region). The rite's own universal corpus also
    // contributes an entry ending `-proprium-de-sanctis-i18n` (`ambrosian-` under the Ambrosian
    // rite) — present under both rites by design (see wsProtocol.js UNIVERSAL_CHECKS) — so the
    // Roman-only check must not mistake that shared corpus entry for a per-missal one.
    const perMissalPattern = /(?<!ambrosian-)proprium-de-sanctis-/;

    const roman = await cardMarkup(page);
    expect(roman).toContain('national-calendar-');
    expect(roman).toContain('wider-region-');
    expect(roman).toMatch(perMissalPattern);

    await selectRite(page, 'ambrosian');
    const ambrosian = await cardMarkup(page);
    expect(ambrosian).not.toContain('national-calendar-');
    expect(ambrosian).not.toContain('wider-region-');
    expect(ambrosian).not.toMatch(perMissalPattern);
});

test('the universal corpus and test corpus follow the rite', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const roman = await cardMarkup(page);
    expect(roman.toLowerCase()).toContain('propriumdetempore');
    expect(roman.toLowerCase()).not.toContain('ambrosianpropriumdetempore');

    await selectRite(page, 'ambrosian');
    const ambrosian = await cardMarkup(page);
    expect(ambrosian.toLowerCase()).toContain('ambrosianpropriumdetempore');
    expect(ambrosian.toLowerCase()).toContain('ambrosianpropriumdesanctis');
});

test('every per-nation and per-diocese URL names its rite explicitly', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const urls = async () =>
        page.locator('[title]').evaluateAll(
            // Scoped to actual per-nation/per-diocese/per-wider-region paths, not the bare
            // `/data/{rite}/nation` in isolation nor the rite-qualified collection endpoints
            // (`/events/{rite}`, `/tests/{rite}`) already covered by the collection-check test.
            (els) => els.map((e) => e.getAttribute('title') ?? '')
                       .filter((t) => /\/(data|events)\/(roman|ambrosian)\/(nation|diocese|widerregion)\//.test(t))
        );

    for (const rite of ['roman', 'ambrosian']) {
        if (rite === 'ambrosian') {
            await selectRite(page, rite);
        }
        for (const url of await urls()) {
            // An unprefixed /data/nation/IT or /events/diocese/x resolves to Roman silently,
            // which would be a wrong-green under the Ambrosian rite.
            expect(url).toMatch(/\/(data|events)\/(roman|ambrosian)\//);
        }
    }
});
