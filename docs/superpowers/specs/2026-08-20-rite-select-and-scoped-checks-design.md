# RiteSelect on the Runner Pages, and Rite-Scoped Checks

**Issue:** [#48](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/48)
**Date:** 2026-08-20
**Status:** Approved design

## Summary

Give `index.php` and `resources.php` a control for selecting the liturgical rite, and filter each page's checks
by that selection. On `index.php` the hand-written `#APICalendarSelect` is replaced by
`@liturgical-calendar/components-js`'s `CalendarSelect`, linked to its `RiteSelect`, so the calendar list is
partitioned by rite by the library rather than by our own option-building code. On `resources.php` the
`RiteSelect` stands alone.

The filtering predicate and the universal check inventory live in **one** place — `assets/js/wsProtocol.js`, the
shared module both runners already import — rather than being written twice.

## Goals

- A rite control on both runner pages, defaulting to Roman.
- `index.php`: source-data checks and accuracy tests scoped by **both** the selected rite and the selected calendar.
- `resources.php`: rite-scoped items filtered by the selected rite; rite-independent items always checked.
- Close the under-coverage the issue opens on: the Ambrosian temporale, the Ambrosian sanctorale, and both of
  their `i18n` folders become checkable.
- Retire the two divergent vocabularies for the same files (`PropriumDeTempore` + `universalcalendar` in
  `index.js` versus `proprium-de-tempore` + `sourceDataCheck` in `resources.js`).

## Non-Goals

- **Adopting `/validations`.** Issue [#42](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/42)
  owns that; see "Relationship to #42" below.
- **Converting `admin.php`** off `liturgical-calendar/components` (PHP). It is an unrelated surface and its
  future is settled on its own terms.
- **A coverage audit** against the advertised inventory. Considered and declined for this iteration.
- Any change to the WebSocket wire *format*. Both pages converge on one of the shapes the server already
  accepts; no new action, property or category is introduced, and no server change is required.

## Relationship to #42

`/validations` (LiturgicalCalendarAPI [#811](https://github.com/Liturgical-Calendar/LiturgicalCalendarAPI/pull/811),
merged) advertises a checkable inventory carrying `rite` and `region` per item — which reads like the natural
data source for this filtering. It is deliberately **not** consumed here.

Issue #42's proposed-work item 2 is verbatim *"Replace the hardcoded path constants with a fetch of the API's advertised
checkable inventory,"* and it gates that on the wire accepting an opaque id (`{"target": {"id":
"sanctorale:ambrosian:2024"}}`). `Health.php` has not adopted that: it still validates only `executeValidation`,
`validateCalendar`, `executeUnitTest` and `cancelRun`, all keyed on `{validate, sourceFile, category}`. The
`/validations` payload also carries no `path`.

Consuming the inventory now would therefore buy the ids without a wire that accepts them: we would keep every
hardcoded path #42 exists to delete, *plus* a new `id → {validate, sourceFile, category}` mapping layer that #42
also deletes. That is throwaway work.

What does survive the migration is the predicate. `item.rite === selectedRite` reads the same whether `rite` comes
from a local literal or from a fetched inventory, so landing it now in `wsProtocol.js` is work #42 inherits rather
than unpicks.

## Design Decisions (confirmed)

| Decision                     | Choice                                                                                            |
|------------------------------|---------------------------------------------------------------------------------------------------|
| Inventory source             | **Hardcoded list** in `wsProtocol.js`; `/validations` adoption deferred wholesale to #42          |
| Component library            | **`@liturgical-calendar/components-js`** (ESM), not `liturgy-components-php`                      |
| `index.php` calendar control | **Full adoption** — library `CalendarSelect` linked to `RiteSelect`, replacing our hand-built one |
| `resources.php` control      | **`RiteSelect` only** — the page is exhaustive, not calendar-scoped                               |
| `resources.php` filter rule  | Rite narrows only rite-scoped items; bare API paths, wider regions and nations always run         |
| Delivery                     | **Import map + pinned CDN `+esm`**, mirroring `LiturgicalCalendarFrontend`                        |

## Architecture

### 1. Dependency and delivery

The repo has no bundler, `node_modules/` is gitignored, and the Dockerfile copies no JS dependencies. Third-party
JS already arrives from CDNs (Bootstrap, sb-admin, Font Awesome, Isotope). `@liturgical-calendar/components-js` has
**zero runtime dependencies**, is pure ESM, and declares `exports: "./dist/index.js"` — so it loads from a CDN with
no build step.

`layout/footer.php` emits an import map immediately before the page module script, mirroring
`LiturgicalCalendarFrontend/layout/footer.php`:

```php
$componentsJsUrl = ( $_ENV['APP_ENV'] ?? 'production' ) === 'development'
    ? './assets/components-js/index.js'
    : 'https://cdn.jsdelivr.net/npm/@liturgical-calendar/components-js@2.7.0/+esm';
```

The import map must precede the first module load; emitting it in `footer.php` directly above the
`<script type="module" src="assets/js/{$pageName}.js">` line satisfies that, and is what the frontend does.

`assets/components-js` is a gitignored symlink to the sibling checkout's `dist/`, documented in `CLAUDE.md`
alongside the existing development-setup notes:

```bash
ln -sf ../../liturgy-components-js/dist assets/components-js
```

`README.md`'s outbound-host list gains `cdn.jsdelivr.net`. No Dockerfile change: the CDN form is what production
loads, and `assets/` is already copied.

### 2. `index.php` — full adoption

The `<select id="APICalendarSelect">` markup and the option-building code in `index.js` (the `insertAdjacentHTML`
block that emits `data-calendartype` / `data-rite` options for the General Roman calendar, rite-level calendars,
nations and diocese optgroups) are removed. Two mount points replace them, and `index.js` constructs:

```javascript
const riteSelect = new RiteSelect( locale ).id( 'riteSelect' ).label( { … } );
const calendarSelect = new CalendarSelect( locale )
    .id( 'APICalendarSelect' )
    .linkToRiteSelect( riteSelect );
calendarSelect.appendTo( '#calendarSelectMount' );   // returns undefined — never chain off it
```

`linkToRiteSelect()` calls `_applyRite( rite, true )` internally, which turns on rite-aware mode: the empty option
stops being `---` and self-labels as the rite-level calendar ("General Roman Calendar" / "Ambrosian Calendar").
That is exactly the target the runner needs, so no extra `ApiOptions` instance is required to obtain it.

`CalendarResourcePicker` was evaluated and rejected: its `ACCEPTED_FILTERS` excludes `CalendarSelectFilter.NONE`
on the grounds that "a resource id has to be one or the other", so it cannot offer a rite-level calendar at all.

#### Wire mapping

The library emits `data-calendartype="national"|"diocesan"` and no `data-rite`, whereas the protocol speaks
`nationalcalendar|diocesancalendar|ritecalendar`. One function in `wsProtocol.js` bridges them:

| Selection                      | `calendar`    | `category`         |
|--------------------------------|---------------|--------------------|
| empty option (rite-level)      | `currentRite` | `ritecalendar`     |
| `data-calendartype="national"` | option value  | `nationalcalendar` |
| `data-calendartype="diocesan"` | option value  | `diocesancalendar` |

`rite` continues to be sent on every message, as today. `currentRite` is now read from the `RiteSelect`'s value
rather than from `selectedOption.dataset.rite`, which the library does not emit.

#### Accepted behaviour change: `.calendar-va` becomes `.calendar-roman`

Today the General Roman option carries `value="VA"`, so its cards are classed `.calendar-va`. Under the empty
option the id becomes the rite name and the cards become `.calendar-roman`.

This is an id change, not a request change. `Health::buildCalendarRequestPath()` already reads `'VA'` as the
historical marker for the rite-level calendar:

```php
// 'VA' is the historical marker for "the rite-level calendar", not a
// request for /nation/VA; it predates the `ritecalendar` category and
// resolves the same way.
if ($calendar === 'VA' || $category === 'ritecalendar') {
    return "$ritePath/$year?year_type=CIVIL";
}
```

Both forms resolve to `/roman/{year}`. Client and server stay consistent because the server builds the `classes`
selector from the calendar id the client sends. Runs stored before this change replay from their own stored
scaffold, so they remain internally consistent too.

#### Accuracy-test filtering is already correct

Issue #48 states two rules for accuracy tests: a test naming a calendar appears only for that calendar and only
under its rite; a test naming no calendar appears for any calendar but is still rite-filtered. `index.js` already
implements exactly this, via `testAppliesToCurrentRite()` (which defaults an absent `rite` to `roman` rather than
failing open) and `CALENDAR_SCOPE_KEYS` (which selects the calendar-identity key explicitly, ignoring `rite`).

**No rule changes.** That code moves to `wsProtocol.js` unchanged so `resources.js` can share it, and `currentRite`
is re-sourced from the `RiteSelect`.

### 3. `resources.php` — `RiteSelect` only

No `CalendarSelect`: the page health-checks every path and every calendar the API supports, so it is not
calendar-scoped. The rite selection narrows only what is genuinely rite-partitioned.

| Check family                                                                     | Rite-scoped? |
|----------------------------------------------------------------------------------|--------------|
| `/calendars`, `/decrees`, `/tests`, `/events`, `/easter`, `/schemas`, `/missals` | No           |
| Wider region source data and `/data/widerregion/…` paths                         | No           |
| National calendar source data and `/data`, `/events` per-nation paths            | No           |
| Universal source corpus (temporale, sanctorale, decrees, and their `i18n`)       | **Yes**      |
| Diocesan calendar source data and per-diocese paths                              | **Yes**      |
| Test corpus (`jsondata/tests/{rite}/{name}.json`)                                | **Yes**      |

Every nation's calendar is Roman — only dioceses carry a non-Roman rite — so national calendars sit on the
rite-independent side. Keeping the bare API paths unfiltered is what preserves the page as a real health check of
the API as a whole under either rite selection.

There is deliberately **no "All rites" option**. It was considered — an exhaustive page that shows one rite at
a time is a narrower health check than one that shows everything — and declined, because the library's
`RiteSelect` validates its values against the known rites, so "all" would have to be injected post-mount or the
page would need a hand-written select instead. Running the page twice covers the same ground.

Diocesan filtering reads `diocesanCalendar.rite ?? 'roman'`; test filtering reads
`test.applies_to?.rite ?? test.appliesTo?.rite`, both of which the page already resolves.

### 4. Shared metadata via `ApiBase`

Both pages resolve a single `ApiBase` (exported from the library) and `load()` it once. The library's selects use
it, and our check-builders read `.metadata`, `.nationalCalendars()` and `.diocesanCalendars( rite )` from the same
instance. This removes the second `/calendars` fetch that full adoption would otherwise introduce on `index.php`,
and hands `resources.js` a rite-filtered diocese list without a local filter.

### 5. `assets/js/wsProtocol.js` — the shared module

Three additions, imported by both runners:

```javascript
/** The rite-level universal corpus, one entry per checkable item. */
export const UNIVERSAL_CHECKS = [ /* 8 items */ ];

/** Whether a check belongs to the selected rite. */
export const inRiteScope = ( item, rite ) => item.rite === rite;

/** Bridge a CalendarSelect selection to the protocol's calendar/category vocabulary. */
export const toWireTarget = ( value, calendartype, rite ) => { /* … */ };
```

`testAppliesToCurrentRite()` and `CALENDAR_SCOPE_KEYS` move here too, unchanged.

#### The eight universal checks, and one vocabulary

All eight entries use `category: "universalcalendar"` with a real path. This is verified to work for every one of
them, `i18n` folders included:

- `Health::retrieveSchemaForCategory( 'universalcalendar', … )` delegates to `getPathToSchemaFile()`, which now
  resolves through `CheckableInventory::byPath()` — and the inventory contains all eight items.
- `sourceFolder` handling in `Health::executeValidation()` is category-agnostic (it branches on
  `property_exists( $validation, 'sourceFolder' )`, not on `category`), and
  `Health::validateMessageProperties()` special-cases a missing `sourceFile` whenever `sourceFolder` is present
  without restricting that to a category.

| `rite`      | Item                          | `kind` |
|-------------|-------------------------------|--------|
| `roman`     | Proprium de Tempore           | file   |
| `roman`     | Proprium de Tempore `i18n`    | folder |
| `roman`     | Memorials from Decrees        | file   |
| `roman`     | Memorials from Decrees `i18n` | folder |
| `ambrosian` | Proprium de Tempore           | file   |
| `ambrosian` | Proprium de Tempore `i18n`    | folder |
| `ambrosian` | Proprium de Sanctis           | file   |
| `ambrosian` | Proprium de Sanctis `i18n`    | folder |

The Roman sanctorale is **not** in this list: it is per-missal and both pages already derive it from `/missals`
metadata, whose editions are all Roman.

This retires from `index.js`: `ROMAN_SOURCE_DATA_PATH`, `AMBROSIAN_SOURCE_DATA_PATH` and
`buildUniversalSourceDataChecks()`. And from `resources.js`: the four-entry `sourceDataChecks` literal. The four
Ambrosian entries are new coverage — the gap the issue opens on.

Because both pages now send one vocabulary for these files, the split #42 documents (`PropriumDeTempore` +
`universalcalendar` versus `proprium-de-tempore` + `sourceDataCheck` for the same file on disk) is closed as a
side effect.

## Error Handling

- **Library load failure.** A CDN failure means the module never evaluates and neither select mounts. The run
  button is already gated on scaffold readiness, so the failure is visible as "no controls" rather than as a
  silently empty run. The mount code reports the failure into the existing toast surface.
- **`ApiBase.load()` rejection.** Handled where the pages already handle a failed `/calendars` fetch.
- **An unmapped `data-calendartype`.** `toWireTarget()` throws rather than returning a partial message; a silently
  wrong `category` would produce a check against the wrong path and report success.
- **A test with no `applies_to.rite`.** Existing behaviour is preserved: `console.warn` and skip in
  `resources.js`; default to `roman` in `index.js`'s `testAppliesToCurrentRite()`. These differ deliberately —
  the former is choosing whether to check a file that lives at a rite-partitioned path, the latter is choosing
  whether a legacy test applies.

## Testing

`e2e/rite-selection.spec.ts` is rewritten. Its current assertions describe markup that will no longer exist —
`#APICalendarSelect > option[value="ambrosian"][data-calendartype="ritecalendar"]`, and `VA` as the first
top-level option. The replacements assert behaviour instead:

- Selecting the Ambrosian rite leaves only Ambrosian dioceses in the calendar select.
- The empty option is labelled with the rite-level calendar's own name under each rite.
- Selecting the Ambrosian rite leaves only Ambrosian source-data cards and Ambrosian test cards in the scaffold.

A new spec covers `resources.php`:

- Bare API-path cards are present under **both** rite selections.
- Wider-region and national-calendar cards are present under both.
- The universal source cards, diocesan cards and test cards change with the selection.

`result-painting.spec.ts` and the replay specs are checked for the `.calendar-va` → `.calendar-roman` change.

Existing specs run against the live API with no WebSocket server, per `playwright.config.ts`; the new
assertions keep to that constraint by exercising the scaffold, which is built purely from the `/calendars`,
`/missals` and `/tests` fetches.

## Documentation

`CLAUDE.md` needs updating in this repo:

- The development-setup section gains the `assets/components-js` symlink and the import map.
- The "Main Technologies" list gains `@liturgical-calendar/components-js`.
- The WebSocket messaging section notes that `universalcalendar` is now the single vocabulary for the universal
  corpus on both pages, and that `sourceFolder` is no longer `resources.js`-only.
- The `Key Files` table gains `assets/js/wsProtocol.js`.
