# Code Style & Conventions — UnitTestInterface

## PHP

- **PHP >= 8.1** (procedural with classes; no build step)
- **PSR-12** with custom rules, **line length 200** (config: `phpcs.xml`)
- PSR-4: `LiturgicalCalendar\UnitTestInterface\` → `src/`
- Auto-fix style with `composer lint:fix`

## JavaScript

- **Native ES6** (DOM, fetch, WebSocket)
- **No jQuery** despite README mention — Bootstrap 5 native JS API (Toast, Collapse, Modal, Tooltip) is used directly
- Shared utilities live in `assets/js/common.js`:
  - `escapeHtmlAttr(s)`
  - `slugify(s)`
  - `slugifySelector(sel)` — required to translate server-side selectors (original casing) into client-side card class names
    (slugified). **Always use this** when querying for cards based on `response.classes`.

## CSS class slugification (CRITICAL)

Server emits selectors like `.MaryMotherChurchTest`; client cards are created with `.marymotherchurchtest`. Without `slugifySelector()`, DOM updates will silently miss.

```javascript
document.querySelectorAll(slugifySelector(responseData.classes)).forEach(el => { /* … */ });
```

## WebSocket categories (CRITICAL)

- `executeValidation` takes exactly three categories, and they are NOT interchangeable — each resolves the schema from a different field:
  - `universalcalendar` — from the `sourceFile` **path** (the universal checks in `buildUniversalSourceDataChecks()`)
  - `sourceDataCheck` — from the `validate` **slug** (the wider-region / national / missal / diocesan checks)
  - `resourceDataCheck` — from the `sourceFile` **URL** (the API endpoint checks in `resources.js`)
- Choosing wrong yields a `null` schema and an "Unable to detect schema" card, not a loud failure
- Under `sourceDataCheck` the server regexes the `validate` slug to compute the file path for four families only —
  `wider-region-…`, `national-calendar-…`, `diocesan-calendar-…` and `proprium-de-sanctis-…` — each in both its
  plain form (`sourceFile`) and its `-i18n` form (`sourceFolder`); every other slug (decrees, temporale, tests)
  uses `sourceFile` / `sourceFolder` as supplied
- For missals, build the slug from `missalDef.region` / `year_published` (see project_structure memory)

## API date handling

- RFC 3339, midnight UTC: `"2018-05-21T00:00:00+00:00"`
- Parse with `new Date(str)`
- Display with `Intl.DateTimeFormat(locale, { timeZone: 'UTC', … })`

## Globals exposed from PHP → JS

- `locale` — for `Intl.DateTimeFormat`
- `LitcalEvents` — events array from API

## i18n (gettext)

- Translation files under `i18n/{locale}/LC_MESSAGES/`
- 10+ languages supported: en (default), de, es, fr, hr, hu, it, pl, pt, sk
- Use `_()` for translatable strings; `pgettext.php` for context-aware translations
- Locale detection in `includes/I18n.php`

## Markdown

- `.markdownlint.yml`:
  - Max line length **180** (excl. code blocks, tables)
  - MD060: tables vertically aligned
  - Fenced code blocks with language specifier

## Auth

- HTTP Basic Auth on all pages via `includes/auth.php`
- Credentials loaded from `credentials.php` (gitignored)
- Use `password_verify()` against hashed values

## Liturgical timezone

Always `Europe/Vatican` for any liturgical date math (matches API).

## Naming conventions

- PHP: PascalCase classes/namespaces, camelCase methods/properties, snake_case for procedural helpers in older code
- JS: camelCase functions/vars, PascalCase classes (e.g. `AssertionsBuilder`, `Assertion`)
- File names: kebab-case for top-level pages where present; single-word `.php` for root entry points
