/**
 * Shared helpers for the Health WebSocket protocol.
 *
 * `index.js` and `resources.js` used to be two independent implementations of the same protocol, and had
 * drifted apart in ways that cost debugging sessions — different state names, different runToken guards,
 * two vocabularies for the same file (see #42). That drift is what #42 closed: both runners now drive their
 * phases through the shared `createPhaseRunner()` in `wsRunner.js`. New protocol behaviour lands here so
 * both runners keep sharing one definition rather than reacquiring a thing to keep in lockstep.
 * @module wsProtocol
 */

/**
 * Tell the server a run is abandoned, so it stops draining a backlog nobody is watching.
 *
 * Silent on the wire: the server acknowledges by dropping the run's queued requests and sends nothing back
 * (LiturgicalCalendarAPI#806 section H).
 *
 * Call this *before* clearing the run token — the cancel has to name the run it is stopping, and the server
 * ignores a cancel that names a run the connection is no longer on.
 *
 * @param {WebSocket} conn - The connection the run was started on.
 * @param {?string} runToken - The run being abandoned; the same token its requests carried.
 * @returns {boolean} true when a cancel was sent, false when there was nothing to send it on or about.
 */
export const sendCancelRun = ( conn, runToken ) => {
    if ( !conn || conn.readyState !== WebSocket.OPEN ) {
        return false;
    }
    if ( typeof runToken !== 'string' || runToken === '' ) {
        return false;
    }
    conn.send( JSON.stringify( { action: 'cancelRun', runToken } ) );
    return true;
};


/**
 * Whether a rite-tagged item belongs to the selected rite.
 *
 * An absent `rite` means Roman, never "applies to every rite". Everything in this interface
 * predates the rite dimension and was Roman by construction, so treating an absent value as a
 * wildcard would be a fail-open filter — it would show Roman-only items under the Ambrosian rite,
 * where the API rejects several of them outright.
 *
 * @param {{rite?: string}} item - Any object carrying an optional `rite`.
 * @param {string} rite - The selected rite.
 * @returns {boolean}
 */
export const inRiteScope = ( item, rite ) => ( item?.rite ?? 'roman' ) === rite;

/**
 * The bound used when the library's `RiteProperties` is unavailable.
 *
 * Reached only when `@liturgical-calendar/components-js` failed to load — a CDN or network failure,
 * which `mountCalendarControls()` already reports through the `#controls-load-failed` toast. In that
 * state there is no rite select to change either, so the rite is still the default Roman and 1970 is
 * the right answer rather than a guess. It is not a second copy of the per-rite table: there is no
 * table here to drift.
 *
 * @type {number}
 */
const FALLBACK_YEAR_LOWER_BOUND = 1970;

/**
 * The earliest year the API will calculate a calendar for, under a given rite.
 *
 * Read from `RiteProperties` in `@liturgical-calendar/components-js`, which already mirrors the API's
 * `CalendarParams::YEAR_LOWER_LIMIT` (1970) and `AMBROSIAN_YEAR_LOWER_LIMIT` (1976), is covered by
 * that package's own tests, and is the same table the rite select is built from — so any rite the
 * user can select is a rite this can answer for. Taking it from there rather than restating it here
 * keeps one copy per repository instead of two, and means a new rite arrives with its bound already
 * attached. (LiturgicalCalendarAPI#867 would let the library itself stop hardcoding it, at which
 * point this call site does not change.)
 *
 * What getting it wrong costs, stated against the *current* API. `/calendar/ambrosian/1975` answers
 * `400`, and `Health::validateCalendar()` now checks the status and reports all three steps failed
 * with the problem document's `detail` (API commit 9d3fae2c, "a URL check must not report exists for
 * a 4xx or 5xx"). The frame count per year is therefore still three — `sendComplete()` returns early
 * without a `requestId`, and this page sends none — so the phase completes and the run advances.
 *
 * So the cost is six red cards, six requests the rite can never satisfy, and six charges against the
 * API's rate-limit budget, per Ambrosian run. Worth avoiding, but not fatal.
 *
 * #52 described something worse — a wrong-green `exists`, a misleading "perhaps truncated?" and a
 * missing third frame that left the phase permanently one frame short of its target. That was true
 * when the issue was written and is fixed upstream now. Do not reintroduce it as live justification.
 *
 * @param {string} rite - The selected rite.
 * @param {?Object<string, {minYear: number}>} riteProperties - The library's `RiteProperties`, or null before it loads.
 * @returns {number} The earliest year to request for that rite.
 */
export const yearLowerBoundForRite = ( rite, riteProperties ) => {
    const minYear = riteProperties?.[ rite ]?.minYear;
    if ( Number.isInteger( minYear ) ) {
        return minYear;
    }
    console.warn( `No RiteProperties entry for rite '${rite}'; falling back to ${FALLBACK_YEAR_LOWER_BOUND}. Expected only when components-js failed to load.` );
    return FALLBACK_YEAR_LOWER_BOUND;
};

/**
 * The years to request calendar data for under a given rite, ascending.
 *
 * @param {string} rite - The selected rite.
 * @param {number} upperBound - The last year to request, inclusive.
 * @param {?Object<string, {minYear: number}>} riteProperties - The library's `RiteProperties`, or null before it loads.
 * @returns {Array<number>} A fresh array; empty when the bound excludes every year.
 */
export const yearsForRite = ( rite, upperBound, riteProperties ) => {
    const years = [];
    for ( let year = yearLowerBoundForRite( rite, riteProperties ); year <= upperBound; year++ ) {
        years.push( year );
    }
    return years;
};

/**
 * The CSS class a checkable's cards carry, derived from its inventory id.
 *
 * **Not `slugify()`.** That helper strips every character outside `[a-z0-9-_]` rather than replacing
 * it, so an inventory id — which is colon-separated — collapses into an unreadable run:
 * `nation:roman:IT` becomes `nationromanit`, and `test:roman:StIgnatiusOfLoyolaTest` loses every
 * boundary it had. The rule here is the API's own, published in its section B design and
 * implemented server-side in `Health::cssClassFragmentForId()`: replace every character outside
 * `[A-Za-z0-9_-]` with `-`, and nothing else.
 *
 * Lowercased on top of that, because these are CSS class names and this repository writes them
 * lowercase; the server's own fragment keeps its case. That divergence costs nothing while the two
 * addressing schemes are independent — this page attributes frames by `requestId`, never by the
 * class the server composes — and it is written down here so it is not mistaken for a bug later.
 *
 * @param {string} id - An inventory id, e.g. `sanctorale:ambrosian:2024`.
 * @returns {string}
 */
export const idToCardClass = ( id ) => id.replace( /[^A-Za-z0-9_-]/g, '-' ).toLowerCase();

/**
 * The advertised checkables belonging to one rite, as this page's check objects.
 *
 * Replaces `UNIVERSAL_CHECKS`, a hand-written list of repo-relative paths into the API — the last
 * copy of the API's on-disk layout in this repository, and the one #38 (paths moved under
 * `rite/roman/`), API#795 (a third copy in `.vscode` matching nothing) and API#800 (Ambrosian data
 * no client listed) all came from. The server now advertises what it can check and the client sends
 * back an opaque id, so no filesystem path crosses the wire and there is nothing left to keep in
 * lockstep.
 *
 * The inventory carries every tier — temporale, sanctorale, decrees, wider regions, nations,
 * dioceses and tests — so this is the whole source-data list, not merely the universal head of it.
 *
 * @param {Array<{id: string, rite: string, label: string, steps: Array<string>}>} inventory - As served by `/validations`.
 * @param {string} rite - The selected rite.
 * @returns {Array<object>} A fresh array of check objects.
 */
export const validationChecksForRite = ( inventory, rite ) =>
    inventory
        .filter( item => inRiteScope( item, rite ) )
        .map( item => ( { id: item.id, label: item.label, steps: item.steps, rite: item.rite } ) );

/**
 * The typed calendar identity the v2 `validateCalendar` and `runTest` messages carry.
 *
 * The library speaks `national` / `diocesan` and represents the rite-level calendar as its empty
 * option; the WebSocket protocol speaks a typed `{kind, id?, rite}` shape and names the rite-level
 * calendar explicitly. This is the only place the two meet.
 *
 * The empty option maps to `{kind: 'rite', rite}` for both rites. The server rejects `category` on
 * this typed shape outright (`Health::RETIRED_PROPERTIES`), so `calendar.kind` is the discriminator.
 *
 * Throws on an unrecognised type rather than composing a partial message: a message the server
 * rejects costs a red card and a rate-limit charge, and says nothing useful about which of our call
 * sites was wrong.
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

/**
 * The calendar-scope keys a test's `applies_to` / `appliesTo` / `filter` may carry, in the order
 * they are checked.
 *
 * `rite` is deliberately excluded: since API #785 it is a separate dimension present on every
 * scope object, not one of the mutually exclusive calendar-identity keys. Selecting the key
 * explicitly — rather than by `Object.keys(...).length` or `[0]` — avoids depending on key count
 * or key order, both of which broke once already when `rite` became a sibling required property.
 *
 * @type {ReadonlyArray<string>}
 */
export const CALENDAR_SCOPE_KEYS = Object.freeze([
    'national_calendar',
    'national_calendars',
    'diocesan_calendar',
    'diocesan_calendars'
]);

/**
 * Whether a unit test belongs to the given liturgical rite.
 *
 * Kept out of the calendar-scope handling for the reason {@link CALENDAR_SCOPE_KEYS} gives: a
 * rite-only scope such as `{ "rite": "ambrosian" }` carries no calendar identity at all, so it
 * would fall through the calendar-scope switch and be kept for every calendar. Handled here, it
 * correctly restricts the test to its own rite.
 *
 * @param {Object} unitTest - The unit test definition.
 * @param {string} rite - The selected rite.
 * @returns {boolean}
 */
export const testAppliesToRite = ( unitTest, rite ) =>
    inRiteScope( unitTest.applies_to ?? unitTest.appliesTo ?? {}, rite );

/**
 * The self-describing contract this client speaks — LiturgicalCalendarAPI#806.
 *
 * Declared on a message only when the server's `hello` frame says it reads this version; see
 * {@link negotiatedProtocol}. `1` is the new contract and an *absent* `protocol` is the legacy one,
 * which is the API issue's own numbering rather than a version bump.
 *
 * @type {number}
 */
export const PROTOCOL_VERSION = 1;

/**
 * The card class each published step is reported on, per frame family.
 *
 * Mirrors the server's `FrameFamily::CLASS_FOR_STEP`. The families matter because `validates` means a
 * different card in each: `schema-valid` for a file or a calendar, `test-valid` for a test run. A
 * single flat map cannot express that, and silently painted test results onto nothing.
 *
 * `complete` is absent on purpose — the terminal frame addresses no card.
 *
 * @type {Readonly<Record<string, string>>}
 */
export const STEP_CARD_CLASS = Object.freeze({
    exists: 'file-exists',
    parses: 'json-valid',
    validates: 'schema-valid'
});

/**
 * The card class a *test run's* `validates` step is reported on. A check and a calendar validation
 * report three steps through {@link STEP_CARD_CLASS}; a test run reports exactly one, `validates`,
 * addressed at a different card (`test-valid`) than the other two families use for the same step
 * name. Consumed by `index.js`'s specific-unit-test phase (commit 163c8c0).
 *
 * @type {Readonly<Record<string, string>>}
 */
export const TEST_RUN_STEP_CARD_CLASS = Object.freeze({
    validates: 'test-valid'
});

/**
 * The capabilities the server advertised on connect, or null before a `hello` frame has arrived.
 *
 * Module state rather than a parameter threaded through every send, because it is a property of the
 * connection and every caller would otherwise carry it for the one place that reads it.
 *
 * @type {?object}
 */
let helloCapabilities = null;

/**
 * The protocol version the server said it reads, or null if it never said.
 * @type {?number}
 */
let serverProtocol = null;

/**
 * Read a server `hello` frame, remembering what it advertised.
 *
 * Returns false for anything that is not one, so a caller can use it as the first branch of its
 * message handler without pre-testing the type.
 *
 * **This must be called before the run-token guard, not after it.** A `hello` carries no run token —
 * deliberately, since that is what makes it invisible to a client that predates it — so the guard
 * every runner opens with (`responseData.runToken !== currentRunToken`) discards it. A handler that
 * checks for `hello` below that guard would never see one.
 *
 * @param {object} frame - A parsed inbound frame.
 * @returns {boolean} true when the frame was a `hello` and has been consumed.
 */
export const readHello = ( frame ) => {
    if ( null === frame || 'object' !== typeof frame || frame.type !== 'hello' ) {
        return false;
    }
    serverProtocol = Number.isInteger( frame.protocol ) ? frame.protocol : null;
    helloCapabilities = ( frame.capabilities && 'object' === typeof frame.capabilities ) ? frame.capabilities : null;
    console.info( `Server speaks protocol ${serverProtocol}.`, helloCapabilities );
    return true;
};

/**
 * Forget what the last connection advertised. Call on close, so a reconnection to a different
 * server vintage is not answered with the previous one's capabilities.
 * @returns {void}
 */
export const resetHello = () => {
    helloCapabilities = null;
    serverProtocol = null;
};

/**
 * The protocol version to declare on outbound messages, or null to declare none.
 *
 * Null until a `hello` arrives, and null for ever against a server that predates the handshake —
 * which is the point of having one. A server without LiturgicalCalendarAPI#863 does not declare
 * `protocol` in its message schema, and its unknown-property gate is armed by the `requestId` this
 * client now sends, so declaring a version it never advertised would get every message refused.
 *
 * @returns {?number}
 */
export const negotiatedProtocol = () => ( serverProtocol === PROTOCOL_VERSION ? PROTOCOL_VERSION : null );

/**
 * The advertised capabilities, or null before `hello`.
 * @returns {?object}
 */
export const capabilities = () => helloCapabilities;

/**
 * Counter behind the {@link newRequestId} fallback, for contexts without `crypto.randomUUID`.
 * @type {number}
 */
let requestSequence = 0;

/**
 * Mint a correlation id for one request.
 *
 * The alphabet is not free: the server accepts `^[A-Za-z0-9_-]{1,64}$` for `requestId` and
 * `runToken` alike, and refuses anything else outright rather than echoing junk onto every frame of
 * a run. `crypto.randomUUID()` satisfies it (hyphens are in the set); the counter fallback covers
 * insecure contexts, where `crypto.randomUUID` is undefined.
 *
 * @returns {string}
 */
export const newRequestId = () => {
    if ( typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ) {
        return crypto.randomUUID();
    }
    return `req-${ ++requestSequence }-${ Math.random().toString( 36 ).slice( 2, 10 ) }`;
};

/**
 * A `requestId` -> cards registry, built as the cards are rendered.
 *
 * This replaces the server telling the client which DOM nodes to paint. Until
 * LiturgicalCalendarAPI#806 section C a frame's only statement of its subject was `classes`, a CSS
 * selector the server composed and the browser fed to `querySelectorAll()` — so this API was coupled
 * to one client's markup, renaming a card class was a breaking change in another repository, and a
 * selector that matched nothing failed *silently* while the counters advanced anyway, leaving the
 * totals badge and the painted cards disagreeing with no diagnostic.
 *
 * A registry inverts that: the client decides what a request's frames address, and a frame naming a
 * request nobody registered is a loud, specific failure rather than an empty NodeList.
 *
 * @returns {{register: Function, markReceived: Function, missingSteps: Function, cardFor: Function, complete: Function, outstanding: Function, has: Function, forget: Function, reset: Function}}
 */
export const createRequestRegistry = () => {
    /** @type {Map<string, {cards: Record<string, Element>, done: boolean}>} */
    const entries = new Map();

    return {
        /**
         * Bind a request to the cards its step frames will paint.
         * @param {string} requestId
         * @param {Record<string, Element>} cards - Step name -> card element.
         */
        register( requestId, cards ) {
            entries.set( requestId, { cards, done: false, received: new Set() } );
        },

        /**
         * Record that a step's result arrived and its card was painted.
         *
         * Tracked because "this request never finished" and "this request never answered" are
         * different failures with different arithmetic. See {@link missingSteps}.
         *
         * @param {string} requestId
         * @param {string} step
         * @returns {void}
         */
        markReceived( requestId, step ) {
            entries.get( requestId )?.received.add( step );
        },

        /**
         * The registered steps of a request whose results never arrived.
         *
         * This is the number of cards left grey, which is what makes it the right thing to count
         * when a phase is abandoned: the totals badge and the rendered cards have to agree, and a
         * request that answered nothing left three cards unpainted, not one.
         *
         * An **empty** array from a request that never reported completion is the other case
         * entirely — every step arrived and every card is painted, and only the terminal frame is
         * missing (LiturgicalCalendarAPI#823). Counting a failure for that would inflate the totals
         * past the cards, which is the same drift in the other direction.
         *
         * @param {string} requestId
         * @returns {Array<string>}
         */
        missingSteps( requestId ) {
            const entry = entries.get( requestId );
            if ( undefined === entry ) {
                return [];
            }
            return Object.keys( entry.cards ).filter( step => !entry.received.has( step ) );
        },

        /**
         * The card one frame addresses, or null when nothing is registered for it.
         * @param {string} requestId
         * @param {string} step
         * @returns {?Element}
         */
        cardFor( requestId, step ) {
            return entries.get( requestId )?.cards[ step ] ?? null;
        },

        /**
         * Mark a request finished. Idempotent: a duplicated terminal frame must not make the phase
         * think one more request finished than it started, which is the miscount the frame counting
         * this replaces had to tolerate with `>=`.
         * @param {string} requestId
         * @returns {boolean} true when this call was the one that finished it.
         */
        complete( requestId ) {
            const entry = entries.get( requestId );
            if ( undefined === entry || entry.done ) {
                return false;
            }
            entry.done = true;
            return true;
        },

        /** @returns {Array<string>} The request ids that have not reported completion. */
        outstanding() {
            return [ ...entries.entries() ].filter( ( [ , entry ] ) => !entry.done ).map( ( [ id ] ) => id );
        },

        /** @param {string} requestId @returns {boolean} */
        has( requestId ) {
            return entries.has( requestId );
        },

        /**
         * Drop one request's binding, for a request nobody is waiting for any more.
         *
         * Called when a phase is given up on (#64). Clearing the outstanding set alone left the
         * abandoned ids still bound to their cards, so a server that was merely quiet for longer
         * than the watchdog's window and then recovered still painted the abandoned phase's cards —
         * steps already counted as failures by `summariseAbandoned()`, now counted a second time
         * against whichever phase is current by then. Forgetting the binding sends such a frame down
         * the "no card is registered for this request" branch instead, which says so loudly.
         *
         * @param {string} requestId
         * @returns {boolean} true when a binding was actually dropped.
         */
        forget( requestId ) {
            return entries.delete( requestId );
        },

        /** Drop every binding, for a new run. */
        reset() {
            entries.clear();
        }
    };
};

/**
 * Fetch the inventory of source data the API can validate — LiturgicalCalendarAPI#806 section A.
 *
 * This is what replaces hardcoding the API's on-disk layout in this repository. The client sends
 * back an opaque `id` and no filesystem path ever crosses the wire again, which is the whole class
 * of lockstep breakage behind #38, API#795 and API#800.
 *
 * @param {string} baseUrl - The API root, e.g. `https://litcal.example/api/dev`.
 * @returns {Promise<Array<{id: string, kind: string, rite: string, region: ?string, label: string, schema: string, steps: Array<string>}>>}
 */
export const fetchValidations = async ( baseUrl ) => {
    const response = await fetch( `${baseUrl}/validations`, { headers: { Accept: 'application/json' } } );
    if ( false === response.ok ) {
        throw new Error( `Could not read the validations inventory: ${response.status} ${response.statusText}` );
    }
    const payload = await response.json();
    if ( false === Array.isArray( payload?.litcal_validations ) ) {
        throw new Error( 'The validations inventory did not contain a litcal_validations array.' );
    }
    return payload.litcal_validations;
};

/**
 * A clock that fires when the server has gone quiet.
 *
 * Stopping on the terminal `complete` frame is what lets a client delete the hardcoded step count,
 * but it trades one failure mode for another: a request that never reports completion hangs its
 * phase for ever, where counting frames would eventually have overshot its way past it. The server
 * has a hole of exactly that shape — a throw inside a promise's fulfil handler skips the terminal
 * frame (LiturgicalCalendarAPI#823) — and the published contract says in as many words to pair
 * stopping on `complete` with a timeout.
 *
 * **It measures silence, not duration.** `restart()` is called for every frame of a run, so a slow
 * check is covered by its neighbours' frames and this only fires when the server has genuinely
 * stopped answering. A phase-duration timer would instead punish a large run for being large.
 *
 * Lives here rather than in one runner because `index.js` inherits the same trade the moment it
 * stops counting frames, and a watchdog implemented twice is how `index.js` and `resources.js` came
 * to disagree about everything else (#42).
 *
 * @param {number} timeoutMs - How long a silence may last.
 * @param {Function} onSilence - Called once when it lasts longer.
 * @returns {{restart: Function, clear: Function, isRunning: Function}}
 */
export const createSilenceWatchdog = ( timeoutMs, onSilence ) => {
    /** @type {?number} */
    let timer = null;

    const clear = () => {
        if ( null !== timer ) {
            clearTimeout( timer );
            timer = null;
        }
    };

    return {
        /**
         * Start, or restart, the clock. Call for every frame.
         * @returns {void}
         */
        restart() {
            clear();
            timer = setTimeout( () => {
                timer = null;
                onSilence();
            }, timeoutMs );
        },
        clear,
        /** @returns {boolean} Whether a silence is currently being timed. */
        isRunning: () => null !== timer
    };
};

/**
 * Split abandoned requests into the two things going wrong, which need different arithmetic.
 *
 * When a phase is given up on, each outstanding request is in one of two states, and treating them
 * alike gets the totals wrong in opposite directions:
 *
 * - **Steps missing.** Its cards are still grey. Each unpainted card must be counted as a failure,
 *   or the totals badge reads lower than the number of cards on the page — the drift #42 exists to
 *   remove, arrived at from the results side.
 * - **Only the terminal frame missing.** Every step arrived and every card is painted; the counters
 *   are already correct. This is a *transport* failure, not a check failure — precisely the shape of
 *   LiturgicalCalendarAPI#823, where a throw inside a promise's fulfil handler skips `sendComplete()`
 *   after the work itself succeeded. Counting it would inflate the totals past the cards.
 *
 * @param {{missingSteps: Function}} registry - The request registry.
 * @param {Iterable<string>} requestIds - The requests still outstanding.
 * @returns {{unpaintedSteps: number, incomplete: Array<string>, silent: Array<string>}}
 *          `unpaintedSteps` is how many failures to count; `incomplete` are the requests that
 *          answered nothing or only partly; `silent` are those that answered fully but never ended.
 */
export const summariseAbandoned = ( registry, requestIds ) => {
    const incomplete = [];
    const silent = [];
    let unpaintedSteps = 0;

    for ( const requestId of requestIds ) {
        const missing = registry.missingSteps( requestId );
        if ( 0 === missing.length ) {
            silent.push( requestId );
            continue;
        }
        incomplete.push( requestId );
        unpaintedSteps += missing.length;
    }

    return { unpaintedSteps, incomplete, silent };
};

/**
 * The `/validations` inventory ids a calendar's source-data phase checks.
 *
 * Replaces the slug-and-path construction this repository used to do — `wider-region-Europe` with a
 * bare `sourceFile`, `proprium-de-sanctis-IT-1983` derived from missal metadata, and repo-relative
 * paths into the API for the universal corpus. The server advertises these ids; nothing here knows
 * where any of it lives on disk, which is the whole of #42.
 *
 * **Two rites, not one.** `rite` selects the *universal corpus* — for `'roman'` that is the
 * temporale and decrees, each with its `:i18n` translation folder; for any other rite (currently
 * only `'ambrosian'`) it is that rite's own temporale and sanctorale, each with its `:i18n` folder,
 * and no decrees (v1 never checked `MemorialsFromDecrees`, a Roman-only file, under Ambrosian).
 * `dioceseRite` separately qualifies the diocese id, because it can disagree with `rite`: a national
 * or diocesan calendar's universal corpus is always Roman — a national calendar is Roman by
 * definition, and an Ambrosian diocese still inherits the Roman national calendar of its nation
 * (a pre-existing behaviour and a pre-existing open design question, preserved here deliberately and
 * not resolved) — while the diocese's *own* id must be qualified by its actual rite, e.g.
 * `diocese:ambrosian:milano_it`; there is no `diocese:roman:milano_it`. A rite-level calendar has no
 * diocese id, so there `rite` and `dioceseRite` are simply the same selected rite. The wider-region,
 * nation and missal tiers stay hardcoded Roman regardless of either argument, for the same
 * inheritance reason.
 *
 * `:i18n` ids ARE included for the universal corpus, matching what this repository already checked
 * before this migration (`UNIVERSAL_CHECKS` in this file). They are NOT included for the
 * calendar-specific tier (wider region, nation, missals, diocese) — v1 never checked those either.
 * Coverage is held constant across the migration; a change in card counts is a migration bug, not
 * intended new coverage. See issue #61 for the follow-up that would add calendar-specific i18n
 * coverage as new scope, deliberately out of bounds here.
 *
 * @param {object} scope
 * @param {string} scope.rite - The rite whose universal corpus (temporale/decrees or
 *   temporale/sanctorale) is checked.
 * @param {string} scope.dioceseRite - The rite that qualifies `scope.dioceseId`. Equal to `scope.rite`
 *   for a rite-level calendar; always the calendar's own rite (which may differ from `scope.rite`)
 *   for a diocesan calendar.
 * @param {?string} scope.nation - The nation code, or null for a rite-level calendar.
 * @param {?string} scope.widerRegion - The nation's wider region, or null.
 * @param {Array<string>} scope.missals - The nation's missal ids, e.g. `['IT_1983']`.
 * @param {?string} scope.dioceseId - The diocese calendar id, or null when not a diocesan calendar.
 * @returns {Array<string>}
 */
export const inventoryIdsForCalendar = ( { rite, dioceseRite, nation, widerRegion, missals, dioceseId } ) => {
    const ids = 'roman' === rite
        ? [ 'temporale:roman', 'temporale:roman:i18n', 'decrees:roman', 'decrees:roman:i18n' ]
        : [ `temporale:${rite}`, `temporale:${rite}:i18n`, `sanctorale:${rite}`, `sanctorale:${rite}:i18n` ];
    if ( widerRegion ) {
        ids.push( `widerregion:roman:${widerRegion}` );
    }
    if ( nation ) {
        ids.push( `nation:roman:${nation}` );
    }
    ( missals ?? [] ).forEach( missalId => ids.push( `sanctorale:roman:${missalId}` ) );
    if ( dioceseId ) {
        ids.push( `diocese:${dioceseRite}:${dioceseId}` );
    }
    return ids;
};
