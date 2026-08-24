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

test.describe('logged out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const target of RUNNER_PAGES) {
        test(`${target} publishes isAuthenticated=false`, async ({ page }) => {
            await page.goto(target);
            await page.waitForLoadState('domcontentloaded');
            const isAuth = await page.evaluate(() => window.LitCalConfig.isAuthenticated);
            expect(isAuth).toBe(false);
        });
    }

    test('the runner page offers a login button', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#loginBtn')).toBeVisible();
        await expect(page.locator('#loginModal')).toHaveCount(1);
        await expect(page.locator('#userMenu')).toBeHidden();
    });

    test('Past Runs is hidden', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#pastRunsSelect')).toBeHidden();
    });

    test('the server sends Past Runs already hidden', async ({ request }) => {
        // Asserted against the raw HTML rather than the live DOM on purpose. initPermissionUI()
        // hides the column too, and expect().toBeHidden() auto-retries, so a DOM assertion passes
        // whether or not the server got it right — it just waits out the flash of visibility this
        // gate exists to prevent.
        const html = await (await request.get('/')).text();
        const wrapper = html.match(/<div class="([^"]*)"[^>]*data-requires-auth>\s*<label for="pastRunsSelect"/);
        expect(wrapper, 'the Past Runs wrapper should be present in the served markup').not.toBeNull();
        expect(wrapper?.[1]).toContain('d-none');
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
});

test.describe('logged in', () => {
    for (const target of RUNNER_PAGES) {
        test(`${target} publishes isAuthenticated=true`, async ({ page }) => {
            await page.goto(target);
            await page.waitForLoadState('domcontentloaded');
            const isAuth = await page.evaluate(() => window.LitCalConfig.isAuthenticated);
            expect(isAuth).toBe(true);
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

    test('the server sends Past Runs already visible', async ({ request }) => {
        const html = await (await request.get('/')).text();
        const wrapper = html.match(/<div class="([^"]*)"[^>]*data-requires-auth>\s*<label for="pastRunsSelect"/);
        expect(wrapper, 'the Past Runs wrapper should be present in the served markup').not.toBeNull();
        expect(wrapper?.[1]).not.toContain('d-none');
    });
});
