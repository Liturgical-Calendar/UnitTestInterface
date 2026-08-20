# RiteSelect and Rite-Scoped Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `index.php` and `resources.php` a liturgical-rite control, and filter every check each page runs by the selected rite.

**Architecture:** `index.php` drops its hand-written `#APICalendarSelect` for
`@liturgical-calendar/components-js`'s `CalendarSelect`, linked to that library's `RiteSelect`, so the calendar
list partitions by rite in the library rather than in our code. `resources.php` mounts a `RiteSelect` alone. The
rite predicate, the universal source-data inventory and the selection→protocol mapping all live once in
`assets/js/wsProtocol.js`, which both runners already import.

**Tech Stack:** PHP 8.1+ (no framework), native ES6 modules (no bundler), Bootstrap 5, `@liturgical-calendar/components-js` 2.7.0 via import map + CDN, Playwright for tests.

**Spec:** `docs/superpowers/specs/2026-08-20-rite-select-and-scoped-checks-design.md`

## Global Constraints

- **PHP floor:** `>=8.1` (`composer.json`). Do not use 8.2+ syntax.
- **PHP style:** PSR-12, max line length **200** (`phpcs.xml`). Verify with `vendor/bin/phpcs`.
- **Markdown:** max line length **180**; tables vertically aligned (MD060); fenced blocks with language specifiers. Verify with `composer lint:md`.
- **No build step.** No bundler, no transpile. Browser-loadable ES6 only.
- **Never use `--no-verify`.** CaptainHook pre-commit hooks must pass.
- **Library version is pinned to `2.7.0`** in exactly one place (`layout/footer.php`). Do not add
  `@liturgical-calendar/components-js` to `package.json` dependencies — nothing installs it; the import map
  resolves it.
- **`appendTo()` returns `undefined`.** Never chain off it, never assign its result.
- **Server API dependency:** requires LiturgicalCalendarAPI **#813** (merged 2026-08-20). Earlier servers cannot resolve schemas for rite-qualified resource URLs.
- **Rite identifiers** are exactly `roman` and `ambrosian`. Default is `roman`.
- **Card class names are part of the API contract** — the server echoes `classes` selectors built from the `validate` values we send. Changing a `validate` value changes a card class.

---

### Task 1: Deliver `@liturgical-calendar/components-js` to the browser

**Files:**

- Modify: `layout/footer.php` (the `$pageName` block at the end, currently lines 42–48)
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Test: `e2e/components-js.spec.ts` (create)

**Interfaces:**

- Consumes: nothing.
- Produces: the bare specifier `@liturgical-calendar/components-js` resolves on `index.php` and
  `resources.php`, exporting at least `ApiClient`, `ApiBase`, `CalendarSelect`, `RiteSelect`,
  `CalendarSelectFilter`, `Rite`.

- [ ] **Step 1: Write the failing test**

Create `e2e/components-js.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

/**
 * The import map that makes `@liturgical-calendar/components-js` resolvable (issue #48).
 *
 * Deliberately asserts on the bare specifier rather than on the CDN URL: the URL is an
 * implementation detail that flips between the local symlink and jsDelivr depending on
 * APP_ENV, while the specifier is what every module in assets/js imports.
 */
for (const page_ of ['/', '/resources.php']) {
    test(`the components-js import map resolves on ${page_}`, async ({ page }) => {
        await page.goto(page_);
        const exported = await page.evaluate(async () => {
            const mod = await import('@liturgical-calendar/components-js');
            return {
                ApiClient: typeof mod.ApiClient,
                ApiBase: typeof mod.ApiBase,
                CalendarSelect: typeof mod.CalendarSelect,
                RiteSelect: typeof mod.RiteSelect,
                rites: Object.values(mod.Rite),
            };
        });
        expect(exported.ApiClient).toBe('function');
        expect(exported.ApiBase).toBe('function');
        expect(exported.CalendarSelect).toBe('function');
        expect(exported.RiteSelect).toBe('function');
        expect(exported.rites).toEqual(expect.arrayContaining(['roman', 'ambrosian']));
    });
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/components-js.spec.ts --project=chromium`

Expected: FAIL — `Failed to resolve module specifier "@liturgical-calendar/components-js"`.

- [ ] **Step 3: Emit the import map**

In `layout/footer.php`, replace this block:

```php
<?php
if ($pageName === 'admin') {
    echo "<script src=\"https://unpkg.com/isotope-layout@3/dist/isotope.pkgd.min.js\"></script>";
}
if (file_exists("assets/js/{$pageName}.js")) {
    echo "<script type=\"module\" src=\"assets/js/{$pageName}.js\"></script>";
}
?></body>
```

with:

```php
<?php
if ($pageName === 'admin') {
    echo "<script src=\"https://unpkg.com/isotope-layout@3/dist/isotope.pkgd.min.js\"></script>";
}

// The two runner pages mount liturgy-components-js controls (issue #48). The import map must
// precede the first module load, which is the page script emitted immediately below.
//
// In development the specifier resolves to a symlink at assets/components-js, so a local
// checkout of the library is picked up without publishing; in every other environment it
// resolves to a pinned CDN build. Mirrors LiturgicalCalendarFrontend/layout/footer.php.
if (in_array($pageName, ['index', 'resources'], true)) {
    $componentsJsUrl = ($_ENV['APP_ENV'] ?? 'production') === 'development'
        ? './assets/components-js/index.js'
        : 'https://cdn.jsdelivr.net/npm/@liturgical-calendar/components-js@2.7.0/+esm';
    echo '<script type="importmap">'
        . json_encode(
            ['imports' => ['@liturgical-calendar/components-js' => $componentsJsUrl]],
            JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
        )
        . '</script>';
}

if (file_exists("assets/js/{$pageName}.js")) {
    echo "<script type=\"module\" src=\"assets/js/{$pageName}.js\"></script>";
}
?></body>
```

- [ ] **Step 4: Ignore the development symlink**

Append to `.gitignore`, after the `node_modules/` line:

```gitignore
# Development-only symlink to a local liturgy-components-js checkout (issue #48).
# Production resolves the same specifier to a pinned CDN build; see layout/footer.php.
assets/components-js
```

- [ ] **Step 5: Create the symlink locally**

Run from the repository root:

```bash
ln -sfn ../../liturgy-components-js/dist assets/components-js
```

Note: this step is for the local development environment only. It creates nothing that is committed — Step 4
ignores it. If `APP_ENV` is not `development`, the CDN URL is used and this symlink is unused.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx playwright test e2e/components-js.spec.ts --project=chromium`

Expected: PASS, 2 tests (one per page).

- [ ] **Step 7: Document the dependency**

In `CLAUDE.md`, under `## Main Technologies`, change the `**Component Library:**` line to:

```markdown
- **Component Libraries:** `@liturgical-calendar/components-js` (ESM, `index.php` + `resources.php`);
  liturgical-calendar/components (PHP, `admin.php` only)
```

In `CLAUDE.md`, under `**Environment Configuration:**`, add a fourth numbered item:

`````markdown
4. For a local `liturgy-components-js` checkout, symlink it (development only):

   ```bash
   ln -sfn ../../liturgy-components-js/dist assets/components-js
   ```

   When `APP_ENV=development` the import map in `layout/footer.php` points the
   `@liturgical-calendar/components-js` specifier at this symlink; otherwise it resolves to a
   pinned jsDelivr build. There is no bundler and no `npm install` step for it.
`````

In `README.md`, add `https://cdn.jsdelivr.net` to the list of outbound hosts if such a list exists; if it does not, add this line to the section describing external assets:

```markdown
External assets are loaded from `cdnjs.cloudflare.com` (Bootstrap, Font Awesome) and
`cdn.jsdelivr.net` (sb-admin styles, `@liturgical-calendar/components-js`).
```

- [ ] **Step 8: Lint**

Run: `vendor/bin/phpcs && composer lint:md`

Expected: both clean.

- [ ] **Step 9: Commit**

```bash
git add layout/footer.php .gitignore README.md CLAUDE.md e2e/components-js.spec.ts
git commit -m "feat(deps): resolve @liturgical-calendar/components-js via an import map"
```

---

### Task 2: Move the rite predicate and universal inventory into `wsProtocol.js`

**Files:**

- Modify: `assets/js/wsProtocol.js`
- Test: `e2e/ws-protocol.spec.ts` (create)

**Interfaces:**

- Consumes: nothing.
- Produces, all named exports of `assets/js/wsProtocol.js`:
  - `UNIVERSAL_CHECKS: ReadonlyArray<{rite: string, validate: string, category: 'universalcalendar', sourceFile?: string, sourceFolder?: string}>` — 8 entries.
  - `inRiteScope(item: {rite?: string}, rite: string): boolean`
  - `universalChecksForRite(rite: string): Array<object>`
  - `toWireTarget(value: string, calendartype: string, rite: string): {calendar: string, category: string}` — throws on an unknown `calendartype`.
  - `CALENDAR_SCOPE_KEYS: ReadonlyArray<string>`
  - `testAppliesToRite(unitTest: object, rite: string): boolean`

This task only *adds* exports. `index.js` and `resources.js` keep their private copies until Tasks 3–5 delete them, so the page behaviour is unchanged at the end of this task.

- [ ] **Step 1: Write the failing test**

Create `e2e/ws-protocol.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

/**
 * The shared protocol helpers (issue #48).
 *
 * Exercised in the page context rather than in Node: assets/js/wsProtocol.js is a browser ES
 * module served by the PHP dev server, and this repo has no JS unit runner. Importing it by
 * URL keeps the test dependency-free and tests the file the browser actually loads.
 */
const load = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    return page;
};

test('UNIVERSAL_CHECKS covers both rites, temporale and decrees, files and i18n folders', async ({ page }) => {
    await load(page);
    const checks = await page.evaluate(async () => {
        const { UNIVERSAL_CHECKS } = await import('/assets/js/wsProtocol.js');
        return UNIVERSAL_CHECKS;
    });

    expect(checks).toHaveLength(8);
    expect(checks.every((c: any) => c.category === 'universalcalendar')).toBe(true);
    // Every entry names exactly one of sourceFile / sourceFolder.
    expect(checks.every((c: any) => ('sourceFile' in c) !== ('sourceFolder' in c))).toBe(true);
    // Four per rite, half of them i18n folders.
    expect(checks.filter((c: any) => c.rite === 'roman')).toHaveLength(4);
    expect(checks.filter((c: any) => c.rite === 'ambrosian')).toHaveLength(4);
    expect(checks.filter((c: any) => 'sourceFolder' in c)).toHaveLength(4);
    // validate values are distinct — they become card CSS classes.
    const validates = checks.map((c: any) => c.validate);
    expect(new Set(validates).size).toBe(validates.length);
    // The Ambrosian corpus is present at all, which is the gap issue #48 opens on.
    expect(checks.some((c: any) => c.rite === 'ambrosian' && 'sourceFolder' in c)).toBe(true);
});

test('universalChecksForRite returns only that rite', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { universalChecksForRite } = await import('/assets/js/wsProtocol.js');
        return {
            roman: universalChecksForRite('roman').map((c: any) => c.rite),
            ambrosian: universalChecksForRite('ambrosian').map((c: any) => c.rite),
        };
    });
    expect(result.roman).toEqual(['roman', 'roman', 'roman', 'roman']);
    expect(result.ambrosian).toEqual(['ambrosian', 'ambrosian', 'ambrosian', 'ambrosian']);
});

test('inRiteScope treats a missing rite as roman, never as a wildcard', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { inRiteScope } = await import('/assets/js/wsProtocol.js');
        return {
            match: inRiteScope({ rite: 'ambrosian' }, 'ambrosian'),
            mismatch: inRiteScope({ rite: 'ambrosian' }, 'roman'),
            absentUnderRoman: inRiteScope({}, 'roman'),
            absentUnderAmbrosian: inRiteScope({}, 'ambrosian'),
        };
    });
    expect(result.match).toBe(true);
    expect(result.mismatch).toBe(false);
    expect(result.absentUnderRoman).toBe(true);
    expect(result.absentUnderAmbrosian).toBe(false);
});

test('toWireTarget maps the empty option to the rite-level calendar', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { toWireTarget } = await import('/assets/js/wsProtocol.js');
        return {
            romanRiteLevel: toWireTarget('', '', 'roman'),
            ambrosianRiteLevel: toWireTarget('', '', 'ambrosian'),
            national: toWireTarget('IT', 'national', 'roman'),
            diocesan: toWireTarget('milano_it', 'diocesan', 'ambrosian'),
        };
    });
    expect(result.romanRiteLevel).toEqual({ calendar: 'roman', category: 'ritecalendar' });
    expect(result.ambrosianRiteLevel).toEqual({ calendar: 'ambrosian', category: 'ritecalendar' });
    expect(result.national).toEqual({ calendar: 'IT', category: 'nationalcalendar' });
    expect(result.diocesan).toEqual({ calendar: 'milano_it', category: 'diocesancalendar' });
});

test('toWireTarget throws on an unknown calendartype rather than sending a partial message', async ({ page }) => {
    await load(page);
    const message = await page.evaluate(async () => {
        const { toWireTarget } = await import('/assets/js/wsProtocol.js');
        try {
            toWireTarget('IT', 'nationalcalendar', 'roman');
            return null;
        } catch (e) {
            return (e as Error).message;
        }
    });
    expect(message).toContain('nationalcalendar');
});

test('testAppliesToRite filters a rite-only scope and defaults an absent rite to roman', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { testAppliesToRite } = await import('/assets/js/wsProtocol.js');
        return {
            ambrosianUnderAmbrosian: testAppliesToRite({ applies_to: { rite: 'ambrosian' } }, 'ambrosian'),
            ambrosianUnderRoman: testAppliesToRite({ applies_to: { rite: 'ambrosian' } }, 'roman'),
            legacyUnderRoman: testAppliesToRite({ appliesTo: { national_calendar: 'IT' } }, 'roman'),
            legacyUnderAmbrosian: testAppliesToRite({ appliesTo: { national_calendar: 'IT' } }, 'ambrosian'),
        };
    });
    expect(result.ambrosianUnderAmbrosian).toBe(true);
    expect(result.ambrosianUnderRoman).toBe(false);
    expect(result.legacyUnderRoman).toBe(true);
    expect(result.legacyUnderAmbrosian).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/ws-protocol.spec.ts --project=chromium`

Expected: FAIL — every test errors because the named exports do not exist.

- [ ] **Step 3: Implement the shared helpers**

Append to `assets/js/wsProtocol.js`, after `sendCancelRun`:

```javascript
/**
 * The rite-level universal source corpus, as one list for both runner pages.
 *
 * `index.js` and `resources.js` each carried their own version of this, with two different
 * vocabularies for the same file on disk — `PropriumDeTempore` under `universalcalendar` here,
 * `proprium-de-tempore` under `sourceDataCheck` there (see #42). Neither listed the Ambrosian
 * corpus, and neither listed any i18n folder (#48).
 *
 * `category: 'universalcalendar'` for every entry, folders included. The server resolves that
 * category's schema from the path, through `CheckableInventory::byPath()`, which knows all eight
 * of these; and its `sourceFolder` handling branches on the property being present, not on the
 * category. One category therefore covers file and folder, Roman and Ambrosian alike.
 *
 * `validate` values are card CSS class names once slugified, and the server echoes them back in
 * its `classes` selector — so they are effectively part of the wire contract and must stay
 * distinct. See CLAUDE.md, "Server Response Format".
 *
 * These paths are the last hardcoded copy of the API's on-disk layout; #42 replaces the whole
 * list with a fetch of the `/validations` inventory once the wire accepts opaque ids.
 *
 * @type {ReadonlyArray<{rite: string, validate: string, category: string, sourceFile?: string, sourceFolder?: string}>}
 */
export const UNIVERSAL_CHECKS = Object.freeze([
    {
        rite: 'roman',
        validate: 'PropriumDeTempore',
        sourceFile: 'jsondata/sourcedata/rite/roman/missals/propriumdetempore/propriumdetempore.json',
        category: 'universalcalendar'
    },
    {
        rite: 'roman',
        validate: 'PropriumDeTemporeI18n',
        sourceFolder: 'jsondata/sourcedata/rite/roman/missals/propriumdetempore/i18n',
        category: 'universalcalendar'
    },
    {
        rite: 'roman',
        validate: 'MemorialsFromDecrees',
        sourceFile: 'jsondata/sourcedata/rite/roman/decrees/decrees.json',
        category: 'universalcalendar'
    },
    {
        rite: 'roman',
        validate: 'MemorialsFromDecreesI18n',
        sourceFolder: 'jsondata/sourcedata/rite/roman/decrees/i18n',
        category: 'universalcalendar'
    },
    {
        rite: 'ambrosian',
        validate: 'AmbrosianPropriumDeTempore',
        sourceFile: 'jsondata/sourcedata/rite/ambrosian/missals/propriumdetempore/propriumdetempore.json',
        category: 'universalcalendar'
    },
    {
        rite: 'ambrosian',
        validate: 'AmbrosianPropriumDeTemporeI18n',
        sourceFolder: 'jsondata/sourcedata/rite/ambrosian/missals/propriumdetempore/i18n',
        category: 'universalcalendar'
    },
    {
        rite: 'ambrosian',
        validate: 'AmbrosianPropriumDeSanctis',
        sourceFile: 'jsondata/sourcedata/rite/ambrosian/missals/propriumdesanctis_2024/propriumdesanctis.json',
        category: 'universalcalendar'
    },
    {
        rite: 'ambrosian',
        validate: 'AmbrosianPropriumDeSanctisI18n',
        sourceFolder: 'jsondata/sourcedata/rite/ambrosian/missals/propriumdesanctis_2024/i18n',
        category: 'universalcalendar'
    }
]);

/**
 * Whether a rite-tagged item belongs to the selected rite.
 *
 * An absent `rite` means Roman, never "applies to every rite". Everything in this interface
 * predates the rite dimension and was Roman by construction, so treating an absent value as a
 * wildcard would be a fail-open filter — it would show Roman-only items under the Ambrosian rite,
 * where the API rejects several of them outright.
 *
 * @param {{rite?: string}} item - Any object carrying an optional `rite`.
 * @param {string} rite - The selected rite.
 * @returns {boolean}
 */
export const inRiteScope = ( item, rite ) => ( item?.rite ?? 'roman' ) === rite;

/**
 * The universal source checks belonging to one rite.
 *
 * @param {string} rite - The selected rite.
 * @returns {Array<object>} A fresh array; callers push calendar-specific checks onto it.
 */
export const universalChecksForRite = ( rite ) =>
    UNIVERSAL_CHECKS.filter( check => inRiteScope( check, rite ) ).map( check => ( { ...check } ) );

/**
 * Translate a `CalendarSelect` selection into the protocol's calendar/category vocabulary.
 *
 * The library speaks `national` / `diocesan` and represents the rite-level calendar as its empty
 * option; the WebSocket protocol speaks `nationalcalendar` / `diocesancalendar` / `ritecalendar`
 * and names the rite-level calendar explicitly. This is the only place the two meet.
 *
 * The empty option maps to `{calendar: rite, category: 'ritecalendar'}` for both rites. For the
 * Roman rite this is the same request the old `VA` option produced —
 * `Health::buildCalendarRequestPath()` reads `'VA'` as the historical marker for the rite-level
 * calendar and resolves it to `/roman/{year}` exactly as `ritecalendar` does — but it stops
 * naming the General Roman Calendar `VA`, which matters now that Vatican City is to gain its own
 * national calendar data distinct from it.
 *
 * @param {string} value - The selected option's value; '' for the rite-level calendar.
 * @param {string} calendartype - The selected option's `data-calendartype`; '' for the empty option.
 * @param {string} rite - The selected rite.
 * @returns {{calendar: string, category: string}}
 * @throws {Error} If `calendartype` is not one the library emits. Throwing beats returning a
 *         partial message: a wrong `category` silently checks a different path and reports success.
 */
export const toWireTarget = ( value, calendartype, rite ) => {
    if ( value === '' ) {
        return { calendar: rite, category: 'ritecalendar' };
    }
    switch ( calendartype ) {
        case 'national':
            return { calendar: value, category: 'nationalcalendar' };
        case 'diocesan':
            return { calendar: value, category: 'diocesancalendar' };
        default:
            throw new Error(
                `Unknown data-calendartype "${calendartype}" on calendar option "${value}"; `
                + 'expected "national" or "diocesan" from liturgy-components-js CalendarSelect.'
            );
    }
};

/**
 * The calendar-scope keys a test's `applies_to` / `appliesTo` / `filter` may carry, in the order
 * they are checked.
 *
 * `rite` is deliberately excluded: since API #785 it is a separate dimension present on every
 * scope object, not one of the mutually exclusive calendar-identity keys. Selecting the key
 * explicitly — rather than by `Object.keys(...).length` or `[0]` — avoids depending on key count
 * or key order, both of which broke once already when `rite` became a sibling required property.
 *
 * @type {ReadonlyArray<string>}
 */
export const CALENDAR_SCOPE_KEYS = Object.freeze([
    'national_calendar',
    'national_calendars',
    'diocesan_calendar',
    'diocesan_calendars'
]);

/**
 * Whether a unit test belongs to the given liturgical rite.
 *
 * Kept out of the calendar-scope handling for the reason {@link CALENDAR_SCOPE_KEYS} gives: a
 * rite-only scope such as `{ "rite": "ambrosian" }` carries no calendar identity at all, so it
 * would fall through the calendar-scope switch and be kept for every calendar. Handled here, it
 * correctly restricts the test to its own rite.
 *
 * @param {Object} unitTest - The unit test definition.
 * @param {string} rite - The selected rite.
 * @returns {boolean}
 */
export const testAppliesToRite = ( unitTest, rite ) =>
    inRiteScope( unitTest.applies_to ?? unitTest.appliesTo ?? {}, rite );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test e2e/ws-protocol.spec.ts --project=chromium`

Expected: PASS, 6 tests.

- [ ] **Step 5: Confirm nothing else changed**

Run: `npx playwright test --project=chromium`

Expected: the pre-existing suite still passes — this task added exports and removed nothing.

- [ ] **Step 6: Commit**

```bash
git add assets/js/wsProtocol.js e2e/ws-protocol.spec.ts
git commit -m "feat(protocol): share the rite predicate and universal check inventory"
```

---

### Task 3: Mount `RiteSelect` + `CalendarSelect` on `index.php`

**Files:**

- Modify: `index.php` (the control row, lines 76–81)
- Modify: `assets/js/index.js`
- Modify: `e2e/rite-selection.spec.ts`
- Test: `e2e/rite-selection.spec.ts`

**Interfaces:**

- Consumes: `toWireTarget`, `inRiteScope` from Task 2; the import map from Task 1.
- Produces, in `assets/js/index.js`:
  - `apiBase` — a loaded `ApiBase` instance, module-scoped.
  - `currentRite` — now sourced from the `RiteSelect`'s value.
  - `currentSelectedCalendar` / `currentCalendarCategory` — now set from `toWireTarget()`.
  - DOM: `#riteSelect` and `#APICalendarSelect` exist and are library-rendered.

- [ ] **Step 1: Replace the hand-written select with two mount points**

In `index.php`, replace:

```php
                <div class="col-6 col-md-4 col-lg-2">
                    <label for="APICalendarSelect"><?php echo _("Liturgical Calendar"); ?></label>
                    <select id="APICalendarSelect" class="form-select form-select-sm">
                        <option data-calendartype="nationalcalendar" data-rite="roman" value="VA"><?php echo _("General Roman"); ?></option>
                    </select>
                </div>
```

with:

```php
                <!-- Both selects are rendered by liturgy-components-js and linked to one another
                     (issue #48); index.js mounts them into these wrappers. Empty on purpose —
                     server-rendered options would be discarded on mount. -->
                <div class="col-6 col-md-4 col-lg-2" id="riteSelectMount"></div>
                <div class="col-6 col-md-4 col-lg-2" id="calendarSelectMount"></div>
```

Note on layout: the control row now totals 10 of 12 columns at `lg` (5 controls × 2), so the
status block that follows wraps onto its own row instead of sharing one. That is the intended
result; do not shrink the status block to force it back.

- [ ] **Step 2: Write the failing test**

Replace the whole of `e2e/rite-selection.spec.ts` with:

```typescript
import { test, expect, Page } from '@playwright/test';

/**
 * Rite awareness on the Calendars runner (issues #39, #48).
 *
 * #39 made the calendar dropdown rite-aware by hand; #48 replaced it with liturgy-components-js's
 * CalendarSelect linked to a RiteSelect. These specs therefore assert behaviour — what the rite
 * selection does to the calendar list and to the scaffold — rather than the markup of either
 * control, which is now the library's business and may change under us.
 */

const apiBase = `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}`;

/**
 * Waits for setupPage() to have rendered the live scaffold.
 *
 * Deliberately NOT `expect('#startTestRunnerBtn').toBeEnabled()`: the run button also requires a
 * live WebSocket connection, and playwright.config.ts starts no WebSocket server.
 */
const waitForLiveScaffold = async (page: Page) => {
    await page.waitForSelector('.sourcedata-tests > div', { timeout: 15000 });
};

const selectRite = async (page: Page, rite: string) => {
    await page.selectOption('#riteSelect', rite);
    await waitForLiveScaffold(page);
};

test('both controls mount, and the rite select defaults to Roman', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    await expect(page.locator('#riteSelect')).toHaveCount(1);
    await expect(page.locator('#APICalendarSelect')).toHaveCount(1);
    await expect(page.locator('#riteSelect')).toHaveValue('roman');
    // The rite-level calendar is the empty option, and it is selected by default.
    await expect(page.locator('#APICalendarSelect')).toHaveValue('');
});

test('the calendar select partitions by the selected rite', async ({ page, request }) => {
    const metadata = (await (await request.get(`${apiBase}/calendars`)).json()).litcal_metadata;
    const ambrosianDioceses = metadata.diocesan_calendars
        .filter((d: { rite?: string }) => d.rite === 'ambrosian')
        .map((d: { calendar_id: string }) => d.calendar_id);
    expect(ambrosianDioceses.length).toBeGreaterThan(0);

    await page.goto('/');
    await waitForLiveScaffold(page);

    const valuesUnder = async () =>
        page.locator('#APICalendarSelect option').evaluateAll(
            (opts) => opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== '')
        );

    const roman = await valuesUnder();
    for (const id of ambrosianDioceses) {
        expect(roman).not.toContain(id);
    }

    await selectRite(page, 'ambrosian');
    const ambrosian = await valuesUnder();
    for (const id of ambrosianDioceses) {
        expect(ambrosian).toContain(id);
    }
    // The Ambrosian rite has no national tier, so no two-letter nation codes survive.
    expect(ambrosian.filter((v) => /^[A-Z]{2}$/.test(v))).toEqual([]);
});

test('the empty option names the rite-level calendar under each rite', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    const emptyLabel = () =>
        page.locator('#APICalendarSelect option[value=""]').first().textContent();

    const romanLabel = await emptyLabel();
    expect(romanLabel).not.toBe('---');
    expect(romanLabel).not.toBe('');

    await selectRite(page, 'ambrosian');
    const ambrosianLabel = await emptyLabel();
    expect(ambrosianLabel).not.toBe('---');
    expect(ambrosianLabel).not.toBe(romanLabel);
});

test('the rite-level calendar is named by its rite, not by VA', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    // Card classes are built from the calendar id we send; General Roman is now `roman`.
    await expect(page.locator('.calendar-roman').first()).toHaveCount(1);
    await expect(page.locator('.calendar-va')).toHaveCount(0);

    await selectRite(page, 'ambrosian');
    await expect(page.locator('.calendar-ambrosian').first()).toHaveCount(1);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test e2e/rite-selection.spec.ts --project=chromium`

Expected: FAIL — `#riteSelect` has count 0; the scaffold never renders because `#APICalendarSelect` is empty.

- [ ] **Step 4: Import the library and the shared helpers**

At the top of `assets/js/index.js`, after the existing `import { sendCancelRun } from './wsProtocol.js';` line, replace that import with:

```javascript
import {
    sendCancelRun,
    toWireTarget,
    universalChecksForRite,
    testAppliesToRite,
    CALENDAR_SCOPE_KEYS,
} from './wsProtocol.js';

import {
    ApiClient,
    ApiBase,
    CalendarSelect,
    RiteSelect,
    CalendarSelectFilter,
} from '@liturgical-calendar/components-js';
```

- [ ] **Step 5: Add the API base URL helper and the mount function**

In `assets/js/index.js`, immediately after `setEndpoints()` (which currently ends at line 174), add:

```javascript
/**
 * The API's base URL, without a trailing slash and without an endpoint.
 *
 * `setEndpoints()` builds per-endpoint URLs from the same parts; this is what ApiClient and
 * ApiBase want instead. Derived rather than stored so the two cannot drift.
 *
 * @returns {string}
 */
const getApiBaseUrl = () => {
    const endpoint = ENDPOINTS.CALENDARS;
    return endpoint.replace(/\/calendars$/, '');
};

/**
 * The loaded metadata base shared by the library's selects and by our own check builders.
 *
 * One instance, so `/calendars` is fetched once rather than once per consumer, and so the
 * dioceses our checks iterate are exactly the ones the calendar select offers.
 *
 * @type {?import('@liturgical-calendar/components-js').ApiBase}
 */
let apiBase = null;

/** @type {?RiteSelect} */
let riteSelect = null;

/** @type {?CalendarSelect} */
let calendarSelect = null;

/**
 * Mounts the rite select and the calendar select, linked to one another.
 *
 * Order matters and is enforced by the library: `linkToRiteSelect()` attaches a listener to the
 * rite select's DOM element, so that element must already be mounted. Linking also switches the
 * calendar select into rite-aware mode, which is what makes its empty option self-label as the
 * rite-level calendar ("General Roman Calendar" / "Ambrosian Calendar") instead of "---".
 *
 * `linkToRiteSelect()` defaults to dispatching `change` on the calendar select after every rite
 * change and after the initial apply, which is what drives our own change handler and therefore
 * `setupPage()`. Do not pass `false` — nothing else would rebuild the scaffold.
 *
 * @returns {Promise<void>}
 */
const mountCalendarControls = async () => {
    const baseUrl = getApiBaseUrl();
    try {
        await ApiClient.init( baseUrl );
    } catch ( err ) {
        // A CDN or metadata failure leaves both mount points empty. Say so: without this the page
        // shows a control-less header and an empty scaffold, which reads like "nothing to check"
        // rather than like a failure, and the run button stays disabled with no explanation.
        console.error( 'Could not initialise the calendar controls', err );
        safeToastShow( '#controls-load-failed' );
        return;
    }
    apiBase = ApiBase.resolve( baseUrl );

    riteSelect = new RiteSelect( locale )
        .id( 'riteSelect' )
        .class( 'form-select form-select-sm' )
        .label( { class: 'form-label', text: riteSelectLabelText } );
    riteSelect.appendTo( '#riteSelectMount' );

    calendarSelect = new CalendarSelect( locale )
        .filter( CalendarSelectFilter.NONE )
        .allowNull( true )
        .id( 'APICalendarSelect' )
        .class( 'form-select form-select-sm' )
        .label( { class: 'form-label', text: calendarSelectLabelText } );
    calendarSelect.appendTo( '#calendarSelectMount' );

    calendarSelect.linkToRiteSelect( riteSelect );

    riteSelect._domElement.addEventListener( 'change', () => {
        currentRite = riteSelect._domElement.value;
    } );
};
```

Then add the toast this references. In `index.php`, after the `results-load-failed` toast block,
add:

```php
            <div class="toast align-items-center text-white bg-danger border-0 p-3 shadow" aria-live="assertive" role="alert" id="controls-load-failed">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-triangle-exclamation fa-fw"></i> <?php echo _("Could not load the calendar controls."); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
```

`safeToastShow` is already imported from `common.js` in `assets/js/index.js`; no import change.

- [ ] **Step 6: Supply the two label strings from PHP**

The library renders its own labels, so the two `<label>` elements removed in Step 1 take their
text from `window.LitCalConfig`. In `layout/footer.php`, inside the `window.LitCalConfig`
object literal, add these two entries after the `riteLabels:` line:

```php
            riteSelectLabel: <?php echo json_encode(_('Liturgical Rite')); ?>,
            calendarSelectLabel: <?php echo json_encode(_('Liturgical Calendar')); ?>,
```

Then, in `assets/js/index.js`, extend the destructuring on line 37 to pull them out:

```javascript
const { locale, WS_PROTOCOL, WS_PORT, WS_HOST, API_PROTOCOL, API_PORT, API_HOST, API_BASE_PATH, APP_ENV, riteLabels = {}, riteSelectLabel: riteSelectLabelText = 'Liturgical Rite', calendarSelectLabel: calendarSelectLabelText = 'Liturgical Calendar' } = window.LitCalConfig;
```

- [ ] **Step 7: Rewrite the calendar change handler**

In `assets/js/index.js`, replace the body of the `#APICalendarSelect` change listener (currently
lines 1557–1586) with a listener attached after mount. Delete this block:

```javascript
document.querySelector('#APICalendarSelect').addEventListener('change', ( ev ) => {
```

…through its closing `});`, and replace with:

```javascript
/**
 * Reacts to a calendar or rite change.
 *
 * Attached after `mountCalendarControls()` rather than at module scope: the element does not
 * exist until the library renders it. Registered once, on the element the library created.
 *
 * `currentRite` is read from the rite select, not from the option — the library's options carry
 * no `data-rite`, because the rite is the select's own state now rather than each option's.
 */
const handleCalendarSelectChange = () => {
    const pageLoader = document.querySelector('.page-loader');
    if (pageLoader) {
        pageLoader.style.display = 'block';
        pageLoader.style.opacity = '1';
    }
    ReadyToRunTests.PageReady = false;

    const oldSelectedCalendar = currentSelectedCalendar;
    const selectEl = calendarSelect._domElement;
    const selectedOption = selectEl.options[ selectEl.selectedIndex ] ?? null;
    currentRite = riteSelect._domElement.value;

    const target = toWireTarget(
        selectEl.value,
        selectedOption?.dataset?.calendartype ?? '',
        currentRite
    );
    currentSelectedCalendar = target.calendar;
    currentCalendarCategory = target.category;

    if ( currentCalendarCategory === 'diocesancalendar' ) {
        // The library's diocese options carry no parent-nation attribute, so resolve it from the
        // same loaded metadata the select was built from.
        const diocesanData = apiBase
            .diocesanCalendars( currentRite )
            .find( entry => entry.calendar_id === currentSelectedCalendar );
        currentNationalCalendar = diocesanData ? diocesanData.nation : null;
    } else if ( currentCalendarCategory === 'ritecalendar' ) {
        // A rite-level calendar has no national calendar. null (rather than the calendar id) keeps
        // `scope.national_calendars.includes( currentNationalCalendar )` false, so national-scoped
        // tests are correctly excluded from it.
        currentNationalCalendar = null;
    } else {
        currentNationalCalendar = currentSelectedCalendar;
    }

    console.log( 'currentCalendarCategory = ' + currentCalendarCategory + ', currentRite = ' + currentRite );
    document.querySelectorAll(`.calendar-${slugify(oldSelectedCalendar)}`).forEach(el => {
        el.classList.remove(`calendar-${slugify(oldSelectedCalendar)}`);
        el.classList.add(`calendar-${slugify(currentSelectedCalendar)}`);
    });
    setupPage();
    ReadyToRunTests.tryEnableBtn();
};
```

- [ ] **Step 8: Change the defaults and call the mount**

In `assets/js/index.js`, change the three initial values (currently lines 479–481) from:

```javascript
let currentSelectedCalendar = "VA";
let currentNationalCalendar = "VA";
let currentCalendarCategory = "nationalcalendar";
```

to:

```javascript
// The rite-level calendar of the default rite, which is what the calendar select's empty option
// selects on mount. Not 'VA': `Health::buildCalendarRequestPath()` resolves both to /roman/{year},
// but Vatican City is to gain its own national calendar data distinct from the General Roman
// Calendar, so the two must stop sharing an identifier.
let currentSelectedCalendar = "roman";
let currentNationalCalendar = null;
let currentCalendarCategory = "ritecalendar";
```

Then find where the page currently bootstraps (the call site that runs `setEndpoints()` and then
loads async data) and, immediately after `setEndpoints()`, await the mount and register the
listener:

```javascript
    setEndpoints();
    await mountCalendarControls();
    calendarSelect._domElement.addEventListener( 'change', handleCalendarSelectChange );
```

If the enclosing function is not already `async`, make it `async`. If the bootstrap is not inside
a function, wrap the two new lines in an IIFE:

```javascript
    ( async () => {
        await mountCalendarControls();
        calendarSelect._domElement.addEventListener( 'change', handleCalendarSelectChange );
    } )();
```

- [ ] **Step 9: Delete the dead option-building code**

In `assets/js/index.js`, inside `setupPage()`, delete the entire population block — from
`const apiCalendarSelect = document.querySelector('#APICalendarSelect');` through
`apiCalendarSelect.dataset.populated = 'true';` and its closing brace (currently lines 1445–1472).
The library owns the options now.

Also delete the now-unused `riteLabel()` helper and the `RiteCalendars` variable **only if** no
other reference remains. Verify with:

```bash
grep -n "riteLabel\|RiteCalendars\|selectOptions\|CalendarNations" assets/js/index.js
```

Delete only the declarations whose every reference is inside the block just removed. Leave the
rest.

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx playwright test e2e/rite-selection.spec.ts --project=chromium`

Expected: PASS, 4 tests.

- [ ] **Step 11: Run the full suite**

Run: `npx playwright test --project=chromium`

Expected: `result-painting.spec.ts` and the replay specs may fail on `.calendar-va`. Fix those by
replacing `calendar-va` with `calendar-roman` and `'VA'` with `'roman'` where they denote the
General Roman Calendar. Do **not** change occurrences that denote the Vatican national calendar as
an entry in `/calendars` metadata.

- [ ] **Step 12: Lint and commit**

```bash
vendor/bin/phpcs
git add index.php layout/footer.php assets/js/index.js e2e/
git commit -m "feat(index): mount a linked RiteSelect and CalendarSelect"
```

---

### Task 4: Build `index.php`'s source-data checks from the shared inventory

**Files:**

- Modify: `assets/js/index.js`
- Test: `e2e/rite-selection.spec.ts` (extend)

**Interfaces:**

- Consumes: `universalChecksForRite`, `testAppliesToRite`, `CALENDAR_SCOPE_KEYS` from Task 2; `apiBase` from Task 3.
- Produces: `currentSourceDataChecks` entries may now carry `sourceFolder` instead of `sourceFile`.

- [ ] **Step 1: Write the failing test**

Append to `e2e/rite-selection.spec.ts`:

```typescript
test('the source-data scaffold follows the rite, and covers i18n folders', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);

    const cardClasses = async () =>
        page.locator('.sourcedata-tests .card').evaluateAll(
            (els) => els.map((e) => e.className)
        );

    const roman = (await cardClasses()).join(' ');
    expect(roman).toContain('propriumdetempore');
    expect(roman).toContain('propriumdetemporei18n');
    expect(roman).toContain('memorialsfromdecrees');
    expect(roman).toContain('memorialsfromdecreesi18n');
    expect(roman).not.toContain('ambrosianpropriumdetempore');

    await selectRite(page, 'ambrosian');
    const ambrosian = (await cardClasses()).join(' ');
    expect(ambrosian).toContain('ambrosianpropriumdetempore');
    expect(ambrosian).toContain('ambrosianpropriumdetemporei18n');
    expect(ambrosian).toContain('ambrosianpropriumdesanctis');
    expect(ambrosian).toContain('ambrosianpropriumdesanctisi18n');
    // The Roman corpus is gone, not merely joined.
    expect(ambrosian).not.toContain('memorialsfromdecrees');
});

test('an i18n folder card names its folder rather than "undefined"', async ({ page }) => {
    await page.goto('/');
    await waitForLiveScaffold(page);
    const titles = await page.locator('.sourcedata-tests p span[title]').evaluateAll(
        (els) => els.map((e) => e.getAttribute('title'))
    );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles).not.toContain('undefined');
    expect(titles.some((t) => (t ?? '').endsWith('/i18n'))).toBe(true);
});

test('accuracy tests are filtered by rite', async ({ page, request }) => {
    const tests = (await (await request.get(`${apiBase}/tests`)).json()).litcal_tests;
    const ambrosianOnly = tests.filter(
        (t: any) => (t.applies_to?.rite ?? t.appliesTo?.rite) === 'ambrosian'
    );
    test.skip(ambrosianOnly.length === 0, 'no Ambrosian tests published');

    await page.goto('/');
    await waitForLiveScaffold(page);

    const names = async () =>
        page.locator('#specificUnitTestsAccordion .accordion-item').evaluateAll(
            (els) => els.map((e) => e.id)
        );

    const underRoman = (await names()).join(' ');
    for (const t of ambrosianOnly) {
        expect(underRoman).not.toContain(t.name.toLowerCase());
    }

    await selectRite(page, 'ambrosian');
    const underAmbrosian = (await names()).join(' ');
    for (const t of ambrosianOnly) {
        expect(underAmbrosian).toContain(t.name.toLowerCase());
    }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test e2e/rite-selection.spec.ts --project=chromium`

Expected: the three new tests FAIL — no `*i18n` cards exist, and folder cards would render
`title="undefined"`.

- [ ] **Step 3: Teach the card template about folders**

In `assets/js/index.js`, inside `sourceDataCheckTemplate()`, change:

```javascript
    const escapedSourceFile = escapeHtmlAttr(item.sourceFile);
```

to:

```javascript
    // A check names either a single file or a folder of i18n files, never both. Reading only
    // `sourceFile` rendered `title="undefined"` for every folder check; index.js never sent one
    // before #48 added the i18n folders to the universal corpus.
    const escapedSourceFile = escapeHtmlAttr(item.sourceFile ?? item.sourceFolder ?? '');
```

- [ ] **Step 4: Replace the universal check builder**

In `assets/js/index.js`, delete `ROMAN_SOURCE_DATA_PATH`, `AMBROSIAN_SOURCE_DATA_PATH` and the
whole of `buildUniversalSourceDataChecks()` (currently lines 74–147). Replace them with:

```javascript
/**
 * The universal source-data checks for a rite, plus the two API-path checks this page renders
 * alongside them.
 *
 * The corpus itself comes from `wsProtocol.js` so that `resources.js` checks the same files under
 * the same names. The `/calendars` metadata check is rite-independent and belongs to no rite's
 * corpus, so it is added here rather than listed there.
 *
 * @param {string} rite - The rite identifier, e.g. 'roman' or 'ambrosian'.
 * @returns {Array<{validate: string, category: string, sourceFile?: string, sourceFolder?: string}>}
 */
const buildUniversalSourceDataChecks = ( rite ) => [
    {
        "validate": "LitCalMetadata",
        "sourceFile": ENDPOINTS.CALENDARS,
        "category": "universalcalendar"
    },
    ...universalChecksForRite( rite )
];
```

- [ ] **Step 5: Derive the rite-level Roman sanctorale from `/missals`**

`buildUniversalSourceDataChecks()` no longer hardcodes the 1970/2002/2008 sanctorale files, so the
rite-level Roman calendar must derive them. In `assets/js/index.js`, inside `setupPage()`, replace:

```javascript
    if ( currentCalendarCategory === 'ritecalendar' ) {
        // A rite level calendar has no national or diocesan layer: its source data is exactly the
        // universal corpus of its own rite.
        currentSourceDataChecks = buildUniversalSourceDataChecks( currentRite );
    } else if ( currentSelectedCalendar === 'VA' ) {
        currentSourceDataChecks = buildUniversalSourceDataChecks( 'roman' );
    } else {
```

with:

```javascript
    if ( currentCalendarCategory === 'ritecalendar' ) {
        // A rite-level calendar has no national or diocesan layer: its source data is the universal
        // corpus of its own rite, plus — for the Roman rite — the editio typica missals, which the
        // General Roman Calendar uses and no national calendar supplies. Derived from /missals
        // rather than hardcoded, so a new editio typica needs no edit here.
        currentSourceDataChecks = buildUniversalSourceDataChecks( currentRite );
        if ( currentRite === 'roman' ) {
            Object.values( RomanMissals )
                .filter( missalDef => missalDef.region === 'VA' )
                .forEach( missalDef => {
                    currentSourceDataChecks.push({
                        "validate": `proprium-de-sanctis-${missalDef.year_published}`,
                        "sourceFile": missalDef.missal_id,
                        "category": "sourceDataCheck"
                    });
                } );
        }
    } else {
```

- [ ] **Step 6: Use the shared test-scope helpers**

In `assets/js/index.js`, delete the local `CALENDAR_SCOPE_KEYS` constant and the local
`testAppliesToCurrentRite()` function (currently lines 1220–1250). Then, in `setupPage()`, change:

```javascript
        if ( false === testAppliesToCurrentRite( unitTest ) ) {
```

to:

```javascript
        if ( false === testAppliesToRite( unitTest, currentRite ) ) {
```

`handleAppliesToOrFilter()` continues to use `CALENDAR_SCOPE_KEYS`, now imported rather than
declared locally. No change to its body.

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx playwright test e2e/rite-selection.spec.ts --project=chromium`

Expected: PASS, 7 tests.

- [ ] **Step 8: Verify the checks actually run against a live server**

This is the first task whose output crosses the wire, so verify it end to end rather than only in
the scaffold. Start the stack:

```bash
# in ../LiturgicalCalendarAPI
docker compose up -d db litcal-migrate
composer start      # :8000
composer ws:start   # :8082
# in this repository
php -S localhost:3003
```

Open `http://localhost:3003/`, select the Ambrosian rite, click **Run Tests**, and confirm every
source-data card turns green. Any card reading *"Unable to detect schema for dataPath …"* means a
`validate` value or path in `UNIVERSAL_CHECKS` does not match the server's inventory — fix the
entry, do not special-case the card.

- [ ] **Step 9: Commit**

```bash
git add assets/js/index.js e2e/rite-selection.spec.ts
git commit -m "feat(index): scope source-data checks by rite, covering the Ambrosian corpus"
```

---

### Task 5: Add the `RiteSelect` and rite filtering to `resources.php`

**Files:**

- Modify: `resources.php` (the control row, lines 76–90)
- Modify: `assets/js/resources.js`
- Test: `e2e/resources-rite.spec.ts` (create)

**Interfaces:**

- Consumes: `universalChecksForRite`, `inRiteScope` from Task 2; the import map from Task 1.
- Produces: `currentRite` in `assets/js/resources.js`; rite-qualified `/data` and `/events` URLs.

- [ ] **Step 1: Add the mount point**

In `resources.php`, insert immediately before the `APIResponseSelect` column:

```php
                <!-- Rendered by liturgy-components-js; resources.js mounts it here (issue #48). -->
                <div class="col-6 col-md-4 col-lg-2" id="riteSelectMount"></div>
```

- [ ] **Step 2: Write the failing test**

Create `e2e/resources-rite.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test';

/**
 * Rite scoping on the Resources runner (issue #48).
 *
 * resources.php is the exhaustive page: it health-checks every API path and every calendar the
 * API supports. The rite selection narrows only what is rite-partitioned. National and
 * wider-region resources are Roman-only — RegionalDataParams::validateRiteCompatibility()
 * rejects them under a non-Roman rite — so they disappear under Ambrosian rather than being
 * requested and failing.
 */

const waitForScaffold = async (page: Page) => {
    await page.waitForSelector('.sourcedata-tests > div', { timeout: 20000 });
};

const selectRite = async (page: Page, rite: string) => {
    await page.selectOption('#riteSelect', rite);
    await waitForScaffold(page);
};

const cardMarkup = async (page: Page) =>
    (await page.locator('.sourcedata-tests, .resourcedata-tests').evaluateAll(
        (els) => els.map((e) => e.innerHTML)
    )).join(' ');

test('the rite select mounts and defaults to Roman', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);
    await expect(page.locator('#riteSelect')).toHaveCount(1);
    await expect(page.locator('#riteSelect')).toHaveValue('roman');
});

test('the rite-independent collection endpoints are checked under both rites', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const required = [
        'calendars-path',
        'decrees-path',
        'tests-path',
        'easter-path',
        'schemas-path',
        'missals-path',
    ];

    const roman = await cardMarkup(page);
    for (const slug of required) {
        expect(roman).toContain(slug);
    }

    await selectRite(page, 'ambrosian');
    const ambrosian = await cardMarkup(page);
    for (const slug of required) {
        expect(ambrosian).toContain(slug);
    }
});

test('national, wider-region and per-missal checks are Roman-only', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const roman = await cardMarkup(page);
    expect(roman).toContain('national-calendar-');
    expect(roman).toContain('wider-region-');
    expect(roman).toContain('proprium-de-sanctis-');

    await selectRite(page, 'ambrosian');
    const ambrosian = await cardMarkup(page);
    expect(ambrosian).not.toContain('national-calendar-');
    expect(ambrosian).not.toContain('wider-region-');
    expect(ambrosian).not.toContain('proprium-de-sanctis-');
});

test('the universal corpus and test corpus follow the rite', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const roman = await cardMarkup(page);
    expect(roman.toLowerCase()).toContain('propriumdetempore');
    expect(roman.toLowerCase()).not.toContain('ambrosianpropriumdetempore');

    await selectRite(page, 'ambrosian');
    const ambrosian = await cardMarkup(page);
    expect(ambrosian.toLowerCase()).toContain('ambrosianpropriumdetempore');
    expect(ambrosian.toLowerCase()).toContain('ambrosianpropriumdesanctis');
});

test('every per-nation and per-diocese URL names its rite explicitly', async ({ page }) => {
    await page.goto('/resources.php');
    await waitForScaffold(page);

    const urls = async () =>
        page.locator('[title]').evaluateAll(
            (els) => els.map((e) => e.getAttribute('title') ?? '')
                       .filter((t) => t.includes('/data/') || t.includes('/events/'))
        );

    for (const rite of ['roman', 'ambrosian']) {
        if (rite === 'ambrosian') {
            await selectRite(page, rite);
        }
        for (const url of await urls()) {
            // An unprefixed /data/nation/IT or /events/diocese/x resolves to Roman silently,
            // which would be a wrong-green under the Ambrosian rite.
            expect(url).toMatch(/\/(data|events)\/(roman|ambrosian)\//);
        }
    }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx playwright test e2e/resources-rite.spec.ts --project=chromium`

Expected: FAIL — `#riteSelect` has count 0.

- [ ] **Step 4: Import the library and the shared helpers**

In `assets/js/resources.js`, replace:

```javascript
import { sendCancelRun } from './wsProtocol.js';
```

with:

```javascript
import {
    sendCancelRun,
    universalChecksForRite,
    inRiteScope,
} from './wsProtocol.js';

import { ApiClient, ApiBase, RiteSelect } from '@liturgical-calendar/components-js';
```

And extend the `window.LitCalConfig` destructuring with the label added in Task 3:

```javascript
const { locale, WS_PROTOCOL, WS_PORT, WS_HOST, API_PROTOCOL, API_PORT, API_HOST, API_BASE_PATH, APP_ENV, riteSelectLabel: riteSelectLabelText = 'Liturgical Rite' } = window.LitCalConfig;
```

- [ ] **Step 5: Replace the static source-data list and add rite state**

In `assets/js/resources.js`, replace the entire `const sourceDataChecks = [ … ];` literal
(currently lines 242–268) with:

```javascript
/**
 * The liturgical rite currently selected. Drives which checks are built.
 * @type {string}
 */
let currentRite = 'roman';

/**
 * The source data checks for the current run, rebuilt on every rite change.
 *
 * Starts as the universal corpus of the selected rite — shared with index.js via wsProtocol.js,
 * so both pages check the same files under the same names — and is then extended by
 * `loadAsyncData()` with the wider-region, national, missal, diocesan and test entries.
 *
 * @type {Array<{validate: string, category: string, sourceFile?: string, sourceFolder?: string}>}
 */
let sourceDataChecks = universalChecksForRite( currentRite );
```

Note: `sourceDataChecks` changes from `const` to `let` because it is now reassigned on a rite
change. Every existing `sourceDataChecks.push(...)` call site still works unchanged.

- [ ] **Step 6: Rite-qualify the resource URLs and filter the dynamic checks**

In `assets/js/resources.js`, inside `loadAsyncData()`:

Wrap the wider-region loop so it runs only under Roman:

```javascript
                // Wider regions exist only in the Roman rite: RegionalDataParams
                // ::validateRiteCompatibility() rejects a wider-region request under any other,
                // so building these under Ambrosian would issue requests the API refuses.
                if ( currentRite === 'roman' ) {
                    wider_regions.forEach(region => {
```

…and close the added `if` after that loop. Inside it, change the resource URL to:

```javascript
                        "sourceFile": ENDPOINTS.DATA + `/roman/widerregion/${widerRegion}?locale=${widerRegionFirstLang}`,
```

Wrap the national-calendar loop the same way:

```javascript
                // National calendars are Roman-only for the same reason as wider regions.
                if ( currentRite === 'roman' ) {
                    national_calendars.slice(1).forEach(nationalCalendar => {
```

…and inside it change both resource URLs to:

```javascript
                            "sourceFile": ENDPOINTS.DATA + `/roman/nation/${nation}?locale=${locale}`,
```

```javascript
                            "sourceFile": ENDPOINTS.EVENTS + `/roman/nation/${nation}?locale=${locale}`,
```

Filter the diocesan loop by rite and rite-qualify its URLs:

```javascript
                // The diocesan tier is the only one that exists under more than one rite.
                diocesan_calendars
                    .filter( diocesanCalendar => inRiteScope( diocesanCalendar, currentRite ) )
                    .forEach(diocesanCalendar => {
```

…and inside it change both resource URLs to:

```javascript
                            "sourceFile": ENDPOINTS.DATA + `/${currentRite}/diocese/${diocese}?locale=${locale}`,
```

```javascript
                            "sourceFile": ENDPOINTS.EVENTS + `/${currentRite}/diocese/${diocese}?locale=${locale}`,
```

Wrap the whole `Missals.forEach(...)` body in the Roman-only guard:

```javascript
                // /missals lists Roman editions only — RomanMissal carries no Ambrosian edition,
                // and the Ambrosian sanctorale reaches the inventory as an explicit item instead.
                if ( currentRite === 'roman' ) {
                    Missals.forEach(missal => {
```

Filter the tests loop by rite, replacing the existing `const rite = …` guard body:

```javascript
                data.litcal_tests.forEach(test => {
                    // Since API #787 the test corpus is rite-partitioned on disk:
                    // jsondata/tests/{rite}/{name}.json. `rite` is a required property of
                    // `applies_to` since API #785 (falling back to the legacy `appliesTo`).
                    const rite = test.applies_to?.rite ?? test.appliesTo?.rite;
                    if (!rite) {
                        console.warn(`Test ${test.name} has no applies_to.rite; skipping its source-data check`);
                        return;
                    }
                    if ( rite !== currentRite ) {
                        return;
                    }
                    sourceDataChecks.push({
                        "validate": `tests-${test.name}`,
                        "sourceFile": `jsondata/tests/${rite}/${test.name}.json`,
                        "category": "sourceDataCheck"
                    });
                })
```

Note: the bare `/events` collection check in `resourceDataChecks` stays **unprefixed**.
`Health::retrieveSchemaForCategory()` resolves a rite-qualified resource URL only through arms
that require `nation/` or `diocese/` after the rite segment, so `/events/roman` would resolve no
schema at all. That gap is recorded in the follow-up issue in Task 6.

- [ ] **Step 7: Mount the rite select and rebuild on change**

In `assets/js/resources.js`, add before `loadAsyncData()`:

```javascript
/**
 * The API's base URL, without a trailing slash and without an endpoint.
 * @returns {string}
 */
const getApiBaseUrl = () => ENDPOINTS.CALENDARS.replace(/\/calendars$/, '');

/** @type {?RiteSelect} */
let riteSelect = null;

/**
 * Mounts the rite select.
 *
 * No CalendarSelect here: this page is exhaustive rather than calendar-scoped — it checks every
 * calendar the API supports, so there is nothing to select between.
 *
 * A rite change resets every check list and re-runs the whole discovery pass, because the rite
 * determines which calendars, missals and tests are in scope, not merely how they are labelled.
 *
 * @returns {Promise<void>}
 */
const mountRiteSelect = async () => {
    const baseUrl = getApiBaseUrl();
    try {
        await ApiClient.init( baseUrl );
    } catch ( err ) {
        // Same reasoning as index.js: an unmounted control must not look like an empty result set.
        console.error( 'Could not initialise the rite select', err );
        safeToastShow( '#controls-load-failed' );
        return;
    }
    ApiBase.resolve( baseUrl );

    riteSelect = new RiteSelect( locale )
        .id( 'riteSelect' )
        .class( 'form-select form-select-sm' )
        .label( { class: 'form-label', text: riteSelectLabelText } );
    riteSelect.appendTo( '#riteSelectMount' );

    riteSelect._domElement.addEventListener( 'change', ( ev ) => {
        currentRite = ev.target.value;
        resetCheckListsForRite();
        loadAsyncData();
    } );
};

/**
 * Returns every check list to its pre-discovery state for the newly selected rite.
 *
 * `resourceDataChecks` is truncated to its static head — the rite-independent collection
 * endpoints — rather than rebuilt, so the URLs `setEndpoints()` wrote into it survive.
 *
 * @returns {void}
 */
const resetCheckListsForRite = () => {
    const STATIC_RESOURCE_CHECK_COUNT = 7;
    resourceDataChecks.length = STATIC_RESOURCE_CHECK_COUNT;
    Object.keys( resourcePaths )
        .filter( key => /^(data-path|events-path|missals-path)-/.test( key ) )
        .forEach( key => delete resourcePaths[ key ] );
    sourceDataChecks = universalChecksForRite( currentRite );
    ReadyToRunTests.MetaDataReady = false;
    ReadyToRunTests.MissalsReady  = false;
    ReadyToRunTests.TestsReady    = false;
};
```

Add the same toast to `resources.php`, after its last existing toast block:

```php
            <div class="toast align-items-center text-white bg-danger border-0 p-3 shadow" aria-live="assertive" role="alert" id="controls-load-failed">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-triangle-exclamation fa-fw"></i> <?php echo _("Could not load the calendar controls."); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
```

`safeToastShow` is already imported from `common.js` in `assets/js/resources.js`.

Then, at the page bootstrap, immediately after `setEndpoints()`, await the mount before
`loadAsyncData()` runs:

```javascript
    setEndpoints();
    await mountRiteSelect();
    loadAsyncData();
```

If the enclosing function is not `async`, make it so, or wrap in an IIFE as in Task 3 Step 8.

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx playwright test e2e/resources-rite.spec.ts --project=chromium`

Expected: PASS, 5 tests.

- [ ] **Step 9: Verify against a live server**

With the stack from Task 4 Step 8 running, open `http://localhost:3003/resources.php`, select the
Ambrosian rite, and click **Run Tests**. Confirm:

- Every card turns green or red — none reads *"Unable to detect schema for dataPath …"*.
- The four Ambrosian diocesan cards resolve (this requires LiturgicalCalendarAPI #813).
- The success + failure counts equal the rendered card count. A mismatch means a check was sent
  without a card, or vice versa.

- [ ] **Step 10: Run the full suite, lint and commit**

```bash
npx playwright test --project=chromium
vendor/bin/phpcs
git add resources.php assets/js/resources.js e2e/resources-rite.spec.ts
git commit -m "feat(resources): scope checks by rite and send rite-qualified URLs"
```

---

### Task 6: Update `CLAUDE.md` and file the follow-ups

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: everything from Tasks 1–5.
- Produces: documentation only.

- [ ] **Step 1: Correct the source-data vocabulary section**

In `CLAUDE.md`, in the subsection headed *`universalcalendar` — when the message carries a path*, replace the
sentence beginning *"The universal checks built by `buildUniversalSourceDataChecks()`"* with:

```markdown
The universal source corpus is defined once, in `assets/js/wsProtocol.js`'s `UNIVERSAL_CHECKS`, and
consumed by both runner pages. Every entry uses `category: "universalcalendar"` with a real path,
including the `i18n` folder entries: the server resolves that category's schema from the path
through `CheckableInventory::byPath()`, which covers all eight items, and its `sourceFolder`
handling branches on the property rather than on the category.

Before issue #48 the two pages disagreed about these files — `index.js` sent `PropriumDeTempore`
under `universalcalendar` while `resources.js` sent `proprium-de-tempore` under `sourceDataCheck`,
for the same file on disk. They now send one vocabulary.
```

- [ ] **Step 2: Correct the `sourceFolder` claim**

In `CLAUDE.md`, find the sentence *"Only `resources.js` currently sends `sourceFolder`."* and
replace it with:

```markdown
Both runner pages send `sourceFolder`, for the `i18n` folder entries in `UNIVERSAL_CHECKS` as well
as for the wider-region, national, diocesan and missal `-i18n` checks that `resources.js` builds.
```

- [ ] **Step 3: Document the rite scoping**

In `CLAUDE.md`, after the `### Source Data Validation Categories` section, add:

```markdown
### Rite Scoping

Both runner pages carry a `RiteSelect` from `@liturgical-calendar/components-js`, defaulting to
`roman`. The predicate is `inRiteScope()` in `assets/js/wsProtocol.js`; an absent `rite` means
Roman, never "every rite", because a fail-open filter would request Roman-only resources under the
Ambrosian rite, which the API rejects.

Only the diocesan tier exists under more than one rite. National calendars, wider regions and the
`/missals` registry are Roman-only — `RegionalDataParams::validateRiteCompatibility()` rejects a
national or wider-region request under a non-Roman rite — so `resources.php` omits them entirely
when the Ambrosian rite is selected rather than requesting and failing them.

Per-nation and per-diocese `/data` and `/events` URLs are sent **rite-qualified**
(`/data/ambrosian/diocese/milano_it`); an unprefixed URL silently resolves to Roman, which would be
a wrong-green. Collection endpoints stay unprefixed: `Health::retrieveSchemaForCategory()` resolves
a rite-qualified resource URL only through arms requiring `nation/` or `diocese/` after the rite
segment, so `/events/roman` resolves no schema.

This requires LiturgicalCalendarAPI **#813**, which taught those regexes an optional
`(?:roman|ambrosian)/` segment and routed the diocesan path sites through
`JsonData::diocesanCalendarFileFor($rite)`.

On `index.php`, the calendar select is the library's, linked to the rite select. Its options carry
`data-calendartype="national"|"diocesan"` and no `data-rite`, and the rite-level calendar is its
empty option — `toWireTarget()` in `wsProtocol.js` maps all three onto the protocol's
`nationalcalendar` / `diocesancalendar` / `ritecalendar` vocabulary. The General Roman Calendar is
sent as `{calendar: 'roman', category: 'ritecalendar'}`, no longer as `VA`.
```

- [ ] **Step 4: Update the Key Files table**

In `CLAUDE.md`, add these rows to the `## Key Files` table, keeping the columns aligned:

```markdown
| `assets/js/wsProtocol.js`        | Shared WebSocket protocol helpers   |
| `assets/js/resources.js`         | Resources runner logic              |
```

- [ ] **Step 5: Lint the markdown**

Run: `composer lint:md`

Expected: clean. If MD060 fires, align the table columns.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: record the rite scoping and the unified source-data vocabulary"
```

- [ ] **Step 7: File the two follow-up issues**

Ask the user to confirm before creating either — the second lands in a different repository.

Issue in **this** repo:

```text
Title: resources.php does not health-check /temporale, /validations, or the rite-qualified collection endpoints

Three gaps, all noticed while implementing #48:

- `/temporale` and `/temporale/{event_key}` are never checked; the endpoint shipped after the
  page's check list was last extended.
- `/validations` is never checked; same reason (LiturgicalCalendarAPI#811).
- `/events/{rite}` and `/calendar/{rite}` cannot be checked at all.
  `Health::retrieveSchemaForCategory()` resolves a rite-qualified resource URL only through arms
  that require `nation/` or `diocese/` after the rite segment, and `getPathToSchemaFile()` matches
  collection routes exactly, so `/events/ambrosian` resolves no schema. The Ambrosian events
  catalogue is therefore unverifiable from this interface.
```

Issue in **LiturgicalCalendarAPI**:

```text
Title: openapi.json understates the /data route — the rite segment is undocumented

`Router::extractRiteSegment()` accepts an optional leading rite segment on `data`, exactly as it
does on `calendar` and `events`:

    if ($route === 'calendar' || $route === '' || $route === 'events' || $route === 'data') {

`openapi.json` documents only `/data/nation/{key}`, `/data/diocese/{key}` and
`/data/widerregion/{key}`, with no rite-qualified variants — while `/calendar` and `/events` both
document theirs. A client reading the schema cannot discover `/data/ambrosian/diocese/{key}`.

Note the asymmetry is real and should be documented as such: only the diocesan tier exists under
more than one rite, so `/data/ambrosian/nation/{key}` correctly does not exist.
```

---

## Self-Review

**Spec coverage:**

| Spec section                                         | Task |
|------------------------------------------------------|------|
| §1 Dependency and delivery                           | 1    |
| §2 `index.php` full adoption, wire mapping           | 3    |
| §2 `.calendar-va` → `.calendar-roman`                | 3    |
| §2 Accuracy-test filtering unchanged                 | 4    |
| §3 `resources.php` RiteSelect + filtering            | 5    |
| §3 Rite-qualified URLs                               | 5    |
| §3 Not-in-scope endpoints                            | 6    |
| §4 Shared `ApiBase`                                  | 3, 5 |
| §5 `UNIVERSAL_CHECKS`, `inRiteScope`, `toWireTarget` | 2    |
| Error handling: unmapped `calendartype` throws       | 2    |
| Testing: `rite-selection.spec.ts` rewrite            | 3, 4 |
| Testing: new resources spec                          | 5    |
| Documentation                                        | 1, 6 |

**Naming consistency:** `currentRite`, `riteSelect`, `calendarSelect`, `apiBase`,
`universalChecksForRite`, `inRiteScope`, `toWireTarget`, `testAppliesToRite`, `#riteSelectMount`,
`#calendarSelectMount`, `#riteSelect`, `#APICalendarSelect` are used identically across Tasks 2–6.

**Known asymmetry, accepted:** `resources.php` builds `-i18n` checks for each Roman missal;
`index.php` does not, and this plan does not add them. That predates #48 and is out of its scope —
the issue is about rite coverage, and the missal i18n gap is rite-independent.
