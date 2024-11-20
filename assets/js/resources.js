
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
        );
    }
    /**
     * Checks if all conditions are met to run tests and if so, enables the start test runner button.
     * The conditions are:
     * - PageReady: page has finished loading
     * - SocketReady: Websocket connection is ready
     * - AsyncDataReady: all relevant metadata regarding calendars has finished loading
     * - MissalsReady: all relevant data regarding Roman Missals has finished loading
     * Additionally, the method makes sure that the #startTestRunnerBtnLbl is set to the stored value
     * and that the page loader is hidden.
     */
    static tryEnableBtn() {
        console.log( 'ReadyToRunTests.SocketReady = '       + ReadyToRunTests.SocketReady );
        console.log( 'ReadyToRunTests.AsyncDataReady = '    + ReadyToRunTests.MetaDataReady );
        console.log( 'ReadyToRunTests.PageReady = '         + ReadyToRunTests.PageReady );
        console.log( 'ReadyToRunTests.MissalsReady = '      + ReadyToRunTests.MissalsReady );
        let testsReady = ReadyToRunTests.check();
        $( '#startTestRunnerBtn' ).prop( 'disabled', !testsReady ).removeClass( 'btn-secondary' ).addClass( 'btn-primary' );
        // always make sure we have the fa-rotate class, ready to start spinning on button press
        // we might be resetting after a previous run where last class was fa-stop
        $( '#startTestRunnerBtn' ).find( '.fa-stop' ).removeClass( 'fa-stop' ).addClass( 'fa-rotate' );
        setTestRunnerBtnLblTxt(startTestRunnerBtnLbl);
        if( testsReady ) {
            $( '.page-loader' ).fadeOut('slow');
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
 * Object containing all endpoints used in the application.
 * @type {Object<string,string>}
 * @property {string} VERSION - version of the API
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
    VERSION: "dev",
    CALENDARS: "",
    TESTS: "",
    DECREES: "",
    EVENTS: "",
    MISSALS: "",
    EASTER: "",
    DATA: "",
    SCHEMAS: ""
}

/**
 * Array of objects that define the resource data checks.
 * Each object must contain the following properties:
 * - `validate`: the name of the class that will be used to match the response from the websocket backend.
 *      Must coincide with the class on the card, that's how the Websocket backend (Health class) knows which classes to send back.
 * - `sourceFile`: the URL of the resource to check.
 * - `category`: a string that indicates the category of the resource data check.
 *                Currently, the only category is 'resourceDataCheck'.
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
    }
];

/**
 * An array of objects with the following properties:
 * - `validate`: the name of the class that will be used to match the response from the websocket backend.
 *      Must coincide with the class on the card, that's how the Websocket backend (Health class) knows which classes to send back.
 * - `sourceFile`: the URL of the resource to check.
 * - `category`: a string that indicates the category of the source data check.
 *                Currently, the only category is 'sourceDataCheck'.
 * @type {Array<{validate: string, sourceFile: string, category: string}>}
 */
const sourceDataChecks = [
    {
        "validate": "memorials-from-decrees",
        "sourceFile": "jsondata/sourcedata/decrees/decrees.json",
        "category": "sourceDataCheck"
    },
    {
        "validate": "memorials-from-decrees-i18n",
        "sourceFolder": "jsondata/sourcedata/decrees/i18n",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-tempore",
        "sourceFile": "jsondata/sourcedata/missals/propriumdetempore/propriumdetempore.json",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-tempore-i18n",
        "sourceFolder": "jsondata/sourcedata/missals/propriumdetempore/i18n/",
        "category": "sourceDataCheck"
    },
    {
        "validate": "regional-calendars-index",
        "sourceFile": "jsondata/sourcedata/nations/index.json",
        "category": "sourceDataCheck"
    }
];

const nationalCalendarDataPath = (nation) => `jsondata/sourcedata/nations/${nation}/${nation}.json`;
const diocesanCalendarDataPath = (nation, diocese) => `jsondata/sourcedata/nations/${nation}/${diocese}.json`;


/**
 * Sets the API endpoints according to the version selected in the dropdown.
 *
 * @param {Event} [ev] - An optional event object.
 *
 * @return {void}
 */
const setEndpoints = (ev = null) => {
    if(ev !== null) {
        ENDPOINTS.VERSION = ev.currentTarget.value;
    } else {
        ENDPOINTS.VERSION = document.querySelector('#apiVersionsDropdownItems').value;
    }
    console.info('ENDPOINTS.VERSION set to ' + ENDPOINTS.VERSION);
    switch(ENDPOINTS.VERSION) {
        case 'dev':
        case 'v4':
            ENDPOINTS.CALENDARS    = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/calendars`;
            ENDPOINTS.TESTS        = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/tests`;
            ENDPOINTS.DECREES      = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/decrees`;
            ENDPOINTS.MISSALS      = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/missals`;
            ENDPOINTS.DATA         = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/data`;
            ENDPOINTS.EVENTS       = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/events`;
            ENDPOINTS.EASTER       = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/easter`;
            ENDPOINTS.SCHEMAS      = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/schemas`;
            break;
        case 'v3':
            ENDPOINTS.CALENDARS    = `https://litcal.johnromanodorazio.com/api/v3/LitCalMetadata.php`;
            ENDPOINTS.TESTS        = `https://litcal.johnromanodorazio.com/api/v3/LitCalTestsIndex.php`;
            break;
    }
    document.querySelector('#admin_url').setAttribute('href', `/admin.php?apiversion=${ENDPOINTS.VERSION}`);
    resourceDataChecks[0].sourceFile = ENDPOINTS.CALENDARS;
    resourceDataChecks[1].sourceFile = ENDPOINTS.DECREES;
    resourceDataChecks[2].sourceFile = ENDPOINTS.TESTS;
    resourceDataChecks[3].sourceFile = ENDPOINTS.EVENTS;
    resourceDataChecks[4].sourceFile = ENDPOINTS.EASTER;
    resourceDataChecks[5].sourceFile = ENDPOINTS.SCHEMAS;
}

/**
 * Object containing API endpoint paths for resources
 *
 * @constant {Object<string,string>}
 * @property {string} calendars-path - Path for calendar data
 * @property {string} decrees-path   - Path for decree data
 * @property {string} events-path    - Path for event data
 * @property {string} easter-path    - Path for Easter date calculation
 * @property {string} tests-path     - Path for test data
 * @property {string} schemas-path   - Path for schema data
 */
const resourcePaths = {
    'calendars-path': '/calendars',
    'decrees-path':   '/decrees',
    'events-path':    '/events',
    'easter-path':    '/easter',
    'tests-path':     '/tests',
    'easter-path':    '/easter',
    'schemas-path':   '/schemas'
};


/**
 * This function generates an HTML template for a specific resource based on the resource and index provided.
 * The template includes a card structure with different classes to represent the existence, JSON validity, and schema validity of the resource.
 * Each card has a specific icon and text to indicate the status of the resource.
 *
 * @param {string} resource The name of the resource.
 * @param {number} idx The index of the resource.
 * @returns {string} The HTML template for the resource.
 */
const resourceTemplate = (resource, idx) => `<div class="col-1 ${idx === 0 || idx % 11 === 0 ? 'offset-1' : ''}">
    <p class="text-center mb-0 bg-secondary text-white"><span title="${resourcePaths[resource]}">${resourcePaths[resource]}</span></p>
    <div class="card text-white bg-info rounded-0 ${resource} file-exists">
        <div class="card-body">
            <p class="card-text d-flex justify-content-between"><span><svg class="svg-inline--fa fa-circle-question fa-fw" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="circle-question" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"></path></svg><!-- <i class="fas fa-circle-question fa-fw"></i> Font Awesome fontawesome.com --> data exists</span></p>
        </div>
    </div>
    <div class="card text-white bg-info rounded-0 ${resource} json-valid">
        <div class="card-body">
            <p class="card-text d-flex justify-content-between"><span><svg class="svg-inline--fa fa-circle-question fa-fw" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="circle-question" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"></path></svg><!-- <i class="fas fa-circle-question fa-fw"></i> Font Awesome fontawesome.com --> JSON valid</span></p>
        </div>
    </div>
    <div class="card text-white bg-info rounded-0 ${resource} schema-valid">
        <div class="card-body">
            <p class="card-text d-flex justify-content-between"><span><svg class="svg-inline--fa fa-circle-question fa-fw" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="circle-question" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"></path></svg><!-- <i class="fas fa-circle-question fa-fw"></i> Font Awesome fontawesome.com --> schema valid</span></p>
        </div>
    </div>
</div>`;

const sourceTemplate = (sourceItem, idx) => `<div class="col-1 ${idx === 0 || idx % 11 === 0 ? 'offset-1' : ''}">
<p class="text-center mb-0 bg-secondary text-white h-25"><span title="${sourceItem.sourceFile ?? sourceItem.sourceFolder}">${sourceItem.validate}</span></p>
<div class="card text-white bg-info rounded-0 ${sourceItem.validate} file-exists">
    <div class="card-body">
        <p class="card-text d-flex justify-content-between"><span><svg class="svg-inline--fa fa-circle-question fa-fw" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="circle-question" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"></path></svg><!-- <i class="fas fa-circle-question fa-fw"></i> Font Awesome fontawesome.com --> data exists</span></p>
    </div>
</div>
<div class="card text-white bg-info rounded-0 ${sourceItem.validate} json-valid">
    <div class="card-body">
        <p class="card-text d-flex justify-content-between"><span><svg class="svg-inline--fa fa-circle-question fa-fw" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="circle-question" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"></path></svg><!-- <i class="fas fa-circle-question fa-fw"></i> Font Awesome fontawesome.com --> JSON valid</span></p>
    </div>
</div>
<div class="card text-white bg-info rounded-0 ${sourceItem.validate} schema-valid">
    <div class="card-body">
        <p class="card-text d-flex justify-content-between"><span><svg class="svg-inline--fa fa-circle-question fa-fw" aria-hidden="true" focusable="false" data-prefix="fas" data-icon="circle-question" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" data-fa-i2svg=""><path fill="currentColor" d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM169.8 165.3c7.9-22.3 29.1-37.3 52.8-37.3h58.3c34.9 0 63.1 28.3 63.1 63.1c0 22.6-12.1 43.5-31.7 54.8L280 264.4c-.2 13-10.9 23.6-24 23.6c-13.3 0-24-10.7-24-24V250.5c0-8.6 4.6-16.5 12.1-20.8l44.3-25.4c4.7-2.7 7.6-7.7 7.6-13.1c0-8.4-6.8-15.1-15.1-15.1H222.6c-3.4 0-6.4 2.1-7.5 5.3l-.4 1.2c-4.4 12.5-18.2 19-30.6 14.6s-19-18.2-14.6-30.6l.4-1.2zM224 352a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"></path></svg><!-- <i class="fas fa-circle-question fa-fw"></i> Font Awesome fontawesome.com --> schema valid</span></p>
    </div>
</div>
</div>`;

/**
 * HTMLEncode function
 * kudos to https://stackoverflow.com/a/784765/394921
 * @param {string} str
 * @returns
 */
const HTMLEncode = (str) => {
    // avoid a double encoding!
    str = str.replaceAll('&#039;', '"');
    str = [...str];
    //    ^ es20XX spread to Array: keeps surrogate pairs
    let i = str.length, aRet = [];

    while (i--) {
        var iC = str[i].codePointAt(0);
        if (iC < 65 || iC > 127 || (iC>90 && iC<97)) {
            aRet[i] = '&#'+iC+';';
        } else {
            aRet[i] = str[i];
        }
    }
    return aRet.join('');
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
    conn = new WebSocket( 'wss://litcal-test.johnromanodorazio.com' );

    /**
     * Event handler for the onopen event. Called when the websocket connection to the test server is established.
     * Logs a message to the console, shows a toast to indicate the connection is established, and updates the state to ReadyState.
     * Additionally, it stops the connection attempt timer, sets ReadyToRunTests.SocketReady to true, and tries to enable the test runner button.
     * @param {Event} e - The onopen event object.
     */
    conn.onopen = ( e ) => {
        console.log( "Websocket connection established!" );
        $( '#websocket-connected' ).toast( 'show' );
        $( '#websocket-status' ).removeClass( 'bg-secondary bg-warning bg-danger' ).addClass( 'bg-success' ).find( 'svg' ).removeClass( 'fa-plug fa-plug-circle-xmark fa-plug-circle-exclamation' ).addClass( 'fa-plug-circle-check' );
        if ( connectionAttempt !== null ) {
            clearInterval( connectionAttempt );
            connectionAttempt = null;
        }
        currentState = TestState.ReadyState;
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
    conn.onmessage = ( e ) => {
        const responseData = JSON.parse( e.data );
        console.log( responseData );
        if ( responseData.type === "success" ) {
            $( responseData.classes ).removeClass( 'bg-info' ).addClass( 'bg-success' );
            $( responseData.classes ).find( '.fa-circle-question' ).removeClass( 'fa-circle-question' ).addClass( 'fa-circle-check' );
            $( '#successfulCount' ).text( ++successfulTests );
            switch( currentState ) {
                case TestState.ExecutingResourceValidations:
                    $( '#successfulResourceDataTestsCount' ).text( ++successfulResourceDataTests );
                    break;
                case TestState.ExecutingSourceValidations:
                    $( '#successfulSourceDataTestsCount' ).text( ++successfulSourceDataTests );
                    break;
            }
        }
        else if ( responseData.type === "error" ) {
            $( responseData.classes ).removeClass( 'bg-info' ).addClass( 'bg-danger' );
            $( responseData.classes ).find( '.fa-circle-question' ).removeClass( 'fa-circle-question' ).addClass( 'fa-circle-xmark' );
            $( responseData.classes ).find('.card-text').append(`<span title="${HTMLEncode( responseData.text )}" role="button" class="float-right"><i class="fas fa-message-exclamation"></i></span>`);
            $( '#failedCount' ).text( ++failedTests );
            switch( currentState ) {
                case TestState.ExecutingResourceValidations:
                    $( '#failedResourceDataTestsCount' ).text( ++failedResourceDataTests );
                    break;
                case TestState.ExecutingSourceValidations:
                    $( '#failedSourceDataTestsCount' ).text( ++failedSourceDataTests );
                    break;
            }
        }
        if ( currentState !== TestState.JobsFinished ) {
            runTests();
        }
        performance.mark( 'litcalTestRunnerEnd' );
        let totalTestTime = performance.measure( 'litcalTestRunner', 'litcalTestRunnerStart', 'litcalTestRunnerEnd' );
        console.log( 'Total test time = ' + Math.round( totalTestTime.duration ) + 'ms' );
        $( '#total-time' ).text( MsToTimeString( Math.round( totalTestTime.duration ) ) );
        switch( currentState ) {
            case TestState.ExecutingResourceValidations:
                performance.mark( 'resourceDataTestsEnd' );
                let totalSourceDataTestTime = performance.measure( 'litcalResourceDataTestRunner', 'resourceDataTestsStart', 'resourceDataTestsEnd' );
                $( '#totalSourceDataTestsTime' ).text( MsToTimeString( Math.round( totalSourceDataTestTime.duration ) ) );
                break;
            case TestState.ExecutingSourceValidations:
                performance.mark( 'sourceDataTestsEnd' );
                let totalCalendarDataTestTime = performance.measure( 'litcalSourceDataTestRunner', 'sourceDataTestsStart', 'sourceDataTestsEnd' );
                $( '#totalCalendarDataTestsTime' ).text( MsToTimeString( Math.round( totalCalendarDataTestTime.duration ) ) );
                break;
        }
    };

    /**
     * Handles the onclose event of the websocket connection.
     * Logs a message to the console, shows a toast to indicate the connection is closed,
     * and updates the state to JobsFinished.
     * Additionally, it stops the connection attempt timer, sets ReadyToRunTests.SocketReady to false,
     * and tries to enable the test runner button.
     * @param {Event} e - The onclose event object.
     */
    conn.onclose = ( e ) => {
        console.log( 'Connection closed on remote end' );
        ReadyToRunTests.SocketReady = false;
        ReadyToRunTests.tryEnableBtn();
        if ( connectionAttempt === null ) {
            $( '#websocket-status' ).removeClass( 'bg-secondary bg-danger bg-success' ).addClass( 'bg-warning' )
                .find( 'svg' ).removeClass( 'fa-plug fa-plug-circle-check fa-plug-circle-exclamation' ).addClass( 'fa-plug-circle-xmark' );
            $( '#websocket-closed' ).toast( 'show' );
            $( '.fa-spin' ).removeClass( 'fa-spin' );
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
        $( '#websocket-status' ).removeClass( 'bg-secondary bg-warning bg-success' ).addClass( 'bg-danger' )
            .find( 'svg' ).removeClass( 'fa-plug fa-plug-circle-check fa-plug-circle-xmark' ).addClass( 'fa-plug-circle-exclamation' );
        console.error( 'Websocket connection error:' );
        console.log( e );
        $( '#websocket-error' ).toast( 'show' );
        $( '.fa-spin' ).removeClass( 'fa-spin' );
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
    document.querySelector('#startTestRunnerBtnLbl').textContent = txt;
}

/**
 * Sets up the page by populating the page with the resource data tests and setting the page status to ready.
 * The page status is set to ready after the page has finished loading and the resource data tests have been
 * populated.
 */
const setupPage = () => {
    $(document).ready(() =>  {
        if (startTestRunnerBtnLbl === '') {
            startTestRunnerBtnLbl = document.querySelector('#startTestRunnerBtnLbl').textContent;
        }
        let resourcePathHtml = Object.keys(resourcePaths).map(resourceTemplate).join('');
        document.querySelector('#resourceDataTests .resourcedata-tests').innerHTML = resourcePathHtml;
        let sourcePathHtml = sourceDataChecks.map(sourceTemplate).join('');
        document.querySelector('#sourceDataTests .sourcedata-tests').innerHTML = sourcePathHtml;
        ReadyToRunTests.PageReady = true;
        connectWebSocket();
    });
}


let currentState                = TestState.NotReady;
let MetaData                    = null;
let Missals                     = null;
let startTestRunnerBtnLbl       = '';
let countryNames                = new Intl.DisplayNames( [ 'en' ], { type: 'region' } );
let connectionAttempt           = null;
let conn;

let messageCounter;
let successfulTests             = 0;
let failedTests                 = 0;
let successfulSourceDataTests   = 0;
let failedSourceDataTests       = 0;
let successfulResourceDataTests = 0;
let failedResourceDataTests     = 0;

/**
 * Loads all the asynchronous data needed for the page to function.
 * This includes the calendars metadata and the missals metadata.
 * When the data is loaded, it sets the necessary variables and proceeds to
 * set up the page by populating the page with the resource data tests and setting
 * the page status to ready.
 */
const loadAsyncData = () => {
    Promise.all([
        fetch( ENDPOINTS.CALENDARS, {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        }).then(response => response.json()),
        fetch( ENDPOINTS.MISSALS, {
            //TODO: using 'POST' method is giving a Cors error, why?
            //      https://litcal-tests.johnromanodorazio.com is set as an allowed origin
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        }).then(response => response.json())
    ]).then(dataArr => {
        dataArr.forEach(data => {
            if(data.hasOwnProperty('litcal_metadata')) {
                MetaData = data.litcal_metadata;
                const { national_calendars_keys, diocesan_calendars_keys, diocesan_calendars, wider_regions, wider_regions_keys } = MetaData;
                NationalCalendarsArr = national_calendars_keys.slice(1);
                wider_regions.forEach(region => {
                    sourceDataChecks.push({
                        "validate": `wider-region-${region.name}`,
                        "sourceFile": region.data_path,
                        "category": "sourceDataCheck"
                    });
                    sourceDataChecks.push({
                        "validate": `wider-region-i18n-${region.name}`,
                        "sourceFolder": region.i18n_path,
                        "category": "sourceDataCheck"
                    });
                });

                //NationalCalendarsArr.sort( ( a, b ) => countryNames.of(a).localeCompare( countryNames.of(b) ) );
                NationalCalendarsArr.forEach(nation => {
                    resourcePaths[`data-path-nation-${nation}`] = `/data/nation/${nation}`;
                    resourceDataChecks.push({
                        "validate": `data-path-nation-${nation}`,
                        "sourceFile": ENDPOINTS.DATA + `/nation/${nation}`,
                        "category": "resourceDataCheck"
                    });
                    resourcePaths[`events-path-nation-${nation}`] = `/events/nation/${nation}`;
                    resourceDataChecks.push({
                        "validate": `events-path-nation-${nation}`,
                        "sourceFile": ENDPOINTS.EVENTS + `/nation/${nation}`,
                        "category": "resourceDataCheck"
                    });
                    sourceDataChecks.push({
                        "validate": `national-calendar-${nation}`,
                        "sourceFile": nationalCalendarDataPath(nation),
                        "category": "sourceDataCheck"
                    });
                });

                diocesan_calendars_keys.forEach(diocese => {
                    resourcePaths[`data-path-diocese-${diocese}`] = `/data/diocese/${diocese}`;
                    resourceDataChecks.push({
                        "validate": `data-path-diocese-${diocese}`,
                        "sourceFile": ENDPOINTS.DATA + `/diocese/${diocese}`,
                        "category": "resourceDataCheck"
                    });
                    resourcePaths[`events-path-diocese-${diocese}`] = `/events/diocese/${diocese}`;
                    resourceDataChecks.push({
                        "validate": `events-path-diocese-${diocese}`,
                        "sourceFile": ENDPOINTS.EVENTS + `/diocese/${diocese}`,
                        "category": "resourceDataCheck"
                    });
                });

                wider_regions_keys.forEach(widerRegion => {
                    // we need to request a locale for widerRegion on the data path
                    // so let's retrieve the first available locale from the metadata
                    console.log(wider_regions);
                    let widerRegionObj = wider_regions.filter(region => region.name === widerRegion)[0];
                    console.log(widerRegion);
                    console.log(widerRegionObj);
                    let widerRegionFirstLang = widerRegionObj.languages[0];
                    console.log(widerRegionFirstLang);
                    resourcePaths[`data-path-wider-region-${widerRegion}`] = `/data/widerregion/${widerRegion}`;
                    resourceDataChecks.push({
                        "validate": `data-path-wider-region-${widerRegion}`,
                        "sourceFile": ENDPOINTS.DATA + `/widerregion/${widerRegion}?locale=${widerRegionFirstLang}`,
                        "category": "resourceDataCheck"
                    });
                });

                diocesan_calendars.forEach(diocese => {
                    sourceDataChecks.push({
                        "validate": `diocesan-calendar-${diocese.calendar_id}`,
                        "sourceFile": diocesanCalendarDataPath(diocese.nation, diocese.calendar_id),
                        "category": "sourceDataCheck"
                    });
                })

                ReadyToRunTests.MetaDataReady = true;
                console.log( 'Metadata is ready' );
                if(Missals !== null) {
                    console.log('Missals was set first, proceeding to setup page...');
                    setupPage();
                }
            }
            else if(data.hasOwnProperty('litcal_missals')) {
                Missals = data.litcal_missals;
                resourcePaths[`missals-path`] = `/missals`;
                resourceDataChecks.push({
                    "validate": "missals-path",
                    "sourceFile": ENDPOINTS.MISSALS,
                    "category": "resourceDataCheck"
                });
                Missals.forEach(missal => {
                    resourcePaths[`missals-path-${missal.missal_id}`] = `/missals/${missal.missal_id}`;
                    resourceDataChecks.push({
                        "validate": `missals-path-${missal.missal_id}`,
                        "sourceFile": ENDPOINTS.MISSALS + `/${missal.missal_id}`,
                        "category": "resourceDataCheck"
                    });
                    sourceDataChecks.push({
                        "validate": `proprium-de-sanctis${missal.region === 'VA' ? '' : `-${missal.region}`}-${missal.year_published}`,
                        "sourceFile": missal.data_path,
                        "category": "sourceDataCheck"
                    });
                    if (missal.hasOwnProperty('i18n_path')) {
                        sourceDataChecks.push({
                            "validate": `proprium-de-sanctis${missal.region === 'VA' ? '' : `-${missal.region}`}-${missal.year_published}-i18n`,
                            "sourceFolder": missal.i18n_path,
                            "category": "sourceDataCheck"
                        });
                    }
                });
                ReadyToRunTests.MissalsReady = true;
                console.log( 'Missals is ready');
                if(MetaData !== null) {
                    console.log('MetaData was set first, proceeding to setup page...');
                    setupPage();
                }
            }
        });
    });
}


/**
 * Manages the execution of resource validation tests and transitions through different test states.
 *
 * This function handles the following states:
 * - ReadyState: Initializes test indices, marks the start of resource data tests, and sends the first test for execution.
 * - ExecutingResourceValidations: Manages the execution loop for resource validation tests, sending new tests when a cycle is complete, and transitioning to JobsFinished when all tests are done.
 * - JobsFinished: Indicates all tests have been completed, updates UI to reflect the completion state.
 *
 * Utilizes performance marks to track test execution time and updates the UI to show test progress.
 */
const runTests = () => {
    switch ( currentState ) {
        case TestState.ReadyState:
            index = 0;
            messageCounter = 0;
            currentState = TestState.ExecutingResourceValidations;
            performance.mark( 'resourceDataTestsStart' );
            if( $('#resourceDataTests').hasClass('show') === false ) {
                $('#resourceDataTests').collapse('show');
            }
            conn.send(
                JSON.stringify({
                    action: 'executeValidation',
                    ...resourceDataChecks[ index++ ]
                })
            );
            break;
        case TestState.ExecutingResourceValidations:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if ( index < resourceDataChecks.length ) {
                    conn.send(
                        JSON.stringify({
                            action: 'executeValidation',
                            ...resourceDataChecks[ index++ ]
                        })
                    );
                } else {
                    console.log( 'Resource file validation jobs are finished! Now continuing to check source data...' );
                    index = 0;
                    currentState = TestState.ExecutingSourceValidations;
                    performance.mark( 'sourceDataTestsStart' );
                    $('#sourceDataTests').collapse('show');
                    conn.send(
                        JSON.stringify({
                            action: 'executeValidation',
                            ...sourceDataChecks[ index++ ]
                        })
                    );
                }
            }
            break;
        case TestState.ExecutingSourceValidations:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if ( index < sourceDataChecks.length ) {
                    conn.send(
                        JSON.stringify({
                            action: 'executeValidation',
                            ...sourceDataChecks[ index++ ]
                        })
                    );
                } else {
                    currentState = TestState.JobsFinished;
                }
            }
            break;
        case TestState.JobsFinished:
            console.log( 'All jobs finished!' );
            $( '#tests-complete' ).toast( 'show' );
            let $btnPrimary = $( '.fa-spin' ).closest( '.btn-primary' );
            $btnPrimary.prop( 'disabled', true ).removeClass( 'btn-primary' ).addClass( 'btn-secondary' );
            $( '.fa-spin' ).removeClass( 'fa-spin' ).removeClass( 'fa-rotate' ).addClass( 'fa-stop' );
            setTestRunnerBtnLblTxt('Tests Complete');
            break;
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

$(document).on('change', '#apiVersionsDropdownItems', setEndpoints);

$(document).on('click', '#startTestRunnerBtn', () => {
    if( currentState === TestState.ReadyState || currentState === TestState.JobsFinished ) {
        index = 0;
        calendarIndex = 0;
        messageCounter = 0;
        successfulTests = 0;
        failedTests = 0;
        currentState = conn.readyState !== WebSocket.CLOSED && conn.ReadyState !== WebSocket.CLOSING ? TestState.ReadyState : TestState.JobsFinished;
        if ( conn.readyState !== WebSocket.OPEN ) {
            console.warn( 'cannot run tests: websocket connection is not ready' );
            console.warn( conn.readyState.toString );
        } else {
            performance.mark( 'litcalTestRunnerStart' );
            $( '#startTestRunnerBtn' ).find( '.fa-rotate' ).addClass( 'fa-spin' );
            setTestRunnerBtnLblTxt('Tests Running...');
            console.log( `currentState = ${currentState}` );
            runTests();
        }
    } else {
        //TODO: perhaps we could allow to interrupt running tests?
        console.warn('Please do not try to start a test run while tests are running!');
    }
});

setEndpoints();
loadAsyncData();
