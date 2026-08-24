# UTI Login and admin.php Retirement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Give `index.php` and `resources.php` a working login button so Past Runs can be saved and replayed, and retire `admin.php` from the interface.

**Architecture:** The authentication UI is moved out of `admin.php` and into the shared layout —
`layout/head.php` resolves `$isAuthenticated` for every page, `layout/footer.php` emits
`components/login-modal.php`, and `layout/topnavbar.php` stops gating the login button on a per-page constant.
The runner pages then react to the `auth:login` / `auth:logout` events the modal already dispatches, and
distinguish a `401` save from a genuine save failure. `admin.php` and its exclusive assets move under
`archive/`.

**Tech Stack:** PHP 8.1+ (procedural includes, gettext), native ES6 modules, Bootstrap 5, Playwright e2e, PHP_CodeSniffer (PSR-12), markdownlint.

**Spec:** `docs/superpowers/specs/2026-08-24-uti-auth-and-admin-retirement-design.md`

## Global Constraints

- PHP floor is `>=8.1` as declared in `composer.json`; do not raise it.
- PSR-12 via `phpcs.xml`, 200-character line limit. `composer lint` must report zero **errors** for touched
  files (pre-existing warnings in `admin.php`/`index.php`/`resources.php` are acceptable; the 154 errors in
  `node_modules/flatted/php/flatted.php` are pre-existing and out of scope).
- Markdown: 180-character lines, tables vertically aligned (MD060), fenced blocks with language specifiers. `composer lint:md` must be clean.
- Never use `git commit --no-verify`; CaptainHook pre-commit hooks are mandatory.
- All user-facing strings pass through `_()` so `xgettext` extracts them. Do **not** hand-edit `i18n/litcal.pot` — CI regenerates and commits it.
- The API returns RFC 3339 dates; format with `timeZone: 'UTC'`.
- Card-class vocabulary rules from `CLAUDE.md` (§CSS Class Slugification) are untouched by this plan — do not rename any `step-*` class.

---

### Task 1: Resolve `$isAuthenticated` for every page

**Files:**

- Modify: `layout/head.php:1-27` (add JWT init after the dotenv block)
- Test: `e2e/past-runs-auth.spec.ts` (create)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: a PHP variable `$isAuthenticated` (bool), set before `layout/topnavbar.php` and
  `layout/footer.php` are included by any page. `layout/footer.php` already publishes it as
  `window.LitCalConfig.isAuthenticated`.

- [ ] **Step 1: Write the failing test**

Create `e2e/past-runs-auth.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

// Every configured Playwright project runs with `storageState: 'e2e/.auth/user.json'`,
// so the logged-out case has to opt out of it explicitly.
test.describe('logged out', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    for (const page of ['/', '/resources.php']) {
        test(`${page} publishes isAuthenticated=false`, async ({ page: p }) => {
            await p.goto(page);
            await p.waitForLoadState('domcontentloaded');
            const isAuth = await p.evaluate(() => window.LitCalConfig.isAuthenticated);
            expect(isAuth).toBe(false);
        });
    }
});

test.describe('logged in', () => {
    for (const page of ['/', '/resources.php']) {
        test(`${page} publishes isAuthenticated=true`, async ({ page: p }) => {
            await p.goto(page);
            await p.waitForLoadState('domcontentloaded');
            const isAuth = await p.evaluate(() => window.LitCalConfig.isAuthenticated);
            expect(isAuth).toBe(true);
        });
    }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: the "logged in" cases FAIL with `expect(received).toBe(true)` / received `false` — `index.php` never sets `$isAuthenticated`, so `footer.php` falls back to `false`.

- [ ] **Step 3: Write minimal implementation**

In `layout/head.php`, add the `JwtAuth` import beside the existing `use` statements:

```php
use Dotenv\Dotenv;
use LiturgicalCalendar\UnitTestInterface\I18n;
use LiturgicalCalendar\UnitTestInterface\JwtAuth;
```

and immediately after the `$dotenv->ifPresent(...)` validation block (after the `// API_BASE_PATH can be empty for local development` comment), add:

```php
// Authentication is a property of every page, not of admin.php. `topnavbar.php` and
// `footer.php` both read `$isAuthenticated` when it is set; setting it here is what makes
// the login button and the `data-requires-auth` regions render correctly on first paint
// instead of flashing the logged-out state until initPermissionUI() catches up.
JwtAuth::init();
$isAuthenticated = JwtAuth::isAuthenticated();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify PHP lint is clean**

Run: `vendor/bin/phpcs layout/head.php`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add layout/head.php e2e/past-runs-auth.spec.ts
git commit -m "feat(auth): resolve \$isAuthenticated for every page in head.php"
```

---

### Task 2: Emit the login modal from the shared footer

**Files:**

- Modify: `layout/footer.php` (include the modal after the Bootstrap bundle script, before the page module script)
- Modify: `layout/topnavbar.php:102`, `:110`, `:115` (drop the `HAS_LOGIN_MODAL` gate)
- Modify: `admin.php:143-144` (delete the `define('HAS_LOGIN_MODAL', true);` and its comment)
- Test: `e2e/past-runs-auth.spec.ts` (extend)

**Interfaces:**

- Consumes: `$isAuthenticated` from Task 1.
- Produces: on every page — the `#loginModal` element, `#loginBtn` / `#userMenu` navbar controls,
  `window.Auth`, `window.showLoginModal()`, `window.initPermissionUI()`, and the `auth:login` /
  `auth:logout` `CustomEvent`s dispatched on `document`.

- [ ] **Step 1: Write the failing test**

Append to `e2e/past-runs-auth.spec.ts`, inside the existing `test.describe('logged out', …)` block:

```typescript
    test('the runner page offers a login button', async ({ page: p }) => {
        await p.goto('/');
        await expect(p.locator('#loginBtn')).toBeVisible();
        await expect(p.locator('#loginModal')).toHaveCount(1);
        await expect(p.locator('#userMenu')).toBeHidden();
    });
```

and inside `test.describe('logged in', …)`:

```typescript
    test('the runner page offers the user menu, not a login button', async ({ page: p }) => {
        await p.goto('/');
        await expect(p.locator('#userMenu')).toBeVisible();
        await expect(p.locator('#loginBtn')).toBeHidden();
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: both new tests FAIL — `#loginModal` has count 0 and `#loginBtn` is hidden, because
`components/login-modal.php` is included only by `admin.php` and the navbar gates on `HAS_LOGIN_MODAL`.

- [ ] **Step 3: Write minimal implementation**

In `layout/footer.php`, immediately after the Font Awesome `<script>` tag and before the `<!-- Global configuration ... -->` block, insert:

```php
<?php
// The login modal ships on every page, not just admin.php. It must follow the Bootstrap
// bundle above (its script constructs `bootstrap.Modal`) and precede the page's own module
// script below (which reads `window.Auth`). `include_once` keeps a page that includes it
// directly from emitting it twice.
include_once('components/login-modal.php');
?>
```

In `layout/topnavbar.php`, delete line 102 and its preceding comment:

```php
                // Only show login/user UI on pages that include the login modal (admin.php)
                $hasLoginModal = defined('HAS_LOGIN_MODAL') && HAS_LOGIN_MODAL === true;
```

then change the two gated `<li>` elements to depend on auth state alone:

```php
                <li class="nav-item me-2 <?php echo $navbarIsAuth ? 'd-none' : ''; ?>" data-requires-no-auth>
```

```php
                <li class="nav-item me-2 <?php echo $navbarIsAuth ? '' : 'd-none'; ?>" data-requires-auth>
```

In `admin.php`, delete:

```php
// Signal that this page has the login modal (for topnavbar.php)
define('HAS_LOGIN_MODAL', true);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: PASS (6 tests).

- [ ] **Step 5: Confirm no page double-emits the modal**

Run: `curl -s http://localhost:3003/ | grep -c 'id="loginModal"'`
Expected: `1`.

- [ ] **Step 6: Verify PHP lint is clean**

Run: `vendor/bin/phpcs layout/footer.php layout/topnavbar.php`
Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add layout/footer.php layout/topnavbar.php admin.php
git commit -m "feat(auth): emit the login modal from the shared footer"
```

---

### Task 3: Gate the Past Runs column server-side

**Files:**

- Modify: `index.php:117` (the `data-requires-auth` wrapper)
- Modify: `resources.php:114` (the `data-requires-auth` wrapper)
- Test: `e2e/past-runs-auth.spec.ts` (extend)

**Interfaces:**

- Consumes: `$isAuthenticated` from Task 1; `initPermissionUI()` from Task 2.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Write the failing test**

Add to `test.describe('logged out', …)`:

```typescript
    test('Past Runs is hidden with no flash of visibility', async ({ page: p }) => {
        await p.goto('/');
        // Asserted before any network settles: a server-rendered `d-none` is already in the
        // HTML, whereas a JS-applied one would briefly fail here.
        await expect(p.locator('#pastRunsSelect')).toBeHidden();
    });
```

Add to `test.describe('logged in', …)`:

```typescript
    test('Past Runs is visible', async ({ page: p }) => {
        await p.goto('/');
        await expect(p.locator('#pastRunsSelect')).toBeVisible();
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: the logged-out test FAILS — the column has no `d-none` in the markup, so it is visible until `initPermissionUI()` hides it.

- [ ] **Step 3: Write minimal implementation**

In both `index.php` and `resources.php`, change the Past Runs wrapper from:

```php
                <div class="col-12 col-md-4 col-lg-2" data-requires-auth>
```

to:

```php
                <div class="col-12 col-md-4 col-lg-2 <?php echo $isAuthenticated ? '' : 'd-none'; ?>" data-requires-auth>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add index.php resources.php e2e/past-runs-auth.spec.ts
git commit -m "feat(runners): server-render the Past Runs auth gate"
```

---

### Task 4: Distinguish a declined save from a failed one

**Files:**

- Modify: `assets/js/testResults.js:137-149` (`postRunResults`)
- Modify: `index.php` (add the `#results-save-unauthenticated` toast after `#results-save-failed`, currently line 56-63)
- Modify: `resources.php` (same toast, after its `#results-save-failed` at line 56-63)
- Modify: `assets/js/index.js:1020-1025` (the `postRunResults` call site)
- Modify: `assets/js/resources.js:1350-1355` (the `postRunResults` call site)
- Test: `e2e/past-runs-auth.spec.ts` (extend)

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `postRunResults(payload)` still returns `Promise<object>`, but its rejection is now an
  `Error` carrying a numeric `status` property equal to the HTTP status. Later tasks and both
  runners branch on `err.status === 401`.

- [ ] **Step 1: Write the failing test**

Add to `test.describe('logged out', …)` in `e2e/past-runs-auth.spec.ts`:

```typescript
    test('a declined save reports "log in to save", not a failure', async ({ page: p }) => {
        await p.goto('/');
        await p.waitForLoadState('domcontentloaded');
        const toastId = await p.evaluate(async () => {
            const { postRunResults } = await import('/assets/js/testResults.js');
            try {
                await postRunResults({ schemaVersion: 1, runType: 'calendars' });
                return 'resolved';
            } catch (err) {
                return err.status === 401 ? 'results-save-unauthenticated' : 'results-save-failed';
            }
        });
        expect(toastId).toBe('results-save-unauthenticated');
        await expect(p.locator('#results-save-unauthenticated')).toHaveCount(1);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: FAIL — `err.status` is `undefined` (the error carries only a message string), so the evaluate returns `results-save-failed`; and the toast element does not exist.

- [ ] **Step 3: Write minimal implementation**

In `assets/js/testResults.js`, replace the body of `postRunResults`:

```javascript
/**
 * POST a completed run to the server.
 *
 * A rejection carries the HTTP status on `err.status`. Callers need it to tell a declined
 * save (401 — nobody is logged in, and the run itself was fine) from a genuine failure;
 * parsing it back out of the message string would be the fragile alternative.
 */
export const postRunResults = async (payload) => {
    const res = await fetch('results.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const err = new Error(`Save failed: ${res.status}`);
        err.status = res.status;
        throw err;
    }
    return res.json();
};
```

In `index.php` and `resources.php`, insert this toast immediately after the closing `</div>` of the `#results-save-failed` toast:

```php
            <div class="toast align-items-center text-white bg-secondary border-0 p-3 shadow" aria-live="assertive" role="alert" id="results-save-unauthenticated">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-circle-info fa-fw"></i> <?php echo _("Run complete. Log in to save it to Past Runs."); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
```

In `assets/js/index.js`, replace the `postRunResults( buildCalendarsPayload() )` chain:

```javascript
            postRunResults( buildCalendarsPayload() )
                .then( () => safeToastShow('#results-saved') )
                .catch( ( err ) => {
                    // 401 is not a failure of the run or of the save path: nobody is logged in,
                    // and results.php declines to store an anonymous run. Saying "could not save"
                    // there reads as a defect in a run that actually succeeded.
                    if ( 401 === err.status ) {
                        safeToastShow('#results-save-unauthenticated');
                        return;
                    }
                    console.error( 'Failed to persist run results', err );
                    safeToastShow('#results-save-failed');
                });
```

In `assets/js/resources.js`, apply the identical change to its `postRunResults( buildResourcesPayload() )` chain (same `.then`/`.catch` shape, same toast ids).

- [ ] **Step 4: Run test to verify it passes**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: PASS (9 tests).

- [ ] **Step 5: Verify the existing results specs still pass**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/results-endpoint.spec.ts e2e/results-replay.spec.ts e2e/results-replay-resources.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/js/testResults.js assets/js/index.js assets/js/resources.js index.php resources.php e2e/past-runs-auth.spec.ts
git commit -m "feat(runners): tell a declined save apart from a failed one"
```

---

### Task 5: Refresh Past Runs on login and clear it on logout

**Files:**

- Modify: `assets/js/index.js:2108-2128` (`pastRunsSelect`, `loadPastRuns`) and its bootstrap block ending at `:2242`
- Modify: `assets/js/resources.js:1536-1554` (`pastRunsSelect`, `loadPastRuns`) and its bootstrap block ending at `:1606`
- Test: `e2e/past-runs-auth.spec.ts` (extend)

**Interfaces:**

- Consumes: the `auth:login` / `auth:logout` events from Task 2.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing test**

Add a new top-level describe to `e2e/past-runs-auth.spec.ts`:

```typescript
test.describe('logged out then logged in', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('auth:login repopulates Past Runs without a reload', async ({ page: p }) => {
        await p.goto('/');
        await p.waitForLoadState('domcontentloaded');
        // Logged out: results.php answers 401, so only the "— Live —" placeholder is present.
        await expect(p.locator('#pastRunsSelect option')).toHaveCount(1);

        // Stub the endpoint rather than logging in for real: the subject here is that the
        // runner reacts to the event, not that the API authenticates.
        await p.route('**/results.php', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        file: 'calendars-2026-01-01T00-00-00Z.json',
                        runType: 'calendars',
                        timestamp: '2026-01-01T00:00:00Z',
                        calendar: 'VA',
                        counts: { successful: 3, failed: 0 },
                    },
                ]),
            })
        );
        await p.evaluate(() => document.dispatchEvent(new CustomEvent('auth:login')));
        await expect(p.locator('#pastRunsSelect option')).toHaveCount(2);

        await p.evaluate(() => document.dispatchEvent(new CustomEvent('auth:logout')));
        await expect(p.locator('#pastRunsSelect option')).toHaveCount(1);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: FAIL at the second assertion — the option count stays 1, because `loadPastRuns()` runs once at bootstrap and nothing listens for `auth:login`.

- [ ] **Step 3: Write minimal implementation**

In `assets/js/index.js`, replace the `loadPastRuns` definition with a clear-then-load pair:

```javascript
/**
 * Drop every stored-run option, keeping the "— Live —" placeholder that is the select's
 * first child in the server-rendered markup.
 */
const clearPastRuns = () => {
    if ( !pastRunsSelect ) {
        return;
    }
    pastRunsSelect.value = '';
    while ( pastRunsSelect.options.length > 1 ) {
        pastRunsSelect.remove( 1 );
    }
};

/**
 * Populate the past-runs dropdown from the server (calendars runs only).
 *
 * A rejection is expected rather than exceptional: results.php answers 401 to anyone who is
 * not logged in. The HTTP status is the authority on that, not `Auth`'s cached state, which
 * is populated asynchronously and may not have settled when this first runs.
 */
const loadPastRuns = async () => {
    if ( !pastRunsSelect ) {
        return;
    }
    clearPastRuns();
    try {
        const summaries = await fetchRunSummaries( 'calendars' );
        for ( const r of summaries ) {
            const opt = document.createElement('option');
            opt.value = r.file;
            const dt = new Intl.DateTimeFormat(locale, IntlDTOptions).format(new Date(r.timestamp));
            opt.textContent = `${dt} · ${r.calendar} · ✓${r.counts?.successful ?? 0} ✗${r.counts?.failed ?? 0}`;
            pastRunsSelect.appendChild(opt);
        }
    } catch ( err ) {
        if ( 401 === err.status ) {
            return;
        }
        console.error( 'Could not load past runs', err );
    }
};
```

Then, in the same file, immediately after the existing `loadPastRuns();` call at the end of the `if ( pastRunsSelect ) { … }` bootstrap block, add:

```javascript
    // The login modal dispatches these on `document` after it has updated the navbar and the
    // `data-requires-auth` regions, so the column is already visible by the time we refill it.
    document.addEventListener( 'auth:login', () => {
        loadPastRuns();
    });
    document.addEventListener( 'auth:logout', () => {
        clearPastRuns();
    });
```

In `assets/js/resources.js`, apply the identical change, with `fetchRunSummaries( 'resources' )` in
place of `'calendars'` and the file's own option-label expression left exactly as it is.

- [ ] **Step 4: Run test to verify it passes**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: PASS (10 tests).

- [ ] **Step 5: Verify JS lint and types**

Run: `yarn lint:js && yarn typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add assets/js/index.js assets/js/resources.js e2e/past-runs-auth.spec.ts
git commit -m "feat(runners): refresh Past Runs on login, clear it on logout"
```

---

### Task 6: Archive admin.php and unlink it from navigation

**Files:**

- Move: `admin.php` → `archive/admin.php`
- Move: `assets/js/admin.js` → `archive/assets/js/admin.js`
- Move: `assets/js/AssertionsBuilder.js` → `archive/assets/js/AssertionsBuilder.js`
- Move: `components/NewTestModal.php` → `archive/components/NewTestModal.php`
- Move: `layout/sidebar.php` → `archive/layout/sidebar.php`
- Create: `archive/README.md`
- Delete: `e2e/admin.spec.ts`
- Modify: `layout/topnavbar.php:7-12` (sidebar toggle), `:104-108` (gear item)
- Modify: `index.php:4`, `resources.php:4` (drop `define('SIDEBAR', false);`)
- Modify: `layout/footer.php` (the `$pageName === 'admin'` Isotope branch)
- Modify: `e2e/auth.setup.ts` (navigate to `/` instead of `/admin.php`)
- Modify: `composer.json` (drop `liturgical-calendar/components`)
- Modify: `.github/workflows/main.yml:37` (exclude `archive/` from `xgettext`)
- Test: `e2e/past-runs-auth.spec.ts` (extend)

**Interfaces:**

- Consumes: Task 2 removed `admin.php`'s `HAS_LOGIN_MODAL` define, so nothing outside `admin.php` refers to it.
- Produces: nothing for later tasks.

- [ ] **Step 1: Write the failing test**

Add a top-level test to `e2e/past-runs-auth.spec.ts`:

```typescript
test('admin.php is unlinked from the interface', async ({ page: p }) => {
    await p.goto('/');
    await expect(p.locator('a[href*="admin.php"]')).toHaveCount(0);
    await expect(p.locator('#admin_url')).toHaveCount(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium -g "unlinked"`
Expected: FAIL — the sidebar brand, the sidebar admin entry and the navbar gear all link to `admin.php`.

- [ ] **Step 3: Move the files**

```bash
mkdir -p archive/assets/js archive/components
git mv admin.php archive/admin.php
git mv assets/js/admin.js archive/assets/js/admin.js
git mv assets/js/AssertionsBuilder.js archive/assets/js/AssertionsBuilder.js
git mv components/NewTestModal.php archive/components/NewTestModal.php
git mv layout/sidebar.php archive/layout/sidebar.php
git rm e2e/admin.spec.ts
```

- [ ] **Step 4: Write `archive/README.md`**

```markdown
# Archived: the Accuracy Tests Admin page

`admin.php` and its exclusive assets were retired from the UnitTestInterface on 2026-08-24. They are kept
here rather than deleted because the unit-test authoring workflow they implement has no replacement yet.

## What is here

| Path                                | Was                                     |
|-------------------------------------|-----------------------------------------|
| `admin.php`                         | The admin page itself                   |
| `assets/js/admin.js`                | Its page script                         |
| `assets/js/AssertionsBuilder.js`    | Test-assertion UI builder, used only by `admin.js` |
| `components/NewTestModal.php`       | Its "new test" modal                    |

## Why it was retired

The page had not rendered for some time. It dies at `admin.php:122`, where Monolog fails while writing the
"Failed to fetch…" record it is logging, so execution never reaches the page body. Underneath that sits a
`TypeError` from `CalendarSelect::hasNationalCalendarWithDioceses()` in `liturgical-calendar/components`
v3.3.1, which cannot parse the API's rite-aware `/calendars`: `addNationalCalendarWithDioceses()` indexes
`[0]` into an `array_filter` result that is empty for `CH`, because the API ships the Ambrosian diocese
`lugano_ch` under nation `CH` but no `nations/CH` calendar.

Because the page never rendered, it never emitted `components/login-modal.php` either — which is why logging
in did not work there, and why the login UI has since moved into the shared layout.

## What reviving it would require

1. A fix for `CalendarSelect::addNationalCalendarWithDioceses()` in `liturgy-components-php` (a diocese does
   not imply a national calendar), released as v4.2 or later.
2. Re-adding `liturgical-calendar/components` to `composer.json`. Note that v4.x raises the package's PHP
   floor to 8.2 against this repository's declared `>=8.1`.
3. Restoring the files to their original paths, a navigation entry in `layout/sidebar.php`, and the
   `$pageName === 'admin'` Isotope branch in `layout/footer.php`.
4. Nothing else: authentication is no longer this page's concern.
```

- [ ] **Step 5: Unlink from navigation and retire the SIDEBAR machinery**

In `layout/topnavbar.php`, delete the whole gear `<li>` (the one carrying `id="admin_url"`) and retitle its
section comment:

```php
                <!-- Section 4: Login/User menu -->
```

Still in `layout/topnavbar.php`, delete the sidebar-toggle block near the top. Both runner pages set
`SIDEBAR` to false and `admin.php` is gone, so this condition can no longer hold:

```php
        <?php if (!defined('SIDEBAR') || true === SIDEBAR) { ?>
        <!-- Sidebar Toggle (Topbar) - only visible on lg+ screens where sidebar is shown -->
        <button class="btn btn-link btn-sm d-none d-lg-inline-block sidebarToggle" id="sidebarToggle" title="<?php echo _('Toggle sidebar'); ?>">
            <i class="fas fa-table-columns"></i>
        </button>
        <?php } ?>
```

In `layout/footer.php`, delete the matching wrapper-closing branch — the divs it closes were opened by
`sidebar.php`, which no page includes any more — so that the top of the file reads:

```php
<?php
// Note: dotenv is loaded in layout/head.php, no need to reload here

include_once('layout/disclaimer.php');
?>
```

In `index.php` and `resources.php`, delete line 4 from each:

```php
define('SIDEBAR', false);
```

In `layout/footer.php`, also delete the Isotope branch:

```php
if ($pageName === 'admin') {
    echo "<script src=\"https://unpkg.com/isotope-layout@3/dist/isotope.pkgd.min.js\"></script>";
}
```

- [ ] **Step 6: Update the remaining references**

In `e2e/auth.setup.ts`, change the navigation target and its comment:

```typescript
    // Navigate to the runner page to establish the browser context. (This was admin.php until
    // that page was archived; any same-origin page works — the login below is a bare fetch.)
    await page.goto(`${frontendUrl}/`);
```

In `composer.json`, remove the `"liturgical-calendar/components": "^3.1",` line, then run `composer update --lock liturgical-calendar/components`.

In `.github/workflows/main.yml`, exclude the archive from string extraction:

```yaml
          git ls-files -z '*.php' ':!archive' | xargs -0 xgettext --from-code=UTF-8 --add-comments='translators:' --keyword="pgettext:1c,2" -o i18n/litcal.pot
```

- [ ] **Step 7: Run test to verify it passes**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test e2e/past-runs-auth.spec.ts --project=chromium`
Expected: PASS (11 tests).

- [ ] **Step 8: Verify nothing still references the moved files**

Run:

```bash
grep -rn "admin\.php\|AssertionsBuilder\|NewTestModal" \
  --include='*.php' --include='*.js' --include='*.ts' --include='*.yml' . \
  | grep -v node_modules | grep -v '^\./archive/' | grep -v vendor/
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: archive admin.php and unlink it from the interface"
```

---

### Task 7: Update the documentation

**Files:**

- Modify: `CLAUDE.md` (project structure tree, Key Files table, Component Libraries line, Authentication section)
- Test: `composer lint:md`

**Interfaces:**

- Consumes: the final state of Tasks 1-6.
- Produces: nothing.

- [ ] **Step 1: Update the project structure tree**

In `CLAUDE.md`, remove `admin.php` and `components/NewTestModal.php` and `assets/js/admin.js` /
`assets/js/AssertionsBuilder.js` from the `## Project Structure` tree, and add an `archive/` entry:

```text
├── archive/               # Retired admin.php and its exclusive assets (see archive/README.md)
```

- [ ] **Step 2: Update the Key Files table**

Remove the `admin.php` and `assets/js/AssertionsBuilder.js` rows; add:

```markdown
| `components/login-modal.php`     | Login modal + auth UI (all pages)   |
| `layout/footer.php`              | Shared scripts, import map, modal   |
```

Re-align every column of the table so it satisfies MD060.

- [ ] **Step 3: Update the Component Libraries line**

Replace:

```markdown
- **Component Libraries:** `@liturgical-calendar/components-js` (ESM, `index.php` + `resources.php`);
  liturgical-calendar/components (PHP, `admin.php` only)
```

with:

```markdown
- **Component Libraries:** `@liturgical-calendar/components-js` (ESM, `index.php` + `resources.php`).
  The PHP `liturgical-calendar/components` package was dropped when `admin.php`, its only consumer,
  was archived — see `archive/README.md`.
```

- [ ] **Step 4: Update the Authentication section**

Replace the last bullet of `## Authentication` with:

```markdown
- Login handled by the client-side login modal (`components/login-modal.php`), which
  `layout/footer.php` emits on **every** page; UI gated via `data-requires-auth` /
  `data-requires-no-auth` attributes and `JwtAuth::isAuthenticated()`, resolved once
  per page in `layout/head.php`
- `results.php` requires authentication on all three of its routes, so the Past Runs
  dropdown and run persistence are inert until the user logs in. Both runners treat a
  `401` from it as "not logged in" rather than as a failure
```

- [ ] **Step 5: Run the markdown linter**

Run: `composer lint:md`
Expected: `0 issues`.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for shared auth and the admin.php archive"
```

---

### Task 8: Full verification

**Files:** none modified.

- [ ] **Step 1: PHP standards**

Run: `vendor/bin/phpcs --report=summary`
Expected: 0 errors outside `node_modules/flatted/php/flatted.php`.

- [ ] **Step 2: JS lint and types**

Run: `yarn lint:js && yarn typecheck`
Expected: clean.

- [ ] **Step 3: Markdown**

Run: `composer lint:md`
Expected: `0 issues`.

- [ ] **Step 4: Full e2e suite**

Run: `FRONTEND_URL=http://localhost:3003 npx playwright test --project=chromium`
Expected: PASS. The nine `admin.spec.ts` failures recorded in project memory are gone with the file;
any remaining failure is a real regression and must be fixed before the PR.

- [ ] **Step 5: Manual smoke check**

Load `http://localhost:3003/`, confirm the Login button appears in the navbar, log in, confirm the
Past Runs column appears without a reload and the dropdown fills, run a test run, confirm the green
`#results-saved` toast rather than a warning.

- [ ] **Step 6: Open the PR**

```bash
git push -u origin feat/uti-login-and-admin-retirement
gh pr create --title "feat(auth): UTI login button; retire admin.php" --body "…"
```
