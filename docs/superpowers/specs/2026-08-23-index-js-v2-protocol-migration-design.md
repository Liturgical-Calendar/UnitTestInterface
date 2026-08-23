# Migrating `index.js` to the v2 WebSocket contract

Design for the client half of [#42](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/42), covering the Calendars runner
(`index.php` / `assets/js/index.js`). The Resources runner was migrated first, in PR #55, and is the worked precedent this design follows.

## Status

Approved design, not yet implemented. Supersedes nothing; extends the migration begun in PR #55.

## Context

`index.js` is still a pure v1 client. It hardcodes the API's on-disk layout, executes CSS selectors the server builds for it, and hardcodes
"3 responses per check" in two places. Every one of those is a coupling [#42](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/42)
exists to remove.

Upstream is ready. LiturgicalCalendarAPI#806 sections A-E, G and H have all shipped; only section F (the versioned handshake) is open, and
nothing here depends on it. In particular `Health`'s class docblock states that **`requestId` is accepted on any message and echoed on every
frame that message produces**, rejections included — so per-request correlation is available on every action `index.js` sends, gated only on
the client sending an id. No upstream change is required for this work.

The server did not merely add fields. It reshaped three messages, and each **rejects** the legacy properties its own shape retired
(`Health::RETIRED_PROPERTIES`), so a half-migrated message fails loudly rather than being quietly accepted:

| v1                                     | v2                                     | v2 shape                                                |
|----------------------------------------|----------------------------------------|---------------------------------------------------------|
| `executeValidation`                    | `validateSource`                       | `{target: {id}}` — an inventory id is the whole address |
| `validateCalendar` (string `calendar`) | `validateCalendar` (object `calendar`) | `{calendar: {kind, id?, rite}, year, responseFormat}`   |
| `executeUnitTest`                      | `runTest`                              | `{test, calendar: {kind, id?, rite}, year}`             |

`index.js` is the only consumer of the two calendar-shaped actions, so this migration is what unblocks upstream retiring those legacy arms.

The inventory served by `GET /validations` is fully structured, which is what makes the calendar-scoped selection in `index.js` expressible
without paths:

```text
temporale:{rite}[:i18n]        nation:roman:{id}[:i18n]
decrees:roman[:i18n]           widerregion:roman:{name}[:i18n]
sanctorale:roman:{missalId}    diocese:{rite}:{calendar_id}[:i18n]
```

## Decisions

**Sequencing** — the `index.js` migration itself is two behavioural PRs (PR 1 and PR 2 below): the source-data phase, then both
calendar-shaped phases together. The calendar-data and unit-test phases
share one new `toCalendarIdentity()` helper and retire the same v1 vocabulary, so splitting them would write that helper in one PR and use it
in the next.

**Stored runs** — synthesize the card selector client-side at record time. This frees upstream to retire `classes` while leaving the stored
format and replay compatible.

**i18n coverage** — hold coverage constant and file a follow-up, so that any diff in the rendered cards or the counters is a migration bug
rather than intended new coverage.

**Shared code** — extract the reusable runner first, then adopt it. This delivers #42 item 1 and avoids ever creating a second copy of the
pattern.

**The `LitCalMetadata` `/calendars` check** — leave it on `executeValidation`, unchanged. It is a URL check with no inventory id;
`executeValidation` remains valid and `resources.js` still uses it for its own URL checks.

### Why extract before adopting

PR #55 put shared *helpers* in `wsProtocol.js` — the registry factory, the step map, the inventory fetch — but left `resources.js` owning the
things that use them: the painter, `sendMessage`, the phase watchdog, the abandoned-request summariser. Porting that pattern into `index.js`
directly would create a second copy of each, which is exactly divergence risk 4 in #42 ("two independent client implementations that have
already diverged").

Extracting first means the shared module is proven inert by an existing green suite before the migrating page depends on it, and it turns the
`index.js` work from "write the pattern again" into "delete the v1 path and call the module".

## Architecture: the shared phase runner

A new `assets/js/wsRunner.js` exports `createPhaseRunner({...})`. Moving out of `resources.js`, essentially verbatim:

| Moves                                                    | Why it is page-agnostic                                                        |
|----------------------------------------------------------|--------------------------------------------------------------------------------|
| `beginPhase`                                             | Mints request ids, looks up cards, registers; only the slug vocabulary differs |
| `phaseOutstanding`, `restart`/`clear`/`armPhaseWatchdog` | Pure bookkeeping over the registry                                             |
| `advanceIfPhaseIsEmpty`                                  | Guards the empty-phase wedge both pages can reach                              |
| `giveUpOnOutstandingRequests`                            | Already delegates to the shared `summariseAbandoned`                           |
| `paintResult`                                            | `(requestId, step)` to card, with the v1 selector fallback                     |
| `sendMessage`                                            | Attaches `runToken` and the negotiated `protocol`                              |

Four seams the consuming page supplies:

- `cardSlugFor(check)` — the `id` versus `validate` vocabulary split between the two pages
- `onAdvance()` — the page's own `runTests()`, called when a phase ends
- a counter callback for frames that cannot be attributed
- the socket accessor

Staying in each page: the state machine, scaffolding, payload building and counters. Already shared and untouched in `wsProtocol.js`:
`createRequestRegistry`, `createSilenceWatchdog`, `summariseAbandoned`, `STEP_CARD_CLASS`, `newRequestId`, `fetchValidations`.

## Implementation

### PR 0 — extract the shared runner (behaviour-inert)

Create `wsRunner.js` as above and have `resources.js` consume it with no behaviour change.

**Inertness proof:** `resources-correlation.spec.ts`, `resources-fresh-page.spec.ts`, `resources-rite.spec.ts` and
`results-replay-resources.spec.ts` stay green **unmodified**. If any needs editing, the refactor was not inert — stop and re-scope rather than
adjusting the spec to match.

### PR 0b — stop persisting the server's selector

`resultCollector.record()` in `testResults.js` currently reads `responseData.classes`. Change it to take the selector the caller already knows
from the registry. Isolated into its own PR because it changes persisted data.

Two consequences to accept deliberately:

- For `resources.js` source checks the stored string **changes**: the card slug is `idToCardClass(id)`, whereas the server's `classes` is still
  the legacy `validate`-based selector. New stored runs will differ from old ones.
- Old stored runs keep replaying. Replay applies whatever string the file holds, and `slugifySelector()` normalises casing either way. No
  `schemaVersion` bump and no reader migration.

`results-replay.spec.ts` and `results-replay-resources.spec.ts` are the check.

### PR 1 — the `index.js` source-data phase

`buildNonVASourceDataChecks()` stops constructing slugs and paths and composes inventory ids from the `MetaData` the page already fetches:
`temporale:{rite}`, `decrees:roman`, `widerregion:roman:{wider_region}`, `nation:roman:{nation}`, `sanctorale:roman:{missal_id}` and
`diocese:{rite}:{calendar_id}`.

Coverage is held constant: no `:i18n` ids, and the `LitCalMetadata` `/calendars` check stays on `executeValidation` as the one URL check in the
phase. Everything else is sent as `validateSource {target: {id}}`.

The phase then runs through `createPhaseRunner`: cards addressed by `idToCardClass(id)`, the phase ending on the terminal `complete` frames, and
`++messageCounter >= 3` deleted.

Two notes:

- **`index.js` has no watchdog today.** It advances purely by counting frames. Adopting the runner gives the page a safety net it currently
  lacks, which is a visible behaviour change: a stalled phase goes from hanging on "Tests Running…" for ever to giving up and reporting.
- `universalChecksForRite` loses its only consumer, so `UNIVERSAL_CHECKS` — the hardcoded path block at `wsProtocol.js:82-124` — and its two
  `ws-protocol.spec.ts` tests are deleted. That is the headline of #42.

### PR 2 — the calendar-data and unit-test phases

Add `toCalendarIdentity(value, calendartype, rite)` returning `{kind: 'general'|'national'|'diocesan'|'rite', id?, rite}`, replacing
`toWireTarget`. `index.js` is its only consumer; `ws-protocol.spec.ts` is updated with it.

- `validateCalendar` gains the object `calendar` and `responseFormat`, and **drops** `category`, `rite` and `responsetype`.
- `executeUnitTest` becomes `runTest`, carrying the same identity object.
- Both phases register their cards through the runner. `calendarDataExpectedResponses = Years.length * 3` and the unit-test frame counting are
  deleted.

**To confirm during implementation, not to guess:** which `Step` value the `runTest` frames carry. The card class is `test-valid` while the
published step vocabulary is `exists` / `parses` / `validates`, so `STEP_CARD_CLASS` may need a per-phase variant.

### PR 3 — documentation and types

Kept out of the behavioural PRs so a stale document cannot hide a code defect in review.

- Rewrite the CLAUDE.md WebSocket section against the published message schema (#42 item 6). It currently documents v1 only and does not
  describe what `resources.js` already does.
- Regenerate `assets/js/types.js` from `WebSocketMessage.json` (#42 item 5). It is currently stale in every particular: it documents an
  `AccuracyTestMessage` with `testId` / `testData` that is never sent, and knows nothing of `action`, `runToken`, `sourceFolder`,
  `responsetype`, `requestId`, `steps` or `target`.

## Testing

`e2e/websocket-stub.ts` is extended to answer `validateSource`, the typed `validateCalendar` and `runTest`. Its existing trick of deliberately
sending a **wrong** `classes` selector (`.stub-addresses-nothing.<step-class>`) is what proves `index.js` has stopped executing them: a run that
paints its cards anyway is attributing frames by `requestId`.

New Calendars-runner specs mirror `resources-correlation.spec.ts`. `results-replay.spec.ts` card-count expectations are reviewed after PR 1.
CI runs phpcs, markdownlint, eslint and the Playwright suite on pull requests.

## Risks

**Local API rate limiting makes full live runs unreliable.** Rely on the stub for correctness and treat live runs as smoke tests.

**A wrong `responseFormat`, or a leftover retired property, is rejected.** This fails loudly per `RETIRED_PROPERTIES` and is caught by the stub
specs — a feature rather than a hazard, but it means a partially-converted message does not degrade, it stops.

**Adding a watchdog changes `index.js` failure behaviour.** Assert the new give-up-and-report behaviour in a spec rather than discovering it
during a live run.

**The Ambrosian diocese corpus question.** `buildNonVASourceDataChecks` currently starts every calendar from the *Roman* corpus, with a comment
calling that a pre-existing open design question. Preserve that behaviour exactly; do not resolve it during a protocol migration.

## Out of scope

Filed or to be filed as follow-ups:

- [#61](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/61) — the i18n and lectionary source-data coverage gaps. The i18n half
  becomes nearly free once PR 1 lands; the lectionary half is upstream-first, since no lectionary schema exists yet.
- [#60](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/60) — card step classes phrased as assertions. It overlaps
  `STEP_CARD_CLASS` but is its own argument.
- Upstream retirement of `classes` and the v1 arms, which this work unblocks but does not perform.

## References

- [UnitTestInterface#42](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/42) — the client-side issue
- LiturgicalCalendarAPI#806 — the protocol proposal, with its per-section status
- UnitTestInterface PR #55 — the `resources.js` migration this design follows
