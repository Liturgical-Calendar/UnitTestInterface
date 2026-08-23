import { test, expect, Page } from '@playwright/test';

/**
 * `GET /validations` failing must not hang either runner (#63).
 *
 * Before the fix both pages fetched the inventory inside a `Promise.all` alongside their other
 * metadata fetches, so one rejection discarded all of them: `setupPage()` never ran, and
 * `.page-loader` — rendered *visible* in the markup and lowered only once every readiness flag is
 * set — stayed up over a page that was never going to resolve. The only trace was a `console.error`.
 *
 * This is the most reachable failure on either page rather than a contrived one: the API rate-limits
 * `/validations` to 429 routinely in local development.
 *
 * The contract asserted here is deliberately two-sided:
 *   - the page must *degrade* — loader down, controls visible, whatever scaffold it can build built;
 *   - the run must still be *refused* — the inventory is the list of things a run checks, so a run
 *     started without it would check a subset and report success for it, which is the exact class of
 *     untruth this interface exists to detect.
 */

/** Answers `/validations` the way the API does when the caller is over its rate limit. */
const failValidations = (page: Page) =>
    page.route('**/validations', (route) =>
        route.fulfill({
            status: 429,
            contentType: 'application/problem+json',
            body: JSON.stringify({
                type: 'about:blank',
                title: 'Too Many Requests',
                status: 429,
                detail: 'Rate limit exceeded.',
            }),
        }));

test('index.php degrades, explains itself and refuses the run when /validations fails', async ({ page }) => {
    await failValidations(page);

    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/');

    // Says something...
    await expect(page.locator('#validations-load-failed')).toBeVisible({ timeout: 15000 });
    // ...and says the *true* thing: the calendar controls built fine, only the inventory is missing,
    // so the controls toast must stay down. This is what makes the second toast worth its string.
    await expect(page.locator('#controls-load-failed')).toBeHidden();

    // The overlay comes down rather than sitting over a page that will never resolve.
    await expect(page.locator('.page-loader')).toBeHidden({ timeout: 15000 });

    // The other three fetches were not discarded with it: the controls mounted and the
    // calendar-data scaffold rendered from the metadata that did arrive.
    await expect(page.locator('#riteSelect')).toHaveCount(1);
    await expect(page.locator('#APICalendarSelect')).toHaveCount(1);
    expect(await page.locator('.calendardata-tests .card').count()).toBeGreaterThan(0);

    // But the run stays refused: without the inventory a run would check almost nothing and then
    // report itself green.
    await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();

    expect(pageErrors).toEqual([]);
});

test('resources.php degrades, explains itself and refuses the run when /validations fails', async ({ page }) => {
    await failValidations(page);

    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/resources.php');

    await expect(page.locator('#validations-load-failed')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#controls-load-failed')).toBeHidden();
    await expect(page.locator('.page-loader')).toBeHidden({ timeout: 15000 });

    // /calendars and /missals still landed, so the URL-based resource checks are rendered...
    expect(await page.locator('.resourcedata-tests .card').count()).toBeGreaterThan(0);
    // ...while the source-data list, which comes wholly from the inventory, is empty rather than
    // silently partial.
    await expect(page.locator('.sourcedata-tests .card')).toHaveCount(0);

    await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();

    expect(pageErrors).toEqual([]);
});
