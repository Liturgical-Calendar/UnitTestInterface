/**
 * The phase-running machinery shared by both WebSocket test-runner pages.
 *
 * `resources.js` used to own the registry-backed painter, the phase watchdog, the request-id
 * minting and the send path — all four of which `index.js` needs too. Copying them into `index.js`
 * would create the second implementation #42 exists to remove, so they live here instead, and each
 * page constructs its own {@link createPhaseRunner} instance around its own state.
 *
 * @module wsRunner
 */

import {
    createRequestRegistry,
    createSilenceWatchdog,
    summariseAbandoned,
    newRequestId,
    STEP_CARD_CLASS,
    negotiatedProtocol,
} from './wsProtocol.js';

import { paintCard, applyResultToDom } from './testResults.js';

/**
 * Build one phase runner: the registry-backed painter, the phase watchdog, the request-id minting
 * and the send path, all closed over one page's own callbacks and connection.
 *
 * @param {object}   options
 * @param {function(object): string}   options.cardSlugFor      - check -> the card class fragment it was rendered with
 * @param {function(): void}           options.onAdvance        - the page's runTests(), called when the phase may move on
 * @param {function(): void}           options.onUnattributableFailure - count one failure that has no card
 * @param {function(): boolean}        options.canAdvance       - false once the run is finished or stopped
 * @param {function(): ?WebSocket}     options.socket           - the live connection, read at send time
 * @param {function(): ?string}        options.runToken         - the current run token, or null outside a run
 * @param {number}  [options.silenceTimeoutMs=60000] - How long a run may go without a single frame
 *   before the current phase is given up on.
 *
 *   Stopping on the terminal `complete` frame is what lets a client delete the hardcoded step count
 *   (see {@link beginPhase}), but it trades one failure mode for another: a request that never
 *   reports completion now hangs its phase for ever, where counting frames would eventually have
 *   overshot its way past it. The server has a known hole of exactly that shape — a throw inside a
 *   promise's fulfil handler skips the terminal frame (LiturgicalCalendarAPI#823) — and the
 *   published contract says in as many words to pair stopping on `complete` with a timeout.
 *
 *   The clock measures *silence*, not phase duration, and is restarted by every frame of the run.
 *   Requests run in parallel and a slow one is covered by its neighbours' frames, so this only fires
 *   when the server has genuinely stopped answering — never merely because a check was slow.
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

    /**
     * The default `cardSelectorFor`: a check's own slug plus the step's card class.
     *
     * Returns null for a step this page's markup carries no class for, rather than the string
     * `.slug.undefined` — so the "server advertises a step this page renders no card for" warning in
     * {@link beginPhase} fires on the specific, attributable branch instead of degrading to the less
     * specific "no card rendered at this selector" one.
     *
     * @param {object} check
     * @param {string} step
     * @returns {?string}
     */
    const defaultCardSelectorFor = ( check, step ) => {
        const cardClass = STEP_CARD_CLASS[ step ];
        return undefined === cardClass ? null : `.${cardSlugFor( check )}.${cardClass}`;
    };

    /**
     * The selector the card for this (request, step) was found by.
     *
     * Ours, not the server's. A stored run records this so that replay keeps working after the API
     * retires `classes` — the coupling #42 removes.
     */
    const selectorFor = ( requestId, step ) => selectors.get( requestId )?.[ step ] ?? null;

    /**
     * Sends a message over the WebSocket connection, automatically
     * attaching the current run token for response correlation.
     *
     * Also declares the protocol version, but only when the server advertised one it reads. Against a
     * server that predates the handshake (LiturgicalCalendarAPI#806 section F) `negotiatedProtocol()`
     * returns null and the property is omitted — which is not merely tidy: such a server's message
     * schema does not declare `protocol`, and its unknown-property gate is armed by the `requestId`
     * every message now carries, so declaring a version it never advertised would get the whole run
     * refused message by message.
     *
     * @param {Object} data - The message payload to send.
     */
    const sendMessage = ( data ) => {
        if ( runToken() !== null ) {
            data.runToken = runToken();
        }
        const protocol = negotiatedProtocol();
        if ( null !== protocol ) {
            data.protocol = protocol;
        }
        socket().send( JSON.stringify( data ) );
    };

    /**
     * Restart the silence clock, unless the phase has nothing left to wait for.
     * @returns {void}
     */
    const restartWatchdog = () => {
        if ( 0 === phaseOutstanding.size ) {
            watchdog.clear();
            return;
        }
        watchdog.restart();
    };

    /**
     * Stop the silence clock.
     * @returns {void}
     */
    const clearWatchdog = () => watchdog.clear();

    /**
     * Bind a phase's checks to their cards and start the phase.
     *
     * Each check is given a freshly minted `requestId`, the cards it will paint are looked up once,
     * here, and the pair is recorded in the registry. The ids are minted per *run* rather than per
     * page: reusing them would leave a previous run's frames able to paint the current run's cards,
     * and the run token alone would not stop it, since a rerun of the same page checks the same
     * things.
     *
     * The selector is recorded alongside the element, next to the `querySelector` that uses it, so a
     * stored run can persist a client-owned selector rather than the server's `classes`.
     *
     * @param {Array<object>} checks - The checks about to be sent; each is given a `requestId`.
     * @param {{containerSelector: string, cardSelectorFor?: function(object, string): ?string}} config
     *   `cardSelectorFor(check, step)` returns the selector **relative to the container**, defaulting
     *   to `` `.${cardSlugFor(check)}.${STEP_CARD_CLASS[step]}` ``. A page addressing cards some other
     *   way (by year and by test name, say) passes its own.
     * @returns {void}
     */
    const beginPhase = ( checks, { containerSelector, cardSelectorFor = defaultCardSelectorFor } ) => {
        const outstanding = new Set();
        checks.forEach( check => {
            const requestId = newRequestId();
            check.requestId = requestId;
            const cards = {};
            const cardSelectors = {};
            // The steps the server advertised for this item, where it advertised any — the count is
            // exact since LiturgicalCalendarAPI#825, so it can be trusted rather than assumed. A
            // check that carries none falls back to every step the shared card-class table has.
            const steps = Array.isArray( check.steps ) ? check.steps : Object.keys( STEP_CARD_CLASS );
            steps.forEach( step => {
                const suffix = cardSelectorFor( check, step );
                if ( null === suffix ) {
                    // A step this page has no card for. Said out loud rather than skipped silently:
                    // the server has added a step to its vocabulary and the templates have not caught up.
                    console.warn( `The server advertises a step "${step}" for "${check.id ?? check.validate}" that this page renders no card for.` );
                    return;
                }
                const card = document.querySelector( `${containerSelector} ${suffix}` );
                if ( null === card ) {
                    // Loud, and specific about which check and which step. The selector-based
                    // addressing this replaces could only produce an empty NodeList, which said
                    // nothing about what was missing and did not stop the counters advancing.
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

    /**
     * Move on immediately when a phase has nothing to wait for.
     *
     * A phase now ends on the terminal frames of the requests it started, so a phase that starts *no*
     * requests would otherwise wait for frames that are never coming — and the silence watchdog cannot
     * rescue it either, since it only runs while something is outstanding. The run would sit on
     * "Tests Running..." for ever with no diagnostic, which is the wedge #43 is about, reached by a
     * door the frame counting this replaces did not have.
     *
     * Reachable: a page's check list can be built from something the server advertised for the
     * selected rite, so a rite with no advertised checks — or an inventory that came back empty — is
     * an empty phase.
     *
     * @returns {void}
     */
    const advanceIfPhaseIsEmpty = () => {
        if ( 0 === phaseOutstanding.size ) {
            console.log( 'This phase has no requests to wait for; moving on.' );
            onAdvance();
        }
    };

    /**
     * Start a phase's silence clock once its outstanding set has been installed.
     *
     * Separate from {@link beginPhase} because the clock reads `phaseOutstanding`, which `beginPhase`
     * assigns internally — starting it inside `beginPhase` would read the *previous* phase's set.
     *
     * @returns {void}
     */
    const armWatchdog = () => restartWatchdog();

    /**
     * Paint one step result onto the card its request registered.
     *
     * Addressed by `(requestId, step)`, which the server has stamped on every frame — including the
     * frames answering the legacy `executeValidation` messages this page still sends — since
     * LiturgicalCalendarAPI#806 section C. The `classes` selector is still on the frame and is
     * deliberately not read: it is the coupling #42 exists to remove.
     *
     * Falls back to the selector for a frame that carries no usable correlation, which is not dead
     * code: a server that predates section C sends no `requestId`, and this page should degrade to
     * the old behaviour rather than paint nothing at all.
     *
     * @param {object} responseData - A step-result frame.
     * @returns {void}
     */
    const paintResult = ( responseData ) => {
        const { requestId, step } = responseData;
        if ( 'string' !== typeof requestId || 'string' !== typeof step ) {
            applyResultToDom( responseData );
            return;
        }
        const card = registry.cardFor( requestId, step );
        if ( null === card ) {
            console.warn( `No card is registered for request ${requestId} step "${step}" — the run totals will drift from the rendered cards.`, responseData );
            return;
        }
        paintCard( card, responseData.type === 'success', responseData.text ?? '' );
        registry.markReceived( requestId, step );
    };

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

    /**
     * Give up on whatever the current phase is still waiting for, and move the run on.
     *
     * The two ways a request can be outstanding are counted differently, because they are different
     * failures — see {@link summariseAbandoned}. A request whose steps never arrived left that many
     * cards grey, and each one is counted, or the totals badge reads lower than the cards on the page.
     * A request whose steps all arrived but whose terminal frame never did left nothing grey: its
     * counters are already right, and adding a failure would inflate them past the cards. That second
     * case is not hypothetical — it is exactly LiturgicalCalendarAPI#823, a throw inside a promise's
     * fulfil handler skipping `sendComplete()` after the work itself succeeded — so it is reported as
     * the transport failure it is, and left out of the arithmetic.
     *
     * The two advance guards `resources.js` used to keep separately — `currentState !== JobsFinished`
     * for the terminal-frame path and `currentState !== JobsFinished && currentState !== Stopped` for
     * this one — collapse into the single `canAdvance()` passed in by the caller. They are equivalent
     * in practice: the page's `onmessage` handler returns early once `currentState === Stopped`, so
     * the terminal-frame path is unreachable in that state anyway. A single, stricter guard here is
     * therefore behaviour-preserving, not a widening.
     *
     * @returns {void}
     */
    const giveUpOnOutstandingRequests = () => {
        const abandoned = [ ...phaseOutstanding ];
        if ( 0 === abandoned.length ) {
            return;
        }

        const { unpaintedSteps, incomplete, silent } = summariseAbandoned( registry, abandoned );

        if ( 0 < incomplete.length ) {
            console.error(
                `No frame has arrived for ${silenceTimeoutMs / 1000}s; ${incomplete.length} request(s) never answered in full, leaving ${unpaintedSteps} check(s) unreported.`,
                incomplete
            );
        }
        if ( 0 < silent.length ) {
            // A run-level transport fault, not a check that failed: every card of these requests is
            // painted and every counter already agrees with them.
            console.error(
                `${silent.length} request(s) reported every check but never reported completion — the server ended the request without saying so (LiturgicalCalendarAPI#823).`,
                silent
            );
        }

        for ( let i = 0; i < unpaintedSteps; i++ ) {
            onUnattributableFailure();
        }

        phaseOutstanding.clear();
        if ( canAdvance() ) {
            onAdvance();
        }
    };

    /**
     * Release everything a finished or abandoned run was holding, so the next run starts clean.
     *
     * The runner owns the mutable state of a run in progress — the registry's `Element` references,
     * the recorded selectors and the outstanding set — and state a run never releases contradicts
     * that ownership. Both containers this state addresses are wiped (`innerHTML = ''`) on every run
     * and every rite change, which would otherwise leave the registry and `selectors` map holding a
     * few hundred **detached** card nodes for the life of the page.
     *
     * Call at both ends of a run's lifecycle: when a new run is about to start (so it does not
     * inherit the previous run's bindings) and when a run is stopped (so a `giveUpOnOutstandingRequests()`
     * call reaching the watchdog's callback after a Stop — or any other post-stop caller — finds
     * nothing outstanding to give up on, exactly as it did before this state moved into the runner).
     *
     * @returns {void}
     */
    const endRun = () => {
        registry.reset();
        selectors.clear();
        phaseOutstanding = new Set();
    };

    return {
        beginPhase, outstandingCount: () => phaseOutstanding.size, advanceIfPhaseIsEmpty,
        armWatchdog, restartWatchdog, clearWatchdog, noteTerminalFrame, paintResult,
        selectorFor, giveUpOnOutstandingRequests, sendMessage, endRun
    };
};
