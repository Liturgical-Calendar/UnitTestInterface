# Codebase Structure — UnitTestInterface

## Top-level layout

```text
UnitTestInterface/
├── index.php              # Main test runner UI
├── admin.php              # Admin interface
├── resources.php          # Resource testing interface
├── credentials.php        # HTTP Basic Auth credentials (gitignored)
├── includes/
│   ├── I18n.php           # Locale detection + gettext setup
│   ├── auth.php           # HTTP Basic Auth
│   └── pgettext.php       # context-aware translation
├── layout/
│   ├── head.php           # HTML <head>, CSS/JS includes
│   ├── topnavbar.php
│   ├── sidebar.php
│   └── footer.php
├── components/
│   └── NewTestModal.php   # Test creation modal
├── assets/
│   ├── js/
│   │   ├── admin.js
│   │   ├── AssertionsBuilder.js   # Test assertion builder + enums
│   │   ├── common.js              # Shared utilities (escapeHtmlAttr, slugify, slugifySelector…)
│   │   ├── index.js               # Main test runner / WebSocket client
│   │   └── resources.js
│   └── css/
├── i18n/                   # gettext translations: i18n/{locale}/LC_MESSAGES/
├── src/                    # PSR-4 root for LiturgicalCalendar\UnitTestInterface\
├── e2e/                    # Playwright tests + e2e/tsconfig.json
├── playwright-report/, test-results/   # gitignored Playwright artifacts
├── logs/                   # runtime logs (gitignored)
├── vendor/, node_modules/  # deps
├── .vscode/, .github/      # editor + CI config
├── composer.json / composer.lock
├── package.json / bun.lock
├── playwright.config.ts
├── phpcs.xml               # PSR-12 + custom rules, line length 200
├── .markdownlint.yml
├── .env, .env.example, .env.development
├── Dockerfile, .dockerignore
└── CLAUDE.md, README.md, CODE_OF_CONDUCT.md, LICENSE
```

## Key JS classes / enums (`assets/js/AssertionsBuilder.js`)

- `TestType` — enum of test kinds (`exactCorrespondence`, `exactCorrespondenceSince`, …)
- `AssertType` — enum of assertion kinds (`eventNotExists`, `eventExists` AND `hasExpectedDate`)
- `LitGrade` — enum of liturgical grades (`WEEKDAY` … `HIGHER_SOLEMNITY`)
- `AssertionsBuilder` — builds HTML for assertion UI
- `Assertion` — single assertion model

## PHP-defined globals exposed to JS

- `locale` — for `Intl.DateTimeFormat`
- `LitcalEvents` — array of liturgical events from API

## WebSocket message protocol

### Required `action` field

| Action              | Purpose                               | Required props                                                       | Optional props |
|---------------------|---------------------------------------|----------------------------------------------------------------------|----------------|
| `executeValidation` | Validate source data files vs schemas | `category`, `validate`, exactly one of `sourceFile` / `sourceFolder` | `responsetype` |
| `validateCalendar`  | Validate generated calendar data      | `category`, `calendar`, `year`, `responsetype`                       | `rite`         |
| `executeUnitTest`   | Run a specific unit test              | `category`, `calendar`, `year`, `test`                               | `rite`         |

Messages sent during an active run also carry a `runToken` (a UUID identifying that run), added by `sendMessage()` — which attaches it
**only when a run token is currently set**, so anything sent outside a run goes without one.

`category` names **two unrelated things** depending on the action:

- on `executeValidation` it selects a schema-resolution strategy — in practice exactly three: `universalcalendar`, `sourceDataCheck`,
  `resourceDataCheck` (below);
- on `validateCalendar` and `executeUnitTest` it names a calendar type: `nationalcalendar`, `diocesancalendar`, `ritecalendar`.

The two sets are disjoint. `executeValidation` accepts exactly the three categories below. The calendar-type names are not valid there:
LiturgicalCalendarAPI#805 removed `nationalcalendar`, `diocesancalendar`, `widerregioncalendar` and `propriumdesanctis` from the server's
`retrieveSchemaForCategory()` switch, where they used to resolve a schema and then fail on the file read. See #806.

### Source data validation: pick the category that matches the input

The three categories are **not interchangeable** — each reads a different field. Choosing wrong yields a `null` schema and an
"Unable to detect schema" card, not a loud failure.

| category            | Server resolves the schema from       | Use when                                             |
|---------------------|---------------------------------------|------------------------------------------------------|
| `universalcalendar` | the `sourceFile` path                 | `sourceFile` is a real path or an API URL            |
| `sourceDataCheck`   | the `validate` label (anchored slugs) | `validate` is one of the recognised slugs            |
| `resourceDataCheck` | the `sourceFile` URL                  | `sourceFile` is an absolute API URL (`resources.js`) |

Under `sourceDataCheck` the data path is `sourceFile` / `sourceFolder` **as supplied**; the server reconstructs it from the slug only for
four families — `wider-region-…`, `national-calendar-…`, `diocesan-calendar-…` and `proprium-de-sanctis-…` — each in both its plain form
(`sourceFile`) and its `-i18n` form (`sourceFolder`). Hence those send a bare id (`IT`, `Europe`, `EDITIO_TYPICA_1970`) while the decrees,
temporale and tests checks send real paths under the same category.

`universalcalendar` — the universal checks from `buildUniversalSourceDataChecks()`. `validate` here is PascalCase and is a display/CSS
label only, never a schema key:

```javascript
{ "validate": "PropriumDeTempore", "sourceFile": "jsondata/sourcedata/rite/roman/missals/propriumdetempore/propriumdetempore.json", "category": "universalcalendar" }
```

`sourceDataCheck` — the checks from `buildNonVASourceDataChecks()`, where the server regex-transforms the `validate` slug into a path
(`wider-region-{Region}`, `national-calendar-{CC}`, `diocesan-calendar-{id}`, `proprium-de-sanctis-…`):

```javascript
{ "validate": "wider-region-Europe",             "sourceFile": "Europe",        "category": "sourceDataCheck" }
{ "validate": "national-calendar-IT",            "sourceFile": "IT",            "category": "sourceDataCheck" }
{ "validate": "diocesan-calendar-roma_lazio_it", "sourceFile": "roma_lazio_it", "category": "sourceDataCheck" }
```

`resourceDataCheck` — API endpoint checks in `resources.js`, where `sourceFile` is an absolute URL. Never substitute `sourceDataCheck` here.

Categories like `widerregioncalendar` / `nationalcalendar` / `diocesancalendar` are **not** valid on `executeValidation` — they resolve no
schema at all since LiturgicalCalendarAPI#805.

### Missal (Proprium de Sanctis) validation

Convert `missal_id` → `validate` string:

| missal_id             | validate format                  |
|-----------------------|----------------------------------|
| `IT_1983`             | `proprium-de-sanctis-IT-1983`    |
| `US_2011`             | `proprium-de-sanctis-US-2011`    |
| `EDITIO_TYPICA_1970`  | `proprium-de-sanctis-1970`       |
| `EDITIO_TYPICA_2002`  | `proprium-de-sanctis-2002`       |

Build the slug from the missal's **structured metadata**, not by splitting `missal_id` (`region === 'VA'` means editio typica, so the region
segment is omitted):

```javascript
const validateStr = `proprium-de-sanctis${missalDef.region === 'VA' ? '' : `-${missalDef.region}`}-${missalDef.year_published}`;
```

Server resolves via `RomanMissal::getSanctoraleFileName()`.

**Note:** the API's `/missals` endpoint returns `api_path` (URL), NOT `data_path` — do not pass `api_path` directly; always use `sourceDataCheck` with the proper `validate` format.

### Server response shape

```javascript
{
    "type": "success" | "error",   // "echobot" is also emitted for protocol errors, and is NOT handled by the client
    "text": "…",
    "classes": ".SomeSelector",
    "runToken": "<uuid>",          // echoed; responses whose token does not match the active run are dropped
    "test": "StIgnatiusOfLoyolaTest"  // executeUnitTest responses only
}
```

Each `executeValidation` yields exactly **3** responses (`file-exists`, `json-valid`, `schema-valid`) — a constant both `index.js` and
`resources.js` hardcode when counting phase completion. See #42 / #43.

Server sends selectors with **original casing** but client uses **slugified** card class names. Always pass through `slugifySelector()` from `common.js`:

```javascript
document.querySelectorAll(slugifySelector(responseData.classes)).forEach(el => { /* update */ });
```

## API date format

RFC 3339 datetimes, all-day, UTC: `"2018-05-21T00:00:00+00:00"`. Use `new Date()` + `Intl.DateTimeFormat({ timeZone: 'UTC' })` for display.
