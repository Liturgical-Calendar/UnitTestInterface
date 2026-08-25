import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

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
 * **Both branches are covered, and which one runs depends on the environment.** UTI's CI has no Zitadel,
 * so `oidcEnabled` is false there and the fallback assertions run; a developer stack with Zitadel
 * configured runs the OIDC ones. That asymmetry is the point rather than a gap: the fallback existing and
 * working without Zitadel is precisely what keeps a Zitadel dependency out of this repository's CI, and it
 * would otherwise be the half that never got exercised.
 */

/**
 * Whether this deployment has Zitadel configured, read from the server-rendered page rather than from
 * env vars, so the test and the application cannot disagree about it.
 */
async function oidcIsEnabled(request: APIRequestContext): Promise<boolean> {
    const html = await (await request.get('/')).text();
    return /oidcEnabled:\s*true/.test(html);
}

test.describe('logged out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const target of ['/', '/resources.php']) {
        test(`${target} renders the login control as a link into the OIDC flow`, async ({ page, request }) => {
            test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');
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

    test('the modal handlers stand down, so clicking navigates instead of opening the dialog', async ({ page, request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');
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
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');
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
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');
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
            test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');
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

test.describe('without Zitadel configured', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('the login control stays a modal button', async ({ page, request }) => {
        test.skip(await oidcIsEnabled(request), 'Zitadel IS configured in this environment');
        await page.goto('/');
        const loginBtn = page.locator('#loginBtn');
        await expect(loginBtn).toBeVisible();
        await expect(loginBtn).toHaveJSProperty('tagName', 'BUTTON');
        await expect(page.locator('#loginModal')).toHaveCount(1);
    });

    test('clicking it opens the legacy dialog rather than navigating', async ({ page, request }) => {
        test.skip(await oidcIsEnabled(request), 'Zitadel IS configured in this environment');
        await page.goto('/');
        await page.locator('#loginBtn').click();
        await expect(page.locator('#loginModal')).toBeVisible();
        expect(page.url()).toContain('localhost');
    });

    test('auth/login.php refuses rather than half-starting a flow it cannot finish', async ({ request }) => {
        test.skip(await oidcIsEnabled(request), 'Zitadel IS configured in this environment');
        const res = await request.get('/auth/login.php', { maxRedirects: 0 });
        expect(res.status()).toBe(503);
        expect(await res.json()).toMatchObject({ error: 'OIDC is not configured' });
    });
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

    test('the logout control ends the provider session too', async ({ page, request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');
        await page.goto('/');
        const logoutBtn = page.locator('#logoutBtn');
        await expect(logoutBtn).toHaveJSProperty('tagName', 'A');
        expect(await logoutBtn.getAttribute('href')).toContain('/auth/logout.php');
    });
});
