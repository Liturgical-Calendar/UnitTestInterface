# index.js v2 WebSocket Contract Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Calendars runner (`assets/js/index.js`) off the v1 WebSocket contract so it stops hardcoding the API's on-disk layout,
stops executing CSS selectors the server builds for it, and stops hardcoding "3 responses per check".

**Architecture:** Extract the reusable phase-running machinery out of `resources.js` (already migrated, PR #55) into a shared
`assets/js/wsRunner.js` and prove that move inert against the existing Playwright suite. Then migrate `index.js`'s three phases onto it: source
data first, then the two calendar-shaped phases. Frames are attributed by `requestId`, phases end on the server's terminal `complete` frame, and
the source-data corpus comes from `GET /validations` rather than from paths compiled into this repository.

**Tech Stack:** Native ES6 modules (no bundler, no build step), Playwright for e2e, ESLint, PHP 8.1+ for the page shells, markdownlint.

**Spec:** `docs/superpowers/specs/2026-08-23-index-js-v2-protocol-migration-design.md`

## Global Constraints

- **No build step.** `assets/js/*.js` are served as-is and loaded as native ES modules. Never add a bundler, a transpile step or an
  `npm install` for browser code.
- **Never bypass git hooks.** Do not use `--no-verify`. If a hook fails, fix the cause and commit again.
- **Line-length limits:** Markdown 180 characters (code blocks and tables excluded). PHP 200. Aligned table columns are enforced (MD060).
- **Commit message trailer:** every commit ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **The Playwright suite needs the API on `localhost:8000`** — its responses gate the start button on both runner pages. It does **not** need the
  WebSocket server when a spec installs a stub. PostgreSQL must be reachable by the API or it returns empty HTTP 200s.
- **Branch per PR.** Never commit to `main`. Branch names are given per task.
- **`slugify()` vs `idToCardClass()`** are two different vocabularies and are not interchangeable. Resource checks are keyed by `validate` and
  slugified; inventory items are keyed by the opaque `id` and go through `idToCardClass()`.
- **Do not resolve the Ambrosian diocese corpus question.** `buildNonVASourceDataChecks()` starts every calendar from the *Roman* corpus and
  says so in a comment. Preserve that exactly.

---

## File Structure

| File                                      | Responsibility                                                                               |
|-------------------------------------------|----------------------------------------------------------------------------------------------|
| `assets/js/wsRunner.js` (new)             | Phase lifecycle: request-id minting, card registration, painting, watchdog, phase completion |
| `assets/js/wsProtocol.js`                 | Wire vocabulary: message shapes, inventory fetch, rite rules, step-to-card-class maps        |
| `assets/js/testResults.js`                | Card painting primitives, result collection, stored-run persistence                          |
| `assets/js/resources.js`                  | Resources page: state machine, scaffolding, counters, payload                                |
| `assets/js/index.js`                      | Calendars page: state machine, scaffolding, counters, payload                                |
| `e2e/websocket-stub.ts`                   | The server's side of the contract, for specs that drive a whole run                          |
| `e2e/calendars-correlation.spec.ts` (new) | Proves the Calendars runner attributes by `requestId`, not by selector                       |

The split between `wsProtocol.js` and `wsRunner.js` is deliberate: `wsProtocol.js` knows what the *wire* says and holds no mutable run state;
`wsRunner.js` owns the mutable state of a run in progress. A pure function about message shape belongs in the first; anything that remembers
something between frames belongs in the second.

---

## Task 1: Extract the phase runner into `wsRunner.js`

**Branch:** `refactor/42-extract-ws-runner`

**Files:**

- Create: `assets/js/wsRunner.js`
- Modify: `assets/js/resources.js` (remove the moved definitions; construct a runner instead)
- Test: no new spec — the existing suite is the safety net

**Interfaces:**

- Consumes: `createRequestRegistry`, `createSilenceWatchdog`, `summariseAbandoned`, `newRequestId`, `STEP_CARD_CLASS`, `negotiatedProtocol`
  from `wsProtocol.js`; `paintCard`, `applyResultToDom` from `testResults.js`.
- Produces: `createPhaseRunner(options) -> runner`, whose exact shape Task 2 and Tasks 5-9 depend on:

```javascript
/**
 * @param {object}   options
 * @param {function(object): string}   options.cardSlugFor      - check -> the card class fragment it was rendered with
 * @param {function(): void}           options.onAdvance        - the page's runTests(), called when the phase may move on
 * @param {function(): void}           options.onUnattributableFailure - count one failure that has no card
 * @param {function(): boolean}        options.canAdvance       - false once the run is finished or stopped
 * @param {function(): ?WebSocket}     options.socket           - the live connection, read at send time
 * @param {function(): ?string}        options.runToken         - the current run token, or null outside a run
 * @param {number}  [options.silenceTimeoutMs=60000]
 * @returns {{
 *   beginPhase: function(Array<object>, object): void,
 *   outstandingCount: function(): number,
 *   advanceIfPhaseIsEmpty: function(): void,
 *   armWatchdog: function(): void,
 *   restartWatchdog: function(): void,
 *   clearWatchdog: function(): void,
 *   noteTerminalFrame: function(object): boolean,
 *   paintResult: function(object): void,
 *   selectorFor: function(string, string): ?string,
 *   giveUpOnOutstandingRequests: function(): void,
 *   sendMessage: function(object): void,
 *   endRun: function(): void
 * }}
 */
```

`beginPhase(checks, { containerSelector, cardSelectorFor })` — `cardSelectorFor(check, step)` returns the selector **relative to the
container**, defaulting to `` `.${cardSlugFor(check)}.${STEP_CARD_CLASS[step]}` ``. Tasks 8 and 9 pass their own, because the Calendars page
addresses cards by year and by test name rather than by check slug.

- [ ] **Step 1: Record the green baseline**

Run: `npx playwright test e2e/resources-correlation.spec.ts e2e/resources-fresh-page.spec.ts e2e/resources-rite.spec.ts e2e/results-replay-resources.spec.ts --project=chromium`

Expected: all pass. Save the pass count — Step 5 must match it exactly. If any fail before you have changed anything, stop: the baseline is
broken and this refactor cannot be shown to be inert.

- [ ] **Step 2: Create `assets/js/wsRunner.js`**

Move these definitions out of `resources.js` verbatim, changing only what the seams require. Anchors are function names, not line numbers,
because the numbers shift as you delete:

| Moving from `resources.js`                                                         | Change on the way                                                                                                                                        |
|------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| `sendMessage`                                                                      | `currentRunToken` becomes `options.runToken()`; `conn` becomes `options.socket()`                                                                        |
| `restartPhaseWatchdog`                                                             | `phaseOutstanding` becomes runner-local state                                                                                                            |
| `clearPhaseWatchdog`                                                               | none                                                                                                                                                     |
| `armPhaseWatchdog`                                                                 | rename to `armWatchdog`                                                                                                                                  |
| `beginPhase`                                                                       | `cardSlugFor` becomes `options.cardSlugFor`; card lookup goes through `cardSelectorFor`; assigns runner-local `phaseOutstanding` instead of returning it |
| `advanceIfPhaseIsEmpty`                                                            | `runTests()` becomes `options.onAdvance()`                                                                                                               |
| `paintResult`                                                                      | `paintCard` imported here; unchanged otherwise                                                                                                           |
| `giveUpOnOutstandingRequests`                                                      | `countUnattributableFailure()` becomes `options.onUnattributableFailure()`; the state guard becomes `options.canAdvance()`                               |
| `requestRegistry`, `phaseOutstanding`, `PHASE_SILENCE_TIMEOUT_MS`, `phaseWatchdog` | become closure state inside the factory                                                                                                                  |

Three behaviours to preserve deliberately, and to say so in comments:

1. **The two advance guards collapse into one.** `resources.js` guards the terminal-frame advance with `currentState !== JobsFinished` and the
   give-up advance with `currentState !== JobsFinished && currentState !== Stopped`. These are equivalent in practice: `conn.onmessage` returns
   early when `currentState === TestState.Stopped`, so the terminal-frame path is unreachable in the `Stopped` state. A single `canAdvance()`
   implementing the stricter guard is therefore behaviour-preserving, not a widening.
2. **`beginPhase` records the selector as well as the element**, so Task 2 can persist a client-owned selector. Build it once, here, next to
   the `querySelector` that uses it.
3. **`endRun()` releases what a run leaves behind.** `resources.js` cleared `requestRegistry` and `phaseOutstanding` directly in its
   start-run and stop-run handlers. Those call sites are not in the move table because the state moved inside the runner, but the *releasing*
   still has to happen: `buildScaffolding()` wipes both card containers with `innerHTML = ''` on every run and every rite change, so a registry
   that is never cleared retains detached card Elements for the life of the page. `endRun()` clears `registry`, `selectors` and
   `phaseOutstanding`, and is called where those two lines were.

New code — the factory skeleton and the three members that are genuinely new rather than moved:

```javascript
export const createPhaseRunner = ( options ) => {
    const {
        cardSlugFor,
        onAdvance,
        onUnattributableFailure,
        canAdvance,
        socket,
        runToken,
        silenceTimeoutMs = 60000
    } = options;

    const registry = createRequestRegistry();
    /** requestId -> { [step]: selector }, so a stored run can record our own address, not the server's. */
    const selectors = new Map();
    let phaseOutstanding = new Set();

    const watchdog = createSilenceWatchdog( silenceTimeoutMs, () => giveUpOnOutstandingRequests() );

    const defaultCardSelectorFor = ( check, step ) => `.${cardSlugFor( check )}.${STEP_CARD_CLASS[ step ]}`;

    /**
     * The selector the card for this (request, step) was found by.
     *
     * Ours, not the server's. A stored run records this so that replay keeps working after the API
     * retires `classes` — the coupling #42 removes.
     */
    const selectorFor = ( requestId, step ) => selectors.get( requestId )?.[ step ] ?? null;

    /**
     * Handle a terminal `complete` frame. Returns true when the frame was terminal and the caller
     * should stop processing it: it reports no step outcome, so painting, recording or counting it
     * would inflate the totals past the number of rendered cards.
     */
    const noteTerminalFrame = ( responseData ) => {
        if ( responseData.step !== 'complete' ) {
            return false;
        }
        if ( registry.complete( responseData.requestId ) ) {
            phaseOutstanding.delete( responseData.requestId );
        }
        if ( canAdvance() ) {
            onAdvance();
        }
        return true;
    };

    // The members from the move table above go here, verbatim apart from the seam changes it lists.

    return {
        beginPhase, outstandingCount: () => phaseOutstanding.size, advanceIfPhaseIsEmpty,
        armWatchdog, restartWatchdog, clearWatchdog, noteTerminalFrame, paintResult,
        selectorFor, giveUpOnOutstandingRequests, sendMessage, endRun
    };
};
```

`beginPhase`'s card loop, with the selector recorded alongside the element:

```javascript
const beginPhase = ( checks, { containerSelector, cardSelectorFor = defaultCardSelectorFor } ) => {
    const outstanding = new Set();
    checks.forEach( check => {
        const requestId = newRequestId();
        check.requestId = requestId;
        const cards = {};
        const cardSelectors = {};
        const steps = Array.isArray( check.steps ) ? check.steps : Object.keys( STEP_CARD_CLASS );
        steps.forEach( step => {
            const suffix = cardSelectorFor( check, step );
            if ( null === suffix ) {
                console.warn( `The server advertises a step "${step}" for "${check.id ?? check.validate}" that this page renders no card for.` );
                return;
            }
            const card = document.querySelector( `${containerSelector} ${suffix}` );
            if ( null === card ) {
                console.warn( `No card rendered at "${suffix}" for check "${check.id ?? check.validate}"; its ${step} result will have nowhere to go.` );
                return;
            }
            cards[ step ] = card;
            cardSelectors[ step ] = suffix;
        } );
        registry.register( requestId, cards );
        selectors.set( requestId, cardSelectors );
        outstanding.add( requestId );
    } );
    phaseOutstanding = outstanding;
};
```

- [ ] **Step 3: Rewire `resources.js`**

Delete the moved definitions. Construct one runner at module scope, below `countUnattributableFailure` (which it references):

```javascript
const phaseRunner = createPhaseRunner( {
    cardSlugFor: ( check ) => ( undefined === check.id ? slugify( check.validate ) : idToCardClass( check.id ) ),
    onAdvance: () => runTests(),
    onUnattributableFailure: () => countUnattributableFailure(),
    canAdvance: () => currentState !== TestState.JobsFinished && currentState !== TestState.Stopped,
    socket: () => conn,
    runToken: () => currentRunToken
} );
```

Then replace the call sites:

| Was                                            | Becomes                                                        |
|------------------------------------------------|----------------------------------------------------------------|
| `sendMessage( … )`                             | `phaseRunner.sendMessage( … )`                                 |
| `restartPhaseWatchdog()`                       | `phaseRunner.restartWatchdog()`                                |
| `clearPhaseWatchdog()`                         | `phaseRunner.clearWatchdog()`                                  |
| `armPhaseWatchdog()`                           | `phaseRunner.armWatchdog()`                                    |
| `phaseOutstanding = beginPhase( checks, sel )` | `phaseRunner.beginPhase( checks, { containerSelector: sel } )` |
| `0 === phaseOutstanding.size`                  | `0 === phaseRunner.outstandingCount()`                         |
| `advanceIfPhaseIsEmpty()`                      | `phaseRunner.advanceIfPhaseIsEmpty()`                          |
| `paintResult( responseData )`                  | `phaseRunner.paintResult( responseData )`                      |

In `conn.onmessage`, the whole `if ( responseData.step === 'complete' ) { … }` block collapses to:

```javascript
if ( phaseRunner.noteTerminalFrame( responseData ) ) {
    return;
}
```

`e2e/resources-correlation.spec.ts:219` imports `giveUpOnOutstandingRequests` from `resources.js` to trigger the watchdog without waiting out
sixty seconds. Keep that export working by re-exporting the runner's:

```javascript
/** Exported only so a spec can trigger the watchdog without waiting out the clock. See wsRunner.js. */
export const giveUpOnOutstandingRequests = () => phaseRunner.giveUpOnOutstandingRequests();
```

- [ ] **Step 4: Lint**

Run: `npx eslint assets/js/wsRunner.js assets/js/resources.js`
Expected: no errors.

- [ ] **Step 5: Re-run the baseline suite, unmodified**

Run: `npx playwright test e2e/resources-correlation.spec.ts e2e/resources-fresh-page.spec.ts e2e/resources-rite.spec.ts e2e/results-replay-resources.spec.ts --project=chromium`

Expected: the same pass count as Step 1, with **no spec file edited**. If a spec needs changing, the refactor was not inert — revert and
re-scope rather than editing the spec to match.

- [ ] **Step 6: Commit**

```bash
git checkout -b refactor/42-extract-ws-runner
git add assets/js/wsRunner.js assets/js/resources.js
git commit -m "refactor(ws): extract the phase runner shared by both runner pages

resources.js owned the registry-backed painter, the phase watchdog, the
request-id minting and the send path. index.js needs all four, and
copying them would create the second implementation #42 exists to
remove.

Behaviour-inert: the resources suite passes unmodified.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Stop persisting the server's `classes` selector

**Branch:** `refactor/42-client-owned-selectors`

**Files:**

- Modify: `assets/js/testResults.js` (`createResultCollector`)
- Modify: `assets/js/resources.js` (the two `resultCollector.record` call sites)
- Test: `e2e/results-replay-resources.spec.ts` (existing), plus one new assertion

**Interfaces:**

- Consumes: `runner.selectorFor(requestId, step)` from Task 1.
- Produces: `record(phase, responseData, selector)` — a third parameter. Tasks 7 and 9 call it the same way.

- [ ] **Step 1: Write the failing assertion**

Add to `e2e/resources-correlation.spec.ts`:

```typescript
test('a stored run records our own card selector, never the server-sent one', async ({ page, request }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');
    await runToCompletion(page);

    // The stub addresses every frame at `.stub-addresses-nothing.<step>`, which matches no card.
    // If that string reaches disk, the page is still persisting the server's selector.
    const summaries = await (await request.get('/results.php', { headers: { Accept: 'application/json' } })).json();
    const newest = summaries.filter((r: { runType: string }) => r.runType === 'resources')[0];
    const detail = await (await request.get(`/results.php?file=${encodeURIComponent(newest.file)}`, {
        headers: { Accept: 'application/json' },
    })).json();

    const selectors = [...detail.apiPathResults, ...detail.sourceDataResults].map((d: { selector: string }) => d.selector);
    expect(selectors.length).toBeGreaterThan(0);
    expect(selectors.every((s) => typeof s === 'string' && s.length > 0)).toBe(true);
    expect(selectors.some((s) => s.includes('stub-addresses-nothing'))).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/resources-correlation.spec.ts --project=chromium -g "records our own card selector"`
Expected: FAIL — every stored selector is `.stub-addresses-nothing.<step>`, because `record()` reads `responseData.classes`.

- [ ] **Step 3: Take the selector as a parameter**

In `assets/js/testResults.js`:

```javascript
        /**
         * @param {string} phase
         * @param {object} responseData - The frame; read for status, message and test name only.
         * @param {?string} selector - The selector *we* found the card by. Not `responseData.classes`:
         *        that is the server's, and #42 removes our dependence on it. A stored run replays by
         *        applying this string, so it must address our own markup.
         */
        record(phase, responseData, selector) {
            results.push({
                phase,
                selector: selector ?? null,
                status: responseData.type === 'success' ? 'success' : 'error',
                message: responseData.type === 'error' ? (responseData.text ?? null) : null,
                test: responseData.test ?? null,
            });
        },
```

- [ ] **Step 4: Pass it from `resources.js`**

Both `resultCollector.record( phaseForState(), responseData )` call sites in `conn.onmessage` become:

```javascript
resultCollector.record( phaseForState(), responseData, phaseRunner.selectorFor( responseData.requestId, responseData.step ) );
```

- [ ] **Step 5: Run the new assertion and the replay suite**

Run: `npx playwright test e2e/resources-correlation.spec.ts e2e/results-replay-resources.spec.ts --project=chromium`
Expected: PASS. Replay still works because it applies whatever string the file holds, and `slugifySelector()` normalises casing either way.

- [ ] **Step 6: Commit**

```bash
git checkout -b refactor/42-client-owned-selectors
git add assets/js/testResults.js assets/js/resources.js e2e/resources-correlation.spec.ts
git commit -m "refactor(results): record the selector we found the card by

The stored payload took its selector from the server's \`classes\`, which
baked that string into persisted data and left upstream unable to retire
it. The registry already knows which card each frame paints, so the page
can address its own markup.

Stored runs from before this change replay unchanged.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Compose inventory ids for a calendar

**Branch:** `feat/42-index-source-data` (Tasks 3 through 6 share it)

**Files:**

- Modify: `assets/js/wsProtocol.js` (add `inventoryIdsForCalendar`)
- Test: `e2e/ws-protocol.spec.ts`

**Interfaces:**

- Produces: `inventoryIdsForCalendar({ rite, nation, widerRegion, missals, dioceseId }) -> Array<string>`, consumed by Task 5.

- [ ] **Step 1: Write the failing test**

Append to `e2e/ws-protocol.spec.ts`:

```typescript
test('inventoryIdsForCalendar composes the ids the API advertises', async ({ page }) => {
    await page.goto('/resources.php');
    const ids = await page.evaluate(async () => {
        const { inventoryIdsForCalendar } = await import('/assets/js/wsProtocol.js' as any);
        return {
            national: inventoryIdsForCalendar({
                rite: 'roman', nation: 'IT', widerRegion: 'Europe',
                missals: ['EDITIO_TYPICA_1970', 'IT_1983'], dioceseId: null,
            }),
            diocesan: inventoryIdsForCalendar({
                rite: 'ambrosian', nation: 'IT', widerRegion: 'Europe',
                missals: [], dioceseId: 'milano_it',
            }),
        };
    });

    expect(ids.national).toEqual([
        'temporale:roman',
        'decrees:roman',
        'widerregion:roman:Europe',
        'nation:roman:IT',
        'sanctorale:roman:EDITIO_TYPICA_1970',
        'sanctorale:roman:IT_1983',
    ]);
    // The diocese is qualified by its own rite; everything it inherits stays Roman.
    expect(ids.diocesan).toContain('diocese:ambrosian:milano_it');
    expect(ids.diocesan).toContain('nation:roman:IT');
    // Coverage is deliberately held constant: no i18n ids yet. See issue #61.
    expect(ids.national.some((id) => id.endsWith(':i18n'))).toBe(false);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/ws-protocol.spec.ts --project=chromium -g "inventoryIdsForCalendar"`
Expected: FAIL — `inventoryIdsForCalendar is not a function`.

- [ ] **Step 3: Implement it**

Add to `assets/js/wsProtocol.js`:

```javascript
/**
 * The `/validations` inventory ids a calendar's source-data phase checks.
 *
 * Replaces the slug-and-path construction this repository used to do — `wider-region-Europe` with a
 * bare `sourceFile`, `proprium-de-sanctis-IT-1983` derived from missal metadata, and repo-relative
 * paths into the API for the universal corpus. The server advertises these ids; nothing here knows
 * where any of it lives on disk, which is the whole of #42.
 *
 * The universal corpus is qualified by `rite`, but everything a calendar *inherits* is Roman: a
 * national calendar is Roman by definition, and an Ambrosian diocese still inherits the Roman
 * national calendar of its nation. That is pre-existing behaviour and a pre-existing open design
 * question; it is preserved here deliberately and not resolved.
 *
 * No `:i18n` ids: coverage is held constant across the migration so a change in card counts is a
 * migration bug rather than intended new coverage. See issue #61.
 *
 * @param {object} scope
 * @param {string} scope.rite - The selected rite.
 * @param {?string} scope.nation - The nation code, or null for a rite-level calendar.
 * @param {?string} scope.widerRegion - The nation's wider region, or null.
 * @param {Array<string>} scope.missals - The nation's missal ids, e.g. `['IT_1983']`.
 * @param {?string} scope.dioceseId - The diocese calendar id, or null when not a diocesan calendar.
 * @returns {Array<string>}
 */
export const inventoryIdsForCalendar = ( { rite, nation, widerRegion, missals, dioceseId } ) => {
    const ids = [ `temporale:${rite}`, 'decrees:roman' ];
    if ( widerRegion ) {
        ids.push( `widerregion:roman:${widerRegion}` );
    }
    if ( nation ) {
        ids.push( `nation:roman:${nation}` );
    }
    ( missals ?? [] ).forEach( missalId => ids.push( `sanctorale:roman:${missalId}` ) );
    if ( dioceseId ) {
        ids.push( `diocese:${rite}:${dioceseId}` );
    }
    return ids;
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx playwright test e2e/ws-protocol.spec.ts --project=chromium -g "inventoryIdsForCalendar"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -b feat/42-index-source-data
git add assets/js/wsProtocol.js e2e/ws-protocol.spec.ts
git commit -m "feat(ws): compose /validations ids for a calendar's source data

Replaces slug-and-path construction with the ids the API advertises.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Teach the stub the Calendars page's actions

**Branch:** `feat/42-index-source-data`

**Files:**

- Modify: `e2e/websocket-stub.ts`

**Interfaces:**

- Produces: a stub that answers `validateCalendar` and `runTest` as well as `executeValidation` and `validateSource`. Tasks 6, 8 and 9 rely on it.

- [ ] **Step 1: Extend the reply path**

In `installReplyingWebSocketStub`'s `send()`, replace the early return with a family decision. A test run reports **one** step, `validates`,
addressed at `test-valid`; a check and a calendar validation report three:

```typescript
const CHECK_ACTIONS = ['executeValidation', 'validateSource', 'validateCalendar'];
const TEST_ACTIONS = ['runTest', 'executeUnitTest'];
if (!CHECK_ACTIONS.includes(message.action as string) && !TEST_ACTIONS.includes(message.action as string)) {
    return;
}
const isTestRun = TEST_ACTIONS.includes(message.action as string);
const allSteps = (isTestRun ? ['validates'] : ['exists', 'parses', 'validates']) as const;
const stepClassFor = (step: string): string => (isTestRun ? 'test-valid' : STEP_CLASS[step]);
```

Use `stepClassFor(step)` where the step frame currently builds `STEP_CLASS[step]`, and add `test` to the frame for a test run so the page's
per-test counters can find their accordion:

```typescript
this.deliver({
    type: 'success',
    text: `stub ${step}`,
    classes: `.stub-addresses-nothing.${stepClassFor(step)}`,
    target,
    step,
    status: 'pass',
    runToken,
    runId: runToken,
    requestId,
    ...(isTestRun ? { test: String(message.test ?? 'StubTest') } : {}),
});
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Confirm the resources suite is unaffected**

Run: `npx playwright test e2e/resources-correlation.spec.ts --project=chromium`
Expected: PASS — the stub's behaviour for the two actions it already answered is unchanged.

- [ ] **Step 4: Commit**

```bash
git add e2e/websocket-stub.ts
git commit -m "test(e2e): teach the stub validateCalendar and runTest

A test run reports one step, validates, addressed at test-valid; a check
and a calendar validation report three.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Build the Calendars source-data list from the inventory

**Branch:** `feat/42-index-source-data`

**Files:**

- Modify: `assets/js/index.js` (`buildUniversalSourceDataChecks`, `buildNonVASourceDataChecks`, `loadAsyncData`, `sourceDataCheckTemplate`)

**Interfaces:**

- Consumes: `inventoryIdsForCalendar` (Task 3), `fetchValidations` and `idToCardClass` from `wsProtocol.js`.
- Produces: `currentSourceDataChecks` entries shaped `{ id, label, steps }` for inventory checks, and the one legacy entry
  `{ validate: 'LitCalMetadata', sourceFile: <url>, category: 'universalcalendar' }`. Tasks 6 and 7 consume this shape.

- [ ] **Step 1: Add the imports this task needs**

`fetchValidations()` takes the API base URL. Do **not** add `ENDPOINTS.ROOT` to `index.js` — unlike `resources.js`, this page already has
`getApiBaseUrl()`, which derives the base URL by stripping `/calendars` from `ENDPOINTS.CALENDARS`, and whose docblock says it is *"derived
rather than stored so the two cannot drift"*. Adding a stored `ROOT` would reintroduce exactly that drift. Call `getApiBaseUrl()` wherever this
task needs the base URL.

Add to the `wsProtocol.js` import block in `index.js`: `fetchValidations`, `inventoryIdsForCalendar`, `idToCardClass`. Task 6 adds
`createPhaseRunner` from the new `./wsRunner.js`; Task 8 adds `toCalendarIdentity` and `STEP_CARD_CLASS`; Task 9 adds
`TEST_RUN_STEP_CARD_CLASS`. Remove `universalChecksForRite` from the import block in this task — Task 7 deletes the function itself.

- [ ] **Step 2: Fetch the inventory alongside the existing metadata**

`loadAsyncData()` already fetches `/calendars`, `/tests`, `/decrees` and `/missals`. Add the inventory as a fifth, following the pattern
`resources.js` uses:

```javascript
fetchValidations( getApiBaseUrl() ).then( items => ( { litcal_validations: items } ) )
```

and store the result in a module-level `let ValidationsInventory = [];` in the branch that recognises `litcal_validations`.

- [ ] **Step 3: Replace the two builders**

`buildUniversalSourceDataChecks( rite )` keeps only the `/calendars` URL check and delegates the rest:

```javascript
/**
 * The source-data checks for a calendar, as inventory items plus the one URL check this page renders
 * alongside them.
 *
 * `LitCalMetadata` is a *resource* check living in a source-data phase: it validates the `/calendars`
 * response, has no inventory id, and stays on `executeValidation`. Everything else is an id the API
 * advertised.
 */
const buildSourceDataChecks = ( { rite, nation, widerRegion, missals, dioceseId } ) => {
    const checks = [ {
        validate: 'LitCalMetadata',
        sourceFile: ENDPOINTS.CALENDARS,
        category: 'universalcalendar'
    } ];
    const advertised = new Map( ValidationsInventory.map( item => [ item.id, item ] ) );
    inventoryIdsForCalendar( { rite, nation, widerRegion, missals, dioceseId } ).forEach( id => {
        const item = advertised.get( id );
        if ( undefined === item ) {
            // Said out loud rather than skipped silently: the inventory is the contract now, so an id
            // this page composed that the server does not advertise is a real disagreement.
            console.warn( `The API advertises no checkable item "${id}"; it will not be checked.` );
            return;
        }
        checks.push( { id: item.id, label: item.label, steps: item.steps } );
    } );
    return checks;
};
```

`buildNonVASourceDataChecks( calendarId, calendarCategory )` keeps its metadata lookups — diocese to nation, nation to wider region and missals —
and its `null` returns when metadata is missing, and ends with a single call to `buildSourceDataChecks`. Preserve the existing comment about
starting from the Roman corpus; it still applies, and Task 3's helper implements it.

- [ ] **Step 4: Render cards from the inventory shape**

`sourceDataCheckTemplate( item, idx )` currently reads `item.sourceFile ?? item.sourceFolder ?? ''`. Mirror `resources.js`'s `sourceTemplate`:
the card class is `idToCardClass( item.id )` for an inventory item and `slugify( item.validate )` for the URL check, the caption is
`item.label ?? item.validate`, and the tooltip is `item.id ?? item.sourceFile`.

- [ ] **Step 5: Lint and load the page**

Run: `npx eslint assets/js/index.js`
Expected: no errors.

Run: `npx playwright test e2e/rite-selection.spec.ts --project=chromium`
Expected: PASS — the scaffold still renders for both rites.

- [ ] **Step 6: Commit**

```bash
git add assets/js/index.js
git commit -m "feat(runner): take the Calendars source-data list from /validations

The page composed slugs and repo-relative paths into the API's source
data, which is the lockstep coupling #42 removes. It now sends ids the
API advertised and knows nothing about where any of it lives.

Coverage is held constant: no i18n ids yet, see #61.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Run the source-data phase through the runner

**Branch:** `feat/42-index-source-data`

**Files:**

- Modify: `assets/js/index.js` (`runTests`, `conn.onmessage`, module state)
- Test: `e2e/calendars-correlation.spec.ts` (new)

**Interfaces:**

- Consumes: `createPhaseRunner` (Task 1), the check shape from Task 5, the stub from Task 4.

- [ ] **Step 1: Write the failing test**

Create `e2e/calendars-correlation.spec.ts`:

```typescript
import { test, expect, Page } from '@playwright/test';
import { installReplyingWebSocketStub, sentFrames } from './websocket-stub';

/**
 * The Calendars runner attributes frames by `requestId` and ends phases on the terminal frame (#42).
 *
 * The stub addresses every frame at `.stub-addresses-nothing.<step>`, which matches no card on the
 * page. A run that paints its cards regardless can only be attributing frames some other way.
 */
const runToCompletion = async (page: Page): Promise<void> => {
    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();
    await expect(page.locator('#startTestRunnerBtnLbl')).toHaveText('Tests Complete', { timeout: 60000 });
};

test('source-data checks go out as validateSource with an opaque id', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const frames = (await sentFrames(page)).map((raw) => JSON.parse(raw) as Record<string, unknown>);
    const sourceChecks = frames.filter((m) => m.action === 'validateSource');
    expect(sourceChecks.length).toBeGreaterThan(0);

    for (const message of sourceChecks) {
        expect(message.target).toMatchObject({ id: expect.any(String) });
        expect(typeof message.requestId).toBe('string');
        // The retired vocabulary must be gone: the server rejects these outright.
        expect(message).not.toHaveProperty('category');
        expect(message).not.toHaveProperty('validate');
        expect(message).not.toHaveProperty('sourceFile');
        expect(message).not.toHaveProperty('sourceFolder');
    }
    // No repo-relative path may cross the wire any more.
    expect(JSON.stringify(sourceChecks)).not.toContain('jsondata/');
});

test('every request carries a distinct requestId', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const ids = (await sentFrames(page))
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
        .filter((m) => typeof m.requestId === 'string')
        .map((m) => m.requestId as string);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
});

test('the source-data cards are painted despite a selector that matches nothing', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const cards = page.locator('#sourceDataTests .sourcedata-tests .card');
    await expect(cards.first()).toBeVisible();
    // Every card left blue would mean the page still needs the server's selector to find it.
    await expect(page.locator('#sourceDataTests .sourcedata-tests .bg-info')).toHaveCount(0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/calendars-correlation.spec.ts --project=chromium`
Expected: FAIL — the page still sends `executeValidation` with `category`/`sourceFile`, and no card is painted because the stub's selector
matches nothing.

- [ ] **Step 3: Construct the runner in `index.js`**

Below `countUnattributableFailure`:

```javascript
const phaseRunner = createPhaseRunner( {
    cardSlugFor: ( check ) => ( undefined === check.id ? slugify( check.validate ) : idToCardClass( check.id ) ),
    onAdvance: () => runTests(),
    onUnattributableFailure: () => countUnattributableFailure(),
    canAdvance: () => currentState !== TestState.JobsFinished && currentState !== TestState.Stopped,
    socket: () => conn,
    runToken: () => currentRunToken
} );
```

Delete `index.js`'s own `sendMessage` and use `phaseRunner.sendMessage` everywhere. This is not merely tidying: the page's own `sendMessage`
never attached the negotiated `protocol`, and the shared one does.

- [ ] **Step 4: Rewrite the source-data phase**

`TestState.ReadyState` sends the whole phase at once rather than one check at a time:

```javascript
case TestState.ReadyState: {
    currentState = TestState.ExecutingValidations;
    performance.mark( 'sourceDataTestsStart' );
    safeCollapseShow('#sourceDataTests');
    phaseRunner.beginPhase( currentSourceDataChecks, { containerSelector: '#sourceDataTests .sourcedata-tests' } );
    phaseRunner.armWatchdog();
    currentSourceDataChecks.forEach( check => {
        if ( undefined === check.id ) {
            // The one URL check in this phase: no inventory id, so it keeps the legacy shape.
            phaseRunner.sendMessage( { action: 'executeValidation', ...check } );
            return;
        }
        phaseRunner.sendMessage( { action: 'validateSource', target: { id: check.id }, requestId: check.requestId } );
    } );
    phaseRunner.advanceIfPhaseIsEmpty();
    break;
}
case TestState.ExecutingValidations:
    if ( 0 === phaseRunner.outstandingCount() ) {
        console.log( 'Source file validation jobs are finished! Now continuing to check calendar data...' );
        // The body below is Task 8's; until that task lands, leave the existing
        // ValidatingCalendarData transition here untouched.
    }
    break;
```

Delete `messageCounter` and its declaration. Delete the long `>=` comment block — the reasoning it records is superseded, and Task 1's runner
carries the replacement argument.

- [ ] **Step 5: Handle the terminal frame and paint by registry**

In `conn.onmessage`, after the runToken guard and before the `try`:

```javascript
phaseRunner.restartWatchdog();

if ( phaseRunner.noteTerminalFrame( responseData ) ) {
    return;
}
```

Replace both `applyResultToDom( responseData )` calls with `phaseRunner.paintResult( responseData )`, and both
`resultCollector.record( phaseForState(), responseData )` calls with the three-argument form from Task 2.

- [ ] **Step 6: Run the new spec**

Run: `npx playwright test e2e/calendars-correlation.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 7: Assert the new give-up behaviour**

The page had no watchdog before this task, so its failure mode changes: a stalled phase used to hang for ever. The spec calls for asserting
that rather than discovering it. Export the trigger from `index.js`, exactly as `resources.js` does:

```javascript
/** Exported only so a spec can trigger the watchdog without waiting out the clock. See wsRunner.js. */
export const giveUpOnOutstandingRequests = () => phaseRunner.giveUpOnOutstandingRequests();
```

Append to `e2e/calendars-correlation.spec.ts`:

```typescript
/** Trigger what the silence watchdog triggers, without waiting out its sixty-second clock. */
const giveUpNow = (page: Page): Promise<void> =>
    page.evaluate(async () => {
        const specifier = '/assets/js/index.js';
        const { giveUpOnOutstandingRequests } = (await import(specifier)) as { giveUpOnOutstandingRequests: () => void };
        giveUpOnOutstandingRequests();
    });

test('giving up counts one failure per card left grey', async ({ page }) => {
    // A request that died partway. Its remaining cards stay unpainted, and each one must be counted
    // or the totals badge reads lower than the number of cards on the page.
    await installReplyingWebSocketStub(page, { stopAfterStep: 'exists' });
    await page.goto('/index.php');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();

    await expect.poll(async () => page.locator('#sourceDataTests .sourcedata-tests .card.bg-success').count(), { timeout: 20000 })
        .toBeGreaterThan(0);
    await page.waitForTimeout(200);

    const greyBefore = await page.locator('#sourceDataTests .sourcedata-tests .card.bg-info').count();
    expect(greyBefore).toBeGreaterThan(0);

    await giveUpNow(page);

    expect(Number(await page.locator('#failedCount').textContent())).toBeGreaterThanOrEqual(greyBefore);
});
```

Run: `npx playwright test e2e/calendars-correlation.spec.ts --project=chromium -g "giving up"`
Expected: PASS.

- [ ] **Step 8: Run the whole suite**

Run: `npx playwright test --project=chromium`
Expected: `results-replay.spec.ts` may fail on card-count expectations, because the source-data card set now comes from the inventory. Read the
failure: if the count changed because coverage changed, that is a bug in Task 3 or 5 — coverage is meant to be constant. If it changed only
because captions or classes now come from `label`/`id`, update the spec's expectations and say so in the commit message.

- [ ] **Step 9: Commit**

```bash
git add assets/js/index.js e2e/calendars-correlation.spec.ts
git commit -m "feat(runner): attribute Calendars frames by requestId

The source-data phase now ends on the server's terminal frame instead of
counting to three, and paints cards through the request registry instead
of executing a CSS selector the server composed.

The page also gains a silence watchdog it never had: a stalled phase used
to hang on 'Tests Running...' for ever with no diagnostic.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Delete `UNIVERSAL_CHECKS`

**Branch:** `feat/42-index-source-data`

**Files:**

- Modify: `assets/js/wsProtocol.js` (delete `UNIVERSAL_CHECKS`, `universalChecksForRite`)
- Modify: `e2e/ws-protocol.spec.ts` (delete the two tests that pin them)
- Modify: `e2e/rite-selection.spec.ts:175` (the comment referring to them)

- [ ] **Step 1: Confirm there are no consumers left**

Run: `grep -rn "UNIVERSAL_CHECKS\|universalChecksForRite" assets/ e2e/`
Expected: only the definitions in `wsProtocol.js`, the two tests in `ws-protocol.spec.ts`, and the comment in `rite-selection.spec.ts`. If
`index.js` still appears, Task 5 is incomplete — stop and finish it.

- [ ] **Step 2: Delete them**

Remove `UNIVERSAL_CHECKS` and `universalChecksForRite` from `wsProtocol.js`, including the docblock explaining the `universalcalendar` versus
`sourceDataCheck` category split — that argument dies with the constant. Remove the two tests
(`'UNIVERSAL_CHECKS covers both rites, temporale and decrees, files and i18n folders'` and
`'universalChecksForRite returns only that rite'`). Rewrite the `rite-selection.spec.ts` comment to point at the inventory instead.

- [ ] **Step 3: Verify**

Run: `npx eslint assets/js && npm run typecheck && npx playwright test --project=chromium`
Expected: PASS.

- [ ] **Step 4: Commit and open the PR**

```bash
git add assets/js/wsProtocol.js e2e/ws-protocol.spec.ts e2e/rite-selection.spec.ts
git commit -m "refactor(ws): delete the hardcoded source-data path table

UNIVERSAL_CHECKS duplicated the API's on-disk layout in this repository,
which is what broke in #38 and again in API #795 and #800. Its last
consumer is gone.

Closes the headline of #42 for the source-data phase.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/42-index-source-data
```

---

## Task 8: Migrate the calendar-data phase

**Branch:** `feat/42-index-calendar-phases` (Tasks 8 through 10 share it)

**Files:**

- Modify: `assets/js/wsProtocol.js` (add `toCalendarIdentity`, make `STEP_CARD_CLASS` per-family)
- Modify: `assets/js/index.js` (`runTests`, `TestState.ValidatingCalendarData`)
- Test: `e2e/ws-protocol.spec.ts`, `e2e/calendars-correlation.spec.ts`

**Interfaces:**

- Produces: `toCalendarIdentity(value, calendartype, rite) -> {kind, id?, rite}` and
  `STEP_CARD_CLASS` gaining a `TEST_RUN` sibling. Task 9 consumes both.

- [ ] **Step 1: Write the failing test for the identity mapper**

Append to `e2e/ws-protocol.spec.ts`:

```typescript
test('toCalendarIdentity maps the select values onto the typed calendar', async ({ page }) => {
    await page.goto('/index.php');
    const identities = await page.evaluate(async () => {
        const { toCalendarIdentity } = await import('/assets/js/wsProtocol.js' as any);
        return {
            riteLevel: toCalendarIdentity('', '', 'roman'),
            ambrosianRiteLevel: toCalendarIdentity('', '', 'ambrosian'),
            national: toCalendarIdentity('IT', 'national', 'roman'),
            diocesan: toCalendarIdentity('milano_it', 'diocesan', 'ambrosian'),
        };
    });

    expect(identities.riteLevel).toEqual({ kind: 'rite', rite: 'roman' });
    expect(identities.ambrosianRiteLevel).toEqual({ kind: 'rite', rite: 'ambrosian' });
    expect(identities.national).toEqual({ kind: 'national', id: 'IT', rite: 'roman' });
    expect(identities.diocesan).toEqual({ kind: 'diocesan', id: 'milano_it', rite: 'ambrosian' });
});

test('toCalendarIdentity throws on an unknown calendartype rather than sending a partial message', async ({ page }) => {
    await page.goto('/index.php');
    const threw = await page.evaluate(async () => {
        const { toCalendarIdentity } = await import('/assets/js/wsProtocol.js' as any);
        try {
            toCalendarIdentity('IT', 'nationalcalendar', 'roman');
            return false;
        } catch {
            return true;
        }
    });
    expect(threw).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/ws-protocol.spec.ts --project=chromium -g "toCalendarIdentity"`
Expected: FAIL — not a function.

- [ ] **Step 3: Implement `toCalendarIdentity` and the step families**

```javascript
/**
 * The typed calendar identity the v2 `validateCalendar` and `runTest` messages carry.
 *
 * Replaces `toWireTarget()`, which produced the v1 `{calendar, category}` pair. The server rejects
 * `category` on the typed shape outright (`Health::RETIRED_PROPERTIES`), so the two cannot be mixed:
 * `calendar.kind` is the discriminator now.
 *
 * Throws on an unrecognised type rather than composing a partial message, for the reason
 * `toWireTarget()` did: a message the server rejects costs a red card and a rate-limit charge, and
 * says nothing useful about which of our call sites was wrong.
 *
 * @param {string} value - The calendar select's value; empty means the rite-level calendar.
 * @param {string} calendartype - The option's `data-calendartype`: 'national', 'diocesan' or ''.
 * @param {string} rite - The selected rite.
 * @returns {{kind: string, id?: string, rite: string}}
 */
export const toCalendarIdentity = ( value, calendartype, rite ) => {
    if ( '' === value ) {
        return { kind: 'rite', rite };
    }
    if ( 'national' === calendartype ) {
        return { kind: 'national', id: value, rite };
    }
    if ( 'diocesan' === calendartype ) {
        return { kind: 'diocesan', id: value, rite };
    }
    throw new Error( `Unknown calendartype "${calendartype}" for calendar "${value}".` );
};
```

Replace the flat `STEP_CARD_CLASS` with the two families the server publishes in `FrameFamily::CLASS_FOR_STEP`. A test run reports exactly one
step, `validates`, on a card classed `test-valid`; a check and a calendar validation report three:

```javascript
/**
 * The card class each published step is reported on, per frame family.
 *
 * Mirrors the server's `FrameFamily::CLASS_FOR_STEP`. The families matter because `validates` means a
 * different card in each: `schema-valid` for a file or a calendar, `test-valid` for a test run. A
 * single flat map cannot express that, and silently painted test results onto nothing.
 *
 * `complete` is absent on purpose — the terminal frame addresses no card.
 */
export const STEP_CARD_CLASS = Object.freeze({
    exists: 'file-exists',
    parses: 'json-valid',
    validates: 'schema-valid'
});

export const TEST_RUN_STEP_CARD_CLASS = Object.freeze({
    validates: 'test-valid'
});
```

- [ ] **Step 4: Run the identity tests**

Run: `npx playwright test e2e/ws-protocol.spec.ts --project=chromium -g "toCalendarIdentity"`
Expected: PASS.

- [ ] **Step 5: Migrate the phase**

In `runTests()`, the transition into `ValidatingCalendarData` registers cards by year and sends the typed message. The card address is
`.calendar-{slug}.{step-class}.year-{n}`, so `cardSelectorFor` is supplied rather than defaulted:

```javascript
currentState = TestState.ValidatingCalendarData;
performance.mark( 'calendarDataTestsStart' );
safeCollapseShow('#calendarDataTests');

const calendarIdentity = toCalendarIdentity( currentSelectedCalendar, currentCalendarType, currentRite );
const calendarSlug = slugify( currentSelectedCalendar );
const yearChecks = Years.map( year => ( { year } ) );

phaseRunner.beginPhase( yearChecks, {
    containerSelector: '.calendardata-tests',
    cardSelectorFor: ( check, step ) => {
        const stepClass = STEP_CARD_CLASS[ step ];
        return undefined === stepClass ? null : `.calendar-${calendarSlug}.${stepClass}.year-${check.year}`;
    }
} );
phaseRunner.armWatchdog();
yearChecks.forEach( check => {
    phaseRunner.sendMessage( {
        action: 'validateCalendar',
        calendar: calendarIdentity,
        year: check.year,
        responseFormat: currentResponseType,
        requestId: check.requestId
    } );
} );
phaseRunner.advanceIfPhaseIsEmpty();
```

`case TestState.ValidatingCalendarData:` becomes `if ( 0 === phaseRunner.outstandingCount() ) { … }` wrapped around the existing transition
into `SpecificUnitTests`, which Task 9 then rewrites. Delete `calendarDataExpectedResponses` and `calendarDataReceivedResponses` and their declarations.

**`currentCalendarType`** is the `data-calendartype` of the selected option. If `index.js` currently keeps only `currentCalendarCategory` (the v1
`nationalcalendar`/`diocesancalendar`/`ritecalendar` vocabulary), add a module-level `let currentCalendarType = '';` assigned in
`handleCalendarSelectChange()` from the option's dataset, next to where `currentCalendarCategory` is assigned. Keep `currentCalendarCategory`
for now — Task 10 removes it once nothing sends it.

- [ ] **Step 6: Assert the wire shape**

Append to `e2e/calendars-correlation.spec.ts`:

```typescript
test('calendar validation goes out with a typed calendar and no retired properties', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const calendarChecks = (await sentFrames(page))
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
        .filter((m) => m.action === 'validateCalendar');

    expect(calendarChecks.length).toBeGreaterThan(0);
    for (const message of calendarChecks) {
        expect(message.calendar).toMatchObject({ kind: expect.any(String), rite: expect.any(String) });
        expect(message.responseFormat).toBe('JSON');
        expect(typeof message.requestId).toBe('string');
        // Retired on the typed shape; the server rejects the message outright if present.
        expect(message).not.toHaveProperty('category');
        expect(message).not.toHaveProperty('rite');
        expect(message).not.toHaveProperty('responsetype');
    }
});
```

- [ ] **Step 7: Run it**

Run: `npx playwright test e2e/calendars-correlation.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git checkout -b feat/42-index-calendar-phases
git add assets/js/wsProtocol.js assets/js/index.js e2e/ws-protocol.spec.ts e2e/calendars-correlation.spec.ts
git commit -m "feat(runner): send the typed calendar and end the phase on complete

validateCalendar carries {kind, id?, rite} and responseFormat, and drops
category, rite and responsetype, which the server now rejects.

Deletes 'Years.length * 3' — the step count comes from the server.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Migrate the unit-test phase

**Branch:** `feat/42-index-calendar-phases`

**Files:**

- Modify: `assets/js/index.js` (`TestState.SpecificUnitTests`)
- Test: `e2e/calendars-correlation.spec.ts`

**Interfaces:**

- Consumes: `toCalendarIdentity` and `TEST_RUN_STEP_CARD_CLASS` (Task 8).

- [ ] **Step 1: Write the failing test**

Append to `e2e/calendars-correlation.spec.ts`:

```typescript
test('unit tests go out as runTest with a typed calendar', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await runToCompletion(page);

    const frames = (await sentFrames(page)).map((raw) => JSON.parse(raw) as Record<string, unknown>);
    expect(frames.some((m) => m.action === 'executeUnitTest')).toBe(false);

    const testRuns = frames.filter((m) => m.action === 'runTest');
    expect(testRuns.length).toBeGreaterThan(0);
    for (const message of testRuns) {
        expect(typeof message.test).toBe('string');
        expect(message.calendar).toMatchObject({ kind: expect.any(String), rite: expect.any(String) });
        expect(typeof message.year).toBe('number');
        expect(typeof message.requestId).toBe('string');
        expect(message).not.toHaveProperty('category');
        expect(message).not.toHaveProperty('rite');
    }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/calendars-correlation.spec.ts --project=chromium -g "runTest"`
Expected: FAIL — the page still sends `executeUnitTest`.

- [ ] **Step 3: Send the whole phase at once**

The unit-test phase currently walks one test and one year at a time, driven by the response. Registering the whole phase up front is what lets
it end on terminal frames like the other two. Build one check per (test, year) pair:

```javascript
currentState = TestState.SpecificUnitTests;
performance.mark( 'specificUnitTestsStart' );
safeCollapseShow('#specificUnitTests');

const calendarIdentity = toCalendarIdentity( currentSelectedCalendar, currentCalendarType, currentRite );
const testChecks = SpecificUnitTestCategories.flatMap( category =>
    SpecificUnitTestYears[ category.test ].map( year => ( { test: category.test, year } ) )
);

phaseRunner.beginPhase( testChecks, {
    containerSelector: '#specificUnitTests',
    cardSelectorFor: ( check, step ) => {
        const stepClass = TEST_RUN_STEP_CARD_CLASS[ step ];
        return undefined === stepClass ? null : `.${slugify( check.test )}.year-${check.year}.${stepClass}`;
    }
} );
phaseRunner.armWatchdog();
testChecks.forEach( check => {
    safeCollapseShow( `#specificUnitTest-${slugify( check.test )}` );
    phaseRunner.sendMessage( {
        action: 'runTest',
        test: check.test,
        calendar: calendarIdentity,
        year: check.year,
        requestId: check.requestId
    } );
} );
phaseRunner.advanceIfPhaseIsEmpty();
```

`case TestState.SpecificUnitTests:` becomes:

```javascript
case TestState.SpecificUnitTests:
    if ( 0 === phaseRunner.outstandingCount() ) {
        currentState = TestState.JobsFinished;
        runTests();
    }
    break;
```

Delete `index` and `yearIndex` and their declarations. The per-test timing marks (`specificUnitTest{Name}Start`/`End`) no longer have a
sequential point to fire at because the tests now run in parallel; mark the phase as a whole instead, reusing the existing
`litcalUnitTestRunner` measure between `specificUnitTestsStart` and a new `specificUnitTestsEnd` set in `JobsFinished`. Remove the per-test
`updateText( \`total${slug}TestsTime\` … )` calls and leave those elements empty rather than showing a stale value.

The per-test success and failure counters in `conn.onmessage` already recount from the DOM
(`document.querySelectorAll('#specificUnitTest-<slug> .bg-success').length`), so they keep working unchanged.

- [ ] **Step 4: Run the spec**

Run: `npx playwright test e2e/calendars-correlation.spec.ts --project=chromium`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/js/index.js e2e/calendars-correlation.spec.ts
git commit -m "feat(runner): run unit tests as runTest, registered up front

executeUnitTest walked one test and one year at a time, driven by the
response. Registering every (test, year) pair up front is what lets the
phase end on terminal frames like the other two.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Delete `toWireTarget` and the v1 leftovers

**Branch:** `feat/42-index-calendar-phases`

**Files:**

- Modify: `assets/js/wsProtocol.js` (delete `toWireTarget`)
- Modify: `assets/js/index.js` (drop `currentCalendarCategory` if nothing reads it)
- Modify: `e2e/ws-protocol.spec.ts` (delete the two `toWireTarget` tests)

- [ ] **Step 1: Confirm there are no consumers left**

Run: `grep -rn "toWireTarget\|executeUnitTest\|calendarDataExpectedResponses\|messageCounter" assets/ e2e/`
Expected: only the `toWireTarget` definition and its two tests, plus the stub's backwards-compatible `executeUnitTest` arm (keep that — the stub
plays the server, and the server still accepts it). Anything else means an earlier task is incomplete.

- [ ] **Step 2: Delete them**

Remove `toWireTarget` from `wsProtocol.js` and its two tests from `ws-protocol.spec.ts`. In `index.js`, `currentCalendarCategory` is still read
by `buildCalendarsPayload()` and `buildNonVASourceDataChecks()`; keep it, and keep it assigned. Only its use as a *wire* value is gone.

- [ ] **Step 3: Full verification**

Run: `npx eslint assets/js && npm run typecheck && npx playwright test --project=chromium && vendor/bin/phpcs`
Expected: all pass. `results-replay.spec.ts` may need its expectations updated for the changed card set; if so, say which counts changed and why
in the commit message.

- [ ] **Step 4: Commit and open the PR**

```bash
git add assets/js/wsProtocol.js assets/js/index.js e2e/ws-protocol.spec.ts
git commit -m "refactor(ws): delete toWireTarget

Its last consumer moved to the typed calendar identity. index.js was the
only page that sent the v1 category vocabulary, so upstream can now
retire those arms.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin feat/42-index-calendar-phases
```

---

## Task 11: Regenerate `types.js` and rewrite the CLAUDE.md protocol section

**Branch:** `docs/42-protocol-vocabulary`

**Files:**

- Modify: `assets/js/types.js`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read the published schema**

Run: `cat ../LiturgicalCalendarAPI/jsondata/schemas/WebSocketMessage.json`

Every typedef below must match it. Where the schema and this plan disagree, the schema wins — say so in the commit message rather than
silently following the plan.

- [ ] **Step 2: Rewrite `types.js`**

It currently documents an `AccuracyTestMessage` with `testId`/`testData` that is never sent, types `category` as the literal
`"sourceDataCheck"`, and knows nothing of `action`, `runToken`, `requestId`, `target`, `steps` or `responseFormat`. Replace the outgoing-message
typedefs with one per action actually sent — `validateSource`, `validateCalendar`, `runTest`, `executeValidation` (the surviving URL-check
shape) and `cancelRun` — and the incoming ones with the frame shape: `{type, step, status, target, requestId, runToken, runId, text, classes?,
test?}`. Mark `classes` deprecated, naming #42 and the upstream retirement it unblocks.

- [ ] **Step 3: Rewrite the CLAUDE.md WebSocket section**

The section still describes v1 only: one grep hit for `requestId`, none for `/validations`, `hello` or the terminal `complete`. It must now
describe what both runners do. Keep the material that is still true and load-bearing — the rite-scoping rules, the year-bound reasoning, the
`RiteSelect` wiring — and replace the message tables, the category-selection guidance and the "3 responses per check" constant. Delete the
`universalcalendar` versus `sourceDataCheck` guidance entirely: Task 7 deleted the code it described.

- [ ] **Step 4: Lint the markdown**

Run: `npx markdownlint-cli --config .markdownlint.yml CLAUDE.md docs/superpowers/**/*.md`
Expected: no errors. MD060 requires vertically aligned table columns.

- [ ] **Step 5: Verify nothing imports a deleted typedef**

Run: `npx eslint assets/js && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit and open the PR**

```bash
git checkout -b docs/42-protocol-vocabulary
git add assets/js/types.js CLAUDE.md
git commit -m "docs: describe the v2 WebSocket contract both runners now speak

types.js had drifted into fiction and CLAUDE.md documented v1 only.
Both are now written from WebSocketMessage.json.

Closes #42.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
git push -u origin docs/42-protocol-vocabulary
```

---

## Self-Review

**Spec coverage:**

- PR 0, extract the shared runner, proven inert → Task 1. ✓
- PR 0b, stop persisting the server's selector → Task 2. ✓
- PR 1, inventory-driven source data, registry attribution, delete `UNIVERSAL_CHECKS` → Tasks 3, 4, 5, 6, 7. ✓
- PR 2, typed calendar identity and `runTest`, delete the `* 3` constants → Tasks 8, 9, 10. ✓
- PR 3, `types.js` and the CLAUDE.md protocol section → Task 11. ✓
- The spec's open question — which `Step` a `runTest` frame carries — is resolved rather than deferred: it is `validates`, on a card classed
  `test-valid`, per the server's `FrameFamily::CLASS_FOR_STEP`. Task 8 splits `STEP_CARD_CLASS` into two families accordingly. ✓
- Risk "adding a watchdog changes failure behaviour" → asserted in Task 6, not left to be discovered. ✓
- Risk "a retired property is rejected" → asserted in Tasks 6, 8 and 9, which check the retired names are absent from the wire. ✓
- Risk "local rate limiting" → every behavioural spec drives the stub, so no task depends on a full live run. ✓
- Risk "Ambrosian diocese corpus" → stated as a global constraint and implemented in Task 3, which keeps inherited items Roman. ✓

**Type consistency:** `createPhaseRunner` (Task 1) is the one place its option names and return shape are defined; Tasks 2, 6, 8 and 9 use
`beginPhase(checks, {containerSelector, cardSelectorFor})`, `outstandingCount()`, `noteTerminalFrame()`, `paintResult()`, `selectorFor()`,
`armWatchdog()`, `restartWatchdog()`, `clearWatchdog()` and `sendMessage()` exactly as declared there. `record(phase, responseData, selector)`
gains its third parameter in Task 2 and is called that way in Tasks 2 and 6. `inventoryIdsForCalendar` (Task 3) is consumed only by Task 5.
`toCalendarIdentity` and `TEST_RUN_STEP_CARD_CLASS` (Task 8) are consumed by Tasks 8 and 9. Checks carry `{id, label, steps}` from the
inventory or `{validate, sourceFile, category}` for the one URL check, and every consumer discriminates on `undefined === check.id`.

**Placeholder scan:** no TBD or TODO. The one marker comment in Task 1 Step 2 points at the move table directly above it, which names every
member and its seam change; it is a pointer to adjacent content, not deferred work.

**Verification points for the implementer:**

- `currentCalendarType` may not exist in `index.js`; Task 8 Step 5 says to add it beside `currentCalendarCategory` if not.
- Task 6 Step 8 anticipates `results-replay.spec.ts` needing updated card-count expectations. Confirm any change is caption-driven, not
  coverage-driven — coverage is meant to be constant, and a changed count is otherwise a bug in Task 3 or 5.
- The per-test timing marks removed in Task 9 leave `total{Test}TestsTime` elements empty. If the page renders them visibly, decide whether to
  hide them or show the phase total; do not leave a stale value from a previous run.

## Done means

- `grep -rn "jsondata/" assets/js/` returns nothing.
- `grep -rn "classes" assets/js/index.js assets/js/resources.js` returns nothing outside the v1 fallback in `wsRunner.js`'s painter.
- No `* 3`, `=== 3` or `>= 3` frame arithmetic anywhere in `assets/js/`.
- `npx playwright test` is green, `npx eslint assets/js` is clean, `npm run typecheck` passes, `vendor/bin/phpcs` passes.
- Issue #42 closes; issue #61 remains open and is the only follow-up this work creates.
