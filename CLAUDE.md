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
│   ├── auth.php          # HTTP Basic authentication
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

```bash
# Install dependencies
composer install

# Start development server
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
- WebSocket server must be running (default: port 8080)

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

| Action              | Purpose                                      | Required Properties                              |
|---------------------|----------------------------------------------|--------------------------------------------------|
| `executeValidation` | Validate source data files against schemas   | `category`, `validate`, `sourceFile`             |
| `validateCalendar`  | Validate generated calendar data             | `category`, `calendar`, `year`, `responsetype`   |
| `executeUnitTest`   | Run a specific unit test                     | `category`, `calendar`, `year`, `test`           |

### Source Data Validation Categories

**IMPORTANT:** For source data validation (`executeValidation`), the `category` field determines how the server resolves file paths.

Use `category: "sourceDataCheck"` for validating source files:

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

Using incorrect categories (like `widerregioncalendar`) causes the server to use the raw `sourceFile` value as the path, which fails.

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

```javascript
const parts = missal_id.split('_');
let validateStr;
if (parts.length === 2 && /^[A-Z]{2}$/.test(parts[0])) {
    // Regional: "IT_1983" -> "proprium-de-sanctis-IT-1983"
    validateStr = `proprium-de-sanctis-${parts[0]}-${parts[1]}`;
} else {
    // Editio Typica: "EDITIO_TYPICA_1970" -> "proprium-de-sanctis-1970"
    const year = parts[parts.length - 1];
    validateStr = `proprium-de-sanctis-${year}`;
}
```

The server's `Health.php` uses `RomanMissal::getSanctoraleFileName()` to resolve the actual file path from this pattern.

**Note:** The `/missals` API endpoint returns `api_path` (URL), not `data_path` (filesystem path). For source data validation, you must use the `sourceDataCheck` category with the proper `validate` format—do not use the `api_path` directly.

### Server Response Format

Server responses include:

```javascript
{
    "type": "success" | "error",
    "text": "Human-readable message",
    "classes": ".selector.for.card.update"
}
```

### CSS Class Slugification

The server sends CSS class selectors with original casing (e.g., `.MaryMotherChurchTest`), but the client creates cards with slugified class names (e.g., `.marymotherchurchtest`).

Use `slugifySelector()` from `common.js` to transform server selectors before querying the DOM:

```javascript
document.querySelectorAll(slugifySelector(responseData.classes)).forEach(el => {
    // Update card classes
});
```

## Authentication

- HTTP Basic Auth required for all pages
- Credentials defined in `credentials.php` (not in repo)
- Password hashing via `password_verify()`

## Key Files

| File                           | Purpose                             |
|--------------------------------|-------------------------------------|
| `index.php`                    | Main test runner with results       |
| `admin.php`                    | Admin interface                     |
| `assets/js/index.js`           | WebSocket communication, test logic |
| `assets/js/AssertionsBuilder.js` | Test assertion builder            |
| `includes/I18n.php`            | Locale detection, gettext setup     |

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
- **Security:** HTTP Basic Auth; credentials in excluded file
- **Dependencies:** Uses liturgical-calendar/components PHP library
