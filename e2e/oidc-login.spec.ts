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

    test('the authorization request carries the Zitadel role scope', async ({ request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');

        // Without urn:zitadel:iam:org:project:roles the login still succeeds, but the user arrives with
        // no roles — which reads as a permissions bug rather than a missing scope. And when
        // ZITADEL_ORG_ID is configured, urn:zitadel:iam:org:id:<id> must ride along too: without it
        // Zitadel's hosted login registers new users into its IAM-internal default org, where they have
        // no email on file, show their user id as their username, hold no roles, and are invisible to
        // org-scoped admin APIs.
        const res = await request.get('/auth/login.php', { maxRedirects: 0 });
        const scope = new URL(res.headers()['location'] ?? '').searchParams.get('scope') ?? '';

        expect(scope).toContain('openid');
        expect(scope).toContain('offline_access');
        expect(scope).toContain('urn:zitadel:iam:org:project:roles');

        // The org scope is conditional on configuration, so assert the implication rather than presence:
        // whenever an org id is set, the scope must be there.
        const orgScoped = /urn:zitadel:iam:org:id:\d+/.test(scope);
        const html = await (await request.get('/')).text();
        const orgConfigured = /oidcOrgScoped:\s*true/.test(html);
        if (orgConfigured) {
            expect(orgScoped, 'an configured org id must appear as a scope').toBe(true);
        }
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

    test('the provider accepts the logout request, not merely receives it', async ({ request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');

        // Following the redirect is the whole point of this test. An earlier version asserted only that
        // the logout URL CONTAINED a post_logout_redirect_uri, which it did — while Zitadel rejected the
        // value with {"error":"invalid_request","error_description":"post_logout_redirect_uri invalid"},
        // because a trailing slash was appended to an origin registered without one. A well-formed
        // request that the provider refuses is still a broken logout.
        const started = await request.get('/auth/logout.php', { maxRedirects: 0 });
        expect(started.status()).toBe(302);

        const logoutUrl = started.headers()['location'] ?? '';
        const redirectUri = new URL(logoutUrl).searchParams.get('post_logout_redirect_uri');
        expect(redirectUri, 'a post_logout_redirect_uri must be sent').toBeTruthy();
        // Pinned because it is exactly what broke: setup-zitadel.sh registers the bare origin, and
        // Zitadel matches this value exactly.
        expect(redirectUri!.endsWith('/'), 'the registered origin carries no trailing slash').toBe(false);

        const atProvider = await request.get(logoutUrl, { maxRedirects: 0 });
        // Any 2xx or 3xx is acceptance — end_session normally answers 302 back to the application, but a
        // provider is entitled to render a confirmation page instead. Asserting the whole successful range
        // rather than "not 400" matters because the failure this test exists for is only one of the ways
        // the request can be refused; a 401, 403 or 500 would otherwise read as a pass.
        expect(atProvider.status(), 'the provider must accept the request').toBeGreaterThanOrEqual(200);
        expect(atProvider.status(), 'the provider must accept the request').toBeLessThan(400);
        expect(await atProvider.text()).not.toContain('invalid_request');
    });
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

    test('the session-expiry toast logs out through the OIDC endpoint too', async ({ page, request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');
        await page.goto('/');
        await expect.poll(() => page.evaluate(() => window.LitCalConfig?.oidcEnabled)).toBe(true);

        // The navbar control is not the only way out. The expiry toast used to call Auth.logout(), which
        // posts to the API and leaves the Zitadel session standing, so the next login would silently
        // re-authenticate. Confirm the dialog and assert where it actually goes.
        page.on('dialog', (d) => d.accept());
        const navigation = page.waitForURL(/auth\/logout\.php|\/oidc\/v1\/end_session|localhost:3003\/$/, { timeout: 15000 });
        await page.evaluate(() => document.getElementById('sessionExpiryLogout')?.click());
        await navigation;
        expect(page.url()).not.toContain('/auth/me');
    });

    test('logout drops an id_token_hint minted for another client', async ({ browser, request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');

        // Where sibling sites share a cookie domain, the id token in our cookie is often theirs: a user
        // who logged in on the frontend arrives here already authenticated, carrying the frontend's token.
        // Forwarding that alongside our own client_id makes Zitadel refuse the whole request with
        // "client_id does not match azp of id_token_hint", and the user cannot log out at all.
        const b64url = (o: unknown) =>
            Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const foreignIdToken = [
            b64url({ alg: 'RS256', typ: 'JWT' }),
            b64url({ azp: 'some-other-clients-id', aud: ['some-other-clients-id'] }),
            b64url('signature'),
        ].join('.');

        const ctx = await browser.newContext();
        await ctx.addCookies([
            { name: 'litcal_id_token', value: foreignIdToken, domain: 'localhost', path: '/' },
        ]);
        try {
            const res = await ctx.request.get('/auth/logout.php', { maxRedirects: 0 });
            const location = res.headers()['location'] ?? '';

            expect(location, 'logout must still reach the provider').toContain('end_session');
            expect(location, 'a foreign hint must not be forwarded').not.toContain('id_token_hint=');
            // client_id is still needed: it is what lets the provider validate post_logout_redirect_uri.
            expect(location).toContain('client_id=');
            expect(location).toContain('post_logout_redirect_uri=');
        } finally {
            await ctx.close();
        }
    });

    test('logout rejects a hint whose payload only matches after invalid characters are dropped', async ({ browser, request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');

        // PHP's base64_decode() in non-strict mode never fails: it silently discards characters outside
        // the alphabet, so a corrupted payload still decodes to plausible JSON. This asserts the alphabet
        // is checked BEFORE decoding — otherwise a mangled token whose azp happens to match would be
        // forwarded to the provider as a hint.
        //
        // The client id is read from the live redirect rather than hardcoded, so the crafted azp really
        // does match this deployment. Without that the test could pass for the wrong reason.
        const started = await request.get('/auth/login.php', { maxRedirects: 0 });
        const clientId = new URL(started.headers()['location'] ?? '').searchParams.get('client_id');
        expect(clientId, 'the login redirect should name a client id').toBeTruthy();

        const b64url = (o: unknown) =>
            Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const header = b64url({ alg: 'RS256', typ: 'JWT' });
        const payload = b64url({ azp: clientId });
        const signature = b64url('signature');

        const forwarded = async (idToken: string): Promise<boolean> => {
            const ctx = await browser.newContext();
            try {
                await ctx.addCookies([{ name: 'litcal_id_token', value: idToken, domain: 'localhost', path: '/' }]);
                const res = await ctx.request.get('/auth/logout.php', { maxRedirects: 0 });
                return (res.headers()['location'] ?? '').includes('id_token_hint=');
            } finally {
                await ctx.close();
            }
        };

        // Control: the same payload, uncorrupted, IS forwarded — so the rejection below is attributable
        // to the corruption and nothing else.
        expect(await forwarded(`${header}.${payload}.${signature}`)).toBe(true);
        expect(await forwarded(`${header}.${payload}!.${signature}`)).toBe(false);
        expect(await forwarded(`${header}.${payload.slice(0, 4)}@${payload.slice(4)}.${signature}`)).toBe(false);
    });

    test('logout rejects a hint whose azp is present but empty', async ({ browser, request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');

        // The single-valued `aud` fallback is licensed only by `azp` being ABSENT. A token carrying
        // `azp: ""` has an authorized party that is not us, so it must be refused rather than allowed to
        // fall through to a matching `aud` — which is what happened while the check coerced the value
        // (`is_string($azp) && '' !== $azp`) instead of testing presence. CodeRabbit on Frontend #480.
        const started = await request.get('/auth/login.php', { maxRedirects: 0 });
        const clientId = new URL(started.headers()['location'] ?? '').searchParams.get('client_id');
        expect(clientId, 'the login redirect should name a client id').toBeTruthy();

        const b64url = (o: unknown) =>
            Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const header = b64url({ alg: 'RS256', typ: 'JWT' });
        const signature = b64url('signature');

        const forwarded = async (claims: unknown): Promise<boolean> => {
            const ctx = await browser.newContext();
            try {
                await ctx.addCookies([
                    { name: 'litcal_id_token', value: `${header}.${b64url(claims)}.${signature}`, domain: 'localhost', path: '/' },
                ]);
                const res = await ctx.request.get('/auth/logout.php', { maxRedirects: 0 });
                return (res.headers()['location'] ?? '').includes('id_token_hint=');
            } finally {
                await ctx.close();
            }
        };

        // Control: with azp genuinely absent, a single-valued aud DOES stand in for it — so the
        // rejections below are attributable to the invalid azp and not to the fallback being broken.
        expect(await forwarded({ aud: clientId })).toBe(true);

        expect(await forwarded({ azp: '', aud: clientId })).toBe(false);
        expect(await forwarded({ azp: null, aud: clientId })).toBe(false);
        expect(await forwarded({ azp: 12345, aud: clientId })).toBe(false);
    });

    test('the logout control ends the provider session too', async ({ page, request }) => {
        test.skip(!(await oidcIsEnabled(request)), 'Zitadel is not configured in this environment');
        await page.goto('/');
        const logoutBtn = page.locator('#logoutBtn');
        await expect(logoutBtn).toHaveJSProperty('tagName', 'A');
        expect(await logoutBtn.getAttribute('href')).toContain('/auth/logout.php');
    });
});
