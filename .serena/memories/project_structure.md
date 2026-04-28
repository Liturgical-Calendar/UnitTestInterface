# Codebase Structure — UnitTestInterface

## Top-level layout
```
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
| Action               | Purpose                                          | Required props                                   |
|----------------------|--------------------------------------------------|--------------------------------------------------|
| `executeValidation`  | Validate source data files vs schemas            | `category`, `validate`, `sourceFile`             |
| `validateCalendar`   | Validate generated calendar data                 | `category`, `calendar`, `year`, `responsetype`   |
| `executeUnitTest`    | Run a specific unit test                         | `category`, `calendar`, `year`, `test`           |

### Source data validation: ALWAYS use `category: "sourceDataCheck"`
The server (`Health.php`) regex-transforms `validate` strings into file paths:
- `wider-region-{Region}` → wider region file
- `national-calendar-{CC}` → national calendar file
- `diocesan-calendar-{id}` → diocesan calendar file

Examples:
```javascript
{ "validate": "wider-region-Europe",                  "sourceFile": "Europe",          "category": "sourceDataCheck" }
{ "validate": "national-calendar-IT",                 "sourceFile": "IT",              "category": "sourceDataCheck" }
{ "validate": "diocesan-calendar-roma_lazio_it",      "sourceFile": "roma_lazio_it",   "category": "sourceDataCheck" }
```
**Wrong** categories like `widerregioncalendar`/`nationalcalendar`/`diocesancalendar` cause the server to use the raw `sourceFile` as a path → fails.

### Missal (Proprium de Sanctis) validation
Convert `missal_id` → `validate` string:

| missal_id             | validate format                  |
|-----------------------|----------------------------------|
| `IT_1983`             | `proprium-de-sanctis-IT-1983`    |
| `US_2011`             | `proprium-de-sanctis-US-2011`    |
| `EDITIO_TYPICA_1970`  | `proprium-de-sanctis-1970`       |
| `EDITIO_TYPICA_2002`  | `proprium-de-sanctis-2002`       |

```javascript
const parts = missal_id.split('_');
let validateStr;
if (parts.length === 2 && /^[A-Z]{2}$/.test(parts[0])) {
    validateStr = `proprium-de-sanctis-${parts[0]}-${parts[1]}`;     // regional
} else {
    const year = parts[parts.length - 1];
    validateStr = `proprium-de-sanctis-${year}`;                     // editio typica
}
```
Server resolves via `RomanMissal::getSanctoraleFileName()`.

**Note:** the API's `/missals` endpoint returns `api_path` (URL), NOT `data_path` — do not pass `api_path` directly; always use `sourceDataCheck` with the proper `validate` format.

### Server response shape
```javascript
{ "type": "success" | "error", "text": "…", "classes": ".SomeSelector" }
```
Server sends selectors with **original casing** but client uses **slugified** card class names. Always pass through `slugifySelector()` from `common.js`:

```javascript
document.querySelectorAll(slugifySelector(responseData.classes)).forEach(el => { /* update */ });
```

## API date format
RFC 3339 datetimes, all-day, UTC: `"2018-05-21T00:00:00+00:00"`. Use `new Date()` + `Intl.DateTimeFormat({ timeZone: 'UTC' })` for display.
