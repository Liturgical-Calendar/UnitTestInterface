/**
 * WebSocket Message Types for the LiturgicalCalendar Unit Test Interface
 *
 * This module contains JSDoc typedefs for the WebSocket messages exchanged between the client and
 * the LiturgicalCalendarAPI's Health server (`LiturgicalCalendarAPI/src/Health.php`), and for a
 * couple of REST payloads the runners consume alongside them.
 *
 * These typedefs are written from the API's own published schemas — the source of truth, not this
 * file:
 *
 *   ../LiturgicalCalendarAPI/jsondata/schemas/WebSocketMessage.json  (client -> server)
 *   ../LiturgicalCalendarAPI/jsondata/schemas/WebSocketFrame.json    (server -> client)
 *
 * Where this file and those schemas disagree, the schemas win — re-derive from them rather than
 * trusting this docblock's memory of them.
 *
 * Scope: only the shapes this repository's two runners (`assets/js/index.js`, `assets/js/resources.js`)
 * actually send or read. `WebSocketMessage.json` also documents `validateCalendarLegacy` (a bare
 * string `calendar` with `category`/`responsetype`) and `executeUnitTest` (its `executeValidation`
 * counterpart, keyed by `test`) — the v1 shapes `validateCalendarTyped`/`runTest` replaced. Neither
 * runner sends them any more, so they are not typed here; see the schema directly if a v1 shape is
 * ever needed again.
 */

// =============================================================================
// Outgoing Messages (Client -> Server)
// =============================================================================

/**
 * Correlation properties any outgoing message may carry.
 *
 * `runToken` is attached automatically by `wsRunner.js`'s `sendMessage()` whenever a run is active,
 * and is required (not optional) on `cancelRun`, which is built by `sendCancelRun()` instead and
 * bypasses `sendMessage()` entirely. `requestId` is minted per request by `newRequestId()` and is
 * how a client opts into per-request correlation — a message sent without one gets frames back with
 * no `requestId` either, and no terminal `complete` frame.
 *
 * @typedef {Object} CorrelationProps
 * @property {string} [runToken] - The run this message belongs to; 1-64 chars of `[A-Za-z0-9_-]`.
 * @property {string} [requestId] - This request's own correlation id; same alphabet as `runToken`.
 * @property {1} [protocol] - Declared only once a `hello` frame has advertised protocol `1`; see
 *   {@link HelloFrame} and `negotiatedProtocol()` in `wsProtocol.js`. Never sent to a server that
 *   has not advertised it — its message schema may not declare the property, and declaring it
 *   anyway trips the same unknown-property gate `requestId` arms.
 */

/**
 * A checkable's opaque identity, as advertised by `GET /validations` and echoed back unchanged.
 * @typedef {Object} ValidationTarget
 * @property {string} id - An inventory id, e.g. `temporale:roman`, `nation:roman:IT`,
 *   `diocese:ambrosian:milano_it`, `test:roman:StIgnatiusOfLoyolaTest`. Never a filesystem path.
 */

/**
 * Validate one item from the `/validations` inventory. Replaces the v1 `executeValidation` shape
 * for everything the inventory advertises; see {@link ExecuteValidationMessage} for the one shape
 * that still uses it.
 * @typedef {CorrelationProps & Object} ValidateSourceMessage
 * @property {"validateSource"} action
 * @property {ValidationTarget} target - Carries `id` and nothing else; the server resolves the
 *   schema and the on-disk path entirely from it. `category`, `validate`, `sourceFile` and
 *   `sourceFolder` are retired on this shape (`Health::RETIRED_PROPERTIES['validateSource']`) and a
 *   message carrying any of them is refused with `retired_property`, not silently accepted.
 */

/**
 * What `executeValidation` survives the migration for: a bare API URL with no inventory id, so it
 * cannot become a {@link ValidateSourceMessage}. `resources.js`'s `resourceDataChecks` (e.g.
 * `/calendars`, `/missals`) sends these with `category: "resourceDataCheck"`; `index.js` sends
 * exactly one, its `LitCalMetadata` check against `/calendars`, with `category: "universalcalendar"`
 * instead — both categories resolve the schema from `sourceFile`, so either works for a URL, and
 * which one a given check uses is which page it lives in rather than a rule about the URL itself.
 * `category: "sourceDataCheck"` (slug-keyed source data, built from a hand-maintained `validate`
 * string) is gone from this repository along with the code that built those messages — the
 * `/validations` inventory and {@link ValidateSourceMessage} cover what it used to.
 * @typedef {CorrelationProps & Object} ExecuteValidationMessage
 * @property {"executeValidation"} action
 * @property {"universalcalendar"|"resourceDataCheck"} category
 * @property {string} validate - A display/CSS label for this check, e.g. `"calendars-path"`,
 *   `"LitCalMetadata"`.
 * @property {string} sourceFile - The absolute API URL being checked.
 * @property {"JSON"|"YML"} [responseFormat] - The representation to fetch the URL in, sent by the
 *   server as an `Accept` header. Spelled `responseFormat`, not the legacy `responsetype`, which is
 *   retired on this shape too now (API#885) and refused rather than ignored — it was accepted and
 *   never read for as long as the server honoured no format at all.
 *   **JSON and YML only, unlike {@link ValidateCalendarMessage}'s four.** `return_type` is a
 *   `CalendarParams` property and so exists only on `/calendar`; every route a resource check
 *   addresses negotiates on `Accept` alone, and all of them answer 406 to `application/xml` and
 *   `text/calendar`. Absent means JSON.
 */

/**
 * A typed calendar identity — the `calendar` property of `validateCalendar` and `runTest`. Built by
 * `toCalendarIdentity()` in `wsProtocol.js` from a `CalendarSelect` option; see that function for how
 * the library's `national`/`diocesan`/empty-option vocabulary maps onto this one.
 * @typedef {Object} CalendarIdentity
 * @property {"general"|"national"|"diocesan"|"rite"} kind - `"rite"` is the rite-level calendar
 *   (the General Roman Calendar under `rite: "roman"`, or its Ambrosian equivalent); `"general"` is
 *   declared by the schema but not produced by `toCalendarIdentity()`, which maps the calendar
 *   select's empty option to `"rite"` for both rites.
 * @property {string} [id] - The national or diocesan calendar id; absent for `"rite"`/`"general"`.
 * @property {string} rite - Always present, unlike v1's optional top-level `rite`: the typed shape
 *   makes a rite disagreement between `calendar` and the request loud instead of silently ignoring it.
 */

/**
 * Validate a calendar's generated data for one year. Replaces v1's `validateCalendar` (a bare
 * string `calendar` plus `category`/`responsetype`) — that shape still exists in the schema
 * (`validateCalendarLegacy`) but neither runner sends it any more.
 * @typedef {CorrelationProps & Object} ValidateCalendarMessage
 * @property {"validateCalendar"} action
 * @property {CalendarIdentity} calendar
 * @property {number} year
 * @property {"JSON"|"XML"|"ICS"|"YML"} responseFormat - Spelled `responseFormat`, not the legacy
 *   `responsetype`; `responsetype` is retired on this shape and refused if sent alongside it.
 *   `category` is retired too (`calendar.kind` replaces it), and `rite` is retired
 *   (`calendar.rite` replaces it).
 */

/**
 * Run one unit test against one calendar and year. Replaces v1's `executeUnitTest`
 * (`category`/`calendar` string/`test`) — also still in the schema, also unsent by either runner.
 * @typedef {CorrelationProps & Object} RunTestMessage
 * @property {"runTest"} action
 * @property {string} test - The test's identifier, e.g. `"StIgnatiusOfLoyolaTest"`.
 * @property {CalendarIdentity} calendar
 * @property {number} year
 */

/**
 * Abandon a run, dropping its queued backlog. Built by `sendCancelRun()` directly, not routed
 * through `wsRunner.js`'s `sendMessage()` — `runToken` is required here, not attached conditionally.
 * The server acknowledges by dropping the run's queued work and sends nothing back.
 * @typedef {Object} CancelRunMessage
 * @property {"cancelRun"} action
 * @property {string} runToken - The run being abandoned. Required, unlike the optional `runToken` on
 *   every other outgoing shape.
 * @property {1} [protocol]
 */

// =============================================================================
// Incoming Frames (Server -> Client)
// =============================================================================

/**
 * Correlation properties any incoming frame may carry.
 * @typedef {Object} RunCorrelation
 * @property {string} [runToken] - Present only while the connection is on a run.
 * @property {string} [runId] - The same value as `runToken`, under the protocol's newer name; both
 *   are published together during the migration to it.
 * @property {string} [requestId] - Present only when the request that caused this frame carried one.
 */

/**
 * Sent once, unprompted, immediately on connect. Carries no run correlation — deliberately, since
 * that is what keeps it invisible to a client that predates it (both runners guard their message
 * handler on `runToken` matching the active run, and an untagged frame is dropped before reaching
 * that check unless read first; see `readHello()` in `wsProtocol.js`).
 *
 * **Both** runner pages read this (`readHello()`) and store what it advertises — #69 item 1, which
 * closed a split where only `resources.js` did and `index.js` never declared `protocol` on its own
 * messages. Each calls `readHello()` as the first thing its handler does, above the run guard, and
 * `resetHello()` on close; the close half now lives once in `wsClient.js` (#69 item 2).
 * @typedef {Object} HelloFrame
 * @property {"hello"} type
 * @property {number} protocol - The highest protocol version this server reads.
 * @property {Object} capabilities
 * @property {string[]} capabilities.rites
 * @property {string[]} capabilities.actions
 * @property {string[]} capabilities.responseFormats
 * @property {string[]} capabilities.steps
 * @property {string[]} capabilities.statuses
 */

/**
 * What a step-result or terminal frame is about. An object, not a bare id, because a source check
 * is identified by its id alone, a calendar validation by a calendar and a year, and a test run by a
 * test, a calendar and a year. `null` only for a legacy `executeValidation` message, which names no id.
 * @typedef {Object} FrameTarget
 * @property {string} id
 * @property {number} [year]
 * @property {string} [calendar]
 */

/**
 * The outcome of one step of one check or test run.
 *
 * **No `test` property exists on this frame, on any frame, or anywhere in `WebSocketFrame.json`'s
 * `stepResult` definition — its declared properties are exactly `classes`, `details`, `responsetype`,
 * `status`, `step`, `target`, `text`, `type`.** The server never sends a test's name as a top-level
 * `test` field; it is `target.id`. An earlier task in this migration fixed both this repository's
 * unit-test page and its e2e stub, which had been sending a fictional `test` property and making
 * specs pass against behaviour the server does not have. Do not reintroduce it here.
 * @typedef {RunCorrelation & Object} StepResultFrame
 * @property {"success"|"error"} type - The legacy pass/fail projection of `status`; branch on
 *   `status` instead where possible.
 * @property {string} text - Human-facing message. Never a filesystem path.
 * @property {string} classes - DEPRECATED. A CSS selector the server composes for
 *   `document.querySelectorAll()`. Retained only until this repository stops reading it (#42); a new
 *   consumer must address frames by `requestId` + `step` instead, via `wsProtocol.js`'s
 *   `createRequestRegistry()`, and must not parse this.
 * @property {string} [responsetype] - DEPRECATED, carried only on calendar-validation failure
 *   frames, for the same reason as `classes`. The v2 outgoing shape spells this `responseFormat`.
 * @property {?FrameTarget} target
 * @property {"exists"|"parses"|"validates"} step - A **check** (source-data or calendar) reports
 *   `exists`/`parses`/`validates` on cards classed `step-exists`/`step-parses`/`step-validates`
 *   (`STEP_CARD_CLASS` in `wsProtocol.js`). A **test run** reports only `validates`, on a card
 *   classed `step-test-validates` instead (`TEST_RUN_STEP_CARD_CLASS`) — the same step name addresses
 *   a different card family depending on which kind of request produced the frame. Those classes name
 *   the step only; the verdict is this frame's `status`, never the class (#60).
 * @property {"pass"|"fail"} status
 * @property {string[]} [details] - Individual failures behind a summarising `text`. Absent, not
 *   empty, when there are none.
 */

/**
 * The terminal frame: the work one request started has finished. Sent only to a request that
 * carried a `requestId` — a phase now ends on this frame per request rather than on a hardcoded
 * frame count, which is why phase completion is no longer `checks * 3`/`>= 3` arithmetic anywhere in
 * this repository. Pair stopping on it with a watchdog (`createSilenceWatchdog()` in
 * `wsProtocol.js`): a throw inside the server's fulfil handler can still skip it (API issue #823).
 * @typedef {RunCorrelation & Object} CompleteFrame
 * @property {"success"} type - Always `success`, even when every step of the request failed: this
 *   frame reports that the work finished, not that it passed.
 * @property {string} text
 * @property {?FrameTarget} target
 * @property {"complete"} step
 * @property {string} requestId - Required on this frame (unlike the optional `requestId` on
 *   `RunCorrelation` generally) — a `complete` frame with nothing to correlate would be unusable.
 * @property {true} [cancelled] - Present only when the request ended because its run was abandoned
 *   or superseded, not because the work finished. Omitted, not sent `false`, on a normal completion.
 */

/**
 * The message could not be acted on.
 * @typedef {RunCorrelation & Object} ProtocolErrorFrame
 * @property {"protocolError"} type
 * @property {"invalid_json"|"not_an_object"|"missing_action"|"unknown_action"|"invalid_request_id"|
 *   "retired_property"|"unknown_target_id"|"invalid_message"|"internal_error"|"unsupported_protocol"} errorCode
 * @property {string} text - Phrased for the client that sent the message; never this server's
 *   schema internals or filesystem paths.
 */

// =============================================================================
// REST Data Types
// =============================================================================

/**
 * One entry from `GET /validations` — the checkable inventory that replaced hardcoding the API's
 * on-disk layout in this repository (`UNIVERSAL_CHECKS`, deleted). See `fetchValidations()` and
 * `validationChecksForRite()` in `wsProtocol.js`.
 * @typedef {Object} ValidationInventoryItem
 * @property {string} id - The opaque id sent back verbatim in {@link ValidationTarget}.
 * @property {string} kind
 * @property {string} rite - Absent-means-Roman elsewhere in this codebase; here it is always present.
 * @property {?string} region
 * @property {string} label
 * @property {string} schema
 * @property {string[]} steps - The exact steps this item's checks will report; a check advertising
 *   none falls back to every step in `STEP_CARD_CLASS`.
 */

/**
 * Roman Missal definition from the `/missals` API endpoint.
 * @typedef {Object} RomanMissalDefinition
 * @property {string} missal_id - e.g. `"EDITIO_TYPICA_1970"`, `"IT_1983"`.
 * @property {string} name
 * @property {string} region - `"VA"` means editio typica.
 * @property {number} year_published
 * @property {string} api_path - URL, not a filesystem path; not used for source validation.
 */

// Export empty object to make this a valid ES6 module.
// The typedefs are available via JSDoc imports: @typedef {import('./types.js').TypeName}
export {};
