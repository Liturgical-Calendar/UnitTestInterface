const Years = [];
const thisYear = new Date().getFullYear();
const twentyFiveYearsFromNow = thisYear + 25;
let baseYear = 1970;
while (baseYear <= twentyFiveYearsFromNow ) {
    Years.push( baseYear++ );
}

const sourceDataChecks = [
    {
        "validate": "LitCalMetadata",
        "sourceFile": ENDPOINTS.METADATA,
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
        "sourceFile": "data/memorialsFromDecrees/memorialsFromDecrees.json",
        "category": "universalcalendar"
    },
    {
        "validate": "RegionalCalendarsIndex",
        "sourceFile": "nations/index.json",
        "category": "universalcalendar"
    }
];

const ENDPOINTS = {
    VERSION: "dev",
    METADATA: "",
    TESTSINDEX: ""
}

const setEndpoints = (ev = null) => {
    if(ev !== null) {
        ENDPOINTS.VERSION = ev.currentTarget.value;
    } else {
        ENDPOINTS.VERSION = document.querySelector('#apiVersionsDropdownItems').value;
    }
    switch(ENDPOINTS.VERSION) {
        case 'dev':
            ENDPOINTS.METADATA = `https://litcal.johnromanodorazio.com/api/dev/metadata/`;
            ENDPOINTS.TESTSINDEX = `https://litcal.johnromanodorazio.com/api/dev/testsindex/`;
        break;
        case 'v9':
            ENDPOINTS.METADATA = `https://litcal.johnromanodorazio.com/api/v9/calendars/`;
            ENDPOINTS.TESTSINDEX = `https://litcal.johnromanodorazio.com/api/v9/tests/`;
        break;
        case 'v3':
            ENDPOINTS.METADATA = `https://litcal.johnromanodorazio.com/api/v3/LitCalMetadata.php`;
            ENDPOINTS.TESTSINDEX = `https://litcal.johnromanodorazio.com/api/v3/LitCalTestsIndex.php`;
        break;
    }
    document.querySelector('#admin_url').setAttribute('href', `/admin.php?apiversion${ENDPOINTS.VERSION}`);
    sourceDataChecks[0].sourceFile = ENDPOINTS.METADATA;
}

class ReadyToRunTests {
    static PageReady        = false;
    static SocketReady      = false;
    static AsyncDataReady   = false;
    static check() {
        return ( ReadyToRunTests.PageReady === true && ReadyToRunTests.SocketReady === true && ReadyToRunTests.AsyncDataReady === true );
    }
    static tryEnableBtn() {
        console.log( 'ReadyToRunTests.SocketReady = '       + ReadyToRunTests.SocketReady );
        console.log( 'ReadyToRunTests.AsyncDataReady = '    + ReadyToRunTests.AsyncDataReady );
        console.log( 'ReadyToRunTests.PageReady = '         + ReadyToRunTests.PageReady );
        let testsReady = ReadyToRunTests.check();
        $( '#startTestRunnerBtn' ).prop( 'disabled', !testsReady ).removeClass( 'btn-secondary' ).addClass( 'btn-primary' );
        $( '#startTestRunnerBtn' ).find( '.fa-stop' ).removeClass( 'fa-stop' ).addClass( 'fa-rotate' );

        if( testsReady ) {
            $( '.page-loader' ).fadeOut('slow');
        }
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

class TestState {
    static ReadyState                   = new TestState( 'ReadyState' );
    static ExecutingValidations         = new TestState( 'ExecutingValidations' );
    static ValidatingCalendarData       = new TestState( 'ValidatingCalendarData' );
    static SpecificUnitTests            = new TestState( 'SpecificUnitTests' );
    static JobsFinished                 = new TestState( 'JobsFinished' );

    constructor( name ) {
        this.name = name;
    }
    toString() {
        return `TestState.${this.name}`;
    }
}


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

const calDataTestTemplate = ( idx ) => {
    let i = Years.length - idx;
    let year = Years[ i ];
    return `
<div class="col-1${i === 0 || i % 10 === 0 ? ' offset-1' : ''}">
    <p class="text-center mb-0 year-${year} fw-bold fs-5">${year}</p>
</div>
`;
}

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
let currentState;
let index;
let calendarIndex;
let yearIndex;
let messageCounter;
let nations = [];

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

let currentSelectedCalendar = "VATICAN";
let currentNationalCalendar = "VATICAN";
let currentCalendarCategory = "nationalcalendar";
let currentResponseType = "JSON";
let currentSourceDataChecks = [];
let countryNames = new Intl.DisplayNames( [ 'en' ], { type: 'region' } );
let CalendarNations = [];
let selectOptions = {};
let NationalCalendarsArr = [];
let DiocesanCalendarsArr = [];
let NationalCalendarTemplates = [ testTemplate( currentSelectedCalendar ) ];
let DiocesanCalendarTemplates = [];

let SpecificUnitTestCategories = [];
let SpecificUnitTestYears = {};

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
                    conn.send( JSON.stringify( { action: 'validateCalendar', year: Years[ index++ ], calendar: currentSelectedCalendar, category: currentCalendarCategory, responsetype: currentResponseType } ) );
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
                    conn.send( JSON.stringify( { ...SpecificUnitTestCategories[ index ], year: SpecificUnitTestYears[ SpecificUnitTestCategories[ index ].test ][ yearIndex++ ], calendar: currentSelectedCalendar, category: currentCalendarCategory } ) );
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
                let totalUnitTestTime = performance.measure( 'litcalUnitTestRunner', `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}Start`, `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}End` );
                $( `#total${SpecificUnitTestCategories[ index - 1 ].test}TestsTime` ).text( MsToTimeString( Math.round( totalUnitTestTime.duration ) ) );
                performance.mark( `specificUnitTest${SpecificUnitTestCategories[ index ].test}Start` );
                conn.send( JSON.stringify( { ...SpecificUnitTestCategories[ index ], year: SpecificUnitTestYears[ SpecificUnitTestCategories[ index ].test ][ yearIndex++ ], calendar: currentSelectedCalendar, category: currentCalendarCategory } ) );
                $(`#specificUnitTest-${SpecificUnitTestCategories[ index ].test}`).collapse('show');
            }
            else {
                console.log( 'Specific unit test validation jobs are finished!' );
                performance.mark( `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}End` );
                let totalUnitTestTime = performance.measure( 'litcalUnitTestRunner', `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}Start`, `specificUnitTest${SpecificUnitTestCategories[ index - 1 ].test}End` );
                $( `#total${SpecificUnitTestCategories[ index - 1 ].test}TestsTime` ).text( MsToTimeString( Math.round( totalUnitTestTime.duration ) ) );
                currentState = TestState.JobsFinished;
                runTests();
            }
            break;
        case TestState.JobsFinished:
            console.log( 'All jobs finished!' );
            $( '#tests-complete' ).toast( 'show' );
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
            $( '#websocket-status' ).removeClass( 'bg-secondary bg-danger bg-success' ).addClass( 'bg-warning' ).find( 'svg' ).removeClass( 'fa-plug fa-plug-circle-check fa-plug-circle-exclamation' ).addClass( 'fa-plug-circle-xmark' );
            $( '#websocket-closed' ).toast( 'show' );
            setTimeout( function () {
                connectWebSocket();
            }, 3000 );
        }
    }

    conn.onerror = ( e ) => {
        $( '#websocket-status' ).removeClass( 'bg-secondary bg-warning bg-success' ).addClass( 'bg-danger' ).find( 'svg' ).removeClass( 'fa-plug fa-plug-circle-check fa-plug-circle-xmark' ).addClass( 'fa-plug-circle-exclamation' );
        console.error( 'Websocket connection error:' );
        console.log( e );
        $( '#websocket-error' ).toast( 'show' );
        if ( connectionAttempt === null ) {
            connectionAttempt = setInterval( function () {
                connectWebSocket();
            }, 3000 );
        }
    }
}

setEndpoints();

Promise.all([
    fetch( ENDPOINTS.METADATA, {
        method: "POST",
        mode: "cors",
        headers: {
            Accept: "application/json"
        }
    }).then(response => response.json()),
    fetch( ENDPOINTS.TESTSINDEX, {
        method: "GET",
        headers: {
            Accept: "application/json"
        }
    }).then(response => response.json())
]).then( dataArr => {
    dataArr.forEach(data => {
        console.log(data);
        if ( data.hasOwnProperty( 'LitCalMetadata' ) ) {
            MetaData = data.LitCalMetadata;
            const { NationalCalendars, DiocesanCalendars } = MetaData;
            for ( const value of Object.values( NationalCalendars ) ) {
                DiocesanCalendarsArr.push( ...value );
            }
            for ( const calendar of DiocesanCalendarsArr ) {
                DiocesanCalendarTemplates.push( testTemplate( calendar ) );
            }
            for ( const [ key, value ] of Object.entries( DiocesanCalendars ) ) {
                if ( CalendarNations.indexOf( value.nation ) === -1 ) {
                    CalendarNations.push( value.nation );
                    selectOptions[ value.nation ] = [];
                }
                selectOptions[ value.nation ].push( `<option data-calendartype="diocesancalendar" data-nationalcalendar="${value.nation}" value="${key}">${value.diocese}</option>` );
            }
            nations = Object.keys( NationalCalendars );
            nations.sort( ( a, b ) => countryNames.of( COUNTRIES[ a ] ).localeCompare( countryNames.of( COUNTRIES[ b ] ) ) )
            CalendarNations.sort( ( a, b ) => countryNames.of( COUNTRIES[ a ] ).localeCompare( countryNames.of( COUNTRIES[ b ] ) ) );
            if( UnitTests !== null ) {
                ReadyToRunTests.AsyncDataReady = true;
                console.log( 'it seems that UnitTests was set first, now Metadata is also ready' );
                setupPage();
            }
        } else {
            if (ENDPOINTS.VERSION === 'v9') {
                UnitTests = data.litcal_tests;
            } else {
                UnitTests = data;
            }
            if( MetaData !== null ) {
                ReadyToRunTests.AsyncDataReady = true;
                console.log( 'it seems that Metadata was set first, now UnitTests is also ready' );
                setupPage();
            }
        }
    });
});

const appendAccordionItem = (obj) => {

    let unitTestStr = '';
    let idy = 0;
    obj.assertions.forEach(assertion => {
        let dateStr = '';
        if( null !== assertion.expectedValue ) {
            dateStr = new Intl.DateTimeFormat("en-US", IntlDTOptions).format( assertion.expectedValue * 1000 );
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

const handleAppliesToOrFilter = ( unitTest, appliesToOrFilter ) => {
    let shouldReturn = false;
    let prop = Object.keys( unitTest[appliesToOrFilter] )[0];
    switch( prop ) {
        case 'nationalcalendar':
            if( appliesToOrFilter === 'appliesTo' ) {
                shouldReturn = (currentNationalCalendar !== unitTest.appliesTo.nationalcalendar);
            } else {
                shouldReturn = (currentNationalCalendar === unitTest.appliesTo.nationalcalendar);
            }
            break;
        case 'nationalcalendars':
            if( appliesToOrFilter === 'appliesTo' ) {
                shouldReturn = (false === unitTest.appliesTo.nationalcalendars.includes( currentNationalCalendar ));
            } else {
                shouldReturn = ( unitTest.appliesTo.nationalcalendars.includes( currentNationalCalendar ) );
            }
        break;
        case 'diocesancalendar':
            if( currentCalendarCategory === 'diocesancalendar' ) {
                if( appliesToOrFilter === 'appliesTo' ) {
                    shouldReturn = ( currentSelectedCalendar !== unitTest.appliesTo.diocesancalendar );
                } else {
                    shouldReturn = ( currentSelectedCalendar === unitTest.appliesTo.diocesancalendar );
                }
            } else {
                shouldReturn = appliesToOrFilter === 'appliesTo' ? true : false;
            }
            break;
        case 'diocesancalendars':
            if( currentCalendarCategory === 'diocesancalendar' ) {
                if( appliesToOrFilter === 'appliesTo' ) {
                    shouldReturn = ( false === unitTest.appliesTo.diocesancalendars.includes( currentSelectedCalendar ) );
                } else {
                    shouldReturn = ( unitTest.appliesTo.diocesancalendars.includes( currentSelectedCalendar ) );
                }
            } else {
                shouldReturn = appliesToOrFilter === 'appliesTo' ? true : false;
            }
            break;
    }
    return shouldReturn;
}

const setupPage = () => {
    $( document ).ready( () => {
        if( $('#APICalendarSelect').children().length === 1 ) {
            nations.forEach( item => {
                if ( false === CalendarNations.includes( item ) && item !== "VATICAN" ) {
                    $( '#APICalendarSelect' ).append( `<option data-calendartype="nationalcalendar" value="${item}">${countryNames.of( COUNTRIES[ item ] )}</option>` );
                }
            } );
            CalendarNations.forEach( item => {
                $( '#APICalendarSelect' ).append( `<option data-calendartype="nationalcalendar" value="${item}">${countryNames.of( COUNTRIES[ item ] )}</option>` );
                let $optGroup = $( `<optgroup label="${countryNames.of( COUNTRIES[ item ] )}">` );
                $( '#APICalendarSelect' ).append( $optGroup );
                selectOptions[ item ].forEach( groupItem => $optGroup.append( groupItem ) );
            } );
        }

        if( currentSelectedCalendar === 'VATICAN' ) {
            currentSourceDataChecks = [...sourceDataChecks];
        } else {
            let nation = currentCalendarCategory === 'nationalcalendar'
                ? currentSelectedCalendar
                : MetaData.DiocesanCalendars[currentSelectedCalendar].nation;
            let sourceFile = `nations/${nation}/${nation}.json`;
            console.log('sourceDataChecks:');
            console.log(sourceDataChecks);
            currentSourceDataChecks = [...sourceDataChecks];
            MetaData.NationalCalendarsMetadata[nation].widerRegions.forEach((item) => {
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
            MetaData.NationalCalendarsMetadata[nation].missals.forEach((missal) => {
                let sourceFile = Object.values( MetaData.RomanMissals ).filter(el => el.value === missal)[0].sanctoraleFileName;
                if( sourceFile !== false ) {
                    currentSourceDataChecks.push({
                        "validate": missal,
                        "sourceFile": sourceFile,
                        "category": "propriumdesanctis"
                    });
                }
            });
            if( currentCalendarCategory === 'diocesancalendar' ) {
                currentSourceDataChecks.push({
                    "validate": currentSelectedCalendar,
                    "sourceFile": `nations/${nation}/${MetaData.DiocesanCalendars[currentSelectedCalendar].diocese}.json`,
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
            else if(  unitTest.hasOwnProperty( 'applies_to' ) && Object.keys( unitTest.applies_to ).length === 1  )
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
        }
        performance.mark( 'litcalTestRunnerStart' );
        $( '#startTestRunnerBtn' ).find( '.fa-rotate' ).addClass( 'fa-spin' );
        console.log( `currentState = ${currentState}` );
        runTests();
    } else {
        console.warn('Please do not try to start a test run while tests are running!');
    }
} );

connectWebSocket();
