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

- Verify the `category` matches how the server resolves the schema — the two are NOT interchangeable:
  - `universalcalendar` when `sourceFile` is a real path or an API URL (the universal checks in
    `buildUniversalSourceDataChecks()`); the server reads the **path**
  - `sourceDataCheck` when the `validate` slug should choose the schema (the wider-region, national, missal and
    diocesan checks in `buildNonVASourceDataChecks()`); the server reads the **`validate` slug**, and reconstructs
    the data path from it only for `wider-region-…` / `national-calendar-…` / `diocesan-calendar-…` /
    `proprium-de-sanctis-…-i18n` — every other slug uses `sourceFile` / `sourceFolder` as supplied
  - `resourceDataCheck` when `sourceFile` is an absolute API URL (the endpoint checks in `resources.js`);
    the server reads the **URL**. Never substitute `sourceDataCheck` here
  - Getting this wrong yields a `null` schema and an "Unable to detect schema" card, not a loud failure
- Verify `sourceDataCheck` `validate` strings follow the `wider-region-…` / `national-calendar-…` /
  `diocesan-calendar-…` / `proprium-de-sanctis-…` patterns (`universalcalendar` labels are PascalCase and are
  display/CSS labels only, never schema keys)
- For missal IDs, exercise BOTH regional (`IT_1983`) and editio typica (`EDITIO_TYPICA_1970`) paths; build the slug
  from `missalDef.region` / `year_published`, not by splitting `missal_id`
- Always pass server-supplied `classes` through `slugifySelector()` before DOM queries

## When changing date/time display

- Confirm `Intl.DateTimeFormat` uses `timeZone: 'UTC'` (events come back as midnight UTC)
- Confirm `Europe/Vatican` is preserved in any liturgical calculations
