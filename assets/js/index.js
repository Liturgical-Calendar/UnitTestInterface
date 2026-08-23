/**
 * Main test runner module for the LiturgicalCalendar Accuracy Test Interface.
 * Handles WebSocket communication, test execution, and result display.
 * @module index
 */

import {
    escapeHtmlAttr,
    escapeQuotesAndLinkifyUrls,
    fetchJson,
    hidePageLoader,
    safeCollapseShow,
    safeToastShow,
    updateText,
    slugify,
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
    toCalendarIdentity,
    testAppliesToRite,
    CALENDAR_SCOPE_KEYS,
    yearsForRite,
    fetchValidations,
    inventoryIdsForCalendar,
    isConditionalInventoryId,
    idToCardClass,
    readHello,
    resetHello,
    STEP_CARD_CLASS,
    TEST_RUN_STEP_CARD_CLASS,
    stepsForCheck,
    stepCardsHtml,
    checkCardSelector,
    testRunCardSelector,
} from './wsProtocol.js';

import { createPhaseRunner } from './wsRunner.js';

// `@liturgical-calendar/components-js` is deliberately NOT imported statically here. A static
// top-level `import … from` specifier that fails to resolve (CDN outage, blocked host in
// production, a stale symlink in development) fails the whole module's evaluation before any of
// its own code — including a try/catch — ever runs; nothing below this point would execute at
// all. `mountCalendarControls()` instead performs a dynamic `await import(...)` inside its own
// try/catch, so that failure is catchable and degrades to the `#controls-load-failed` toast
// (final review of #48, finding 1) instead of silently killing the page.

const resultCollector = createResultCollector();
let renderedUnitTests = [];

/** @typedef {import('./types.js').SourceDataCheckMessage} SourceDataCheckMessage */
/** @typedef {import('./types.js').WebSocketResponse} WebSocketResponse */
/** @typedef {import('./types.js').RomanMissalDefinition} RomanMissalDefinition */
/** @typedef {import('./types.js').NationalCalendarMetadata} NationalCalendarMetadata */

// Access global config from window (set by PHP in footer.php)
const {
    locale,
    WS_PROTOCOL,
    WS_PORT,
    WS_HOST,
    API_PROTOCOL,
    API_PORT,
    API_HOST,
    API_BASE_PATH,
    APP_ENV,
    riteSelectLabel: riteSelectLabelText = 'Liturgical Rite',
    calendarSelectLabel: calendarSelectLabelText = 'Liturgical Calendar',
} = window.LitCalConfig;

const thisYear = new Date().getFullYear();
const twentyFiveYearsFromNow = thisYear + 25;

/**
 * The library's per-rite properties table, captured once `mountCalendarControls()` has imported it.
 *
 * `null` until then, and if the import fails. `yearLowerBoundForRite()` treats that as "assume the
 * Roman floor", which is right in exactly that case: with no library there is no rite select either,
 * so the rite is still the default.
 *
 * @type {?Object<string, {minYear: number}>}
 */
let riteProperties = null;

/**
 * The years the calendar-data phase requests, for the currently selected rite.
 *
 * Rebuilt by `setupPage()` rather than fixed at module load: the lower bound is rite-dependent
 * (see `yearsForRite()`), and requesting a year the rite cannot serve wedges the phase counter
 * rather than merely reddening a card (#52). The value here is only the pre-mount placeholder — the
 * library has not loaded yet, so it resolves to the Roman floor, which is what the page starts on.
 *
 * @type {Array<number>}
 */
let Years = yearsForRite( 'roman', twentyFiveYearsFromNow, riteProperties );

/**
 * An object that holds the different API endpoint URLs used in the application.
 * Populated by setEndpoints() based on the configured API_BASE_PATH.
 * @readonly
 * @enum {string}
 * @property {string} CALENDARS - endpoint for the index of available calendars
 * @property {string} TESTS - endpoint for the index of available tests
 * @property {string} DECREES - endpoint for decrees
 * @property {string} MISSALS - endpoint for missals
 */
const ENDPOINTS = {
    CALENDARS: "",
    TESTS: "",
    DECREES: "",
    MISSALS: ""
}

/**
 * The `/validations` inventory, as fetched by `fetchMetadataAndTests()`.
 *
 * Empty until that fetch resolves. `buildSourceDataChecks()` reads it to resolve the ids
 * `inventoryIdsForCalendar()` composes into the advertised `{id, label, steps}` shape.
 *
 * @type {Array<{id: string, kind: string, rite: string, region: ?string, label: string, schema: string, steps: Array<string>}>}
 */
let ValidationsInventory = [];

/**
 * Whether {@link ValidationsInventory} has been populated.
 *
 * `fetchMetadataAndTests()` gates `ReadyToRunTests.AsyncDataReady` on four fetches now instead of
 * three; a bare `ValidationsInventory.length > 0` would be indistinguishable from "not fetched yet"
 * if the API ever legitimately advertised zero items, so readiness is tracked separately.
 *
 * @type {boolean}
 */
let ValidationsInventoryReady = false;

/**
 * The source-data checks for a calendar, as inventory items plus the one URL check this page renders
 * alongside them.
 *
 * `LitCalMetadata` is a *resource* check living in a source-data phase: it validates the `/calendars`
 * response, has no inventory id, and stays on `executeValidation`. Everything else is an id the API
 * advertised.
 *
 * @param {object} scope
 * @param {string} scope.rite - The rite whose universal corpus is checked (see
 *   `inventoryIdsForCalendar()`: Roman for a national/diocesan calendar regardless of the
 *   calendar's own rite; the selected rite itself for a rite-level calendar).
 * @param {string} scope.dioceseRite - The rite that qualifies `scope.dioceseId`; equal to
 *   `scope.rite` when there is no diocese.
 * @param {?string} scope.nation - The nation code, or null for a rite-level calendar.
 * @param {?string} scope.widerRegion - The nation's wider region, or null.
 * @param {Array<string>} scope.missals - The nation's missal ids, e.g. `['IT_1983']`.
 * @param {?string} scope.dioceseId - The diocese calendar id, or null when not a diocesan calendar.
 * @returns {Array<object>}
 */
const buildSourceDataChecks = ( { rite, dioceseRite, nation, widerRegion, missals, dioceseId } ) => {
    const checks = [ {
        validate: 'LitCalMetadata',
        sourceFile: ENDPOINTS.CALENDARS,
        category: 'universalcalendar'
    } ];
    const advertised = new Map( ValidationsInventory.map( item => [ item.id, item ] ) );
    inventoryIdsForCalendar( { rite, dioceseRite, nation, widerRegion, missals, dioceseId } ).forEach( id => {
        const item = advertised.get( id );
        if ( undefined === item ) {
            if ( isConditionalInventoryId( id ) ) {
                // Not a disagreement: the server publishes this family only when the folder exists
                // (see `isConditionalInventoryId()`), so an absence here is the contract being kept.
                return;
            }
            // Said out loud rather than skipped silently: the inventory is the contract now, so an id
            // this page composed that the server does not advertise is a real disagreement.
            console.warn( `The API advertises no checkable item "${id}"; it will not be checked.` );
            return;
        }
        checks.push( { id: item.id, label: item.label, steps: item.steps } );
    } );
    return checks;
};

/**
 * Sets the API endpoints based on the configured API_BASE_PATH environment variable.
 * The API version is determined by the server configuration, not user selection,
 * since the WebSocket server can only validate against a single API base path.
 *
 * @return {void}
 */
const setEndpoints = () => {
    let API_PATH;
    if ( APP_ENV === 'production' ) {
        const basePath = API_BASE_PATH.replace(/^\/|\/$/g, ''); // strip leading/trailing slashes
        // An empty base path (API served at the root, e.g. the docker stack) must collapse to a
        // single '/', otherwise the endpoint URL gets a double slash (…:8000//calendars) which the
        // server can't match to a route when detecting the schema.
        API_PATH = basePath === '' ? '/' : `/${basePath}/`;
    } else {
        API_PATH = '/';
    }
    const API_PORT_STR = [ 443, 80 ].includes( API_PORT ) ? '' : `:${API_PORT}`;
    ENDPOINTS.CALENDARS = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}calendars`;
    ENDPOINTS.TESTS = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}tests`;
    ENDPOINTS.DECREES = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}decrees`;
    ENDPOINTS.MISSALS = `${API_PROTOCOL}://${API_HOST}${API_PORT_STR}${API_PATH}missals`;
    console.info(`setEndpoints: APP_ENV=${APP_ENV}, API_PATH=${API_PATH}`);
}

/**
 * The API's base URL, without a trailing slash and without an endpoint.
 *
 * `setEndpoints()` builds per-endpoint URLs from the same parts; this is what ApiClient and
 * ApiBase want instead. Derived rather than stored so the two cannot drift.
 *
 * @returns {string}
 */
const getApiBaseUrl = () => {
    const endpoint = ENDPOINTS.CALENDARS;
    return endpoint.replace(/\/calendars$/, '');
};

/**
 * The loaded metadata base shared by the library's selects and by our own check builders.
 *
 * One instance, so `/calendars` is fetched once rather than once per consumer, and so the
 * dioceses our checks iterate are exactly the ones the calendar select offers.
 *
 * @type {?import('@liturgical-calendar/components-js').ApiBase}
 */
let apiBase = null;

/** @type {?import('@liturgical-calendar/components-js').RiteSelect} */
let riteSelect = null;

/** @type {?import('@liturgical-calendar/components-js').CalendarSelect} */
let calendarSelect = null;

/**
 * Mounts the rite select and the calendar select, linked to one another.
 *
 * Order matters and is enforced by the library: `linkToRiteSelect()` attaches a listener to the
 * rite select's DOM element, so that element must already be mounted. Linking also switches the
 * calendar select into rite-aware mode, which is what makes its empty option self-label as the
 * rite-level calendar ("General Roman Calendar" / "Ambrosian Calendar") instead of "---".
 *
 * `linkToRiteSelect()` defaults to dispatching `change` on the calendar select after every rite
 * change and after the initial apply, which is what drives our own change handler and therefore
 * `setupPage()`. Do not pass `false` — nothing else would rebuild the scaffold.
 *
 * @returns {Promise<void>}
 */
const mountCalendarControls = async () => {
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
        // A CDN or metadata failure leaves both mount points empty. Say so: without this the page
        // shows a control-less header and an empty scaffold, which reads like "nothing to check"
        // rather than like a failure, and the run button stays disabled with no explanation.
        console.error( 'Could not initialise the calendar controls', err );
        safeToastShow( '#controls-load-failed' );
        return;
    }
    const { ApiBase, CalendarSelect, RiteSelect, CalendarSelectFilter, RiteProperties } = componentsJs;
    // The library's own copy of the API's per-rite year floors, and the same table its rite select
    // is built from — so every rite the user can pick has an entry. See `yearLowerBoundForRite()`.
    riteProperties = RiteProperties ?? null;
    apiBase = ApiBase.resolve( baseUrl );

    riteSelect = new RiteSelect( locale )
        .id( 'riteSelect' )
        .class( 'form-select form-select-sm' )
        .label( { class: 'form-label', text: riteSelectLabelText } );
    riteSelect.appendTo( '#riteSelectMount' );

    calendarSelect = new CalendarSelect( locale )
        .filter( CalendarSelectFilter.NONE )
        .allowNull( true )
        .id( 'APICalendarSelect' )
        .class( 'form-select form-select-sm' )
        .label( { class: 'form-label', text: calendarSelectLabelText } );
    calendarSelect.appendTo( '#calendarSelectMount' );

    calendarSelect.linkToRiteSelect( riteSelect );

    riteSelect._domElement.addEventListener( 'change', () => {
        currentRite = riteSelect._domElement.value;
    } );
};

class ReadyToRunTests {
    static PageReady = false;
    static SocketReady = false;
    static AsyncDataReady = false;

    /**
     * Check if all conditions are met to run tests.
     * The conditions are:
     * - PageReady: page has finished loading
     * - SocketReady: Websocket connection is ready
     * - AsyncDataReady: all relevant data has finished loading
     * @return {boolean} true if all conditions are met
     */
    static check() {
        return ( ReadyToRunTests.PageReady === true && ReadyToRunTests.SocketReady === true && ReadyToRunTests.AsyncDataReady === true );
    }

    /**
     * Check if all conditions are met to run tests and if so, enables the start test runner button.
     * The conditions are:
     * - PageReady: page has finished loading
     * - SocketReady: Websocket connection is ready
     * - AsyncDataReady: all relevant data has finished loading
     * Additionally, the method makes sure that the #startTestRunnerBtnLbl is set to the stored value
     * and that the page loader is hidden.
     */
    static tryEnableBtn() {
        console.log( 'ReadyToRunTests.SocketReady = ' + ReadyToRunTests.SocketReady );
        console.log( 'ReadyToRunTests.AsyncDataReady = ' + ReadyToRunTests.AsyncDataReady );
        console.log( 'ReadyToRunTests.PageReady = ' + ReadyToRunTests.PageReady );
        const testsReady = ReadyToRunTests.check();
        const startBtn = document.querySelector('#startTestRunnerBtn');
        if (!startBtn) {
            console.warn('Start button not found');
            return;
        }
        startBtn.disabled = !testsReady;
        startBtn.classList.remove('btn-secondary');
        startBtn.classList.add('btn-primary');
        const stopIcon = startBtn.querySelector('.fa-stop');
        if (stopIcon) {
            stopIcon.classList.remove('fa-stop');
            stopIcon.classList.add('fa-rotate');
        }
        if ( testsReady ) {
            // only try to set the #startTestRunnerBtnLbl with the stored value when the page is ready
            // to prevent if from being set to an empty value (before we have actually stored the original value)
            setTestRunnerBtnLblTxt( startTestRunnerBtnLbl );
            hidePageLoader();
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
        if ( hours > 0 ) {
            timeString.push( `${hours} ${hours > 1 ? 'hours' : 'hour'}` );
        }
    }
    if ( left > 60000 ) {
        ms = left;
        left = ms % 60000;
        ms -= left;
        let minutes = ms / 60000;
        if ( minutes > 0 ) {
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

class TestState {
    static ReadyState = new TestState( 'ReadyState' );
    static ExecutingValidations = new TestState( 'ExecutingValidations' );
    static ValidatingCalendarData = new TestState( 'ValidatingCalendarData' );
    static SpecificUnitTests = new TestState( 'SpecificUnitTests' );
    static JobsFinished = new TestState( 'JobsFinished' );
    static Stopped = new TestState( 'Stopped' );

    /**
     * Constructs a new TestState object.
     * @param {string} name The name of the TestState, which must be one of the
     *                      following: NotReady, Ready,
     *                      ExecutingResourceValidations,
     *                      ExecutingSourceValidations, JobsFinished.
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
 * The pending-state icon every card on this page is scaffolded with.
 *
 * `resources.js` inlines the same glyph as SVG instead; that difference is why {@link stepCardsHtml}
 * takes the icon as a parameter rather than owning one.
 *
 * @type {string}
 */
const CARD_ICON = '<i class="fas fa-circle-question fa-fw" aria-hidden="true"></i>';

/**
 * Returns a string that represents the HTML template for a specific calendar.
 * This template is used in the index page to represent the state of a calendar test.
 * The template has the following structure:
 * - A paragraph with the name of the calendar that is being tested.
 * - One card per step of the *check* frame family, from `STEP_CARD_CLASS` via `stepsForCheck()`.
 * The template is used by the `calendarTemplate` function in `index.js`.
 *
 * Calendar-data validation is not driven by a `/validations` item and so advertises no `steps` of
 * its own — the `yearChecks` this scaffolds for are built locally in `runTests()`. It is rendered
 * through `stepsForCheck()` all the same, with no argument, so it takes the *same* fallback
 * `beginPhase()` applies to those same step-less checks. That is the whole point: the cards drawn
 * here and the cards registered there come from one expression, not from two threes that happen to
 * match (#62).
 *
 * @param {string} calendarName The name of the calendar that is being tested.
 * @param {number|null} [year=null] Optional year to include as a class on card elements.
 * @return {string} The HTML template as a string.
 */
const testTemplate = ( calendarName, year = null ) => {
    const calendarSlug = slugify(calendarName);
    const yearClass = year !== null ? ` year-${year}` : '';
    // The `parses` card names the response format being validated, so it has to be rendered with the
    // *currently selected* one. Rendering a literal `JSON` here made the `#APIResponseSelect` handler
    // a no-op in effect: it rewrote every `.response-type` span, then called `setupPage()`, which
    // rebuilt these very cards from this template and put `JSON` straight back. Choosing YAML, XML or
    // ICS therefore left the cards claiming JSON while the run validated something else.
    return `
<p class="text-center mb-0 bg-secondary text-white currentSelectedCalendar" title="${calendarName}">${truncate( calendarName, 22 )}</p>
${stepCardsHtml({
    steps: stepsForCheck(),
    classesFor: cardClass => `${cardClass} calendar-${calendarSlug}${yearClass}`,
    icon: CARD_ICON,
    responseType: currentResponseType,
    spread: false
})}
`;
}

/**
 * Returns a string that represents the HTML template for a specific year of calendar data testing.
 * This template is used in the index page to represent the state of a calendar test.
 * The template has the following structure:
 * - A paragraph with the year of the calendar being tested.
 * @param {number} idx The index of the year to be tested.
 * @param {Array<number>} years The years array for the current run (may differ from the global Years on replay).
 * @return {string} The HTML template as a string.
 */
const calDataTestTemplate = ( idx, years ) => {
    let i = years.length - idx;
    let year = years[ i ];
    return `
<div class="col-1${i === 0 || i % 10 === 0 ? ' offset-1' : ''}">
    <p class="text-center mb-0 year-${year} fw-bold">${year}</p>
</div>
`;
}

/**
 * Returns a string that represents the HTML template for a specific source data check.
 * The template has the following structure:
 * - A paragraph with the name of the source data check.
 * - One card per step the check advertised, from `stepsForCheck()` — `step-exists` for `exists`,
 *   `step-parses` for `parses`, `step-validates` for `validates`. A check that advertises no `steps`
 *   (the `LitCalMetadata` URL check, and any run stored before the #42 migration) gets all three.
 * The template is used by the `index.js` script.
 *
 * Two shapes reach this template. A live run supplies an advertised inventory item —
 * `{id, label, steps}` — whose caption is the server's own label and whose tooltip is the id the
 * request actually carries; that is the shape #42 moves this page to. The URL check this page
 * still renders directly (`LitCalMetadata`), and any run stored before this migration replayed
 * from the Past Runs dropdown, carry the old `{validate, category, sourceFile|sourceFolder}`
 * shape instead — a slug this page invented and the repo-relative path it invented it from.
 * Replaying those stored runs is not optional, so both shapes must render.
 *
 * @param {object} item An inventory item (`{id, label, steps}`) or a `{validate, category, sourceFile}` URL/legacy check.
 * @param {number} idx The index of the source data check.
 * @return {string} The HTML template as a string.
 */
const sourceDataCheckTemplate = ( item, idx ) => {
    const fromInventory = undefined !== item.id;

    let categoryStr;
    // Category descriptions keyed off a `validate` slug prefix only ever matched the legacy
    // slug families (`national-calendar-`, `wider-region-`, `diocesan-calendar-`,
    // `proprium-de-sanctis-`) this page composed before #42; an inventory item carries no
    // `validate` at all, so this only runs for the URL check and for replayed pre-#42 runs.
    if ( false === fromInventory ) {
        if ( item.validate.startsWith('national-calendar-') ) {
            categoryStr = 'National Calendar definition: defines any actions that need to be taken on the liturgical events already defined in the Universal Calendar, to adapt them to this specific National Calendar';
        } else if ( item.validate.startsWith('wider-region-') ) {
            categoryStr = 'Wider Region definition: contains any liturgical events that apply not only to a particular nation, but to a group of nations that belong to the wider region. There will also be translation files associated with this data';
        } else if ( item.validate.startsWith('diocesan-calendar-') ) {
            categoryStr = 'Diocesan Calendar definition: contains any liturgical events that are proper to the given diocese. This data will not overwrite national or universal calendar data, it will be simply appended to the calendar';
        } else if ( item.validate.startsWith('proprium-de-sanctis-') ) {
            categoryStr = 'Proprium de Sanctis data: contains any liturgical events defined in the Missal printed for the given nation, that are not already defined in the Universal Calendar';
        }
    }
    const validateSlug = fromInventory ? idToCardClass( item.id ) : slugify( item.validate );
    // An inventory item with an absent/null label falls back to `validate` (which it doesn't
    // have) and then to `id`, so a caption is never the literal string "undefined" -- exactly the
    // defect the tooltip comment below already records having been fixed once.
    const caption = item.label ?? item.validate ?? item.id;
    // A legacy check names either a single file or a folder of i18n files, never both. Reading
    // only `sourceFile` rendered `title="undefined"` for every folder check.
    const tooltip = item.id ?? item.sourceFile ?? item.sourceFolder ?? '';
    const escapedTooltip = escapeHtmlAttr(tooltip);
    const escapedCaption = escapeHtmlAttr(caption);
    const infoIcon = categoryStr ? ` <span role="button" data-bs-toggle="tooltip" data-bs-title="${escapeHtmlAttr(categoryStr)}"><i class="fas fa-circle-info fa-fw" aria-hidden="true"></i></span>` : '';
    // The label is not truncated to a character budget: it wraps, exactly as `resources.js`'s
    // `sourceTemplate()` renders these same slugs. A character count is only a proxy for pixel
    // width and cannot know glyph widths, which is how the previous 30-char budget for folder
    // checks failed on precisely one label: `ambrosian-proprium-de-tempore*` overflowed its
    // `col-1` and wrapped, while the equally long `ambrosian-proprium-de-sanctis*` fit, because
    // `m` is far wider than `i`. Widening or narrowing the budget only moves that boundary.
    //
    // Equal-height label boxes — so a slug that needs two or three lines pushes every card on its
    // grid line down together instead of misaligning its own column — are `common.css`'s job, via
    // the flex rule on `.sourcedata-tests > div`. Nothing here needs a height.
    return `<div class="col-1${idx === 0 || idx % 11 === 0 ? ' offset-1' : ''}">
    <p class="text-center mt-1 mb-0 bg-secondary text-white"><span title="${escapedTooltip}" class="text-break d-inline-block w-75">${escapedCaption}</span>${( false === fromInventory && item.category !== 'universalcalendar' ) ? infoIcon : ''}</p>
${stepCardsHtml({
    steps: stepsForCheck( item ),
    classesFor: cardClass => `${validateSlug} ${cardClass}`,
    icon: CARD_ICON
})}
</div>
`;
}


const truncate = ( source, size ) => source.length > size ? source.slice( 0, size - 1 ) + "*" : source;

/**
 * The options used to format the date in the assertions.
 * @constant
 * @type {Object}
 * @property {string} weekday - The representation of the weekday. Possible values include "long", "short", "narrow".
 * @property {string} year - The representation of the year. Possible values include "numeric", "2-digit".
 * @property {string} month - The representation of the month. Possible values include "long", "short", "narrow".
 * @property {string} day - The representation of the day. Possible values include "numeric", "2-digit".
 * @property {string} timeZone - The time zone to use. The only value currently supported is "UTC".
 */
const IntlDTOptions = {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
};


let MetaData = null;
let UnitTests = null;
let RomanMissals = null;
let currentState;

let startTestRunnerBtnLbl = '';

let successfulTests = 0;
let failedTests = 0;

let successfulSourceDataTests = 0;
let failedSourceDataTests = 0;

let successfulCalendarDataTests = 0;
let failedCalendarDataTests = 0;

let successfulUnitTests = 0;
let failedUnitTests = 0;

let connectionAttempt = null;
let conn;
let currentRunToken = null;

/**
 * Count a frame we could not attribute to a specific check.
 *
 * The frame is unusable, but the *phase* is still known from `currentState`, so the failure
 * is booked against both the global total and the current phase's total. Incrementing only
 * the global one would leave the header count and the per-phase counts disagreeing, which is
 * the same silent drift #43 flags for unmatched selectors.
 *
 * Module scope, not inside `connectWebSocket()`: `phaseRunner`'s `onUnattributableFailure`
 * callback is built at module load, and a `countUnattributableFailure` defined inside the
 * connection closure would not exist yet when that callback is constructed (see resources.js,
 * where the same move fixed a `ReferenceError` the watchdog's callback would otherwise raise).
 *
 * @returns {void}
 */
const countUnattributableFailure = () => {
    updateText( 'failedCount', ++failedTests );
    switch ( currentState ) {
        case TestState.ExecutingValidations:
            updateText( 'failedSourceDataTestsCount', ++failedSourceDataTests );
            break;
        case TestState.ValidatingCalendarData:
            updateText( 'failedCalendarDataTestsCount', ++failedCalendarDataTests );
            break;
        case TestState.SpecificUnitTests:
            // Only the phase total: without a usable `test` property there is no per-test
            // accordion counter to attribute it to.
            updateText( 'failedUnitTestsCount', ++failedUnitTests );
            break;
    }
};

/**
 * Re-read one unit test's failed-card tally from the DOM.
 *
 * The `error` step branch resolves the test a frame belongs to from `target.id`, but a
 * `protocolError` frame carries no `target` at all — so an attributed rejection (#70) would leave
 * this counter reading fewer failures than the accordion has red cards, which is exactly the drift
 * between the totals and the rendered cards that #42 set out to remove.
 *
 * The card the runner painted is the attribution instead: it sits inside its own test's accordion
 * panel, whose id (`specificUnitTest-{slug}`) names the test, and the per-test counter is a DOM
 * tally of `.bg-danger` within that panel in the first place — the same query the `error` branch
 * runs, reached from the card rather than from the frame.
 *
 * @param {?Element} card - The card just painted.
 * @returns {void}
 */
const refreshUnitTestFailedCount = ( card ) => {
    const panelId = card?.closest( '.accordion-collapse' )?.id ?? '';
    if ( false === panelId.startsWith( 'specificUnitTest-' ) ) {
        return;
    }
    const testSlug = panelId.slice( 'specificUnitTest-'.length );
    updateText( `failed${testSlug}TestsCount`, document.querySelectorAll( `#${panelId} .bg-danger` ).length );
};

/**
 * The one phase runner for this page's phases.
 *
 * Replaces what this page used to own directly: the registry-backed painter (painting by the CSS
 * selector the server composed, replaced per the coupling #42 removes), the phase watchdog, the
 * request-id minting and the send path. `resources.js` needs the same four, so they live in
 * {@link createPhaseRunner} — shared rather than copied, which is what #42 exists to achieve.
 *
 * `canAdvance()` collapses the two advance guards this page used to keep separately —
 * `currentState !== JobsFinished` for a terminal frame and
 * `currentState !== JobsFinished && currentState !== Stopped` for giving up — into the single,
 * stricter guard. Behaviour-preserving, not a widening: `conn.onmessage` already returns early
 * once `currentState === Stopped`, so the terminal-frame path is unreachable in that state
 * regardless. See {@link createPhaseRunner}'s `giveUpOnOutstandingRequests`.
 */
const phaseRunner = createPhaseRunner( {
    // A resource-less URL check (`LitCalMetadata`) carries no `id` and is known by its own
    // `validate` slug; every other check is an inventory item, known by the opaque `id` the
    // server minted, turned into a class with `idToCardClass()`.
    cardSlugFor: ( check ) => ( undefined === check.id ? slugify( check.validate ) : idToCardClass( check.id ) ),
    onAdvance: () => runTests(),
    onUnattributableFailure: () => countUnattributableFailure(),
    // One card the runner painted red for a request the server rejected outright (#70). Recorded
    // and counted exactly as an `error` step frame for that card would be: the global and phase
    // totals through `countUnattributableFailure()` — same arithmetic, the difference being that
    // this failure *is* attributed, to a card painted with the rejection text — plus, in the
    // unit-test phase, the per-test accordion counter that only an attributed failure can reach.
    onAttributedFailure: ( frame, selector, card ) => {
        resultCollector.record( phaseForState(), frame, selector );
        countUnattributableFailure();
        if ( currentState === TestState.SpecificUnitTests ) {
            refreshUnitTestFailedCount( card );
        }
    },
    // `conn.onopen` only resets `currentState` when no run is in flight (#66), so a mid-run
    // reconnect cannot land the watchdog in the `ReadyState` case and restart a phase. Note that
    // adding `currentRunToken !== null` here would be inert: the token stays set across exactly
    // that window, so the guard had to go in `onopen`, not in this predicate.
    canAdvance: () => currentState !== TestState.JobsFinished && currentState !== TestState.Stopped,
    socket: () => conn,
    runToken: () => currentRunToken
} );

/**
 * Exported only so a spec can trigger the watchdog without waiting out the clock. See wsRunner.js.
 */
export const giveUpOnOutstandingRequests = () => phaseRunner.giveUpOnOutstandingRequests();

// The rite-level calendar of the default rite, which is what the calendar select's empty option
// selects on mount. Not 'VA': `Health::buildCalendarRequestPath()` resolves both to /roman/{year},
// but Vatican City is to gain its own national calendar data distinct from the General Roman
// Calendar, so the two must stop sharing an identifier.
let currentSelectedCalendar = "roman";
let currentNationalCalendar = null;
let currentCalendarCategory = "ritecalendar";
/**
 * The typed calendar identity the v2 `validateCalendar` message carries — `{kind, id?, rite}`.
 *
 * Derived once, in `resolveCalendarTargetFromControls()`, from the same `data-calendartype` dataset
 * read that already produces `currentCalendarCategory`, and kept in sync by that function's two
 * callers (`handleCalendarSelectChange()` and `resyncLiveStateFromDom()`). Not re-derived at
 * send-time: a second reader of that dataset attribute would invite the two drifting apart.
 */
let currentCalendarIdentity = { kind: 'rite', rite: 'roman' };
/**
 * The liturgical rite of the currently selected calendar.
 * Derived from the rite select's own value (see `resolveCalendarTargetFromControls()`); 'roman' by default.
 */
let currentRite = "roman";
let currentResponseType = "JSON";
let currentSourceDataChecks = [];
let SpecificUnitTestCategories = [];
let SpecificUnitTestYears = {};

/**
 * Manages the state of the test runner, executing tests and reporting results
 * @function runTests
 * @description
 * This function is called by the test runner button, and it manages the state of
 * the test runner, executing tests and reporting results. It transitions through
 * several states, including:
 * - ReadyState: The initial state of the test runner, which is entered when the
 *   test runner button is clicked. In this state, the test runner uncollapses the
 *   accordion for the current tests and sends the first source data test to the
 *   worker.
 * - ExecutingValidations: In this state, the test runner sends source data tests
 *   to the worker, and when all source data tests have been sent, it transitions
 *   to the ValidatingCalendarData state.
 * - ValidatingCalendarData: In this state, the test runner sends calendar data
 *   tests to the worker, and when all calendar data tests have been sent, it
 *   transitions to the SpecificUnitTests state.
 * - SpecificUnitTests: In this state, the test runner sends specific unit tests
 *   to the worker, and when all specific unit tests have been sent, it transitions
 *   to the JobsFinished state.
 * - JobsFinished: In this state, the test runner reports that all jobs have been
 *   finished, and it becomes ready to start a new test run.
 */
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
        rite: currentRite,
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

const runTests = () => {
    switch ( currentState ) {
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
                currentState = TestState.ValidatingCalendarData;
                performance.mark( 'calendarDataTestsStart' );
                safeCollapseShow('#calendarDataTests');

                // Calendar cards are addressed `.calendar-{slug}.{step-class}.year-{n}`, not the
                // default `.{cardSlugFor(check)}.{step-class}` `beginPhase()` would otherwise use, so
                // a custom `cardSelectorFor` is supplied.
                const calendarSlug = slugify( currentSelectedCalendar );
                // `id` is not read by `cardSelectorFor` above; it only names this check in
                // `beginPhase()`'s own diagnostics (`check.id ?? check.validate`), so a missing card
                // warns about a specific year instead of "undefined".
                const yearChecks = Years.map( year => ( { id: `year-${year}`, year } ) );

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
                        calendar: currentCalendarIdentity,
                        year: check.year,
                        responseFormat: currentResponseType,
                        requestId: check.requestId
                    } );
                } );
                phaseRunner.advanceIfPhaseIsEmpty();
            }
            break;
        case TestState.ValidatingCalendarData:
            if ( 0 === phaseRunner.outstandingCount() ) {
                console.log( 'Calendar data validation jobs are finished! Now continuing to specific unit tests...' );
                currentState = TestState.SpecificUnitTests;
                performance.mark( 'specificUnitTestsStart' );
                safeCollapseShow('#specificUnitTests');

                // One check per (test, year) pair, registered up front — the same move made for
                // calendar-data in the `ExecutingValidations` case above (`yearChecks`) — so this
                // phase, too, ends on the terminal frames of the requests it started rather than
                // being walked one response at a time.
                //
                // `steps: ['validates']` is set explicitly rather than left to `beginPhase()`'s
                // default (every step in `STEP_CARD_CLASS`, the *check* family's three): a test run
                // reports exactly one step, and defaulting here would have `beginPhase()` probe for
                // `exists`/`parses` cards that this phase never renders, logging a spurious warning
                // for every single check.
                //
                // `id` is not read by `cardSelectorFor` below; it only names this check in
                // `beginPhase()`'s own diagnostics (`check.id ?? check.validate`), so a missing card
                // warns about a specific test and year instead of "undefined".
                const testChecks = SpecificUnitTestCategories.flatMap( category =>
                    SpecificUnitTestYears[ category.test ].map( year => ( {
                        id: `${category.test}-year-${year}`,
                        test: category.test,
                        year,
                        steps: [ 'validates' ]
                    } ) )
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
                        calendar: currentCalendarIdentity,
                        year: check.year,
                        requestId: check.requestId
                    } );
                } );
                phaseRunner.advanceIfPhaseIsEmpty();
            }
            break;
        case TestState.SpecificUnitTests:
            if ( 0 === phaseRunner.outstandingCount() ) {
                currentState = TestState.JobsFinished;
                runTests();
            }
            break;
        case TestState.JobsFinished: {
            console.log( 'All jobs finished!' );
            phaseRunner.clearWatchdog();
            // The unit-test phase's checks are now all sent up front and run in parallel, so there is
            // no longer a sequential point between individual tests for a per-test mark to fire at —
            // the per-test `specificUnitTest{Name}Start`/`End` marks and `total{Test}TestsTime`
            // updates this phase used to make are gone along with the walk that drove them. The phase
            // is marked as a whole instead: `specificUnitTestsStart` was set when this phase began,
            // and this is the definite end of it, reached exactly once, on the terminal frame that
            // empties the phase's outstanding set. The `total{Test}TestsTime` elements themselves are
            // left at the "0" `appendAccordionItem()` renders them with — `resetTestUI()` already
            // zeroes every `[id$="TestsTime"]` element at the start of a run and scaffold rebuild, so
            // leaving them unwritten here shows a neutral default, never a stale value from a
            // previous run.
            performance.mark( 'specificUnitTestsEnd' );
            performance.measure( 'litcalUnitTestRunner', 'specificUnitTestsStart', 'specificUnitTestsEnd' );
            safeToastShow('#tests-complete');
            currentRunToken = null;
            setScaffoldControlsDisabledForRun( false );
            const spinIcon = document.querySelector('.fa-spin');
            if (spinIcon) {
                spinIcon.classList.remove('fa-spin', 'fa-rotate');
                spinIcon.classList.add('fa-stop');
            }
            setTestRunnerBtnLblTxt( 'Tests Complete' );
            postRunResults( buildCalendarsPayload() )
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
 * Connects to the websocket server at wss://litcal-test.johnromanodorazio.com
 * and sets up event listeners for the open, message, close, and error events.
 * If the connection is successful, it sets the state to ReadyState and tries
 * to enable the test runner button. If the connection is closed, it sets the
 * state to JobsFinished and tries to enable the test runner button. If an
 * error occurs, it sets the state to JobsFinished and shows an error toast.
 */
const connectWebSocket = () => {
    // Guard against creating multiple connections
    if (conn && (conn.readyState === WebSocket.OPEN || conn.readyState === WebSocket.CONNECTING)) {
        console.log('WebSocket connection already exists, skipping new connection');
        return;
    }
    console.log( `Connecting to websocket... WS_PROTOCOL: ${WS_PROTOCOL}, WS_HOST: ${WS_HOST}, WS_PORT: ${WS_PORT}` );
    const websocketURL = `${WS_PROTOCOL}://${WS_HOST}${[ 443, 80 ].includes( WS_PORT ) ? '' : `:${WS_PORT}`}`;
    conn = new WebSocket( websocketURL );

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
        // Only when no run is in flight (#66). A mid-run socket drop that reconnects must not reset
        // the state machine: the silence watchdog would then see `ReadyState`, `canAdvance()` would
        // return true, and `onAdvance()` -> `runTests()` would re-enter the `ReadyState` case and
        // re-send the entire source-data phase on the new socket under the stale run token,
        // doubling every counter against an already-painted scaffold. Preserving the phase lets the
        // watchdog give up on the outstanding requests and advance the run normally instead.
        if ( null === currentRunToken ) {
            currentState = TestState.ReadyState;
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
     * If the message is a success, it updates the corresponding success count and
     * marks the test as successful. If the message is an error, it updates the
     * corresponding failed count and marks the test as failed. If the test is
     * finished, it updates the total test time and displays it.
     */
    conn.onmessage = ( e ) => {
        // Parsed once, before the run guards, because one frame is not about a run: the server's
        // `hello` arrives on connect and carries no run token — which is exactly what makes it
        // invisible to a client that predates it, and exactly why the guards below would discard
        // it. This page used to return early on `currentRunToken === null`, which is always true at
        // connect time, so the handshake was thrown away before `readHello()` could be reached at
        // all; reading it is #69 item 1, and the restructuring is the substance of it.
        // See readHello(), and the matching shape in resources.js.
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
        // We only reach here with an active run (currentRunToken !== null), so require every
        // response to carry the matching token. This discards both mismatched responses from a
        // previous run and untagged stragglers that could otherwise mutate the new run's UI.
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

        // A rejection is an *ending* for the request it names (#70). Handled here rather than left
        // to the `type` dispatch below, which had no branch for it: the frame fell through to the
        // unattributable `else`, booked one failure for a request whose scaffold rendered three
        // cards, and — carrying no `step: 'complete'` — never ended the request, so the phase sat
        // out the full silence watchdog even though the server had answered instantly.
        if ( phaseRunner.handleProtocolError( responseData ) ) {
            return;
        }

        try {
            if ( responseData.type === "success" ) {
                phaseRunner.paintResult( responseData );
                // `selectorFor()` returns null when the phase never registered this requestId/step
                // pair (or registered it but the card was not found in the DOM), or when the frame
                // carries no requestId at all (live behaviour against a server predating the typed
                // protocol). Recorded as `selector: null` rather than falling back to the server's
                // `classes` string, which this migration removed as a wire-correlation mechanism.
                resultCollector.record( phaseForState(), responseData, phaseRunner.selectorFor( responseData.requestId, responseData.step ) ?? null );
                updateText('successfulCount', ++successfulTests);
                switch ( currentState ) {
                    case TestState.ExecutingValidations: {
                        updateText('successfulSourceDataTestsCount', ++successfulSourceDataTests);
                        break;
                    }
                    case TestState.ValidatingCalendarData: {
                        updateText('successfulCalendarDataTestsCount', ++successfulCalendarDataTests);
                        break;
                    }
                    case TestState.SpecificUnitTests: {
                        updateText('successfulUnitTestsCount', ++successfulUnitTests);
                        // `responseData.test` is not part of the published `WebSocketFrame.json`
                        // schema — the server never sends it. `target.id` is the real source: a
                        // test-run frame's `target` is built by `Health::sendTestResult()` via
                        // `frameTarget($test, [...])`, so `target.id` names the test.
                        // `responseData.test` is kept only as a fallback for a stub or server that
                        // predates the typed target.
                        const testName = responseData.target?.id ?? responseData.test;
                        const testSlug = slugify(testName);
                        const specificUnitTestSuccessCount = document.querySelectorAll(`#specificUnitTest-${testSlug} .bg-success`).length;
                        updateText(`successful${testSlug}TestsCount`, specificUnitTestSuccessCount);
                        break;
                    }
                }
            }
            else if ( responseData.type === "error" ) {
                phaseRunner.paintResult( responseData );
                // See the matching comment on the success branch above: `selectorFor()` can still
                // legitimately return null, and that is recorded as `selector: null`.
                resultCollector.record( phaseForState(), responseData, phaseRunner.selectorFor( responseData.requestId, responseData.step ) ?? null );
                updateText('failedCount', ++failedTests);
                switch ( currentState ) {
                    case TestState.ExecutingValidations: {
                        updateText('failedSourceDataTestsCount', ++failedSourceDataTests);
                        break;
                    }
                    case TestState.ValidatingCalendarData: {
                        updateText('failedCalendarDataTestsCount', ++failedCalendarDataTests);
                        break;
                    }
                    case TestState.SpecificUnitTests: {
                        updateText('failedUnitTestsCount', ++failedUnitTests);
                        // See the matching comment on the success branch above: `target.id`, not the
                        // never-sent `responseData.test`, is the real source for the test name.
                        const testName = responseData.target?.id ?? responseData.test;
                        const testSlug = slugify(testName);
                        const specificUnitTestFailedCount = document.querySelectorAll(`#specificUnitTest-${testSlug} .bg-danger`).length;
                        updateText(`failed${testSlug}TestsCount`, specificUnitTestFailedCount);
                        break;
                    }
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
        switch ( currentState ) {
            case TestState.ExecutingValidations: {
                performance.mark( 'sourceDataTestsEnd' );
                const totalSourceDataTestTime = performance.measure( 'litcalSourceDataTestRunner', 'sourceDataTestsStart', 'sourceDataTestsEnd' );
                updateText('totalSourceDataTestsTime', MsToTimeString( Math.round( totalSourceDataTestTime.duration ) ));
                break;
            }
            case TestState.ValidatingCalendarData: {
                performance.mark( 'calendarDataTestsEnd' );
                const totalCalendarDataTestTime = performance.measure( 'litcalCalendarDataTestRunner', 'calendarDataTestsStart', 'calendarDataTestsEnd' );
                updateText('totalCalendarDataTestsTime', MsToTimeString( Math.round( totalCalendarDataTestTime.duration ) ));
                break;
            }
            case TestState.SpecificUnitTests: {
                performance.mark( 'specificUnitTestsEnd' );
                const totalUnitTestTime = performance.measure( 'litcalUnitTestRunner', 'specificUnitTestsStart', 'specificUnitTestsEnd' );
                updateText('totalUnitTestsTime', MsToTimeString( Math.round( totalUnitTestTime.duration ) ));
                break;
            }
        }
    };

    /**
     * Handles the websocket connection being closed by the server.
     * If the connection was closed by the server, it tries to reconnect
     * after 3 seconds.
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
 * Sets the text content of the #startTestRunnerBtnLbl element to the given
 * string.
 * @param {string} txt - The text to set.
 */
const setTestRunnerBtnLblTxt = ( txt ) => {
    updateText('startTestRunnerBtnLbl', txt);
}

/**
 * Resets all test UI elements back to their initial state.
 * This includes resetting card colors, icons, counters, timers,
 * and removing any error tooltips injected during the previous run.
 */
const resetTestUI = () => {
    // Reset all test result cards (source data, calendar data, and unit tests).
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
    updateText('totalSourceDataTestsTime', '0');
    updateText('totalCalendarDataTestsTime', '0');
    updateText('totalUnitTestsTime', '0');
    document.querySelectorAll('[id$="TestsTime"]').forEach(el => {
        if (el.id.startsWith('total') && !['totalSourceDataTestsTime', 'totalCalendarDataTestsTime', 'totalUnitTestsTime'].includes(el.id)) {
            el.textContent = '0';
        }
    });

    // Reset internal counter variables.
    // The grand totals belong here with the per-phase ones. They used to be zeroed separately by
    // the start-run handler, which made this function a *partial* reset — every other caller left
    // `successfulTests` / `failedTests` holding the previous run's values, so the DOM read 0 while
    // the next increment jumped straight back to the stale number (#53).
    successfulTests = 0;
    failedTests = 0;
    successfulSourceDataTests = 0;
    successfulCalendarDataTests = 0;
    successfulUnitTests = 0;
    failedSourceDataTests = 0;
    failedCalendarDataTests = 0;
    failedUnitTests = 0;
}

/**
 * Fetches the four datasets this page builds its scaffold and its checks from, and assigns
 * {@link MetaData}, {@link UnitTests}, {@link RomanMissals} and {@link ValidationsInventory}.
 *
 * **Settled independently, not as one `Promise.all`.** A single rejection there discarded all four
 * results at once: none of the globals was assigned, `setupPage()` never ran, and `.page-loader` —
 * rendered *visible* in the markup and lowered only by a `tryEnableBtn()` that finds every flag set
 * — stayed up for ever over a page that was never going to resolve, with a `console.error` as its
 * only trace. `/validations` answers 429 routinely in local development, which made that the most
 * reachable user-visible failure on this page (#63).
 *
 * @returns {Promise<void>}
 */
const fetchMetadataAndTests = () => {
    return Promise.allSettled( [
        fetchJson( ENDPOINTS.CALENDARS ),
        fetchJson( ENDPOINTS.TESTS ),
        fetchJson( ENDPOINTS.MISSALS ),
        // `fetchValidations()` does its own fetch/parse/error-handling and resolves straight to the
        // inventory array — it is not a `Response`, so it must not go through `readJsonOrThrow()`.
        fetchValidations( getApiBaseUrl() )
    ] ).then( ( [ metadataResult, testsResult, missalsResult, validationsResult ] ) => {
        // Positional rather than shape-sniffed: with `allSettled` a dataset that failed has no shape
        // to sniff, and "which endpoint is missing" is exactly what the failure path has to say.
        if ( 'fulfilled' === metadataResult.status && metadataResult.value?.hasOwnProperty( 'litcal_metadata' ) ) {
            MetaData = metadataResult.value.litcal_metadata;
        } else {
            console.error( 'Could not load the calendars metadata:', metadataResult.reason ?? metadataResult.value );
        }

        if ( 'fulfilled' === testsResult.status ) {
            const testsData = testsResult.value;
            if ( Array.isArray( testsData ) ) {
                UnitTests = testsData;
            } else if ( Array.isArray( testsData?.litcal_tests ) ) {
                UnitTests = testsData.litcal_tests;
            } else {
                console.error( 'Could not decode tests data! Expected an array, or an object with a `litcal_tests` array; got:', testsData );
            }
        } else {
            console.error( 'Could not load the unit tests:', testsResult.reason );
        }

        if ( 'fulfilled' === missalsResult.status && missalsResult.value?.hasOwnProperty( 'litcal_missals' ) ) {
            RomanMissals = missalsResult.value.litcal_missals;
        } else {
            console.error( 'Could not load the missals metadata:', missalsResult.reason ?? missalsResult.value );
        }

        if ( 'fulfilled' === validationsResult.status ) {
            ValidationsInventory = validationsResult.value;
            ValidationsInventoryReady = true;
        } else {
            console.error( 'Could not load the validations inventory:', validationsResult.reason );
        }

        // The three datasets `setupPage()` itself dereferences (`MetaData.diocesan_calendars`,
        // `UnitTests.forEach`, `Object.values( RomanMissals )`). Without them there is no scaffold
        // to render and calling it would throw; with them the page renders whatever it has.
        const canRenderScaffold = null !== MetaData && null !== UnitTests && null !== RomanMissals;

        // JUDGEMENT CALL (#63): the inventory gates the *run*, not the *render*.
        //
        // `ValidationsInventory` is the list of source-data items a run checks. Without it,
        // `buildSourceDataChecks()` composes ids that match nothing advertised, warns about each in
        // turn, and returns only the single `LitCalMetadata` URL check — so a run started in that
        // state would check almost nothing and then report itself green. That is precisely the class
        // of untruth this interface exists to detect, manufactured by the interface itself, and it
        // is worse than no run at all. So the Start button stays refused: `AsyncDataReady` is set
        // only once the inventory is actually in.
        //
        // What a failure must *not* do is what it used to do — leave the page under a translucent
        // overlay with no explanation. So the scaffold still renders, the controls stay usable, the
        // loader comes down, and a toast says why nothing can be run.
        ReadyToRunTests.AsyncDataReady = canRenderScaffold && ValidationsInventoryReady;

        if ( canRenderScaffold ) {
            setupPage();
        }

        // Two distinct toasts because they are two distinct facts, and both can be true at once.
        if ( false === ValidationsInventoryReady ) {
            safeToastShow( '#validations-load-failed' );
        }
        if ( false === canRenderScaffold ) {
            safeToastShow( '#controls-load-failed' );
        }
        if ( false === ReadyToRunTests.AsyncDataReady ) {
            ReadyToRunTests.tryEnableBtn();
            // After `tryEnableBtn()`, which lowers the loader only when every flag is set — and one
            // of them never will be now.
            hidePageLoader();
        }
    } ).catch( ( error ) => {
        // Only an unexpected throw from the handler above can land here now: every fetch failure is
        // a settled rejection, handled inline. Still not swallowed, and still not left greyed out.
        console.error( 'Failed to set the page up from the fetched metadata:', error );
        safeToastShow( '#controls-load-failed' );
        hidePageLoader();
    } );
}

/**
 * Appends an accordion item for a unit test with its assertions.
 * @param {Object} obj - The unit test object with its assertions.
 * @returns {undefined}
 */
const appendAccordionItem = ( obj ) => {
    const nameSlug = slugify(obj.name);
    let unitTestStr = '';
    obj.assertions.forEach( (assertion, idy) => {
        let dateStr = '';
        const rawDate =
            (assertion.hasOwnProperty('expectedValue') && assertion.expectedValue != null)
                ? assertion.expectedValue
                : (assertion.hasOwnProperty('expected_value') && assertion.expected_value != null)
                    ? assertion.expected_value
                    : null;
        if (rawDate !== null) {
            const date = new Date(rawDate);
            if (!Number.isNaN(date.getTime())) {
                dateStr = new Intl.DateTimeFormat(locale, IntlDTOptions).format(date);
            } else {
                console.warn('Unexpected date value in assertion', { assertion, rawDate });
            }
        }
        unitTestStr += `
            <div class="col-1 ${idy === 0 || idy % 11 === 0 ? 'offset-1' : ''}">
                <p class="text-center mb-0 fw-bold">${assertion.year}</p>
                <p class="text-center mb-0 bg-secondary text-white currentSelectedCalendar"></p>
                <div class="card text-white bg-info rounded-0 ${nameSlug} year-${assertion.year} ${TEST_RUN_STEP_CARD_CLASS.validates}">
                    <div class="card-body">
                        <p class="card-text d-flex justify-content-between"><span><i class="fas fa-circle-question fa-fw" aria-hidden="true"></i> test valid</span><span role="button" data-bs-toggle="tooltip" data-bs-title="${escapeHtmlAttr(assertion.assertion + ' ' + dateStr)}"><i class="fas fa-circle-info" aria-hidden="true"></i></span></p>
                    </div>
                </div>
            </div>
        `;
    } );

    document.querySelector('#specificUnitTestsAccordion').insertAdjacentHTML('beforeend', `
        <div class="accordion-item" id="${nameSlug}">
            <h2 class="row g-0 accordion-header" id="${nameSlug}Header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#specificUnitTest-${nameSlug}" aria-expanded="false" aria-controls="specificUnitTest-${nameSlug}">
                    <div class="col-12 col-md-4 mb-2 mb-md-0">${obj.name.length > 50 ? '<small>' : ''}<i class="fas fa-flask-vial fa-fw me-2" aria-hidden="true"></i>${obj.name}<span role="button" data-bs-toggle="tooltip" data-bs-title="${escapeHtmlAttr(obj.description)}"><i class="fas fa-circle-info ms-2" aria-hidden="true"></i></span>${obj.name.length > 50 ? '</small>' : ''}</div>
                    <div class="col-12 col-md-8">
                        <div class="test-status-row">
                            <div class="test-status-item text-white test-results bg-success rounded-start"><i class="fas fa-circle-check fa-fw" aria-hidden="true"></i><span class="status-label">Successful:</span> <span id="successful${nameSlug}TestsCount" class="successfulCount">0</span></div>
                            <div class="test-status-item text-white test-results bg-danger"><i class="fas fa-circle-xmark fa-fw" aria-hidden="true"></i><span class="status-label">Failed:</span> <span id="failed${nameSlug}TestsCount" class="failedCount">0</span></div>
                            <div class="test-status-item text-white test-results bg-dark rounded-end"><i class="fas fa-stopwatch fa-fw" aria-hidden="true"></i><span class="status-label">Time (<span id="total${nameSlug}TestsCount"></span>):</span> <span id="total${nameSlug}TestsTime">0</span></div>
                        </div>
                    </div>
                </button>
            </h2>
            <div id="specificUnitTest-${nameSlug}" class="accordion-collapse collapse" aria-labelledby="${nameSlug}Header" data-bs-parent="#specificUnitTestsAccordion">
                <div class="row g-0 specificunittests m-2">${unitTestStr}</div>
            </div>
        </div>
    `);
    let specificUnitTestTotalCount = document.querySelectorAll(testRunCardSelector(`#specificUnitTest-${nameSlug}`)).length;
    updateText(`total${nameSlug}TestsCount`, specificUnitTestTotalCount);
}

/**
 * Function to determine if a unit test should be filtered out based on its `appliesTo` or `applies_to` property
 * @param {Object} unitTest - The unit test to check
 * @param {String} appliesToOrFilter - The property to check, either 'appliesTo' or 'applies_to', or 'filter'
 * @returns {Boolean} true if the unit test should be applied to the current national or diocesan calendar, false otherwise
 */
const handleAppliesToOrFilter = ( unitTest, appliesToOrFilter ) => {
    let shouldReturn = false;
    // TODO: the following two variables are needed to handle the switch to the /tests schema
    //      When the older schema is deprecated we can clean up and simplify this code
    let appliesToProp = unitTest.hasOwnProperty( 'appliesTo' ) ? 'appliesTo' : 'applies_to';
    let searchProp = appliesToOrFilter === 'appliesTo' ? appliesToProp : appliesToOrFilter;
    let scope = unitTest[ searchProp ];
    // Explicitly select the calendar-scope key present on this scope object, ignoring `rite`.
    // A scope with no calendar-scope key (e.g. a rite-only `{ rite: "roman" }`) falls through the
    // switch with no case matched, leaving shouldReturn at its default of false.
    let prop = CALENDAR_SCOPE_KEYS.find( key => scope.hasOwnProperty( key ) );
    switch ( prop ) {
        case 'national_calendar':
            if ( appliesToOrFilter === 'appliesTo' ) {
                shouldReturn = ( currentNationalCalendar !== scope.national_calendar );
            } else {
                shouldReturn = ( currentNationalCalendar === scope.national_calendar );
            }
            break;
        case 'national_calendars':
            if ( appliesToOrFilter === 'appliesTo' ) {
                shouldReturn = ( false === scope.national_calendars.includes( currentNationalCalendar ) );
            } else {
                shouldReturn = ( scope.national_calendars.includes( currentNationalCalendar ) );
            }
            break;
        case 'diocesan_calendar':
            if ( currentCalendarCategory === 'diocesancalendar' ) {
                if ( appliesToOrFilter === 'appliesTo' ) {
                    shouldReturn = ( currentSelectedCalendar !== scope.diocesan_calendar );
                } else {
                    shouldReturn = ( currentSelectedCalendar === scope.diocesan_calendar );
                }
            } else {
                shouldReturn = appliesToOrFilter === 'appliesTo' ? true : false;
            }
            break;
        case 'diocesan_calendars':
            if ( currentCalendarCategory === 'diocesancalendar' ) {
                if ( appliesToOrFilter === 'appliesTo' ) {
                    shouldReturn = ( false === scope.diocesan_calendars.includes( currentSelectedCalendar ) );
                } else {
                    shouldReturn = ( scope.diocesan_calendars.includes( currentSelectedCalendar ) );
                }
            } else {
                shouldReturn = appliesToOrFilter === 'appliesTo' ? true : false;
            }
            break;
    }
    return shouldReturn;
}

/**
 * Sets up the page by populating the calendar select list and setting up
 * the calendar data tests.
 *
 * Additionally, it stores the original value of the #startTestRunnerBtnLbl for later use
 * and makes sure that the page is ready to run tests.
 *
 * @return {void}
 */

/**
 * Builds source data checks for non-VA (non-Vatican) calendars.
 * Resolves the diocese-to-nation and nation-to-wider-region/missals metadata this page holds,
 * then delegates the actual check list to `buildSourceDataChecks()`.
 *
 * @param {string} calendarId - The calendar ID (national or diocesan).
 * @param {string} calendarCategory - The category: 'nationalcalendar' or 'diocesancalendar'.
 * @returns {Array|null} Array of source data check objects, or null if metadata is missing.
 */
const buildNonVASourceDataChecks = (calendarId, calendarCategory) => {
    let nation = calendarId;
    let dioceseId = null;

    // For diocesan calendars, find the parent nation
    if (calendarCategory !== 'nationalcalendar') {
        const diocesanData = MetaData.diocesan_calendars.find(
            diocesanCalendar => diocesanCalendar.calendar_id === calendarId
        );
        if (!diocesanData) {
            console.error('No diocesan calendar metadata found for', calendarId);
            return null;
        }
        nation = diocesanData.nation;
        dioceseId = calendarId;
    }

    const nationalCalendarData = MetaData.national_calendars.find(
        nationalCalendar => nationalCalendar.calendar_id === nation
    );
    if (!nationalCalendarData) {
        console.error('No national calendar metadata found for', nation);
        return null;
    }

    // National and diocesan calendars always start from the Roman universal corpus: national
    // calendars are Roman by definition, and an Ambrosian diocese still inherits the Roman national
    // calendar of its nation. Whether an Ambrosian diocese should instead inherit the Ambrosian rite
    // corpus is a separate (pre-existing) design question — `rite: 'roman'` below is what preserves
    // it, matching v1's behaviour exactly. `dioceseRite` is separate and is the calendar's own rite:
    // a diocese id must resolve to what the inventory actually advertises (e.g.
    // `diocese:ambrosian:milano_it`; there is no `diocese:roman:milano_it`). For a national
    // calendar there is no diocese id, so `dioceseRite` is inert, but `currentRite` is always
    // `'roman'` there anyway, since national calendars exist only under that rite.
    return buildSourceDataChecks( {
        rite: 'roman',
        dioceseRite: currentRite,
        nation,
        widerRegion: nationalCalendarData.wider_region,
        missals: nationalCalendarData.missals,
        dioceseId
    } );
};

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
        // Both bounds come from `cfg.years`, never from the live globals: a replayed run carries
        // its own range in `scaffold.years`, and writing today's bounds over it would caption a
        // stored Ambrosian run with the Roman range it never used (#52).
        if ( cfg.years.length > 0 ) {
            document.querySelectorAll('.yearMin').forEach(el => el.textContent = cfg.years[ 0 ]);
            document.querySelectorAll('.yearMax').forEach(el => el.textContent = cfg.years[ cfg.years.length - 1 ]);
        }
        for ( let i = cfg.years.length; i > 0; i-- ) {
            const idx = cfg.years.length - i;
            calendarDataTests.insertAdjacentHTML('beforeend', calDataTestTemplate( i, cfg.years ));
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

const setupPage = () => {
    // store the original value of the #startTestRunnerBtnLbl for later use
    // but only if it hasn't been set yet (only the first time we do a page setup)
    if ( startTestRunnerBtnLbl === '' ) {
        const btnLbl = document.querySelector( '#startTestRunnerBtnLbl' );
        if (btnLbl) {
            startTestRunnerBtnLbl = btnLbl.textContent;
        }
    }

    if ( currentCalendarCategory === 'ritecalendar' ) {
        // A rite-level calendar has no national or diocesan layer: its source data is the universal
        // corpus of its own rite, plus — for the Roman rite — the editio typica missals, which the
        // General Roman Calendar uses and no national calendar supplies. Derived from /missals
        // rather than hardcoded, so a new editio typica needs no edit here.
        const missals = currentRite === 'roman'
            ? Object.values( RomanMissals )
                .filter( missalDef => missalDef.region === 'VA' )
                .map( missalDef => missalDef.missal_id )
            : [];
        currentSourceDataChecks = buildSourceDataChecks( {
            rite: currentRite,
            dioceseRite: currentRite,
            nation: null,
            widerRegion: null,
            missals,
            dioceseId: null
        } );
    } else {
        const checks = buildNonVASourceDataChecks(currentSelectedCalendar, currentCalendarCategory);
        if (checks === null) {
            return;
        }
        currentSourceDataChecks = checks;
    }

    renderedUnitTests = [];
    SpecificUnitTestCategories = [];
    UnitTests.forEach( unitTest => {
        if ( false === testAppliesToRite( unitTest, currentRite ) ) {
            return;
        }
        if ( unitTest.hasOwnProperty( 'appliesTo' ) ) {
            if ( true === handleAppliesToOrFilter( unitTest, 'appliesTo' ) ) {
                return;
            }
        }
        else if ( unitTest.hasOwnProperty( 'applies_to' ) ) {
            if ( true === handleAppliesToOrFilter( unitTest, 'appliesTo' ) ) {
                return;
            }
        }
        if ( unitTest.hasOwnProperty( 'filter' ) ) {
            if ( true === handleAppliesToOrFilter( unitTest, 'filter' ) ) {
                return;
            }
        }
        renderedUnitTests.push( unitTest );
        SpecificUnitTestCategories.push( { "test": unitTest.name } );
        SpecificUnitTestYears[ unitTest.name ] = unitTest.assertions.reduce( ( prev, cur ) => { prev.push( cur.year ); return prev; }, [] );
    } );

    // Below the early `return` above, deliberately. `setupPage()` is the one funnel every scaffold
    // rebuild passes through — initial load, rite change, calendar change, response-type change and
    // `resyncLiveStateFromDom()` alike — but only the paths that reach *here* actually rebuild it,
    // and narrowing the year range or zeroing the counters on a path that then bails would leave
    // the page describing one rite with a scaffold still showing another's.
    //
    // Not the rite select's own `change` listener either: `linkToRiteSelect()` registers first and
    // dispatches `change` on the calendar select, so `handleCalendarSelectChange()` has already run
    // by the time that listener fires.
    Years = yearsForRite( currentRite, twentyFiveYearsFromNow, riteProperties );

    // A scaffold rebuild invalidates every result the counters describe, so zero them here rather
    // than only in the start-run handler: otherwise the badges keep the previous run's totals
    // beside a set of freshly pending cards, and can even claim more successes than the new
    // scaffold has checks (#53). This replaces an ad-hoc partial reset that used to sit at the end
    // of this function and cover the per-phase counters but neither the grand totals nor the timers.
    resetTestUI();

    buildScaffolding({
        calendar: currentSelectedCalendar,
        category: currentCalendarCategory,
        sourceDataChecks: currentSourceDataChecks,
        years: Years,
        unitTests: renderedUnitTests,
    });
    // Counted through `checkCardSelector()` / `testRunCardSelector()` rather than by naming the card
    // classes here: they enumerate the very tables `stepCardsHtml()` renders from, so the badge can
    // only ever describe cards the scaffold can actually produce (#62).
    let totalTestsCount = document.querySelectorAll(`${checkCardSelector()},${testRunCardSelector()}`).length;
    updateText('total-tests-count', totalTestsCount);
    let totalSourceDataTestsCount = document.querySelectorAll(checkCardSelector('.sourcedata-tests')).length;
    let totalCalendarDataTestsCount = document.querySelectorAll(checkCardSelector('.calendardata-tests')).length;
    let totalUnitTestsCount = document.querySelectorAll(testRunCardSelector('.specificunittests')).length;
    updateText('totalSourceDataTestsCount', totalSourceDataTestsCount);
    updateText('totalCalendarDataTestsCount', totalCalendarDataTestsCount);
    updateText('totalUnitTestsCount', totalUnitTestsCount);
    // The per-phase counters and the `.successfulCount` / `.failedCount` spans used to be zeroed
    // here, a few lines below where `resetTestUI()` now does it — a second, partial reset that
    // covered neither the grand totals nor the timers, which is how those two came to be stale on
    // this page at all (#53). One reset function, called once, above.
    const testCells = document.querySelector('.calendardata-tests');
    testCells.querySelectorAll('.bg-success,.bg-danger').forEach(el => {
        el.classList.remove('bg-success', 'bg-danger');
        el.classList.add('bg-info');
    });
    testCells.querySelectorAll('.fa-circle-check,.fa-circle-xmark').forEach(el => {
        el.classList.remove('fa-circle-check', 'fa-circle-xmark');
        el.classList.add('fa-circle-question');
    });
    initInfoTooltips();
    ReadyToRunTests.PageReady = true;
    ReadyToRunTests.tryEnableBtn();
    hidePageLoader();
}

/**
 * Resolves the calendar/category/national-calendar/identity state from the current state of the
 * mounted controls, via `toCalendarIdentity()` and (for a diocesan calendar) the loaded `apiBase`
 * metadata.
 *
 * Shared by `handleCalendarSelectChange()` and `resyncLiveStateFromDom()`, which both need to
 * derive the same state from the same two library controls — the former on a live user change, the
 * latter when restoring live state after viewing a stored past run.
 *
 * This is the *only* reader of the calendar select's `data-calendartype` dataset: `category` and
 * `calendar` (the v1 `nationalcalendar`/`diocesancalendar`/`ritecalendar` vocabulary, which
 * `currentCalendarCategory` still needs for its non-wire consumers — `buildCalendarsPayload()`,
 * `buildNonVASourceDataChecks()`, the replay path) are derived from `identity.kind` here rather than
 * read from the dataset a second time, so the two vocabularies cannot drift apart.
 *
 * `riteSelect` / `calendarSelect` are null when `mountCalendarControls()` failed (a CDN or
 * metadata failure — see its catch block and the `#controls-load-failed` toast). Both callers of
 * this function are reachable in that case: `resyncLiveStateFromDom()` via the `pastRunsSelect`
 * listener, which is registered unconditionally, regardless of whether the mount succeeded.
 * Falling back to whatever module state already holds keeps the rest of the page degrading
 * gracefully instead of throwing on `null._domElement`.
 *
 * @returns {{rite: string, calendar: string, category: string, nationalCalendar: ?string, identity: {kind: string, id?: string, rite: string}}}
 */
const resolveCalendarTargetFromControls = () => {
    if ( !riteSelect || !calendarSelect ) {
        return {
            rite: currentRite,
            calendar: currentSelectedCalendar,
            category: currentCalendarCategory,
            nationalCalendar: currentNationalCalendar,
            identity: currentCalendarIdentity,
        };
    }
    const rite = riteSelect._domElement.value;
    const selectEl = calendarSelect._domElement;
    const selectedOption = selectEl.options[ selectEl.selectedIndex ] ?? null;

    const identity = toCalendarIdentity(
        selectEl.value,
        selectedOption?.dataset?.calendartype ?? '',
        rite
    );
    const category = identity.kind === 'rite' ? 'ritecalendar'
        : identity.kind === 'national' ? 'nationalcalendar'
        : 'diocesancalendar';
    const calendar = identity.kind === 'rite' ? identity.rite : identity.id;

    let nationalCalendar;
    if ( category === 'diocesancalendar' ) {
        // The library's diocese options carry no parent-nation attribute, so resolve it from the
        // same loaded metadata the select was built from.
        const diocesanData = apiBase
            .diocesanCalendars( rite )
            .find( entry => entry.calendar_id === calendar );
        nationalCalendar = diocesanData ? diocesanData.nation : null;
    } else if ( category === 'ritecalendar' ) {
        // A rite-level calendar has no national calendar. null (rather than the calendar id) keeps
        // `scope.national_calendars.includes( currentNationalCalendar )` false, so national-scoped
        // tests are correctly excluded from it.
        nationalCalendar = null;
    } else {
        nationalCalendar = calendar;
    }

    return { rite, calendar, category, nationalCalendar, identity };
};

/**
 * Disables (or re-enables) the controls that rebuild the scaffold, for a run's duration.
 *
 * The counterpart of `resources.js`'s `setRiteSelectDisabledForRun()`, and added for the same
 * reason (final review of #48, finding 3) — this page simply had no equivalent, which is why #53
 * describes the Calendars runner as the easier of the two to hit: any calendar change triggers it,
 * not only a rite change.
 *
 * All three of these controls funnel into `setupPage()`, which rebuilds the scaffold, renarrows
 * `Years` and zeroes the counters. Mid-run that produces a stored run that contradicts itself:
 * `buildCalendarsPayload()` takes `counts` from the module counters but its results from
 * `resultCollector`, which no reset clears, so the run would be persisted claiming fewer successes
 * than it carries — and `scaffold.years` would record the *new* rite's range beside result
 * descriptors addressed at the old one's years, which replay then silently drops.
 *
 * Disabling for the run's duration prevents the scenario outright rather than teaching every
 * counter, the year range and the run token to survive a mid-run swap.
 *
 * @param {boolean} disabled
 * @returns {void}
 */
const setScaffoldControlsDisabledForRun = ( disabled ) => {
    [
        riteSelect?._domElement,
        calendarSelect?._domElement,
        document.querySelector('#APIResponseSelect'),
    ].forEach( ( el ) => {
        if ( el ) {
            el.disabled = disabled;
        }
    } );
};

/**
 * Reacts to a calendar or rite change.
 *
 * Attached after `mountCalendarControls()` rather than at module scope: the element does not
 * exist until the library renders it. Registered once, on the element the library created.
 *
 * `currentRite` is read from the rite select, not from the option — the library's options carry
 * no `data-rite`, because the rite is the select's own state now rather than each option's.
 */
const handleCalendarSelectChange = () => {
    const pageLoader = document.querySelector('.page-loader');
    if (pageLoader) {
        pageLoader.style.display = 'block';
        pageLoader.style.opacity = '1';
    }
    ReadyToRunTests.PageReady = false;

    const oldSelectedCalendar = currentSelectedCalendar;
    const target = resolveCalendarTargetFromControls();
    currentRite = target.rite;
    currentSelectedCalendar = target.calendar;
    currentCalendarCategory = target.category;
    currentNationalCalendar = target.nationalCalendar;
    currentCalendarIdentity = target.identity;

    console.log( 'currentCalendarCategory = ' + currentCalendarCategory + ', currentRite = ' + currentRite );
    document.querySelectorAll(`.calendar-${slugify(oldSelectedCalendar)}`).forEach(el => {
        el.classList.remove(`calendar-${slugify(oldSelectedCalendar)}`);
        el.classList.add(`calendar-${slugify(currentSelectedCalendar)}`);
    });
    setupPage();
    ReadyToRunTests.tryEnableBtn();
};

document.querySelector('#APIResponseSelect').addEventListener('change', ( ev ) => {
    const pageLoader = document.querySelector('.page-loader');
    if (pageLoader) {
        pageLoader.style.display = 'block';
        pageLoader.style.opacity = '1';
    }
    ReadyToRunTests.PageReady = false;
    currentResponseType = ev.currentTarget.value;
    console.log( `currentResponseType: ${currentResponseType}` );
    // The response format is named on the `parses` card, so this addresses that step's card class
    // rather than spelling one out — the literal it replaced went stale the moment #60 renamed them.
    document.querySelectorAll(`.calendar-${slugify(currentSelectedCalendar)}.${STEP_CARD_CLASS.parses} .response-type`).forEach(el => {
        el.textContent = currentResponseType;
    });
    setupPage();
    ReadyToRunTests.tryEnableBtn();
});

document.querySelector('#startTestRunnerBtn').addEventListener('click', () => {
    if (!conn) {
        console.warn('cannot run tests: websocket connection not initialized');
        return;
    }
    if ( currentState === TestState.ReadyState || currentState === TestState.JobsFinished || currentState === TestState.Stopped ) {
        resultCollector.reset();
        // Releases the previous run's registry entries, selectors and outstanding set — see
        // `endRun()` in wsRunner.js for why a run must not simply be allowed to leak its state into
        // the next one.
        phaseRunner.endRun();
        resetTestUI();
        currentState = ( conn.readyState !== WebSocket.CLOSED && conn.readyState !== WebSocket.CLOSING ) ? TestState.ReadyState : TestState.JobsFinished;
        if ( conn.readyState !== WebSocket.OPEN ) {
            console.warn( 'cannot run tests: websocket connection is not ready' );
            console.warn( 'WebSocket readyState:', conn.readyState );
        } else {
            currentRunToken = crypto.randomUUID();
            setScaffoldControlsDisabledForRun( true );
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
            setTestRunnerBtnLblTxt( 'Tests Running...' );
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
        setScaffoldControlsDisabledForRun( false );
        const spinIcon = document.querySelector('#startTestRunnerBtn .fa-spin');
        if (spinIcon) {
            spinIcon.classList.remove('fa-spin');
        }
        setTestRunnerBtnLblTxt( 'Tests Stopped' );
        const startBtn = document.querySelector('#startTestRunnerBtn');
        if (startBtn) {
            startBtn.classList.remove('btn-primary');
            startBtn.classList.add('btn-warning');
        }
    }
});

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
    // Runs stored before the rite dimension existed have no `rite`; they were all Roman.
    currentRite = run.rite ?? 'roman';
    // Kept in sync with `currentCalendarCategory` here too: `resolveCalendarTargetFromControls()`
    // falls back to this module state when `mountCalendarControls()` failed, and a stale identity
    // beside a fresh `currentSelectedCalendar` would send a later run's messages for one calendar
    // while its cards are addressed to another's — a wrong green.
    currentCalendarIdentity = run.calendarCategory === 'ritecalendar'
        ? { kind: 'rite', rite: currentRite }
        : { kind: run.calendarCategory === 'nationalcalendar' ? 'national' : 'diocesan', id: run.calendar, rite: currentRite };
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
    // Per-phase Successful/Failed badges, derived from the stored descriptors
    const sourceDataCounts = countByStatus( run.sourceDataResults );
    const calendarDataCounts = countByStatus( run.calendarDataResults );
    const unitTestCounts = countByStatus( run.unitTestResults );
    updateText('successfulSourceDataTestsCount', sourceDataCounts.successful);
    updateText('failedSourceDataTestsCount', sourceDataCounts.failed);
    updateText('successfulCalendarDataTestsCount', calendarDataCounts.successful);
    updateText('failedCalendarDataTestsCount', calendarDataCounts.failed);
    updateText('successfulUnitTestsCount', unitTestCounts.successful);
    updateText('failedUnitTestsCount', unitTestCounts.failed);
    // Per-unit-test badges in the accordion headers, grouped by test name
    const perTestCounts = new Map();
    run.unitTestResults.forEach( ( d ) => {
        if ( !d.test ) {
            return;
        }
        const testSlug = slugify( d.test );
        const entry = perTestCounts.get( testSlug ) ?? { successful: 0, failed: 0 };
        entry[ d.status === 'success' ? 'successful' : 'failed' ]++;
        perTestCounts.set( testSlug, entry );
    } );
    perTestCounts.forEach( ( entry, testSlug ) => {
        updateText(`successful${testSlug}TestsCount`, entry.successful);
        updateText(`failed${testSlug}TestsCount`, entry.failed);
    } );
    // Totals: same DOM-derived counts setupPage computes for a live run
    updateText('total-tests-count', document.querySelectorAll(`${checkCardSelector()},${testRunCardSelector()}`).length);
    updateText('totalSourceDataTestsCount', document.querySelectorAll(checkCardSelector('.sourcedata-tests')).length);
    updateText('totalCalendarDataTestsCount', document.querySelectorAll(checkCardSelector('.calendardata-tests')).length);
    updateText('totalUnitTestsCount', document.querySelectorAll(testRunCardSelector('.specificunittests')).length);
    updateText('total-time', MsToTimeString( run.duration ));
    updateText('totalSourceDataTestsTime', MsToTimeString( run.timings.sourceData ));
    updateText('totalCalendarDataTestsTime', MsToTimeString( run.timings.calendarData ));
    updateText('totalUnitTestsTime', MsToTimeString( run.timings.unitTests ));
    initInfoTooltips();
};

/**
 * Re-derives all module state variables from the current DOM controls and calls setupPage()
 * to rebuild the scaffold, currentSourceDataChecks, and SpecificUnitTestCategories from live
 * page state.  Called when the user returns to "— Live —" after viewing a stored run, because
 * replayCalendarsRun() overwrites currentSelectedCalendar, currentCalendarCategory,
 * currentResponseType, and currentSourceDataChecks with the stored run's values.
 *
 * Derives the calendar/category/rite/national-calendar state the same way
 * `handleCalendarSelectChange()` does — via `resolveCalendarTargetFromControls()` — rather than
 * reading `data-rite` / `data-nationalcalendar` attributes: the library's `CalendarSelect` emits
 * neither, since the rite lives on the rite select's own value now, and a diocese's parent nation
 * is resolved from the loaded `apiBase` metadata instead.
 */
const resyncLiveStateFromDom = () => {
    const target = resolveCalendarTargetFromControls();
    currentRite = target.rite;
    currentSelectedCalendar = target.calendar;
    currentCalendarCategory = target.category;
    currentNationalCalendar = target.nationalCalendar;
    currentCalendarIdentity = target.identity;

    const responseSelect = document.querySelector('#APIResponseSelect');
    currentResponseType = responseSelect ? responseSelect.value : currentResponseType;
    setupPage();
};

if ( pastRunsSelect ) {
    pastRunsSelect.addEventListener('change', ( e ) => {
        const startBtn = document.querySelector('#startTestRunnerBtn');
        if ( e.target.value === '' ) {
            if ( startBtn ) {
                startBtn.disabled = false;
            }
            resetTestUI();
            resyncLiveStateFromDom();
            return;
        }
        if ( startBtn ) {
            startBtn.disabled = true;
        }
        replayCalendarsRun( e.target.value ).catch( ( err ) => {
            console.error( 'Replay failed', err );
            safeToastShow('#results-load-failed');
        });
    });
    loadPastRuns();
}

// Store wide tooltips (error tooltips with copy functionality) so we can hide them later
const tooltipMap = new Map();

// Show wide tooltip on click, hide on click outside, or copy to clipboard
// Only applies to .error-tooltip elements, not info icons
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

    const target = event.target.closest( '.error-tooltip[data-bs-toggle="tooltip"]' );
    const tooltipEl = event.target.closest( '.wide-tooltip' );

    // When a click occurs anywhere except on the trigger element or the tooltip itself, hide the tooltip
    if ( !target && !tooltipEl ) {
        tooltipMap.forEach( t => t.hide() );
        tooltipMap.clear();
        return;
    }

    // If clicking on tooltip itself (not trigger), just keep it open
    if ( !target && tooltipEl ) {
        event.stopPropagation();
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

/**
 * Initialize Bootstrap hover tooltips for info icons.
 * Call this after dynamically adding content with tooltip triggers.
 */
const initInfoTooltips = () => {
    document.querySelectorAll( '[data-bs-toggle="tooltip"]:not(.error-tooltip)' ).forEach( el => {
        // Skip if already initialized
        if ( !bootstrap.Tooltip.getInstance( el ) ) {
            new bootstrap.Tooltip( el );
        }
    } );
};

// Optional: Hide tooltip on ESC key
document.addEventListener( 'keydown', function ( event ) {
    if ( event.key === 'Escape' ) {
        tooltipMap.forEach( t => t.hide() );
        tooltipMap.clear();
    }
} );

setEndpoints();
await mountCalendarControls();
// Absent when mountCalendarControls() failed (see its catch block); the rest of the page's
// initialisation must still run so the failure degrades to the #controls-load-failed toast
// rather than a dead page.
if ( calendarSelect ) {
    calendarSelect._domElement.addEventListener( 'change', handleCalendarSelectChange );
}
fetchMetadataAndTests();
connectWebSocket();
