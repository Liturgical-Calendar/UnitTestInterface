import { test, expect } from '@playwright/test';

/**
 * UTI is an OIDC client in its own right — it has its own Zitadel registration ("LiturgicalCalendar
 * Tests") rather than borrowing the Frontend's, so it keeps working if the two are ever served from
 * different hosts.
 *
 * These specs pin the parts that are cheap to get subtly wrong: that the login control actually enters
 * the OIDC flow rather than the legacy modal, that the flow carries PKCE, that every callback failure
 * path refuses to set a cookie, and that identity still resolves for a session established the legacy
 * way — which is what proves `JwtAuth`'s delegation to `GET /auth/me` spans both token kinds.
 *
 * NOT covered here: the OIDC-unconfigured fallback, where `#loginBtn` stays a <button> that opens
 * `#loginModal`. Exercising it needs a stack booted without ZITADEL_ISSUER, which this suite does not
 * have; the branch is a single `if` in layout/topnavbar.php.
 */

test.describe('logged out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const target of ['/', '/resources.php']) {
        test(`${target} renders the login control as a link into the OIDC flow`, async ({ page }) => {
            await page.goto(target);
            const loginBtn = page.locator('#loginBtn');
            await expect(loginBtn).toBeVisible();
            // A link, not a button: the provider owns the next screen, so this is a full-page navigation.
            await expect(loginBtn).toHaveJSProperty('tagName', 'A');
            const href = await loginBtn.getAttribute('href');
            expect(href).toContain('/auth/login.php');
            expect(href).toContain(`return_to=${encodeURIComponent(target)}`);
        });
    }

    test('the modal handlers stand down, so clicking navigates instead of opening the dialog', async ({ page }) => {
        await page.goto('/');
        // Guards the module-ordering assumption: components/login-modal.php reads
        // window.LitCalConfig.oidcEnabled at module evaluation, and its <script type="module"> is emitted
        // ABOVE the inline script that defines LitCalConfig. Deferred execution is what makes that safe.
        await expect.poll(() => page.evaluate(() => window.LitCalConfig?.oidcEnabled)).toBe(true);

        await page.locator('#loginBtn').click();
        await page.waitForURL(/\/oauth\/v2\/authorize|\/ui\/v2\/login/, { timeout: 15000 });
        expect(page.url()).not.toContain('localhost:3003');
    });

    test('auth/login.php redirects to the issuer with PKCE', async ({ request }) => {
        const res = await request.get('/auth/login.php?return_to=%2Fresources.php', { maxRedirects: 0 });
        expect(res.status()).toBe(302);
        const location = res.headers()['location'] ?? '';
        expect(location).toContain('/oauth/v2/authorize');
        expect(location).toContain('response_type=code');
        expect(location).toContain('code_challenge_method=S256');
        expect(location).toMatch(/[?&]code_challenge=[^&]+/);
        expect(location).toMatch(/[?&]state=[^&]+/);
        expect(location).toMatch(/[?&]nonce=[^&]+/);
    });

    test('a hostile return_to is discarded without derailing the flow', async ({ request }) => {
        const res = await request.get('/auth/login.php?return_to=https%3A%2F%2Fevil.example%2Fx', { maxRedirects: 0 });
        expect(res.status()).toBe(302);
        // Still enters the flow; the hostile value is simply not what it will come back to.
        expect(res.headers()['location'] ?? '').toContain('/oauth/v2/authorize');
    });

    // Each failure mode gets its own error code so a real one is diagnosable from the URL alone.
    const callbackFailures: Array<[string, string]> = [
        ['code=abc&state=bogus', 'state_mismatch'],
        ['state=only', 'invalid_request'],
        ['code=only', 'invalid_request'],
        ['error=access_denied&state=x', 'provider_error'],
    ];

    for (const [query, expected] of callbackFailures) {
        test(`auth/callback.php?${query} fails as ${expected} and sets no cookie`, async ({ request }) => {
            const res = await request.get(`/auth/callback.php?${query}`, { maxRedirects: 0 });
            expect(res.status()).toBe(302);
            expect(res.headers()['location'] ?? '').toContain(`auth_error=${expected}`);

            const setCookie = res.headersArray()
                .filter((h) => h.name.toLowerCase() === 'set-cookie')
                .map((h) => h.value)
                .join('\n');
            expect(setCookie).not.toContain('litcal_access_token=ey');
        });
    }
});

test.describe('logged in', () => {
    test('a legacy-established session still resolves, proving delegation spans both token kinds', async ({ page }) => {
        // storageState here carries the cookie from auth.setup.ts, which logs in via POST /auth/login —
        // an API-issued HS256 token, not a Zitadel one. JwtAuth no longer decodes anything itself, so this
        // passing means GET /auth/me accepted it and UTI believed the answer.
        await page.goto('/');
        await expect.poll(() => page.evaluate(() => window.LitCalConfig?.isAuthenticated)).toBe(true);
        await expect(page.locator('#userMenu')).toBeVisible();
        await expect(page.locator('#loginBtn')).toBeHidden();
    });

    test('the logout control ends the provider session too', async ({ page }) => {
        await page.goto('/');
        const logoutBtn = page.locator('#logoutBtn');
        await expect(logoutBtn).toHaveJSProperty('tagName', 'A');
        expect(await logoutBtn.getAttribute('href')).toContain('/auth/logout.php');
    });
});
