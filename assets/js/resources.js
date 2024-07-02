
class ReadyToRunTests {
    static PageReady        = false;
    static SocketReady      = false;
    static MetaDataReady   = false;
    static check() {
        return ( ReadyToRunTests.PageReady === true && ReadyToRunTests.SocketReady === true && ReadyToRunTests.MetaDataReady === true );
    }
    static tryEnableBtn() {
        console.log( 'ReadyToRunTests.SocketReady = '       + ReadyToRunTests.SocketReady );
        console.log( 'ReadyToRunTests.AsyncDataReady = '    + ReadyToRunTests.MetaDataReady );
        console.log( 'ReadyToRunTests.PageReady = '         + ReadyToRunTests.PageReady );
        let testsReady = ReadyToRunTests.check();
        $( '#startTestRunnerBtn' ).prop( 'disabled', !testsReady ).removeClass( 'btn-secondary' ).addClass( 'btn-primary' );
        $( '#startTestRunnerBtn' ).find( '.fa-stop' ).removeClass( 'fa-stop' ).addClass( 'fa-rotate' );
        setTestRunnerBtnLblTxt(startTestRunnerBtnLbl);
        if( testsReady ) {
            $( '.page-loader' ).fadeOut('slow');
        }
    }
}

const ENDPOINTS = {
    VERSION: "dev",
    CALENDARS: "",
    TESTS: "",
    DECREES: "",
    EVENTS: "",
}

const sourceDataChecks = [
    {
        "validate": "LitCalMetadata",
        "sourceFile": ENDPOINTS.CALENDARS,
        "category": "universalcalendar"
    },
    {
        "validate": "PropriumDeTempore",
        "sourceFile": "data/propriumdetempore.json",
        "category": "universalcalendar"
    },
    {
        "validate": "PropriumDeSanctis1970",
        "sourceFile": "data/propriumdesanctis_1970/propriumdesanctis_1970.json",
        "category": "universalcalendar"
    },
    {
        "validate": "PropriumDeSanctis2002",
        "sourceFile": "data/propriumdesanctis_2002/propriumdesanctis_2002.json",
        "category": "universalcalendar"
    },
    {
        "validate": "PropriumDeSanctis2008",
        "sourceFile": "data/propriumdesanctis_2008/propriumdesanctis_2008.json",
        "category": "universalcalendar"
    },
    {
        "validate": "MemorialsFromDecrees",
        "sourceFile": ENDPOINTS.DECREES,
        "category": "universalcalendar"
    },
    {
        "validate": "RegionalCalendarsIndex",
        "sourceFile": "nations/index.json",
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
            ENDPOINTS.CALENDARS    = `https://litcal.johnromanodorazio.com/api/dev/metadata/`;
            ENDPOINTS.TESTS        = `https://litcal.johnromanodorazio.com/api/dev/testsindex/`;
            break;
        case 'v4':
        case 'v9':
            ENDPOINTS.CALENDARS    = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/calendars/`;
            ENDPOINTS.TESTS        = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/tests/`;
            ENDPOINTS.DECREES      = `https://litcal.johnromanodorazio.com/api/${ENDPOINTS.VERSION}/decrees/`;
            break;
        case 'v3':
            ENDPOINTS.CALENDARS    = `https://litcal.johnromanodorazio.com/api/v3/LitCalMetadata.php`;
            ENDPOINTS.TESTS        = `https://litcal.johnromanodorazio.com/api/v3/LitCalTestsIndex.php`;
            break;
    }
    document.querySelector('#admin_url').setAttribute('href', `/admin.php?apiversion=${ENDPOINTS.VERSION}`);
    sourceDataChecks[0].sourceFile = ENDPOINTS.CALENDARS;
    sourceDataChecks[5].sourceFile = ENDPOINTS.DECREES;
}

const resourcePaths = [
    '/calendars',
    '/missals',
    '/decrees',
    '/events',
    '/easter',
    '/tests',
    '/data'
];

const resourceTemplate = (resource, rowIdx) => `<div class="col-1 ${rowIdx === 0 || rowIdx % 11 === 0 ? 'offset-1' : ''}">
    <p class="text-center mb-0 bg-secondary text-white"><span title="${resource}">${resource}</span></p>
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

const setTestRunnerBtnLblTxt = (txt) => {
    document.querySelector('#startTestRunnerBtnLbl').textContent = txt;
}

let MetaData = null;
let startTestRunnerBtnLbl = '';
let countryNames                = new Intl.DisplayNames( [ 'en' ], { type: 'region' } );
let nations = [];
let CalendarNations             = [];
let NationalCalendarsArr        = [];
let DiocesanCalendarsArr        = [];

fetch( ENDPOINTS.CALENDARS, {
    method: "POST",
    mode: "cors",
    headers: {
        Accept: "application/json"
    }
})
.then(response => response.json())
.then(data => {
    MetaData = data.litcal_metadata;
    const { national_calendars, diocesan_calendars, wider_regions } = MetaData;
    for ( const value of Object.values( national_calendars ) ) {
        DiocesanCalendarsArr.push( ...value );
    }
    for ( const [ key, value ] of Object.entries( diocesan_calendars ) ) {
        if ( CalendarNations.indexOf( value.nation ) === -1 ) {
            CalendarNations.push( value.nation );
        }
    }
    nations = Object.keys( national_calendars );
    nations.sort( ( a, b ) => countryNames.of( COUNTRIES[ a ] ).localeCompare( countryNames.of( COUNTRIES[ b ] ) ) )
    CalendarNations.sort( ( a, b ) => countryNames.of( COUNTRIES[ a ] ).localeCompare( countryNames.of( COUNTRIES[ b ] ) ) );
    ReadyToRunTests.MetaDataReady = true;
    console.log( 'it seems that UnitTests was set first, now Metadata is also ready' );
    setupPage();
})

const setupPage = () => {
    $(document).ready(() =>  {
        startTestRunnerBtnLbl = document.querySelector('#startTestRunnerBtnLbl').textContent;
        let resourcePathHtml = resourcePaths.map(resourceTemplate).join('');
        document.querySelector('#resourceDataTests .resourcedata-tests').innerHTML = resourcePathHtml;
        ReadyToRunTests.PageReady = true;
    });
}
