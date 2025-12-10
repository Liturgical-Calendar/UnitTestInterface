import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '.auth/user.json');

/**
 * Response shape from /auth/login endpoint.
 * The API sets HttpOnly cookies for authentication; the response body
 * contains metadata but tokens are not exposed to JavaScript.
 */
interface LoginResponseData {
    message?: string;
    expires_in?: number;
}

interface LoginSuccessResult {
    ok: true;
    status: number;
    data: LoginResponseData;
}

interface LoginErrorResult {
    ok: false;
    status: number;
    error: string;
}

type LoginResult = LoginSuccessResult | LoginErrorResult;

/**
 * Response shape from /auth/me endpoint check.
 */
interface AuthCheckResult {
    ok: boolean;
    status: number;
    error?: string;
}

/**
 * Authentication setup for Playwright tests.
 *
 * Uses HttpOnly cookie-based authentication:
 * - The API sets HttpOnly cookies (litcal_access_token, litcal_refresh_token) on login
 * - Cookies are automatically included in subsequent requests via credentials: 'include'
 * - Tokens are never exposed to JavaScript, eliminating XSS token theft risks
 *
 * Playwright's storageState captures cookies, persisting them across test runs.
 */
setup('authenticate', async ({ page }) => {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3003';
    // Use URL class for validation and proper encoding
    const apiUrl = new URL(`${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}`).origin;
    const username = process.env.TEST_USERNAME;
    const password = process.env.TEST_PASSWORD;

    if (!username || !password) {
        throw new Error('TEST_USERNAME and TEST_PASSWORD must be set in environment variables');
    }

    // First, navigate to the admin page to establish the browser context
    await page.goto(`${frontendUrl}/admin.php`);
    await page.waitForLoadState('networkidle');

    // Authenticate via fetch with credentials: 'include' to ensure HttpOnly cookies are set
    const loginResponse: LoginResult = await page.evaluate(async (credentials) => {
        const response = await fetch(`${credentials.apiUrl}/auth/login`, {
            method: 'POST',
            credentials: 'include', // Required for HttpOnly cookie authentication
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                username: credentials.username,
                password: credentials.password
            })
        });

        if (!response.ok) {
            const text = await response.text();
            return { ok: false, status: response.status, error: text };
        }

        const data = await response.json();
        return { ok: true, status: response.status, data };
    }, { apiUrl, username, password });

    if (!loginResponse.ok) {
        throw new Error(`Login failed: ${loginResponse.status} - ${loginResponse.error}`);
    }

    // Verify authentication by making a request to an authenticated endpoint
    // This verifies that HttpOnly cookies were set correctly
    const authCheck: AuthCheckResult = await page.evaluate(async (apiUrl) => {
        try {
            const response = await fetch(`${apiUrl}/auth/me`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            return { ok: response.ok, status: response.status };
        } catch (e) {
            return { ok: false, status: 0, error: String(e) };
        }
    }, apiUrl);

    expect(authCheck.ok).toBe(true);

    // Save the authentication state (includes HttpOnly cookies)
    await page.context().storageState({ path: authFile });

    console.log('Authentication setup complete - cookies saved to storageState');
});
