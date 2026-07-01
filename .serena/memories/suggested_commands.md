# Suggested Commands — UnitTestInterface

## First-time setup
```bash
composer install
cp .env.example .env.development     # then edit
# Create credentials.php (gitignored) with HTTP Basic Auth users
yarn install || npm install || bun install   # for Playwright (bun.lock present)
```

## Dev server
```bash
php -S localhost:3003
# VSCode: Ctrl+Shift+B → litcal-tests-webui
```
Requires running:
- LiturgicalCalendarAPI on `localhost:8000`
- WebSocket server (from API repo) on `localhost:8082` (or 8080 — verify `.env.example`)

## Environment
Copy `.env.example` → `.env.development` (or `.env.local`). Keys:
- `WS_PROTOCOL`, `WS_HOST`, `WS_PORT`
- `API_PROTOCOL`, `API_HOST`, `API_PORT`
- `APP_ENV` (`development` | `production`)

## PHP quality
```bash
composer lint            # phpcs (won't fail loud — read output)
composer lint:fix        # phpcbf
vendor/bin/phpcs         # raw equivalent
```

## Markdown
```bash
composer lint:md         # markdownlint-cli2 over **/*.md (excl. node_modules, vendor)
composer lint:md:fix
```

## Playwright (E2E + screenshots)
```bash
npm run playwright:install     # one-time: chromium only
npm run test                   # all browsers
npm run test:ci:chromium       # CI mode, chromium only (recommended)
npm run test:chromium / test:firefox / test:webkit
npm run test:ui / test:headed
npm run test:report            # show HTML report
npm run typecheck              # tsc -p e2e/tsconfig.json --noEmit

# Screenshot helpers
npm run screenshot
npm run screenshot:mobile      # 375x667
npm run screenshot:tablet      # 768x1024
npm run screenshot:desktop     # 1920x1080
```

## Running the WebSocket server (from API repo, separately)
```bash
# In LiturgicalCalendarAPI repo:
composer ws:start
composer ws:stop
# Or VSCode task: litcal-tests-websockets
```

## Code review / push discipline
- CodeRabbit rate-limits PRs:
  1. Collect ALL CodeRabbit comments first
  2. Batch fixes into a series of local commits
  3. Push only after everything is addressed — avoid many small pushes

## System utilities (Linux/WSL2)
GNU coreutils. Prefer Serena's `find_file`, `search_for_pattern`, `find_symbol` over shell `find`/`grep` inside the repo.
