# Persist Test Run Results Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every completed test run (Calendars and Resources pages) as a server-side JSON file that any authenticated user can
browse and replay onto the dashboard without re-running tests.

**Architecture:** A new flat-file PHP endpoint `results.php` (auth-gated, matching the `admin.php` bootstrap) saves/lists/loads JSON
run files under a gitignored `results/` directory with per-run-type retention. A shared ES module `assets/js/testResults.js`
centralizes result collection, card painting, and the save/list/load fetch helpers. `index.js` (Calendars) and `resources.js`
(Resources) collect descriptors during a run, auto-save at completion, and gain a "Past runs" dropdown that replays a stored run
by reusing the existing card-scaffolding templates and applying stored statuses.

**Tech Stack:** PHP 8.1+ (procedural, Monolog, phpdotenv, firebase/php-jwt via `JwtAuth`), native ES6 modules, Bootstrap 5, Playwright e2e.

## Global Constraints

- PHP target: `>=8.1`. Short array syntax `[]`, 4-space indent, single quotes preferred (PSR-12, lines ≤ 200 chars — `phpcs.xml`).
- JS: native ES6 modules only (no jQuery, no build step). Page scripts loaded as `<script type="module">`; shared utilities live in
  `assets/js/*.js` and are imported. Reuse `common.js` exports (`slugify`, `slugifySelector`, `escapeHtmlAttr`, `updateText`, `safeToastShow`).
- Auth: all endpoint operations require `JwtAuth::isAuthenticated()` (JWT read from the `litcal_access_token` HttpOnly cookie). Browser fetches must send `credentials: 'include'`.
- WebSocket card identity: a server response's `classes` field (original casing) is the card selector; always pass it through `slugifySelector()` before DOM queries.
- Timezone: `Europe/Vatican` (`ini_set('date.timezone', 'Europe/Vatican')`).
- Two run types only: `calendars`, `resources`. Retention: keep newest **50** files per run type. Filenames are timestamp-based (`YYYY-MM-DDTHH-MM-SSZ.json`).
- Markdown: `.markdownlint.yml` (≤ 180 char lines outside code/tables).
- Never bypass git hooks (no `--no-verify`).

---

### Task 1: Storage scaffolding

**Files:**

- Modify: `.gitignore`
- Create: `results/.gitkeep`

**Interfaces:**

- Produces: a tracked, writable `results/` directory; `results/*.json` ignored by git.

- [ ] **Step 1: Ignore stored runs but keep the directory**

Add to `.gitignore` (after the `logs/` / `*.log` block):

```gitignore
# Persisted test run results (issue #30)
results/*.json
```

- [ ] **Step 2: Track the empty directory**

Create `results/.gitkeep` with empty content so the directory exists in fresh checkouts:

```bash
: > results/.gitkeep
```

- [ ] **Step 3: Verify gitignore behavior**

Run:

```bash
echo '{}' > results/probe.json
git status --porcelain results/
```

Expected: `results/.gitkeep` appears (untracked/added) but `results/probe.json` does NOT appear. Then remove the probe:

```bash
rm results/probe.json
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore results/.gitkeep
git commit -m "chore: add gitignored results/ directory for persisted runs (#30)"
```

---

### Task 2: `results.php` endpoint (save / list / load)

**Files:**

- Create: `results.php`
- Test: `e2e/results-endpoint.spec.ts`

**Interfaces:**

- Produces (HTTP):
  - `POST results.php` — body = run JSON envelope; returns `{ ok: true, file: "<name>.json" }`; validates + prunes.
  - `GET results.php` — returns `Array<{ file, timestamp, runType, calendar, responseType, counts, duration }>` (newest first).
  - `GET results.php?file=<name>` — returns the full stored run object.
  - All non-authenticated requests → `401`.
- Consumes: `LiturgicalCalendar\UnitTestInterface\JwtAuth` (`init()`, `isAuthenticated()`).

- [ ] **Step 1: Write the failing e2e test**

Create `e2e/results-endpoint.spec.ts`. It exercises the endpoint over HTTP using the stored auth state (Playwright projects already
inject `.auth/user.json`; see `e2e/auth.setup.ts`). `baseURL` comes from `playwright.config.ts`.

```typescript
import { test, expect } from '@playwright/test';

const sampleRun = {
    schemaVersion: 1,
    timestamp: '2026-07-03T14:30:00Z',
    runType: 'calendars',
    calendar: 'VA',
    calendarCategory: 'nationalcalendar',
    responseType: 'JSON',
    duration: 1234,
    counts: { successful: 2, failed: 0 },
    timings: { sourceData: 10, calendarData: 20, unitTests: 30 },
    scaffold: { sourceDataChecks: [], years: [], unitTests: [] },
    sourceDataResults: [],
    calendarDataResults: [],
    unitTestResults: [],
};

test('rejects path traversal on load', async ({ request }) => {
    const res = await request.get('results.php?file=..%2F..%2Fcomposer.json');
    expect(res.status()).toBe(400);
});

test('rejects malformed body on save', async ({ request }) => {
    const res = await request.post('results.php', {
        headers: { 'Content-Type': 'application/json' },
        data: 'not-json',
    });
    expect(res.status()).toBe(400);
});

test('saves, lists, and loads a run', async ({ request }) => {
    const save = await request.post('results.php', { data: sampleRun });
    expect(save.ok()).toBeTruthy();
    const { ok, file } = await save.json();
    expect(ok).toBe(true);
    expect(file).toMatch(/^[0-9T-]+Z\.json$/);

    const list = await request.get('results.php');
    expect(list.ok()).toBeTruthy();
    const summaries = await list.json();
    const found = summaries.find((r: { file: string }) => r.file === file);
    expect(found).toBeTruthy();
    expect(found.counts).toEqual({ successful: 2, failed: 0 });
    expect(found).not.toHaveProperty('sourceDataResults');

    const detail = await request.get(`results.php?file=${encodeURIComponent(file)}`);
    expect(detail.ok()).toBeTruthy();
    const full = await detail.json();
    expect(full.runType).toBe('calendars');
    expect(full).toHaveProperty('scaffold');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npx playwright test e2e/results-endpoint.spec.ts
```

Expected: FAIL (404 / no `results.php` yet).

- [ ] **Step 3: Implement `results.php`**

Create `results.php` (top-level named functions are hoisted, so helper order is fine):

```php
<?php

// phpcs:disable PSR1.Files.SideEffects
ini_set('date.timezone', 'Europe/Vatican');

require_once 'vendor/autoload.php';

use LiturgicalCalendar\UnitTestInterface\JwtAuth;
use Dotenv\Dotenv;
use Monolog\Logger;
use Monolog\Level;
use Monolog\Handler\StreamHandler;

const RESULTS_DIR = __DIR__ . '/results';
const MAX_BODY_BYTES = 5242880; // 5 MB
const RETENTION_PER_TYPE = 50;
const VALID_RUN_TYPES = ['calendars', 'resources'];

$dotenv = Dotenv::createImmutable(__DIR__, ['.env', '.env.local', '.env.development', '.env.test', '.env.staging', '.env.production'], false);
$dotenv->safeLoad();

JwtAuth::init();

$logger = new Logger('results');
$logger->pushHandler(new StreamHandler(__DIR__ . '/logs/results.log', Level::Warning));

header('Content-Type: application/json');

if (!JwtAuth::isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    $file = $_GET['file'] ?? null;
    if ($file === null) {
        echo json_encode(listRuns());
        exit;
    }
    $safe = safeResultPath((string) $file);
    if ($safe === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid file parameter']);
        exit;
    }
    if (!is_file($safe)) {
        http_response_code(404);
        echo json_encode(['error' => 'Run not found']);
        exit;
    }
    readfile($safe);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        http_response_code(400);
        echo json_encode(['error' => 'Body missing or too large']);
        exit;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Malformed JSON']);
        exit;
    }
    $error = validateRun($data);
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        exit;
    }
    if (!is_dir(RESULTS_DIR) && !mkdir(RESULTS_DIR, 0775, true) && !is_dir(RESULTS_DIR)) {
        $logger->error('Could not create results directory', ['dir' => RESULTS_DIR]);
        http_response_code(500);
        echo json_encode(['error' => 'Storage unavailable']);
        exit;
    }
    $name = str_replace(':', '-', $data['timestamp']) . '.json';
    $path = RESULTS_DIR . '/' . $name;
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false || file_put_contents($path, $json) === false) {
        $logger->error('Failed to write run file', ['path' => $path]);
        http_response_code(500);
        echo json_encode(['error' => 'Write failed']);
        exit;
    }
    pruneRuns($data['runType']);
    echo json_encode(['ok' => true, 'file' => $name]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

/**
 * Resolve a client-supplied file name to a safe absolute path inside RESULTS_DIR,
 * or null if it fails validation (defends against path traversal).
 */
function safeResultPath(string $file): ?string
{
    if (!preg_match('/^[0-9T\-Z]+\.json$/', $file)) {
        return null;
    }
    if (basename($file) !== $file) {
        return null;
    }
    return RESULTS_DIR . '/' . $file;
}

/**
 * Validate the run envelope. Returns an error string, or null when valid.
 *
 * @param array<string,mixed> $d
 */
function validateRun(array $d): ?string
{
    if (($d['schemaVersion'] ?? null) !== 1) {
        return 'Unsupported schemaVersion';
    }
    $ts = $d['timestamp'] ?? '';
    if (!is_string($ts) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $ts)) {
        return 'Invalid timestamp';
    }
    if (!in_array($d['runType'] ?? null, VALID_RUN_TYPES, true)) {
        return 'Invalid runType';
    }
    if (!is_int($d['duration'] ?? null) && !is_float($d['duration'] ?? null)) {
        return 'Invalid duration';
    }
    $counts = $d['counts'] ?? null;
    if (!is_array($counts) || !isset($counts['successful'], $counts['failed'])) {
        return 'Invalid counts';
    }
    return null;
}

/**
 * List metadata for every stored run, newest first.
 *
 * @return array<int,array<string,mixed>>
 */
function listRuns(): array
{
    $out = [];
    foreach (glob(RESULTS_DIR . '/*.json') ?: [] as $path) {
        $data = json_decode((string) file_get_contents($path), true);
        if (!is_array($data)) {
            continue;
        }
        $out[] = [
            'file'         => basename($path),
            'timestamp'    => $data['timestamp'] ?? null,
            'runType'      => $data['runType'] ?? null,
            'calendar'     => $data['calendar'] ?? null,
            'responseType' => $data['responseType'] ?? null,
            'counts'       => $data['counts'] ?? null,
            'duration'     => $data['duration'] ?? null,
        ];
    }
    usort($out, fn($a, $b) => strcmp((string) $b['file'], (string) $a['file']));
    return $out;
}

/**
 * Delete the oldest files of a given run type beyond the retention limit.
 */
function pruneRuns(string $runType): void
{
    $files = [];
    foreach (glob(RESULTS_DIR . '/*.json') ?: [] as $path) {
        $data = json_decode((string) file_get_contents($path), true);
        if (is_array($data) && ($data['runType'] ?? null) === $runType) {
            $files[] = $path;
        }
    }
    rsort($files); // newest first by name
    foreach (array_slice($files, RETENTION_PER_TYPE) as $old) {
        @unlink($old);
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npx playwright test e2e/results-endpoint.spec.ts
```

Expected: PASS (3 tests). If the local PHP server is not auto-started by `playwright.config.ts`, start it first with `php -S localhost:3003`.

- [ ] **Step 5: Lint**

Run:

```bash
vendor/bin/phpcs results.php
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add results.php e2e/results-endpoint.spec.ts
git commit -m "feat: add results.php endpoint to save/list/load test runs (#30)"
```

---

### Task 3: Shared `testResults.js` module

**Files:**

- Create: `assets/js/testResults.js`

**Interfaces:**

- Produces (ES module exports):
  - `applyResultToDom(responseData: { type: 'success'|'error', classes: string, text?: string }): void` — paints target cards
    (bg-info → bg-success/bg-danger, swaps question icon, appends one error tooltip). Used by both live handlers and replay.
  - `createResultCollector(): { record(phase: string, responseData): void, all(): Array<{phase,selector,status,message,test}>, reset(): void }`.
  - `nowIsoStamp(): string` — `YYYY-MM-DDTHH:MM:SSZ` (no milliseconds).
  - `postRunResults(payload: object): Promise<{ok: boolean, file: string}>`.
  - `fetchRunSummaries(runType: string): Promise<Array<object>>` — filtered to the given run type.
  - `fetchRunDetail(file: string): Promise<object>`.

- [ ] **Step 1: Implement the module**

Create `assets/js/testResults.js`:

```javascript
import { slugifySelector, escapeHtmlAttr } from './common.js';

/**
 * Paint a single server response (or stored descriptor) onto its target cards.
 * @param {{type: string, classes: string, text?: string}} responseData
 */
export const applyResultToDom = (responseData) => {
    const isSuccess = responseData.type === 'success';
    document.querySelectorAll(slugifySelector(responseData.classes)).forEach((el) => {
        el.classList.remove('bg-info');
        el.classList.add(isSuccess ? 'bg-success' : 'bg-danger');
        const questionIcon = el.querySelector('.fa-circle-question');
        if (questionIcon) {
            questionIcon.classList.remove('fa-circle-question');
            questionIcon.classList.add(isSuccess ? 'fa-circle-check' : 'fa-circle-xmark');
        }
        if (!isSuccess) {
            const cardText = el.querySelector('.card-text');
            if (cardText && !cardText.querySelector('.error-tooltip')) {
                cardText.insertAdjacentHTML(
                    'beforeend',
                    `<span role="button" class="float-end error-tooltip" data-bs-toggle="tooltip" data-bs-title="${escapeHtmlAttr(responseData.text ?? '')}"><i class="fas fa-bug fa-beat-fade" aria-hidden="true"></i></span>`
                );
            }
        }
    });
};

/**
 * Accumulates run results in memory so they can be persisted at run completion.
 */
export const createResultCollector = () => {
    const results = [];
    return {
        record(phase, responseData) {
            results.push({
                phase,
                selector: responseData.classes,
                status: responseData.type === 'success' ? 'success' : 'error',
                message: responseData.type === 'error' ? (responseData.text ?? null) : null,
                test: responseData.test ?? null,
            });
        },
        all: () => results.slice(),
        reset: () => { results.length = 0; },
    };
};

/** Current UTC time as `YYYY-MM-DDTHH:MM:SSZ` (no milliseconds). */
export const nowIsoStamp = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/** POST a completed run to the server. */
export const postRunResults = async (payload) => {
    const res = await fetch('results.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(`Save failed: ${res.status}`);
    }
    return res.json();
};

/** Fetch run summaries filtered to a single run type, newest first. */
export const fetchRunSummaries = async (runType) => {
    const res = await fetch('results.php', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`List failed: ${res.status}`);
    }
    const all = await res.json();
    return all.filter((r) => r.runType === runType);
};

/** Fetch a single stored run's full detail. */
export const fetchRunDetail = async (file) => {
    const res = await fetch(`results.php?file=${encodeURIComponent(file)}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
        throw new Error(`Load failed: ${res.status}`);
    }
    return res.json();
};
```

- [ ] **Step 2: Syntax-check the module**

Run:

```bash
node --check assets/js/testResults.js
```

Expected: no output (valid syntax).

- [ ] **Step 3: Commit**

```bash
git add assets/js/testResults.js
git commit -m "feat: add shared testResults.js module (collect/paint/save/load) (#30)"
```

---

### Task 4: Calendars page — collect results and auto-save

**Files:**

- Modify: `assets/js/index.js` (imports ~line 7; `conn.onmessage` success branch ~641-668 and error branch ~670-702; `JobsFinished` block ~563-574; run-start reset ~1336-1344)

**Interfaces:**

- Consumes: `applyResultToDom`, `createResultCollector`, `nowIsoStamp`, `postRunResults` from `./testResults.js`; existing module
  state `currentSelectedCalendar`, `currentCalendarCategory`, `currentResponseType`, `currentSourceDataChecks`, `Years`,
  `successfulTests`, `failedTests`, phase counters/timers.
- Produces: module state `renderedUnitTests` (Array of full unit-test objects rendered this run) and `resultCollector`; a `calendars`
  run POSTed at `JobsFinished`. `renderedUnitTests` is consumed by Task 5's replay scaffolding.

- [ ] **Step 1: Import shared helpers**

In `assets/js/index.js`, immediately after the existing `import { … } from './common.js';` block (the import starting at line 7), add:

```javascript
import {
    applyResultToDom,
    createResultCollector,
    nowIsoStamp,
    postRunResults,
} from './testResults.js';

const resultCollector = createResultCollector();
let renderedUnitTests = [];
```

- [ ] **Step 2: Capture rendered unit tests during scaffolding**

In `setupPage()` (the `UnitTests.forEach` at line 1222), reset `renderedUnitTests` before the loop and push each unit test that
is actually rendered (i.e. not filtered out). Change the block so that, right before `SpecificUnitTestCategories = [];` (line
1221), add:

```javascript
    renderedUnitTests = [];
```

and inside the `forEach`, immediately before the existing `SpecificUnitTestCategories.push( {` (line 1240), add:

```javascript
        renderedUnitTests.push( unitTest );
```

(Each `return` earlier in the loop skips filtered tests, so only rendered ones are captured.)

- [ ] **Step 3: Map run state to a phase name**

Add this helper near the top-level function definitions (e.g. just above `const runTests = () => {` at line 463):

```javascript
/**
 * Maps the current TestState to the persisted phase key for a Calendars run.
 * @returns {('sourceData'|'calendarData'|'unitTest'|null)}
 */
const phaseForState = () => {
    switch ( currentState ) {
        case TestState.ExecutingValidations: return 'sourceData';
        case TestState.ValidatingCalendarData: return 'calendarData';
        case TestState.SpecificUnitTests: return 'unitTest';
        default: return null;
    }
};
```

- [ ] **Step 4: Route painting through the shared helper and record results**

In `conn.onmessage`, replace the success-branch DOM painting (the
`document.querySelectorAll(slugifySelector(responseData.classes)).forEach((el) => { … });` at lines 642-650) with a single call,
and record the result. The success branch head becomes:

```javascript
        if ( responseData.type === "success" ) {
            applyResultToDom( responseData );
            resultCollector.record( phaseForState(), responseData );
            updateText('successfulCount', ++successfulTests);
```

Likewise replace the error-branch painting (the `forEach` at lines 671-683) so the error branch head becomes:

```javascript
        else if ( responseData.type === "error" ) {
            applyResultToDom( responseData );
            resultCollector.record( phaseForState(), responseData );
            updateText('failedCount', ++failedTests);
```

Leave the per-phase counter `switch` statements that follow each head unchanged.

- [ ] **Step 5: Reset the collector at run start**

In the run button handler (line 1329), directly after `failedTests = 0;` (line 1338), add:

```javascript
        resultCollector.reset();
```

- [ ] **Step 6: Build and POST the payload at completion**

Add a payload builder near the other top-level helpers (e.g. below `phaseForState`):

```javascript
/**
 * Reads a completed performance measure's duration by name, or 0 if absent.
 * @param {string} name
 * @returns {number}
 */
const measureDuration = ( name ) => {
    const entries = performance.getEntriesByName( name );
    return entries.length ? Math.round( entries[ entries.length - 1 ].duration ) : 0;
};

/**
 * Assembles the self-contained Calendars run payload from collected results.
 * @returns {object}
 */
const buildCalendarsPayload = () => {
    const all = resultCollector.all();
    const toDescriptor = ( r ) => ({
        id: r.selector,
        selector: r.selector,
        status: r.status,
        message: r.message,
        test: r.test,
    });
    const byPhase = ( phase ) => all.filter( ( r ) => r.phase === phase ).map( toDescriptor );
    return {
        schemaVersion: 1,
        timestamp: nowIsoStamp(),
        runType: 'calendars',
        calendar: currentSelectedCalendar,
        calendarCategory: currentCalendarCategory,
        responseType: currentResponseType,
        duration: measureDuration( 'litcalTestRunner' ),
        counts: { successful: successfulTests, failed: failedTests },
        timings: {
            sourceData: measureDuration( 'litcalSourceDataTestRunner' ),
            calendarData: measureDuration( 'litcalCalendarDataTestRunner' ),
            unitTests: measureDuration( 'litcalUnitTestRunner' ),
        },
        scaffold: {
            sourceDataChecks: currentSourceDataChecks,
            years: Years,
            unitTests: renderedUnitTests,
        },
        sourceDataResults: byPhase( 'sourceData' ),
        calendarDataResults: byPhase( 'calendarData' ),
        unitTestResults: byPhase( 'unitTest' ),
    };
};
```

Then, inside the `case TestState.JobsFinished:` block (after `setTestRunnerBtnLblTxt( 'Tests Complete' );` at line 572), add:

```javascript
            postRunResults( buildCalendarsPayload() )
                .then( () => safeToastShow('#results-saved') )
                .catch( ( err ) => {
                    console.error( 'Failed to persist run results', err );
                    safeToastShow('#results-save-failed');
                });
```

- [ ] **Step 7: Add the save toasts to `index.php`**

In `index.php`, inside the `.toast-container` (after the `#tests-complete` toast ending at line 44), add two toasts:

```php
            <div class="toast align-items-center text-white bg-success border-0 p-3 shadow" aria-live="assertive" role="alert" id="results-saved">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-floppy-disk fa-fw"></i> <?php echo _("Run results saved."); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
            <div class="toast align-items-center text-white bg-warning border-0 p-3 shadow" aria-live="assertive" role="alert" id="results-save-failed">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-triangle-exclamation fa-fw"></i> <?php echo _("Could not save run results."); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
```

- [ ] **Step 8: Syntax-check and lint**

Run:

```bash
node --check assets/js/index.js && vendor/bin/phpcs index.php
```

Expected: no output from `node --check`; no phpcs errors.

- [ ] **Step 9: Commit**

```bash
git add assets/js/index.js index.php
git commit -m "feat: collect and auto-save Calendars run results (#30)"
```

---

### Task 5: Calendars page — browse and replay past runs

**Files:**

- Modify: `index.php` (header controls row ~52-90), `assets/js/index.js` (`setupPage` scaffolding ~1197-1246; new replay code)

**Interfaces:**

- Consumes: `fetchRunSummaries`, `fetchRunDetail`, `applyResultToDom` from `./testResults.js`; the `buildScaffolding` extraction;
  module state setters (`currentSelectedCalendar`, `currentCalendarCategory`, `currentSourceDataChecks`, `renderedUnitTests`).
- Produces: a `#pastRunsSelect` dropdown and a `replayCalendarsRun(file)` flow that repaints cards, counters, and timers with no
  WebSocket/API traffic.

- [ ] **Step 1: Extract `buildScaffolding` from `setupPage`**

In `assets/js/index.js`, add a reusable builder that renders the three phases' empty cards from explicit inputs. Insert it above `setupPage` (before line 1160):

```javascript
/**
 * Renders the empty (bg-info) card scaffolding for all three Calendars phases.
 * Shared by live setup and stored-run replay so markup stays identical.
 * @param {{calendar: string, category: string, sourceDataChecks: Array<object>, years: Array<number>, unitTests: Array<object>}} cfg
 */
const buildScaffolding = ( cfg ) => {
    document.querySelectorAll('.sourcedata-tests').forEach(el => el.innerHTML = '');
    cfg.sourceDataChecks.forEach( ( item, idx ) => {
        document.querySelectorAll('.sourcedata-tests').forEach(el => el.insertAdjacentHTML('beforeend', sourceDataCheckTemplate( item, idx )));
    } );

    const calendarDataTests = document.querySelector('.calendardata-tests');
    if ( calendarDataTests ) {
        calendarDataTests.innerHTML = '';
        document.querySelectorAll('.yearMax').forEach(el => el.textContent = twentyFiveYearsFromNow);
        for ( let i = cfg.years.length; i > 0; i-- ) {
            const idx = cfg.years.length - i;
            calendarDataTests.insertAdjacentHTML('beforeend', calDataTestTemplate( i ));
            const yearEl = calendarDataTests.querySelector(`.year-${cfg.years[ idx ]}`);
            yearEl.insertAdjacentHTML('afterend', testTemplate(cfg.calendar, cfg.years[idx]));
        }
    }

    const specificUnitTestsAccordion = document.querySelector('#specificUnitTestsAccordion');
    if (specificUnitTestsAccordion) {
        specificUnitTestsAccordion.innerHTML = '';
    }
    cfg.unitTests.forEach( unitTest => appendAccordionItem( unitTest ) );

    document.querySelectorAll('.currentSelectedCalendar').forEach(el => {
        el.textContent = truncate( cfg.calendar, 20 );
        el.setAttribute('title', cfg.calendar);
    });
};
```

Then, in `setupPage`, replace the inline scaffolding (lines 1197-1246 — from
`document.querySelectorAll('.sourcedata-tests').forEach(el => el.innerHTML = '');` through the `UnitTests.forEach( … )` block
that ends at line 1246, including the `.currentSelectedCalendar` update at 1248-1251) with a single call plus the
`renderedUnitTests`/`SpecificUnitTestCategories` bookkeeping that must still run for live runs:

```javascript
    renderedUnitTests = [];
    SpecificUnitTestCategories = [];
    UnitTests.forEach( unitTest => {
        if ( unitTest.hasOwnProperty( 'appliesTo' ) && Object.keys( unitTest.appliesTo ).length === 1 ) {
            if ( true === handleAppliesToOrFilter( unitTest, 'appliesTo' ) ) {
                return;
            }
        }
        else if ( unitTest.hasOwnProperty( 'applies_to' ) && Object.keys( unitTest.applies_to ).length === 1 ) {
            if ( true === handleAppliesToOrFilter( unitTest, 'appliesTo' ) ) {
                return;
            }
        }
        if ( unitTest.hasOwnProperty( 'filter' ) && Object.keys( unitTest.filter ).length === 1 ) {
            if ( true === handleAppliesToOrFilter( unitTest, 'filter' ) ) {
                return;
            }
        }
        renderedUnitTests.push( unitTest );
        SpecificUnitTestCategories.push( { "action": "executeUnitTest", "test": unitTest.name } );
        SpecificUnitTestYears[ unitTest.name ] = unitTest.assertions.reduce( ( prev, cur ) => { prev.push( cur.year ); return prev; }, [] );
    } );

    buildScaffolding({
        calendar: currentSelectedCalendar,
        category: currentCalendarCategory,
        sourceDataChecks: currentSourceDataChecks,
        years: Years,
        unitTests: renderedUnitTests,
    });
```

(This supersedes the Task 4 Step 2 edits, which described the same `renderedUnitTests` capture in the pre-refactor loop;
applied together in this task, the loop above is the single source of truth.)

- [ ] **Step 2: Add the "Past runs" dropdown to `index.php`**

In `index.php`, inside the `litcaltests-header` row, add a new column before the Run button column (before line 68's `<div class="col-12 col-md-4 col-lg-2">`):

```php
                <div class="col-12 col-md-4 col-lg-2" data-requires-auth>
                    <label for="pastRunsSelect"><?php echo _("Past Runs"); ?></label>
                    <select id="pastRunsSelect" class="form-select form-select-sm">
                        <option value=""><?php echo _("— Live —"); ?></option>
                    </select>
                </div>
```

- [ ] **Step 3: Populate the dropdown and wire replay**

Add to `assets/js/index.js` (near the other DOM wiring, after the run button handler at line ~1383):

```javascript
const pastRunsSelect = document.querySelector('#pastRunsSelect');

/** Populate the past-runs dropdown from the server (calendars runs only). */
const loadPastRuns = async () => {
    if ( !pastRunsSelect ) {
        return;
    }
    try {
        const summaries = await fetchRunSummaries( 'calendars' );
        for ( const r of summaries ) {
            const opt = document.createElement('option');
            opt.value = r.file;
            const dt = new Intl.DateTimeFormat(locale, IntlDTOptions).format(new Date(r.timestamp));
            opt.textContent = `${dt} · ${r.calendar} · ✓${r.counts?.successful ?? 0} ✗${r.counts?.failed ?? 0}`;
            pastRunsSelect.appendChild(opt);
        }
    } catch ( err ) {
        console.error( 'Could not load past runs', err );
    }
};

/**
 * Replay a stored Calendars run onto the dashboard (no WebSocket/API traffic).
 * @param {string} file
 */
const replayCalendarsRun = async ( file ) => {
    const run = await fetchRunDetail( file );
    currentSelectedCalendar = run.calendar;
    currentCalendarCategory = run.calendarCategory;
    currentResponseType = run.responseType;
    currentSourceDataChecks = run.scaffold.sourceDataChecks;
    buildScaffolding({
        calendar: run.calendar,
        category: run.calendarCategory,
        sourceDataChecks: run.scaffold.sourceDataChecks,
        years: run.scaffold.years,
        unitTests: run.scaffold.unitTests,
    });
    [ ...run.sourceDataResults, ...run.calendarDataResults, ...run.unitTestResults ].forEach( ( d ) => {
        applyResultToDom({ type: d.status, classes: d.selector, text: d.message });
    } );
    updateText('successfulCount', run.counts.successful);
    updateText('failedCount', run.counts.failed);
    updateText('total-time', MsToTimeString( run.duration ));
    updateText('totalSourceDataTestsTime', MsToTimeString( run.timings.sourceData ));
    updateText('totalCalendarDataTestsTime', MsToTimeString( run.timings.calendarData ));
    updateText('totalUnitTestsTime', MsToTimeString( run.timings.unitTests ));
    initInfoTooltips();
};

if ( pastRunsSelect ) {
    pastRunsSelect.addEventListener('change', ( e ) => {
        const startBtn = document.querySelector('#startTestRunnerBtn');
        if ( e.target.value === '' ) {
            if ( startBtn ) {
                startBtn.disabled = false;
            }
            resetTestUI();
            return;
        }
        if ( startBtn ) {
            startBtn.disabled = true;
        }
        replayCalendarsRun( e.target.value ).catch( ( err ) => {
            console.error( 'Replay failed', err );
            safeToastShow('#results-save-failed');
        });
    });
    loadPastRuns();
}
```

- [ ] **Step 4: Write the replay e2e test**

Create `e2e/results-replay.spec.ts` (Calendars replay from a seeded run — POST a run, reload, select it, assert cards/counters repaint):

```typescript
import { test, expect } from '@playwright/test';

test('replays a stored calendars run onto the dashboard', async ({ page, request }) => {
    // Seed a minimal run whose one source-data card will paint green.
    const run = {
        schemaVersion: 1,
        timestamp: '2026-07-03T09-00-00Z'.replace(/-/g, (m, i) => (i > 9 ? ':' : '-')),
        runType: 'calendars',
        calendar: 'VA',
        calendarCategory: 'nationalcalendar',
        responseType: 'JSON',
        duration: 1000,
        counts: { successful: 1, failed: 0 },
        timings: { sourceData: 1000, calendarData: 0, unitTests: 0 },
        scaffold: {
            sourceDataChecks: [{ validate: 'proprium-de-sanctis-1970', sourceFile: 'EDITIO_TYPICA_1970', category: 'sourceDataCheck' }],
            years: [],
            unitTests: [],
        },
        sourceDataResults: [{ id: '.EditioTypica1970', selector: '.EditioTypica1970', status: 'success', message: null, test: null }],
        calendarDataResults: [],
        unitTestResults: [],
    };
    const save = await request.post('results.php', { data: run });
    const { file } = await save.json();

    await page.goto('/');
    await page.waitForSelector('#pastRunsSelect');
    await page.selectOption('#pastRunsSelect', file);

    await expect(page.locator('#successfulCount')).toHaveText('1');
    await expect(page.locator('#startTestRunnerBtn')).toBeDisabled();
});
```

Note: the `.EditioTypica1970` selector must match the class emitted by `sourceDataCheckTemplate` for the seeded check; adjust
the seeded `selector`/`validate` to a card class that `sourceDataCheckTemplate` actually renders (confirm by inspecting the
rendered scaffolding for a VA source check). Keep the assertion on `#successfulCount` and the disabled button, which do not
depend on the exact class.

- [ ] **Step 5: Run the replay test**

Run:

```bash
npx playwright test e2e/results-replay.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Syntax-check, lint, commit**

```bash
node --check assets/js/index.js && vendor/bin/phpcs index.php
git add assets/js/index.js index.php e2e/results-replay.spec.ts
git commit -m "feat: browse and replay past Calendars runs (#30)"
```

---

### Task 6: Resources page — collect results and auto-save

**Files:**

- Modify: `assets/js/resources.js` (imports ~line 7; `conn.onmessage` success branch ~464-483 and error branch ~484-505;
  `JobsFinished` handling; run-start reset), `resources.php` (toast container)

**Interfaces:**

- Consumes: `applyResultToDom`, `createResultCollector`, `nowIsoStamp`, `postRunResults` from `./testResults.js`; module state
  `resourceDataChecks`, `sourceDataChecks`, `successfulTests`, `failedTests`, phase counters, performance measures
  `litcalResourceDataTestRunner` / `litcalSourceDataTestRunner` / `litcalTestRunner`.
- Produces: `resources` run POSTed at completion; `resourceDataChecks`/`sourceDataChecks` (already resolved with `.sourceFile`)
  stored for replay scaffolding in Task 7.

- [ ] **Step 1: Import shared helpers**

After the `import { … } from './common.js';` block in `assets/js/resources.js` (line 7), add:

```javascript
import {
    applyResultToDom,
    createResultCollector,
    nowIsoStamp,
    postRunResults,
} from './testResults.js';

const resultCollector = createResultCollector();
```

- [ ] **Step 2: Add the phase mapper**

Confirm the Resources `TestState` phase names by inspecting `resources.js` lines 116-131 (states include an API-paths phase and a source-data phase). Add near the top-level helpers:

```javascript
/**
 * Maps the current Resources TestState to the persisted phase key.
 * @returns {('apiPath'|'sourceData'|null)}
 */
const phaseForState = () => {
    switch ( currentState ) {
        case TestState.ExecutingResourceValidations: return 'apiPath';
        case TestState.ExecutingSourceValidations: return 'sourceData';
        default: return null;
    }
};
```

Note: use the exact state identifiers present in `resources.js` (the two non-terminal validation states). If they differ from the names above, substitute the actual identifiers.

- [ ] **Step 3: Route painting through the shared helper and record**

In `conn.onmessage`, replace the success-branch `document.querySelectorAll(slugifySelector(responseData.classes)).forEach(...)` (lines 465-473) with:

```javascript
        if ( responseData.type === "success" ) {
            applyResultToDom( responseData );
            resultCollector.record( phaseForState(), responseData );
            updateText('successfulCount', ++successfulTests);
```

and the error-branch painting (lines 485-497) with:

```javascript
        else if ( responseData.type === "error" ) {
            applyResultToDom( responseData );
            resultCollector.record( phaseForState(), responseData );
            updateText('failedCount', ++failedTests);
```

Leave the phase-counter `switch` blocks that follow unchanged.

- [ ] **Step 4: Reset the collector at run start**

Find the Resources run-start reset (where `successfulTests`/`failedTests` are zeroed in the `#startTestRunnerBtn` click handler) and add directly after `failedTests = 0;`:

```javascript
        resultCollector.reset();
```

- [ ] **Step 5: Build and POST the payload at completion**

Add the payload builder near the top-level helpers:

```javascript
/**
 * Reads a completed performance measure's duration by name, or 0 if absent.
 * @param {string} name
 * @returns {number}
 */
const measureDuration = ( name ) => {
    const entries = performance.getEntriesByName( name );
    return entries.length ? Math.round( entries[ entries.length - 1 ].duration ) : 0;
};

/**
 * Assembles the self-contained Resources run payload from collected results.
 * @returns {object}
 */
const buildResourcesPayload = () => {
    const all = resultCollector.all();
    const toDescriptor = ( r ) => ({
        id: r.selector,
        selector: r.selector,
        status: r.status,
        message: r.message,
        test: r.test,
    });
    const byPhase = ( phase ) => all.filter( ( r ) => r.phase === phase ).map( toDescriptor );
    return {
        schemaVersion: 1,
        timestamp: nowIsoStamp(),
        runType: 'resources',
        calendar: null,
        responseType: null,
        duration: measureDuration( 'litcalTestRunner' ),
        counts: { successful: successfulTests, failed: failedTests },
        timings: {
            apiPath: measureDuration( 'litcalResourceDataTestRunner' ),
            sourceData: measureDuration( 'litcalSourceDataTestRunner' ),
        },
        scaffold: {
            resourceDataChecks: resourceDataChecks,
            sourceDataChecks: sourceDataChecks,
        },
        apiPathResults: byPhase( 'apiPath' ),
        sourceDataResults: byPhase( 'sourceData' ),
    };
};
```

In the `case TestState.JobsFinished:` handling for Resources (mirror of `index.js` line 563 block — locate the equivalent
completion point in `resources.js`), after the completion UI update, add:

```javascript
            postRunResults( buildResourcesPayload() )
                .then( () => safeToastShow('#results-saved') )
                .catch( ( err ) => {
                    console.error( 'Failed to persist run results', err );
                    safeToastShow('#results-save-failed');
                });
```

- [ ] **Step 6: Add the save toasts to `resources.php`**

Add the same two toasts (`#results-saved`, `#results-save-failed`) from Task 4 Step 7 into the `resources.php` toast container.

- [ ] **Step 7: Syntax-check, lint, commit**

```bash
node --check assets/js/resources.js && vendor/bin/phpcs resources.php
git add assets/js/resources.js resources.php
git commit -m "feat: collect and auto-save Resources run results (#30)"
```

---

### Task 7: Resources page — browse and replay past runs

**Files:**

- Modify: `resources.php` (header controls), `assets/js/resources.js` (extract `buildScaffolding`, add replay)

**Interfaces:**

- Consumes: `fetchRunSummaries`, `fetchRunDetail`, `applyResultToDom`; the Resources templates `resourceTemplate` (line 322) and `sourceTemplate` (line 351); the scaffolding container(s).
- Produces: `#pastRunsSelect` on the Resources page and `replayResourcesRun(file)`.

- [ ] **Step 1: Extract `buildScaffolding` for Resources**

Locate the existing Resources scaffolding code (the loops that render `resourceTemplate(...)` and `sourceTemplate(...)` into their containers, invoked during setup). Extract it into:

```javascript
/**
 * Renders the empty (bg-info) card scaffolding for both Resources phases.
 * @param {{resourceDataChecks: Array<object>, sourceDataChecks: Array<object>}} cfg
 */
const buildScaffolding = ( cfg ) => {
    const resourceContainer = document.querySelector('.resourcepaths-tests');
    if ( resourceContainer ) {
        resourceContainer.innerHTML = '';
        cfg.resourceDataChecks.forEach( ( item, idx ) => {
            resourceContainer.insertAdjacentHTML('beforeend', resourceTemplate( item, idx ));
        } );
    }
    const sourceContainer = document.querySelector('.sourcedata-tests');
    if ( sourceContainer ) {
        sourceContainer.innerHTML = '';
        cfg.sourceDataChecks.forEach( ( item, idx ) => {
            sourceContainer.insertAdjacentHTML('beforeend', sourceTemplate( item, idx ));
        } );
    }
};
```

Confirm the container selectors (`.resourcepaths-tests`, `.sourcedata-tests`) against `resources.php`/`resources.js`; substitute
the actual class names the setup code targets. Have the live setup call `buildScaffolding({ resourceDataChecks, sourceDataChecks })`.

- [ ] **Step 2: Add the "Past Runs" dropdown to `resources.php`**

Add the same `data-requires-auth` `#pastRunsSelect` column (from Task 5 Step 2) into the `resources.php` header controls row.

- [ ] **Step 3: Populate and wire replay**

Add to `assets/js/resources.js` (near the run-button wiring):

```javascript
const pastRunsSelect = document.querySelector('#pastRunsSelect');

const loadPastRuns = async () => {
    if ( !pastRunsSelect ) {
        return;
    }
    try {
        const summaries = await fetchRunSummaries( 'resources' );
        for ( const r of summaries ) {
            const opt = document.createElement('option');
            opt.value = r.file;
            const dt = new Intl.DateTimeFormat(locale, IntlDTOptions).format(new Date(r.timestamp));
            opt.textContent = `${dt} · ✓${r.counts?.successful ?? 0} ✗${r.counts?.failed ?? 0}`;
            pastRunsSelect.appendChild(opt);
        }
    } catch ( err ) {
        console.error( 'Could not load past runs', err );
    }
};

/**
 * Replay a stored Resources run onto the dashboard (no WebSocket/API traffic).
 * @param {string} file
 */
const replayResourcesRun = async ( file ) => {
    const run = await fetchRunDetail( file );
    buildScaffolding({
        resourceDataChecks: run.scaffold.resourceDataChecks,
        sourceDataChecks: run.scaffold.sourceDataChecks,
    });
    [ ...run.apiPathResults, ...run.sourceDataResults ].forEach( ( d ) => {
        applyResultToDom({ type: d.status, classes: d.selector, text: d.message });
    } );
    updateText('successfulCount', run.counts.successful);
    updateText('failedCount', run.counts.failed);
    updateText('total-time', MsToTimeString( run.duration ));
    updateText('totalResourceDataTestsTime', MsToTimeString( run.timings.apiPath ));
    updateText('totalSourceDataTestsTime', MsToTimeString( run.timings.sourceData ));
    initInfoTooltips();
};

if ( pastRunsSelect ) {
    pastRunsSelect.addEventListener('change', ( e ) => {
        const startBtn = document.querySelector('#startTestRunnerBtn');
        if ( e.target.value === '' ) {
            if ( startBtn ) {
                startBtn.disabled = false;
            }
            resetTestUI();
            return;
        }
        if ( startBtn ) {
            startBtn.disabled = true;
        }
        replayResourcesRun( e.target.value ).catch( ( err ) => {
            console.error( 'Replay failed', err );
            safeToastShow('#results-save-failed');
        });
    });
    loadPastRuns();
}
```

Confirm `initInfoTooltips`, `MsToTimeString`, `IntlDTOptions`, `resetTestUI`, and the timer element ids
(`totalResourceDataTestsTime`, `totalSourceDataTestsTime`, `total-time`) exist in `resources.js`/`resources.php`;
substitute actual names where they differ.

- [ ] **Step 4: Syntax-check, lint, commit**

```bash
node --check assets/js/resources.js && vendor/bin/phpcs resources.php
git add assets/js/resources.js resources.php
git commit -m "feat: browse and replay past Resources runs (#30)"
```

---

### Task 8: i18n strings and full regression

**Files:**

- Modify: `i18n/en/LC_MESSAGES/*.po` (and template `.pot` if present); run existing extraction if the project has one.
- Test: full Playwright suite.

**Interfaces:**

- Consumes: the new `_()` strings added in Tasks 4-7 (`"Run results saved."`, `"Could not save run results."`, `"Past Runs"`, `"Past Run"`, `"— Live —"`).
- Produces: translatable catalog entries so no string renders as a raw msgid.

- [ ] **Step 1: Locate the i18n workflow**

Inspect how translations are managed:

```bash
ls i18n && ls i18n/en/LC_MESSAGES && grep -rn "msgid" i18n/en/LC_MESSAGES/*.po | head
```

- [ ] **Step 2: Add the new msgids to the English catalog**

Append entries for each new string to `i18n/en/LC_MESSAGES/messages.po` (use the actual domain filename found in Step 1), then compile if the project compiles `.po` → `.mo`:

```po
msgid "Run results saved."
msgstr "Run results saved."

msgid "Could not save run results."
msgstr "Could not save run results."

msgid "Past Runs"
msgstr "Past Runs"

msgid "— Live —"
msgstr "— Live —"
```

If a `.pot` template and `msgfmt`/extraction script exist (check `composer.json`/`package.json` scripts), regenerate instead of hand-editing.

- [ ] **Step 3: Run the full e2e suite**

Run:

```bash
npx playwright test
```

Expected: existing `admin.spec.ts` plus the new `results-endpoint.spec.ts` and `results-replay.spec.ts` all PASS.

- [ ] **Step 4: Lint everything**

Run:

```bash
vendor/bin/phpcs && composer lint:md
```

Expected: no PHP or markdown lint errors.

- [ ] **Step 5: Commit**

```bash
git add i18n
git commit -m "chore: add i18n strings for persisted run results UI (#30)"
```

---

## Self-Review

**Spec coverage:**

- Endpoint save/list/load + auth → Task 2. ✓
- `results/` gitignored + directory → Task 1. ✓
- Auto-save on completion (both pages) → Tasks 4, 6. ✓
- Retention cap (50/type) → Task 2 `pruneRuns`. ✓
- Self-contained descriptor data model → payloads in Tasks 4/6 store `scaffold` + per-phase descriptor arrays. ✓
- Semantic replay reusing card templates → `buildScaffolding` extraction (Tasks 5, 7) + `applyResultToDom` (Task 3). ✓
- Per-page browse dropdown, own run type only → Tasks 5, 7 (`fetchRunSummaries(runType)`). ✓
- Authenticated-only (POST/GET) → Task 2 gate + `data-requires-auth` on the dropdown. ✓
- Path-traversal safety, body limits, validation → Task 2. ✓
- Testing (endpoint input checks + replay e2e) → Tasks 2, 5, plus full suite in Task 8. ✓
- i18n for new strings → Task 8. ✓

**Type consistency:** `applyResultToDom` consumes `{type, classes, text}`; live handlers pass the raw `responseData` (has those
fields), replay maps descriptors `{status, selector, message}` → `{type, classes, text}` at both call sites (Tasks 5, 7).
Collector emits `{phase, selector, status, message, test}`; payload builders map to descriptors `{id, selector, status, message, test}`
and split by `phase`. `buildScaffolding` signature differs intentionally per page (Calendars: `{calendar, category, sourceDataChecks,
years, unitTests}`; Resources: `{resourceDataChecks, sourceDataChecks}`) and each is only called within its own file.
`nowIsoStamp()` produces `HH:MM:SSZ`; the endpoint converts `:`→`-` for the filename and validates the colon form — consistent.

**Placeholder scan:** No TBD/TODO. The two "confirm the actual identifier" notes (Resources `TestState` names in Task 6 Step 2;
Resources container/timer names in Task 7) are explicit verification steps against real files, not deferred work — they exist
because `resources.js` internals were not fully read during planning and must be confirmed at implementation time. Every code
step ships complete code.

**Known verification points for the implementer (Resources page):** exact `TestState` phase identifiers, scaffolding container class
names, and timer element ids in `resources.js`/`resources.php`. These are called out inline in Tasks 6-7; confirm before editing.
