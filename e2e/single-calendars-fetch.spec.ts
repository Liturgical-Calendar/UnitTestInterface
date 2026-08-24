import { test, expect, Page } from '@playwright/test';

/**
 * Each runner page fetches `/calendars` exactly once.
 *
 * Both used to fetch it twice, for different reasons, and in both cases the second copy was the
 * problem rather than the cost. On `index.php` the library's `ApiClient.init()` loads the calendar
 * index to build the controls, and the page fetched it again into a `MetaData` global — so the page
 * asked `apiBase` which nation a diocese belonged to in one function and `MetaData` the same
 * question in another, and the two could disagree. On `resources.php` the page called
 * `ApiClient.init()` for a `RiteSelect` that needs no metadata at all (it builds from the `Rite`
 * enum), paid for the index, discarded it, and then fetched it itself.
 *
 * Counted rather than asserted structurally because that is the property that actually matters and
 * the one a refactor can silently undo: a reintroduced `fetchJson( apiFetchUrl( 'calendars' ) )`, or
 * an `ApiClient.init()` added back out of habit, both show up here and nowhere else.
 *
 * It is not only tidiness. Every request counts against the API's rate limit, which is the single
 * most disruptive thing about running this suite locally.
 */
const countCalendarsFetches = async (page: Page, path: string): Promise<number> => {
    let fetches = 0;
    await page.route('**/calendars*', async (route) => {
        fetches += 1;
        await route.continue();
    });
    await page.goto(path);
    // Wait for the scaffold, which is downstream of every metadata read either page performs, then
    // settle briefly: a second fetch that arrived late would otherwise go uncounted.
    await page.waitForSelector('.sourcedata-tests > div', { timeout: 20000 });
    await page.waitForTimeout(2000);
    return fetches;
};

test('index.php fetches /calendars once, through the library that builds its controls', async ({ page }) => {
    expect(await countCalendarsFetches(page, '/')).toBe(1);
});

test('resources.php fetches /calendars once, its own, with no ApiClient.init()', async ({ page }) => {
    expect(await countCalendarsFetches(page, '/resources.php')).toBe(1);
});

test('the rite select still mounts with its labels, having no ApiClient behind it', async ({ page }) => {
    // The guard on the resources.php half: `RiteSelect` builds from the `Rite` enum, so dropping
    // `ApiClient.init()` must leave it fully populated. A control that silently lost its options
    // would otherwise be the price of the saved request.
    await page.goto('/resources.php');
    await expect(page.locator('#riteSelect')).toHaveCount(1);
    await expect(page.locator('#riteSelect option')).toHaveCount(2);
    const labels = await page.locator('#riteSelect option').allTextContents();
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
});
