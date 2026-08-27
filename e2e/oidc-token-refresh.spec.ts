import { test, expect } from '@playwright/test';

/**
 * A session must be renewable by the same mechanism that established it.
 *
 * `assets/js/auth.js` consulted `oidcEnabled` in exactly one place — the identity endpoint — while
 * `_doRefreshToken()` always called the API's legacy HS256 `/auth/refresh`. That endpoint knows nothing
 * about a Zitadel session and correctly answers 400, so an OIDC session had no renewal path at all: it
 * expired at the access token's lifetime and the user was silently logged out. Issue #93.
 *
 * Two properties are pinned here, and the second matters as much as the first: renewal must be *tried*
 * against the right endpoint, and a failure to reach it must not be mistaken for a verdict on the
 * session. The auto-refresh timer runs every minute over the last five before expiry, so a transient
 * fault has several chances to resolve — but only if it is not treated as the session ending.
 */

/** Drive `Auth` in the page, with the refresh endpoint stubbed to a given status. */
const refreshAgainst = async (
    page: import('@playwright/test').Page,
    status: number,
    body: Record<string, unknown>
) => {
    // Matches both shapes the endpoint can take — same-origin `/auth/refresh.php` under OIDC, the API's
    // `/auth/refresh` otherwise — so this helper does not care how the deployment is configured.
    await page.route('**/auth/refresh*', (route) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    );
    return page.evaluate(async () => {
        const { Auth } = await import('/assets/js/auth.js' as never) as { Auth: Record<string, never> };
        const auth = Auth as unknown as {
            updateAuthCache(): Promise<unknown>;
            isAuthenticated(): boolean;
            refreshToken(): Promise<boolean>;
        };
        await auth.updateAuthCache();
        const before = auth.isAuthenticated();
        let thrownStatus: number | null = null;
        let expired = false;
        document.addEventListener('auth:session-expired', () => { expired = true; }, { once: true });
        try {
            await auth.refreshToken();
        } catch (err) {
            thrownStatus = (err as { status?: number }).status ?? null;
        }
        return { before, thrownStatus, expired, after: auth.isAuthenticated() };
    });
};

test('the refresh endpoint refuses GET, so a cross-site link cannot force a rotation', async ({ request }) => {
    // The auth cookies are SameSite=Lax: withheld from a cross-site POST, but sent on a cross-site
    // top-level GET navigation. Accepting GET would therefore let a third-party page force a token
    // rotation in the victim's browser just by linking here. Asserted unconditionally because the method
    // gate runs ahead of the OIDC-configured check, so it holds on a deployment with no Zitadel too.
    const res = await request.get('/auth/refresh.php');
    expect(res.status()).toBe(405);
    expect(res.headers()['allow']).toBe('POST');
});

test.describe('with no session at all', () => {
    // The default storage state carries the fixture user's cookies, `request` included — so without
    // this the POST below arrives *with* a `litcal_refresh_token` and the provider refuses it on its
    // merits (`refresh_rejected`), which is a different fact from the one this test is about.
    test.use({ storageState: { cookies: [], origins: [] } });

    test('a POST is refused, and says which kind of refusal it is', async ({ page, request }) => {
        await page.goto('/');
        const oidcEnabled = await page.evaluate(() => Boolean(window.LitCalConfig?.oidcEnabled));

        const res = await request.post('/auth/refresh.php');
        expect(res.ok()).toBe(false);
        const body = await res.json() as { error?: string };

        if (oidcEnabled) {
            // No refresh cookie: the session is over and the client should stop retrying.
            expect(res.status()).toBe(401);
            expect(body.error).toBe('no_refresh_token');
        } else {
            // No Zitadel on this deployment. Not reported as a failed refresh — the client should
            // never have asked us, and the legacy endpoint is the only one there is.
            expect(res.status()).toBe(404);
            expect(body.error).toBe('oidc_not_configured');
        }
    });
});

test('renewal is attempted against the endpoint that matches the session kind', async ({ page }) => {
    const requested: string[] = [];
    await page.route('**/auth/refresh*', (route) => {
        requested.push(new URL(route.request().url()).pathname);
        return route.fulfill({ status: 502, contentType: 'application/json', body: '{}' });
    });
    await page.goto('/');

    // Derived, not written down: the API base path is deployment configuration (`/api/dev` on the live
    // host, something else locally and in CI), and hardcoding it here would make this test assert the
    // environment rather than the branch.
    const legacyPath = await page.evaluate(async () => {
        const { getBaseUrl } = await import('/assets/js/auth.js' as never) as { getBaseUrl(): string };
        return new URL(`${getBaseUrl()}/auth/refresh`).pathname;
    });

    for (const oidcEnabled of [true, false]) {
        requested.length = 0;
        await page.evaluate(async (flag) => {
            // Replaced, not mutated: `layout/footer.php` emits this object through `Object.freeze()`,
            // so assigning to a property of it silently does nothing and the branch under test never
            // flips. The binding on `window` is itself writable, which is what makes this work.
            window.LitCalConfig = Object.freeze({ ...window.LitCalConfig, oidcEnabled: flag });
            const { Auth } = await import('/assets/js/auth.js' as never) as { Auth: Record<string, never> };
            try {
                await (Auth as unknown as { refreshToken(): Promise<boolean> }).refreshToken();
            } catch {
                // The 502 is deliberate; this test is about which URL was asked, not the outcome.
            }
        }, oidcEnabled);

        // Same-origin under OIDC, the API's own path otherwise. The bug was that this was the API's
        // path in *both* cases, so a Zitadel session was renewed against a service that had never
        // heard of it.
        expect(requested, `oidcEnabled=${oidcEnabled}`).toEqual(
            oidcEnabled ? ['/auth/refresh.php'] : [legacyPath]
        );
    }
});

test.describe('a failure that settles the question, and one that does not', () => {
    test('an unreachable provider leaves the session alone and retries later', async ({ page }) => {
        await page.goto('/');
        const result = await refreshAgainst(page, 502, { error: 'provider_unreachable' });

        expect(result.before, 'the fixture user should start authenticated').toBe(true);
        expect(result.thrownStatus).toBe(502);
        // The whole point. This used to clear on *any* thrown error, so one failed DNS lookup discarded
        // a session that was still valid with minutes left to retry in.
        expect(result.after, 'a transient failure must not end the session').toBe(true);
        expect(result.expired, 'and must not announce it as expired').toBe(false);
    });

    test('a refusal ends the session', async ({ page }) => {
        await page.goto('/');
        const result = await refreshAgainst(page, 401, { error: 'refresh_rejected' });

        expect(result.before).toBe(true);
        expect(result.thrownStatus).toBe(401);
        expect(result.after, 'a refused token means the session is over').toBe(false);
    });

    test('the legacy endpoint says 400 where ours says 401, and both must count', async ({ page }) => {
        // Not a hypothetical: the API's legacy HS256 endpoint answers 400 for a dead refresh token —
        // it is what issue #93 was reported from. Testing for 401 alone would leave every non-Zitadel
        // deployment retrying a session that had already ended, which is why the predicate is a range.
        await page.goto('/');
        const result = await refreshAgainst(page, 400, { message: 'Invalid refresh token' });

        expect(result.before).toBe(true);
        expect(result.thrownStatus).toBe(400);
        expect(result.after, '400 is as final as 401').toBe(false);
    });
});
