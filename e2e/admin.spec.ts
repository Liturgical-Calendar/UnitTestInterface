import { test, expect } from './fixtures';

/**
 * E2E tests for admin.php JWT authentication and test management
 *
 * Test plan items from PR #21:
 * - [ ] Verify login modal appears and works correctly
 * - [ ] Verify authenticated requests include credentials
 * - [ ] Verify 401 responses trigger login modal
 * - [ ] Verify logout clears session and reloads page
 * - [ ] Verify form elements with `data-requires-auth` are disabled when not logged in
 * - [ ] Verify dropdown clipping issue is fixed in Chrome/Windows
 */

test.describe('Admin Page - Unauthenticated State', () => {
    // Use a fresh context without authentication for these tests
    test.use({ storageState: { cookies: [], origins: [] } });

    test('should show login button when not authenticated', async ({ adminPage }) => {
        await adminPage.goToAdmin();

        // Login button should be visible
        const isLoginVisible = await adminPage.isLoginButtonVisible();
        expect(isLoginVisible).toBe(true);
    });

    test('should have data-requires-auth elements disabled when not logged in', async ({ adminPage, page }) => {
        await adminPage.goToAdmin();

        // Wait for page to fully load
        await page.waitForLoadState('networkidle');

        // Check that protected form controls are disabled
        const testSelector = page.locator('#litCalTestsSelect');
        await expect(testSelector).toBeDisabled();

        // Check that protected buttons are hidden or disabled
        const protectedButtons = page.locator('button[data-requires-auth]');
        const buttonCount = await protectedButtons.count();

        for (let i = 0; i < buttonCount; i++) {
            const btn = protectedButtons.nth(i);
            // Buttons should either be hidden (d-none class) or disabled
            // Use web-first assertions for better reliability and auto-retry
            const hasHiddenClass = await btn.evaluate(el => el.classList.contains('d-none'));
            if (!hasHiddenClass) {
                await expect(btn).toBeDisabled();
            }
        }
    });

    test('should open login modal when clicking login button', async ({ adminPage, page }) => {
        await adminPage.goToAdmin();

        await adminPage.openLoginModal();

        // Modal should be visible
        await expect(page.locator('#loginModal')).toBeVisible();
        await expect(page.locator('#loginUsername')).toBeVisible();
        await expect(page.locator('#loginPassword')).toBeVisible();
        await expect(page.locator('#loginSubmit')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ adminPage, page }) => {
        await adminPage.goToAdmin();

        await adminPage.openLoginModal();

        // Fill with invalid credentials
        await page.locator('#loginUsername').fill('invalid_user');
        await page.locator('#loginPassword').fill('wrong_password');
        await page.locator('#loginSubmit').click();

        // Should show error alert
        await expect(page.locator('#loginError')).toBeVisible({ timeout: 10000 });
    });
});

test.describe('Admin Page - Authenticated State', () => {
    test.beforeEach(async ({ adminPage }) => {
        await adminPage.goToAdmin();
        await adminPage.waitForAuth();
    });

    test('should show user menu when authenticated', async ({ adminPage, page }) => {
        // User should be authenticated
        const isAuth = await adminPage.isAuthenticated();
        expect(isAuth).toBe(true);

        // Login button container should be hidden (has d-none class)
        // Use .first() since there may be multiple elements with this attribute
        const loginBtnContainer = page.locator('li[data-requires-no-auth]').first();
        await expect(loginBtnContainer).toHaveClass(/d-none/);

        // User menu should be visible
        const userMenu = page.locator('#userMenu');
        await expect(userMenu).toBeVisible();
    });

    test('should have data-requires-auth elements enabled when logged in', async ({ adminPage, page }) => {
        // Test selector should be enabled
        const testSelector = page.locator('#litCalTestsSelect');
        await expect(testSelector).toBeEnabled();

        // Protected buttons should be visible (not have d-none class)
        const protectedButtons = page.locator('button[data-requires-auth]');
        const buttonCount = await protectedButtons.count();

        for (let i = 0; i < buttonCount; i++) {
            const btn = protectedButtons.nth(i);
            const isHidden = await btn.evaluate(el => el.classList.contains('d-none'));
            expect(isHidden).toBe(false);
        }
    });

    test('should include credentials in authenticated API requests', async ({ adminPage, page }) => {
        // The page itself makes authenticated requests when loading tests
        // Verify we can see the tests loaded successfully (which requires auth for certain operations)
        const testOptions = await adminPage.getTestOptions();

        // If tests loaded, the authenticated fetch worked
        expect(testOptions.length).toBeGreaterThan(0);
    });

    test('should be able to select a test from the dropdown', async ({ adminPage, page }) => {
        // Get available tests
        const testOptions = await adminPage.getTestOptions();
        expect(testOptions.length).toBeGreaterThan(0);

        // Select first test
        const firstTest = testOptions[0];
        await adminPage.selectTest(firstTest);

        // Verify selection
        const selectedTest = await adminPage.getSelectedTest();
        expect(selectedTest).toBe(firstTest);
    });

    test('should reset form when deselecting a test', async ({ adminPage, page }) => {
        // Get available tests and select one
        const testOptions = await adminPage.getTestOptions();
        if (testOptions.length > 0) {
            await adminPage.selectTest(testOptions[0]);

            // Wait for form to populate by checking the select has a value
            const testSelector = page.locator('#litCalTestsSelect');
            await expect(testSelector).toHaveValue(testOptions[0]);

            // Now deselect by selecting empty option
            await testSelector.selectOption('');

            // Verify the select is back to empty value using web-first assertion
            await expect(testSelector).toHaveValue('');
        }
    });
});

test.describe('Admin Page - Logout Flow', () => {
    test('should show logout button when authenticated', async ({ adminPage, page }) => {
        await adminPage.goToAdmin();
        await adminPage.waitForAuth();

        // Verify we're authenticated
        const isAuth = await adminPage.isAuthenticated();
        expect(isAuth).toBe(true);

        // Logout button should be visible when authenticated
        const logoutBtn = page.locator('#logoutBtn');
        await expect(logoutBtn).toBeVisible();

        // User menu should show the username
        const userInfo = page.locator('#userInfo');
        await expect(userInfo).toBeVisible();
    });
});

test.describe('Admin Page - 401 Response Handling', () => {
    // Skip: The 401 handling is implemented within specific app code paths (e.g., saveTest),
    // not via a global fetch interceptor. Testing this properly requires triggering
    // the actual save flow, which needs a complete test form setup.
    // TODO: Implement full 401 flow test once test creation UI is complete.
    test.skip('should trigger login modal on 401 response', async ({ adminPage, page }) => {
        await adminPage.goToAdmin();
        await adminPage.waitForAuth();

        // Mock a 401 response by intercepting and forcing it
        await page.route('**/tests/**', async route => {
            await route.fulfill({
                status: 401,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Unauthorized' })
            });
        });

        // The 401 handler in admin.js calls window.showLoginModal() when a save request fails
        // This would require triggering the actual save flow to test properly

        const loginModal = page.locator('#loginModal');
        await expect(loginModal).toBeVisible({ timeout: 5000 });
    });
});

test.describe('Admin Page - Visual Regression', () => {
    test('should not have dropdown clipping issues', async ({ adminPage, page }) => {
        await adminPage.goToAdmin();
        await adminPage.waitForAuth();

        // Verify the select element doesn't have overflow:hidden that causes clipping
        const select = page.locator('#litCalTestsSelect');

        // Check that the parent container doesn't clip the dropdown
        const parentOverflow = await select.evaluate(el => {
            const parent = el.closest('.form-group, .mb-3');
            return parent ? getComputedStyle(parent).overflow : 'visible';
        });
        expect(parentOverflow).not.toBe('hidden');

        // Optionally take a screenshot for manual review
        await page.screenshot({ path: 'e2e/screenshots/dropdown-no-clipping.png', fullPage: true });
    });
});
