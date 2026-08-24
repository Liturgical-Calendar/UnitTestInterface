# UTI login and the retirement of admin.php

Date: 2026-08-24
Status: approved

## Problem

Two symptoms, one cause.

**Login on `admin.php` does not work.** `admin.php` does not render at all. It dies at `admin.php:122`,
where Monolog fails writing the "Failed to fetch…" record it was in the middle of logging, so execution
never reaches `define('HAS_LOGIN_MODAL', true)` on line 144 or `include_once 'components/login-modal.php'`
on line 326. The response carries zero occurrences of `loginModal`: the modal markup and the entire inline
auth script are never emitted, and the navbar's login button — gated on `HAS_LOGIN_MODAL` — stays `d-none`.
There is no login control to click. Beneath that sits the already-recorded `CalendarSelect` `TypeError` at
`admin.php:189`, from `liturgical-calendar/components` v3.3.1 being unable to parse the API's rite-aware
`/calendars`. Both failures are `admin.php`'s alone.

**"Past Runs" is dead on the runner pages.** The whole authentication UI — the modal markup, `window.Auth`,
`showLoginModal()`, `updateNavbarAuthUI()`, `initPermissionUI()` — lives inside `components/login-modal.php`,
and `admin.php` is its only includer. On `index.php` and `resources.php` this means:

- no login button, because `HAS_LOGIN_MODAL` is undefined there;
- `initPermissionUI()` is never called, so the `data-requires-auth` attribute on the Past Runs column is
  inert markup and the column renders unmanaged;
- `results.php` answers `401` to all three of its routes, so `loadPastRuns()` logs "Could not load past
  runs" and the dropdown never leaves "— Live —";
- and `postRunResults()` rejects with `Save failed: 401`, so **every completed run ends on a red
  `#results-save-failed` toast**.

The user-facing goal — saving and replaying past runs — needs authentication on the runner pages. That is
independent of `admin.php`, which is why retiring `admin.php` and fixing Past Runs compose rather than
conflict.

## Design

### Part 1 — Authentication becomes a page-level concern

The coupling to `admin.php` is removed rather than duplicated.

- `layout/head.php` initialises JWT auth once, for every page: `JwtAuth::init()` followed by
  `$isAuthenticated = JwtAuth::isAuthenticated()`. `head.php` already loads `vendor/autoload.php` and
  dotenv, which is everything `JwtAuth::init()` needs, and both `layout/topnavbar.php` and
  `layout/footer.php` already read `$isAuthenticated` when it happens to be set. This makes it always set.
- `layout/footer.php` includes `components/login-modal.php`, after the Bootstrap bundle (the modal's script
  needs the `bootstrap` global) and before the page's own module script (so `window.Auth` exists when the
  page module runs). Both includes are `include_once`, so no page can double-emit the modal.
- `layout/topnavbar.php` drops the `HAS_LOGIN_MODAL` gate. The login button and the user menu render on
  every page, with their initial visibility server-rendered from `$isAuthenticated` so an authenticated
  reload does not flash the login button.

The `HAS_LOGIN_MODAL` constant is deleted, not merely stopped being read: with the modal included from the
shared footer, a per-page opt-in flag describes a condition that can no longer be false.

### Part 2 — Past Runs actually works

**Visibility.** The Past Runs column on `index.php` and `resources.php` gets a server-rendered
`<?php echo $isAuthenticated ? '' : 'd-none'; ?>`, matching what `admin.php` already did for its own
protected regions. Without it the column is visible until `initPermissionUI()` runs and then vanishes.

**Listing.** `loadPastRuns()` keeps attempting the fetch and treats a rejection as "leave the dropdown at
Live". The server's `401` is the source of truth here, which sidesteps a race: `Auth`'s cached state is
populated asynchronously on `DOMContentLoaded` and may not be settled when the page bootstraps, whereas the
HTTP status always is. What changes is that the dropdown is refreshed on `auth:login` and cleared on
`auth:logout` — the two events `components/login-modal.php` already dispatches — so logging in mid-session
populates it without a reload.

**Saving.** `postRunResults()` currently rejects with a message string that a caller would have to parse to
learn the status. It gains a `status` property on the thrown error. Both runners then branch: `401` raises a
new "log in to save" toast, anything else keeps the existing `#results-save-failed`. An anonymous run
finishing on a red failure toast is the misleading part — the run itself succeeded, and only its persistence
was declined.

The runners consult neither `Auth`'s cached state nor `window.LitCalConfig.isAuthenticated` for either
decision. The HTTP status from `results.php` is the authority, and unlike a cache it cannot be stale.

### Part 3 — `admin.php` is archived

Archived, not deleted: its test-authoring functionality has no replacement, and git history alone is too
easy to forget.

- `admin.php`, `assets/js/admin.js`, `assets/js/AssertionsBuilder.js` and `components/NewTestModal.php` move
  under `archive/`, preserving their relative layout. `archive/README.md` records why they are there, what
  is broken about them, and what reviving them would require.
- Navigation is unlinked: the navbar's gear item goes. Nothing else needs adding — the navbar already
  carries Calendars and Resources entries, which are the whole of the interface once admin is gone.
- `layout/sidebar.php` is archived with it. Both runner pages `define('SIDEBAR', false)`, so `admin.php` was
  its only consumer; with that gone the `SIDEBAR` constant, the navbar's sidebar-toggle button and
  `layout/footer.php`'s wrapper-closing branch all describe a condition that can no longer be true, and are
  removed rather than left as permanently-false branches.
- `layout/footer.php` drops its `$pageName === 'admin'` Isotope branch.
- `liturgical-calendar/components` is removed from `composer.json`. `admin.php` was its only consumer, and
  it is the package pinned at a version that cannot parse the current API.
- `e2e/admin.spec.ts` is deleted — nine tests that have been failing for reasons unrelated to any branch.
  `e2e/auth.setup.ts` navigates to `/` instead of `/admin.php`.
- The `.pot` extraction in `.github/workflows/main.yml` excludes `archive/`, so retired strings stop being
  offered to translators.

## Testing

- A new `e2e/past-runs-auth.spec.ts` covers both states: logged out (login button visible, Past Runs column
  hidden) and logged in via the existing `storageState` (column visible, dropdown populated, no
  save-failure toast). Every configured Playwright project runs authenticated, so the logged-out case
  overrides `storageState` to an empty context.
- The existing `results-endpoint`, `results-replay` and `results-replay-resources` specs must stay green;
  they exercise the same endpoints this change re-fronts.
- `composer lint`, `composer lint:md`, `yarn lint:js`, `yarn typecheck`.

## Out of scope

Fixing `admin.php` itself, and the `CalendarSelect::addNationalCalendarWithDioceses()` defect in
`liturgy-components-php` that breaks it. Both belong to the archived page.
