
/** DEFINE OUR GLOBAL VARIABLES */

const DTFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    //timeStyle: 'long',
    timeZone: 'UTC'
  });

const MonthDayFmt = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric'
});

const DayOfTheWeekFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long'
});

let proxiedTest = null;

const sanitizeOnSetValue = {
    get: (target, prop) => {
        if (typeof target[prop] === 'object' && target[prop] !== null) {
            return new Proxy(target[prop], sanitizeOnSetValue);
        } else {
            //console.log({ type: 'get', target, prop });
            if(typeof target[prop] === 'string') {
                target[prop] = sanitizeInput(target[prop]);
            }
            return Reflect.get(target, prop);
        }
    },
    set: (target, prop, value) => {
        switch( prop ) {
            case 'name':
                //we don't allow the name to ever be different than eventkey+'Test'
                value = (target['eventkey']) + 'Test';
                break;
            case 'testType':
                if( false === [TestType.ExactCorrespondence, TestType.ExactCorrespondenceSince, TestType.ExactCorrespondenceUntil, TestType.VariableCorrespondence ].includes( value ) ) {
                    console.warn(`property ${prop} of this object must have a valid TestType value`);
                    return;
                }
                break;
            case 'assert':
                if( false === [AssertType.EventNotExists, AssertType.EventTypeExact].includes(value) ) {
                    console.warn(`property ${prop} of this object must have a valid AssertType value`);
                    return;
                }
                break;
            case 'description':
            case 'assertion':
            case 'comment':
                if( typeof value !== 'string' ) {
                    console.warn(`property ${prop} of this object must be of type string`);
                    return;
                }
                //we'll just make sure the value doesn't contain any scripts or html
                value = sanitizeInput(value);
                break;
            case 'eventkey':
                if( typeof value !== 'string' ) {
                    console.warn(`property ${prop} of this object must be of type string`);
                    return;
                } else if ( false === Object.keys(LitCalAllFestivities).includes(value) ) {
                    console.warn(`property ${prop} of this object must contain a valid Liturgical Event Key`);
                    return;
                }
                target['name'] = value + 'Test';
                break;
            case 'yearSince':
                if( target['testType'] !== TestType.ExactCorrespondenceSince ) {
                    console.warn(`property ${prop} of this object can only be set when testType property has value exactCorrespondenceSince`);
                    if( target.hasOwnProperty(prop) ) {
                        delete(target[prop]);
                    }
                    return;
                }
                if( typeof value !== 'number' || value < 1970 || value > 9999 || (Number(value) === value && value % 1 !== 0) ) {
                    console.warn(`property ${prop} of this object must be of type integer and have a value between 1970 and 9999`);
                    return;
                }
                break;
            case 'yearUntil':
                if( target['testType'] !== TestType.ExactCorrespondenceUntil ) {
                    console.warn(`property ${prop} of this object can only be set when testType property has value exactCorrespondenceUntil`);
                    if( target.hasOwnProperty(prop) ) {
                        delete(target[prop]);
                    }
                    return;
                }
                if( typeof value !== 'number' || value < 1970 || value > 9999 || (Number(value) === value && value % 1 !== 0) ) {
                    console.warn(`property ${prop} of this object must be of type integer and have a value between 1970 and 9999`);
                    return;
                }
                break;
            case 'year':
                if( typeof value !== 'number' || value < 1970 || value > 9999 || (Number(value) === value && value % 1 !== 0) ) {
                    console.warn(`property ${prop} of this object must be of type integer and have a value between 1970 and 9999`);
                    return;
                }
                break;
            case 'expectedValue':
                if( value !== null && (typeof value !== 'number' || value < -2851200 || value > 253402214400 || (Number(value) === value && value % 1 !== 0) ) ) {
                    console.warn(`property ${prop} of this object must be of type integer and have a value between -2851200 and 253402214400`);
                    return;
                }
                break;
            case 'assertions':
                if( false === value instanceof Array ) {
                    console.warn(`property ${prop} of this object must be of type array`);
                    return;
                }
                if( value.length ) {
                    if( false === value.every(el => null !== value && el instanceof Assertion && Object.keys(el).every(key => Assertion.props.includes(key) ) ) ) {
                        console.warn(`elements in the ${prop} Array must be of type Assertion (not null) and have keys ${Assertion.props.join(',')}`);
                        return;
                    }
                }
                break;
            case 'appliesTo':
                if( false == value instanceof Object ) {
                    console.warn(`property ${prop} of this object must be of type object`);
                    return;
                }
                if( Object.keys(value).length !== 1 || (false === value.hasOwnProperty('nationalcalendar') && false === value.hasOwnProperty('diocesancalendar')) ) {
                    console.warn(`The ${prop} Object must have either a nationalcalendar property or a diocesancalendar property, no other properties are allowed.`);
                    return;
                }
                break;
            case 'nationalcalendar':
                if( typeof value !== 'string' || false === CalendarNations.includes(value) ) {
                    console.warn(`The value of the "${prop}" property must correspond to an actual available National Calendar`);
                    return;
                }
                break;
            case 'diocesancalendar':
                if( typeof value !== 'string' || false === Object.keys(DiocesanCalendars).includes(value) ) {
                    console.warn(`The value of the "${prop}" property must correspond to an actual available Diocesan Calendar`);
                    return;
                }
                break;
            default:
                if( typeof prop === 'number' || target instanceof Array ) {
                    /*if( target instanceof Array ) {
                        console.log('I think we are trying to push to an internal array, target is an array');
                    } else {
                        console.log('we seem to be accessing an indexed array');
                    }*/
                    return Reflect.set(target, prop, value);
                } else {
                    console.warn('unexpected property ' + prop + ' of type ' + typeof prop + ' on target of type ' + typeof target);
                }
                return;
            }
        //console.log({ type: 'set', target, prop, value });
        return Reflect.set(target, prop, value);
    }
};

/**
 * LOAD METADATA FOR EXISTING CALENDARS
 */
const endpointV = 'dev'; // 'v3';
const METADATA_URL = `https://litcal.johnromanodorazio.com/api/${endpointV}/LitCalMetadata.php`;
const TESTS_INDEX_URL = `https://litcal.johnromanodorazio.com/api/${endpointV}/LitCalTestsIndex.php`;
const LITCAL_ALLFESTIVITIES_URL = `https://litcal.johnromanodorazio.com/api/${endpointV}/LitCalAllFestivities.php`;
const COUNTRY_NAMES = new Intl.DisplayNames([locale], {type: 'region'});
let CalendarNations = [];
let SelectOptions = {};
let DiocesanCalendars;
//const COUNTRIES is available from Countries.js, included in footer.php for admin.php

fetch( METADATA_URL )
    .then(data => data.json())
    .then(jsonData => {
        const { LitCalMetadata } = jsonData;
        const { NationalCalendars } = LitCalMetadata;
        ({DiocesanCalendars} = LitCalMetadata);
        Object.freeze(DiocesanCalendars);
        for( const [key,value] of Object.entries( DiocesanCalendars ) ) {
            if( false === CalendarNations.includes(value.nation) ) {
                CalendarNations.push(value.nation);
                SelectOptions[value.nation] = [];
            }
            SelectOptions[value.nation].push(`<option data-calendartype="diocesancalendar" value="${key}">${value.diocese}</option>`);
        }

        let nations = Object.keys( NationalCalendars );
        nations.sort((a, b) => COUNTRY_NAMES.of(COUNTRIES[a]).localeCompare(COUNTRY_NAMES.of(COUNTRIES[b])));
        nations.forEach(item => {
            if( false === CalendarNations.includes(item) ) {
                const calName = item === 'VATICAN' ? 'Universal Roman' : COUNTRY_NAMES.of(COUNTRIES[item]);
                $('#APICalendarSelect').append(`<option data-calendartype="nationalcalendar" value="${item}">${calName}</option>`);
            }
        });

        CalendarNations.sort((a, b) => COUNTRY_NAMES.of(COUNTRIES[a]).localeCompare(COUNTRY_NAMES.of(COUNTRIES[b])));
        CalendarNations.forEach(item => {
            $('#APICalendarSelect').append(`<option data-calendartype="nationalcalendar" value="${item}">${COUNTRY_NAMES.of(COUNTRIES[item])}</option>`);
            let $optGroup = $(`<optgroup label="${COUNTRY_NAMES.of(COUNTRIES[item])}">`);
            $('#APICalendarSelect').append($optGroup);
            SelectOptions[item].forEach(groupItem => $optGroup.append(groupItem));
        });
    });

/** Prepare PUT new Unit Test */

class UnitTest {
    constructor(eventkey, description, testType, assertions, yearSince = null, yearUntil = null ) {
        if( arguments.length === 1 ) {
            if(
                typeof arguments[0] === 'object'
                && (Object.keys( arguments[0] ).length === 5 || Object.keys( arguments[0] ).length === 6)
                && Object.keys( arguments[0] ).every(val => ['name', 'eventkey', 'description', 'testType', 'assertions', 'yearSince', 'yearUntil', 'appliesTo'].includes(val) )
            ) {
                Object.assign(this, arguments[0]);
            } else {
                console.log('there seem to be extra unexpected properties: ' + Object.keys( arguments[0] ).join(', ') );
            }
        } else {
            this.name = eventkey + 'Test';
            this.eventkey = eventkey;
            this.description = description;
            this.testType = testType;
            this.assertions = assertions;
            if( null !== yearSince ) {
                this.yearSince = yearSince;
            }
            if( null !== yearUntil ) {
                this.yearUntil = yearUntil;
            }
        }
    }
}

class Assertion {
    constructor(year, expectedValue, assert, assertion, comment = null) {
        if( arguments.length === 4 || arguments.length === 5 ) {
            this.year = year;
            this.expectedValue = expectedValue;
            this.assert = assert;
            this.assertion = assertion;
            if( null !== comment ) {
                this.comment = comment;
            }
        } else if( arguments.length === 1 ) {
            if(
                typeof arguments[0] === 'object'
                && (Object.keys( arguments[0] ).length === 4 || Object.keys( arguments[0] ).length === 5)
                && Object.keys( arguments[0] ).every(val => ['year', 'expectedValue', 'assert', 'assertion', 'comment'].includes(val) )
            ) {
                Object.assign(this, arguments[0]);
            }
        }
    }
}

//kudos to https://stackoverflow.com/a/47140708/394921 for the idea
const sanitizeInput = (input) => {
    let doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.body.textContent || "";
}

const checkTargetInput = (target) => {
    let sanitizedInput = sanitizeInput( target.textContent );
    if( sanitizedInput !== target.textContent ) {
        target.textContent = sanitizedInput;
        const $alert = $('#noScriptedContentAlert');
        $alert.removeClass('d-none');
        $alert.fadeIn('fast', () => {
            setTimeout(() => {
                $alert.fadeOut('slow', () => {
                    $alert.addClass('d-none');
                });
            }, 2000);
        });
    }
}

const serializeUnitTest = () => {
    const eventkey = document.querySelector('#testName').textContent.replace('Test','');
    const description = document.querySelector('#description').value;
    const testType = document.querySelector('#cardHeaderTestType').textContent;
    const yearSince = testType === 'exactCorrespondenceSince' ? Number(document.querySelector('#yearSince').value) : null;
    const yearUntil = testType === 'exactCorrespondenceUntil' ? Number(document.querySelector('#yearUntil').value) : null;
    proxiedTest.eventkey = eventkey;
    proxiedTest.description = description;
    proxiedTest.testType = testType;
    if( testType === 'exactCorrespondenceSince' ) {
        proxiedTest.yearSince = yearSince;
    }
    if( testType === 'exactCorrespondenceUntil' ) {
        proxiedTest.yearUntil = yearUntil;
    }
    proxiedTest.assertions = [];
    let assertionDivs = document.querySelectorAll('#assertionsContainer > div');
    assertionDivs.forEach(div => {
        const year = Number(div.querySelector('p.testYear').textContent);
        const expectedValue = div.querySelector('div > span.expectedValue').textContent === '---' ? null : Number( div.querySelector('.expectedValue').getAttribute('data-value') );
        const assert = div.querySelector('.assert').textContent;
        const assertion = div.querySelector('[contenteditable]').textContent;
        const hasComment = div.querySelector('.comment > svg').getAttribute('data-icon') === 'comment-dots';
        const comment = hasComment ? div.querySelector('.comment').getAttribute('title') : null;
        proxiedTest.assertions.push(new Assertion(year, expectedValue, assert, assertion, comment));
    });
    if( document.querySelector('#APICalendarSelect').value !== 'VATICAN' ) {
        const currentCalendarType = document.querySelector(`#APICalendarSelect [value="${document.querySelector('#APICalendarSelect').value}"]`).dataset.calendartype;
        proxiedTest.appliesTo = {[currentCalendarType]: document.querySelector('#APICalendarSelect').value};
    }
    return new UnitTest( proxiedTest );
}

const rebuildFestivitiesOptions = (element) => {
    const selectedOption = $(element).find('option[value="' + element.value + '"]')[0];
    console.log(selectedOption);
    const calendarType = selectedOption.dataset.calendartype;
    return fetch( `${LITCAL_ALLFESTIVITIES_URL}?${calendarType}=${element.value}` )
    .then(data => data.json())
    .then(json => {
        ({LitCalAllFestivities} = json);
        Object.freeze(LitCalAllFestivities);
        let htmlStr = '';
        for (const [key, el] of Object.entries(LitCalAllFestivities)) {
            let dataMonth = '';
            let dataDay = '';
            let dataGrade = '';
            if( el.hasOwnProperty( "MONTH" ) ) {
                dataMonth = ` data-month="${el.MONTH}"`;
            }
            if( el.hasOwnProperty( "DAY" ) ) {
                dataDay = ` data-day="${el.DAY}"`;
            }
            if( el.hasOwnProperty( "GRADE" ) ) {
                dataGrade = ` data-grade="${el.GRADE}"`;
            }
            htmlStr += `<option value="${key}"${dataMonth}${dataDay}${dataGrade}>${el.NAME} (${el.GRADE_LCL})</option>`;
        };
        document.querySelector('#existingFestivitiesList').innerHTML = htmlStr;
    });

}

/**
 * SET DOCUMENT INTERACTIONS
 */

$(document).on('click', '.sidebarToggle', event => {
    console.log('now toggling sidebar...');
    event.preventDefault();
    if(document.body.classList.contains('sb-sidenav-collapsed') ) {
        $('.sidebarToggle i').removeClass('fa-angle-right').addClass('fa-angle-left');
    }
    else {
        $('.sidebarToggle i').removeClass('fa-angle-left').addClass('fa-angle-right');
    }
    document.body.classList.toggle('sb-sidenav-collapsed');
});

$(document).on('change', '#litCalTestsSelect', async (ev) => {
    //console.log(ev.currentTarget.value);
    if( ev.currentTarget.value !== '' ) {
        const currentTest = LitCalTests.filter(el => el.name === ev.currentTarget.value)[0];
        console.log(currentTest);
        currentTest.assertions = currentTest.assertions.map(el => new Assertion(el));
        proxiedTest = new Proxy(currentTest, sanitizeOnSetValue);

        document.querySelector('#testName').textContent = proxiedTest.name;
        //$('#testType').val( proxiedTest.testType ).change();
        document.querySelector('#cardHeaderTestType').textContent = proxiedTest.testType;
        document.querySelector('#description').setAttribute('rows', 1);
        document.querySelector('#description').value = proxiedTest.description;
        document.querySelector('#description').setAttribute('rows', Math.ceil( $('#description')[0].scrollHeight / 40 ));
        if( proxiedTest.hasOwnProperty('yearSince') ) {
            document.querySelector('#yearSince').value = proxiedTest.yearSince;
        }
        if( proxiedTest.hasOwnProperty('yearUntil') ) {
            document.querySelector('#yearUntil').value = proxiedTest.yearUntil;
        }
        if( proxiedTest.hasOwnProperty('appliesTo') ) {
            const calendarType = Object.keys(proxiedTest.appliesTo)[0];
            document.querySelector('#APICalendarSelect').value = proxiedTest.appliesTo[calendarType];
            await rebuildFestivitiesOptions(document.querySelector('#APICalendarSelect'));
            document.querySelector('#existingFestivityName').value = proxiedTest.eventkey;
            AssertionsBuilder.test = LitCalAllFestivities[proxiedTest.eventkey];
            AssertionsBuilder.appliesTo = proxiedTest.appliesTo[calendarType];
        }
        $( '#assertionsContainer' ).empty();
        const assertionsBuilder = new AssertionsBuilder( proxiedTest );
        const assertionBuildHtml = assertionsBuilder.buildHtml();
        $( assertionBuildHtml ).appendTo( '#assertionsContainer' );
        document.querySelector('#perYearAssertions').classList.remove('invisible');
        document.querySelector('#perYearAssertions .btn').dataset.testtype = proxiedTest.testType;
        document.querySelector('#serializeUnitTestData').removeAttribute('disabled');
        document.querySelectorAll('#createNewTestBtnGrp button').forEach(el => el.setAttribute('disabled', 'disabled'));
    } else {
        proxiedTest = null;
    }
});

$(document).on('change', '#APICalendarSelect', async (ev) => {
    await rebuildFestivitiesOptions( ev.currentTarget );
});

$(document).on('click', '.editDate', ev => {
    const curVal = Number(ev.currentTarget.previousSibling.dataset.value) * 1000;
    const curDate = new Date( curVal );
    const curDateVal = curDate.toISOString().split('T')[0];
    const pElement = ev.currentTarget.parentElement;
    pElement.classList.remove('bg-success', 'text-white');
    pElement.classList.add('bg-warning', 'text-dark');
    pElement.children[1].innerHTML = '';
    pElement.children[1].insertAdjacentHTML('beforeend', `<input type="date" value="${curDateVal}" />`);
});

$(document).on('click', '.toggleAssert', ev => {
    //const assertionIndex = $(ev.currentTarget.parentElement.parentElement).index();
    const assertionIndex = $(ev.currentTarget.parentElement.parentElement).prevAll(':has(.testYear)').length;
    if(ev.currentTarget.parentElement.classList.contains('bg-warning')) {
        ev.currentTarget.previousSibling.textContent = AssertType.EventTypeExact;
        proxiedTest.assertions[assertionIndex].assert = AssertType.EventTypeExact;
        ev.currentTarget.parentElement.classList.remove('bg-warning', 'text-dark');
        ev.currentTarget.parentElement.classList.add('bg-success', 'text-white');
        const $pNode = $(ev.currentTarget.parentNode);
        console.log($pNode);
        console.log($pNode.siblings('.testYear'));
        const year = $pNode.siblings('.testYear')[0].textContent;
        $pNode.next()[0].children[1].innerHTML = '';
        $pNode.next()[0].children[1].insertAdjacentHTML('beforeend', `<input type="date" value="${year}-01-01" />`);
    } else {
        ev.currentTarget.previousSibling.textContent = AssertType.EventNotExists;
        proxiedTest.assertions[assertionIndex].assert = AssertType.EventNotExists;
        ev.currentTarget.parentElement.classList.remove('bg-success', 'text-white');
        ev.currentTarget.parentElement.classList.add('bg-warning', 'text-dark');
        const $pNode = $(ev.currentTarget.parentNode);
        $pNode.next()[0].classList.remove('bg-success', 'text-white');
        $pNode.next()[0].classList.add('bg-warning', 'text-dark');
        $pNode.next()[0].children[1].textContent = '---';
        proxiedTest.assertions[assertionIndex].expectedValue = null;
    }
});

$(document).on('change', '.expectedValue > [type=date]', ev => {
    const timestamp = Date.parse(ev.currentTarget.value+'T00:00:00Z');
    const $grandpa = $(ev.currentTarget).closest('div');
    const $greatGrandpa = $grandpa.parent().closest('div');
    const assertionIndex = $greatGrandpa.prevAll(':has(.testYear)').length;
    proxiedTest.assertions[assertionIndex].expectedValue = timestamp / 1000;
    $grandpa[0].classList.remove('bg-warning','text-dark');
    $grandpa[0].classList.add('bg-success','text-white');
    console.log(ev.currentTarget.parentNode.dataset);
    ev.currentTarget.parentNode.dataset.value = timestamp / 1000;
    console.log(ev.currentTarget.parentNode.dataset);
    ev.currentTarget.parentNode.textContent = DTFormat.format(timestamp);
});

$(document).on('show.bs.modal', '#modalAddEditComment', ev => {
    console.log(ev);
    const tgt = ev.relatedTarget;
    console.log(tgt);
    const icon = tgt.querySelector('.svg-inline--fa');
    console.log(icon);
    const value = icon.classList.contains('fa-comment-dots') ? tgt.title : '';
    const myModalEl = document.querySelector('#modalAddEditComment');
    const txtArea = myModalEl.querySelector('#unitTestComment');
    txtArea.value = value;
    $(myModalEl.querySelector('#btnSaveComment')).one('click', () => {
        const newValue = sanitizeInput(txtArea.value);
        tgt.title = newValue;
        if(newValue === '') {
            icon.classList.remove('fa-comment-dots');
            icon.classList.add('fa-comment-medical');
            tgt.classList.remove('btn-dark');
            tgt.classList.add('btn-secondary');
        } else {
            icon.classList.remove('fa-comment-medical');
            icon.classList.add('fa-comment-dots');
            tgt.classList.remove('btn-secondary');
            tgt.classList.add('btn-dark');
        }
    });
});


$(document).on('blur paste drop input', '[contenteditable]', ev => {
    console.log(ev.type);

    if( ['paste','drop'].includes( ev.type ) ) {
        setTimeout(() => {
            ev.currentTarget.textContent = ev.currentTarget.textContent;
            checkTargetInput(ev.currentTarget);
        }, 1);
    }
    else if( ev.type === 'blur' ) {
        checkTargetInput(ev.currentTarget);
    }
    else {
        console.log(ev.currentTarget.textContent);
    }
    const grandpa = ev.currentTarget.parentElement.parentElement;
    const assertionIndex = $(grandpa).prevAll(':has(.testYear)').length;
    proxiedTest.assertions[assertionIndex].assertion = ev.currentTarget.textContent;
});

$(document).on('click', '#serializeUnitTestData', ev => {
    const newUnitTest = serializeUnitTest();
    let responseStatus = 400;
    fetch( TESTS_INDEX_URL, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(newUnitTest)
    })
    .then(response => {
        responseStatus = response.status;
        return response.json();
    })
    .then(data => {
        console.log(responseStatus);
        const $alert = $('#responseToPutRequest');
        document.querySelector('#responseToPutRequest > #responseMessage').textContent = data.response;
        if(responseStatus !== 201) {
            $alert.removeClass('alert-success');
            $alert.addClass('alert-warning');
            //$alert.find()
        }
        $alert.removeClass('d-none');
        $alert.fadeIn('fast', () => {
            setTimeout(() => {
                $alert.fadeOut('slow', () => {
                    $alert.addClass('d-none');
                });
            }, 2000);
        });
        console.log(data);
    });
});

/**
 * DEFINE INTERACTIONS FOR CREATE NEW TEST MODAL
 */
let currentTestType = TestType.ExactCorrespondence; //this value will be set on modal open
let $isotopeYearsToTestGrid = null;

const modalLabel = {
    exactCorrespondence: 'Exact Date Correspondence Test',
    exactCorrespondenceSince: 'Exact Date Correspondence Since Year Test',
    exactCorrespondenceUntil: 'Exact Date Correspondence Until Year Test',
    variableCorrespondence: 'Variable Existence Test'
}

const ArrayRange = (start, end, endInclusive) => Array.from({length: (end - start)+endInclusive}, (v, k) => k + start);

$(document).on('show.bs.modal', '#modalDefineTest', ev => {
    // we want to make sure the carousel is on the first slide every time we open the modal
    $('#carouselCreateNewUnitTest').carousel(0);
    // we also want to reset our form to defaults
    document.querySelector('#carouselCreateNewUnitTest form').reset();
    document.querySelector('#carouselCreateNewUnitTest form').classList.remove('was-validated');
    document.querySelector('#btnCreateTest').setAttribute('disabled','disabled');
    // set our global currentTestType variable based on the button that was clicked to open the modal
    currentTestType = ev.relatedTarget.dataset.testtype;
    // update our carousel elements based on the currentTestType
    $(ev.currentTarget).find(`.${currentTestType}`).removeClass('d-none');
    if( null !== $isotopeYearsToTestGrid ) {
        $isotopeYearsToTestGrid.isotope('destroy');
    }
    $('#yearsToTestGrid').empty();
    let removeIcon = '<i class="fas fa-xmark-circle ms-1 opacity-50" role="button" title="remove"></i>';
    let hammerIcon = currentTestType === TestType.ExactCorrespondence ? '' : '<i class="fas fa-hammer me-1 opacity-50" role="button" title="set year"></i>';
    let htmlStr = '';
    let years;
    let minYear = 1970;
    let maxYear = 2030;
    let $existingOption = null;
    let titleAttr = '';
    let lightClass = '';
    if( 'edittest' in ev.relatedTarget.dataset ) {
        document.querySelector('#newUnitTestDescription').value = proxiedTest.description;
        document.querySelector('#existingFestivityName').value = proxiedTest.eventkey;
        $existingOption = $(document.querySelector('#existingFestivityName').list).find('option[value="' + proxiedTest.eventkey + '"]');
        console.log($existingOption);
        years = Array.from(document.querySelectorAll('#assertionsContainer .testYear')).map(el => Number(el.textContent));
        minYear = Math.min(...years);
        maxYear = Math.max(...years);
        document.querySelector('#lowerRange').setAttribute('value', minYear);
        document.querySelector('#lowerRange').parentNode.style.setProperty('--value-a',minYear);
        document.querySelector('#lowerRange').parentNode.style.setProperty('--text-value-a', `"${minYear}"`);
        document.querySelector('#upperRange').setAttribute('value', maxYear);
        document.querySelector('#upperRange').parentNode.style.setProperty('--value-b',maxYear);
        document.querySelector('#upperRange').parentNode.style.setProperty('--text-value-b', `"${maxYear}"`);
    } else {
        minYear = Number(document.querySelector('#lowerRange').getAttribute('value'));
        maxYear = Number(document.querySelector('#upperRange').getAttribute('value'));
        years = ArrayRange(minYear, maxYear, true);
    }
    for( let year = minYear; year <= maxYear; year++ ) {
        if($existingOption) {
            eventDate = new Date(Date.UTC(year, Number($existingOption[0].dataset.month)-1, Number($existingOption[0].dataset.day), 0, 0, 0));
            if( eventDate.getUTCDay() === 0 ) {
                titleAttr = ` title="in the year ${year}, ${MonthDayFmt.format(eventDate)} is a Sunday"`;
                lightClass = ' bg-light';
            } else {
                titleAttr = ` title="${DTFormat.format(eventDate)}"`;
                lightClass = '';
            }
        }
        //console.log(`in the year ${year}, ${MonthDayFmt.format(eventDate)} is a ${DayOfTheWeekFmt.format(eventDate)}`);
        if(years.includes(year)) {
            htmlStr += `<span class="testYearSpan year-${year}${lightClass}"${titleAttr}>${hammerIcon}${year}${removeIcon}</span>`;
        } else {
            htmlStr += `<span class="testYearSpan year-${year} deleted"></span>`;
        }
    }
    document.querySelector('#yearsToTestGrid').insertAdjacentHTML('beforeend', htmlStr);
    $isotopeYearsToTestGrid = $('#yearsToTestGrid').isotope({
        layoutMode: 'fitRows'
    });
    document.querySelector('#yearsToTestGrid').classList.add('invisible');
    document.querySelector('#defineTestModalLabel').textContent = modalLabel[currentTestType];
    if('edittest' in ev.relatedTarget.dataset) {
        $('#carouselCreateNewUnitTest').carousel(1);
    }
});

$(document).on('hide.bs.modal', '#modalDefineTest', ev => {
    $(ev.currentTarget).find(`.${currentTestType}`).addClass('d-none');
});

$(document).on('slid.bs.carousel', ev => {
    if( ev.to > 0 ) {
        $( '#carouselPrevButton' ).removeAttr('disabled');
    } else {
        $( '#carouselPrevButton' ).attr('disabled','disabled');
    }
    if( ev.to === ($('.carousel-item').length - 1) ) {
        $( '#carouselNextButton' ).attr('disabled','disabled');
    } else {
        $( '#carouselNextButton' ).removeAttr('disabled');
    }
    if( ev.to === 1 ) {
        $isotopeYearsToTestGrid.isotope('layout');
        document.querySelector('#yearsToTestGrid').classList.remove('invisible');
    }
    if( ev.to === 2 ) {
        let firstYear = document.querySelector('#lowerRange').value;
        let monthDay = '-01-01';
        const selectedEventVal = document.querySelector('#existingFestivityName').value;
        const $selectedOption = $('#existingFestivitiesList').find('option[value="' + selectedEventVal + '"]');
        if( $selectedOption.length && $selectedOption[0].dataset.month && $selectedOption[0].dataset.month !== '' && $selectedOption[0].dataset.day && $selectedOption[0].dataset.day !== '' ) {
            const month = $selectedOption[0].dataset.month.padStart(2, '0');
            const day = $selectedOption[0].dataset.day.padStart(2, '0');
            monthDay = `-${month}-${day}`;
        }
        document.querySelector('#baseDate').value = `${firstYear}${monthDay}`;
        document.querySelector('#btnCreateTest').removeAttribute('disabled');
    }
});


/** SLIDER 1 INTERACTIONS */

$(document).on('change', '#existingFestivityName', ev => {
    const currentVal = ev.currentTarget.value;
    console.log(currentVal);
    // Determine whether an option exists with the current value of the input.
    const $existingOption = $(ev.currentTarget.list).find('option[value="' + currentVal + '"]');
    if( $existingOption.length > 0 ) {
        $(ev.currentTarget).removeClass('is-invalid');
        ev.currentTarget.setCustomValidity('');
        const [name, grade] = $existingOption.text().split(/[\(\)]+/).map(el => el.trim());
        let gradeStr = `The ${grade} of `;
        let onDateStr = 'the expected date';
        if( $existingOption[0].dataset.month && $existingOption[0].dataset.month !== '' && $existingOption[0].dataset.day && $existingOption[0].dataset.day !== '' ) {
            //console.log(`month=${$existingOption[0].dataset.month},day=${$existingOption[0].dataset.day}`);
            let eventDate = new Date(Date.UTC(1970, Number($existingOption[0].dataset.month)-1, Number($existingOption[0].dataset.day), 0, 0, 0));
            onDateStr = MonthDayFmt.format(eventDate);
            if( Number($existingOption[0].dataset.grade) <= LitGrade.FEAST ) {
                const minYear = parseInt(document.querySelector('#lowerRange').value);
                const maxYear = parseInt(document.querySelector('#upperRange').value);
                for(year = minYear; year <= maxYear; year++) {
                    eventDate = new Date(Date.UTC(year, Number($existingOption[0].dataset.month)-1, Number($existingOption[0].dataset.day), 0, 0, 0));
                    if( eventDate.getUTCDay() === 0 ) {
                        console.log(`%c in the year ${year}, ${MonthDayFmt.format(eventDate)} is a ${DayOfTheWeekFmt.format(eventDate)}`, 'color:lime;background:black;');
                        document.querySelector(`.testYearSpan.year-${year}`).setAttribute('title', `in the year ${year}, ${MonthDayFmt.format(eventDate)} is a Sunday` );
                        document.querySelector(`.testYearSpan.year-${year}`).classList.add('bg-light');
                    } else {
                        console.log(`in the year ${year}, ${MonthDayFmt.format(eventDate)} is a ${DayOfTheWeekFmt.format(eventDate)}`);
                        document.querySelector(`.testYearSpan.year-${year}`).setAttribute('title', DTFormat.format(eventDate) );
                    }
                }
            }
            //const dayWithSuffix = new OrdinalFormat(locale).withOrdinalSuffix(Number(dayName));
        } else {
            console.log('selected option does not seem to have month or day values?');
            console.log($existingOption[0].dataset);
        }
        document.querySelector('#newUnitTestDescription').value = `${gradeStr}'${name}' should fall on ${onDateStr}`;
    } else {
        ev.currentTarget.classList.add('is-invalid');
        ev.currentTarget.setCustomValidity('Please choose a value from the list');
    }
});

/** SLIDER 2 INTERACTIONS */

$(document).on('change', '#yearsToTestRangeSlider [type=range]', ev => {
    let rangeVals = [];
    document.querySelectorAll('#yearsToTestRangeSlider [type=range]').forEach(el => rangeVals.push(el.value));
    const minYear = Math.min(...rangeVals);
    const maxYear = Math.max(...rangeVals);
    $('#yearsToTestGrid').isotope('destroy');
    $('#yearsToTestGrid').empty();
    let removeIcon = '<i class="fas fa-xmark-circle ms-1 opacity-50" role="button" title="remove"></i>';
    let hammerIcon = currentTestType === TestType.ExactCorrespondence ? '' : '<i class="fas fa-hammer me-1 opacity-50" role="button" title="set year"></i>';
    let htmlStr = '';
    let titleAttr = '';
    let lightClass = '';
    const currentEventKey = document.querySelector('#existingFestivityName').value;
    $existingOption = $(document.querySelector('#existingFestivityName').list).find('option[value="' + currentEventKey + '"]');
    for( let year = minYear; year <= maxYear; year++ ) {
        eventDate = new Date(Date.UTC(year, Number($existingOption[0].dataset.month)-1, Number($existingOption[0].dataset.day), 0, 0, 0));
        if( eventDate.getUTCDay() === 0 ) {
            titleAttr = ` title="in the year ${year}, ${MonthDayFmt.format(eventDate)} is a Sunday"`;
            lightClass = ' bg-light';
        } else {
            titleAttr = ` title="${DTFormat.format(eventDate)}"`;
            lightClass = '';
        }
        htmlStr += `<span class="testYearSpan year-${year}${lightClass}"${titleAttr}>${hammerIcon}${year}${removeIcon}</span>`;
    }
    console.log(htmlStr);
    //$parsedHtml = $.parseHTML( htmlStr );
    //console.log($parsedHtml);
    document.querySelector('#yearsToTestGrid').insertAdjacentHTML('beforeend', htmlStr);
    $isotopeYearsToTestGrid = $('#yearsToTestGrid').isotope({
        layoutMode: 'fitRows'
    });
    document.querySelector('#yearSinceUntilShadow').value = minYear;
});

$(document).on('click', '#yearsToTestGrid > .testYearSpan > svg.fa-circle-xmark', ev => {
    const parnt = ev.currentTarget.parentElement;
    $(parnt).fadeOut('fast', () => {
        //parnt.remove();
        $(parnt).empty();
        parnt.classList.add('deleted');
        $(parnt).fadeIn('fast', () => {
            $('#yearsToTestGrid').isotope('layout');
        });
    });
});

$(document).on('click', '#yearsToTestGrid > .testYearSpan > svg.fa-hammer', ev => {
    const parnt = ev.currentTarget.parentElement;
    const bgClass = currentTestType === TestType.VariableCorrespondence ? 'bg-warning' : 'bg-info';
    if( [TestType.ExactCorrespondenceSince,TestType.ExactCorrespondenceUntil].includes(currentTestType) ) {
        $(parnt.parentElement).find(`.testYearSpan`).removeClass([`bg-info`,'bg-warning']);
        const siblings = Array.from(parnt.parentElement.children);
        const idxAsChild = siblings.indexOf(parnt);
        const allPrevSiblings = siblings.slice(0,idxAsChild);
        const allNextSiblings = siblings.slice(idxAsChild+1);
        if( TestType.ExactCorrespondenceSince === currentTestType ) {
            $(allPrevSiblings).removeClass('bg-light').addClass('bg-warning');
        } else {
            $(allNextSiblings).removeClass('bg-light').addClass('bg-warning');
        }
    }
    parnt.classList.remove('bg-light');
    parnt.classList.add(bgClass);
    document.querySelector('#yearSinceUntilShadow').value = parnt.innerText; //do not use textContent here!
});

/** FINAL CREATE TEST BUTTON */

$(document).on('click', '#btnCreateTest', () => {
    let form = document.querySelector('#carouselCreateNewUnitTest form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        let firstInvalidInput = $(form).find(":invalid")[0];
        console.log(firstInvalidInput);
        let parentCarouselItem = $(firstInvalidInput).closest('.carousel-item');
        console.log(parentCarouselItem);
        console.log(parentCarouselItem.data('item'));
        $('#carouselCreateNewUnitTest').carousel(parentCarouselItem.data('item'));
    } else {
        //let's build our new Unit Test
        proxiedTest = new Proxy({}, sanitizeOnSetValue);
        proxiedTest.eventkey = document.querySelector('#existingFestivityName').value;
        console.log(document.querySelector('#existingFestivityName').value);
        console.log(proxiedTest.name);
        proxiedTest.testType = currentTestType;
        proxiedTest.description = document.querySelector('#newUnitTestDescription').value;
        const yearsChosenEls = document.querySelectorAll('.testYearSpan:not(.deleted)');
        let yearSinceUntil = null;
        if( [TestType.ExactCorrespondenceSince,TestType.ExactCorrespondenceUntil].includes(currentTestType) ) {
            yearSinceUntil = parseInt($('.testYearSpan.bg-info').contents().filter(function() {
                return this.nodeType === Node.TEXT_NODE;
            }).text());
            if( currentTestType === TestType.ExactCorrespondenceSince ) {
                proxiedTest.yearSince = yearSinceUntil;
                document.querySelector('#yearSince').value = yearSinceUntil;
            } else {
                proxiedTest.yearUntil = yearSinceUntil;
                document.querySelector('#yearUntil').value = yearSinceUntil;
            }
        }
        let yearsNonExistence = Array.from(document.querySelectorAll('.testYearSpan.bg-warning')).map(el => parseInt($(el).contents().filter(function() {
            return this.nodeType === Node.TEXT_NODE;
        }).text()));

        const yearsChosen = Array.from(yearsChosenEls).map(el => parseInt($(el).contents().filter(function() {
            return this.nodeType === Node.TEXT_NODE;
        }).text()));
        const baseDate = new Date(document.querySelector('#baseDate').value + 'T00:00:00Z');
        proxiedTest.assertions = [];
        let assert =  null;
        let dateX = null;
        let assertion = null;
        yearsChosen.forEach(year => {
            if( yearsNonExistence.includes(year) ) {
                assert = 'eventNotExists';
                dateX = null;
                assertion = proxiedTest.description.replace('should fall on', 'should not exist on');
            } else {
                baseDate.setUTCFullYear(year);
                assert = 'eventExists AND hasExpectedTimestamp';
                dateX = Date.parse(`${baseDate.toISOString()}`) / 1000;
                assertion = proxiedTest.description;
            }
            proxiedTest.assertions.push(new Assertion(year, dateX, assert, assertion));
        });
        $('#testName').text( proxiedTest.name );
        $('#cardHeaderTestType').text( proxiedTest.testType );
        $('#description').attr('rows', 2);
        $('#description').val( proxiedTest.description );
        $('#description').attr('rows', Math.ceil( $('#description')[0].scrollHeight / 30 ));
        $('#assertionsContainer').empty();
        const assertionsBuilder = new AssertionsBuilder( proxiedTest );
        const assertionBuildHtml = assertionsBuilder.buildHtml();
        $(assertionBuildHtml).appendTo('#assertionsContainer');
        document.querySelector('#perYearAssertions').classList.remove('invisible');
        document.querySelector('#serializeUnitTestData').removeAttribute('disabled');
        const myModalEl = document.querySelector('#modalDefineTest');
        const myModal = bootstrap.Modal.getInstance(myModalEl);
        myModal.hide();
    }
});
