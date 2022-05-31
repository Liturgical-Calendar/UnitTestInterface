const endpointVersion = "dev"; //could be 'dev', 'v3', 'v2'...
const MetadataURL = `https://litcal.johnromanodorazio.com/api/${endpointVersion}/LitCalMetadata.php`;

const Years = [];
const thisYear = new Date().getFullYear();
const twentyYearsFromNow = thisYear + 20;
for ( let i = 10; i > 0; i-- ) {
    Years.push( Math.floor( Math.random() * ( twentyYearsFromNow - 1970 + 1 ) + 1970 ) );
}
console.log( `10 randomly generated years between 1970 and ${twentyYearsFromNow}:` );
console.log( Years );

class ReadyToRunTests {
    static PageReady        = false;
    static SocketReady      = false;
    static AsyncDataReady   = false;
    static check() {
        return (ReadyToRunTests.PageReady === true && ReadyToRunTests.SocketReady === true && ReadyToRunTests.AsyncDataReady === true);
    }
    static tryEnableBtn() {
        console.log( 'ReadyToRunTests.SocketReady = ' + ReadyToRunTests.SocketReady );
        console.log( 'ReadyToRunTests.AsyncDataReady = ' + ReadyToRunTests.AsyncDataReady );
        console.log( 'ReadyToRunTests.PageReady = ' + ReadyToRunTests.PageReady );
        $( '#startTestRunnerBtn' ).prop( 'disabled', !ReadyToRunTests.check() );
    }
}

const MsToTimeString = ( ms ) => {
    let timeString = [];
    let left = ms;
    if ( ms > 3600000 ) {
        left = ms % 3600000;
        ms -= left;
        let hours = ms / 3600000;
        timeString.push( `${hours} ${hours > 1 ? 'hours' : 'hour'}` );
    }
    if ( left > 60000 ) {
        ms = left;
        left = ms % 60000;
        ms -= left;
        let minutes = ms / 60000;
        timeString.push( `${minutes} ${minutes > 1 ? 'minutes' : 'minute'}` );
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
    static ValidatingNationalCalendars = new TestState( 'ValidatingNationalCalendars' );
    static ValidatingDiocesanCalendars = new TestState( 'ValidatingDiocesanCalendars' );
    static SpecificUnitTests = new TestState( 'SpecificUnitTests' );
    static JobsFinished = new TestState( 'JobsFinished' );

    constructor( name ) {
        this.name = name;
    }
    toString() {
        return `TestState.${this.name}`;
    }
}

const testTemplate = ( calendarName ) => {
    return `<p class="text-center mb-0 bg-secondary text-white">${calendarName}</p>
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

let MetaData = {};
let currentState;
let index;
let calendarIndex;
let yearIndex;
let messageCounter;
let successfulTests = 0;
let failedTests = 0;
let NationalCalendars = [];
let DiocesanCalendars = [];
let NationalCalendarTemplates = [];
let DiocesanCalendarTemplates = [];
let connectionAttempt = null;
let conn;

const messages = [
    {
        "action": "executeValidation",
        "validate": "LitCalMetadata"
    },
    {
        "action": "executeValidation",
        "validate": "PropriumDeTempore"
    },
    {
        "action": "executeValidation",
        "validate": "PropriumDeSanctis1970"
    },
    {
        "action": "executeValidation",
        "validate": "PropriumDeSanctis2002"
    },
    {
        "action": "executeValidation",
        "validate": "PropriumDeSanctis2008"
    },
    {
        "action": "executeValidation",
        "validate": "PropriumDeSanctisITALY1983"
    },
    {
        "action": "executeValidation",
        "validate": "PropriumDeSanctisUSA2011"
    },
    {
        "action": "executeValidation",
        "validate": "MemorialsFromDecrees"
    },
    {
        "action": "executeValidation",
        "validate": "RegionalCalendarsIndex"
    }
];

const nationalCalendarCategory = {
    "action": "validateCalendar",
    "category": "nationalcalendar"
};

const diocesanCalendarCategory = {
    "action": "validateCalendar",
    "category": "diocesancalendar"
};

const SpecificUnitTestCategories = [
    {
        "action": "executeUnitTest",
        "category": "testJohnBaptist"
    },
    {
        "action": "executeUnitTest",
        "category": "testStJaneFrancesDeChantalMoved"
    },
    {
        "action": "executeUnitTest",
        "category": "testStJaneFrancesDeChantalOverridden"
    }
];

const SpecificUnitTestYears = {
    "testJohnBaptist" : [ 2022, 2033, 2044 ],
    "testStJaneFrancesDeChantalMoved" : [ 2001, 2002, 2010 ],
    "testStJaneFrancesDeChantalOverridden" : [
        1971,
        1976,
        1982,
        1993,
        1999,
        2012,
        2018,
        2029,
        2035,
        2040,
        2046
    ]
};

const runTests = () => {
    switch ( currentState ) {
        case TestState.ReadyState:
            index = 0;
            messageCounter = 0;
            currentState = TestState.ExecutingValidations;
            conn.send( JSON.stringify( messages[ index++ ] ) );
            break;
        case TestState.ExecutingValidations:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' )
                messageCounter = 0;
                if ( index < messages.length ) {
                    conn.send( JSON.stringify( messages[ index++ ] ) );
                } else {
                    console.log( 'Source file validation jobs are finished! Now continuing to check national calendars...' );
                    currentState = TestState.ValidatingNationalCalendars;
                    index = 0;
                    calendarIndex = 0;
                    conn.send( JSON.stringify( { ...nationalCalendarCategory, year: Years[ index++ ], calendar: NationalCalendars[ calendarIndex ] } ) );
                }
            }
            break;
        case TestState.ValidatingNationalCalendars:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if ( index < Years.length ) {
                    conn.send( JSON.stringify( { ...nationalCalendarCategory, year: Years[ index++ ], calendar: NationalCalendars[ calendarIndex ] } ) );
                }
                else if ( calendarIndex < NationalCalendars.length - 1 ) {
                    index = 0;
                    calendarIndex++;
                    conn.send( JSON.stringify( { ...nationalCalendarCategory, year: Years[ index++ ], calendar: NationalCalendars[ calendarIndex ] } ) );
                }
                else {
                    console.log( 'National calendar validation jobs are finished! Now continuing to check diocesan calendars...' );
                    currentState = TestState.ValidatingDiocesanCalendars;
                    index = 0;
                    calendarIndex = 0;
                    conn.send( JSON.stringify( { ...diocesanCalendarCategory, year: Years[ index++ ], calendar: DiocesanCalendars[ calendarIndex ] } ) );
                }
            }
            break;
        case TestState.ValidatingDiocesanCalendars:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if ( index < Years.length ) {
                    conn.send( JSON.stringify( { ...diocesanCalendarCategory, year: Years[ index++ ], calendar: DiocesanCalendars[ calendarIndex ] } ) );
                }
                else if ( calendarIndex < DiocesanCalendars.length - 1 ) {
                    index = 0;
                    calendarIndex++;
                    conn.send( JSON.stringify( { ...diocesanCalendarCategory, year: Years[ index++ ], calendar: DiocesanCalendars[ calendarIndex ] } ) );
                }
                else {
                    console.log( 'Diocesan calendar validation jobs are finished! Now continuing to specific unit tests...' );
                    currentState = TestState.SpecificUnitTests;
                    index = 0;
                    yearIndex = 0;
                    conn.send( JSON.stringify( { ...SpecificUnitTestCategories[index], year: SpecificUnitTestYears[SpecificUnitTestCategories[index].category][yearIndex++] } ) );
                }
            }
            break;
        case TestState.SpecificUnitTests:
            if( ++messageCounter === 4 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if( yearIndex < SpecificUnitTestYears[SpecificUnitTestCategories[index].category].length ) {
                    conn.send( JSON.stringify( { ...SpecificUnitTestCategories[index], year: SpecificUnitTestYears[SpecificUnitTestCategories[index].category][yearIndex++] } ) );
                }
                else if( ++index < SpecificUnitTestCategories.length ) {
                    yearIndex = 0;
                    console.log( 'Specific unit test for category ' + SpecificUnitTestCategories[index].category + ' is complete, continuing to the next category...' );
                    conn.send( JSON.stringify( { ...SpecificUnitTestCategories[index], year: SpecificUnitTestYears[SpecificUnitTestCategories[index].category][yearIndex++] } ) );
                }
                else {
                    console.log( 'Specific unit test validation jobs are finished!' );
                    currentState = TestState.JobsFinished;
                    runTests();
                }
            }
            break;
        case TestState.JobsFinished:
            console.log( 'All jobs finished!' );
            $( '.fa-spin' ).closest( '.btn-primary' ).prop( 'disabled', true );
            $( '.fa-spin' ).closest( '.btn-primary' ).removeClass( 'btn-primary' ).addClass( 'btn-secondary' ).find( '.fa-rotate' ).removeClass( 'fa-rotate' ).addClass( 'fa-stop' );
            $( '.fa-spin' ).removeClass( 'fa-spin' );
            break;
    }
}

const connectWebSocket = () => {
    conn = new WebSocket( 'wss://litcal-test.johnromanodorazio.com' );

    conn.onopen = ( e ) => {
        console.log( "Websocket connection established!" );
        $('#websocket-connected').toast('show');
        $('#websocket-status').removeClass('bg-secondary bg-warning bg-danger').addClass('bg-success').find('svg').removeClass('fa-plug fa-plug-circle-xmark fa-plug-circle-exclamation').addClass('fa-plug-circle-check');
        if(connectionAttempt !== null){
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
        }
        else if ( responseData.type === "error" ) {
            $( responseData.classes ).removeClass( 'bg-info' ).addClass( 'bg-danger' );
            $( responseData.classes ).find( '.fa-circle-question' ).removeClass( 'fa-circle-question' ).addClass( 'fa-circle-xmark' );
            $( '#failedCount' ).text( ++failedTests );
        }
        if ( currentState !== TestState.JobsFinished ) {
            runTests();
        }
        performance.mark( 'litcalTestRunnerEnd' );
        let totalTestTime = performance.measure( 'litcalTestRunner', 'litcalTestRunnerStart', 'litcalTestRunnerEnd' );
        console.log( 'Total test time = ' + Math.round( totalTestTime.duration ) + 'ms' );
        $( '#total-time' ).text( MsToTimeString( Math.round( totalTestTime.duration ) ) );
    };
    
    conn.onclose = ( e ) => {
        console.log( 'Connection closed on remote end' );
        ReadyToRunTests.SocketReady = false;
        ReadyToRunTests.tryEnableBtn();
        if( connectionAttempt === null ) {
            $('#websocket-status').removeClass('bg-secondary bg-danger bg-success').addClass('bg-warning').find('svg').removeClass('fa-plug fa-plug-circle-check fa-plug-circle-exclamation').addClass('fa-plug-circle-xmark');
            $('#websocket-closed').toast('show');
            setTimeout(function() {
                connectWebSocket();
                }, 3000);
        }
    }
    
    conn.onerror = ( e ) => {
        $('#websocket-status').removeClass('bg-secondary bg-warning bg-success').addClass('bg-danger').find('svg').removeClass('fa-plug fa-plug-circle-check fa-plug-circle-xmark').addClass('fa-plug-circle-exclamation');
        console.error( 'Websocket connection error:' );
        console.log( e );
        $('#websocket-error').toast('show');
        if( connectionAttempt === null ) {
            connectionAttempt = setInterval(function() {
                connectWebSocket();
              }, 3000);
        }
    }
}


fetch( MetadataURL, {
    method: "POST",
    mode: "cors",
    headers: {
        Accept: "application/json"
    }
} )
    .then( response => response.json() )
    .then( data => {
        if ( data.hasOwnProperty( 'LitCalMetadata' ) ) {
            MetaData = data.LitCalMetadata;
            for ( const [ key, value ] of Object.entries( MetaData.NationalCalendars ) ) {
                NationalCalendars.push( key );
                DiocesanCalendars.push( ...value );
            }
            for ( const calendar of NationalCalendars ) {
                NationalCalendarTemplates.push( testTemplate( calendar ) );
            }
            for ( const calendar of DiocesanCalendars ) {
                DiocesanCalendarTemplates.push( testTemplate( calendar ) );
            }
            ReadyToRunTests.AsyncDataReady = true;
            ReadyToRunTests.tryEnableBtn();

            $( document ).ready( () => {
                $( '.yearMax' ).text( twentyYearsFromNow );
                for ( let i = 10; i > 0; i-- ) {
                    $( `.year-${i}` ).text( Years[ i - 1 ] );
                    $( '.nationalcalendars' ).find( `.year-${i}` ).after( NationalCalendarTemplates.join( '' ) );
                    $( '.diocesancalendars' ).find( `.year-${i}` ).after( DiocesanCalendarTemplates.join( '' ) );
                    $( '.nationalcalendars' ).find( `.year-${i}` ).siblings( '.file-exists,.json-valid,.schema-valid' ).addClass( `year-${Years[ i - 1 ]}` );
                    $( '.diocesancalendars' ).find( `.year-${i}` ).siblings( '.file-exists,.json-valid,.schema-valid' ).addClass( `year-${Years[ i - 1 ]}` );
                }
                ReadyToRunTests.PageReady = true;
                ReadyToRunTests.tryEnableBtn();
            } );

        }
    } );

$( document ).on( 'click', '#startTestRunnerBtn', () => {
    performance.mark( 'litcalTestRunnerStart' );
    $( '#startTestRunnerBtn' ).find( '.fa-rotate' ).addClass( 'fa-spin' );
    console.log( `currentState = ${currentState}` );
    runTests();
} );

connectWebSocket();
