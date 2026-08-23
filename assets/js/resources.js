/**
 * Resource testing module for the LiturgicalCalendar Accuracy Test Interface.
 * Handles resource validation and testing.
 * @module resources
 */

import {
    escapeQuotesAndLinkifyUrls,
    hidePageLoader,
    safeCollapseShow,
    safeToastShow,
    updateText,
    slugify,
    escapeHtmlAttr
} from './common.js';

import {
    applyResultToDom,
    countByStatus,
    createResultCollector,
    nowIsoStamp,
    postRunResults,
    fetchRunSummaries,
    fetchRunDetail,
} from './testResults.js';

import {
    sendCancelRun,
    validationChecksForRite,
    fetchValidations,
    idToCardClass,
    inRiteScope,
    readHello,
    resetHello,
    stepsForCheck,
    stepCardsHtml,
    checkCardSelector,
} from './wsProtocol.js';

import { createPhaseRunner } from './wsRunner.js';

// `@liturgical-calendar/components-js` is deliberately NOT imported statically here. A static
// top-level `import … from` specifier that fails to resolve (CDN outage, blocked host in
// production, a stale symlink in development) fails the whole module's evaluation before any of
// its own code — including a try/catch — ever runs; nothing below this point would execute at
// all. `mountRiteSelect()` instead performs a dynamic `await import(...)` inside its own
// try/catch, so that failure is catchable and degrades to the `#controls-load-failed` toast
// (final review of #48, finding 1) instead of silently killing the page.

const resultCollector = createResultCollector();

/** @typedef {import('./types.js').SourceDataCheckMessage} SourceDataCheckMessage */
/** @typedef {import('./types.js').WebSocketResponse} WebSocketResponse */

// Access global config from window (set by PHP in footer.php)
const {
    locale, WS_PROTOCOL, WS_PORT, WS_HOST, API_PROTOCOL, API_PORT, API_HOST, API_BASE_PATH, APP_ENV,
    riteSelectLabel: riteSelectLabelText = 'Liturgical Rite',
} = window.LitCalConfig;

/**
 * This class keeps track of the state of the page and the data it requires to run tests.
 * It also provides a method to check if all conditions are met to run tests.
 * The conditions are:
 * - PageReady: page has finished loading
 * - SocketReady: Websocket connection is ready
 * - MetaDataReady: metadata has finished loading
 * - MissalsReady: missal data has finished loading
 * @class
 */
class ReadyToRunTests {
    static PageReady        = false;
    static SocketReady      = false;
    static MetaDataReady    = false;
    static MissalsReady     = false;
    static ValidationsReady       = false;

    /**
     * Check if all conditions are met to run tests.
     * The conditions are:
     * - PageReady: page has finished loading
     * - SocketReady: Websocket connection is ready
     * - MetaDataReady: all relevant metadata has finished loading
     * - MissalsReady: missals data has finished loading
     * @return {boolean} true if all conditions are met
     */
    static check() {
        return (
            ReadyToRunTests.PageReady === true
            && ReadyToRunTests.SocketReady === true
            && ReadyToRunTests.MetaDataReady === true
            && ReadyToRunTests.MissalsReady === true
            && ReadyToRunTests.ValidationsReady === true
        );
    }

    /**
     * Checks if all conditions are met to run tests and if so, enables the start test runner button.
     * The conditions are:
     * - PageReady: page has finished loading
     * - SocketReady: Websocket connection is ready
     * - MetaDataReady: all relevant metadata regarding calendars has finished loading
     * - MissalsReady: all relevant data regarding Roman Missals has finished loading
     * Additionally, the method makes sure that the #startTestRunnerBtnLbl is set to the stored value
     * and that the page loader is hidden.
     */
    static tryEnableBtn() {
        console.log( 'ReadyToRunTests.SocketReady = '       + ReadyToRunTests.SocketReady );
        console.log( 'ReadyToRunTests.MetaDataReady = '      + ReadyToRunTests.MetaDataReady );
        console.log( 'ReadyToRunTests.PageReady = '         + ReadyToRunTests.PageReady );
        console.log( 'ReadyToRunTests.MissalsReady = '      + ReadyToRunTests.MissalsReady );
        console.log( 'ReadyToRunTests.ValidationsReady = '        + ReadyToRunTests.ValidationsReady );
        const testsReady = ReadyToRunTests.check();
        const startBtn = document.querySelector('#startTestRunnerBtn');
        if (!startBtn) {
            console.warn('Start button not found');
            return;
        }
        startBtn.disabled = !testsReady;
        startBtn.classList.remove('btn-secondary');
        startBtn.classList.add('btn-primary');
        // always make sure we have the fa-rotate class, ready to start spinning on button press
        // we might be resetting after a previous run where last class was fa-stop
        const stopIcon = startBtn.querySelector('.fa-stop');
        if (stopIcon) {
            stopIcon.classList.remove('fa-stop');
            stopIcon.classList.add('fa-rotate');
        }
        setTestRunnerBtnLblTxt(startTestRunnerBtnLbl);
        if (testsReady) {
            const pageLoader = document.querySelector('.page-loader');
            if (pageLoader) {
                pageLoader.style.opacity = '0';
                setTimeout(() => {
                    pageLoader.style.display = 'none';
                }, 500);
            }
        }
    }
}

/**
 * The TestState class represents the different states the test runner can be in.
 * These states are used to control the flow of the test runner.
 * @class
 * @property {TestState} NotReady The initial state of the test runner.
 *        The web socket connection is not yet ready, or the page is not ready.
 * @property {TestState} Ready The web socket connection is ready.
 *        The test runner is ready to start.
 * @property {TestState} ExecutingResourceValidations The test runner is currently
 *        executing validation tests for the source data.
 * @property {TestState} ExecutingSourceValidations The test runner is currently
 *        executing validation tests for the resource data.
 * @property {TestState} JobsFinished All validation tests have finished.
 */
class TestState {
    static NotReady                     = new TestState( 'NotReady' );
    static Ready                        = new TestState( 'Ready' );
    static ExecutingResourceValidations = new TestState( 'ExecutingResourceValidations' );
    static ExecutingSourceValidations   = new TestState( 'ExecutingSourceValidations' );
    static JobsFinished                 = new TestState( 'JobsFinished' );
    static Stopped                      = new TestState( 'Stopped' );

    /**
     * Constructs a new TestState object.
     * @param {string} name The name of the TestState, which must be one of the
     *                      following: NotReady, Ready,
     *                      ExecutingResourceValidations,
     *                      ExecutingSourceValidations, JobsFinished, Stopped.
     */
    constructor( name ) {
        this.name = name;
    }

    /**
     * Returns a string representation of this TestState.
     * @return {string} The name of this TestState, prefixed with "TestState.".
     */
    toString() {
        return `TestState.${this.name}`;
    }
}

/**
 * Object containing all API endpoint URLs used in the application.
 * Populated by setEndpoints() based on the configured API_BASE_PATH.
 * @type {Object<string,string>}
 * @property {string} CALENDARS - endpoint for calendars
 * @property {string} TESTS - endpoint for tests
 * @property {string} DECREES - endpoint for decrees
 * @property {string} EVENTS - endpoint for events
 * @property {string} MISSALS - endpoint for missals
 * @property {string} EASTER - endpoint for easter calculations
 * @property {string} DATA - endpoint for data
 * @property {string} SCHEMAS - endpoint for schemas
 */
const ENDPOINTS = {
    CALENDARS: "",
    TESTS: "",
    DECREES: "",
    EVENTS: "",
    MISSALS: "",
    EASTER: "",
    DATA: "",
    SCHEMAS: "",
    ROOT: ""
}

/**
 * Array of objects that define the resource data checks.
 * Each object must contain the following properties:
 * - `validate`: the name of the class that will be used to match the response from the websocket backend.
 *      Must coincide with the class on the card, that's how the Websocket backend (Health class) knows which classes to send back.
 * - `sourceFile`: the URL of the resource to check.
 * - `category`: a string that indicates the category of the resource data check.
 *                Currently, the only category is 'resourceDataCheck'.
 * Tne only API path that we don't include here is /data, since it requires more parameters,
 * it cannot be accessed or checked on it's own.
 * @type {Array<{validate: string, sourceFile: string, category: string}>}
 */
const resourceDataChecks = [
    {
        "validate": "calendars-path",
        "sourceFile": ENDPOINTS.CALENDARS,
        "category": "resourceDataCheck"
    },
    {
        "validate": "decrees-path",
        "sourceFile": ENDPOINTS.DECREES,
        "category": "resourceDataCheck"
    },
    {
        "validate": "tests-path",
        "sourceFile": ENDPOINTS.TESTS,
        "category": "resourceDataCheck"
    },
    {
        "validate": "events-path",
        "sourceFile": ENDPOINTS.EVENTS,
        "category": "resourceDataCheck"
    },
    {
        "validate": "easter-path",
        "sourceFile": ENDPOINTS.EASTER,
        "category": "resourceDataCheck"
    },
    {
        "validate": "schemas-path",
        "sourceFile": ENDPOINTS.SCHEMAS,
        "category": "resourceDataCheck"
    },
    {
        "validate": "missals-path",
        "sourceFile": ENDPOINTS.MISSALS,
        "category": "resourceDataCheck"
    }
];

/**
 * The liturgical rite currently selected. Drives which checks are built.
 * @type {string}
 */
let currentRite = 'roman';

/**
 * Incremented on every rite change. `loadAsyncData()` captures the value current when it starts
 * and discards its results if the generation has since moved on — i.e. another rite change
 * started a newer `loadAsyncData()` call before this one's fetches resolved.
 *
 * Needed because `loadAsyncData()` has no in-flight guard of its own: its `.then` pushes into the
 * module-level `sourceDataChecks` / `resourceDataChecks` arrays, so two overlapping calls (a rapid
 * double rite change — roman -> ambrosian -> roman within the round-trip time of the `/calendars`,
 * `/missals` and `/tests` fetches) both resolve and both push, duplicating every check (final
 * review of #48, finding 2).
 *
 * @type {number}
 */
let loadAsyncDataGeneration = 0;

/**
 * The source data checks for the current run, rebuilt on every rite change.
 *
 * Comes wholly from the API's advertised inventory (`GET /validations`), filtered to the selected
 * rite — every tier of it: temporale, sanctorale, decrees, wider regions, nations, dioceses and
 * tests. It used to be assembled here instead, from a hardcoded list of repo-relative paths plus
 * entries derived from `/calendars`, `/missals` and `/tests`; see {@link validationChecksForRite}
 * for why that had to go.
 *
 * Empty until `loadAsyncData()` has fetched the inventory.
 *
 * @type {Array<{id: string, label: string, steps: Array<string>, rite: string}>}
 */
let sourceDataChecks = [];



/**
 * Sets the API endpoints based on the configured API_BASE_PATH environment variable.
 * The API version is determined by the server configuration, not user selection,
 * since the WebSocket server can only validate against a single API base path.
 *
 * @return {void}
 */
const setEndpoints = () => {
    let API_PATH;
    if (APP_ENV==='production') {
        const basePath = API_BASE_PATH.replace(/^\/|\/$/g, ''); // strip leading/trailing slashes
        // An empty base path (API served at the root) must stay empty here, otherwise the
        // `${API_PATH}/calendars` templates below produce a double slash (…:8000//calendars).
        API_PATH = basePath === '' ? '' : `/${basePath}`;
    } else {
        API_PATH = '';
    }
    const API_PORT_STR  = [443, 80].includes(API_PORT) ? '' : `:${API_PORT}`;
    ENDPOINTS.CALENDARS = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}/calendars`;
    ENDPOINTS.DECREES   = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}/decrees`;
    ENDPOINTS.TESTS     = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}/tests`;
    ENDPOINTS.EVENTS    = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}/events`;
    ENDPOINTS.EASTER    = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}/easter`;
    ENDPOINTS.SCHEMAS   = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}/schemas`;
    ENDPOINTS.MISSALS   = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}/missals`;
    ENDPOINTS.DATA      = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}/data`;
    // The API root itself, for endpoints reached as a whole rather than as a named check.
    ENDPOINTS.ROOT      = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}`;
    console.info(`setEndpoints: APP_ENV=${APP_ENV}, API_PATH=${API_PATH}`);
    resourceDataChecks[0].sourceFile = ENDPOINTS.CALENDARS;
    resourceDataChecks[1].sourceFile = ENDPOINTS.DECREES;
    resourceDataChecks[4].sourceFile = ENDPOINTS.EASTER;
    resourceDataChecks[5].sourceFile = ENDPOINTS.SCHEMAS;
    resourceDataChecks[6].sourceFile = ENDPOINTS.MISSALS;
    setRiteQualifiedEndpoints( currentRite );
}

/**
 * Points the two rite-qualified collection checks at the selected rite.
 *
 * `/events` and `/tests` are collections whose content differs by rite, and both accept the
 * segment. The other five static checks — /calendars, /decrees, /easter, /schemas, /missals —
 * carry no rite dimension and keep their bare URLs.
 *
 * Requires LiturgicalCalendarAPI#816: before it, `getPathToSchemaFile()` matched collection routes
 * by exact string equality, so `/events/roman` resolved no schema. It now strips a trailing rite
 * segment before the match.
 *
 * `/calendar/{rite}` is deliberately absent — Health resolves no schema for either form of it, so
 * it is not checkable as a resource path. index.php validates calendars through the
 * `validateCalendar` action instead.
 *
 * @param {string} rite - The selected rite.
 * @returns {void}
 */
const setRiteQualifiedEndpoints = ( rite ) => {
    const eventsCheck = resourceDataChecks.find( check => check.validate === 'events-path' );
    const testsCheck  = resourceDataChecks.find( check => check.validate === 'tests-path' );
    eventsCheck.sourceFile = `${ENDPOINTS.EVENTS}/${rite}`;
    testsCheck.sourceFile  = `${ENDPOINTS.TESTS}/${rite}`;
    // resourcePaths holds the display label shown above each card (resourceTemplate()'s `path`),
    // independent from the request URL above — it must be kept in step by hand or the label goes
    // stale and no longer names the rite the request actually targets.
    resourcePaths['events-path'] = `/events/${rite}`;
    resourcePaths['tests-path']  = `/tests/${rite}`;
};

/**
 * Object containing API endpoint paths for resources
 *
 * @constant {Object<string,string>}
 * @property {string} calendars-path - Path for calendar data
 * @property {string} decrees-path   - Path for decree data
 * @property {string} tests-path     - Path for test data
 * @property {string} events-path    - Path for event data
 * @property {string} easter-path    - Path for Easter date calculation
 * @property {string} schemas-path   - Path for schema data
 * @property {string} missals-path   - Path for missal data
 */
const resourcePaths = {
    'calendars-path': '/calendars',
    'decrees-path':   '/decrees',
    'tests-path':     '/tests',
    'events-path':    '/events',
    'easter-path':    '/easter',
    'schemas-path':   '/schemas',
    'missals-path':   '/missals'
};


/**
 * The pending-state icon every card on this page is scaffolded with.
 *
 * Font Awesome's `circle-question`, inlined as SVG — this page pre-renders what `index.js` leaves
 * to the Font Awesome runtime as an `<i>`. That difference between the two pages is why
 * {@link stepCardsHtml} takes the icon as a parameter rather than owning one.
 *
 * @type {string}
 */
const CARD_ICON = '<svg class="svg-inline--fa fa-circle-question fa-fw" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="circle-question" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"></path></svg><!-- <i class="fas fa-circle-question fa-fw"></i> Font Awesome fontawesome.com -->';

/**
 * This function generates an HTML template for a specific resource based on the resource and index provided.
 * The template includes one card per step of the *check* frame family — existence, response-format
 * validity, and schema validity — each with the pending icon and the step's own text.
 *
 * A resource check is a bare API URL, sent as `executeValidation`, so it carries no advertised
 * `steps` and takes `stepsForCheck()`'s fallback — the same fallback `beginPhase()` registers it
 * with, which is what keeps the cards drawn here and the cards bound there the same set (#62).
 *
 * @param {string} resource The name of the resource.
 * @param {number} idx The index of the resource.
 * @returns {string} The HTML template for the resource.
 */
const resourceTemplate = (resource, idx) => {
    const resourceSlug = slugify(resource);
    const path = resourcePaths[resource];
    return `<div class="col-1 ${idx === 0 || idx % 11 === 0 ? 'offset-1' : ''}">
    <div class="text-center mt-1 mb-0 bg-secondary text-white"><span title="${escapeHtmlAttr(path)}" class="text-break d-inline-block w-75">${escapeHtmlAttr(path)}</span></div>
${stepCardsHtml({
    steps: stepsForCheck(),
    classesFor: cardClass => `${resourceSlug} ${cardClass}`,
    icon: CARD_ICON,
    responseType: currentResponseType
})}
</div>`;
}

/**
 * Template for a source item in the resource list.
 *
 * One card per step, from `stepsForCheck()` — an inventory item's advertised `steps` where it has
 * them, and otherwise the same fallback `beginPhase()` applies, so the cards drawn here and the
 * cards bound there are always the same set (#62).
 *
 * @param {object} sourceItem - An object containing the resource's source file or folder.
 * @param {number} idx - The index of the source item in the list.
 * @returns {string} A string containing the HTML for the source item.
 */
const sourceTemplate = (sourceItem, idx) => {
    // Two shapes reach this, and both have to render.
    //
    // A live run supplies an advertised inventory item — `{id, label, steps}` — whose caption is the
    // server's own label and whose tooltip is the id the request actually carries. That is the
    // shape #42 moves this page to.
    //
    // A **stored** run supplies whatever its scaffold was saved with, and runs saved before that
    // move carry the old `{validate, sourceFile|sourceFolder}`: a name this page invented and the
    // repo-relative path it invented it from. Those files are on disk and replayable from the Past
    // Runs dropdown, so rendering them is not optional — a replay that showed a row of `undefined`
    // captions would be a silent regression in a feature nobody was touching.
    const fromInventory = undefined !== sourceItem.id;
    const validateSlug = fromInventory ? idToCardClass(sourceItem.id) : slugify(sourceItem.validate);
    const caption = fromInventory ? sourceItem.label : sourceItem.validate;
    const tooltip = fromInventory ? sourceItem.id : (sourceItem.sourceFile ?? sourceItem.sourceFolder ?? '');
    return `<div class="col-1 ${idx === 0 || idx % 11 === 0 ? 'offset-1' : ''}">
<div class="text-center mt-1 mb-0 bg-secondary text-white"><span title="${escapeHtmlAttr(tooltip)}" class="text-break d-inline-block w-75">${escapeHtmlAttr(caption)}</span></div>
${stepCardsHtml({
    steps: stepsForCheck( sourceItem ),
    classesFor: cardClass => `${validateSlug} ${cardClass}`,
    icon: CARD_ICON
})}
</div>`;
}

/**
 * Establishes a websocket connection to the test server.
 * If the connection is successful, it sets the state to ReadyState and tries
 * to enable the test runner button. If the connection is closed, it sets the
 * state to JobsFinished and tries to enable the test runner button. If an
 * error occurs, it sets the state to JobsFinished and shows an error toast.
 * Also sets up event listeners for the open, message, close, and error events.
 */
const connectWebSocket = () => {
    // Guard against creating multiple connections
    if (conn && (conn.readyState === WebSocket.OPEN || conn.readyState === WebSocket.CONNECTING)) {
        console.log('WebSocket connection already exists, skipping new connection');
        return;
    }
    console.log( `Connecting to websocket... WS_PROTOCOL: ${WS_PROTOCOL}, WS_HOST: ${WS_HOST}, WS_PORT: ${WS_PORT}` );
    const websocketURL = `${WS_PROTOCOL}://${WS_HOST}${[443,80].includes(WS_PORT) ? '' : `:${WS_PORT}`}`;
    conn = new WebSocket( websocketURL );

    /**
     * Event handler for the onopen event. Called when the websocket connection to the test server is established.
     * Logs a message to the console, shows a toast to indicate the connection is established, and updates the state to ReadyState.
     * Additionally, it stops the connection attempt timer, sets ReadyToRunTests.SocketReady to true, and tries to enable the test runner button.
     */
    conn.onopen = () => {
        console.log( "Websocket connection established!" );
        safeToastShow('#websocket-connected');
        const wsStatus = document.querySelector('#websocket-status');
        if (wsStatus) {
            wsStatus.classList.remove('bg-secondary', 'bg-warning', 'bg-danger');
            wsStatus.classList.add('bg-success');
            const wsSvg = wsStatus.querySelector('svg');
            if (wsSvg) {
                wsSvg.classList.remove('fa-plug', 'fa-plug-circle-xmark', 'fa-plug-circle-exclamation');
                wsSvg.classList.add('fa-plug-circle-check');
            }
        }
        if ( connectionAttempt !== null ) {
            clearInterval( connectionAttempt );
            connectionAttempt = null;
        }
        // Only when no run is in flight (#66). See the matching guard in index.js: a mid-run socket
        // drop that reconnects must not reset the state machine, or the silence watchdog would see
        // `Ready`, `canAdvance()` would return true, and `runTests()` would re-send the phase on the
        // new socket under the stale run token, doubling every counter against a painted scaffold.
        if ( null === currentRunToken ) {
            currentState = TestState.Ready;
        }
        ReadyToRunTests.SocketReady = true;
        ReadyToRunTests.tryEnableBtn();
    };

    /**
     * Handles incoming messages from the websocket server.
     * Each message is expected to be a JSON object with the following properties:
     * - type: either "success" or "error"
     * - classes: a string of CSS classes that identify which test is being reported
     * - text: a string of text to display in case of an error
     * If the message is a success, it updates the corresponding success count and marks the test as successful.
     * If the message is an error, it updates the corresponding failed count and marks the test as failed.
     * If the test is not finished, it continues running tests and measures the total test time.
     */
    /**
     * Count a frame we could not attribute to a specific check.
     *
     * The frame is unusable, but the *phase* is still known from `currentState`, so the failure
     * is booked against both the global total and the current phase's total. Incrementing only
     * the global one would leave the header count and the per-phase counts disagreeing, which is
     * the same silent drift #43 flags for unmatched selectors.
     */
    conn.onmessage = ( e ) => {
        // Parsed once, before the run guards, because one frame is not about a run: the server's
        // `hello` arrives on connect and carries no run token — which is exactly what makes it
        // invisible to a client that predates it, and exactly why the guards below would discard
        // it. See readHello().
        let responseData;
        let parseError = null;
        try {
            responseData = JSON.parse( e.data );
        } catch ( error ) {
            parseError = error;
        }

        if ( null === parseError && readHello( responseData ) ) {
            return;
        }

        if ( currentState === TestState.Stopped || currentRunToken === null ) {
            return;
        }

        if ( null !== parseError ) {
            // The state machine is driven from this handler: an exception escaping here means
            // runTests() is never called again and the run wedges with the spinner still going
            // and nothing in the UI to say why (#43). Count it and keep the run moving.
            //
            // Reached only inside a run, as before: an unparseable frame arriving before one is
            // nothing to attribute a failure to, and pumping the state machine for it would be
            // acting on a run that has not started.
            console.error( 'Discarding unparseable WebSocket frame.', parseError, e.data );
            countUnattributableFailure();
            if ( currentState !== TestState.JobsFinished ) {
                runTests();
            }
            return;
        }
        // Require the matching token, as index.js does. This page used to accept *untagged*
        // responses (`responseData.runToken && …`), so the two runners disagreed about which
        // frames belong to the current run; the server tags every frame once a run token is set.
        //
        // The object test is load-bearing, not defensive noise: `JSON.parse('null')` succeeds and
        // returns `null`, so reading `.runToken` off it throws a TypeError — between the two
        // try/catch blocks, escaping both, and wedging the run exactly as an unparseable frame
        // used to. Bare scalars box rather than throw, but are rejected here all the same.
        if ( null === responseData || 'object' !== typeof responseData || responseData.runToken !== currentRunToken ) {
            return;
        }
        console.log( responseData );

        // Any frame of this run is proof the server is still answering.
        phaseRunner.restartWatchdog();

        // The terminal frame ends a request; it reports no step outcome, so it must not be painted,
        // recorded or counted. Counting it would inflate the totals badge past the number of
        // rendered cards — the drift #42 describes, arrived at from the other direction.
        if ( phaseRunner.noteTerminalFrame( responseData ) ) {
            return;
        }

        try {
            if ( responseData.type === "success" ) {
                phaseRunner.paintResult( responseData );
                resultCollector.record( phaseForState(), responseData, phaseRunner.selectorFor( responseData.requestId, responseData.step ) );
                updateText('successfulCount', ++successfulTests);
                switch( currentState ) {
                    case TestState.ExecutingResourceValidations:
                        updateText('successfulResourceDataTestsCount', ++successfulResourceDataTests);
                        break;
                    case TestState.ExecutingSourceValidations:
                        updateText('successfulSourceDataTestsCount', ++successfulSourceDataTests);
                        break;
                }
            }
            else if ( responseData.type === "error" ) {
                phaseRunner.paintResult( responseData );
                resultCollector.record( phaseForState(), responseData, phaseRunner.selectorFor( responseData.requestId, responseData.step ) );
                updateText('failedCount', ++failedTests);
                switch( currentState ) {
                    case TestState.ExecutingResourceValidations:
                        updateText('failedResourceDataTestsCount', ++failedResourceDataTests);
                        break;
                    case TestState.ExecutingSourceValidations:
                        updateText('failedSourceDataTestsCount', ++failedSourceDataTests);
                        break;
                }
            }
            else {
                // `echobot` is what the server returns for a malformed or unrecognised message.
                // Silently ignoring it (while still advancing the state machine below) is how a
                // protocol error used to disappear from the UI entirely.
                console.error( `Unexpected response type "${responseData.type}" — treating as a failure.`, responseData );
                countUnattributableFailure();
            }
        } catch ( handlerError ) {
            // Same reasoning as the parse guard: a response we cannot process must not stop
            // the run from finishing.
            console.error( 'Failed to process a WebSocket response.', handlerError, responseData );
            countUnattributableFailure();
        }
        if ( currentState !== TestState.JobsFinished ) {
            runTests();
        }
        performance.mark( 'litcalTestRunnerEnd' );
        const totalTestTime = performance.measure( 'litcalTestRunner', 'litcalTestRunnerStart', 'litcalTestRunnerEnd' );
        console.log( 'Total test time = ' + Math.round( totalTestTime.duration ) + 'ms' );
        updateText('total-time', MsToTimeString( Math.round( totalTestTime.duration ) ));
        switch( currentState ) {
            case TestState.ExecutingResourceValidations: {
                performance.mark( 'resourceDataTestsEnd' );
                const totalResourceDataTestsTime = performance.measure( 'litcalResourceDataTestRunner', 'resourceDataTestsStart', 'resourceDataTestsEnd' );
                updateText('totalResourceDataTestsTime', MsToTimeString( Math.round( totalResourceDataTestsTime.duration ) ));
                break;
            }
            case TestState.ExecutingSourceValidations: {
                performance.mark( 'sourceDataTestsEnd' );
                const totalSourceDataTestsTime = performance.measure( 'litcalSourceDataTestRunner', 'sourceDataTestsStart', 'sourceDataTestsEnd' );
                updateText('totalSourceDataTestsTime', MsToTimeString( Math.round( totalSourceDataTestsTime.duration ) ));
                break;
            }
        }
    };

    /**
     * Handles the onclose event of the websocket connection.
     * Logs a message to the console, shows a toast to indicate the connection is closed,
     * and updates the state to JobsFinished.
     * Additionally, it stops the connection attempt timer, sets ReadyToRunTests.SocketReady to false,
     * and tries to enable the test runner button.
     */
    conn.onclose = () => {
        console.log( 'Connection closed on remote end' );
        // Forget what this connection advertised. The reconnection below may reach a server of a
        // different vintage — a deploy is exactly when a socket drops — and answering it with the
        // previous one's capabilities would declare a protocol it never claimed to read.
        resetHello();
        ReadyToRunTests.SocketReady = false;
        ReadyToRunTests.tryEnableBtn();
        if ( connectionAttempt === null ) {
            const wsStatus = document.querySelector('#websocket-status');
            if (wsStatus) {
                wsStatus.classList.remove('bg-secondary', 'bg-danger', 'bg-success');
                wsStatus.classList.add('bg-warning');
                const wsSvg = wsStatus.querySelector('svg');
                if (wsSvg) {
                    wsSvg.classList.remove('fa-plug', 'fa-plug-circle-check', 'fa-plug-circle-exclamation');
                    wsSvg.classList.add('fa-plug-circle-xmark');
                }
            }
            safeToastShow('#websocket-closed');
            document.querySelectorAll('.fa-spin').forEach(el => el.classList.remove('fa-spin'));
            setTimeout( function () {
                connectWebSocket();
            }, 3000 );
        }
    }

    /**
     * Handles websocket connection errors.
     * If a connection error occurs, it sets the connection status to "error",
     * shows an error toast, and stops the spinner.
     * If there is no connection attempt currently running, it starts a new
     * connection attempt after 3 seconds.
     * @param {ErrorEvent} e - The error event.
     */
    conn.onerror = ( e ) => {
        const wsStatus = document.querySelector('#websocket-status');
        if (wsStatus) {
            wsStatus.classList.remove('bg-secondary', 'bg-warning', 'bg-success');
            wsStatus.classList.add('bg-danger');
            const wsSvg = wsStatus.querySelector('svg');
            if (wsSvg) {
                wsSvg.classList.remove('fa-plug', 'fa-plug-circle-check', 'fa-plug-circle-xmark');
                wsSvg.classList.add('fa-plug-circle-exclamation');
            }
        }
        console.error( 'Websocket connection error:' );
        console.log( e );
        safeToastShow('#websocket-error');
        document.querySelectorAll('.fa-spin').forEach(el => el.classList.remove('fa-spin'));
        if ( connectionAttempt === null ) {
            connectionAttempt = setInterval( function () {
                connectWebSocket();
            }, 3000 );
        }
    }
}

/**
 * Updates the text content of the #startTestRunnerBtnLbl element.
 * @param {string} txt - The text to set as the label of the start test runner button.
 */
const setTestRunnerBtnLblTxt = (txt) => {
    updateText('startTestRunnerBtnLbl', txt);
}

/**
 * Resets all test UI elements back to their initial state.
 * This includes resetting card colors, icons, counters, timers,
 * and removing any error tooltips injected during the previous run.
 */
const resetTestUI = () => {
    // Scope to .card so the permanent per-section summary badges (.test-status-item)
    // keep their fixed green/red styling and are not reset to the "pending" state.
    document.querySelectorAll('#testSuiteAccordion .card.bg-success, #testSuiteAccordion .card.bg-danger').forEach(el => {
        el.classList.remove('bg-success', 'bg-danger');
        el.classList.add('bg-info');
    });
    document.querySelectorAll('#testSuiteAccordion .card .fa-circle-check, #testSuiteAccordion .card .fa-circle-xmark').forEach(el => {
        el.classList.remove('fa-circle-check', 'fa-circle-xmark');
        el.classList.add('fa-circle-question');
    });

    // Dispose Bootstrap Tooltip instances tracked in tooltipMap
    tooltipMap.forEach(tooltip => {
        tooltip.hide();
        tooltip.dispose();
    });
    tooltipMap.clear();

    // Remove error tooltip DOM elements, disposing any Bootstrap Tooltip instance on each
    document.querySelectorAll('#testSuiteAccordion .error-tooltip').forEach(el => {
        const instance = bootstrap.Tooltip.getInstance(el);
        if (instance) {
            instance.dispose();
        }
        el.remove();
    });

    // Reset all success/fail counters displayed in the UI
    document.querySelectorAll('.successfulCount, .failedCount').forEach(el => el.textContent = '0');

    // Reset all timer displays
    updateText('total-time', '0');
    updateText('totalResourceDataTestsTime', '0');
    updateText('totalSourceDataTestsTime', '0');

    // Reset internal counter variables.
    // The grand totals belong here with the per-phase ones. They used to be zeroed separately by
    // the start-run handler, which made this function a *partial* reset — every other caller left
    // `successfulTests` / `failedTests` holding the previous run's values, so the DOM read 0 while
    // the next increment jumped straight back to the stale number (#53).
    successfulTests = 0;
    failedTests = 0;
    successfulResourceDataTests = 0;
    successfulSourceDataTests = 0;
    failedResourceDataTests = 0;
    failedSourceDataTests = 0;
};

/**
 * Date formatting options for the past-runs dropdown labels.
 * @type {Intl.DateTimeFormatOptions}
 */
const IntlDTOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
};

/**
 * Renders the empty (bg-info) card scaffolding for both Resources phases.
 * Used by the live setup and by replay so the same template code is shared.
 * @param {{resourceDataChecks: string[], sourceDataChecks: Array<object>}} cfg
 *   resourceDataChecks — array of resource key strings (keys of the resourcePaths map).
 *   sourceDataChecks   — array of sourceDataCheck objects with validate/sourceFile/sourceFolder.
 */
const buildScaffolding = ( cfg ) => {
    const resourceContainer = document.querySelector('#resourceDataTests .resourcedata-tests');
    if ( resourceContainer ) {
        resourceContainer.innerHTML = '';
        cfg.resourceDataChecks.forEach( ( resourceKey, idx ) => {
            resourceContainer.insertAdjacentHTML('beforeend', resourceTemplate( resourceKey, idx ));
        } );
    }
    const sourceContainer = document.querySelector('#sourceDataTests .sourcedata-tests');
    if ( sourceContainer ) {
        sourceContainer.innerHTML = '';
        cfg.sourceDataChecks.forEach( ( item, idx ) => {
            sourceContainer.insertAdjacentHTML('beforeend', sourceTemplate( item, idx ));
        } );
    }
    // Check-card totals shown in the Time badge parentheses (overall + per section).
    // Computed here so both the live setup and stored-run replay paths populate them.
    //
    // Counted through `checkCardSelector()` rather than by naming the card classes here: it
    // enumerates the very table `stepCardsHtml()` renders from, so the badge can only ever describe
    // cards the scaffold can actually produce (#62).
    const totalResourceDataTestsCount = document.querySelectorAll(checkCardSelector('.resourcedata-tests')).length;
    const totalSourceDataTestsCount = document.querySelectorAll(checkCardSelector('.sourcedata-tests')).length;
    updateText('totalResourceDataTestsCount', totalResourceDataTestsCount);
    updateText('totalSourceDataTestsCount', totalSourceDataTestsCount);
    updateText('total-tests-count', totalResourceDataTestsCount + totalSourceDataTestsCount);
};

/**
 * Sets up the page by populating the page with the resource data tests and setting the page status to ready.
 * The page status is set to ready after the page has finished loading and the resource data tests have been
 * populated.
 */
const setupPage = () => {
    if (startTestRunnerBtnLbl === '') {
        const btnLblEl = document.querySelector('#startTestRunnerBtnLbl');
        if (btnLblEl) {
            startTestRunnerBtnLbl = btnLblEl.textContent;
        }
    }
    buildScaffolding({ resourceDataChecks: Object.keys(resourcePaths), sourceDataChecks });
    ReadyToRunTests.PageReady = true;
    ReadyToRunTests.tryEnableBtn();
    connectWebSocket();
}


let currentState                = TestState.NotReady;
let MetaData                    = null;
let Missals                     = null;
let startTestRunnerBtnLbl       = '';
let connectionAttempt           = null;
let conn;
let currentRunToken             = null;
let currentResponseType         = "JSON";

let successfulTests             = 0;
let failedTests                 = 0;
let successfulSourceDataTests   = 0;
let failedSourceDataTests       = 0;
let successfulResourceDataTests = 0;
let failedResourceDataTests     = 0;

/**
 * Count a failure that belongs to no card.
 *
 * **Module scope, not inside `connectWebSocket()`, and that is a fix rather than a tidy.** The phase
 * watchdog is defined at module level and calls this; while it lived in the connection closure, the
 * watchdog firing raised a ReferenceError instead of rescuing the run — so the one safety net
 * standing between a missing terminal frame and a permanently hung phase was itself broken. Nothing
 * caught it because no test reached the sixty-second timeout.
 *
 * @returns {void}
 */
const countUnattributableFailure = () => {
    updateText( 'failedCount', ++failedTests );
    switch ( currentState ) {
        case TestState.ExecutingResourceValidations:
            updateText( 'failedResourceDataTestsCount', ++failedResourceDataTests );
            break;
        case TestState.ExecutingSourceValidations:
            updateText( 'failedSourceDataTestsCount', ++failedSourceDataTests );
            break;
    }
};

/**
 * The one phase runner for both phases of this page.
 *
 * Replaces what this page used to own directly: the registry-backed painter (painting by the CSS
 * selector the server composed, replaced per the coupling #42 removes), the phase watchdog, the
 * request-id minting and the send path. `index.js` needs the same four, so they now live in
 * {@link createPhaseRunner} — shared rather than copied, which is what #42 exists to achieve.
 *
 * One runner for both phases. They never overlap — the source phase is only entered once every
 * resource request has reported completion — and a single runner means a frame arriving late, after
 * its phase has moved on, still finds its card instead of being reported as unattributable.
 *
 * `canAdvance()` collapses the two advance guards this page used to keep separately —
 * `currentState !== JobsFinished` for a terminal frame and
 * `currentState !== JobsFinished && currentState !== Stopped` for giving up — into the single,
 * stricter guard. See {@link createPhaseRunner}'s `giveUpOnOutstandingRequests` for why that is
 * behaviour-preserving rather than a widening: `conn.onmessage` already returns early once
 * `currentState === Stopped`, so the terminal-frame path is unreachable in that state regardless.
 */
const phaseRunner = createPhaseRunner( {
    // The card class a check's cards were rendered with.
    //
    // The two families name themselves differently and always did: a resource check is a route,
    // known by the `validate` key it shares with `resourcePaths`, slugified with this page's own
    // `slugify()`; a source check is an inventory item, known by the opaque `id` the server minted,
    // turned into a class with `idToCardClass()`. Neither is derived from anything the server sends
    // at *run* time — that was the coupling #42 removes — so this is only about which of our own two
    // vocabularies a check belongs to, and the distinction must not be conflated: a resource check's
    // `id` is always undefined, which is what selects between the two here.
    cardSlugFor: ( check ) => ( undefined === check.id ? slugify( check.validate ) : idToCardClass( check.id ) ),
    onAdvance: () => runTests(),
    onUnattributableFailure: () => countUnattributableFailure(),
    // `conn.onopen` only resets `currentState` when no run is in flight (#66), so a mid-run
    // reconnect cannot land the watchdog in the `Ready` case and restart a phase. Adding
    // `currentRunToken !== null` here would be inert: the token stays set across exactly that
    // window, so the guard belongs in `onopen`, not in this predicate.
    canAdvance: () => currentState !== TestState.JobsFinished && currentState !== TestState.Stopped,
    socket: () => conn,
    runToken: () => currentRunToken
} );

/**
 * Exported only so a spec can trigger the watchdog without waiting out the clock. See wsRunner.js.
 */
export const giveUpOnOutstandingRequests = () => phaseRunner.giveUpOnOutstandingRequests();

const methodAndHeaders = Object.freeze({
    method: "GET",
    headers: {
        Accept: "application/json"
    }
});

/**
 * Fetches a JSON endpoint, rejecting on a non-ok response instead of parsing the error body.
 *
 * `loadAsyncData()` used a bare `.then(response => response.json())`, which on a 429 parsed the
 * problem document happily and handed on an object with none of the properties the dispatch below
 * looks for — so the dataset went missing in complete silence, its readiness flag stayed false, and
 * the page sat under `.page-loader` for ever (#63). A rejection is what makes that visible.
 *
 * @param {string} endpoint - The URL to fetch.
 * @returns {Promise<object>}
 */
const fetchJson = async ( endpoint ) => {
    const response = await fetch( endpoint, methodAndHeaders );
    if ( false === response.ok ) {
        throw new Error( `${endpoint}: ${response.status} ${response.statusText}` );
    }
    return response.json();
};

/**
 * The API's base URL, without a trailing slash and without an endpoint.
 * @returns {string}
 */
const getApiBaseUrl = () => ENDPOINTS.ROOT;

/** @type {?import('@liturgical-calendar/components-js').RiteSelect} */
let riteSelect = null;

/**
 * Mounts the rite select.
 *
 * No CalendarSelect here: this page is exhaustive rather than calendar-scoped — it checks every
 * calendar the API supports, so there is nothing to select between.
 *
 * A rite change resets every check list and re-runs the whole discovery pass, because the rite
 * determines which calendars, missals and tests are in scope, not merely how they are labelled.
 *
 * @returns {Promise<void>}
 */
const mountRiteSelect = async () => {
    const baseUrl = getApiBaseUrl();
    /** @type {typeof import('@liturgical-calendar/components-js')} */
    let componentsJs;
    try {
        // The dynamic import is inside the try: a failed module load (CDN outage, blocked host,
        // stale dev symlink) rejects here exactly like a failed ApiClient.init() call, instead of
        // aborting evaluation of this whole file before this function even exists.
        componentsJs = await import( '@liturgical-calendar/components-js' );
        await componentsJs.ApiClient.init( baseUrl );
    } catch ( err ) {
        // Same reasoning as index.js: an unmounted control must not look like an empty result set.
        console.error( 'Could not initialise the rite select', err );
        safeToastShow( '#controls-load-failed' );
        return;
    }
    const { RiteSelect } = componentsJs;
    // Note: no `ApiBase` here. This page has no CalendarSelect and reads no shared metadata
    // through it, so `ApiBase` would be resolved and never touched again — see spec §4's
    // amendment on why the two pages do not yet share one `ApiBase` instance.

    riteSelect = new RiteSelect( locale )
        .id( 'riteSelect' )
        .class( 'form-select form-select-sm' )
        .label( { class: 'form-label', text: riteSelectLabelText } );
    riteSelect.appendTo( '#riteSelectMount' );

    riteSelect._domElement.addEventListener( 'change', ( ev ) => {
        currentRite = ev.target.value;
        resetCheckListsForRite();
        loadAsyncData();
    } );
};

/**
 * Disables (or re-enables) the rite select for the duration of a test run.
 *
 * A rite change during an active run is unsafe: `resetCheckListsForRite()` wipes the rendered
 * cards, swaps both check lists and zeroes the result counters, but touches none of
 * `currentState`, the *response* counters or `currentRunToken`, and sends no `cancelRun`.
 * In-flight frames would keep arriving with a matching `runToken`, paint nothing (their cards are
 * gone), still increment the received counter, and could trip the `>=` phase gate early —
 * advancing to `JobsFinished` and storing a run of all-blue cards (final review of #48, finding 3).
 *
 * Disabling the control for the run's duration is simpler than teaching every counter and the run
 * token to survive a mid-run rite swap, and it prevents the scenario outright rather than merely
 * recovering from it after the fact — the control is only `#startTestRunnerBtn`'s exclusive
 * counterpart while a run owns the page.
 *
 * @param {boolean} disabled
 * @returns {void}
 */
const setRiteSelectDisabledForRun = ( disabled ) => {
    if ( riteSelect?._domElement ) {
        riteSelect._domElement.disabled = disabled;
    }
};

/**
 * Returns every check list to its pre-discovery state for the newly selected rite.
 *
 * `resourceDataChecks` is truncated to its static head — the rite-independent collection
 * endpoints — rather than rebuilt, so the URLs `setEndpoints()` wrote into it survive.
 *
 * Also empties the rendered scaffold synchronously, before `loadAsyncData()`'s fetches resolve.
 * `loadAsyncData()` rebuilds it from scratch once the new rite's metadata is in, but that is an
 * async round trip; without this, the previous rite's cards would stay on screen — showing e.g.
 * national-calendar checks under Ambrosian — until the fetch completes and `buildScaffolding()`
 * finally clears and repopulates them itself.
 *
 * Clears the result counters too, via `resetTestUI()`. Emptying the scaffold without them left the
 * badges asserting the previous rite's totals over a card set that was entirely pending, and
 * `buildScaffolding()` then refreshed the *denominators* from the new cards — so a Roman → Ambrosian
 * switch could show more successes than the new rite has checks (#53).
 *
 * Only ever reached between runs: `setRiteSelectDisabledForRun()` owns the control while a run is
 * in flight, so this adds nothing to the mid-run path.
 *
 * @returns {void}
 */
const resetCheckListsForRite = () => {
    resetTestUI();
    const STATIC_RESOURCE_CHECK_COUNT = 7;
    resourceDataChecks.length = STATIC_RESOURCE_CHECK_COUNT;
    // Two of those seven address a rite; the truncation keeps the entries but not their aim.
    setRiteQualifiedEndpoints( currentRite );
    Object.keys( resourcePaths )
        .filter( key => /^(data-path|events-path|missals-path)-/.test( key ) )
        .forEach( key => delete resourcePaths[ key ] );
    sourceDataChecks = [];
    ReadyToRunTests.MetaDataReady    = false;
    ReadyToRunTests.MissalsReady     = false;
    ReadyToRunTests.ValidationsReady = false;
    document.querySelectorAll( '#resourceDataTests .resourcedata-tests, #sourceDataTests .sourcedata-tests' )
        .forEach( el => { el.innerHTML = ''; } );
};

/**
 * Loads all the asynchronous data needed for the page to function.
 * This includes the calendars metadata and the missals metadata.
 * When the data is loaded, it sets the necessary variables and proceeds to
 * set up the page by populating the page with the resource data tests and setting
 * the page status to ready.
 *
 * Has no in-flight guard by itself — a rapid double rite change starts a second call before the
 * first one's fetches resolve, and both `.then` callbacks would otherwise push into the same
 * module-level `sourceDataChecks` / `resourceDataChecks` arrays, duplicating every check (final
 * review of #48, finding 2). `loadAsyncDataGeneration` is the guard: this call captures the
 * generation current when it starts, and discards its results if a newer call has since started.
 */
const loadAsyncData = () => {
    const myGeneration = ++loadAsyncDataGeneration;
    // `allSettled`, not `all`: one rejection there discarded all three results, so `setupPage()`
    // never ran and `.page-loader` — rendered visible in the markup — was never lowered. The page
    // simply stayed greyed out, with a `console.error` as its only trace (#63).
    Promise.allSettled([
        fetchJson( ENDPOINTS.CALENDARS ),
        fetchJson( ENDPOINTS.MISSALS ),
        // `/validations` in place of `/tests`: the inventory carries the test corpus as items of
        // its own (`test:{rite}:{name}`), so fetching the tests list to build source checks from it
        // would be deriving a second time what the server already advertises. `/tests` is still
        // health-checked as a resource path, so nothing stops being covered.
        fetchValidations( ENDPOINTS.ROOT ).then( items => ( { litcal_validations: items } ) )
    ]).then(results => {
        if ( myGeneration !== loadAsyncDataGeneration ) {
            // A newer rite change started another loadAsyncData() call before this one's fetches
            // resolved; that call owns the current scaffold. Applying this stale generation's
            // results on top of it would duplicate every check.
            console.log( 'Discarding stale loadAsyncData() results — a newer rite change has since started' );
            return;
        }
        results.filter( result => 'rejected' === result.status ).forEach( result => {
            console.error( 'A dataset this page builds its checks from could not be loaded:', result.reason );
        } );
        // Whatever did arrive, dispatched by shape exactly as before. A dataset that failed simply
        // is not here, and its `ReadyToRunTests` flag stays false.
        const dataArr = results.filter( result => 'fulfilled' === result.status ).map( result => result.value );
        dataArr.forEach(data => {
            if(data.hasOwnProperty('litcal_metadata')) {
                MetaData = data.litcal_metadata;
                const { national_calendars, diocesan_calendars, wider_regions } = MetaData;

                // Wider regions exist only in the Roman rite: RegionalDataParams
                // ::validateRiteCompatibility() rejects a wider-region request under any other,
                // so building these under Ambrosian would issue requests the API refuses.
                if ( currentRite === 'roman' ) {
                    wider_regions.forEach(region => {
                    const widerRegion = region.name;

                    // we need to request a locale for widerRegion on the data path
                    // so let's retrieve the first available locale from the metadata
                    console.log(widerRegion);
                    console.log(region);
                    const widerRegionFirstLang = region.locales[0];
                    console.log(widerRegionFirstLang);
                    resourcePaths[`data-path-wider-region-${widerRegion}`] = `/data/roman/widerregion/${widerRegion}`;
                    resourceDataChecks.push({
                        "validate": `data-path-wider-region-${widerRegion}`,
                        "sourceFile": ENDPOINTS.DATA + `/roman/widerregion/${widerRegion}?locale=${widerRegionFirstLang}`,
                        "category": "resourceDataCheck"
                    });

                    });
                }

                // National calendars are Roman-only for the same reason as wider regions.
                if ( currentRite === 'roman' ) {
                    national_calendars.slice(1).forEach(nationalCalendar => {
                    const nation = nationalCalendar.calendar_id;

                    nationalCalendar.locales.forEach(locale => {
                        resourcePaths[`data-path-nation-${nation}-${locale}`] = `/data/roman/nation/${nation}?locale=${locale}`;
                        resourceDataChecks.push({
                            "validate": `data-path-nation-${nation}-${locale}`,
                            "sourceFile": ENDPOINTS.DATA + `/roman/nation/${nation}?locale=${locale}`,
                            "category": "resourceDataCheck"
                        });
                        resourcePaths[`events-path-nation-${nation}-${locale}`] = `/events/roman/nation/${nation}?locale=${locale}`;
                        resourceDataChecks.push({
                            "validate": `events-path-nation-${nation}-${locale}`,
                            "sourceFile": ENDPOINTS.EVENTS + `/roman/nation/${nation}?locale=${locale}`,
                            "category": "resourceDataCheck"
                        });
                    })
                    });
                }

                // The diocesan tier is the only one that exists under more than one rite.
                diocesan_calendars
                    .filter( diocesanCalendar => inRiteScope( diocesanCalendar, currentRite ) )
                    .forEach(diocesanCalendar => {
                    const diocese = diocesanCalendar.calendar_id;

                    diocesanCalendar.locales.forEach(locale => {
                        resourcePaths[`data-path-diocese-${diocese}-${locale}`] = `/data/${currentRite}/diocese/${diocese}?locale=${locale}`;
                        resourceDataChecks.push({
                            "validate": `data-path-diocese-${diocese}-${locale}`,
                            "sourceFile": ENDPOINTS.DATA + `/${currentRite}/diocese/${diocese}?locale=${locale}`,
                            "category": "resourceDataCheck"
                        });
                        resourcePaths[`events-path-diocese-${diocese}-${locale}`] = `/events/${currentRite}/diocese/${diocese}?locale=${locale}`;
                        resourceDataChecks.push({
                            "validate": `events-path-diocese-${diocese}-${locale}`,
                            "sourceFile": ENDPOINTS.EVENTS + `/${currentRite}/diocese/${diocese}?locale=${locale}`,
                            "category": "resourceDataCheck"
                        });
                    });
                });

                console.log(wider_regions);

                ReadyToRunTests.MetaDataReady = true;
                console.log( 'Metadata is ready' );
            }
            else if(data.hasOwnProperty('litcal_missals')) {
                Missals = data.litcal_missals;
                // NOTE: no push for the top-level 'missals-path' check here — it is already
                // in the static resourceDataChecks array (and in resourcePaths). Pushing it
                // again sent the validation twice and inflated the success counter (162)
                // past the rendered-card total (159).
                //
                // /missals lists Roman editions only — RomanMissal carries no Ambrosian edition,
                // and the Ambrosian sanctorale reaches the inventory as an explicit item instead.
                if ( currentRite === 'roman' ) {
                    Missals.forEach(missal => {
                        resourcePaths[`missals-path-${missal.missal_id}`] = `/missals/${missal.missal_id}`;
                        resourceDataChecks.push({
                            "validate": `missals-path-${missal.missal_id}`,
                            "sourceFile": ENDPOINTS.MISSALS + `/${missal.missal_id}`,
                            "category": "resourceDataCheck"
                        });
                    });
                }
                ReadyToRunTests.MissalsReady = true;
                console.log( 'Missals is ready');
            }
            else if(data.hasOwnProperty('litcal_validations')) {
                // The whole source-data list, in one statement, from the one place that knows it.
                // Rite filtering is the inventory's own `rite` property rather than a rule
                // reimplemented here — which is what the wider-region and national tiers above
                // still need, since those build *URL* checks the inventory does not cover.
                sourceDataChecks = validationChecksForRite( data.litcal_validations, currentRite );
                ReadyToRunTests.ValidationsReady = true;
            }
        });
        // Render once, after ALL datasets in this pass have been processed. Rendering from inside
        // the metadata/missals branches (gated on each other) fired mid-loop, before the tests
        // dataset was processed — its per-test source checks were pushed into sourceDataChecks but
        // never rendered, and the Time badge totals under-counted until something re-ran
        // setupPage(). Reached now even when a dataset failed, so the page shows what it does have
        // instead of nothing at all.
        setupPage();

        // JUDGEMENT CALL (#63): degrade the *render*, never the *run*.
        //
        // The rationale the previous `.catch` recorded still holds in full, and is why nothing below
        // re-enables anything: every dataset here decides what a run would check, so a run started
        // without one of them would check a subset and report success for it — the class of untruth
        // this interface exists to detect, produced by the interface itself. `ReadyToRunTests`
        // already refuses on any unset flag, and none of them is forced here.
        //
        // What the old behaviour got wrong was the *silence*: refusing the run is right, but leaving
        // the page under a translucent overlay with no message is not. So the scaffold renders, the
        // loader comes down, and a toast names which half of the problem occurred — the two are
        // separate facts and both can be true at once.
        const validationsFailed = false === ReadyToRunTests.ValidationsReady;
        const metadataFailed    = false === ReadyToRunTests.MetaDataReady || false === ReadyToRunTests.MissalsReady;
        if ( validationsFailed ) {
            safeToastShow( '#validations-load-failed' );
        }
        if ( metadataFailed ) {
            // The same toast the rite-select mount failure uses, because to a user it is the same
            // event: the controls could not be built from what the API returned.
            safeToastShow( '#controls-load-failed' );
        }
        if ( validationsFailed || metadataFailed ) {
            // `setupPage()` ends in `tryEnableBtn()`, which lowers the loader only when every flag
            // is set — and one of them never will be now.
            hidePageLoader();
        }
    }).catch( error => {
        // Only an unexpected throw from the handler above can land here now: every fetch failure is
        // a settled rejection, handled inline. Still not swallowed, and still not left greyed out.
        if ( myGeneration !== loadAsyncDataGeneration ) {
            return;
        }
        console.error( 'Could not set this page up from the data it builds its checks from', error );
        safeToastShow( '#controls-load-failed' );
        document.querySelectorAll( '.fa-spin' ).forEach( el => el.classList.remove( 'fa-spin' ) );
        ReadyToRunTests.tryEnableBtn();
        hidePageLoader();
    });
}


/**
 * Manages the execution of resource validation tests and transitions through different test states.
 *
 * This function handles the following states:
 * - ReadyState: Sends ALL resource data validation requests in parallel, then transitions to ExecutingResourceValidations.
 * - ExecutingResourceValidations: Counts responses from parallel resource data requests. When all responses received,
 *   sends ALL source data validation requests in parallel and transitions to ExecutingSourceValidations.
 * - ExecutingSourceValidations: Counts responses from parallel source data requests. When all responses received,
 *   transitions to JobsFinished.
 * - JobsFinished: Indicates all tests have been completed, updates UI to reflect the completion state.
 *
 * Utilizes performance marks to track test execution time and updates the UI to show test progress.
 */
const runTests = () => {
    switch ( currentState ) {
        case TestState.Ready: {
            currentState = TestState.ExecutingResourceValidations;
            performance.mark( 'resourceDataTestsStart' );
            safeCollapseShow('#resourceDataTests');

            // Send ALL resource data requests at once - server handles concurrency
            phaseRunner.beginPhase( resourceDataChecks, { containerSelector: '#resourceDataTests .resourcedata-tests' } );
            phaseRunner.armWatchdog();
            console.log( `Sending ${resourceDataChecks.length} resource data requests in parallel...` );
            resourceDataChecks.forEach( check => {
                phaseRunner.sendMessage({
                    action: 'executeValidation',
                    responsetype: currentResponseType,
                    ...check
                });
            });
            phaseRunner.advanceIfPhaseIsEmpty();
            break;
        }
        case TestState.ExecutingResourceValidations:
            // A phase ends when every request it started has reported its terminal `complete`
            // frame — not when some number of frames have arrived.
            //
            // This page used to size each phase as `checks * 3` and compare with `>=`. Three was
            // the undocumented step count, shared by both sides and written down in four places
            // across the two runners (#42); `>=` was there because counting frames cannot tell a
            // duplicate from a legitimate one, so an extra frame had to be tolerated rather than
            // hang the phase. Tolerating it had its own cost: an extra frame satisfied the
            // threshold early and the *following* phase then inherited the overshoot. A real
            // occurrence is recorded on the wider-region push below — a double-sent validation
            // inflated the success counter to 162 against 159 rendered cards.
            //
            // Neither problem survives per-request completion. The step count comes from the
            // server, a duplicate terminal frame is idempotent in the registry, and a request
            // that stops early still ends the phase, because the server sends `complete` for a
            // request whose steps failed exactly as for one whose steps passed.
            if ( 0 === phaseRunner.outstandingCount() ) {
                console.log( 'Resource file validation jobs are finished! Now continuing to check source data...' );
                currentState = TestState.ExecutingSourceValidations;
                performance.mark( 'sourceDataTestsStart' );
                safeCollapseShow('#sourceDataTests');

                // Send ALL source data requests at once - server handles concurrency
                phaseRunner.beginPhase( sourceDataChecks, { containerSelector: '#sourceDataTests .sourcedata-tests' } );
                phaseRunner.armWatchdog();
                console.log( `Sending ${sourceDataChecks.length} source data requests in parallel...` );
                sourceDataChecks.forEach( check => {
                    // The opaque id, and nothing else. No `category` to pick a schema-resolution
                    // strategy, no `validate` doing three jobs at once, and above all no path: the
                    // server resolves all of that from the id it advertised.
                    phaseRunner.sendMessage({
                        action: 'validateSource',
                        target: { id: check.id },
                        requestId: check.requestId
                    });
                });
                phaseRunner.advanceIfPhaseIsEmpty();
            }
            break;
        case TestState.ExecutingSourceValidations:
            // See the note on the resource phase above.
            if ( 0 === phaseRunner.outstandingCount() ) {
                console.log( 'All source data requests have reported completion!' );
                currentState = TestState.JobsFinished;
                runTests();
            }
            break;
        case TestState.JobsFinished: {
            console.log( 'All jobs finished!' );
            phaseRunner.clearWatchdog();
            safeToastShow('#tests-complete');
            currentRunToken = null;
            setRiteSelectDisabledForRun( false );
            const spinIcon = document.querySelector('.fa-spin');
            if (spinIcon) {
                spinIcon.classList.remove('fa-spin', 'fa-rotate');
                spinIcon.classList.add('fa-stop');
            }
            setTestRunnerBtnLblTxt('Tests Complete');
            postRunResults( buildResourcesPayload() )
                .then( () => safeToastShow('#results-saved') )
                .catch( ( err ) => {
                    console.error( 'Failed to persist run results', err );
                    safeToastShow('#results-save-failed');
                });
            break;
        }
    }
}

/**
 * Converts a given time in milliseconds to a human readable string.
 * The method tries to break down the given time into hours, minutes, seconds and milliseconds.
 * If a time unit is not needed (e.g. if the given time is less than 1 hour), it is left out.
 * Example: 10000ms is converted to '10 seconds'
 * @param {number} ms time in milliseconds
 * @return {string} human readable string
 */
const MsToTimeString = ( ms ) => {
    let timeString = [];
    let left = ms;
    if ( ms > 3600000 ) {
        left = ms % 3600000;
        ms -= left;
        let hours = ms / 3600000;
        if( hours > 0 ) {
            timeString.push( `${hours} ${hours > 1 ? 'hours' : 'hour'}` );
        }
    }
    if ( left > 60000 ) {
        ms = left;
        left = ms % 60000;
        ms -= left;
        let minutes = ms / 60000;
        if( minutes > 0 ) {
            timeString.push( `${minutes} ${minutes > 1 ? 'minutes' : 'minute'}` );
        }
    }
    if ( left > 1000 ) {
        ms = left;
        left = ms % 1000;
        ms -= left;
        let seconds = ms / 1000;
        timeString.push( `${seconds} ${seconds > 1 ? 'seconds' : 'second'}` );
    }
    if ( left > 0 ) {
        timeString.push( `${left}ms` );
    }
    return timeString.join( ', ' );
}

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

document.querySelector('#startTestRunnerBtn')?.addEventListener('click', () => {
    if (!conn) {
        console.warn('cannot run tests: websocket connection not initialized');
        return;
    }
    if ( currentState === TestState.Ready || currentState === TestState.JobsFinished || currentState === TestState.Stopped ) {
        resultCollector.reset();
        // Releases the previous run's registry entries, selectors and outstanding set — see
        // `endRun()` in wsRunner.js for why a run must not simply be allowed to leak its state into
        // the next one.
        phaseRunner.endRun();
        resetTestUI();
        currentState = conn.readyState !== WebSocket.CLOSED && conn.readyState !== WebSocket.CLOSING ? TestState.Ready : TestState.JobsFinished;
        if ( conn.readyState !== WebSocket.OPEN ) {
            console.warn( 'cannot run tests: websocket connection is not ready' );
            console.warn( 'WebSocket readyState:', conn.readyState );
        } else {
            currentRunToken = crypto.randomUUID();
            setRiteSelectDisabledForRun( true );
            performance.mark( 'litcalTestRunnerStart' );
            const startBtnEl = document.querySelector('#startTestRunnerBtn');
            if (startBtnEl) {
                startBtnEl.disabled = false;
                startBtnEl.classList.remove('btn-secondary', 'btn-warning');
                startBtnEl.classList.add('btn-primary');
            }
            const rotateIcon = document.querySelector('#startTestRunnerBtn .fa-rotate, #startTestRunnerBtn .fa-stop');
            if (rotateIcon) {
                rotateIcon.classList.remove('fa-stop');
                rotateIcon.classList.add('fa-rotate', 'fa-spin');
            }
            setTestRunnerBtnLblTxt('Tests Running...');
            console.log( `currentState = ${currentState}` );
            runTests();
        }
    } else {
        // Stop the running test run
        console.log( 'Stopping test run...' );
        // Tell the server the run is abandoned, so it stops draining a backlog nobody is watching.
        // Must precede clearing currentRunToken: the cancel has to name the run it is stopping.
        sendCancelRun( conn, currentRunToken );
        phaseRunner.clearWatchdog();
        // Releases the stopped run's outstanding set, so a `giveUpOnOutstandingRequests()` call
        // reaching this page after a Stop (its exported seam, or the watchdog's callback in a race)
        // finds nothing outstanding to give up on — the same no-op it was before this state moved
        // into the runner.
        phaseRunner.endRun();
        currentState = TestState.Stopped;
        currentRunToken = null;
        setRiteSelectDisabledForRun( false );
        const spinIcon = document.querySelector('#startTestRunnerBtn .fa-spin');
        if (spinIcon) {
            spinIcon.classList.remove('fa-spin');
        }
        setTestRunnerBtnLblTxt('Tests Stopped');
        const startBtn = document.querySelector('#startTestRunnerBtn');
        if (startBtn) {
            startBtn.classList.remove('btn-primary');
            startBtn.classList.add('btn-warning');
        }
    }
});

document.querySelector('#APIResponseSelect')?.addEventListener('change', ( ev ) => {
    const pageLoader = document.querySelector('.page-loader');
    if (pageLoader) {
        pageLoader.style.display = 'block';
        pageLoader.style.opacity = '1';
    }
    ReadyToRunTests.PageReady = false;
    currentResponseType = ev.currentTarget.value;
    console.log( `currentResponseType: ${currentResponseType}` );
    setupPage();
    ReadyToRunTests.tryEnableBtn();
});

const pastRunsSelect = document.querySelector('#pastRunsSelect');

/** Populate the past-runs dropdown from the server (resources runs only). */
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
        resourceDataChecks: run.scaffold.resourceDataChecks.map( ( d ) => d.validate ),
        sourceDataChecks: run.scaffold.sourceDataChecks,
    });
    [ ...run.apiPathResults, ...run.sourceDataResults ].forEach( ( d ) => {
        applyResultToDom({ type: d.status, classes: d.selector, text: d.message });
    } );
    updateText('successfulCount', run.counts.successful);
    updateText('failedCount', run.counts.failed);
    // Per-phase Successful/Failed badges, derived from the stored descriptors
    const apiPathCounts = countByStatus( run.apiPathResults );
    const sourceDataCounts = countByStatus( run.sourceDataResults );
    updateText('successfulResourceDataTestsCount', apiPathCounts.successful);
    updateText('failedResourceDataTestsCount', apiPathCounts.failed);
    updateText('successfulSourceDataTestsCount', sourceDataCounts.successful);
    updateText('failedSourceDataTestsCount', sourceDataCounts.failed);
    updateText('total-time', MsToTimeString( run.duration ));
    updateText('totalResourceDataTestsTime', MsToTimeString( run.timings.apiPath ));
    updateText('totalSourceDataTestsTime', MsToTimeString( run.timings.sourceData ));
};

if ( pastRunsSelect ) {
    pastRunsSelect.addEventListener('change', ( e ) => {
        const startBtn = document.querySelector('#startTestRunnerBtn');
        if ( e.target.value === '' ) {
            if ( startBtn ) {
                startBtn.disabled = false;
            }
            // replayResourcesRun() does not mutate module vars, so no state resync is
            // needed, but the scaffold is stale (built from replay data). Rebuild it
            // from the live consts (resourcePaths / sourceDataChecks) before resetting UI.
            setupPage();
            resetTestUI();
            return;
        }
        if ( startBtn ) {
            startBtn.disabled = true;
        }
        replayResourcesRun( e.target.value ).catch( ( err ) => {
            console.error( 'Replay failed', err );
            safeToastShow('#results-load-failed');
        });
    });
    loadPastRuns();
}

// Store tooltips so we can hide them later
const tooltipMap = new Map();

// Show tooltip on click, hide on click outside, or copy to clipboard
document.body.addEventListener( 'click', function ( event ) {
    if ( event.target.closest( '.btn-copy' ) !== null ) {
        const tooltipElement = event.target.closest( '.tooltip' );
        const content = tooltipElement.querySelector( '.tooltip-content' ).innerHTML;
        const clipboardItem = new ClipboardItem({
            'text/html': new Blob([content], { type: 'text/html' }),
            'text/plain': new Blob([content], { type: 'text/plain' })
        });

        // Copy content to the clipboard
        navigator.clipboard.write( [clipboardItem] ).then( () => {
            console.info( 'Copied to clipboard!' );
        } ).catch( err => {
            console.error( 'Could not copy tooltip content: ', err );
        } );

        return;
    }

    const target = event.target.closest( '[data-bs-toggle="tooltip"]' );
    const tooltipEl = event.target.closest( '.wide-tooltip' );

    // When a click occurs anywhere except on the trigger element or the tooltip itself, hide the tooltip
    if ( !target && !tooltipEl ) {
        tooltipMap.forEach( t => t.hide() );
        tooltipMap.clear();
        return;
    }

    event.stopPropagation(); // Prevent document click from immediately hiding it

    // If tooltip already exists, show it
    let tooltip = tooltipMap.get( target );
    if ( !tooltip ) {
        // Create tooltip content with a "Copy to Clipboard" button

        tooltip = new bootstrap.Tooltip( target, {
            trigger: 'manual',
            html: true,
            customClass: 'wide-tooltip',
            sanitize: false
        } );
        const rawTitle = target.getAttribute( 'data-bs-title' );
        const linkifiedTitle = escapeQuotesAndLinkifyUrls( rawTitle );
        tooltip.setContent( {'.tooltip-inner': `<div class="d-flex align-items-start"><button class="btn-copy btn-primary btn-sm ms-1 me-2" title="Copy to clipboard"><i class="far fa-copy" aria-hidden="true"></i></button><div class="tooltip-content">${linkifiedTitle}</div></div>`} );
        tooltipMap.set( target, tooltip );
    }

    tooltip.show();
} );

// Optional: Hide tooltip on ESC key
document.addEventListener( 'keydown', function ( event ) {
    if ( event.key === 'Escape' ) {
        tooltipMap.forEach( t => t.hide() );
        tooltipMap.clear();
    }
} );

setEndpoints();
await mountRiteSelect();
loadAsyncData();
