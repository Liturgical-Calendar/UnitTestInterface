# Persist Test Run Results as Server-Side JSON Files

**Issue:** [#30](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/30)
**Date:** 2026-07-03
**Status:** Approved design

## Summary

Store the results of each completed test run as a JSON file on the server so that any
authenticated user can browse and replay past runs without re-executing tests. Two test
pages persist results: **Calendars** (`index.php`) and **Resources** (`resources.php`).

## Goals

- Persist every completed run automatically, keyed by timestamp.
- Let an authenticated user browse past runs and load one to repopulate the dashboard
  (card colors, counters, timers) without re-running or re-fetching the API.
- Keep storage bounded (no unbounded file growth) with zero operational overhead.

## Non-Goals

- No per-user ownership or visibility scoping — all authenticated users see all runs.
- No database — flat JSON files are sufficient.
- No unified cross-page browse view in this iteration — each page browses its own run type.
- No manual purge UI in this iteration (retention is automatic; a manual purge remains a
  possible future addition).

## Design Decisions (confirmed)

| Decision     | Choice                                                                                                 |
|--------------|--------------------------------------------------------------------------------------------------------|
| Replay model | **Semantic rebuild** from self-contained stored descriptors (no live API re-fetch)                     |
| Save trigger | **Auto-save** on run completion + **retention cap** (keep last 50 per run type)                        |
| Browse UI    | **Per-page dropdown** — `index.php` browses `calendars` runs, `resources.php` browses `resources` runs |
| Auth         | **Authenticated only** — save, list, and load all require a valid JWT                                  |

## Architecture

### Endpoint: `results.php`

A single flat-file PHP endpoint (matching the existing `index.php` / `admin.php` /
`resources.php` convention), gated by `JwtAuth::isAuthenticated()`. Unauthenticated
requests receive `401`.

| Request                       | Action                                 | Response                                                                      |
|-------------------------------|----------------------------------------|-------------------------------------------------------------------------------|
| `POST results.php`            | Save a completed run (body = run JSON) | `{ "ok": true, "file": "<name>.json" }`                                       |
| `GET results.php`             | List stored runs — metadata only       | `[{ file, timestamp, runType, calendar, responseType, counts, duration }, …]` |
| `GET results.php?file=<name>` | Load one run — full JSON               | the stored run object                                                         |

**Storage:** `results/*.json`, added to `.gitignore`. Filenames are timestamp-based
(`2026-07-03T14-30-00Z.json`) so the filesystem sorts them chronologically.

**Security:**

- The `file` query/param is validated against `^[0-9T\-Z]+\.json$` and additionally passed
  through `basename()` before being joined to the results directory — rejecting any path
  traversal attempt.
- Request body is size-limited and `json_decode`d with error checking; malformed or
  oversized bodies are rejected with `400`.
- On `POST`, the server validates required envelope fields (`schemaVersion`, `timestamp`,
  `runType` in {`calendars`,`resources`}, `duration`, `counts`) before writing.

**Retention:** after a successful save, the endpoint lists files of the same `runType`,
sorts by name (chronological), and deletes the oldest beyond the newest **50**.

### Data model

Each file is **self-contained** — it stores card *descriptors*, not references to live API
data, so a past run always reflects state at run time and replays even if the API catalog
later changes.

Shared envelope:

```json
{
  "schemaVersion": 1,
  "timestamp": "2026-07-03T14:30:00Z",
  "runType": "calendars",
  "duration": 48213,
  "counts": { "successful": 512, "failed": 3 }
}
```

A single result **descriptor** has the shape:

```json
{
  "id": "schema-valid-va-2030",
  "label": "Schema valid — 2030",
  "status": "success",
  "message": null,
  "duration": 42,
  "group": "2030"
}
```

- `id` — stable card identifier (slugified class / card id used for DOM targeting).
- `label` — human-readable card title captured at run time.
- `status` — `"success"` | `"error"`.
- `message` — error text (from the WS `text` field) when `status === "error"`, else `null`.
- `duration` — per-card time in ms where available, else `null`.
- `group` — grouping key: a year (calendar data), a unit-test name, an endpoint, or a
  source-file category, depending on phase.

**Calendars run** (`runType: "calendars"`) adds:

- `calendar` — e.g. `VA`, `IT`, diocesan calendar id.
- `calendarCategory` — `nationalcalendar` | `diocesancalendar`.
- `responseType` — `JSON` | `XML` | `ICS` | `YML`.
- `sourceDataResults` — descriptor[] (source data validation phase).
- `calendarDataResults` — descriptor[] (per-year calendar validation phase).
- `unitTestResults` — descriptor[] (specific unit tests phase).
- `timings` — `{ sourceData, calendarData, unitTests }` per-phase totals in ms.

**Resources run** (`runType: "resources"`) adds:

- `apiPathResults` — descriptor[] (API path validation).
- `sourceDataResults` — descriptor[] (missals, wider regions, national/diocesan calendars,
  decree translations).

The stored counts and timings mirror what the dashboard displays live, so replay can set
the counters and timers directly rather than recomputing them.

### Client changes (`assets/js/index.js`, `assets/js/resources.js`)

1. **Collect.** Introduce an in-memory `runResults` accumulator. As each WebSocket message
   is handled (the existing success/error branches), in addition to painting the DOM, push
   a descriptor into the accumulator under the current phase. This is additive — live
   behavior is unchanged.

2. **Save.** At `TestState.JobsFinished` (and the Resources-page equivalent), assemble the
   envelope + phase arrays + counts + timings and `POST` it to `results.php`. Fire-and-forget
   with a success/failure toast; a failed save never blocks the UI.

3. **Browse.** Add a "Past runs" dropdown in each page header, populated on load from
   `GET results.php`. Each option shows timestamp + calendar/type + `✓successful / ✗failed`.

4. **Replay.** Selecting a past run fetches the full JSON and enters **replay mode**:
   - Rebuild the phase card scaffolding from stored descriptors.
   - Paint each card's success/error state (and error tooltip from `message`).
   - Set counters and phase timers from the stored counts/timings.
   - No WebSocket traffic and no API fetch occur.
   - The run button is disabled while viewing history; a "Live" / reset control returns the
     page to its normal ready state.

**Live/replay divergence.** To keep replayed cards visually identical to live cards, extract
a small shared per-phase **card-render helper** where the current builders make that feasible.
Where an existing builder is too entangled to refactor safely in this iteration, replay uses
a focused renderer that emits the same markup; unifying it is recorded as a follow-up cleanup
rather than a blocking prerequisite.

## Error Handling

- **Endpoint:** unauthenticated → `401`; invalid/oversized body → `400`; invalid `file`
  param → `400`; unknown file → `404`; write/prune failure → `500` with a logged reason
  (via the existing Monolog logger). No error is silently swallowed.
- **Client save:** network/HTTP failure surfaces a warning toast; the completed run remains
  visible on screen even if it wasn't persisted.
- **Client replay:** a malformed or missing stored file surfaces an error toast and leaves
  the dashboard in its current state.

## Testing

- **PHP endpoint** (input-level checks): auth required; path-traversal `file` rejected;
  malformed/oversized body rejected; retention prunes to 50 per type; list returns metadata
  only.
- **Playwright e2e** (`e2e/`): completing a run POSTs a file; the browse dropdown lists it;
  selecting it enters replay mode and repaints cards, counters, and timers without a
  WebSocket run.

## Implementation Steps

1. Add `results/` to `.gitignore` and create the directory (with a tracked `.gitkeep`).
2. Implement `results.php` (auth gate, POST save + validation + retention, GET list, GET
   load) with path-traversal-safe file handling.
3. Add the `runResults` accumulator + descriptor collection to `index.js` and `resources.js`.
4. Add auto-save POST at run completion for both pages.
5. Add the "Past runs" dropdown + replay mode (card rebuild, counters, timers) to both pages.
6. Extract/settle the shared card-render helper where feasible.
7. Add PHP input-validation tests and Playwright e2e coverage.
8. Add any new user-facing strings to the i18n catalog.

## Open Follow-Ups (out of scope)

- Unified cross-page browse view with a run-type filter.
- Manual purge action in the admin interface.
- Unifying live and replay rendering fully if the shared helper couldn't cover every phase.
