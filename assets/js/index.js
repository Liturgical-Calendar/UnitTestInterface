const Years = [];
const thisYear = new Date().getFullYear();
const twentyFiveYearsFromNow = thisYear + 25;
let baseYear = 1970;
while (baseYear <= twentyFiveYearsFromNow ) {
    Years.push( baseYear++ );
}

const ENDPOINTS = {
    VERSION: "dev",
    METADATA: "",
    TESTSINDEX: "",
    DECREES: "",
    MISSALS: ""
}

const sourceDataChecks = [
    {
        "validate": "LitCalMetadata",
        "sourceFile": ENDPOINTS.METADATA,
        "category": "universalcalendar"
    },
    {
        "validate": "PropriumDeTempore",
        "sourceFile": "data/missals/propriumdetempore.json",
        "category": "universalcalendar"
    },
    {
        "validate": "PropriumDeSanctis1970",
        "sourceFile": "data/missals/propriumdesanctis_1970/propriumdesanctis_1970.json",
        "category": "universalcalendar"
    },
    {
        "validate": "PropriumDeSanctis2002",
        "sourceFile": "data/missals/propriumdesanctis_2002/propriumdesanctis_2002.json",
        "category": "universalcalendar"
    },
    {
        "validate": "PropriumDeSanctis2008",
        "sourceFile": "data/missals/propriumdesanctis_2008/propriumdesanctis_2008.json",
        "category": "universalcalendar"
    },
    {
        "validate": "MemorialsFromDecrees",
        "sourceFile": ENDPOINTS.DECREES,
        "category": "universalcalendar"
    },
    {
        "validate": "RegionalCalendarsIndex",
        "sourceFile": "data/nations/index.json",
        "category": "universalcalendar"
    }
];

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
            ENDPOINTS.METADATA    = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/calendars`;
            ENDPOINTS.TESTSINDEX  = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/tests`;
            ENDPOINTS.DECREES     = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/decrees`;
            ENDPOINTS.MISSALS     = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/missals`;
            break;
        case 'v3':
            ENDPOINTS.METADATA    = `https://litcal.johnromanodorazio.com/api/v3/LitCalMetadata.php`;
            ENDPOINTS.TESTSINDEX  = `https://litcal.johnromanodorazio.com/api/v3/LitCalTestsIndex.php`;
            break;
    }
    document.querySelector('#admin_url').setAttribute('href', `/admin.php?apiversion=${ENDPOINTS.VERSION}`);
    sourceDataChecks[0].sourceFile = ENDPOINTS.METADATA;
    sourceDataChecks[5].sourceFile = ENDPOINTS.DECREES;
}

class ReadyToRunTests {
    static PageReady        = false;
    static SocketReady      = false;
    static AsyncDataReady   = false;
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
        console.log( 'ReadyToRunTests.SocketReady = '       + ReadyToRunTests.SocketReady );
        console.log( 'ReadyToRunTests.AsyncDataReady = '    + ReadyToRunTests.AsyncDataReady );
        console.log( 'ReadyToRunTests.PageReady = '         + ReadyToRunTests.PageReady );
        let testsReady = ReadyToRunTests.check();
        $( '#startTestRunnerBtn' ).prop( 'disabled', !testsReady ).removeClass( 'btn-secondary' ).addClass( 'btn-primary' );
        $( '#startTestRunnerBtn' ).find( '.fa-stop' ).removeClass( 'fa-stop' ).addClass( 'fa-rotate' );
        if( testsReady ) {
            // only try to set the #startTestRunnerBtnLbl with the stored value when the page is ready
            // to prevent if from being set to an empty value (before we have actually stored the original value)
            setTestRunnerBtnLblTxt(startTestRunnerBtnLbl);
            $( '.page-loader' ).fadeOut('slow');
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

class TestState {
    static ReadyState                   = new TestState( 'ReadyState' );
    static ExecutingValidations         = new TestState( 'ExecutingValidations' );
    static ValidatingCalendarData       = new TestState( 'ValidatingCalendarData' );
    static SpecificUnitTests            = new TestState( 'SpecificUnitTests' );
    static JobsFinished                 = new TestState( 'JobsFinished' );

    /**
     * @param {string} name The name of the TestState.
     *                      Currently, the following names are possible:
     *                      ReadyState, ExecutingValidations,
     *                      ValidatingCalendarData, SpecificUnitTests,
     *                      JobsFinished.
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
 * Returns a string that represents the HTML template for a specific calendar.
 * This template is used in the index page to represent the state of a calendar test.
 * The template has the following structure:
 * - A paragraph with the name of the calendar that is being tested.
 * - Three div elements, each with a class that represents the state of the calendar test.
 *   The classes are:
 *   - `file-exists`: indicates whether the calendar data exists.
 *   - `json-valid`: indicates whether the calendar data is valid JSON.
 *   - `schema-valid`: indicates whether the calendar data is valid according to the schema.
 * The template is used by the `calendarTemplate` function in `index.js`.
 * @param {string} calendarName The name of the calendar that is being tested.
 * @return {string} The HTML template as a string.
 */
const testTemplate = ( calendarName ) => {
    return `
<p class="text-center mb-0 bg-secondary text-white currentSelectedCalendar" title="${calendarName}">${truncate(calendarName,22)}</p>
<div class="card text-white bg-info rounded-0 file-exists calendar-${calendarName}">
    <div class="card-body">
        <p class="card-text"><i class="fas fa-circle-question fa-fw"></i> data exists</p>
    </div>
</div>
<div class="card text-white bg-info rounded-0 json-valid calendar-${calendarName}">
    <div class="card-body">
        <p class="card-text"><i class="fas fa-circle-question fa-fw"></i> JSON valid</p>
    </div>
</div>
<div class="card text-white bg-info rounded-0 schema-valid calendar-${calendarName}">
    <div class="card-body">
        <p class="card-text"><i class="fas fa-circle-question fa-fw"></i> schema valid</p>
    </div>
</div>
`;
}

/**
 * Returns a string that represents the HTML template for a specific year of calendar data testing.
 * This template is used in the index page to represent the state of a calendar test.
 * The template has the following structure:
 * - A paragraph with the year of the calendar being tested.
 * @param {number} idx The index of the year to be tested.
 * @return {string} The HTML template as a string.
 */
const calDataTestTemplate = ( idx ) => {
    let i = Years.length - idx;
    let year = Years[ i ];
    return `
<div class="col-1${i === 0 || i % 10 === 0 ? ' offset-1' : ''}">
    <p class="text-center mb-0 year-${year} fw-bold fs-5">${year}</p>
</div>
`;
}

/**
 * Returns a string that represents the HTML template for a specific source data check.
 * The template has the following structure:
 * - A paragraph with the name of the source data check.
 * - Three div elements, each with a class that represents the state of the source data check.
 *   The classes are:
 *   - `file-exists`: indicates whether the source data exists.
 *   - `json-valid`: indicates whether the source data is valid JSON.
 *   - `schema-valid`: indicates whether the source data is valid according to the schema.
 * The template is used by the `index.js` script.
 * @param {string} check The name of the source data check.
 * @param {string} category The category of source data being checked.
 * @param {number} idx The index of the source data check.
 * @return {string} The HTML template as a string.
 */
const sourceDataCheckTemplate = ( check, category, idx ) => {
    let categoryStr;
    switch(category){
        case 'nationalcalendar':
            categoryStr = 'National Calendar definition: defines any actions that need to be taken on the festivities already defined in the Universal Calendar, to adapt them to this specific National Calendar';
            break;
        case 'widerregioncalendar':
            categoryStr = 'Wider Region definition: contains any festivities that apply not only to a particular nation, but to a group of nations that belong to the wider region. There will also be translation files associated with this data';
            break;
        case 'propriumdesanctis':
            categoryStr = 'Proprium de Sanctis data: contains any festivities defined in the Missal printed for the given nation, that are not already defined in the Universal Calendar';
            break;
        case 'diocesancalendar':
            categoryStr = 'Diocesan Calendar definition: contains any festivities that are proper to the given diocese. This data will not overwrite national or universal calendar data, it will be simply appended to the calendar';
            break;
    }
    return `<div class="col-1${idx === 0 || idx % 11 === 0 ? ' offset-1' : ''}">
    <p class="text-center mb-0 bg-secondary text-white"><span title="${check}.json">${category !== 'universalcalendar' ? truncate(check,14) : truncate(check,22)}.json</span>${category !== 'universalcalendar' ? ` <i class="fas fa-circle-info fa-fw" role="button" title="${categoryStr}"></i>`:''}</p>
    <div class="card text-white bg-info rounded-0 ${check} file-exists">
        <div class="card-body">
            <p class="card-text d-flex justify-content-between"><span><i class="fas fa-circle-question fa-fw"></i> data exists</span></p>
        </div>
    </div>
    <div class="card text-white bg-info rounded-0 ${check} json-valid">
        <div class="card-body">
            <p class="card-text d-flex justify-content-between"><span><i class="fas fa-circle-question fa-fw"></i> JSON valid</span></p>
        </div>
    </div>
    <div class="card text-white bg-info rounded-0 ${check} schema-valid">
        <div class="card-body">
            <p class="card-text d-flex justify-content-between"><span><i class="fas fa-circle-question fa-fw"></i> schema valid</span></p>
        </div>
    </div>
</div>
`;
}


const truncate = (source, size) => source.length > size ? source.slice(0, size - 1) + "*" : source;

/**
 * HTMLEncode function
 * kudos to https://stackoverflow.com/a/784765/394921
 * @param {*} str
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
let index;
let calendarIndex;
let yearIndex;
let messageCounter;
let nations = [];

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

let currentSelectedCalendar     = "VATICAN";
let currentNationalCalendar     = "VATICAN";
let currentCalendarCategory     = "nationalcalendar";
let currentResponseType         = "JSON";
let currentSourceDataChecks     = [];
let countryNames                = new Intl.DisplayNames( [ 'en' ], { type: 'region' } );
let CalendarNations             = [];
let selectOptions               = {};
//let NationalCalendarsArr        = [];
let NationalCalendarTemplates   = [ testTemplate( currentSelectedCalendar ) ];
let DiocesanCalendarTemplates   = [];

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
const runTests = () => {
    switch ( currentState ) {
        case TestState.ReadyState:
            index = 0;
            messageCounter = 0;
            currentState = TestState.ExecutingValidations;
            performance.mark( 'sourceDataTestsStart' );
            if( $('#sourceDataTests').hasClass('show') === false ) {
                $('#sourceDataTests').collapse('show');
            }
            conn.send( JSON.stringify( { action: 'executeValidation', ...currentSourceDataChecks[ index++ ] } ) );
            break;
        case TestState.ExecutingValidations:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' )
                messageCounter = 0;
                if ( index < currentSourceDataChecks.length ) {
                    conn.send( JSON.stringify( { action: 'executeValidation', ...currentSourceDataChecks[ index++ ] } ) );
                } else {
                    console.log( 'Source file validation jobs are finished! Now continuing to check calendar data...' );
                    currentState = TestState.ValidatingCalendarData;
                    index = 0;
                    calendarIndex = 0;
                    performance.mark( 'calendarDataTestsStart' );
                    conn.send(
                        JSON.stringify({
                            action: 'validateCalendar',
                            year: Years[ index++ ],
                            calendar: currentSelectedCalendar,
                            category: currentCalendarCategory,
                            responsetype: currentResponseType
                        })
                    );
                    $('#calendarDataTests').collapse('show');
                }
            }
            break;
        case TestState.ValidatingCalendarData:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if ( index < Years.length ) {
                    conn.send( JSON.stringify( { action: 'validateCalendar', year: Years[ index++ ], calendar: currentSelectedCalendar, category: currentCalendarCategory, responsetype: currentResponseType } ) );
                }
                else {
                    console.log( 'Calendar data validation jobs are finished! Now continuing to specific unit tests...' );
                    currentState = TestState.SpecificUnitTests;
                    index = 0;
                    yearIndex = 0;
                    console.log( `Starting specific unit test ${SpecificUnitTestCategories[ index ].test} for calendar ${currentSelectedCalendar} (${currentCalendarCategory})...` );
                    performance.mark( 'specificUnitTestsStart' );
                    performance.mark( `specificUnitTest${SpecificUnitTestCategories[ index ].test}Start` );
                    conn.send( JSON.stringify({
                        ...SpecificUnitTestCategories[ index ],
                        year: SpecificUnitTestYears[ SpecificUnitTestCategories[ index ].test ][ yearIndex++ ],
                        calendar: currentSelectedCalendar,
                        category: currentCalendarCategory
                    }) );
                    $('#specificUnitTests').collapse('show');
                    $(`#specificUnitTest-${SpecificUnitTestCategories[ index ].test}`).collapse('show');
                }
            }
            break;
        case TestState.SpecificUnitTests:
            if ( yearIndex < SpecificUnitTestYears[ SpecificUnitTestCategories[ index ].test ].length ) {
                conn.send( JSON.stringify( { ...SpecificUnitTestCategories[ index ], year: SpecificUnitTestYears[ SpecificUnitTestCategories[ index ].test ][ yearIndex++ ], calendar: currentSelectedCalendar, category: currentCalendarCategory } ) );
            }
            else if ( ++index < SpecificUnitTestCategories.length ) {
                yearIndex = 0;
                console.log( `Specific unit test ${SpecificUnitTestCategories[ index - 1 ].test} for calendar ${currentSelectedCalendar} (${currentCalendarCategory}) is complete, continuing to the next test...` );
                console.log( `Starting specific unit test ${SpecificUnitTestCategories[ index ].test} for calendar ${currentSelectedCalendar} (${currentCalendarCategory})...` );
                performance.mark( `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}End` );
                let totalUnitTestTime = performance.measure(
                    'litcalUnitTestRunner',
                    `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}Start`,
                    `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}End`
                );
                $( `#total${SpecificUnitTestCategories[ index - 1 ].test}TestsTime` ).text( MsToTimeString( Math.round( totalUnitTestTime.duration ) ) );
                performance.mark( `specificUnitTest${SpecificUnitTestCategories[ index ].test}Start` );
                conn.send( JSON.stringify({
                    ...SpecificUnitTestCategories[ index ],
                    year: SpecificUnitTestYears[ SpecificUnitTestCategories[ index ].test ][ yearIndex++ ],
                    calendar: currentSelectedCalendar,
                    category: currentCalendarCategory
                }) );
                $(`#specificUnitTest-${SpecificUnitTestCategories[ index ].test}`).collapse('show');
            }
            else {
                console.log( 'Specific unit test validation jobs are finished!' );
                performance.mark( `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}End` );
                let totalUnitTestTime = performance.measure(
                    'litcalUnitTestRunner',
                    `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}Start`,
                    `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}End`
                );
                $( `#total${SpecificUnitTestCategories[ index - 1 ].test}TestsTime` ).text( MsToTimeString( Math.round( totalUnitTestTime.duration ) ) );
                currentState = TestState.JobsFinished;
                runTests();
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
 * Connects to the websocket server at wss://litcal-test.johnromanodorazio.com
 * and sets up event listeners for the open, message, close, and error events.
 * If the connection is successful, it sets the state to ReadyState and tries
 * to enable the test runner button. If the connection is closed, it sets the
 * state to JobsFinished and tries to enable the test runner button. If an
 * error occurs, it sets the state to JobsFinished and shows an error toast.
 */
const connectWebSocket = () => {
    conn = new WebSocket( 'wss://litcal-test.johnromanodorazio.com' );

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
     * If the message is a success, it updates the corresponding success count and
     * marks the test as successful. If the message is an error, it updates the
     * corresponding failed count and marks the test as failed. If the test is
     * finished, it updates the total test time and displays it.
     */
    conn.onmessage = ( e ) => {
        const responseData = JSON.parse( e.data );
        console.log( responseData );
        if ( responseData.type === "success" ) {
            $( responseData.classes ).removeClass( 'bg-info' ).addClass( 'bg-success' );
            $( responseData.classes ).find( '.fa-circle-question' ).removeClass( 'fa-circle-question' ).addClass( 'fa-circle-check' );
            $( '#successfulCount' ).text( ++successfulTests );
            switch( currentState ) {
                case TestState.ExecutingValidations:
                    $( '#successfulSourceDataTestsCount' ).text( ++successfulSourceDataTests );
                    break;
                case TestState.ValidatingCalendarData:
                    $( '#successfulCalendarDataTestsCount' ).text( ++successfulCalendarDataTests );
                    break;
                case TestState.SpecificUnitTests:
                    $( '#successfulUnitTestsCount' ).text( ++successfulUnitTests );
                    let specificUnitTestSuccessCount = $(`#specificUnitTest-${responseData.test}`).find('.bg-success').length;
                    $(`#successful${responseData.test}TestsCount`).text(specificUnitTestSuccessCount);
                    break;
            }
        }
        else if ( responseData.type === "error" ) {
            $( responseData.classes ).removeClass( 'bg-info' ).addClass( 'bg-danger' );
            $( responseData.classes ).find( '.fa-circle-question' ).removeClass( 'fa-circle-question' ).addClass( 'fa-circle-xmark' );
            $( responseData.classes ).find('.card-text').append(`<span title="${HTMLEncode( responseData.text )}" role="button" class="float-right"><i class="fas fa-message-exclamation"></i></span>`);
            $( '#failedCount' ).text( ++failedTests );
            switch( currentState ) {
                case TestState.ExecutingValidations:
                    $( '#failedSourceDataTestsCount' ).text( ++failedSourceDataTests );
                    break;
                case TestState.ValidatingCalendarData:
                    $( '#failedCalendarDataTestsCount' ).text( ++failedCalendarDataTests );
                    break;
                case TestState.SpecificUnitTests:
                    $( '#failedUnitTestsCount' ).text( ++failedUnitTests );
                    let specificUnitTestFailedCount = $(`#specificUnitTest-${responseData.test}`).find('.bg-danger').length;
                    $(`#failed${responseData.test}TestsCount`).text(specificUnitTestFailedCount);
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
            case TestState.ExecutingValidations:
                performance.mark( 'sourceDataTestsEnd' );
                let totalSourceDataTestTime = performance.measure( 'litcalSourceDataTestRunner', 'sourceDataTestsStart', 'sourceDataTestsEnd' );
                $( '#totalSourceDataTestsTime' ).text( MsToTimeString( Math.round( totalSourceDataTestTime.duration ) ) );
                break;
            case TestState.ValidatingCalendarData:
                performance.mark( 'calendarDataTestsEnd' );
                let totalCalendarDataTestTime = performance.measure( 'litcalCalendarDataTestRunner', 'calendarDataTestsStart', 'calendarDataTestsEnd' );
                $( '#totalCalendarDataTestsTime' ).text( MsToTimeString( Math.round( totalCalendarDataTestTime.duration ) ) );
                break;
            case TestState.SpecificUnitTests:
                performance.mark( 'specificUnitTestsEnd' );
                let totalUnitTestTime = performance.measure( 'litcalUnitTestRunner', 'specificUnitTestsStart', 'specificUnitTestsEnd' );
                $( '#totalUnitTestsTime' ).text( MsToTimeString( Math.round( totalUnitTestTime.duration ) ) );
                break;
        }
    };

    /**
     * Handles the websocket connection being closed by the server.
     * If the connection was closed by the server, it tries to reconnect
     * after 3 seconds.
     * @param {CloseEvent} e - The close event.
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
 * Sets the text content of the #startTestRunnerBtnLbl element to the given
 * string.
 * @param {string} txt - The text to set.
 */
const setTestRunnerBtnLblTxt = (txt) => {
    document.querySelector('#startTestRunnerBtnLbl').textContent = txt;
}

/**
 * Fetches metadata and tests data from the server.
 * If the promise resolves, it sets the MetaData and UnitTests variables.
 * If the promise rejects, it logs an error message.
 * @returns {Promise<void>}
 */
const fetchMetadataAndTests = () => {
    Promise.all([
        fetch( ENDPOINTS.METADATA, {
            method: "GET",
            //mode: "no-cors",
            headers: {
                Accept: "application/json"
            }
        }),
        fetch( ENDPOINTS.TESTSINDEX, {
            method: "GET",
            //mode: "no-cors",
            headers: {
                Accept: "application/json"
            }
        }),
        fetch( ENDPOINTS.MISSALS, {
            method: "GET",
            //mode: "no-cors",
            headers: {
                Accept: "application/json"
            }
        })
    ])
      .then((responses) => {
        return Promise.all(responses.map((response) => {
            if(response.ok) { return response.json(); }
            else { throw new Error(`response.status = ${response.status}, response.statusText = ${response.statusText}`); }
        }));
      })
      .then( dataArr => {
        dataArr.forEach(data => {
            console.log(data);
            if ( data.hasOwnProperty( 'litcal_metadata' ) ) {
                MetaData = data.litcal_metadata;
                const { national_calendars_keys, diocesan_calendars, diocesan_calendars_keys } = MetaData;
                for ( const calendar of diocesan_calendars_keys ) {
                    DiocesanCalendarTemplates.push( testTemplate( calendar ) );
                }
                diocesan_calendars.forEach(diocesanCalendar => {
                    if ( CalendarNations.indexOf( diocesanCalendar.nation ) === -1 ) {
                        CalendarNations.push( diocesanCalendar.nation );
                        selectOptions[ diocesanCalendar.nation ] = [];
                    }
                    selectOptions[ diocesanCalendar.nation ].push(
                        `<option data-calendartype="diocesancalendar" data-nationalcalendar="${diocesanCalendar.nation}" value="${diocesanCalendar.calendar_id}">${diocesanCalendar.diocese}</option>`
                    );
                })
                nations = national_calendars_keys;
                nations.sort( ( a, b ) => countryNames.of( a ).localeCompare( countryNames.of( b ) ) )
                CalendarNations.sort( ( a, b ) => countryNames.of( a ).localeCompare( countryNames.of( b ) ) );
                if( UnitTests !== null && RomanMissals !== null ) {
                    ReadyToRunTests.AsyncDataReady = true;
                    console.log( 'it seems that UnitTests and RomanMissals were set first, now Metadata is also ready' );
                    setupPage();
                }
            } else if ( data.hasOwnProperty( 'litcal_missals') ) {
                RomanMissals = data.litcal_missals;
                if( UnitTests !== null && MetaData !== null ) {
                    ReadyToRunTests.AsyncDataReady = true;
                    console.log( 'it seems that UnitTests and MetaData were set first, now RomanMissals is also ready' );
                    setupPage();
                }
            } else {
                if (data instanceof Array) {
                    UnitTests = data;
                } else if (data.hasOwnProperty('litcal_tests')) {
                    UnitTests = data.litcal_tests;
                } else {
                    let arrayStatus = data instanceof Array ? 'true' : 'false';
                    let objStatus = data.hasOwnProperty('litcal_tests') ? 'true' : 'false';
                    let message = `Could not decode tests data! Is it an array? ${arrayStatus} Is it an object with property 'litcal_tests'? ${objStatus}`;
                    console.error(message);
                }
                if( MetaData !== null && RomanMissals !== null ) {
                    ReadyToRunTests.AsyncDataReady = true;
                    console.log( 'it seems that Metadata and RomanMissals were set first, now UnitTests is also ready' );
                    setupPage();
                }
            }
        });
    }).catch((error) => {
        console.error('Error fetching metadata and/or roman missals and/or tests data:', error);
    });
}

/**
 * Appends an accordion item for a unit test with its assertions.
 * @param {Object} obj - The unit test object with its assertions.
 * @returns {undefined}
 */
const appendAccordionItem = (obj) => {

    let unitTestStr = '';
    let idy = 0;
    obj.assertions.forEach(assertion => {
        let dateStr = '';
        if( assertion.hasOwnProperty('expectedValue') && null !== assertion.expectedValue ) {
            dateStr = new Intl.DateTimeFormat("en-US", IntlDTOptions).format( assertion.expectedValue * 1000 );
        }
        else if ( assertion.hasOwnProperty('expected_value') && null !== assertion.expected_value ) {
            dateStr = new Intl.DateTimeFormat("en-US", IntlDTOptions).format( assertion.expected_value * 1000 );
        }
        unitTestStr += `
            <div class="col-1 ${idy===0 || idy % 11 === 0 ? 'offset-1' : ''}">
                <p class="text-center mb-0 fw-bold">${assertion.year}</p>
                <p class="text-center mb-0 bg-secondary text-white currentSelectedCalendar"></p>
                <div class="card text-white bg-info rounded-0 ${obj.name} year-${assertion.year} test-valid">
                    <div class="card-body">
                        <p class="card-text d-flex justify-content-between"><span><i class="fas fa-circle-question fa-fw"></i> test valid</span><i class="fas fa-circle-info" title="${assertion.assertion} ${dateStr}"></i></p>
                    </div>
                </div>
            </div>
        `;
        ++idy;
    });

    $('#specificUnitTestsAccordion').append(`
        <div class="accordion-item">
            <h2 class="row g-0 accordion-header" id="${obj.name}Header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#specificUnitTest-${obj.name}" aria-expanded="false" aria-controls="specificUnitTest-${obj.name}">
                    <div class="col-4">${obj.name.length>50 ? '<small>': ''}<i class="fas fa-flask-vial fa-fw me-2"></i>${obj.name}<i class="fas fa-circle-info ms-2" title="${obj.description}"></i>${obj.name.length>50 ? '</small>': ''}</div>
                    <div class="col-2 text-white p-2 text-center test-results bg-success"><i class="fas fa-circle-check fa-fw"></i> Successful tests: <span id="successful${obj.name}TestsCount" class="successfulCount">0</span></div>
                    <div class="col-2 text-white p-2 text-center test-results bg-danger"><i class="fas fa-circle-xmark fa-fw"></i> Failed tests: <span id="failed${obj.name}TestsCount" class="failedCount">0</span></div>
                    <div class="col-3 text-white p-2 text-center test-results bg-dark"><i class="fas fa-stopwatch fa-fw"></i> Total time for <span id="total${obj.name}TestsCount"></span> tests: <span id="total${obj.name}TestsTime">0 seconds, 0ms</span></div>
                </button>
            </h2>
            <div id="specificUnitTest-${obj.name}" class="accordion-collapse collapse" aria-labelledby="${obj.name}Header" data-bs-parent="#specificUnitTestsAccordion">
                <div class="row g-0 specificunittests m-2">${unitTestStr}</div>
            </div>
        </div>
    `);
    let specificUnitTestTotalCount = $(`#specificUnitTest-${obj.name}`).find('.test-valid').length;
    $(`#total${obj.name}TestsCount`).text(specificUnitTestTotalCount);
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
    let appliesToProp = unitTest.hasOwnProperty('appliesTo') ? 'appliesTo' : 'applies_to';
    let searchProp = appliesToOrFilter === 'appliesTo' ? appliesToProp : appliesToOrFilter;
    let prop = Object.keys( unitTest[searchProp] )[0];
    switch( prop ) {
        case 'national_calendar':
            if( appliesToOrFilter === 'appliesTo' ) {
                shouldReturn = (currentNationalCalendar !== unitTest[appliesToProp].national_calendar);
            } else {
                shouldReturn = (currentNationalCalendar === unitTest[appliesToProp].national_calendar);
            }
            break;
        case 'national_calendars':
            if( appliesToOrFilter === 'appliesTo' ) {
                shouldReturn = (false === unitTest[appliesToProp].national_calendars.includes( currentNationalCalendar ));
            } else {
                shouldReturn = ( unitTest[appliesToProp].national_calendars.includes( currentNationalCalendar ) );
            }
        break;
        case 'diocesan_calendar':
            if( currentCalendarCategory === 'diocesancalendar' ) {
                if( appliesToOrFilter === 'appliesTo' ) {
                    shouldReturn = ( currentSelectedCalendar !== unitTest[appliesToProp].diocesan_calendar );
                } else {
                    shouldReturn = ( currentSelectedCalendar === unitTest[appliesToProp].diocesan_calendar );
                }
            } else {
                shouldReturn = appliesToOrFilter === 'appliesTo' ? true : false;
            }
            break;
        case 'diocesan_calendars':
            if( currentCalendarCategory === 'diocesancalendar' ) {
                if( appliesToOrFilter === 'appliesTo' ) {
                    shouldReturn = ( false === unitTest[appliesToProp].diocesan_calendars.includes( currentSelectedCalendar ) );
                } else {
                    shouldReturn = ( unitTest[appliesToProp].diocesan_calendars.includes( currentSelectedCalendar ) );
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
const setupPage = () => {
    $( document ).ready(() => {
        // store the original value of the #startTestRunnerBtnLbl for later use
        // but only if it hasn't been set yet (only the first time we do a page setup)
        if(startTestRunnerBtnLbl === '') {
            startTestRunnerBtnLbl = document.querySelector('#startTestRunnerBtnLbl').textContent;
        }
        if( $('#APICalendarSelect').children().length === 1 ) {
            nations.forEach( item => {
                if ( false === CalendarNations.includes( item ) && item !== "VA" ) {
                    $( '#APICalendarSelect' ).append( `<option data-calendartype="nationalcalendar" value="${item}">${countryNames.of(item)}</option>` );
                }
            } );
            CalendarNations.forEach( item => {
                $( '#APICalendarSelect' ).append( `<option data-calendartype="nationalcalendar" value="${item}">${countryNames.of(item)}</option>` );
                let $optGroup = $( `<optgroup label="${countryNames.of(item)}">` );
                $( '#APICalendarSelect' ).append( $optGroup );
                selectOptions[ item ].forEach( groupItem => $optGroup.append( groupItem ) );
            } );
        }

        if( currentSelectedCalendar === 'VATICAN' ) {
            currentSourceDataChecks = [...sourceDataChecks];
        } else {
            let nation = currentCalendarCategory === 'nationalcalendar'
                ? currentSelectedCalendar
                : MetaData.diocesan_calendars.filter(diocesanCalendar => diocesanCalendar.calendar_id === currentSelectedCalendar)[0].nation;
            let sourceFile = `nations/${nation}/${nation}.json`;
            console.log('sourceDataChecks:');
            console.log(sourceDataChecks);
            currentSourceDataChecks = [...sourceDataChecks];
            MetaData.national_calendars.filter(nationalCalendar => nationalCalendar.calendar_id === nation)[0].wider_regions.forEach((item) => {
                currentSourceDataChecks.push({
                    "validate": item,
                    "sourceFile": `nations/${item}.json`,
                    "category": "widerregioncalendar"
                });
            });
            currentSourceDataChecks.push({
                    "validate": nation,
                    "sourceFile": sourceFile,
                    "category": "nationalcalendar"
            });
            MetaData.national_calendars.filter(nationalCalendar => nationalCalendar.calendar_id === nation)[0].missals.forEach((missal) => {
                console.log('retrieving Missal definition for missal: ' + missal);
                let sourceFile = false;
                let missalDef = Object.values( RomanMissals ).filter(el => el.missal_id === missal);
                if (missalDef.length && missalDef[0].hasOwnProperty('data_path')) {
                    sourceFile = missalDef[0].data_path;
                    console.log('found Missal definition for missal: ' + missal + ', sourceFile: ' + sourceFile);
                } else {
                    console.warn('could not find Missal definition for missal: ' + missal);
                }
                if( sourceFile !== false ) {
                    currentSourceDataChecks.push({
                        "validate": missal,
                        "sourceFile": sourceFile,
                        "category": "propriumdesanctis"
                    });
                }
            });
            if( currentCalendarCategory === 'diocesancalendar' ) {
                let diocese = MetaData.diocesan_calendars.filter(diocesanCalendar => diocesanCalendar.calendar_id === currentSelectedCalendar)[0].diocese;
                currentSourceDataChecks.push({
                    "validate": currentSelectedCalendar,
                    "sourceFile": `nations/${nation}/${diocese}.json`,
                    "category": "diocesancalendar"
                });
            }
        }

        $( '.sourcedata-tests' ).empty();
        currentSourceDataChecks.forEach( ( item, idx ) => {
            $( '.sourcedata-tests' ).append( sourceDataCheckTemplate( item.validate, item.category, idx ) );
        } );

        if( $('.calendardata-tests').children().length === 0 ) {
            $( '.yearMax' ).text( twentyFiveYearsFromNow );
            let idx;
            for ( let i = Years.length; i > 0; i-- ) {
                idx = Years.length - i;
                $( '.calendardata-tests' ).append( calDataTestTemplate( i ) );
                $( '.calendardata-tests' ).find( `.year-${Years[ idx ]}` ).after( NationalCalendarTemplates.join( '' ) );
                $( '.calendardata-tests' ).find( `.year-${Years[ idx ]}` ).siblings( '.file-exists,.json-valid,.schema-valid' ).addClass( `year-${Years[ idx ]}` );
            }
        }

        $('#specificUnitTestsAccordion').empty();
        SpecificUnitTestCategories = [];
        UnitTests.forEach( unitTest => {
            //console.log( unitTest );
            if( unitTest.hasOwnProperty( 'appliesTo' ) && Object.keys( unitTest.appliesTo ).length === 1 ) {
                if( true === handleAppliesToOrFilter( unitTest, 'appliesTo' ) ) {
                    return;
                }
            }
            else if( unitTest.hasOwnProperty( 'applies_to' ) && Object.keys( unitTest.applies_to ).length === 1  ) {
                if( true === handleAppliesToOrFilter( unitTest, 'appliesTo' ) ) {
                    return;
                }
            }
            if( unitTest.hasOwnProperty( 'filter' ) && Object.keys( unitTest.filter ).length === 1 ) {
                if( true === handleAppliesToOrFilter( unitTest, 'filter' ) ) {
                    return;
                }
            }

            SpecificUnitTestCategories.push({
                "action": "executeUnitTest",
                "test": unitTest.name
            });
            SpecificUnitTestYears[unitTest.name] = unitTest.assertions.reduce((prev,cur) => { prev.push(cur.year); return prev; },[]);
            appendAccordionItem(unitTest);
        });

        $( '.currentSelectedCalendar' ).text( truncate(currentSelectedCalendar,20) ).attr('title', currentSelectedCalendar);
        let totalTestsCount = $('.file-exists,.json-valid,.schema-valid,.test-valid').length;
        $('#total-tests-count').text(totalTestsCount);
        let totalSourceDataTestsCount = $('.sourcedata-tests .file-exists,.sourcedata-tests .json-valid,.sourcedata-tests .schema-valid').length;
        let totalCalendarDataTestsCount = $( '.calendardata-tests .file-exists,.calendardata-tests .json-valid,.calendardata-tests .schema-valid' ).length;
        let totalUnitTestsCount = $( '.specificunittests .test-valid' ).length;
        $( '#totalSourceDataTestsCount' ).text(totalSourceDataTestsCount);
        $( '#totalCalendarDataTestsCount' ).text(totalCalendarDataTestsCount);
        $( '#totalUnitTestsCount' ).text(totalUnitTestsCount);
        successfulSourceDataTests = 0;
        successfulCalendarDataTests = 0;
        successfulUnitTests = 0;
        failedSourceDataTests = 0;
        failedCalendarDataTests = 0;
        failedUnitTests = 0;
        $('.successfulCount,.failedCount').text(0);
        $testCells = $( '.calendardata-tests' );
        $testCells.find( '.bg-success,.bg-danger' ).removeClass( 'bg-success bg-danger' ).addClass( 'bg-info' );
        $testCells.find( '.fa-circle-check,.fa-circle-xmark' ).removeClass( 'fa-circle-check fa-circle-xmark' ).addClass( 'fa-circle-question' );
        ReadyToRunTests.PageReady = true;
        ReadyToRunTests.tryEnableBtn();
        $( '.page-loader' ).fadeOut('slow');
    });
}

$(document).on('change', '#apiVersionsDropdownItems', setEndpoints);

$( document ).on( 'change', '#APICalendarSelect', ( ev ) => {
    $( '.page-loader' ).show();
    ReadyToRunTests.PageReady = false;
    const oldSelectedCalendar = currentSelectedCalendar;
    currentSelectedCalendar = ev.currentTarget.value;
    currentCalendarCategory = $( '#APICalendarSelect :selected' ).data( 'calendartype' );
    if( currentCalendarCategory === 'diocesancalendar' ) {
        currentNationalCalendar = $( '#APICalendarSelect :selected' ).data( 'nationalcalendar' );
    } else {
        currentNationalCalendar = currentSelectedCalendar;
    }
    console.log( 'currentCalendarCategory = ' + currentCalendarCategory );
    $( `.calendar-${oldSelectedCalendar}` ).removeClass( `calendar-${oldSelectedCalendar}` ).addClass( `calendar-${currentSelectedCalendar}` );
    setupPage();
    ReadyToRunTests.tryEnableBtn();
});

$( document ).on( 'change', '#APIResponseSelect', ( ev ) => {
    $( '.page-loader' ).show();
    ReadyToRunTests.PageReady = false;
    const oldResponseType = currentResponseType;
    currentResponseType = ev.currentTarget.value;
    console.log( `currentResponseType: ${currentResponseType}` );
    $( `.calendar-${currentSelectedCalendar}.json-valid .card-text` ).each((idx,el) => {
        $(el).html( $(el).html().replace(`${oldResponseType} valid`,`${currentResponseType} valid`) )
    });
    //$( `.calendar-${oldSelectedCalendar}` ).removeClass( `calendar-${oldSelectedCalendar}` ).addClass( `calendar-${currentSelectedCalendar}` );
    setupPage();
    ReadyToRunTests.tryEnableBtn();

});

$( document ).on( 'click', '#startTestRunnerBtn', () => {
    if( currentState === TestState.ReadyState || currentState === TestState.JobsFinished ) {
        index = 0;
        calendarIndex = 0;
        yearIndex = 0;
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
fetchMetadataAndTests();
connectWebSocket();
