# UnitTestInterface Editor Retirement (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the test-definition editing UI from UnitTestInterface — replaced by the frontend's `admin-tests.php`
(Frontend PR #379) — while keeping the live test RUNNER fully intact; `admin.php` becomes a short notice page so old
bookmarks aren't dead ends.

**Architecture:** Pure removal + one slim replacement page. The editor surfaces (`admin.php` editor markup,
`assets/js/admin.js`, `assets/js/AssertionsBuilder.js`, `components/NewTestModal.php`, `assets/css/multi-range-slider.css`,
the Isotope CDN include, the admin-only head/footer conditionals, `e2e/admin.spec.ts`) are deleted. `admin.php` is
rewritten as a static, translated notice pointing to `{LITCAL_FRONTEND_URL}/admin-tests.php`. Nav links in
`layout/sidebar.php` / `layout/topnavbar.php` point directly at the new frontend page. Everything the runner touches is
untouched.

**Tech Stack:** PHP 8.1+ (page + layout), Playwright (e2e), phpcs (PSR-12), markdownlint. No JS build step.

## Global Constraints

- **Repo branching:** UnitTestInterface has NO `development` branch — the PR targets **`main`**.
- **Worktree discipline:** the main checkout at `/home/johnrdorazio/development/LiturgicalCalendar/UnitTestInterface` is
  on someone else's in-flight branch (`fix/ci-xgettext-coverage`). NEVER commit, checkout, or mutate tracked files
  there. Create a worktree first: `git worktree add .claude/worktrees/phase3-editor-retirement -b feat/retire-editor origin/main`
  (fetch `origin/main` first; verify `.claude/worktrees` is git-ignored — add to `.git/info/exclude` if not), and do ALL
  work in the worktree. Copy `.env` / `.env.development` from the main checkout if present (gitignored).
- **Setup in the worktree:** `composer install` (phpcs + PHP deps) and `npm install` (Playwright). This repo uses
  **npm** (`package-lock.json`), NOT yarn.
- **Sequencing dependency:** the notice links to the frontend's `/admin-tests.php`, which ships in Frontend PR #379.
  Merge/deploy #379 (frontend) BEFORE or together with this PR, or the notice link 404s. State this in the PR body.
- **KEEP (runner + shared — do not touch):** `index.php`, `resources.php`, `assets/js/index.js`,
  `assets/js/resources.js`, `assets/js/testResults.js`, `assets/js/common.js`, `assets/js/auth.js`,
  **`assets/js/types.js`** (runner files reference it via JSDoc `@typedef` imports), `src/` (`ApiClient.php`,
  `JwtAuth.php`), `includes/`, `components/login-modal.php`, `e2e/auth.setup.ts` + `e2e/fixtures.ts` (used by the
  results specs), all `e2e/results-*.spec.ts` + `e2e/resources-fresh-page.spec.ts`.
- **DELETE (editor-only):** `assets/js/admin.js`, `assets/js/AssertionsBuilder.js`, `assets/css/multi-range-slider.css`,
  `components/NewTestModal.php`, `e2e/admin.spec.ts`.
- **Frontend URL convention (existing, `layout/topnavbar.php:50`):**
  `$_ENV['LITCAL_FRONTEND_URL'] ?? 'https://litcal.johnromanodorazio.com'`. The notice/nav target is
  `rtrim(<that>, '/') . '/admin-tests.php'`.
- **Lint gates:** `composer lint` (phpcs), `composer lint:md` (markdownlint per `.markdownlint.yml`), `php -l` on every
  modified PHP file, `npx playwright test` where the stack allows (runner specs need the WebSocket backend + API — if
  not bootable locally, defer execution to CI and say so).
- **i18n:** new `_()` strings on the notice page are picked up by the repo's CI xgettext extraction (see commit
  `8c750e5`); do not hand-edit `i18n/litcal.pot`.
- **Commits:** GPG-signed; never `--no-verify`. If signing fails on a passphrase timeout, STOP and ask the user to
  unlock — never disable signing.

---

## File Structure

**Modify:**

- `admin.php` — full rewrite → notice page (~60 lines; code below).
- `layout/head.php` — remove the `$pageName === 'admin'` multi-range-slider conditional (lines ~55-57).
- `layout/footer.php` — remove the `$pageName === 'admin'` Isotope CDN conditional (lines ~42-44). Keep the generic
  `assets/js/{$pageName}.js` auto-loader (it simply stops matching once `admin.js` is deleted).
- `layout/sidebar.php` — the two `/admin.php` links (lines ~12, ~21) → the frontend `admin-tests.php` URL.
- `layout/topnavbar.php` — the "Accuracy Tests Admin" link (line ~106) → the frontend `admin-tests.php` URL (drop the
  `?apiVersion=` query — the frontend page doesn't use it).

**Create:**

- `e2e/admin-notice.spec.ts` — asserts the notice page renders, links to the frontend, and exposes no editor surfaces.

**Delete:** the five editor-only files listed in Global Constraints.

---

### Task 1: Worktree, baseline, and the failing notice spec

**Files:**

- Create: `e2e/admin-notice.spec.ts`

**Interfaces:**

- Produces: the spec that Task 2's page must satisfy. Selectors it pins: `h1` containing "moved", an
  `a#adminTestsLink[href*="/admin-tests.php"]`, and the ABSENCE of `#testDataForm`, `#litCalTestsSelect`,
  `#assertionsContainer`, `#modalDefineTest`.

- [ ] **Step 1: Create the worktree and baseline**

```bash
cd /home/johnrdorazio/development/LiturgicalCalendar/UnitTestInterface
git fetch origin main
git check-ignore -q .claude/worktrees || echo '**/.claude/worktrees/' >> .git/info/exclude
git worktree add .claude/worktrees/phase3-editor-retirement -b feat/retire-editor origin/main
cd .claude/worktrees/phase3-editor-retirement
for f in .env .env.development; do [ -f "../../../$f" ] && cp "../../../$f" .; done
composer install
npm install
composer lint          # expect clean baseline
composer lint:md       # expect clean baseline
```

Expected: worktree on `feat/retire-editor` (from `origin/main`), both lints clean. If a baseline lint fails, STOP and
report — do not fix unrelated pre-existing issues.

- [ ] **Step 2: Write the failing notice spec**

Create `e2e/admin-notice.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

/**
 * Phase 3 — the test-definition editor moved to the main site's admin area
 * (LiturgicalCalendarFrontend admin-tests.php). admin.php is now a notice page:
 * old bookmarks land on an explanation + link, never on a dead editor.
 */
test.describe('admin.php notice page (editor retired)', () => {
    test('renders the notice with a link to the frontend admin-tests page', async ({ page }) => {
        await page.goto('/admin.php');
        await expect(page.locator('h1')).toContainText(/moved/i);
        const link = page.locator('a#adminTestsLink');
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', /\/admin-tests\.php$/);
    });

    test('exposes no editor surfaces', async ({ page }) => {
        await page.goto('/admin.php');
        for (const sel of ['#testDataForm', '#litCalTestsSelect', '#assertionsContainer', '#modalDefineTest']) {
            await expect(page.locator(sel)).toHaveCount(0);
        }
    });
});
```

- [ ] **Step 3: Run it to verify it fails against the current editor page**

Run: `npx playwright test e2e/admin-notice.spec.ts --project=chromium`
Expected: FAIL — the current `admin.php` renders the editor (`#testDataForm` present, no `#adminTestsLink`).

> The current `admin.php` fetches `/tests` and `/events` at render time and `die()`s if the API is unreachable — if the
> local API isn't running, the spec fails on the error page instead; either way it fails, which is what Step 3 needs.
> If Playwright itself cannot run (no browsers/stack), record "expected-fail deferred to CI" in the report and proceed.

- [ ] **Step 4: Commit the spec**

```bash
git add e2e/admin-notice.spec.ts
git commit -m "test(admin): pin the retired-editor notice page contract"
```

---

### Task 2: Rewrite `admin.php` as the notice page

**Files:**

- Modify: `admin.php` (full replacement)

**Interfaces:**

- Consumes: `LITCAL_FRONTEND_URL` env (existing convention), `includes/I18n.php`, `layout/head.php`,
  `layout/sidebar.php`, `layout/footer.php`.
- Produces: a public, API-independent page satisfying Task 1's spec. No `HAS_LOGIN_MODAL`, no JwtAuth, no API fetches,
  no window globals, no login-modal include.

- [ ] **Step 1: Replace the entire contents of `admin.php` with:**

```php
<?php

// phpcs:disable PSR1.Files.SideEffects
ini_set('date.timezone', 'Europe/Vatican');

require_once 'vendor/autoload.php';

use Dotenv\Dotenv;

$dotenv = Dotenv::createImmutable(__DIR__, ['.env', '.env.local', '.env.development', '.env.test', '.env.staging', '.env.production'], false);
$dotenv->safeLoad();
$dotenv->ifPresent('LITCAL_FRONTEND_URL')->notEmpty();

/**
 * The test-definition EDITOR that used to live on this page moved to the main
 * website's admin area (LiturgicalCalendarFrontend admin-tests.php), which is
 * now the single source of truth for editing Liturgical Accuracy Tests. This
 * page remains only so existing bookmarks land on an explanation instead of a
 * dead end. The live test RUNNER (index.php / resources.php) is unaffected.
 */

// Initialize I18n early (head.php reuses it if already initialized)
include_once 'includes/I18n.php';

use LiturgicalCalendar\UnitTestInterface\I18n;

$i18n = new I18n();

$litcalFrontendUrl = rtrim($_ENV['LITCAL_FRONTEND_URL'] ?? 'https://litcal.johnromanodorazio.com', '/');
$adminTestsUrl     = $litcalFrontendUrl . '/admin-tests.php';

include_once 'layout/head.php';
include_once 'layout/sidebar.php';
?>
<!-- Main Content -->
<main class="pb-5">
    <div class="container-fluid px-4">
        <h1 class="h3 mb-3 text-black" style="--bs-text-opacity: .6;"><?php
            echo _('The Accuracy Tests editor has moved');
        ?></h1>
        <div class="alert alert-info d-flex align-items-start" role="alert">
            <i class="fas fa-circle-info fa-lg me-3 mt-1" aria-hidden="true"></i>
            <div>
                <p class="mb-2"><?php
                    echo _('Liturgical Accuracy Test definitions are now created, edited, and deleted from the administration area of the main Liturgical Calendar website.');
                ?></p>
                <p class="mb-3"><?php
                    echo _('This page is kept only so that existing bookmarks are not left pointing at a dead end. The live test runner on this site is unaffected.');
                ?></p>
                <a id="adminTestsLink" class="btn btn-primary" href="<?php echo htmlspecialchars($adminTestsUrl, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); ?>">
                    <i class="fas fa-vial me-2" aria-hidden="true"></i><?php
                        echo _('Open the Test Definitions admin page');
                    ?>
                </a>
            </div>
        </div>
    </div>
</main>
<?php include_once 'layout/footer.php'; ?>
```

- [ ] **Step 2: Syntax check and offline smoke**

```bash
php -l admin.php
PHP_CLI_SERVER_WORKERS=2 php -S localhost:3199 -t . >/tmp/uti-php.log 2>&1 &
sleep 2
curl -s -o /dev/null -w "status=%{http_code}\n" http://localhost:3199/admin.php
grep -icE "error|fatal|warning" /tmp/uti-php.log || echo "no php errors"
kill %1
```

Expected: `No syntax errors detected`; `status=200`; no PHP errors. (The notice page has NO API dependency — unlike the
old editor, it must render even with the API down.)

> Layout caveat to verify during this step: `layout/topnavbar.php` gates its login UI on `HAS_LOGIN_MODAL` /
> JwtAuth availability "set by admin.php". With those gone from admin.php the login UI simply hides — but confirm the
> page renders without notices/fatals from head/sidebar/topnavbar/footer with `$pageName === 'admin'`. If any layout
> file hard-requires a symbol the old admin.php defined, fix the layout guard (guard, don't re-add the symbol) and note
> it in the report.

- [ ] **Step 3: Run the notice spec to verify it passes**

Run: `npx playwright test e2e/admin-notice.spec.ts --project=chromium`
Expected: PASS (both tests). If Playwright cannot run locally, re-run the curl smoke plus
`curl -s http://localhost:3199/admin.php | grep -c 'adminTestsLink'` (expected `1`) and defer the spec to CI.

- [ ] **Step 4: Lint and commit**

```bash
composer lint
git add admin.php
git commit -m "feat(admin): retire the editor page — notice + link to the frontend admin-tests area"
```

---

### Task 3: Layout cleanup — head/footer conditionals and nav links

**Files:**

- Modify: `layout/head.php`, `layout/footer.php`, `layout/sidebar.php`, `layout/topnavbar.php`

**Interfaces:**

- Consumes: the `$adminTestsUrl` convention (recompute inline where needed — layout files already read
  `$_ENV['LITCAL_FRONTEND_URL']` in topnavbar.php:50).
- Produces: no Isotope/multi-range-slider loading anywhere; all "admin" nav entries point at the frontend page.

- [ ] **Step 1: `layout/head.php` — delete the admin CSS conditional (around lines 55-57):**

```php
if ($pageName === 'admin') {
    echo "<link href=\"assets/css/multi-range-slider.css\" rel=\"stylesheet\">";
}
```

- [ ] **Step 2: `layout/footer.php` — delete the Isotope conditional (around lines 42-44):**

```php
if ($pageName === 'admin') {
    echo "<script src=\"https://unpkg.com/isotope-layout@3/dist/isotope.pkgd.min.js\"></script>";
}
```

Keep the `assets/js/{$pageName}.js` auto-loader that follows it.

- [ ] **Step 3: `layout/sidebar.php` — repoint both `/admin.php` links (lines ~12 and ~21)**

Read the surrounding markup first and match it exactly. Replace each `href="/admin.php"` with the frontend URL,
computed once near the top of the file's PHP section (reuse the exact topnavbar.php:50 idiom):

```php
<?php $litcalFrontendUrl = $_ENV['LITCAL_FRONTEND_URL'] ?? 'https://litcal.johnromanodorazio.com'; ?>
```

then `href="<?php echo htmlspecialchars(rtrim($litcalFrontendUrl, '/') . '/admin-tests.php', ENT_QUOTES, 'UTF-8'); ?>"`.
Also drop any `$pageName === 'admin' ? ' active' : ''` class logic on those links (an external link is never "active"),
but KEEP the links themselves — editors still discover the editor from here.

- [ ] **Step 4: `layout/topnavbar.php` — repoint the "Accuracy Tests Admin" link (line ~106)**

Same URL substitution; drop the `?apiVersion=...` query parameter (the frontend page doesn't consume it). Keep the
translated `title="Accuracy Tests Admin"` attribute.

- [ ] **Step 5: Verify + commit**

```bash
for f in layout/head.php layout/footer.php layout/sidebar.php layout/topnavbar.php; do php -l "$f"; done
grep -rn "multi-range-slider\|isotope" layout/ && echo "LEFTOVER FOUND" || echo "clean"
grep -rn 'href="/admin\.php"' layout/ && echo "LEFTOVER FOUND" || echo "clean"
composer lint
git add layout/head.php layout/footer.php layout/sidebar.php layout/topnavbar.php
git commit -m "chore(layout): drop editor-only Isotope/slider includes; point admin nav at the frontend admin-tests page"
```

Expected: 4× `No syntax errors detected`, both greps `clean`, phpcs clean.

---

### Task 4: Delete the editor-only files + reference grep gates

**Files:**

- Delete: `assets/js/admin.js`, `assets/js/AssertionsBuilder.js`, `assets/css/multi-range-slider.css`,
  `components/NewTestModal.php`, `e2e/admin.spec.ts`

- [ ] **Step 1: Delete**

```bash
git rm assets/js/admin.js assets/js/AssertionsBuilder.js assets/css/multi-range-slider.css components/NewTestModal.php e2e/admin.spec.ts
```

- [ ] **Step 2: Reference gates — nothing left points at deleted files**

```bash
grep -rnE "AssertionsBuilder|NewTestModal|multi-range-slider|assets/js/admin\.js" \
  --include="*.php" --include="*.js" --include="*.ts" \
  . --exclude-dir=node_modules --exclude-dir=vendor --exclude-dir=.git --exclude-dir=docs \
  && echo "LEFTOVER REFERENCES" || echo "clean"
```

Expected: `clean`. (`i18n/*.po`/`.pot` may still carry old source-reference comments — those regenerate via CI and are
NOT a failure; docs/ is excluded because this plan file names the deleted files.)

- [ ] **Step 3: Confirm the runner's types.js is intact and still referenced only via JSDoc**

```bash
ls assets/js/types.js
grep -n "types.js" assets/js/index.js assets/js/resources.js | head -4
```

Expected: file present; `@typedef {import('./types.js')...}` lines in both runner files.

- [ ] **Step 4: Runner spec sanity (as far as the local stack allows)**

Run: `npx playwright test e2e/resources-fresh-page.spec.ts --project=chromium`
Expected: PASS if the local WS/API stack is up; otherwise record "deferred to CI" — the runner specs are the regression
net proving the retirement didn't touch the runner.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: remove the retired test-definition editor (admin.js, AssertionsBuilder, NewTestModal, slider CSS, admin e2e)"
```

---

### Task 5: Final gates, README touch-up, PR

**Files:**

- Modify: `README.md` (only if it documents the admin/editor page — check first)

- [ ] **Step 1: README check**

Run: `grep -niE "admin\.php|define.*test|editor" README.md | head`
If the README documents the editor, update those sentences to point at the frontend admin area (keep it to a few
lines); otherwise skip.

- [ ] **Step 2: Full gates**

```bash
composer lint
composer lint:md
for f in admin.php layout/head.php layout/footer.php layout/sidebar.php layout/topnavbar.php; do php -l "$f"; done
npx playwright test e2e/admin-notice.spec.ts --project=chromium   # or defer to CI, stated explicitly
```

- [ ] **Step 3: Commit any README/doc change, plus this plan file**

```bash
git add README.md docs/superpowers/plans/2026-07-04-phase3-editor-retirement.md
git commit -m "docs: note the editor's move to the frontend admin area"
```

- [ ] **Step 4: Push and open the PR against `main`**

```bash
git push -u origin feat/retire-editor
gh pr create --base main --title "Retire the test-definition editor — moved to the frontend admin area (Phase 3)" \
  --body "<summary: what was removed / kept; sequencing note: requires Frontend PR #379 deployed so the notice link resolves; runner untouched — runner e2e specs are the regression net>"
```

Ask the user before merging.

---

## Self-Review

**Spec coverage (design doc §C, "UnitTestInterface — retire the editor"):** editing UI removed (`admin.php` surfaces,
`admin.js` create/edit/save paths, `AssertionsBuilder.js` superseded by the frontend port) → Tasks 2, 4. Runner kept
(`index.php`/`resources.php` + WS backend untouched; regression via runner e2e) → Global Constraints + Task 4 Steps 3-4.
Redirect/notice for old bookmarks → Task 2. `test_editor` role and `/tests` API unchanged → nothing here touches them.

**Placeholder scan:** the PR body in Task 5 is intentionally a summary skeleton (its content derives from what actually
happened during execution); every code/config step carries the real code. Task 3 Steps 3-4 direct reading the live
surrounding markup before substitution — the target URL idiom and the exact `href` replacement are given.

**Type/name consistency:** `#adminTestsLink` is pinned identically in the spec (Task 1) and the page (Task 2);
`LITCAL_FRONTEND_URL` idiom matches topnavbar.php:50; the delete list matches the reference gates' grep patterns.

**Known risks carried into execution:** (a) layout files may assume symbols the old admin.php defined — Task 2 Step 2
verifies and guards; (b) Playwright may not run without the WS/API stack — every spec step names its CI-deferral
fallback; (c) i18n `.pot` regeneration is CI-owned — explicitly out of scope.
