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
});
