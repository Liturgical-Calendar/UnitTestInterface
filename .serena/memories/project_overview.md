# UnitTestInterface — Project Overview

**Web-based graphical test interface** for validating the LiturgicalCalendarAPI. Connects via **WebSocket** to a test server (the API's `Health.php` Ratchet websocket), runs unit tests asynchronously, and renders results in real time on a responsive Bootstrap 5 dashboard.

## Testing capabilities
- Source data validation against JSON schemas
- Calendar generation across locales / regions
- API response formats (JSON, YAML, XML, ICS)
- Liturgical event definitions and precedence rules

## Tech Stack
- **PHP >= 8.1** (procedural with classes; **no build step**)
- Composer package: `liturgical-calendar/unit-test-interface`, namespace `LiturgicalCalendar\UnitTestInterface\` → `src/`
- Frontend: Native ES6 JS (no jQuery dependency despite README mention), Bootstrap 5 (native JS API: Toast, Collapse, Modal, Tooltip), Font Awesome 7
- Communication: WebSocket → Ratchet server (`LiturgicalCalendarAPI/src/Health.php`)
- PHP deps: `liturgical-calendar/components` ^3.1, `firebase/php-jwt`, `guzzlehttp/guzzle`, `monolog/monolog`, `vlucas/phpdotenv`
- Quality: PHP_CodeSniffer (PSR-12 + custom rules, line length 200)
- E2E: Playwright + TypeScript (Node, also `bun.lock` present)
- i18n: GNU gettext, 10+ languages: en (default), de, es, fr, hr, hu, it, pl, pt, sk

## Live URL
Production WebSocket endpoint: `wss://litcal-test.johnromanodorazio.com`

## Repo Location
`/home/johnrdorazio/development/LiturgicalCalendar/UnitTestInterface`

## Companion repos
- `LiturgicalCalendarAPI` — owns the WebSocket server (`src/Health.php`) and source data; this UI cannot work without it
- `LiturgicalCalendarFrontend` — the public-facing site
- `liturgy-components-js` — shared JS components

## Default ports (dev)
- API: `localhost:8000`
- WebSocket server: `localhost:8082` (CLAUDE.md) / `8080` in some docs (README) — verify against `.env.example`
- This interface: `localhost:3003`

## Auth
HTTP Basic Auth on all pages. Credentials in `credentials.php` (gitignored). Verified via `password_verify()`.

## Code review workflow
**CodeRabbit** runs on PRs with rate-limiting:
1. Collect all CodeRabbit comments first
2. Address everything in a batched series of commits
3. Push only after all local fixes — avoid multiple small pushes
