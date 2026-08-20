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
- `resources.php`: rite-scoped items filtered by the selected rite; the five rite-independent collection
  endpoints always checked; every rite-qualified request sends its rite segment explicitly.
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

| Decision                     | Choice                                                                                                                      |
|------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| Inventory source             | **Hardcoded list** in `wsProtocol.js`; `/validations` adoption deferred wholesale to #42                                    |
| Component library            | **`@liturgical-calendar/components-js`** (ESM), not `liturgy-components-php`                                                |
| `index.php` calendar control | **Full adoption** — library `CalendarSelect` linked to `RiteSelect`, replacing our hand-built one                           |
| `resources.php` control      | **`RiteSelect` only** — the page is exhaustive, not calendar-scoped                                                         |
| `resources.php` filter rule  | Only the five rite-independent collection endpoints escape the predicate; nations, wider regions and missals are Roman-only |
| Delivery                     | **Import map + pinned CDN `+esm`**, mirroring `LiturgicalCalendarFrontend`                                                  |

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
selector from the calendar id the client sends.

Beyond idiom, this matters ahead of time: Vatican City is expected to gain its own calendar data as a national
calendar, distinct from the General Roman Calendar. Once that lands, `VA` and the General Roman Calendar are two
different things, and any code still using them interchangeably becomes wrong rather than merely loose. Runs stored before this change replay from their own stored
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
calendar-scoped. The rite selection narrows what is rite-partitioned and hides what does not exist under the
selected rite.

#### The API's rite model

`Router::extractRiteSegment()` accepts an optional leading rite segment on `calendar`, `events` and `data`.
`/tests` resolves its rite separately, through `extractTestsRite()`, which has a third state: no segment means
*all* rites, distinct from an explicit `roman`.

The tiering is not symmetric. `RegionalDataHandler` states it:

> Only the diocesan tier exists under more than one rite; `RegionalDataParams::validateRiteCompatibility()`
> rejects a national or wider-region request under a non-Roman rite before any path is built.

`openapi.json` agrees, listing `/calendar/ambrosian/diocese/{id}` and `/events/ambrosian/diocese/{id}` with no
national counterparts. So national and wider-region resources are **Roman-only**, not rite-independent:
requesting one under Ambrosian is an error, not a no-op. `/missals` is Roman-only too — `RomanMissal` carries no
Ambrosian edition, and the Ambrosian sanctorale reaches the inventory as an explicit item instead.

Omitting the segment is safe: `Router::canonicalRiteUrl()` advertises the explicit form through an RFC 6596
`Link: rel="canonical"` header rather than redirecting, deliberately, because these routes accept POST. Existing
unprefixed URLs therefore keep working. We send the canonical rite-qualified form on the **per-nation and
per-diocese** paths, because under Ambrosian the unprefixed form would silently resolve to Roman.

The **collection** endpoints take the segment too, where one means anything. `/events/{rite}` and
`/tests/{rite}` are real routes whose content differs by rite, so they are checked rite-qualified. The remaining
five — `/calendars`, `/decrees`, `/easter`, `/schemas`, `/missals` — carry no rite dimension at all and stay
bare.

`/calendar/{rite}` is the one exception, and it is not ours to take: `Health` resolves no schema for either
`/calendar` or `/calendar/{rite}`, so neither form is checkable as a resource path. That is not a gap in this
work — `index.php` validates calendars through the `validateCalendar` WebSocket action instead, which has been
rite-aware since #39.

This rite-qualified form depends on two LiturgicalCalendarAPI changes, both merged 2026-08-20:

- **#813** taught the `resourceDataCheck` regexes an optional rite segment and routed the three diocesan path
  sites through `JsonData::diocesanCalendarFileFor($rite)`. Before it, every Ambrosian diocesan check resolved
  against the Roman tree.
- **#816** normalises a trailing rite segment away *before* `getPathToSchemaFile()`'s exact-match lookup, so the
  bare rite-qualified collection form resolves to whatever the bare form resolves to. Before it, `/events/roman`
  fell between the two resolution arms — the regexes require `nation/` or `diocese/` after the rite, and the
  route table matches exactly — and reported *"Unable to detect schema"*.

#### What runs under each selection

| Check family                                                                     | Roman                         | Ambrosian           |
|----------------------------------------------------------------------------------|-------------------------------|---------------------|
| `/calendars`, `/decrees`, `/easter`, `/schemas`, `/missals`                      | ✓                             | ✓                   |
| `/events` (collection)                                                           | `/events/roman`               | `/events/ambrosian` |
| `/tests` (collection)                                                            | `/tests/roman`                | `/tests/ambrosian`  |
| Wider region source data, `/data/{rite}/widerregion/{k}`                         | ✓ (`roman`)                   | —                   |
| National source data, `/data/{rite}/nation/{k}`, `/events/{rite}/nation/{k}`     | ✓ (`roman`)                   | —                   |
| Per-missal `/missals/{id}` and `proprium-de-sanctis-*` source data               | ✓ (`roman`)                   | —                   |
| Diocesan source data, `/data/{rite}/diocese/{id}`, `/events/{rite}/diocese/{id}` | Roman dioceses                | Ambrosian dioceses  |
| Universal source corpus (temporale, sanctorale, decrees, `i18n`)                 | 4 Roman items + Roman missals | 4 Ambrosian items   |
| Test corpus (`jsondata/tests/{rite}/{name}.json`)                                | `tests/roman/*`               | `tests/ambrosian/*` |

Only the five rite-independent collection endpoints sit outside the predicate. Everything else carries a rite —
either filtered by `inRiteScope()` or, for the two rite-qualified collections, addressed through it.

The consequence, accepted deliberately: the Ambrosian view of the page is thin, and a national-calendar
regression is invisible while Ambrosian is selected. That is the honest reflection of an API in which those
resources do not exist under that rite — showing them would mean issuing requests the API rejects.

#### Not in scope

`resources.php` health-checks no `/temporale`, `/temporale/{event_key}` or `/validations` path, and no
`/calendar/…` path at all. The first two are endpoints that shipped after the page's check list was last
extended; `/calendar` is covered from `index.php` instead, through the `validateCalendar` WebSocket action, which
already sends `rite` and whose path `Health::buildCalendarRequestPath()` already prefixes with `$ritePath`. All
of this is filed separately rather than folded in here.

#### No "All rites" option

Considered — an exhaustive page that shows one rite at a time is a narrower health check than one that shows
everything — and declined, because the library's `RiteSelect` validates its values against the known rites, so
"all" would have to be injected post-mount or the page would need a hand-written select instead. Running the
page under each rite covers the same ground.

#### Where the rite comes from

Diocesan filtering reads `diocesanCalendar.rite ?? 'roman'`; test filtering reads
`test.applies_to?.rite ?? test.appliesTo?.rite`. Both are already resolved by the page today.

### 4. Shared metadata via `ApiBase` (deferred)

**Amendment (final pre-merge review, 2026-08-20):** this section originally claimed both pages resolve a single
`ApiBase` and `load()` it once, removing the second `/calendars` fetch that full adoption would otherwise introduce
on `index.php`. That was not implemented. `index.php` calls `ApiBase.resolve( baseUrl )` in `mountCalendarControls()`
only to obtain the instance the library's own `CalendarSelect`/`RiteSelect` already loaded internally, then still
runs its own separate `/calendars` fetch in `fetchMetadataAndTests()` for its own check-builders; `resources.js` has
no `CalendarSelect` and no use for `ApiBase` at all — the `ApiBase.resolve( baseUrl )` call once present there was
dead code, discarding its result, and has been removed. Both pages therefore fetch `/calendars` twice apiece today
(once through the library's internal load, once through each page's own fetch), and `resources.js`'s diocese
filtering still goes through the local `inRiteScope()` predicate rather than an `ApiBase.diocesanCalendars( rite )`
call.

Sharing one `ApiBase` instance between a page's own check-builders and the library's selects — to collapse the
duplicate `/calendars` fetch and to hand `resources.js` a rite-filtered diocese list without a local filter — is
real, but it is a larger refactor than fits this late in #48. It is deliberately deferred as future work rather
than attempted here.

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

#### The eight universal checks

The four **file** entries use `category: "universalcalendar"` with a real path.
`Health::retrieveSchemaForCategory( 'universalcalendar', … )` delegates to `getPathToSchemaFile()`, which
resolves through `CheckableInventory::byPath()` — and the inventory contains all four, Ambrosian included.

The four **i18n folder** entries use `category: "sourceDataCheck"` with a hyphenated `-i18n` slug.

This split is forced by the server, not chosen. An earlier version of this spec asserted that
`universalcalendar` covered folders too, on the strength of `Health::executeValidation()` branching on
`property_exists( $validation, 'sourceFolder' )` rather than on the category. That reading was wrong: the
whole `sourceFolder` **dataPath resolution** block sits inside `if ( $category === 'sourceDataCheck' )`
(`Health.php:609-660`). Under `universalcalendar` the `else` branch runs, requires `sourceFile`, and throws —
which Ratchet turns into a closed connection, wedging the run rather than failing one card.

Verified against the live WebSocket server rather than by reading:

| frame                                                             | result            |
|-------------------------------------------------------------------|-------------------|
| folder + `universalcalendar`                                      | connection CLOSED |
| folder + `sourceDataCheck` + `proprium-de-tempore-i18n`           | 3 × success       |
| folder + `sourceDataCheck` + `ambrosian-proprium-de-tempore-i18n` | 3 × success       |
| folder + `sourceDataCheck` + `ambrosian-proprium-de-sanctis-i18n` | 3 × success       |
| file + `universalcalendar` (Ambrosian temporale)                  | 3 × success       |

The two Roman folder slugs are the ones `Health`'s `$legacySlugToId` table already maps onto inventory ids;
the two Ambrosian ones resolve through its surviving `/-i18n$/` regex arm, which returns the `I18N` schema.
Both therefore work on today's server with no API change. The Roman pair is also exactly what `resources.js`
already sends, so the two pages agree there for free.

| `rite`      | Item                          | `kind` | `category`          | `validate`                           |
|-------------|-------------------------------|--------|---------------------|--------------------------------------|
| `roman`     | Proprium de Tempore           | file   | `universalcalendar` | `PropriumDeTempore`                  |
| `roman`     | Proprium de Tempore `i18n`    | folder | `sourceDataCheck`   | `proprium-de-tempore-i18n`           |
| `roman`     | Memorials from Decrees        | file   | `universalcalendar` | `MemorialsFromDecrees`               |
| `roman`     | Memorials from Decrees `i18n` | folder | `sourceDataCheck`   | `memorials-from-decrees-i18n`        |
| `ambrosian` | Proprium de Tempore           | file   | `universalcalendar` | `AmbrosianPropriumDeTempore`         |
| `ambrosian` | Proprium de Tempore `i18n`    | folder | `sourceDataCheck`   | `ambrosian-proprium-de-tempore-i18n` |
| `ambrosian` | Proprium de Sanctis           | file   | `universalcalendar` | `AmbrosianPropriumDeSanctis`         |
| `ambrosian` | Proprium de Sanctis `i18n`    | folder | `sourceDataCheck`   | `ambrosian-proprium-de-sanctis-i18n` |

The Roman sanctorale is **not** in this list: it is per-missal and both pages already derive it from `/missals`
metadata, whose editions are all Roman.

This retires from `index.js`: `ROMAN_SOURCE_DATA_PATH`, `AMBROSIAN_SOURCE_DATA_PATH` and
`buildUniversalSourceDataChecks()`. And from `resources.js`: the four-entry `sourceDataChecks` literal. The four
Ambrosian entries are new coverage — the gap the issue opens on.

Both pages now send the same message for the same file, which closes the divergence #42 documents
(`PropriumDeTempore` + `universalcalendar` in one page versus `proprium-de-tempore` + `sourceDataCheck` in the
other, for one file on disk). The file/folder category split that remains is not that divergence: it is one
rule, applied identically by both pages, and it exists because the server resolves a folder's data path only
under `sourceDataCheck`. #806 section B removes the distinction along with client-supplied paths.

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

- The five rite-independent collection cards (`/calendars`, `/decrees`, `/easter`, `/schemas`, `/missals`) are
  present under **both** rite selections.
- The `/events` and `/tests` collection cards are present under both, each naming the selected rite.
- Wider-region, national-calendar and per-missal cards are present under Roman and **absent** under Ambrosian.
- Diocesan, universal-source and test cards change with the selection.
- Every rite-qualified URL a card carries names a rite explicitly — no card requests an unprefixed
  `/data/…`, `/events/…` or `/calendar/…` path, which would silently resolve to Roman under an Ambrosian
  selection.

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

Two follow-ups are filed rather than folded in:

- **This repo** — `resources.php` health-checks no `/temporale`, `/temporale/{event_key}` or `/validations`
  path. All three shipped after the page's check list was last extended.
- **LiturgicalCalendarAPI** — `openapi.json` documents `/data/nation/{key}`, `/data/diocese/{key}` and
  `/data/widerregion/{key}` with no rite segment, though `Router::extractRiteSegment()` accepts one on `data`
  exactly as it does on `calendar` and `events`. The schema understates the route.
