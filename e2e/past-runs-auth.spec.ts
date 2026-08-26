import { test, expect } from '@playwright/test';

/**
 * The login UI used to live only on admin.php, which meant the runner pages could not
 * authenticate at all — so `results.php` answered 401 to every Past Runs listing and to
 * every attempt to persist a finished run. These specs pin the shared-layout arrangement
 * that replaced it.
 *
 * Every configured Playwright project runs with `storageState: 'e2e/.auth/user.json'`,
 * so the logged-out cases have to opt out of it explicitly.
 */

const RUNNER_PAGES = ['/', '/resources.php'];

test('admin.php is unlinked from the interface', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href*="admin.php"]')).toHaveCount(0);
    await expect(page.locator('#admin_url')).toHaveCount(0);
});

test.describe('logged out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    // Everything a single anonymous page load can answer is asserted from one load per page.
    // These pages fetch /validations, /calendars, /missals and more on load, and the API's rate
    // limiter is shared across the whole suite — a test that opens a runner page just to read one
    // boolean spends real budget, and the suite has a history of going red locally once it runs out.
    for (const target of RUNNER_PAGES) {
        test(`${target} renders the anonymous state`, async ({ page }) => {
            await page.goto(target);
            await page.waitForLoadState('domcontentloaded');
            expect(await page.evaluate(() => window.LitCalConfig.isAuthenticated)).toBe(false);
            expect(await page.evaluate(() => window.LitCalConfig.canRunTests)).toBe(false);

            // The page still finishes loading. Permission is not a readiness condition, so the
            // loader must come down even though the button never enables — folding the role check
            // into ReadyToRunTests.check() would have left an anonymous visitor stuck under it
            // forever, which is the #63 failure mode.
            await expect(page.locator('.page-loader')).toBeHidden({ timeout: 60_000 });
            await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();

            // Reading stored runs is public, so the dropdown is no longer an authenticated region.
            await expect(page.locator('#pastRunsSelect')).toBeVisible();
        });
    }

    test('the runner page offers a login button', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#loginBtn')).toBeVisible();
        await expect(page.locator('#loginModal')).toHaveCount(1);
        await expect(page.locator('#userMenu')).toBeHidden();
    });

    test('the server does not gate the Past Runs wrapper on auth', async ({ request }) => {
        // Asserted against the raw HTML rather than the live DOM on purpose: initPermissionUI()
        // also acts on `data-requires-auth`, and a DOM assertion would pass whether or not the
        // server got it right. The attribute has to be gone from the markup, not merely inert.
        const html = await (await request.get('/')).text();
        const wrapper = html.match(/<div class="([^"]*)"[^>]*>\s*<label for="pastRunsSelect"/);
        expect(wrapper, 'the Past Runs wrapper should be present in the served markup').not.toBeNull();
        expect(wrapper?.[1]).not.toContain('d-none');
        expect(html).not.toMatch(/data-requires-auth>\s*<label for="pastRunsSelect"/);
    });

    test('the Past Runs dropdown populates while logged out', async ({ page }) => {
        await page.route('**/results.php', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        file: 'calendars-2026-01-01T00-00-00Z.json',
                        runType: 'calendars',
                        timestamp: '2026-01-01T00:00:00Z',
                        calendar: 'VA',
                        counts: { successful: 3, failed: 0 },
                    },
                ]),
            })
        );
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        // Two options: the "— Live —" placeholder plus the one stored run.
        await expect(page.locator('#pastRunsSelect option')).toHaveCount(2);
    });

    test('a declined save reports "log in to save", not a failure', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        const outcome = await page.evaluate(async () => {
            const { postRunResults } = await import('/assets/js/testResults.js' as any);
            try {
                await postRunResults({ schemaVersion: 1, runType: 'calendars' });
                return 'resolved';
            } catch (err) {
                return (err as { status?: number }).status === 401
                    ? 'results-save-unauthenticated'
                    : 'results-save-failed';
            }
        });
        expect(outcome).toBe('results-save-unauthenticated');
        await expect(page.locator('#results-save-unauthenticated')).toHaveCount(1);
    });

    test('both auth events refill Past Runs without a reload', async ({ page }) => {
        // One stub whose answer is swapped between events, so every assertion below observes a
        // *re-fetch* rather than whatever the dropdown happened to be holding. Stubbed rather than
        // logging in for real: the subject is that the runner reacts to the events at all, not that
        // the API authenticates — and a real results.php would answer with whatever runs happen to
        // be stored on the machine, which is not something to write counts against.
        let runs: unknown[] = [];
        await page.route('**/results.php', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(runs) })
        );
        const run = (file: string) => ({
            file,
            runType: 'calendars',
            timestamp: '2026-01-01T00:00:00Z',
            calendar: 'VA',
            counts: { successful: 3, failed: 0 },
        });

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('#pastRunsSelect option')).toHaveCount(1);

        runs = [run('calendars-2026-01-01T00-00-00Z.json')];
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('auth:login')));
        await expect(page.locator('#pastRunsSelect option')).toHaveCount(2);

        // Logout *reloads* rather than clearing, because listing is public — so the count settles
        // at the placeholder plus whatever the endpoint now returns. Asserting 1 here would be
        // asserting the transient state `load()` passes through between clearing and refilling,
        // which is a race that passes or fails on timing; it went flaky in CI for exactly that
        // reason. A third run is served so the assertion cannot be satisfied by the two options
        // that were already on screen.
        runs = [run('calendars-2026-01-01T00-00-00Z.json'), run('calendars-2026-01-02T00-00-00Z.json')];
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('auth:logout')));
        await expect(page.locator('#pastRunsSelect option')).toHaveCount(3);
    });

    test('a second load landing mid-fetch does not double up the dropdown', async ({ page }) => {
        // Stubbed empty first, for the same reason as the spec above: the listing is public, so
        // the page's own load would otherwise fill the dropdown from real stored runs.
        await page.route('**/results.php', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        );
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('#pastRunsSelect option')).toHaveCount(1);

        // Hold the listing open so the logout below lands while the load is still in flight.
        let release: () => void = () => {};
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        await page.unroute('**/results.php');
        await page.route('**/results.php', async (route) => {
            await held;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        file: 'calendars-2026-01-01T00-00-00Z.json',
                        runType: 'calendars',
                        timestamp: '2026-01-01T00:00:00Z',
                        calendar: 'VA',
                        counts: { successful: 3, failed: 0 },
                    },
                ]),
            });
        });

        await page.evaluate(() => document.dispatchEvent(new CustomEvent('auth:login')));
        await page.evaluate(() => document.dispatchEvent(new CustomEvent('auth:logout')));
        release();

        // Both events start a load, and the first is still in flight when the second clears the
        // list — so the generation counter in createPastRunsList() has to make the first one drop
        // its results. Without it both loads append and the dropdown ends up with the same run
        // listed twice (3 options rather than 2).
        //
        // This spec used to assert the opposite count, for a reason that no longer holds: back
        // when results.php answered 401 to an anonymous listing, `auth:logout` cleared the
        // dropdown and the concern was a logged-out page keeping the previous session's run
        // filenames on screen. Listing is public now, so logout reloads instead of clearing and
        // there is no session-scoped data left to leak — but the race the counter guards is
        // unchanged, so the guard is still worth pinning.
        await page.waitForTimeout(500);
        await expect(page.locator('#pastRunsSelect option')).toHaveCount(2);
    });
});

test.describe('logged in', () => {
    for (const target of RUNNER_PAGES) {
        test(`${target} renders the permitted state`, async ({ page }) => {
            // The e2e fixture user authenticates through the API's legacy service, whose User model
            // defaults to `['admin']` — one of the roles JwtAuth::RUN_TESTS_ROLES names. The negative
            // case (authenticated but lacking the role) is deliberately not covered: it would need a
            // second seeded Zitadel user, and that gap is a known, accepted one.
            await page.goto(target);
            await page.waitForLoadState('domcontentloaded');
            expect(await page.evaluate(() => window.LitCalConfig.isAuthenticated)).toBe(true);
            expect(await page.evaluate(() => window.LitCalConfig.canRunTests)).toBe(true);
        });
    }

    test('the runner page offers the user menu, not a login button', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#userMenu')).toBeVisible();
        await expect(page.locator('#loginBtn')).toBeHidden();
    });

    test('Past Runs is visible', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#pastRunsSelect')).toBeVisible();
    });

    test('a permitted user may store a run', async ({ request }) => {
        const res = await request.post('results.php', {
            headers: { 'Content-Type': 'application/json' },
            data: { schemaVersion: 1, runType: 'calendars' },
        });
        // 400 for the deliberately incomplete envelope — the point is that it got past the
        // permission gate rather than answering 401 or 403.
        expect(res.status()).toBe(400);
    });
});
