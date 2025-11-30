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
- **Frontend:** jQuery, Bootstrap 5, Font Awesome 6
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
│   │   ├── index.js      # Main test runner logic
│   │   ├── admin.js      # Admin functionality
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

- jQuery-based DOM manipulation
- Bootstrap 5 components
- WebSocket communication for real-time updates

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

## Important Notes

- **No build step** - Pure PHP/HTML/JS
- **Timezone:** Uses Europe/Vatican for liturgical calculations
- **Security:** HTTP Basic Auth; credentials in excluded file
- **Dependencies:** Uses liturgical-calendar/components PHP library
