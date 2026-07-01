# When a Coding Task Is Complete — UnitTestInterface

Run before declaring done / committing:

1. **PHP lint**
   ```bash
   composer lint:fix      # phpcbf (auto-fix)
   composer lint          # phpcs verification (echoes hint, doesn't fail loud)
   # or raw:
   vendor/bin/phpcs
   ```

2. **Markdown**
   ```bash
   composer lint:md
   composer lint:md:fix
   ```

3. **Type check (Playwright/e2e)**
   ```bash
   npm run typecheck      # tsc -p e2e/tsconfig.json --noEmit
   ```

4. **Playwright tests**
   ```bash
   npm run test:ci:chromium
   ```

5. **Manual UI smoke test (rule from system prompt)** — actually exercise the UI end-to-end:
   ```bash
   # In API repo: composer start  AND  composer ws:start
   # In this repo:
   php -S localhost:3003
   # browse to http://localhost:3003 — verify WebSocket connects + tests stream
   ```
   For UI changes, capture a quick screenshot to confirm layout:
   ```bash
   npm run screenshot:desktop
   ```

## CI
GitHub Actions workflow `.github/workflows/main.yml` runs quality checks on push.

## Push discipline (CodeRabbit rate-limit aware)
- Batch fixes locally; **don't push after every commit**.
- Workflow:
  1. Collect ALL CodeRabbit comments
  2. Address in a series of local commits
  3. Push the batch once everything is resolved

## When changing WebSocket message handling
- Verify `category: "sourceDataCheck"` is used for all source data validations
- Verify `validate` strings follow the `wider-region-…` / `national-calendar-…` / `diocesan-calendar-…` / `proprium-de-sanctis-…` patterns
- For missal IDs, exercise BOTH regional (`IT_1983`) and editio typica (`EDITIO_TYPICA_1970`) conversion paths
- Always pass server-supplied `classes` through `slugifySelector()` before DOM queries

## When changing date/time display
- Confirm `Intl.DateTimeFormat` uses `timeZone: 'UTC'` (events come back as midnight UTC)
- Confirm `Europe/Vatican` is preserved in any liturgical calculations
