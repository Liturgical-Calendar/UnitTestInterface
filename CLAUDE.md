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
- **Component Library:** liturgical-calendar/components (PHP UI components)

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

The test interface communicates with the LiturgicalCalendarAPI's Health websocket server (`LiturgicalCalendarAPI/src/Health.php`).

### Message Actions

Messages sent to the server must include an `action` property:

| Action              | Purpose                                    | Required Properties                                                      | Optional Properties |
|---------------------|--------------------------------------------|--------------------------------------------------------------------------|---------------------|
| `executeValidation` | Validate source data files against schemas | `category`, `validate`, **exactly one of** `sourceFile` / `sourceFolder` | `responsetype`      |
| `validateCalendar`  | Validate generated calendar data           | `category`, `calendar`, `year`, `responsetype`                           | `rite`              |
| `executeUnitTest`   | Run a specific unit test                   | `category`, `calendar`, `year`, `test`                                   | `rite`              |

`executeValidation` therefore has two request shapes — a single file, or a folder of i18n files:

```javascript
{ "action": "executeValidation", "category": "sourceDataCheck", "validate": "national-calendar-IT",      "sourceFile":   "IT" }
{ "action": "executeValidation", "category": "sourceDataCheck", "validate": "national-calendar-IT-i18n", "sourceFolder": "IT" }
```

`Health::validateMessageProperties()` lists `sourceFile` as required but special-cases its absence when `sourceFolder` is present, so
sending both, or neither, is not a supported shape. Only `resources.js` currently sends `sourceFolder`.

Messages sent during an active run also carry a `runToken` (a UUID identifying that run), added by `sendMessage()` — which attaches it
**only when a run token is currently set**, so anything sent outside a run goes without one.

**Beware:** `category` names two unrelated things depending on the action:

- on `executeValidation` it selects a *schema-resolution strategy* — in practice exactly three: `universalcalendar`, `sourceDataCheck`,
  `resourceDataCheck` (see below);
- on `validateCalendar` and `executeUnitTest` it names a *calendar type* — `nationalcalendar`, `diocesancalendar` or `ritecalendar`.

The two sets are disjoint. `executeValidation` accepts exactly the three categories below; the calendar-type names are not valid there and
never were usable — until LiturgicalCalendarAPI#805 removed them, `nationalcalendar`, `diocesancalendar`, `widerregioncalendar` and
`propriumdesanctis` lingered in the server's `retrieveSchemaForCategory()` switch, where they resolved a schema and then failed on the file
read. They now return no schema at all, which reports the real problem. See LiturgicalCalendarAPI#806 for a proposal to stop the two
vocabularies sharing a property name in the first place.

### Source Data Validation Categories

**IMPORTANT:** For source data validation (`executeValidation`), the `category` field determines how the server resolves the schema, and
**the two categories consume different inputs**. Picking the wrong one does not fail loudly — it yields a `null` schema and the card reports
*"Unable to detect schema for dataPath …"*.

| category            | Server resolves the schema from       | Use when                                             |
|---------------------|---------------------------------------|------------------------------------------------------|
| `universalcalendar` | the `sourceFile` path                 | `sourceFile` is a real path or an API URL            |
| `sourceDataCheck`   | the `validate` label (anchored slugs) | `validate` is one of the recognised slugs            |
| `resourceDataCheck` | the `sourceFile` URL                  | `sourceFile` is an absolute API URL (`resources.js`) |

Note what `sourceDataCheck` does **not** imply: the data path is whatever `sourceFile` / `sourceFolder` says, *as supplied*. The server
reconstructs it from the slug only for four slug families — `wider-region-…`, `national-calendar-…`, `diocesan-calendar-…` and
`proprium-de-sanctis-…` — each in **both** its plain form (with `sourceFile`) and its `-i18n` form (with `sourceFolder`); the missal pair
resolves through `RomanMissal::getSanctoraleFileName()` / `getSanctoraleI18nFilePath()`.

That is why those messages send a bare id (`IT`, `Europe`, `EDITIO_TYPICA_1970`) while every other `sourceDataCheck` message sends a real
path — the decrees file, the temporale file and `jsondata/tests/{rite}/{name}.json` are all sent as full paths under this same category.

#### `universalcalendar` — when the message carries a path

The universal checks built by `buildUniversalSourceDataChecks()` send real filesystem paths and API URLs, so the server resolves their
schema from the **path**. These use PascalCase `validate` labels, which are display/CSS labels only and are *not* schema keys:

```javascript
{
    "validate": "PropriumDeTempore",
    "sourceFile": "jsondata/sourcedata/rite/roman/missals/propriumdetempore/propriumdetempore.json",
    "category": "universalcalendar"   // NOT "sourceDataCheck" — the path is the schema key here
}
```

Switching these to `sourceDataCheck` would feed `PropriumDeTempore` to the slug regexes below, match nothing, and break **every** universal
check in both rites. (An automated reviewer proposed exactly that on PR #41, citing an earlier version of this section that documented only
`sourceDataCheck`.)

#### `sourceDataCheck` — when the `validate` slug is the schema key

Use `category: "sourceDataCheck"` when the schema should be chosen by the `validate` slug. For the calendar slugs below the server also
reconstructs the data path from that slug, so `sourceFile` carries a bare id:

```javascript
// Wider region check
{
    "validate": "wider-region-Europe",
    "sourceFile": "Europe",
    "category": "sourceDataCheck"  // NOT "widerregioncalendar"
}

// National calendar check
{
    "validate": "national-calendar-IT",
    "sourceFile": "IT",
    "category": "sourceDataCheck"  // NOT "nationalcalendar"
}

// Diocesan calendar check
{
    "validate": "diocesan-calendar-roma_lazio_it",
    "sourceFile": "roma_lazio_it",
    "category": "sourceDataCheck"  // NOT "diocesancalendar"
}
```

The server's `Health.php` uses regex patterns to transform these `validate` values into full file paths:

- `wider-region-{Region}` → `JsonData::WIDER_REGION_FILE` path
- `national-calendar-{CC}` → `JsonData::NATIONAL_CALENDAR_FILE` path
- `diocesan-calendar-{id}` → `JsonData::DIOCESAN_CALENDAR_FILE` path

Those `// NOT …` notes name categories that are no longer valid anywhere on `executeValidation`: LiturgicalCalendarAPI#805 removed them, so
they now resolve no schema and the card reports *"Unable to detect schema for dataPath …"*. Before that they resolved a schema and then
failed on the file read, which was harder to diagnose.

### Missal (Proprium de Sanctis) Validation

For validating national/regional missal source files, use `category: "sourceDataCheck"` with a specially formatted `validate` field:

```javascript
// Regional missal (e.g., Italian 1983)
{
    "validate": "proprium-de-sanctis-IT-1983",  // NOT the missal_id "IT_1983"
    "sourceFile": "IT_1983",
    "category": "sourceDataCheck"
}

// Editio Typica (universal missal)
{
    "validate": "proprium-de-sanctis-1970",     // Year only, no region code
    "sourceFile": "EDITIO_TYPICA_1970",
    "category": "sourceDataCheck"
}
```

**Format Conversion:**

The `missal_id` from the API must be converted to the `validate` format:

| missal_id             | validate format                  |
|-----------------------|----------------------------------|
| `IT_1983`             | `proprium-de-sanctis-IT-1983`    |
| `US_2011`             | `proprium-de-sanctis-US-2011`    |
| `EDITIO_TYPICA_1970`  | `proprium-de-sanctis-1970`       |
| `EDITIO_TYPICA_2002`  | `proprium-de-sanctis-2002`       |

**Conversion Logic:**

Build the slug from the missal's **structured metadata**, not by string-splitting `missal_id`. `region === 'VA'` means editio typica, so the
region segment is omitted:

```javascript
const validateStr = `proprium-de-sanctis${missalDef.region === 'VA' ? '' : `-${missalDef.region}`}-${missalDef.year_published}`;
```

This is what `buildNonVASourceDataChecks()` in `assets/js/index.js` and the missal loop in `assets/js/resources.js` actually do. An earlier
version of this section documented a `missal_id.split('_')` parse; that is no longer the code and should not be reintroduced.

The server's `Health.php` uses `RomanMissal::getSanctoraleFileName()` to resolve the actual file path from this pattern.

**Note:** The `/missals` API endpoint returns `api_path` (URL), not `data_path` (filesystem path).
For source data validation, you must use the `sourceDataCheck` category with the proper `validate` format—do not
use the `api_path` directly.

### Server Response Format

Server responses include:

```javascript
{
    "type": "success" | "error",   // "echobot" is also emitted for protocol errors, and is NOT handled by the client
    "text": "Human-readable message",
    "classes": ".selector.for.card.update",
    "runToken": "<uuid>",          // echoed; responses whose token does not match the active run are dropped
    "test": "StIgnatiusOfLoyolaTest"  // executeUnitTest responses only; slugified into #specificUnitTest-<slug>
}
```

**`classes` is a literal CSS selector** built server-side and passed to `document.querySelectorAll()`. It is also the *only* per-request
correlation mechanism — `runToken` identifies a run, not a request — so card class names in this repo are effectively part of the API's
contract. Three grammars are in use: `.{validate-slug}.{step}`, `.calendar-{slug}.{step}.year-{n}`, and `.{test-slug}.year-{n}.test-valid`,
where `{step}` is `file-exists`, `json-valid` or `schema-valid`. Each `executeValidation` yields exactly **3** responses (one per step), a
constant the client hardcodes when counting phase completion. See #42 / #43.

### CSS Class Slugification

The server sends CSS class selectors with original casing (e.g., `.MaryMotherChurchTest`), but the client creates cards with slugified class names (e.g., `.marymotherchurchtest`).

Use `slugifySelector()` from `common.js` to transform server selectors before querying the DOM:

```javascript
document.querySelectorAll(slugifySelector(responseData.classes)).forEach(el => {
    // Update card classes
});
```

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
