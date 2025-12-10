import { test as base, expect, Page } from '@playwright/test';

/**
 * Test fixtures for UnitTestInterface admin.php tests.
 * Provides helper methods for common interactions with the admin page.
 */

export interface AdminPageFixtures {
    adminPage: AdminPageHelper;
}

/**
 * Helper class for interacting with the admin.php page.
 */
export class AdminPageHelper {
    readonly page: Page;
    readonly baseUrl: string;
    readonly apiUrl: string;

    constructor(page: Page) {
        this.page = page;
        this.baseUrl = process.env.FRONTEND_URL || 'http://localhost:3003';
        // Use URL constructor for validation and proper encoding
        const protocol = process.env.API_PROTOCOL || 'http';
        const host = process.env.API_HOST || 'localhost';
        const port = process.env.API_PORT || '8000';
        this.apiUrl = new URL(`${protocol}://${host}:${port}`).origin;
    }

    /**
     * Navigate to the admin page
     */
    async goToAdmin() {
        await this.page.goto(`${this.baseUrl}/admin.php`);
        // Use 'domcontentloaded' instead of 'networkidle' to avoid flakiness from polling/analytics
        await this.page.waitForLoadState('domcontentloaded');
    }

    /**
     * Wait for auth check to complete and user to be authenticated.
     * This waits for the user menu to be visible (indicating login was verified).
     */
    async waitForAuth() {
        await this.page.waitForFunction(() => {
            // @ts-ignore - Auth is a global object
            return typeof Auth !== 'undefined' && Auth.isAuthenticated() === true;
        }, undefined, { timeout: 10000 });
    }

    /**
     * Check if the user is currently authenticated
     */
    async isAuthenticated(): Promise<boolean> {
        return this.page.evaluate(() => {
            // @ts-ignore - Auth is a global object
            return typeof Auth !== 'undefined' && Auth.isAuthenticated() === true;
        });
    }

    /**
     * Get elements with data-requires-auth attribute
     */
    async getProtectedElements() {
        return this.page.locator('[data-requires-auth]');
    }

    /**
     * Check if protected elements are enabled (for form controls) or visible (for other elements)
     * @throws Error if no protected elements are found on the page
     */
    async areProtectedElementsEnabled(): Promise<boolean> {
        const elements = await this.getProtectedElements();
        const count = await elements.count();

        if (count === 0) {
            throw new Error('No protected elements found on the page');
        }

        for (let i = 0; i < count; i++) {
            const el = elements.nth(i);
            const tagName = await el.evaluate(e => e.tagName);

            if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(tagName)) {
                const isDisabled = await el.isDisabled();
                if (isDisabled) return false;
            } else {
                const isVisible = await el.isVisible();
                if (!isVisible) return false;
            }
        }
        return true;
    }

    /**
     * Check if the login button is visible in the navbar
     */
    async isLoginButtonVisible(): Promise<boolean> {
        const loginBtn = this.page.locator('#loginBtn');
        return loginBtn.isVisible();
    }

    /**
     * Check if the user menu is visible in the navbar
     */
    async isUserMenuVisible(): Promise<boolean> {
        const userMenu = this.page.locator('#userMenu');
        // isVisible() already returns false when the element doesn't exist
        return userMenu.isVisible();
    }

    /**
     * Click the login button to open the login modal
     */
    async openLoginModal() {
        const loginBtn = this.page.locator('#loginBtn');
        await loginBtn.click();
        await this.page.waitForSelector('#loginModal.show', { timeout: 5000 });
    }

    /**
     * Fill and submit the login form
     */
    async login(username: string, password: string, rememberMe = false) {
        await this.openLoginModal();

        await this.page.locator('#loginUsername').fill(username);
        await this.page.locator('#loginPassword').fill(password);

        if (rememberMe) {
            await this.page.locator('#rememberMe').check();
        }

        await this.page.locator('#loginSubmit').click();

        // Wait for modal to close
        await this.page.waitForSelector('#loginModal.show', { state: 'hidden', timeout: 10000 });
    }

    /**
     * Click the logout button
     */
    async logout() {
        const logoutBtn = this.page.locator('#logoutBtn');
        await logoutBtn.click();
        // Wait for page reload - use 'domcontentloaded' to avoid flakiness
        await this.page.waitForLoadState('domcontentloaded');
    }

    /**
     * Select a test from the dropdown
     */
    async selectTest(testName: string) {
        const select = this.page.locator('#litCalTestsSelect');
        await select.selectOption(testName);
        // selectOption already waits for the option to be selected;
        // no additional waitForLoadState needed unless selection triggers navigation
    }

    /**
     * Get the current selected test name
     */
    async getSelectedTest(): Promise<string> {
        const select = this.page.locator('#litCalTestsSelect');
        return select.inputValue();
    }

    /**
     * Check if the test selector is enabled
     */
    async isTestSelectorEnabled(): Promise<boolean> {
        const select = this.page.locator('#litCalTestsSelect');
        return !(await select.isDisabled());
    }

    /**
     * Get available test options
     */
    async getTestOptions(): Promise<string[]> {
        const options = await this.page.locator('#litCalTestsSelect option').allTextContents();
        // Filter out the placeholder option (displayed as '--')
        return options.filter(opt => opt !== '--');
    }

    /**
     * Check if the form is in a clean/reset state
     */
    async isFormReset(): Promise<boolean> {
        const testName = await this.page.locator('#testName').textContent();
        const description = await this.page.locator('#description').inputValue();
        return testName === '' && description === '';
    }

    /**
     * Wait for a toast notification to appear
     */
    async waitForToast(type: 'success' | 'error' | 'warning' | 'info' = 'success', timeout = 10000): Promise<boolean> {
        const selectorMap: Record<string, string> = {
            success: '.toast.bg-success, .alert-success',
            error: '.toast.bg-danger, .alert-danger',
            warning: '.toast.bg-warning, .alert-warning',
            info: '.toast.bg-info, .alert-info'
        };
        const selector = selectorMap[type] || type;

        return this.page.waitForSelector(selector, { timeout })
            .then(() => true)
            .catch(() => false);
    }

    /**
     * Dismiss all toast notifications
     */
    async dismissToasts(): Promise<void> {
        await this.page.evaluate(() => {
            document.querySelectorAll('.toast, .alert').forEach(el => {
                const closeBtn = el.querySelector('[data-bs-dismiss]');
                if (closeBtn) {
                    (closeBtn as HTMLElement).click();
                } else {
                    el.remove();
                }
            });
        });
    }

    /**
     * Wait for the session expiry warning toast
     */
    async waitForSessionExpiryWarning(timeout = 60000): Promise<boolean> {
        return this.page.waitForSelector('#sessionExpiryToast.show', { timeout })
            .then(() => true)
            .catch(() => false);
    }

    /**
     * Click the extend session button in the expiry warning
     */
    async extendSession() {
        const extendBtn = this.page.locator('#extendSessionBtn');
        await extendBtn.click();
        // Wait for toast to hide
        await this.page.waitForSelector('#sessionExpiryToast.show', { state: 'hidden', timeout: 5000 });
    }

    /**
     * Make an authenticated API request
     */
    async makeAuthenticatedRequest(endpoint: string, method = 'GET', body?: any): Promise<{
        status: number;
        body: any;
    }> {
        return this.page.evaluate(async ({ apiUrl, endpoint, method, body }) => {
            const response = await fetch(`${apiUrl}${endpoint}`, {
                method,
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: body ? JSON.stringify(body) : undefined
            });

            const status = response.status;
            const text = await response.text();
            let responseBody: any = text;
            try {
                responseBody = JSON.parse(text);
            } catch {
                // Keep raw text
            }

            return { status, body: responseBody };
        }, { apiUrl: this.apiUrl, endpoint, method, body });
    }

    /**
     * Intercept and capture API requests
     */
    async interceptApiRequests(urlPattern: string | RegExp): Promise<{
        requests: { url: string; method: string; postData: string | null }[];
        unroute: () => Promise<void>;
    }> {
        const requests: { url: string; method: string; postData: string | null }[] = [];

        const handler = async (route: import('@playwright/test').Route, request: import('@playwright/test').Request) => {
            requests.push({
                url: request.url(),
                method: request.method(),
                postData: request.postData()
            });
            await route.continue();
        };
        await this.page.route(urlPattern, handler);

        return {
            requests,
            unroute: () => this.page.unroute(urlPattern, handler)
        };
    }
}

/**
 * Extended test fixture with AdminPageHelper
 */
export const test = base.extend<AdminPageFixtures>({
    adminPage: async ({ page }, use) => {
        const helper = new AdminPageHelper(page);
        await use(helper);
    },
});

export { expect };
