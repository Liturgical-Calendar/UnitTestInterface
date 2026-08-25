# UTI OIDC Login Implementation Plan

**Goal:** Give UTI its own Zitadel OIDC login, and delegate identity checks to the API so no token
validation happens in this repository.

**Architecture:** A small `src/Oidc/Client.php` (discovery, PKCE, authorize URL, code exchange, logout URL)
plus `auth/{login,callback,logout}.php`. `src/JwtAuth.php` keeps its public surface but resolves identity
through `GET {api}/auth/me`, which already accepts the `litcal_access_token` cookie and tries Zitadel then
legacy — so the legacy fallback costs nothing here.

**Spec:** `docs/superpowers/specs/2026-08-25-uti-oidc-migration-design.md`

> **Note on depth:** this plan is deliberately compact. It is being executed in the same session that wrote
> it, so it records sequence, seams and test strategy rather than transcribing code a context-less engineer
> would need. The spec carries the reasoning.

## Global Constraints

- PHP `>=8.1` (do not raise). PSR-12 via `phpcs.xml`, 200-char lines. `composer lint` clean for touched files.
- Markdown: 180 chars, aligned tables (MD060). `composer lint:md` clean.
- Never `--no-verify`. All user-facing strings through `_()`; do not hand-edit `i18n/litcal.pot`.
- No new Composer dependencies: `guzzlehttp/guzzle` and `vlucas/phpdotenv` are already present.
- The e2e suite must keep authenticating via `POST /auth/login`; **no Zitadel dependency may enter UTI CI**.
- Card-class vocabulary rules (CLAUDE.md §CSS Class Slugification) are untouched.

---

### Task 1: `src/ApiBase.php` — resolve the API base URL server-side

**Files:** create `src/ApiBase.php`; test `e2e/oidc-login.spec.ts` (indirectly, via Task 3).

**Produces:** `ApiBase::resolve(): string` — an absolute base URL with no trailing slash.

Honours `API_INTERNAL_URL` when set, validated exactly as `api-proxy.php` validates it (http/https scheme,
non-empty host, and no user/pass/query/fragment); otherwise composes from `API_PROTOCOL`/`API_HOST`/
`API_PORT`/`API_BASE_PATH`. Throws `RuntimeException` on a malformed `API_INTERNAL_URL` rather than
silently falling back — quietly using an upstream the operator did not configure is how a cookie reaches
somewhere it was not meant to.

**Steps:** write the class → `vendor/bin/phpcs src/ApiBase.php` → commit.

---

### Task 2: `src/Oidc/Client.php` — the OIDC client

**Files:** create `src/Oidc/Client.php`.

**Produces:**

```php
Client::isConfigured(): bool                  // ZITADEL_ISSUER && ZITADEL_CLIENT_ID both non-empty
Client::fromEnv(string $redirectUri): self
$c->getAuthorizationUrl(string $state, string $nonce, string $codeChallenge, array $scopes = []): string
$c->exchangeCode(string $code, string $codeVerifier): array   // token endpoint response
$c->getLogoutUrl(?string $idTokenHint, ?string $postLogoutRedirectUri): string
Client::generateVerifier(): string
Client::challengeFor(string $verifier): string                // S256, base64url, unpadded
```

Discovery is fetched once per instance. When `ZITADEL_INTERNAL_URL` is set, back-channel calls go there
with a `Host` header derived from the issuer — Zitadel 404s a request whose Host does not match its
external domain. Browser-facing URLs (`authorization_endpoint`, `end_session_endpoint`) always come from
the issuer-facing discovery values, never rewritten to the internal address.

**Steps:** write → `phpcs` → a throwaway script asserting `challengeFor()` matches a known RFC 7636 vector
and that `getAuthorizationUrl()` emits `code_challenge_method=S256` → commit.

---

### Task 3: `JwtAuth` delegates to `GET /auth/me`

**Files:** modify `src/JwtAuth.php`. Call sites (`layout/head.php`, `layout/topnavbar.php`, `results.php`)
must **not** change — that is the check that the seam held.

Public surface stays identical. Internals: read the cookie, `GET {ApiBase::resolve()}/auth/me` forwarding
it, cache the decoded body statically for the request. `isConfigured()` becomes "an API base is resolvable".
`verifyToken()` returns an object shaped like the old payload (`username`, `roles`, `exp`) so
`getUsername()`/`getRoles()`/`getExpiry()` are unchanged. A non-200, a transport error, or a body without
`authenticated: true` means unauthenticated. No local decode, no `JWT_SECRET`.

**Steps:** failing e2e first (authenticated page load still reports `isAuthenticated=true` — it will fail
once local decoding is removed if delegation is wrong) → implement → `e2e/past-runs-auth.spec.ts` must stay
green, since it already asserts both auth states across both runner pages → commit.

---

### Task 4: `auth/login.php`, `auth/callback.php`, `auth/logout.php`

**Files:** create all three.

- `login.php` — 503 JSON when `Client::isConfigured()` is false. Starts a session, mints verifier/state/
  nonce, stores them, validates `return_to` as same-origin (reject absolute URLs to other hosts), redirects.
- `callback.php` — requires `code` and a `state` matching the session; exchanges the code with the stored
  verifier; sets `litcal_access_token` (and refresh/id when returned) as HttpOnly cookies with the same
  names and attributes the API uses; clears the PKCE session keys; redirects to the stored `return_to`.
  Every failure path redirects to `/` with an `error` query parameter and sets no cookie.
- `logout.php` — clears the cookies, then redirects to the RP-initiated logout URL when an id token is held,
  otherwise to `/`.

**Steps:** write → `phpcs` → curl `auth/login.php` and assert a 302 to the issuer with `code_challenge_method=S256`;
curl `auth/callback.php?state=bogus` and assert no `Set-Cookie` → commit.

---

### Task 5: the login control chooses its destination

**Files:** modify `components/login-modal.php`, `layout/topnavbar.php`.

`layout/head.php` already resolves `$isAuthenticated`; add `$oidcEnabled = Oidc\Client::isConfigured()`
beside it and publish it in `layout/footer.php`'s `LitCalConfig`. The navbar button becomes a link to
`/auth/login.php?return_to=…` when `$oidcEnabled`, and keeps its modal-opening behaviour otherwise. The
logout button posts to `/auth/logout.php` when OIDC is on.

**Steps:** failing e2e (button targets `/auth/login.php`) → implement → commit.

---

### Task 6: e2e coverage

**Files:** create `e2e/oidc-login.spec.ts`.

Covers: the button's target under both configurations; `auth/login.php` redirecting to the issuer with
PKCE; `auth/callback.php` refusing a bad `state` and a missing `code` without setting a cookie; and a
legacy-established session still reading as authenticated, which is what proves delegation spans both
token types.

**Steps:** write → run → commit.

---

### Task 7: documentation and full verification

`CLAUDE.md` §Authentication rewritten: OIDC is the login path, identity is delegated, the legacy modal is
the unconfigured fallback. `.env.example` gains `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID`,
`ZITADEL_INTERNAL_URL`, `API_INTERNAL_URL` with the same warnings the Frontend carries.

Then: `vendor/bin/phpcs`, `yarn lint:js`, `yarn typecheck`, `composer lint:md`, the **full** Playwright
suite, and a manual browser check of the real Zitadel round trip.
