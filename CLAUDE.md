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
- **Component Libraries:** `@liturgical-calendar/components-js` (ESM, `index.php` + `resources.php`).
  The PHP `liturgical-calendar/components` package was dropped when `admin.php`, its only consumer, was
  archived — see `archive/README.md`.

## Project Structure

```text
UnitTestInterface/
├── index.php              # Main test runner UI (Calendars)
├── resources.php          # Resource testing interface
├── results.php            # Past Runs: public list/fetch, role-gated store
├── includes/              # PHP includes
│   ├── I18n.php          # Internationalization class
│   └── pgettext.php      # Context-aware translation
├── layout/                # Layout templates
│   ├── head.php          # HTML head, CSS/JS, resolves $isAuthenticated
│   ├── topnavbar.php     # Navigation bar, login button / user menu
│   └── footer.php        # Scripts, import map, login modal
├── components/            # UI components
│   └── login-modal.php   # Login modal + the whole client-side auth UI
├── assets/
│   ├── js/               # JavaScript files
│   │   ├── auth.js       # Auth API client (login, refresh, /auth/me)
│   │   ├── common.js     # Shared utilities
│   │   ├── index.js      # Main test runner logic
│   │   ├── resources.js  # Resource management
│   │   └── testResults.js # Run payloads + results.php helpers
│   └── css/              # Stylesheets
├── archive/               # Retired admin.php + its assets (archive/README.md)
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
PHP_CLI_SERVER_WORKERS=6 php -S localhost:3003   # multi-worker: api-proxy.php blocks a worker per request

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
there makes the base API path's `validates`-step checks fail. The docker stack is unaffected.

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

An item's `steps` array is the single source of truth for how many cards that check gets, on both pages. `stepsForCheck()` in
`assets/js/wsProtocol.js` is read by both halves — the scaffold that draws the cards (`stepCardsHtml()`, with the per-step card body in
`STEP_CARD_BODY` beside `STEP_CARD_CLASS`) and `beginPhase()` in `wsRunner.js` that binds them to a `requestId` — so a two-step or
four-step item cannot leave the rendered page and the run totals disagreeing (#62). A check that advertises no `steps` at all — the
bare-URL `executeValidation` checks, `index.php`'s calendar-data years, and runs stored before this migration — takes the same fallback
in both halves: `DEFAULT_CHECK_STEPS`, which is pinned to `exists`/`parses`/`validates` rather than derived from `STEP_CARD_CLASS`. It
*was* derived, and that made the first card class added to the table — `step-covers` — hand every one of those legacy checks a fourth
card no frame would ever paint, with the totals badge counting it. Do not re-derive it. The totals badges are counted through
`checkCardSelector()` / `testRunCardSelector()`, derived from those same two tables, rather than by naming the card classes at each
counting site.

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

**Both runners read it** (#69 item 1; `index.js` did not until then). Each calls `readHello()` as the first thing its `onmessage` does,
above the `Stopped` / `currentRunToken === null` guard, and `resetHello()` in its `onclose` so a reconnection to a server of a different
vintage is not answered with the previous one's capabilities. The ordering is the whole of it: `index.js` used to return early while
`currentRunToken === null`, which is always true at connect time, so the handshake was discarded before `readHello()` could be reached —
which is why adopting it was never a one-line import. Against a server that sends no `hello`, `negotiatedProtocol()` stays null and
`sendMessage()` omits the `protocol` property, which is correct rather than lax: declaring a version the server never advertised would
trip the same unknown-property gate that sending `requestId` arms.

**Item 2 of #69 is now done too**: the socket lifecycle lives once in `assets/js/wsClient.js` — URL composition, the duplicate-connection
guard, the `#websocket-status` badge, the reconnect timer and the `resetHello()` on close. Each page calls `createWebSocketClient()` with
its own `onMessage`, `onOpen` and `onClose`, so what stays per-page is only what genuinely differs: the frame handler (`handleWebSocketMessage()`,
which is `wsRunner.js`'s whole reason to exist as a seam) and the page's own state machine — `TestState.ReadyState` on `index.js` versus
`TestState.Ready` on `resources.js`, and its own `ReadyToRunTests` gate. The socket itself is handed out by `wsClient.socket()` rather than
wrapped, because `wsRunner.js`'s send path and `sendCancelRun()` both already take a `WebSocket` and each page reads `readyState` directly to
decide whether a run can start. Between this and `wsRunner.js`, #42's "a single `wsClient.js` used by both pages" is complete.

### Frames: `stepResult`, `complete`, `protocolError`

A `stepResult` frame reports one step's outcome:
`{type, text, classes, target, step, status, requestId?, runToken?, runId?, responsetype?, details?}`. `classes` and `responsetype` are
DEPRECATED projections kept only for a client that predates per-request correlation — retained until this repository stops reading them,
and not to be parsed by anything new. `target` is `{id, year?, calendar?}`, and is `null` only for the surviving `executeValidation`
shape, which names no id.

**Two step vocabularies, addressed to different cards, sharing the same `step` enum:**

- A **check** — source-data validation (`validateSource`/`executeValidation`) or calendar-data validation (`validateCalendar`) —
  reports `exists`, `parses`, then `validates`, on cards classed `step-exists`, `step-parses`, `step-validates` respectively
  (`STEP_CARD_CLASS` in `wsProtocol.js`) — or whichever subset of those its inventory item advertised, which is also the subset the
  scaffold drew (see The `/validations` Inventory above). A folder item that also carries a non-null `expected_locales` advertises a
  fourth, `covers`, on a card classed `step-covers`: the first three ask whether what is present is well-formed, `covers` asks whether
  anything is missing — whether the folder holds a `{locale}.json` for every locale its owner declares. See Locale Coverage below.
- A **test run** (`runTest`) reports only `validates`, on a card classed `step-test-validates` instead (`TEST_RUN_STEP_CARD_CLASS`). The
  same step name addresses a different card family depending on which kind of request produced the frame, which is why `wsProtocol.js`
  keeps two maps rather than one.

**Those card classes are DOM addresses, not verdicts (#60).** `step-exists` names *the card for this check's `exists` step*; it asserts
nothing about whether anything exists. The verdict is carried solely by the frame's `status` and by the `bg-success` / `bg-danger` that
`paintCard()` puts on the card. The classes were once phrased as claims — `file-exists`, `json-valid`, `schema-valid`, `test-valid` —
and that fusion of address and verdict misled prose written *about* this code (LiturgicalCalendarAPI#867 described a failure mode as "a
wrong-green `.file-exists` success", a sentence only that vocabulary makes writable). Do not reintroduce a verdict word into a card
class, and do not mirror the server's `FrameFamily::CLASS_FOR_STEP` names: this repository's card vocabulary is now deliberately its
own, and `STEP_CARD_CLASS` is the only place either table is written down.

The rename was a **clean break**: no aliases, and no card carries two vocabularies. A run stored under the old names therefore replays
onto nothing — the owner's explicit call when #60 was scoped — and the DEPRECATED `classes` fallback below only lands on a card while
the server happens to spell a step the same way this repository does.

Phase completion is driven by the terminal `complete` frame, one per request that carried a `requestId` — **not** by counting frames.
The old "each `executeValidation` yields exactly 3 responses" constant, and the `* 3` / `>= 3` arithmetic it drove, are gone from this
repository along with the frame-counting they supported: a phase now advances once every request it started has reported `complete`
(`noteTerminalFrame()` in `wsRunner.js`). That trades one failure mode for another — a request whose `complete` frame never arrives now
hangs its phase forever, rather than a frame count eventually overshooting past it — so `createSilenceWatchdog()` pairs it with a
timeout, restarted on every frame of the run and firing only once the server has genuinely gone quiet (LiturgicalCalendarAPI#823 is a
known way for a `complete` frame to be skipped after the underlying work already succeeded). Giving up on a phase **unregisters** the
requests it abandons (`registry.forget()`, #64): their unpainted steps have already been counted as failures, so a late frame from a
server that was merely quiet longer than the window and then recovered must reach the "no card is registered for this request" warning
rather than paint an abandoned phase's card a second time.

A `protocolError` frame (`{type: "protocolError", errorCode, text, runToken?, requestId?}`) reports a message that could not be acted
on — an unknown action, a retired property, a malformed `requestId`, and so on. It is not gated on `requestId` the way `complete` is: a
new frame type changes nothing for a client that was going to receive a frame anyway.

**A rejection is an ending, and both runners treat it as one** (#70). `handleProtocolError()` in `wsRunner.js` — called from each page's
`onmessage` immediately after `noteTerminalFrame()`, so both pages get it from one implementation — paints every *unpainted* step card of
the named request red with the frame's `text` (the steps `registry.missingSteps()` reports, the same question `summariseAbandoned()` asks
when a phase is given up on), reports each one to the page's own failure counters through the `onAttributedFailure` callback, and completes
the request so the phase advances. A rejection carrying no `requestId`, or naming a request no longer registered, is left to the page's
existing unattributable-failure branch. Before this, a `protocolError` fell through the `type` dispatch into that branch unconditionally:
one failure booked for a request whose scaffold rendered three cards, and — carrying no `step: "complete"` — no ending at all, so the phase
waited out the full silence watchdog even though the server had answered instantly (observed live: 82 rejections inside half a second, then
a sixty-second stall).

### Rite Scoping

Both runner pages carry a `RiteSelect` from `@liturgical-calendar/components-js`, defaulting to `roman`. The predicate is `inRiteScope()`
in `assets/js/wsProtocol.js`; an absent `rite` means Roman, never "every rite", because a fail-open filter would request Roman-only
resources under the Ambrosian rite, which the API rejects.

Only the diocesan tier exists under more than one rite. National calendars, wider regions and the `/missals` registry are Roman-only —
`RegionalDataParams::validateRiteCompatibility()` rejects a national or wider-region request under a non-Roman rite — so `resources.php`
omits them entirely when the Ambrosian rite is selected rather than requesting and failing them.

**A non-Roman diocese inherits no Roman layer at all**, and `index.php`'s source-data scaffold follows that:
`buildNonVASourceDataChecks()` in `assets/js/index.js` has one branch per rite family, keyed on the diocese's own `rite` from
`/calendars` rather than on `currentRite` (which corpus a calendar is built from is a property of the calendar, not of the select's
state). A non-Roman diocesan scaffold is that rite's own corpus plus the diocese — identical to the rite-level scaffold plus
`diocese:{rite}:{id}` — with no national tier, no wider region, no missals, no `temporale:roman`, no `decrees:roman` and no
`lectionary:roman:*`. The authority is `CalendarHandler::calculateAmbrosianCalendar()`, which reads exactly three things: the Ambrosian
temporale, the Ambrosian sanctorale and the diocese's own file. It never calls `calculateUniversalCalendar()` or
`applyNationalCalendar()`; `loadDiocesanCalendarData()` deliberately leaves `NationalCalendar` null on that path; and
`CalendarParams::validateRiteCompatibility()` throws if it is set at all. Until this landed the scaffold was built with `rite: 'roman'`
regardless, so `milano_it` checked 26 items of which 19 named source data its calendar never reads (26 checks / 93 cards → 7 / 22). Do
not restore the old reading: `inventoryIdsForCalendar()`'s pre-existing docblock described it as a deliberate open design question, and
the API has since answered it.

**Under the Roman rite the national tier is required, and a missing one is fatal.** `loadDiocesanCalendarData()` sets `NationalCalendar`
to the diocese's nation unconditionally on the Roman path and `CalendarParams::validateNationalCalendar()` rejects a nation absent from
`national_calendars_keys`, so a Roman diocese whose nation had no national calendar could not have its calendar generated at all —
metadata saying otherwise is wrong, not merely sparse. components-js's `CalendarSelect` enforces the same rule and throws outright ("a
metadata defect, not a recoverable runtime condition"), so this repository's guard is a backstop for the case where the library's
`/calendars` fetch and this page's own disagree. Under a rite with no national layer the same absence is the contract, and stays quiet:
`lugano_ch` (Ambrosian, nation `CH`) is the case in the data — the API ships dioceses under `CH` but no `nations/CH` calendar. Treating
that as fatal for *every* non-rite calendar is what used to bail out of `setupPage()` above the scaffold rebuild, leaving the page under
its loader showing the previously selected calendar's cards.

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
This is a Roman-tier family: a non-Roman calendar composes none of these, because its "missals" are its own temporale and sanctorale,
which the `rite` argument already covers as `temporale:{rite}` / `sanctorale:{rite}` (see Rite Scoping above).
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

The three `roman`-prefixed forms are reached only by a Roman calendar: a non-Roman scope arrives with `nation`, `widerRegion` and
`missals` already empty (see Rite Scoping above), so its calendar-specific tier is the `diocese:` pair alone.

The calendar-specific half is issue #61, landed after the #42 migration rather than during it: #42 deliberately held coverage constant so
that a change in card counts would be a migration bug rather than intended new coverage. Do not reintroduce the omission, and do not read
`inventoryIdsForCalendar()`'s old docblock (which described it as deliberate) from a stale checkout as current behaviour. `resources.js`
never had the gap — it takes its whole list from `GET /validations`.

**Cost.** One `validateSource` request and three cards per id — four for an id that also advertises `covers`. A *Roman* Italian diocesan
calendar's source-data phase went from 9 checks / 27 cards to 13 / 39 with this change, and to 27 / 99 once the lectionary corpus and the
`covers` step landed; the General Roman rite-level scaffold from 8 / 24 to 11 / 33, and then to 22 / 79. An *Ambrosian* Italian diocesan
calendar is far smaller — 7 checks / 22 cards — since it carries no Roman tier at all (see Rite Scoping above). This buys longer runs and more WebSocket traffic but
**no** extra API rate-limit exposure: `Health::validateSource()` resolves an inventory id to a filesystem path and reads it locally,
unlike the calendar-data phase, which is where this repository's history of 429s actually comes from.

**One id is conditional.** `CheckableInventory::missalItems()` emits `sanctorale:roman:{missalId}:i18n` only when
`RomanMissal::getSanctoraleI18nFilePath()` finds a folder, and it returns `false` for several missals; every other composed id is
unconditional upstream. `buildSourceDataChecks()` in `index.js` resolves each composed id against the fetched inventory and warns about
one the server does not advertise — a real disagreement, and the whole point of the inventory replacing a hand-maintained list — except
where `isConditionalInventoryId()` in `wsProtocol.js` says the absence is the contract. That predicate matches the four-segment missal
form only; the three-segment `sanctorale:{rite}:i18n` (a rite's own sanctorale translations) is unconditional and must keep warning.
`inventoryIdsForCalendar()` deliberately stays a pure function of the calendar scope and does not read the inventory itself.

### Lectionary Validation

The lectionary corpus — 95 files, 5,975 `event_key` → readings entries — became checkable in issue #61 part 2, once the API defined
`Lectionary.json`. There are 26 folders across six tiers, and the id scheme mirrors the `:i18n` precedent: a `lectionary:` prefix for the
corpus nothing owns, a `:lectionary` suffix on whatever owns the rest.

```text
lectionary:roman:{section}              decrees:roman:lectionary
nation:roman:{id}:lectionary            widerregion:roman:{name}:lectionary
diocese:{rite}:{calendarId}:lectionary  sanctorale:roman:{missalId}:lectionary
```

**Two mechanisms, one rule: compose what calendar metadata implies, discover from the inventory what it does not.**
`inventoryIdsForCalendar()` composes a `:lectionary` sibling beside each calendar-tier id, exactly as it composes `:i18n`.
The ten rite-level section names (`sanctorum`, `feriale_per_annum_I`, …) are **not** composed — nothing in `/calendars` publishes them, so
`buildSourceDataChecks()` in `index.js` takes every advertised item whose id starts with `lectionary:{rite}:` instead, plus
`decrees:{rite}:lectionary`. Listing the section names here would put a copy of the API's on-disk layout back into this repository, and a
section added upstream would go silently unchecked — the same staleness `UNIVERSAL_CHECKS` used to cause.

**The four-segment `:lectionary` form is conditional** (`CONDITIONAL_LECTIONARY_ID` in `wsProtocol.js`). Absence is its ordinary state:
three of ten nations, one wider region, two of five missals and nine dioceses have a lectionary folder. The three-segment
`decrees:roman:lectionary` and the `lectionary:roman:{section}` corpus are unconditional and must keep warning — the same segment-count
split that already separates a missal's conditional `:i18n` from a rite's unconditional one, which is why the id scheme was chosen.

`Lectionary.json` is **permissive about empty readings** by design: 85% of entries carry at least one empty-string reading, and filling
them in is LiturgicalCalendarAPI#712. A green `validates` card asserts the structure is in place, which is what the item labels say
("lectionary structure"). Note also that source readings nest a `vigil` key while output readings never do — see the API's CLAUDE.md on
schema roles; `Lectionary.json` builds on `CommonDef.json#/definitions/SourceReadings`, not on `Readings`.

### Locale Coverage: the `covers` step

A folder item whose expected locale set has an authority **other than the folder itself** advertises a fourth step, `covers`, and carries
that set as `expected_locales` on `/validations`. The two are derived from one another server-side, so an item cannot advertise the step
with nothing to compare against.

That excludes exactly two families, where the owner's declared locales are scanned from the very folder being checked and the comparison
would be a tautology: a wider region's `:i18n` and a missal's `:i18n`. National and diocesan calendars **declare** `locales` in their own
source files, so their `:i18n` folders *are* covered; the rite-level corpus is measured against the General Roman Calendar's set, which is
five locales, not the fourteen gettext folders.

The verdict is a subset test **by locale identity, never by count**: a declared locale with no `{locale}.json` fails the step, while a file
for a locale the owner does not declare does not fail it and is named in the frame text — which is how a stale `locales` declaration
surfaces. `nation:roman:US:lectionary` reports exactly that today: `es_US` data exists that `US.json` does not declare.

### CSS Class Slugification (deprecated fallback path)

The v2 frame shapes are documented above in Frames; this subsection covers the one thing that still reads `classes` directly.
**A `stepResult` frame carries no `test` property, on this schema or any other version of it** — a unit test's name is `target.id`,
never a top-level `test` field. An earlier task in this migration fixed both this repository's unit-test page and its e2e stub, which
had been sending and reading a fictional `test` property that the server never produced; do not reintroduce it, here or in code.

`classes` is still on every `stepResult` frame, DEPRECATED and sent with the server's own casing (e.g. `.MaryMotherChurchTest`, not
`.marymotherchurchtest`) — `slugifySelector()` in `common.js` lowercases it before it is fed to `document.querySelectorAll()`. The
rename in #60 did not change what `slugifySelector()` does: the new step classes are already lowercase, so it stays a no-op for them
and remains needed only for the check/test slug the server casts in its own casing. It is read in exactly two places now, both of them
fallbacks rather than the primary attribution path: `applyResultToDom()` in `assets/js/testResults.js`, used only when a frame carries
no usable `requestId`/`step` pair (a server predating per-request correlation), and the replay of a stored run recorded before this
migration, whose descriptors carry the server's old selector rather than a client-recorded one. A current run attributes every frame by
`(requestId, step)` through the registry described in Correlation above, and does not read `classes` to do it.

**Both fallbacks now depend on a vocabulary this repository no longer uses**, since #60 renamed the card classes on this side only. A
`classes` selector composed by the server's `FrameFamily::CLASS_FOR_STEP` (`.foo.file-exists`) matches no card here any more, and
neither does a run stored before the rename. Both cases warn — `applyResultToDom()` logs the selector that matched nothing — rather
than failing silently, and neither is reachable from a current run against a current API. That is the accepted cost of the clean break;
do not "fix" it by teaching either path to translate between the two vocabularies, which is exactly the dual addressability #60
removed.

The **other address components on a card are unchanged and were reviewed in the same pass**: `calendar-{slug}` and `year-{n}` are
already noun-valued addresses carrying no verdict, and the check's own slug (`idToCardClass()` / `slugify()`) names what is being
checked. Only the step component was ever phrased as a claim.

## Authentication

Two mechanisms, in that order of preference, mirroring the API's own `OidcAuthMiddleware`:

1. **Zitadel OIDC** (preferred). UTI is an OIDC client in its own right, with its own Zitadel
   registration — `scripts/setup-zitadel.sh` in LiturgicalCalendarAPI provisions it as
   "LiturgicalCalendar Tests", with `http://localhost:${TESTS_PORT}/auth/callback.php` as its redirect
   URI. Its own client matters because UTI may one day be served from a different host than the
   Frontend, and cookies cannot be shared across registrable domains.
2. **Legacy JWT** fallback, for a deployment with no Zitadel. Unglamorous and deliberately not invested
   in; it is what the e2e suite still authenticates with, which is why no Zitadel dependency enters
   UTI's CI.

| File                                  | Role                                                          |
|---------------------------------------|---------------------------------------------------------------|
| `src/Oidc/Client.php`                 | PKCE, discovery, code exchange, logout URL. Validates nothing |
| `src/Oidc/TokenValidator.php`         | Validates a Zitadel token against the provider's signing keys |
| `src/Oidc/Session.php`                | PKCE session keys, `return_to` validation, cookie writing     |
| `src/JwtAuth.php`                     | Resolves identity: Zitadel locally, else the API's `/auth/me` |
| `auth/{login,callback,logout}.php`    | The round trip                                                |
| `auth/{me,refresh}.php`               | This app's own "who am I?" and "renew me"                     |

**`/auth/me` on the API does NOT accept Zitadel tokens.** `Router.php` pipes `OidcAuthMiddleware` only
for an allow-list of auth sub-routes and `me` is not among them, so `MeHandler` verifies with the API's
HS256 service alone. This is known, deliberate behaviour — LiturgicalCalendarFrontend's
`e2e/rbac/support/actingAs.spec.ts` records it and validates locally for the same reason. It is why
`TokenValidator` exists here at all, and why `auth/me.php` does: `assets/js/auth.js` used to ask the
API's endpoint directly and would report a Zitadel-authenticated user as logged out.

**The same is true of `/auth/refresh`, and `auth/refresh.php` is its answer** (#93). `auth.js` consulted
`oidcEnabled` for identity but not for renewal, so a Zitadel session was resolved locally and then
renewed against the API's legacy HS256 endpoint, which answers 400. The session simply expired with no
renewal; the most expensive place it landed was the end of a test run, where the terminal
`postRunResults()` then got a 401 and the run was not stored. `authMeEndpoint()` and
`authRefreshEndpoint()` now sit beside each other in `auth.js` — any future "where do I ask about the
session?" belongs there too, since one branch answering for identity while another path assumed the API
is precisely how these diverged.

**A failed renewal is two different facts, and conflating them ends live sessions.** `auth/refresh.php`
answers **401** when the session is over (no refresh token, or one the provider refused) and **503**
when the provider could not be reached or would not answer just now, leaving the cookies alone in that
case. `isDefinitiveRefreshFailure()` in `auth.js` is the client half: anything other than a 4xx is
transient and the auto-refresh timer retries — it runs every minute over the last five before expiry.
Before this, the catch cleared the cached session on *any* thrown error, so one failed DNS lookup
discarded a session that was still valid.

The predicate is a **range** rather than a bare `401` because the two refresh endpoints disagree on the
code for the same fact: ours says 401, the API's legacy one says 400, and testing for 401 alone would
leave every non-Zitadel deployment retrying a session that had ended. It carves out **408 and 429**,
because those are about the request's *timing* rather than about the token — and a rate limit ending a
valid session is a live scenario in this repository, not a theoretical one. `Oidc\Client::TRANSIENT_STATUSES`
holds the same two on the server side (`http_errors` makes Guzzle raise `ClientException` for every 4xx
alike, so `refreshTokens()` has to sort them itself). **Keep the two lists in step**: the browser
deciding a failure is final while the server says try again later is the disagreement this pairing
exists to prevent.

**Every path that renews must honour that distinction, not just the timer.** `handleExtendSession()` in
`components/login-modal.php` caught *every* error from `Auth.refreshToken()` and ran the full logout
sequence — so a transient failure logged the user out at the one moment they had explicitly asked to
stay signed in, and, because it also calls `stopAllTimers()`, removed the automatic retry that would
have renewed the session moments later. It now returns early on a non-definitive failure, keeps the
session, and restarts the timers; `startSessionExpiryWarning()` guards on `Auth.isAuthenticated()`,
which is still true precisely because the cached session was left alone.

On a definitive failure `auth.js` dispatches `auth:session-expired`, which `components/login-modal.php`
turns into a logged-out navbar, a re-evaluated Run Tests button (via `auth:logout`) and the
`#sessionExpiredToast`. Deliberately **not** a redirect, unlike `handleAutoLogout()`: that one sends an
OIDC user to `/auth/logout.php` to end the provider session as well, which is right when a live session
is being given up — here the provider has already refused the token, so there is no session left to end
and navigating away from the user's work would accomplish nothing.

**`auth/refresh.php` is POST-only**, unlike `auth/me.php` and `auth/logout.php` beside it, because it
changes state: the provider rotates the refresh token and the new one must replace the stored one, or
the next renewal fails. The auth cookies are `SameSite=Lax`, which withholds them from a cross-site POST
but sends them on a cross-site top-level GET navigation — so accepting GET would let a third-party page
force a rotation in the victim's browser simply by linking there.

**Two untested branches, knowingly.** The 200 path — a valid refresh token exchanged and the three
cookies rewritten — has no e2e coverage, because the fixture user authenticates through the API's legacy
service and holds no Zitadel refresh token. What *is* covered is that the back-channel call genuinely
reaches Zitadel: posting the fixture's legacy token returns `refresh_rejected`, which is reachable only
from a 4xx at the token endpoint, so discovery, the `ZITADEL_INTERNAL_URL` `Host` header and the form
encoding are all exercised. The cookie writing mirrors `auth/callback.php` line for line.

`Oidc\Client::TRANSIENT_STATUSES` is the second: the e2e tests stub the refresh response in the browser,
so they exercise `isDefinitiveRefreshFailure()` but never the PHP sorting of a 429 from the *token
endpoint*, which would need Zitadel itself to rate-limit. The two lists being identical and adjacent in
the documentation is what stands in for that test — which is exactly why they must not drift.

**Back-channel calls travel over `ZITADEL_INTERNAL_URL` in cleartext** where that is a container address
(`.env.example` shows `http://zitadel:8080`). This is a property of the whole OIDC integration, not of
any one call: `exchangeCode()` sends the authorization code the same way and `TokenValidator` fetches
JWKS over it. Enforcing TLS would be a deployment-wide decision that the documented docker stack does not
currently satisfy — worth doing, not something to bolt onto one method.

**The login control has two shapes.** `layout/head.php` sets `$oidcEnabled`; with Zitadel configured
the navbar renders `#loginBtn` as a link into `/auth/login.php` and `components/login-modal.php`'s click
handlers stand down, otherwise it stays a button that opens the legacy modal.

**Cookies** (`litcal_access_token`, `litcal_refresh_token`, `litcal_id_token`) are written by
`Oidc\Session` with exactly the attributes the API's `CookieHelper` uses, since the API reads them back.
`COOKIE_DOMAIN` opts into cross-subdomain sharing.

**`ZITADEL_ORG_ID` matters on a shared Zitadel instance.** It appends `urn:zitadel:iam:org:id:<id>`,
forcing sign-in *and registration* into that org; without it the hosted login registers users into
Zitadel's IAM-internal default org, where they have no email, show their user id as their username, and
hold no roles. `urn:zitadel:iam:org:project:roles` is always requested — without it a login succeeds and
the user simply arrives with no roles.

**`ZITADEL_INTERNAL_URL` is required in Docker.** Zitadel answers 404 to any request whose `Host` does
not match its configured external domain, so back-channel calls sent to a container hostname carry the
issuer's host — injected through a Guzzle handler stack, because Guzzle derives `Host` from the request
URI and overwrites a default header.

### Reading Past Runs is Public; Running Tests is Not

`results.php` gates per method, not per request. `GET` — both the listing and `?file=` detail — is **public**;
`POST` requires authentication *and* one of `JwtAuth::RUN_TESTS_ROLES` (`admin`, `test_editor`). It used to be a
single `isAuthenticated()` check above the method switch, which meant an anonymous visitor to what is otherwise a
public test dashboard could not see a single stored run.

Opening the read side was a deliberate trade, not an oversight: a stored run carries no credentials and no user
identity, but it does reveal which calendars are failing validation and which API paths a run exercised. That is
acceptable for a dashboard whose purpose is publishing test outcomes.

**The write gate answers 401 and 403 distinctly**, because the remedy differs — 401 means nobody is logged in and
logging in would help, 403 means someone is and it would not. Both runners branch on them separately
(`#results-save-unauthenticated` vs `#results-save-forbidden`); reporting either as "could not save" would misread a
run that actually succeeded.

**`safeResultPath()` is now load-bearing** — it is all that stands between a public `?file=` and an arbitrary file
read. Traversal is blocked by the character class rather than by the `basename()` check: `[0-9T\-Z]` admits no `.`,
no `/` and no `\`, so `..` and an absolute path are unrepresentable. The `basename()` check is a deliberately
redundant second line. The pattern carries the `D` modifier because PCRE's `$` otherwise also matches before a
trailing newline.

**One predicate, two consumers.** `JwtAuth::canRunTests()` is asked by `results.php` (which enforces it) and by
`layout/head.php` (which publishes `$canRunTests` so the Run Tests button renders disabled on first paint rather
than enabling and then failing at the POST). A `hasRole('admin') || hasRole('test_editor')` spelled out at each call
site is exactly how the endpoint and the button would drift into disagreeing. `layout/footer.php` publishes the role
list itself as `runTestsRoles` alongside the verdict, so `canRunTests()` in `common.js` can re-ask after an in-page
legacy-modal login — which does not reload, leaving the server-rendered verdict stale — without a hardcoded copy of
the list in JS.

**Permission is not a readiness condition.** The role check is applied to `#startTestRunnerBtn.disabled` *beside*
`ReadyToRunTests.check()`, never folded into it: `hidePageLoader()` is gated on `check()`, so a permission-aware
`check()` would leave every anonymous visitor under the translucent page loader forever — the #63 failure mode,
reintroduced. Readiness is a question about the page; permission is a question about the user. The same separation
governs the rite, calendar and response-format selects — see **The Controls Describe What Is On Screen** below.

The **UI gate is a courtesy, not the enforcement point**: `results.php` answers 403 regardless of what the page
believes. Note also that starting a *run* is gated only client-side — the WebSocket server has no notion of these
roles — so what the role actually protects is storing the result.

**Untested case, knowingly.** "Authenticated but lacking the role" has no e2e coverage: the fixture user
authenticates through the API's legacy service, whose `User` model defaults to `['admin']`, and covering the
negative would mean seeding a second roleless Zitadel user. The positive and anonymous cases are covered; this gap
was accepted rather than papered over with a test that looks like it covers the gate and does not.

### The Controls Describe What Is On Screen

The rite, calendar and response-format selects on both runner pages answer to one predicate, derived in each page's
`applyControlAvailability()` from all three of its inputs at once rather than written by whichever caller fired last:

```text
enabled  <=>  canRunTests() && no replay on screen && no run in flight
```

Each condition has its own reason. **A run in flight**: these selects funnel into `setupPage()`, which rebuilds the
scaffold, renarrows `Years` and zeroes the counters, so a mid-run change stores a run that contradicts itself.
**No permission**: they are inputs to a run, and aim nothing for someone who cannot start one — applied beside
`ReadyToRunTests.check()`, never inside it, for the #63 reason above. **A replay on screen**: they describe the
stored run being shown. `#pastRunsSelect` answers to the first condition only, since reading stored runs is public
and replaying one is how a visitor who cannot run tests sees any other calendar's scaffold at all.

That third condition is why `replayCalendarsRun()` and `replayResourcesRun()` call `syncControlsToStoredRun()`
before they paint. A rite select reading "Ambrosian Rite" above a Roman run's cards is the class of untruth this
interface exists to detect. A disabled select still displays its value, so setting it labels the replay rather than
inviting an edit, and no separate caption is needed.

**Only the Calendars page dispatches its rite change**, and only because a linked `CalendarSelect` must rebuild its
option set before that run's calendar is selectable at all — a value with no option silently becomes `''`.
`CalendarSelect#applyLinkedRite()` does that rebuild synchronously from already-loaded metadata, then dispatches its
own `change`; `suppressControlChangeHandlers` is what stops both events reaching `handleCalendarSelectChange()` and
rebuilding the live scaffold over the stored one. The Resources page assigns its values and dispatches nothing: its
rite listener calls `loadAsyncData()`, an asynchronous rediscovery that would land after the replay had painted.

**A stored value the select cannot hold is refused, not blanked.** A native `<select>` silently becomes `''` when
handed a value it has no option for, and a stored run carries the rite and response format that were selected when
it *ran* — which need not be what the server advertises today. `selectExistingValue()` in `common.js` restores the
previous value and warns instead. That matters because `resyncLiveStateFromDom()` reads these selects back when a
replay is closed, so a blank would become `currentRite` / `currentResponseType` and go on the wire as the next run's
rite or response format; `e2e/response-format-capabilities.spec.ts` already pins the same hazard arriving by another
route. The **calendar** select is deliberately exempt: `''` is its rite-level option, a meaningful value, so a
missing option falls back to it and warns rather than being restored.

**Nothing stashes a pre-replay selection**, so leaving a replay lands on that run's rite and calendar rather than on
what was selected before it. `resyncLiveStateFromDom()` reads the controls, and the controls describe what is on
screen — so the dashboard a user returns to matches the controls they can see. Which calendar that is follows from
that property; it is not itself the property being kept. `e2e/results-replay.spec.ts` asserted the older behaviour
(returning to Live rebuilt the General Roman scaffold) and was updated with the change, not worked around.

**`replayOnScreen` is module state, not `#pastRunsSelect.value`.** `pastRuns.load()` clears the select on every
refill, so a login or logout while a replay is on screen drops that value to `''` without changing a single card;
reading it would report "live" and hand back controls that repaint somebody else's run. The `auth:login` /
`auth:logout` handlers return to live in that case rather than leaving the dropdown and the dashboard disagreeing.

**A stored run is replayed from its own descriptors, never from live module state.** `resourceTemplate()` used to
resolve each card's URL from the live `resourcePaths` map — sound for the live caller, which passes the keys *of*
that map, and wrong for replay, which passes keys from a stored run. `resetCheckListsForRite()` deletes every
`data-path-*`, `events-path-*` and `missals-path-*` entry on a rite change, so after switching to Ambrosian not one
of a stored Roman run's per-nation keys was still there; the miss yielded `undefined`, `escapeHtmlAttr()` threw on
it, and `buildScaffolding()` died mid-`forEach` after the container had already been emptied — a half-built
scaffold, stale counts and the `#results-load-failed` toast. The URL was in the descriptor's `sourceFile` all
along. `sourceTemplate()` never had the bug because it reads everything off the item it is handed. Do not
reintroduce a lookup into live state from either template, and do not paper over a missing value with `?? ''`:
that trades a loud crash for a scaffold of cards labelled with nothing, which is the silent wrong answer this
interface exists to catch rather than commit.

## Key Files

| File                          | Purpose                                    |
|-------------------------------|--------------------------------------------|
| `index.php`                   | Main test runner with results              |
| `resources.php`               | Resource data test runner                  |
| `results.php`                 | Past Runs: public read, role-gated write   |
| `assets/js/index.js`          | WebSocket communication, test logic        |
| `assets/js/resources.js`      | Resources runner logic                     |
| `assets/js/wsProtocol.js`     | Shared WebSocket protocol helpers          |
| `assets/js/wsClient.js`       | Shared socket lifecycle + reconnect        |
| `assets/js/wsRunner.js`       | Shared phase runner and send path          |
| `assets/js/testResults.js`    | Run payloads and `results.php` helpers     |
| `components/login-modal.php`  | Login modal + auth UI, on every page       |
| `layout/footer.php`           | Shared scripts, import map, login modal    |
| `includes/I18n.php`           | Locale detection, gettext setup            |

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
