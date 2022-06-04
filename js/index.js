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
    return `<p class="text-center mb-0 bg-secondary text-white currentSelectedCalendar">${calendarName}</p>
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

const COUNTRIES = {
    "ÅLAND ISLANDS": "AX",
    "AFGHANISTAN": "AF",
    "ALBANIA": "AL",
    "ALGERIA": "DZ",
    "AMERICAN SAMOA": "AS",
    "ANDORRA": "AD",
    "ANGOLA": "AO",
    "ANGUILLA": "AI",
    "ANTARCTICA": "AQ",
    "ANTIGUA AND BARBUDA": "AG",
    "ARGENTINA": "AR",
    "ARMENIA": "AM",
    "ARUBA": "AW",
    "AUSTRALIA": "AU",
    "AUSTRIA": "AT",
    "AZERBAIJAN": "AZ",
    "BAHAMAS": "BS",
    "BAHRAIN": "BH",
    "BANGLADESH": "BD",
    "BARBADOS": "BB",
    "BELARUS": "BY",
    "BELGIUM": "BE",
    "BELIZE": "BZ",
    "BENIN": "BJ",
    "BERMUDA": "BM",
    "BHUTAN": "BT",
    "BOLIVIA, PLURINATIONAL STATE OF": "BO",
    "BONAIRE, SINT EUSTATIUS AND SABA": "BQ",
    "BOSNIA AND HERZEGOVINA": "BA",
    "BOTSWANA": "BW",
    "BOUVET ISLAND": "BV",
    "BRAZIL": "BR",
    "BRITISH INDIAN OCEAN TERRITORY": "IO",
    "BRUNEI DARUSSALAM": "BN",
    "BULGARIA": "BG",
    "BURKINA FASO": "BF",
    "BURUNDI": "BI",
    "CAMBODIA": "KH",
    "CAMEROON": "CM",
    "CANADA": "CA",
    "CAPE VERDE": "CV",
    "CAYMAN ISLANDS": "KY",
    "CENTRAL AFRICAN REPUBLIC": "CF",
    "CHAD": "TD",
    "CHILE": "CL",
    "CHINA": "CN",
    "CHRISTMAS ISLAND": "CX",
    "COCOS (KEELING) ISLANDS": "CC",
    "COLOMBIA": "CO",
    "COMOROS": "KM",
    "CONGO": "CG",
    "CONGO, THE DEMOCRATIC REPUBLIC OF THE": "CD",
    "COOK ISLANDS": "CK",
    "COSTA RICA": "CR",
    "CÔTE D'IVOIRE": "CI",
    "CROATIA": "HR",
    "CUBA": "CU",
    "CURAÇAO": "CW",
    "CYPRUS": "CY",
    "CZECH REPUBLIC": "CZ",
    "DENMARK": "DK",
    "DJIBOUTI": "DJ",
    "DOMINICA": "DM",
    "DOMINICAN REPUBLIC": "DO",
    "ECUADOR": "EC",
    "EGYPT": "EG",
    "EL SALVADOR": "SV",
    "EQUATORIAL GUINEA": "GQ",
    "ERITREA": "ER",
    "ESTONIA": "EE",
    "ETHIOPIA": "ET",
    "FALKLAND ISLANDS (MALVINAS)": "FK",
    "FAROE ISLANDS": "FO",
    "FIJI": "FJ",
    "FINLAND": "FI",
    "FRANCE": "FR",
    "FRENCH GUIANA": "GF",
    "FRENCH POLYNESIA": "PF",
    "FRENCH SOUTHERN TERRITORIES": "TF",
    "GABON": "GA",
    "GAMBIA": "GM",
    "GEORGIA": "GE",
    "GERMANY": "DE",
    "GHANA": "GH",
    "GIBRALTAR": "GI",
    "GREECE": "GR",
    "GREENLAND": "GL",
    "GRENADA": "GD",
    "GUADELOUPE": "GP",
    "GUAM": "GU",
    "GUATEMALA": "GT",
    "GUERNSEY": "GG",
    "GUINEA": "GN",
    "GUINEA-BISSAU": "GW",
    "GUYANA": "GY",
    "HAITI": "HT",
    "HEARD ISLAND AND MCDONALD ISLANDS": "HM",
    "HOLY SEE (VATICAN CITY STATE)": "VA",
    "VATICAN": "VA",
    "HONDURAS": "HN",
    "HONG KONG": "HK",
    "HUNGARY": "HU",
    "ICELAND": "IS",
    "INDIA": "IN",
    "INDONESIA": "ID",
    "IRAN, ISLAMIC REPUBLIC OF": "IR",
    "IRAQ": "IQ",
    "IRELAND": "IE",
    "ISLE OF MAN": "IM",
    "ISRAEL": "IL",
    "ITALY": "IT",
    "JAMAICA": "JM",
    "JAPAN": "JP",
    "JERSEY": "JE",
    "JORDAN": "JO",
    "KAZAKHSTAN": "KZ",
    "KENYA": "KE",
    "KIRIBATI": "KI",
    "KOREA, DEMOCRATIC PEOPLE'S REPUBLIC OF": "KP",
    "KOREA, REPUBLIC OF": "KR",
    "KUWAIT": "KW",
    "KYRGYZSTAN": "KG",
    "LAO PEOPLE'S DEMOCRATIC REPUBLIC": "LA",
    "LATVIA": "LV",
    "LEBANON": "LB",
    "LESOTHO": "LS",
    "LIBERIA": "LR",
    "LIBYA": "LY",
    "LIECHTENSTEIN": "LI",
    "LITHUANIA": "LT",
    "LUXEMBOURG": "LU",
    "MACAO": "MO",
    "MACEDONIA, THE FORMER YUGOSLAV REPUBLIC OF": "MK",
    "MADAGASCAR": "MG",
    "MALAWI": "MW",
    "MALAYSIA": "MY",
    "MALDIVES": "MV",
    "MALI": "ML",
    "MALTA": "MT",
    "MARSHALL ISLANDS": "MH",
    "MARTINIQUE": "MQ",
    "MAURITANIA": "MR",
    "MAURITIUS": "MU",
    "MAYOTTE": "YT",
    "MEXICO": "MX",
    "MICRONESIA, FEDERATED STATES OF": "FM",
    "MOLDOVA, REPUBLIC OF": "MD",
    "MONACO": "MC",
    "MONGOLIA": "MN",
    "MONTENEGRO": "ME",
    "MONTSERRAT": "MS",
    "MOROCCO": "MA",
    "MOZAMBIQUE": "MZ",
    "MYANMAR": "MM",
    "NAMIBIA": "NA",
    "NAURU": "NR",
    "NEPAL": "NP",
    "NETHERLANDS": "NL",
    "NEW CALEDONIA": "NC",
    "NEW ZEALAND": "NZ",
    "NICARAGUA": "NI",
    "NIGER": "NE",
    "NIGERIA": "NG",
    "NIUE": "NU",
    "NORFOLK ISLAND": "NF",
    "NORTHERN MARIANA ISLANDS": "MP",
    "NORWAY": "NO",
    "OMAN": "OM",
    "PAKISTAN": "PK",
    "PALAU": "PW",
    "PALESTINE, STATE OF": "PS",
    "PANAMA": "PA",
    "PAPUA NEW GUINEA": "PG",
    "PARAGUAY": "PY",
    "PERU": "PE",
    "PHILIPPINES": "PH",
    "PITCAIRN": "PN",
    "POLAND": "PL",
    "PORTUGAL": "PT",
    "PUERTO RICO": "PR",
    "QATAR": "QA",
    "RÉUNION": "RE",
    "ROMANIA": "RO",
    "RUSSIAN FEDERATION": "RU",
    "RWANDA": "RW",
    "SAINT BARTHÉLEMY": "BL",
    "SAINT HELENA, ASCENSION AND TRISTAN DA CUNHA": "SH",
    "SAINT KITTS AND NEVIS": "KN",
    "SAINT LUCIA": "LC",
    "SAINT MARTIN (FRENCH PART)": "MF",
    "SAINT PIERRE AND MIQUELON": "PM",
    "SAINT VINCENT AND THE GRENADINES": "VC",
    "SAMOA": "WS",
    "SAN MARINO": "SM",
    "SAO TOME AND PRINCIPE": "ST",
    "SAUDI ARABIA": "SA",
    "SENEGAL": "SN",
    "SERBIA": "RS",
    "SEYCHELLES": "SC",
    "SIERRA LEONE": "SL",
    "SINGAPORE": "SG",
    "SINT MAARTEN (DUTCH PART)": "SX",
    "SLOVAKIA": "SK",
    "SLOVENIA": "SI",
    "SOLOMON ISLANDS": "SB",
    "SOMALIA": "SO",
    "SOUTH AFRICA": "ZA",
    "SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS": "GS",
    "SOUTH SUDAN": "SS",
    "SPAIN": "ES",
    "SRI LANKA": "LK",
    "SUDAN": "SD",
    "SURINAME": "SR",
    "SVALBARD AND JAN MAYEN": "SJ",
    "SWAZILAND": "SZ",
    "SWEDEN": "SE",
    "SWITZERLAND": "CH",
    "SYRIAN ARAB REPUBLIC": "SY",
    "TAIWAN, PROVINCE OF CHINA": "TW",
    "TAJIKISTAN": "TJ",
    "TANZANIA, UNITED REPUBLIC OF": "TZ",
    "THAILAND": "TH",
    "TIMOR-LESTE": "TL",
    "TOGO": "TG",
    "TOKELAU": "TK",
    "TONGA": "TO",
    "TRINIDAD AND TOBAGO": "TT",
    "TUNISIA": "TN",
    "TURKEY": "TR",
    "TURKMENISTAN": "TM",
    "TURKS AND CAICOS ISLANDS": "TC",
    "TUVALU": "TV",
    "UGANDA": "UG",
    "UKRAINE": "UA",
    "UNITED ARAB EMIRATES": "AE",
    "UNITED KINGDOM": "GB",
    "UNITED STATES": "US",
    "UNITED STATES MINOR OUTLYING ISLANDS": "UM",
    "URUGUAY": "UY",
    "USA": "US",
    "UZBEKISTAN": "UZ",
    "VANUATU": "VU",
    "VENEZUELA, BOLIVARIAN REPUBLIC OF": "VE",
    "VIET NAM": "VN",
    "VIRGIN ISLANDS, BRITISH": "VG",
    "VIRGIN ISLANDS, U.S.": "VI",
    "WALLIS AND FUTUNA": "WF",
    "WESTERN SAHARA": "EH",
    "YEMEN": "YE",
    "ZAMBIA": "ZM",
    "ZIMBABWE": "ZW"
}


let MetaData = {};
let currentState;
let index;
let calendarIndex;
let yearIndex;
let messageCounter;
let successfulTests = 0;
let failedTests = 0;

let connectionAttempt = null;
let conn;

let currentSelectedCalendar = "VATICAN";
let currentCalendarCategory = "nationalcalendar";
let countryNames = new Intl.DisplayNames(['en'], {type: 'region'});
let CalendarNations = [];
let selectOptions = {};
let NationalCalendarsArr = [];
let DiocesanCalendarsArr = [];
let NationalCalendarTemplates = [ testTemplate( currentSelectedCalendar ) ];
let DiocesanCalendarTemplates = [];

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

const validateCalendarData = {
    "action": "validateCalendar",
    "category": "nationalcalendar"
};
/*
const diocesanCalendarCategory = {
    "action": "validateCalendar",
    "category": "diocesancalendar"
};
*/
const SpecificUnitTestCategories = [
    {
        "action": "executeUnitTest",
        "test": "testJohnBaptist"
    },
    {
        "action": "executeUnitTest",
        "test": "testStJaneFrancesDeChantalMoved"
    },
    {
        "action": "executeUnitTest",
        "test": "testStJaneFrancesDeChantalOverridden"
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
                    console.log( 'Source file validation jobs are finished! Now continuing to check calendar data...' );
                    currentState = TestState.ValidatingCalendarData;
                    index = 0;
                    calendarIndex = 0;
                    conn.send( JSON.stringify( { ...validateCalendarData, year: Years[ index++ ], calendar: currentSelectedCalendar, category: currentCalendarCategory } ) );
                }
            }
            break;
        case TestState.ValidatingCalendarData:
            if ( ++messageCounter === 3 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if ( index < Years.length ) {
                    conn.send( JSON.stringify( { ...validateCalendarData, year: Years[ index++ ], calendar: currentSelectedCalendar, category: currentCalendarCategory } ) );
                }
                else {
                    console.log( 'Calendar data validation jobs are finished! Now continuing to specific unit tests...' );
                    currentState = TestState.SpecificUnitTests;
                    index = 0;
                    yearIndex = 0;
                    conn.send( JSON.stringify( { ...SpecificUnitTestCategories[index], year: SpecificUnitTestYears[SpecificUnitTestCategories[index].test][yearIndex++], calendar: currentSelectedCalendar, category: currentCalendarCategory } ) );
                }
            }
            break;
        case TestState.SpecificUnitTests:
            if( ++messageCounter === 4 ) {
                console.log( 'one cycle complete, passing to next test..' );
                messageCounter = 0;
                if( yearIndex < SpecificUnitTestYears[SpecificUnitTestCategories[index].test].length ) {
                    conn.send( JSON.stringify( { ...SpecificUnitTestCategories[index], year: SpecificUnitTestYears[SpecificUnitTestCategories[index].test][yearIndex++], calendar: currentSelectedCalendar, category: currentCalendarCategory } ) );
                }
                else if( ++index < SpecificUnitTestCategories.length ) {
                    yearIndex = 0;
                    console.log( `Specific unit test ${SpecificUnitTestCategories[index].test} for calendar ${currentSelectedCalendar} (${currentCalendarCategory}) is complete, continuing to the next test...` );
                    conn.send( JSON.stringify( { ...SpecificUnitTestCategories[index], year: SpecificUnitTestYears[SpecificUnitTestCategories[index].test][yearIndex++], calendar: currentSelectedCalendar, category: currentCalendarCategory } ) );
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
            const { NationalCalendars, DiocesanCalendars } = MetaData;
            for ( const [ key, value ] of Object.entries( NationalCalendars ) ) {
                DiocesanCalendarsArr.push( ...value );
            }
            for ( const calendar of DiocesanCalendarsArr ) {
                DiocesanCalendarTemplates.push( testTemplate( calendar ) );
            }

            for(const [key,value] of Object.entries(DiocesanCalendars)){
                if(CalendarNations.indexOf(value.nation) === -1){
                    CalendarNations.push(value.nation);
                    selectOptions[value.nation] = [];
                }
                selectOptions[value.nation].push(`<option data-calendartype="diocesancalendar" value="${key}">${value.diocese}</option>`);
            }

            let nations = Object.keys( NationalCalendars );
            nations.sort((a, b) => countryNames.of(COUNTRIES[a]).localeCompare(countryNames.of(COUNTRIES[b])))
            CalendarNations.sort((a, b) => countryNames.of(COUNTRIES[a]).localeCompare(countryNames.of(COUNTRIES[b])));

            ReadyToRunTests.AsyncDataReady = true;
            ReadyToRunTests.tryEnableBtn();

            $( document ).ready( () => {
                nations.forEach(item => {
                    if( false === CalendarNations.includes(item) && item !== "VATICAN" ) {
                        $('#APICalendarSelect').append(`<option data-calendartype="nationalcalendar" value="${item}">${countryNames.of(COUNTRIES[item])}</option>`);
                    }
                });
    
                CalendarNations.forEach(item => {
                    $('#APICalendarSelect').append(`<option data-calendartype="nationalcalendar" value="${item}">${countryNames.of(COUNTRIES[item])}</option>`);
                    let $optGroup = $(`<optgroup label="${countryNames.of(COUNTRIES[item])}">`);
                    $('#APICalendarSelect').append($optGroup);
                    selectOptions[item].forEach(groupItem => $optGroup.append(groupItem));
                });
    
                $( '.yearMax' ).text( twentyYearsFromNow );
                for ( let i = 10; i > 0; i-- ) {
                    $( `.year-${i}` ).text( Years[ i - 1 ] );
                    $( '.calendardata-tests' ).find( `.year-${i}` ).after( NationalCalendarTemplates.join( '' ) );
                    $( '.calendardata-tests' ).find( `.year-${i}` ).siblings( '.file-exists,.json-valid,.schema-valid' ).addClass( `year-${Years[ i - 1 ]}` );
                }
                $('.currentSelectedCalendar').text(currentSelectedCalendar);
                ReadyToRunTests.PageReady = true;
                ReadyToRunTests.tryEnableBtn();
            } );

        }
    } );

$( document ).on('change', '#APICalendarSelect', (ev) => {
    const oldSelectedCalendar = currentSelectedCalendar;
    currentSelectedCalendar = ev.currentTarget.value;
    currentCalendarCategory = $( '#APICalendarSelect :selected' ).data('calendartype');
    console.log('currentCalendarCategory = ' + currentCalendarCategory);
    $(`.calendar-${oldSelectedCalendar}`).removeClass(`calendar-${oldSelectedCalendar}`).addClass(`calendar-${currentSelectedCalendar}`);
    $('.currentSelectedCalendar').text(currentSelectedCalendar);
    $testCells = $('.sourcedata-tests,.calendardata-tests,.specificunittests');
    $testCells.find('.bg-success,.bg-danger').removeClass('bg-success bg-danger').addClass('bg-info');
    $testCells.find('.fa-circle-check,.fa-circle-xmark').removeClass('fa-circle-check fa-circle-xmark').addClass('fa-circle-question');
    $('#startTestRunnerBtn').prop('disabled', false).removeClass('btn-secondary').addClass('btn-primary');
    $('#startTestRunnerBtn').find('.fa-stop').removeClass('fa-stop').addClass('fa-rotate');
});

$( document ).on( 'click', '#startTestRunnerBtn', () => {
    index = 0;
    calendarIndex = 0;
    yearIndex = 0;
    messageCounter = 0;
    successfulTests = 0;
    failedTests = 0;
    currentState = conn.readyState !== WebSocket.CLOSED && conn.ReadyState !== WebSocket.CLOSING ? TestState.ReadyState : TestState.JobsFinished;
    if( conn.readyState !== WebSocket.OPEN ) {
        console.warn('cannot run tests: websocket connection is not ready');
        console.warn( conn.readyState.toString );
    }
    performance.mark( 'litcalTestRunnerStart' );
    $( '#startTestRunnerBtn' ).find( '.fa-rotate' ).addClass( 'fa-spin' );
    console.log( `currentState = ${currentState}` );
    runTests();
} );

connectWebSocket();
