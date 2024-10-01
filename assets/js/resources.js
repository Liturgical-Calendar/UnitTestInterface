
class ReadyToRunTests {
    static PageReady        = false;
    static SocketReady      = false;
    static MetaDataReady    = false;
    static MissalsReady     = false;
    static check() {
        return (
            ReadyToRunTests.PageReady === true
            && ReadyToRunTests.SocketReady === true
            && ReadyToRunTests.MetaDataReady === true
            && ReadyToRunTests.MissalsReady === true
        );
    }
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

class TestState {
    static NotReady                     = new TestState( 'NotReady' );
    static Ready                        = new TestState( 'Ready' );
    static ExecutingResourceValidations = new TestState( 'ExecutingResourceValidations' );
    static ExecutingSourceValidations   = new TestState( 'ExecutingSourceValidations' );
    static JobsFinished                 = new TestState( 'JobsFinished' );

    constructor( name ) {
        this.name = name;
    }
    toString() {
        return `TestState.${this.name}`;
    }
}


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

// rememeber that 'validate' must coincide with the class on the card,
// that's how the Websocket backend (Health class) knows which classes to send back
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

const sourceDataChecks = [
    {
        "validate": "memorials-from-decrees",
        "sourceFile": "data/memorialsFromDecrees/memorialsFromDecrees.json",
        "category": "sourceDataCheck"
    },
    {
        "validate": "memorials-from-decrees-i18n",
        "sourceFolder": "data/memorialsFromDecrees/i18n",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-sanctis-1970",
        "sourceFile": "data/propriumdesanctis_1970/propriumdesanctis_1970.json",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-sanctis-1970-i18n",
        "sourceFolder": "data/propriumdesanctis_1970/i18n",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-sanctis-2002",
        "sourceFile": "data/propriumdesanctis_2002/propriumdesanctis_2002.json",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-sanctis-2002-i18n",
        "sourceFolder": "data/propriumdesanctis_2002/i18n",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-sanctis-2008",
        "sourceFile": "data/propriumdesanctis_2008/propriumdesanctis_2008.json",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-sanctis-2008-i18n",
        "sourceFolder": "data/propriumdesanctis_2008/i18n",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-tempore",
        "sourceFile": "data/propriumdetempore.json",
        "category": "sourceDataCheck"
    },
    {
        "validate": "proprium-de-tempore-i18n",
        "sourceFolder": "data/propriumdetempore/",
        "category": "sourceDataCheck"
    },
    {
        "validate": "regional-calendars-index",
        "sourceFile": "nations/index.json",
        "category": "sourceDataCheck"
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

const resourcePaths = {
    'calendars-path': '/calendars',
    'decrees-path':   '/decrees',
    'events-path':    '/events',
    'easter-path':    '/easter',
    'tests-path':     '/tests',
    'easter-path':    '/easter',
    'schemas-path':   '/schemas'
};


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

const setupPage = () => {
    $(document).ready(() =>  {
        if (startTestRunnerBtnLbl === '') {
            startTestRunnerBtnLbl = document.querySelector('#startTestRunnerBtnLbl').textContent;
        }
        let resourcePathHtml = Object.keys(resourcePaths).map(resourceTemplate).join('');
        document.querySelector('#resourceDataTests .resourcedata-tests').innerHTML = resourcePathHtml;
        ReadyToRunTests.PageReady = true;
        connectWebSocket();
    });
}


let currentState                = TestState.NotReady;
let MetaData                    = null;
let Missals                     = null;
let startTestRunnerBtnLbl       = '';
let countryNames                = new Intl.DisplayNames( [ 'en' ], { type: 'region' } );
let NationalCalendarsArr        = [];
let DiocesanCalendarsArr        = [];
let WiderRegionsArr             = [];
let MissalsArr                  = [];
let connectionAttempt           = null;
let conn;

let messageCounter;
let successfulTests = 0;
let failedTests = 0;

let successfulSourceDataTests = 0;
let failedSourceDataTests = 0;

let successfulResourceDataTests = 0;
let failedResourceDataTests = 0;

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
                const { national_calendars_keys, diocesan_calendars_keys, wider_regions, wider_regions_keys } = MetaData;
                DiocesanCalendarsArr = diocesan_calendars_keys;
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
                WiderRegionsArr = wider_regions_keys;
                //NationalCalendarsArr.sort( ( a, b ) => countryNames.of(a).localeCompare( countryNames.of(b) ) );
                NationalCalendarsArr.forEach(nation => {
                    resourcePaths[`data-path-nation-${nation}`] = `/data/nation/${nation}`;
                    resourceDataChecks.push({
                        "validate": `data-path-nation-${nation}`,
                        "sourceFile": ENDPOINTS.DATA + `/nation/${nation}`,
                        "category": "resourceDataCheck"
                    });
                });
                DiocesanCalendarsArr.forEach(diocese => {
                    resourcePaths[`data-path-diocese-${diocese}`] = `/data/diocese/${diocese}`;
                    resourceDataChecks.push({
                        "validate": `data-path-diocese-${diocese}`,
                        "sourceFile": ENDPOINTS.DATA + `/diocese/${diocese}`,
                        "category": "resourceDataCheck"
                    });
                });
                WiderRegionsArr.forEach(widerRegion => {
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
                    MissalsArr.push(missal.missal_id);
                    resourcePaths[`missals-path-${missal.missal_id}`] = `/missals/${missal.missal_id}`;
                    resourceDataChecks.push({
                        "validate": `missals-path-${missal.missal_id}`,
                        "sourceFile": ENDPOINTS.MISSALS + `/${missal.missal_id}`,
                        "category": "resourceDataCheck"
                    });
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
            conn.send( JSON.stringify( { action: 'executeValidation', ...resourceDataChecks[ index++ ] } ) );
            break;
        case TestState.ExecutingResourceValidations:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if ( index < resourceDataChecks.length ) {
                    conn.send( JSON.stringify( { action: 'executeValidation', ...resourceDataChecks[ index++ ] } ) );
                } else {
                    console.log( 'Rsource file validation jobs are finished! Now continuing to check source data...' );
                    currentState = TestState.JobsFinished;
                    /*
                    currentState = TestState.ExecutingSourceValidations;
                    index = 0;
                    calendarIndex = 0;
                    performance.mark( 'sourceDataTestsStart' );
                    conn.send(
                        JSON.stringify({
                            action: 'executeSourceValidation',
                            ...sourceDataChecks[ index++ ]
                        })
                    );
                    $('#sourceDataTests').collapse('show');
                    */
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
