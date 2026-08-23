# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**UnitTestInterface** is a web-based graphical test interface for validating the LiturgicalCalendarAPI.
It connects via WebSocket to a test server, runs unit tests asynchronously, and displays results in real-time
on a responsive dashboard.

**Testing Capabilities:**

- Source data validation (JSON schemas)
- Calendar generation for different locales/regions
- API response formats (JSON, YAML, XML, ICS)
- Liturgical event definitions and precedence rules

## Main Technologies

- **Backend:** PHP 8.1+ (procedural with classes)
- **Frontend:** Native ES6 JavaScript, Bootstrap 5, Font Awesome 7
- **Communication:** WebSocket (Ratchet-based server in LiturgicalCalendarAPI)
- **i18n:** GNU gettext with 10+ language translations
- **Code Quality:** PHP_CodeSniffer (PSR-12)
- **Component Libraries:** `@liturgical-calendar/components-js` (ESM, `index.php` + `resources.php`);
  liturgical-calendar/components (PHP, `admin.php` only)

## Project Structure

```text
UnitTestInterface/
├── index.php              # Main test runner UI
├── admin.php              # Administrative interface
├── resources.php          # Resource testing interface
├── includes/              # PHP includes
│   ├── I18n.php          # Internationalization class
│   └── pgettext.php      # Context-aware translation
├── layout/                # Layout templates
│   ├── head.php          # HTML head, CSS/JS includes
│   ├── topnavbar.php     # Navigation bar
│   ├── sidebar.php       # Side navigation
│   └── footer.php        # Footer
├── components/            # UI components
│   └── NewTestModal.php  # Test creation modal
├── assets/
│   ├── js/               # JavaScript files
│   │   ├── admin.js      # Admin functionality
│   │   ├── AssertionsBuilder.js # Test assertion builder
│   │   ├── common.js     # Shared utilities
│   │   ├── index.js      # Main test runner logic
│   │   └── resources.js  # Resource management
│   └── css/              # Stylesheets
└── i18n/                  # Translation files
```

## Development Setup

**Option 1 — full docker stack:** `docker compose up -d` in the LiturgicalCalendarFrontend repository runs the API,
WebSocket server, PostgreSQL, auth services, and this test interface (`litcal-tests` service, port 3003).
This repository is bind-mounted into the container, so local changes are picked up live.

**Option 2 — without docker:**

```bash
# In LiturgicalCalendarAPI: start PostgreSQL (required by the API), then API + WS server
docker compose up -d db litcal-migrate
composer start              # API on localhost:8000
composer ws:start           # WebSocket server on localhost:8082

# In this repository: install dependencies and start the dev server
composer install
php -S localhost:3003

# VSCode: Use Ctrl+Shift+B and select "litcal-tests-webui"
```

**Environment Configuration:**

1. Copy `.env.example` to `.env.development` or `.env.local`
2. Configure WebSocket server: `WS_PROTOCOL`, `WS_HOST`, `WS_PORT`
3. Configure API server: `API_PROTOCOL`, `API_HOST`, `API_PORT`
4. Set `APP_ENV` (development|production)
5. For a local `liturgy-components-js` checkout, symlink it (development only):

   ```bash
   ln -sfn ../../liturgy-components-js/dist assets/components-js
   ```

   When `APP_ENV=development` the import map in `layout/footer.php` points the
   `@liturgical-calendar/components-js` specifier at this symlink; otherwise it resolves to a
   pinned jsDelivr build. There is no bundler and no `npm install` step for it.

**Requirements:**

- LiturgicalCalendarAPI must be running (default: port 8000)
- WebSocket server must be running (default: port 8082)
- PostgreSQL must be reachable by the API (without it the API returns empty HTTP 200 responses)

**WSL2 note (browser on Windows, non-docker setup):** set `WS_HOST=127.0.0.1` (not `localhost`) — Windows browsers
resolve `localhost` to IPv6 `::1`, but WSL does not forward Windows-side IPv6 loopback into the VM (in either NAT or
mirrored networking mode; only IPv4 loopback passes through), so the connection closes immediately (code 1006). HTTP
falls back to IPv4, WebSockets do not. Binding the WS server to IPv6 inside WSL (`WS_HOST="[::]"` in the API's env)
does not help — the Windows-to-WSL `::1` path itself is missing. Keep `API_HOST=localhost`: the WS server
(`Health.php`) matches resource URLs against the API's configured host when resolving JSON schemas, so `127.0.0.1`
there makes the base API path `schema-valid` checks fail. The docker stack is unaffected.

## Code Standards

### PHP

- **Standard:** PSR-12 with custom rules
- **Line length:** 200 characters max
- **Configuration:** `phpcs.xml`

```bash
# Check code standards
vendor/bin/phpcs
```

### Markdown

All markdown files must conform to `.markdownlint.yml`:

- **Line length:** Maximum 180 characters (code blocks and tables excluded)
- **Tables:** Columns must be vertically aligned (MD060)
- **Code blocks:** Use fenced style with language specifiers

### JavaScript

- Native ES6 DOM manipulation (no jQuery dependency)
- Bootstrap 5 native JavaScript API (Toast, Collapse, Modal, Tooltip)
- WebSocket communication for real-time updates
- Shared utilities in `common.js` (escapeHtmlAttr, slugify, slugifySelector, etc.)

**Global Variables (defined in PHP, passed to JS):**

- `locale` - User's locale for `Intl.DateTimeFormat` formatting
- `LitcalEvents` - Array of liturgical events from API

**Key Classes/Enums in `AssertionsBuilder.js`:**

- `TestType` - Enum for test types (exactCorrespondence, exactCorrespondenceSince, etc.)
- `AssertType` - Enum for assertion types (eventNotExists, eventExists AND hasExpectedDate)
- `LitGrade` - Enum for liturgical grades (WEEKDAY through HIGHER_SOLEMNITY)
- `AssertionsBuilder` - Builds HTML for test assertion UI
- `Assertion` - Represents a single test assertion

## API Data Format

**Date Format:** The LiturgicalCalendarAPI returns dates as RFC 3339 datetime strings:

```text
"2018-05-21T00:00:00+00:00"
```

- Time is always `00:00:00` (liturgical events are all-day)
- Timezone is always UTC (`+00:00`)
- JavaScript's `new Date()` parses this format correctly
- Use `Intl.DateTimeFormat` with `timeZone: 'UTC'` for display

## WebSocket Messaging

The test interface communicates with the LiturgicalCalendarAPI's Health websocket server (`LiturgicalCalendarAPI/src/Health.php`). Both
runner pages (`index.php` / `assets/js/index.js` and `resources.php` / `assets/js/resources.js`) speak the v2 contract described below.
It is published as two JSON Schema documents in the API repository, not this one:

```text
../LiturgicalCalendarAPI/jsondata/schemas/WebSocketMessage.json  — client -> server messages
../LiturgicalCalendarAPI/jsondata/schemas/WebSocketFrame.json    — server -> client frames
```

`assets/js/types.js` is written from those two files; where this section and the schemas disagree, the schemas win.

### The `/validations` Inventory

Both runners fetch `GET /validations` before building their checkable list, rather than hardcoding the API's on-disk layout in this
repository. The response is `{ "litcal_validations": [...] }`, an array of `{id, kind, rite, region, label, schema, steps}`. `id` is
opaque — e.g. `temporale:roman`, `nation:roman:IT`, `diocese:ambrosian:milano_it`, `test:roman:StIgnatiusOfLoyolaTest` — and is sent back
verbatim; no filesystem path crosses the wire. Both runners fetch it with `fetchValidations()` in `assets/js/wsProtocol.js`, then filter
it to the selected rite — `resources.js` with that same module's `validationChecksForRite()`, `index.js` with its own
`inventoryIdsForCalendar()` (see Rite Scoping below).

This is what closed the class of lockstep breakage this repository used to have between a hand-maintained checklist and the API's actual
layout — issues #38, API#795 and API#800 all trace back to that list going stale. The list it replaced, `UNIVERSAL_CHECKS`, no longer
exists in this repository; neither does the slug-and-path construction (`wider-region-…`, `national-calendar-…`, `proprium-de-sanctis-…`)
that used to build `executeValidation` messages by hand. Do not resurrect either — the code they describe is gone, and the inventory is
what does that job now.

**When the inventory fetch fails** (`/validations` answers 429 routinely in local development), each runner settles it independently of its
other metadata fetches — `Promise.allSettled`, not `Promise.all` — so one rejection no longer discards the rest and leaves the page under a
translucent `.page-loader` that is never lowered (#63). The degradation is deliberately asymmetric: the page **renders** what it can, lowers
the loader (`hidePageLoader()` in `common.js`) and raises the `#validations-load-failed` toast, but the Start button stays **refused**. That
is not an oversight to relax — the inventory *is* the list of things a run checks, so a run started without it would check a subset and
report success for it, which is the class of untruth this interface exists to detect. `#validations-load-failed` is a distinct toast from
`#controls-load-failed` because the two are distinct facts and can be true at once: when only the inventory failed, the controls did build.

### Message Actions

Every outgoing message carries an `action`. This repository now sends five:

| Action              | Purpose                                       | Required properties                                        |
|---------------------|-----------------------------------------------|------------------------------------------------------------|
| `validateSource`    | Validate one `/validations` inventory item    | `target.id`                                                |
| `executeValidation` | Validate a bare API URL with no inventory id  | `category`, `validate`, `sourceFile`                       |
| `validateCalendar`  | Validate generated calendar data for one year | `calendar` (typed), `year`, `responseFormat`               |
| `runTest`           | Run one unit test against a calendar and year | `test`, `calendar` (typed), `year`                         |
| `cancelRun`         | Abandon a run, dropping its queued backlog    | `runToken` (required here, not optional — see Correlation) |

```javascript
{ "action": "validateSource", "target": { "id": "nation:roman:IT" }, "requestId": "…" }

{ "action": "validateCalendar", "calendar": { "kind": "national", "id": "IT", "rite": "roman" },
  "year": 2024, "responseFormat": "JSON", "requestId": "…" }

{ "action": "runTest", "test": "StIgnatiusOfLoyolaTest",
  "calendar": { "kind": "rite", "rite": "roman" }, "year": 2024, "requestId": "…" }
```

`calendar` is a typed identity, not a bare string: `{kind: "general"|"national"|"diocesan"|"rite", id?, rite}`. `toCalendarIdentity()` in
`wsProtocol.js` builds it from a `CalendarSelect` option — the library's own empty option (the rite-level calendar) maps to
`{kind: "rite", rite}` for either rite; a `national`/`diocesan` option maps to `{kind: "national"|"diocesan", id, rite}`. `kind: "general"`
is declared by the schema but not produced by this repository's mapping.

**Each reshaped action rejects the legacy properties it retired**, rather than silently ignoring them
(`Health::RETIRED_PROPERTIES`, enforced before the message is interpreted at all):

- `validateSource` refuses `category`, `validate`, `sourceFile` and `sourceFolder` — `target.id` replaces all four.
- `validateCalendar` refuses `category` (`calendar.kind` replaces it), `responsetype` (`responseFormat` replaces it) and `rite`
  (`calendar.rite` replaces it) — `rite` deliberately, even though it was optional on v1: a half-migrated client that objectified
  `calendar` but kept a stale top-level `rite` would otherwise have a genuine rite disagreement between the two silently ignored, which
  is exactly what the typed identity exists to make loud instead.
- `runTest` refuses `category` and `rite` for the same two reasons.

A message carrying a retired property gets a `protocolError` frame back with `errorCode: "retired_property"` naming the property and
what replaces it, rather than being half-honored or closing the connection.

`executeValidation` survives only for a bare API URL that carries no inventory id, so it cannot become a `validateSource` message.
`resources.js`'s `resourceDataChecks` (e.g. `/calendars`, `/missals`, `/decrees`) send these with `category: "resourceDataCheck"`;
`index.js` sends exactly one such check, `LitCalMetadata` against `/calendars`, with `category: "universalcalendar"` instead — both
categories resolve the schema from `sourceFile`, so either works for a URL, and which one a given check uses is which page it lives in,
not a rule about the URL. The schema still declares a third category, `sourceDataCheck`, as valid on this action, and the server has not
removed support for it — but neither runner constructs a `sourceDataCheck` message any more, because the slug-and-path code that used to
build one (see The `/validations` Inventory above) is gone. Do not reconstruct it from this file; if a `sourceDataCheck` message is ever
needed again, read `WebSocketMessage.json`'s `executeValidation` definition directly rather than trusting a description of deleted code.

### Correlation: `requestId`, `runToken`, `runId`

`runToken` identifies a *run* — one page load's worth of checks. `requestId` identifies one *request* within it, and is what replaced the
server-composed `classes` selector as the mechanism for attributing a frame to a card. `createPhaseRunner()` in `assets/js/wsRunner.js`
mints a fresh `requestId` per check with `newRequestId()`, registers it against the cards that check's steps will paint
(`createRequestRegistry()` in `wsProtocol.js`), and a frame is painted by looking up `(requestId, step)` in that registry — never by
parsing `classes`.

`sendMessage()` in `wsRunner.js` attaches `runToken` automatically whenever a run is active; `requestId` is set explicitly on each
message by the caller that built it. `cancelRun` is the one action that bypasses `sendMessage()` entirely — `sendCancelRun()` in
`wsProtocol.js` builds its own frame, and `runToken` on it is required, not conditionally attached, because it names the run being
abandoned rather than merely tagging along on one already in progress.

A response frame echoes both `runToken` and `requestId` back unchanged; `runId` is published alongside `runToken` with the same value,
as the protocol's newer name for it. A frame whose `runToken` does not match the connection's active run is dropped before either
runner's `type`/`step` dispatch ever sees it.

### The `hello` Handshake and Protocol Negotiation

The server sends a `hello` frame once, unprompted, immediately on connect — before any run exists, and carrying no run correlation at
all. That is load-bearing, not incidental: both runners guard their message handler on the frame's `runToken` matching the run they are
on, so an untagged frame would be discarded before reaching their `type` dispatch unless it is read first. `readHello()` in
`wsProtocol.js` is therefore called ahead of that guard, and remembers the server's advertised `protocol` integer and its
`capabilities` (`{rites, actions, responseFormats, steps, statuses}`), each list derived server-side from the same enums that define the
behaviour it describes, so an advertisement cannot go stale against what the server actually does.

**Adoption is uneven between the two runners, and that is the current state of this repository, not a bug to fix here.** `resources.js`
imports and calls `readHello()`. `index.js` does not import it at all, and consequently never declares `protocol` on its own messages —
`negotiatedProtocol()` in `wsProtocol.js` returns null until a `hello` has been read, and `sendMessage()` omits the `protocol` property
whenever it does, which for `index.js` is always. This is silently correct rather than silently broken: declaring a version the server
never advertised would trip the same unknown-property gate that sending `requestId` arms.

### Frames: `stepResult`, `complete`, `protocolError`

A `stepResult` frame reports one step's outcome:
`{type, text, classes, target, step, status, requestId?, runToken?, runId?, responsetype?, details?}`. `classes` and `responsetype` are
DEPRECATED projections kept only for a client that predates per-request correlation — retained until this repository stops reading them,
and not to be parsed by anything new. `target` is `{id, year?, calendar?}`, and is `null` only for the surviving `executeValidation`
shape, which names no id.

**Two step vocabularies, addressed to different cards, sharing the same three-word `step` enum:**

- A **check** — source-data validation (`validateSource`/`executeValidation`) or calendar-data validation (`validateCalendar`) —
  reports `exists`, `parses`, then `validates`, on cards classed `file-exists`, `json-valid`, `schema-valid` respectively
  (`STEP_CARD_CLASS` in `wsProtocol.js`, mirroring the server's `FrameFamily::CLASS_FOR_STEP`).
- A **test run** (`runTest`) reports only `validates`, on a card classed `test-valid` instead (`TEST_RUN_STEP_CARD_CLASS`). The same step
  name addresses a different card family depending on which kind of request produced the frame, which is why `wsProtocol.js` keeps two
  maps rather than one.

Phase completion is driven by the terminal `complete` frame, one per request that carried a `requestId` — **not** by counting frames.
The old "each `executeValidation` yields exactly 3 responses" constant, and the `* 3` / `>= 3` arithmetic it drove, are gone from this
repository along with the frame-counting they supported: a phase now advances once every request it started has reported `complete`
(`noteTerminalFrame()` in `wsRunner.js`). That trades one failure mode for another — a request whose `complete` frame never arrives now
hangs its phase forever, rather than a frame count eventually overshooting past it — so `createSilenceWatchdog()` pairs it with a
timeout, restarted on every frame of the run and firing only once the server has genuinely gone quiet (LiturgicalCalendarAPI#823 is a
known way for a `complete` frame to be skipped after the underlying work already succeeded).

A `protocolError` frame (`{type: "protocolError", errorCode, text, runToken?, requestId?}`) reports a message that could not be acted
on — an unknown action, a retired property, a malformed `requestId`, and so on. It is not gated on `requestId` the way `complete` is: a
new frame type changes nothing for a client that was going to receive a frame anyway.

### Rite Scoping

Both runner pages carry a `RiteSelect` from `@liturgical-calendar/components-js`, defaulting to `roman`. The predicate is `inRiteScope()`
in `assets/js/wsProtocol.js`; an absent `rite` means Roman, never "every rite", because a fail-open filter would request Roman-only
resources under the Ambrosian rite, which the API rejects.

Only the diocesan tier exists under more than one rite. National calendars, wider regions and the `/missals` registry are Roman-only —
`RegionalDataParams::validateRiteCompatibility()` rejects a national or wider-region request under a non-Roman rite — so `resources.php`
omits them entirely when the Ambrosian rite is selected rather than requesting and failing them.

Per-nation and per-diocese `/data` and `/events` URLs are sent **rite-qualified** (`/data/ambrosian/diocese/milano_it`); an unprefixed URL
silently resolves to Roman, which would be a wrong-green. The `/events` and `/tests` **collections** are rite-qualified too. The other five
collection endpoints — `/calendars`, `/decrees`, `/easter`, `/schemas`, `/missals` — carry no rite dimension and stay bare.

`/calendar/{rite}` is the exception: `Health` resolves no schema for either form of it, so it is not checkable as a resource path at all.
`index.php` validates calendars through the `validateCalendar` action instead, which is rite-aware in its own right.

This requires two LiturgicalCalendarAPI changes: **#813**, which taught the `resourceDataCheck` regexes an optional rite segment and
routed the diocesan path sites through `JsonData::diocesanCalendarFileFor($rite)`; and **#816**, which strips a trailing rite segment
before `getPathToSchemaFile()`'s exact-match lookup so the bare rite-qualified collection form resolves to the bare form's schema.

The **calendar-data year range is rite-dependent too**: `CalendarParams::YEAR_LOWER_LIMIT` is 1970, but
`AMBROSIAN_YEAR_LOWER_LIMIT` is 1976. Do **not** restate those numbers here — `yearLowerBoundForRite()` in
`assets/js/wsProtocol.js` reads them from `RiteProperties` in `@liturgical-calendar/components-js`, which already
mirrors both constants, is covered by that package's tests, and is the same table the `RiteSelect` is built from, so
every rite the user can select has an entry. `index.js` captures `RiteProperties` in `mountCalendarControls()`, where
the library is dynamically imported. The single literal `FALLBACK_YEAR_LOWER_BOUND = 1970` applies only when that
import failed, and is correct there by construction: with no library there is no rite select either, so the rite is
still the default Roman. (LiturgicalCalendarAPI#867 would let the *library* stop hardcoding it; this repository's call
sites would not change.)

`index.js` seeds its `Years` array at module load with
`yearsForRite( 'roman', twentyFiveYearsFromNow, riteProperties )` — the Roman default spelled out literally, because
`currentRite` is not assigned yet at that point and the library has not loaded either — and then **rebuilds** it from
the selected rite inside `setupPage()`, the one funnel
every scaffold rebuild passes through. The rebuild lives below `setupPage()`'s early `return`, so a path that bails on
missing metadata cannot narrow the range without rebuilding the cards to match; and it is deliberately not in the rite
select's own `change` listener, because `linkToRiteSelect()` registers first and dispatches `change` on the calendar
select, so `handleCalendarSelectChange()` has already run by the time that listener fires.

Requesting a year the rite cannot serve still costs six red cards, six requests the rite can never satisfy, and six charges
against the API's rate-limit budget, per Ambrosian run. `/calendar/ambrosian/1975` answers `400`, and
`Health::validateCalendar()` checks the status and reports all three steps failed with the problem document's `detail`
(API commit `9d3fae2c`). Since `index.js` sends `requestId` on every `validateCalendar` message (see Correlation above),
the failed request still gets its terminal `complete` frame exactly like a successful one — there is no longer a
frame-count special case here at all. The phase runner's `noteTerminalFrame()` treats it like any other completed
request and the phase advances normally; the cost of getting the lower bound wrong is wasted, rate-limited requests, not
a stuck run.

Issue #52 described something worse: a wrong-green `exists`, a misleading *"perhaps truncated?"* and a missing third
frame that left the phase permanently short of its target. That was accurate when the issue was written, under the old
frame-counting arithmetic, and is **fixed upstream**; do not cite it as live behaviour, and note that the terminal-frame
architecture described above would not reproduce it even if it were not fixed.

On `index.php`, the calendar select is the library's, linked to the rite select. Its options carry `data-calendartype="national"|"diocesan"`
and no `data-rite`, and the rite-level calendar is its empty option — `toCalendarIdentity()` in `wsProtocol.js` maps all three onto the
protocol's typed `{kind, id?, rite}` identity (see Message Actions above). The General Roman Calendar is sent as
`{calendar: {kind: 'rite', rite: 'roman'}}`, with no `category` at all — not `{calendar: 'roman', category: 'ritecalendar'}`, and no
longer `VA`.

### Missal (Proprium de Sanctis) Validation

Missal source-data checks are now sent through the `/validations` inventory, like everything else in this section: each missal a
calendar uses becomes an id of the form `sanctorale:roman:{missal_id}` (e.g. `sanctorale:roman:IT_1983`,
`sanctorale:roman:EDITIO_TYPICA_1970`), built by `inventoryIdsForCalendar()` in `assets/js/wsProtocol.js` from the `missals` array on
the calendar's `/calendars` metadata, and sent as a `validateSource` message — `{action: "validateSource", target: {id: "sanctorale:roman:IT_1983"}}`.
No `validate` slug, `sourceFile` or `category` is built or sent for a missal check any more.

Each missal id is composed together with its translation folder, `sanctorale:roman:{missal_id}:i18n` — see Calendar-Tier `:i18n`
Coverage below, and note that this is the one composed id the server is entitled not to advertise.

The old `proprium-de-sanctis-{REGION}-{YEAR}` slug format (region omitted for the editio typica, `region === 'VA'`) still appears in this
repository, but only as a *label*, recognised when rendering a stored run from before this migration
(`sourceDataCheckTemplate()`'s `false === fromInventory` branch in `assets/js/index.js`) — it is read, never built. Replaying an old
stored run is not optional, so that branch stays; nothing in the current send path constructs the slug, and it should not be
reconstructed here either.

If a slug in this format is ever needed again — for a new replay format, say — build it from the missal's **structured metadata**, not
by string-splitting `missal_id`:

```javascript
const validateStr = `proprium-de-sanctis${missalDef.region === 'VA' ? '' : `-${missalDef.region}`}-${missalDef.year_published}`;
```

An earlier version of this section documented a `missal_id.split('_')` parse; that was never the code and must not be reintroduced.

**Note:** The `/missals` API endpoint returns `api_path` (URL), not a filesystem path. It is not used for source-data validation at all —
missal source checks address the missal by its `/validations` inventory id, not by any URL or path the `/missals` endpoint returns.

### Calendar-Tier `:i18n` Coverage

`inventoryIdsForCalendar()` composes a `:i18n` id beside **every** id it composes, at every tier — the universal corpus (temporale,
decrees, or a non-Roman rite's own sanctorale) and the calendar-specific tier alike:

```text
nation:roman:{id}:i18n              widerregion:roman:{name}:i18n
diocese:{rite}:{calendar_id}:i18n   sanctorale:roman:{missalId}:i18n
```

The calendar-specific half is issue #61, landed after the #42 migration rather than during it: #42 deliberately held coverage constant so
that a change in card counts would be a migration bug rather than intended new coverage. Do not reintroduce the omission, and do not read
`inventoryIdsForCalendar()`'s old docblock (which described it as deliberate) from a stale checkout as current behaviour. `resources.js`
never had the gap — it takes its whole list from `GET /validations`.

**Cost.** One `validateSource` request and three cards per id. An Italian diocesan calendar's source-data phase goes from 9 checks /
27 cards to 13 / 39; the General Roman rite-level scaffold from 8 / 24 to 11 / 33. This buys longer runs and more WebSocket traffic but
**no** extra API rate-limit exposure: `Health::validateSource()` resolves an inventory id to a filesystem path and reads it locally,
unlike the calendar-data phase, which is where this repository's history of 429s actually comes from.

**One id is conditional.** `CheckableInventory::missalItems()` emits `sanctorale:roman:{missalId}:i18n` only when
`RomanMissal::getSanctoraleI18nFilePath()` finds a folder, and it returns `false` for several missals; every other composed id is
unconditional upstream. `buildSourceDataChecks()` in `index.js` resolves each composed id against the fetched inventory and warns about
one the server does not advertise — a real disagreement, and the whole point of the inventory replacing a hand-maintained list — except
where `isConditionalInventoryId()` in `wsProtocol.js` says the absence is the contract. That predicate matches the four-segment missal
form only; the three-segment `sanctorale:{rite}:i18n` (a rite's own sanctorale translations) is unconditional and must keep warning.
`inventoryIdsForCalendar()` deliberately stays a pure function of the calendar scope and does not read the inventory itself.

### CSS Class Slugification (deprecated fallback path)

The v2 frame shapes are documented above in Frames; this subsection covers the one thing that still reads `classes` directly.
**A `stepResult` frame carries no `test` property, on this schema or any other version of it** — a unit test's name is `target.id`,
never a top-level `test` field. An earlier task in this migration fixed both this repository's unit-test page and its e2e stub, which
had been sending and reading a fictional `test` property that the server never produced; do not reintroduce it, here or in code.

`classes` is still on every `stepResult` frame, DEPRECATED and sent with the server's own casing (e.g. `.MaryMotherChurchTest`, not
`.marymotherchurchtest`) — `slugifySelector()` in `common.js` lowercases it before it is fed to `document.querySelectorAll()`. It is
read in exactly two places now, both of them fallbacks rather than the primary attribution path: `applyResultToDom()` in
`assets/js/testResults.js`, used only when a frame carries no usable `requestId`/`step` pair (a server predating per-request
correlation), and the replay of a stored run recorded before this migration, whose descriptors carry the server's old selector rather
than a client-recorded one. A current run attributes every frame by `(requestId, step)` through the registry described in Correlation
above, and does not read `classes` to do it.

## Authentication

- JWT-based auth (`src/JwtAuth.php`), shared with the LiturgicalCalendarAPI
- Access token read from the `litcal_access_token` HttpOnly cookie and verified
  server-side using `JWT_SECRET` / `JWT_ALGORITHM` (loaded via phpdotenv), which must
  match the API's JWT settings
- Login handled by the client-side login modal (`components/login-modal.php`) against
  the API; UI gated via `data-requires-auth` / `data-requires-no-auth` attributes and
  `JwtAuth::isAuthenticated()`

## Key Files

| File                             | Purpose                             |
|----------------------------------|-------------------------------------|
| `index.php`                      | Main test runner with results       |
| `admin.php`                      | Admin interface                     |
| `assets/js/index.js`             | WebSocket communication, test logic |
| `assets/js/AssertionsBuilder.js` | Test assertion builder              |
| `assets/js/wsProtocol.js`        | Shared WebSocket protocol helpers   |
| `assets/js/resources.js`         | Resources runner logic              |
| `includes/I18n.php`              | Locale detection, gettext setup     |

## Internationalization

Supports 10+ languages via gettext:
en (default), de, es, fr, hr, hu, it, pl, pt, sk

Translation files located in `i18n/{locale}/LC_MESSAGES/`

## CI/CD

- GitHub Actions workflow: `.github/workflows/main.yml`
- Automatic quality checks on push

## Code Review Workflow

This repository uses **CodeRabbit** for automated code review on pull requests.

**Important:** CodeRabbit enforces rate limiting. When addressing code review feedback:

1. Collect all CodeRabbit review comments before making changes
2. Address all issues in a single batch of commits
3. Push only after all review issues have been resolved locally
4. Avoid multiple small pushes that would trigger repeated CodeRabbit reviews

## Important Notes

- **No build step** - Pure PHP/HTML/JS
- **Timezone:** Uses Europe/Vatican for liturgical calculations
- **Security:** JWT auth shared with the API (see Authentication); no secrets baked into the repo or Docker image
- **Dependencies:** Uses liturgical-calendar/components PHP library
