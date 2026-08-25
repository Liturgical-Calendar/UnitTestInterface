# UTI OIDC migration: Zitadel login for the test interface

Date: 2026-08-25
Status: approved

## Problem

`components/login-modal.php` authenticates against the API's `POST /auth/login`, which calls
`User::authenticate($username, $password)` against the API's **own** user table. Zitadel is not involved.
Meanwhile LiturgicalCalendarFrontend has moved to Zitadel OIDC (`src/OidcClient.php` plus
`auth/{login,callback,logout,me,refresh}.php`), and the API validates Zitadel tokens through
`src/Http/Middleware/OidcAuthMiddleware.php`.

So UTI is the last component still on the pre-Zitadel mechanism. Two consequences follow, and the second
is the sharper one:

- Clicking "Login" on a runner page opens a username/password dialog instead of Zitadel's login UI.
- **A user who logs in on the Frontend still reads as logged out in UTI.** Cookies ignore port, so the
  Frontend's `litcal_access_token` (a Zitadel access token, set by its `auth/callback.php:110`) already
  reaches UTI — but `src/JwtAuth.php` only does `JWT::decode($token, new Key($secret, HS256))` and
  requires `type === 'access'`, so a Zitadel RS256 token fails to decode and the user appears anonymous.

## What UTI actually needs — the sizing question, answered

The open question from the previous session was whether to duplicate the Frontend's client, extract it to
a shared Composer package, or delegate. Measured rather than guessed:

`src/OidcClient.php` is 871 lines across 20 public methods. UTI needs roughly a quarter of them —
discovery, PKCE, the authorization URL, the code exchange, the logout URL. It needs **none** of
`validateIdToken`, `validateToken`, `getUserInfo`, `extractRolesFromToken`, `extractUserFromIdToken`,
`getIdTokenExpiry`, or the `CachedKeySet` JWKS machinery behind them.

The reason is the decisive architectural finding of this investigation:

> **The API is already the enforcement point, and it accepts the cookie.**
> `OidcAuthMiddleware::extractToken()` reads `litcal_access_token` from the **cookie** first (falling back
> to a Bearer header), then runs `tryOidcValidation()` — RS256 against Zitadel's JWKS — and
> `tryJwtFallback()` for a legacy HS256 token. Verified live: `GET /auth/me` with that cookie returns
> `200 {authenticated, exp, roles, username}`, and `401` without it.

So UTI does not need to validate anything. It needs to *obtain* a token and then *ask* the API who the
caller is. That removes the entire cryptographic surface — JWKS fetching, key caching, audience and
signature checks — from this repository, and it removes `JWT_SECRET` from UTI's configuration.

It also delivers the legacy fallback for free: because the API's middleware tries Zitadel and then legacy,
**UTI stops caring which kind of token it is holding**. That is a better fallback than anything this
repository could maintain itself, and it needs no test coverage here.

**Decision: build a small client inside UTI (~250 lines), do not extract a package.** The quarter UTI needs
is the simple, stable quarter; the complex security-sensitive parts are exactly the ones it delegates.
Extracting a package to share PKCE and a discovery fetch would be poor value, and would couple two repos'
release cycles for it. The namespace is chosen so extraction stays mechanical if a third consumer appears.

## Design

### Part 1 — UTI becomes an OIDC client in its own right

Its own Zitadel registration, so UTI can be served from a different host than the Frontend without relying
on cookie-domain sharing. **That client already exists**: `scripts/setup-zitadel.sh` creates a
`LiturgicalCalendar Tests` app with redirect URI `http://localhost:${TESTS_PORT}/auth/callback.php`, and
`projections.apps7` confirms it in the running instance. No manual registration is needed.

New `src/Oidc/Client.php`:

| Responsibility           | Notes                                                                  |
|--------------------------|------------------------------------------------------------------------|
| Config from environment  | `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`, optional `ZITADEL_INTERNAL_URL` |
| Discovery document       | Fetched once per request, over `ZITADEL_INTERNAL_URL` when set         |
| PKCE + `state` + `nonce` | Generated per attempt, held in the PHP session                         |
| Authorization URL        | `response_type=code`, `code_challenge_method=S256`                     |
| Code exchange            | Back-channel POST to the token endpoint                                |
| Logout URL               | RP-initiated logout with `id_token_hint`                               |

`ZITADEL_INTERNAL_URL` matters because Zitadel 404s any request whose `Host` does not match its configured
external domain; the API solves this with `ZitadelHostHeader::deriveFromIssuer()`, and this client does the
same when it talks over the internal address.

New `auth/login.php`, `auth/callback.php`, `auth/logout.php`, modelled on the Frontend's but without the
role-extraction and access-request branches. `login.php` accepts `return_to`, validated same-origin.

### Part 2 — identity is delegated to the API

`src/JwtAuth.php` keeps its **exact public surface** — `init`, `isConfigured`, `getToken`, `verifyToken`,
`isAuthenticated`, `getUsername`, `getRoles`, `hasRole`, `getExpiry`, `clearCache`. Only the internals
change: instead of decoding locally, it forwards `litcal_access_token` to `GET {api}/auth/me` and caches
the answer for the request. All three call sites — `layout/head.php`, `layout/topnavbar.php`,
`results.php` — are untouched, which makes this a narrow, reviewable seam.

There is deliberately **no local-decode fallback** for an unreachable API. UTI is a test interface *for*
that API; if it is down, UTI has nothing useful to do, and a second validation path that could disagree
with the first is the failure mode this whole line of work has been eliminating.

Resolving the API's base URL server-side honours `API_INTERNAL_URL`, matching `api-proxy.php`'s existing,
already-validated treatment (scheme and host only; no credentials, query or fragment).

### Part 3 — the login control

The navbar button redirects to `/auth/login.php?return_to=<current page>` when OIDC is configured
(`ZITADEL_ISSUER` and `ZITADEL_CLIENT_ID` both set), mirroring the API's own `isOidcConfigured()` test.
When it is not configured, the button keeps its current behaviour and opens the legacy modal.

This is the fallback the owner asked for, in the shape that costs least: one visible control, whose
destination depends on whether Zitadel is available. Nothing needs to be tested or debugged twice.

## Testing

The e2e suite keeps authenticating through `POST /auth/login` in `auth.setup.ts`. That path still works —
the API supports it and UTI now delegates to the API — so **no Zitadel dependency enters UTI's CI**, which
is what makes this migration safe to land without reworking the whole harness.

New coverage in `e2e/oidc-login.spec.ts`:

- with OIDC configured, the navbar button targets `/auth/login.php`, and that endpoint 302s to the
  configured issuer's `authorization_endpoint` carrying `code_challenge_method=S256`;
- with OIDC unconfigured, the button still opens `#loginModal`;
- `auth/callback.php` rejects a mismatched `state` and a missing `code` without setting a cookie;
- `JwtAuth` reports authenticated for a session established the legacy way, proving delegation covers both
  token types.

## Out of scope

Reworking `auth.setup.ts` to drive Zitadel; removing `POST /auth/login` from the API; role-based UI gating
in UTI (it has no per-role surfaces today — `results.php` gates on authentication alone).
