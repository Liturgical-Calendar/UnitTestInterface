
/** DEFINE OUR GLOBAL VARIABLES */

/**
 * @typedef {Object} LitCalEvent
 * @property {string} event_key - The "key" or "tag" or "id" of the liturgical event
 * @property {string} name - The name of the liturgical event according to the requested locale
 * @property {int} month - The month of the liturgical event
 * @property {int} day - The day of the liturgical event
 * @property {int} grade - The liturgical grade of the liturgical event
 * @property {array} common - An array of the liturgical commons of the liturgical event
 * @property {array} color - An array of the liturgical colors of the liturgical event
 * @property {string} grade_lcl - The liturgical grade of the liturgical event in the requested locale
 * @property {string} common_lcl - The liturgical commons of the liturgical event in the requested locale
 */

/**
 * Typedef for the JSON data containing all the liturgical events.
 * @typedef {Object<string, LitCalEvent>} LitCalEvents
 */

/**
 * @type {LitCalEvents}
 * @global
 * This variable is defined globally in the admin.php file, and can be updated in an API call.
 */
// @ts-ignore 2570 LitcalEvents is defined in admin.php
let litcal_events = LitcalEvents;
let litcal_events_keys = litcal_events.map( event => event.event_key );

/**
 * Represents the DateTime format used for displaying full dates in the UTC timezone.
 * @type {Object}
 */
const DTFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeZone: 'UTC'
  });

/**
 * Represents the DateTime format used for displaying month and day in the UTC timezone.
 * @type {Object}
 */
const MonthDayFmt = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric'
});

/**
 * Represents the DateTime format used for displaying the day of the week in the UTC timezone.
 * @type {Intl.DateTimeFormat}
 */
const DayOfTheWeekFmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long'
});

/**
 * A proxy for a Test object that is being edited, used for sanitizing the values set on the object.
 * @type {Object|null}
 */
let proxiedTest = null;

/**
 * @function
 * @name sanitizeOnSetValue.set
 * @description Proxy setter for sanitizing strings and checking types and values
 * @param {Object} target The object that the property is being set on
 * @param {string} prop The name of the property being set
 * @param {any} value The value that the property is being set to
 * @returns {boolean} true if the set was successful, false otherwise
 */
const sanitizeOnSetValue = {
    /**
     * @function
     * @name sanitizeOnSetValue.get
     * @description Proxy getter for sanitizing strings
     * @param {Object} target The object that the property is being accessed on
     * @param {string} prop The name of the property being accessed
     * @returns {any} The sanitized property value
     */
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
    /**
     * @function
     * @name sanitizeOnSetValue.set
     * @description Proxy setter for sanitizing strings and checking types and values
     * @param {Object} target The object that the property is being set on
     * @param {string} prop The name of the property being set
     * @param {any} value The value that the property is being set to
     * @returns {boolean} true if the set was successful, false otherwise
     */
    set: (target, prop, value) => {
        switch( prop ) {
            case 'name':
                //we don't allow the name to ever be different than eventkey+'Test'
                value = (target['event_key']) + 'Test';
                break;
            case 'test_type':
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
            case 'event_key':
                if( typeof value !== 'string' ) {
                    console.warn(`property ${prop} of this object must be of type string`);
                    return;
                } else if ( false === litcal_events_keys.includes(value) ) {
                    console.warn(`property ${prop} of this object must contain a valid Liturgical Event Key`);
                    return;
                }
                target['name'] = value + 'Test';
                break;
            case 'year_since':
                if( target['test_type'] !== TestType.ExactCorrespondenceSince ) {
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
            case 'year_until':
                if( target['test_type'] !== TestType.ExactCorrespondenceUntil ) {
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
            case 'expected_value':
                const dateRegex = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(0[0-9]|1[0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(\.[0-9]+)?(\+|\-)(0[0-9]|1[0-2]):([0-5][0-9])$/;
                if( value !== null && (typeof value !== 'string' || !dateRegex.test(value) || new Date(value) < new Date('1969-11-29T00:00:00+00:00') || new Date(value) > new Date('9999-12-31T00:00:00+00:00') ) ) {
                    console.warn(`property ${prop} of this object must be an RFC 3339 date-time string and have a value between '1969-11-29T00:00:00+00:00' and '9999-12-31T00:00:00+00:00'`);
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
            case 'applies_to':
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
                if( typeof value !== 'string' || false === DiocesanCalendars.includes(value) ) {
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
 * Counts previous siblings of an element that contain a descendant matching the given selector.
 * Equivalent to jQuery's $(el).prevAll(':has(selector)').length
 *
 * @param {Element} element - The starting element
 * @param {string} selector - CSS selector to match within siblings
 * @returns {number} Count of matching previous siblings
 */
const countPrevSiblingsWithSelector = (element, selector) => {
    let count = 0;
    let sibling = element.previousElementSibling;
    while (sibling) {
        if (sibling.querySelector(selector)) {
            count++;
        }
        sibling = sibling.previousElementSibling;
    }
    return count;
};

const ENDPOINTS = {
    VERSION: "dev",
    METADATA: `${baseUrl}/calendars`,
    TESTSINDEX: `${baseUrl}/tests`,
    EVENTS: `${baseUrl}/events`
}

/**
 * Sets the API endpoints according to the version selected in the dropdown.
 *
 * @param {Event} [ev] - An optional event object.
 *
 * @return {void}
 */
const setEndpoints = (ev = null) => {
    if(ev) {
        ENDPOINTS.VERSION = ev.currentTarget.value;
    } else {
        ENDPOINTS.VERSION = document.querySelector('#apiVersionsDropdownItems').value;
    }
}

document.querySelector('#apiVersionsDropdownItems').value = 'dev';
document.querySelector('#apiVersionsDropdownItems').disabled = true;
setEndpoints();

/**
 * LOAD METADATA FOR EXISTING CALENDARS
 */
let CalendarNations = null;
let DiocesanCalendars = null;

fetch(ENDPOINTS.METADATA)
    .then(response => response.ok ? response.json() : Promise.reject(response))
    .then(response => {
        const { national_calendar_keys, diocesan_calendar_keys } = response;
        CalendarNations = national_calendar_keys;
        DiocesanCalendars = diocesan_calendar_keys;
    })
    .catch(error => console.error('Could not fetch', ENDPOINTS.METADATA, error));

/** Prepare PUT new Unit Test */

/**
 * Class representing a unit test for a liturgical event.
 * @class
 */
class UnitTest {
    /**
     * Constructs a new UnitTest instance.
     * @param {string} event_key - the event key of the event that this unit test is for.
     * @param {string} description - the description of this unit test.
     * @param {TestType} test_type - the type of the test.
     * @param {Assertion[]} assertions - the assertions of this test.
     * @param {number} [year_since=null] - the year since which the test applies (only for TestType.ExactCorrespondenceSince).
     * @param {number} [year_until=null] - the year until which the test applies (only for TestType.ExactCorrespondenceUntil).
     */
    constructor(event_key, description, test_type, assertions, year_since = null, year_until = null ) {
        if( arguments.length === 1 ) {
            if(
                typeof arguments[0] === 'object'
                && (Object.keys( arguments[0] ).length === 5 || Object.keys( arguments[0] ).length === 6)
                && Object.keys( arguments[0] ).every(val => ['name', 'event_key', 'description', 'test_type', 'assertions', 'year_since', 'year_until', 'applies_to'].includes(val) )
            ) {
                Object.assign(this, arguments[0]);
            } else {
                console.log('there seem to be extra unexpected properties: ' + Object.keys( arguments[0] ).join(', ') );
            }
        } else {
            this.name = event_key + 'Test';
            this.event_key = event_key;
            this.description = description;
            this.test_type = test_type;
            this.assertions = assertions;
            if( null !== year_since ) {
                this.year_since = year_since;
            }
            if( null !== year_until ) {
                this.year_until = year_until;
            }
        }
    }
}

/**
 * Class representing an assertion for a liturgical event in a unit test.
 * @class
 */
class Assertion {
    /**
     * @description
     *      Creates a new instance of Assertion.
     *      The constructor can be called with 4 or 5 arguments, or with a single object argument.
     *      If called with 4 or 5 arguments, it assigns the arguments to the properties year, expected_value, assert, assertion and optionally comment.
     *      If called with a single object argument, it checks if the object has the required properties (year, expected_value, assert, assertion and optionally comment) and assigns them to the respective properties if they are present.
     * @param {number} year - The year of the assertion.
     * @param {string|null} expected_value - The expected value of the assertion.
     * @param {'EventTypeExact'|'EventNotExists'} assert - The assert type of the assertion.
     * @param {string} assertion - The assertion.
     * @param {string} [comment] - The comment associated with the assertion.
     */
    constructor(year, expected_value, assert, assertion, comment = null) {
        if( arguments.length === 4 || arguments.length === 5 ) {
            this.year = year;
            this.expected_value = expected_value;
            this.assert = assert;
            this.assertion = assertion;
            if( null !== comment ) {
                this.comment = comment;
            }
        } else if( arguments.length === 1 ) {
            if(
                typeof arguments[0] === 'object'
                && (Object.keys( arguments[0] ).length === 4 || Object.keys( arguments[0] ).length === 5)
                && Object.keys( arguments[0] ).every(val => ['year', 'expected_value', 'assert', 'assertion', 'comment'].includes(val) )
            ) {
                Object.assign(this, arguments[0]);
            }
        }
    }
}

/**
 * Sanitizes the given input string to prevent XSS attacks.
 *
 * It uses the DOMParser to parse the string as HTML and then extracts the
 * text content of the parsed HTML document. This effectively strips any HTML
 * tags from the input string.
 * kudos to https://stackoverflow.com/a/47140708/394921 for the idea
 *
 * @function
 * @param {string} input - The input string to sanitize.
 * @returns {string} The sanitized string.
 */
const sanitizeInput = (input) => {
    let doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.body.textContent || "";
}

/**
 * Sanitizes the input of the given target element to prevent XSS attacks.
 *
 * It uses the sanitizeInput helper function to strip any HTML tags from the
 * target element's text content and then checks if the sanitized text is
 * different from the original text content. If so, it updates the target
 * element's text content with the sanitized text and shows a warning alert to
 * the user.
 *
 * @param {Element} target - The element to sanitize.
 */
const checkTargetInput = (target) => {
    let sanitizedInput = sanitizeInput( target.textContent );
    if( sanitizedInput !== target.textContent ) {
        target.textContent = sanitizedInput;
        const alert = document.querySelector('#noScriptedContentAlert');
        alert.classList.remove('d-none');
        alert.style.opacity = '1';
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => {
                alert.classList.add('d-none');
            }, 500);
        }, 2000);
    }
}

/**
 * Serializes the current state of the unit test form into a UnitTest object.
 *
 * This function extracts values from the DOM elements representing the unit test,
 * including the event key, description, test type, and any assertions. It assigns
 * these values to the `proxiedTest` object and creates an array of `Assertion`
 * instances for each assertion found in the DOM. If applicable, it also sets the
 * calendar type that the test applies to. Finally, it returns a new `UnitTest`
 * object initialized with the serialized test data.
 *
 * @returns {UnitTest} The serialized UnitTest object based on the current form data.
 */
const serializeUnitTest = () => {
    const eventkey = document.querySelector('#testName').textContent.replace('Test','');
    const description = document.querySelector('#description').value;
    const test_type = document.querySelector('#cardHeaderTestType').textContent;
    const year_since = test_type === 'exactCorrespondenceSince' ? Number(document.querySelector('#yearSince').value) : null;
    const year_until = test_type === 'exactCorrespondenceUntil' ? Number(document.querySelector('#yearUntil').value) : null;
    proxiedTest.event_key = eventkey;
    proxiedTest.description = description;
    proxiedTest.test_type = test_type;
    if( test_type === 'exactCorrespondenceSince' ) {
        proxiedTest.year_since = year_since;
    }
    if( test_type === 'exactCorrespondenceUntil' ) {
        proxiedTest.year_until = year_until;
    }
    proxiedTest.assertions = [];
    let assertionDivs = document.querySelectorAll('#assertionsContainer > div');
    assertionDivs.forEach(div => {
        const year = Number(div.querySelector('p.testYear').textContent);
        const expected_value = div.querySelector('div > span.expectedValue').textContent === '---' ? null :div.querySelector('.expectedValue').getAttribute('data-value');
        const assert = div.querySelector('.assert').textContent;
        const assertion = div.querySelector('[contenteditable]').textContent;
        const hasComment = div.querySelector('.comment > svg').getAttribute('data-icon') === 'comment-dots';
        const comment = hasComment ? div.querySelector('.comment').getAttribute('title') : null;
        proxiedTest.assertions.push(new Assertion(year, expected_value, assert, assertion, comment));
    });
    if( document.querySelector('#APICalendarSelect').value !== 'VA' ) {
        const currentCalendarType = document.querySelector(`#APICalendarSelect [value="${document.querySelector('#APICalendarSelect').value}"]`).dataset.calendartype;
        proxiedTest.applies_to = {[currentCalendarType]: document.querySelector('#APICalendarSelect').value};
    }
    return new UnitTest( proxiedTest );
}

const API = {
    get path() {
        if( this.calendartype === 'nationalcalendar' ) {
            if (this.calendar_id === 'VA') {
                return `${ENDPOINTS.EVENTS}`;
            }
            return `${ENDPOINTS.EVENTS}/nation/${this.calendar_id}`;
        }
        if( this.calendartype === 'diocesancalendar' ) {
            return `${ENDPOINTS.EVENTS}/diocese/${this.calendar_id}`;
        }
        throw new Error('calendartype must be either "nationalcalendar" or "diocesancalendar"');
    },
    set path(val) {
        throw new Error('path is a computed property and cannot be set');
    },
    get calendartype() {
        return this._calendartype;
    },
    set calendartype(val) {
        this._calendartype = val;
    },
    get calendar_id() {
        return this._calendar_id;
    },
    set calendar_id(val) {
        this._calendar_id = val;
    }
};

/**
 * Rebuilds the options for the select element containing the list of existing
 * liturgical events for the currently selected API calendar.
 *
 * @param {HTMLSelectElement} element - The select element containing the list of
 * existing liturgical events.
 * @async
 * @returns {Promise<void>}
 */
const rebuildLitEventsOptions = async (element) => {
    console.log(`rebuildLitEventsOptions: ${element.value}`);
    const selectedOption = element.querySelector(`option[value="${element.value}"]`);
    console.log(selectedOption);
    const calendarType = selectedOption.dataset.calendartype;
    API.calendartype = calendarType;
    API.calendar_id = element.value;
    // TODO: we might want to cache the results for each request to avoid multiple requests
    console.log(`fetching data from API.path = ${API.path}, locale = ${locale}`);
    let options = {};
    if ( element.value === 'VA' ) {
        options.headers = { 'Accept-Language': locale };
    }
    const data_1 = await fetch( API.path, options );
    const json = await data_1.json();
    litcal_events = Object.freeze(json.litcal_events);
    litcal_events_keys = litcal_events.map( event => event.event_key );
    let htmlStr = '';
    for ( const el of litcal_events ) {
        let dataMonth = '';
        let dataDay = '';
        let dataGrade = '';
        if ( el.hasOwnProperty( "month" ) ) {
            dataMonth = ` data-month="${el.month}"`;
        }
        if ( el.hasOwnProperty( "day" ) ) {
            dataDay = ` data-day="${el.day}"`;
        }
        if ( el.hasOwnProperty( "grade" ) ) {
            dataGrade = ` data-grade="${el.grade}"`;
        }
        htmlStr += `<option value="${el.event_key}"${dataMonth}${dataDay}${dataGrade}>${el.name} (${el.grade_lcl})</option>`;
    }
    document.querySelector( '#existingLitEventsList' ).innerHTML = htmlStr;
}

/**
 * SET DOCUMENT INTERACTIONS
 */

document.addEventListener('click', event => {
    const sidebarToggle = event.target.closest('.sidebarToggle');
    if (!sidebarToggle) return;
    console.log('now toggling sidebar...');
    event.preventDefault();
    const icon = sidebarToggle.querySelector('i');
    if(document.body.classList.contains('sb-sidenav-collapsed') ) {
        icon.classList.remove('fa-angle-right');
        icon.classList.add('fa-angle-left');
    }
    else {
        icon.classList.remove('fa-angle-left');
        icon.classList.add('fa-angle-right');
    }
    document.body.classList.toggle('sb-sidenav-collapsed');
});

//$(document).on('change', '#apiVersionsDropdownItems', setEndpoints);

document.querySelector('#litCalTestsSelect').addEventListener('change', async (ev) => {
    //console.log(ev.currentTarget.value);
    if( ev.currentTarget.value !== '' ) {
        const currentTest = LitCalTests.filter(el => el.name === ev.currentTarget.value)[0];
        console.log('currentTest', currentTest);
        currentTest.assertions = currentTest.assertions.map(el => new Assertion(el));
        proxiedTest = new Proxy(currentTest, sanitizeOnSetValue);

        document.querySelector('#testName').textContent = proxiedTest.name;
        //$('#testType').val( proxiedTest.testType ).change();
        document.querySelector('#cardHeaderTestType').textContent = proxiedTest.test_type;
        const descEl = document.querySelector('#description');
        descEl.setAttribute('rows', 1);
        descEl.value = proxiedTest.description;
        descEl.setAttribute('rows', Math.ceil(descEl.scrollHeight / 40));
        if( proxiedTest.hasOwnProperty('year_since') ) {
            document.querySelector('#yearSince').value = proxiedTest.year_since;
        }
        if( proxiedTest.hasOwnProperty('year_until') ) {
            document.querySelector('#yearUntil').value = proxiedTest.year_until;
        }
        if( proxiedTest.hasOwnProperty('applies_to') ) {
            const calendarType = Object.keys(proxiedTest.applies_to)[0];
            document.querySelector('#APICalendarSelect').value = proxiedTest.applies_to[calendarType];
            await rebuildLitEventsOptions(document.querySelector('#APICalendarSelect'));
            document.querySelector('#existingLitEventName').value = proxiedTest.event_key;
            console.log(`keys of litcal_events after rebuildLitEventsOptions:`);
            console.log(litcal_events_keys.sort());
            AssertionsBuilder.test = litcal_events.filter(el => el.event_key === proxiedTest.event_key)[0] ?? null;
            AssertionsBuilder.appliesTo = proxiedTest.applies_to[calendarType];
        } else {
            const currentCalendarValue = document.querySelector('#APICalendarSelect').value;
            if ( currentCalendarValue !== 'VA' ) {
                document.querySelector('#APICalendarSelect').value = 'VA';
                await rebuildLitEventsOptions(document.querySelector('#APICalendarSelect'));
            }
            //document.querySelector('#APICalendarSelect').value = 'VA';
            //await rebuildLitEventsOptions(document.querySelector('#APICalendarSelect'));
        }

        document.querySelector('#assertionsContainer').innerHTML = '';
        const assertionsBuilder = new AssertionsBuilder( proxiedTest );
        const assertionBuildHtml = assertionsBuilder.buildHtml();
        document.querySelector('#assertionsContainer').append(assertionBuildHtml);
        document.querySelector('#perYearAssertions').classList.remove('invisible');
        document.querySelector('#perYearAssertions .btn').dataset.testtype = proxiedTest.test_type;
        document.querySelector('#serializeUnitTestData').removeAttribute('disabled');
        document.querySelectorAll('#createNewTestBtnGrp button').forEach(el => el.setAttribute('disabled', 'disabled'));
    } else {
        proxiedTest = null;
    }
});

document.querySelector('#APICalendarSelect').addEventListener('change', async (ev) => {
    await rebuildLitEventsOptions( ev.currentTarget );
});

document.addEventListener('click', ev => {
    const editDate = ev.target.closest('.editDate');
    if (!editDate) return;
    // Guard against clicking when disabled (no valid date value)
    if (editDate.classList.contains('btn-secondary')) {
        return;
    }
    const prevEl = editDate.previousElementSibling;
    if (!prevEl || !prevEl.dataset || !prevEl.dataset.value) {
        return;
    }
    const curDate = new Date(prevEl.dataset.value);
    const curDateVal = curDate.toISOString().split('T')[0];
    const pElement = editDate.parentElement;
    pElement.classList.remove('bg-success', 'text-white');
    pElement.classList.add('bg-warning', 'text-dark');
    pElement.children[1].innerHTML = '';
    pElement.children[1].insertAdjacentHTML('beforeend', `<input type="date" value="${curDateVal}" />`);
});

document.addEventListener('click', ev => {
    const toggleAssert = ev.target.closest('.toggleAssert');
    if (!toggleAssert) return;
    const parentDiv = toggleAssert.parentElement.parentElement;
    const assertionIndex = countPrevSiblingsWithSelector(parentDiv, '.testYear');
    if(toggleAssert.parentElement.classList.contains('bg-warning')) {
        toggleAssert.previousElementSibling.textContent = AssertType.EventTypeExact;
        proxiedTest.assertions[assertionIndex].assert = AssertType.EventTypeExact;
        toggleAssert.parentElement.classList.remove('bg-warning', 'text-dark');
        toggleAssert.parentElement.classList.add('bg-success', 'text-white');
        const pNode = toggleAssert.parentNode;
        const yearEl = pNode.parentElement.querySelector('.testYear');
        const year = yearEl ? yearEl.textContent : new Date().getFullYear();
        const nextDiv = pNode.nextElementSibling;
        nextDiv.children[1].innerHTML = '';
        nextDiv.children[1].insertAdjacentHTML('beforeend', `<input type="date" value="${year}-01-01" />`);
        // Enable the editDate button since we now have a date value
        nextDiv.children[2].classList.remove('btn-secondary');
        nextDiv.children[2].classList.add('btn-danger');
    } else {
        toggleAssert.previousElementSibling.textContent = AssertType.EventNotExists;
        proxiedTest.assertions[assertionIndex].assert = AssertType.EventNotExists;
        toggleAssert.parentElement.classList.remove('bg-success', 'text-white');
        toggleAssert.parentElement.classList.add('bg-warning', 'text-dark');
        const pNode = toggleAssert.parentNode;
        const nextDiv = pNode.nextElementSibling;
        nextDiv.classList.remove('bg-success', 'text-white');
        nextDiv.classList.add('bg-warning', 'text-dark');
        nextDiv.children[1].textContent = '---';
        proxiedTest.assertions[assertionIndex].expected_value = null;
        // Disable the editDate button since expected_value is now null
        nextDiv.children[2].classList.remove('btn-danger');
        nextDiv.children[2].classList.add('btn-secondary');
    }
});

document.addEventListener('change', ev => {
    if (!ev.target.matches('.expectedValue > [type=date]')) return;
    const dateTimeString = ev.target.value + 'T00:00:00+00:00';
    const grandpa = ev.target.closest('div');
    const greatGrandpa = grandpa.parentElement.closest('div');
    const assertionIndex = countPrevSiblingsWithSelector(greatGrandpa, '.testYear');
    proxiedTest.assertions[assertionIndex].expected_value = dateTimeString;
    grandpa.classList.remove('bg-warning', 'text-dark');
    grandpa.classList.add('bg-success', 'text-white');
    ev.target.parentNode.dataset.value = dateTimeString;
    // Format date for display, matching AssertionsBuilder.buildHtml format
    const dateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
    const parsedDate = new Date(dateTimeString);
    const displayText = isNaN(parsedDate.getTime()) ? dateTimeString : dateFormatter.format(parsedDate);
    ev.target.parentNode.textContent = displayText;
});

document.querySelector('#modalAddEditComment').addEventListener('show.bs.modal', ev => {
    console.log(ev);
    const tgt = ev.relatedTarget;
    console.log(tgt);
    const icon = tgt.querySelector('.svg-inline--fa');
    console.log(icon);
    const value = icon.classList.contains('fa-comment-dots') ? tgt.title : '';
    const myModalEl = document.querySelector('#modalAddEditComment');
    const txtArea = myModalEl.querySelector('#unitTestComment');
    txtArea.value = value;
    const btnSaveComment = myModalEl.querySelector('#btnSaveComment');
    const saveCommentHandler = () => {
        const newValue = sanitizeInput(txtArea.value);
        tgt.title = newValue;
        if (newValue === '') {
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
        btnSaveComment.removeEventListener('click', saveCommentHandler);
    };
    btnSaveComment.addEventListener('click', saveCommentHandler);
});


const contenteditableHandler = ev => {
    const target = ev.target.closest('[contenteditable]');
    if (!target) return;

    console.log(ev.type);

    if (['paste', 'drop'].includes(ev.type)) {
        setTimeout(() => {
            target.textContent = target.textContent;
            checkTargetInput(target);
        }, 1);
    } else if (ev.type === 'blur') {
        checkTargetInput(target);
    } else {
        console.log(target.textContent);
    }
    const grandpa = target.parentElement.parentElement;
    const assertionIndex = countPrevSiblingsWithSelector(grandpa, '.testYear');
    proxiedTest.assertions[assertionIndex].assertion = target.textContent;
};
document.addEventListener('blur', contenteditableHandler, true);
document.addEventListener('paste', contenteditableHandler, true);
document.addEventListener('drop', contenteditableHandler, true);
document.addEventListener('input', contenteditableHandler, true);

document.querySelector('#serializeUnitTestData').addEventListener('click', () => {
    const newUnitTest = serializeUnitTest();
    let responseStatus = 400;
    fetch(ENDPOINTS.TESTSINDEX, {
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
        const alert = document.querySelector('#responseToPutRequest');
        document.querySelector('#responseToPutRequest > #responseMessage').textContent = data.response;
        if (responseStatus !== 201) {
            alert.classList.remove('alert-success');
            alert.classList.add('alert-warning');
        }
        alert.classList.remove('d-none');
        alert.style.opacity = '1';
        setTimeout(() => {
            alert.style.opacity = '0';
            setTimeout(() => {
                alert.classList.add('d-none');
            }, 500);
        }, 2000);
        console.log(data);
    });
});

/**
 * DEFINE INTERACTIONS FOR CREATE NEW TEST MODAL
 */
let currentTestType = TestType.ExactCorrespondence; //this value will be set on modal open
let isotopeYearsToTestGrid = null;

const modalLabel = {
    exactCorrespondence: 'Exact Date Correspondence Test',
    exactCorrespondenceSince: 'Exact Date Correspondence Since Year Test',
    exactCorrespondenceUntil: 'Exact Date Correspondence Until Year Test',
    variableCorrespondence: 'Variable Existence Test'
}

const ArrayRange = (start, end, endInclusive) => Array.from({length: (end - start)+endInclusive}, (v, k) => k + start);

document.querySelector('#modalDefineTest').addEventListener('show.bs.modal', ev => {
    // we want to make sure the carousel is on the first slide every time we open the modal
    const carouselEl = document.querySelector('#carouselCreateNewUnitTest');
    const carousel = bootstrap.Carousel.getOrCreateInstance(carouselEl);
    carousel.to(0);
    // we also want to reset our form to defaults
    document.querySelector('#carouselCreateNewUnitTest form').reset();
    document.querySelector('#carouselCreateNewUnitTest form').classList.remove('was-validated');
    document.querySelector('#btnCreateTest').setAttribute('disabled', 'disabled');
    // set our global currentTestType variable based on the button that was clicked to open the modal
    currentTestType = ev.relatedTarget.dataset.testtype;
    // update our carousel elements based on the currentTestType
    ev.currentTarget.querySelectorAll(`.${currentTestType}`).forEach(el => el.classList.remove('d-none'));
    if (null !== isotopeYearsToTestGrid) {
        isotopeYearsToTestGrid.destroy();
    }
    document.querySelector('#yearsToTestGrid').innerHTML = '';
    let removeIcon = '<i class="fas fa-xmark-circle ms-1 opacity-50" role="button" title="remove"></i>';
    let hammerIcon = currentTestType === TestType.ExactCorrespondence ? '' : '<i class="fas fa-hammer me-1 opacity-50" role="button" title="set year"></i>';
    let htmlStr = '';
    let years;
    let minYear = 1970;
    let maxYear = 2030;
    let existingOption = null;
    let titleAttr = '';
    let lightClass = '';
    if ('edittest' in ev.relatedTarget.dataset) {
        console.log('we are editing an existing test: description and event_key will be pre-filled');
        console.log('description: ', proxiedTest.description);
        console.log('event_key: ', proxiedTest.event_key);
        document.querySelector('#newUnitTestDescription').value = proxiedTest.description;
        document.querySelector('#existingLitEventName').value = proxiedTest.event_key;
        existingOption = document.querySelector(`#existingLitEventsList option[value="${proxiedTest.event_key}"]`);
        console.log('existingOption', existingOption);
        years = Array.from(document.querySelectorAll('#assertionsContainer .testYear')).map(el => Number(el.textContent));
        minYear = Math.min(...years);
        maxYear = Math.max(...years);
        document.querySelector('#lowerRange').setAttribute('value', minYear);
        document.querySelector('#lowerRange').parentNode.style.setProperty('--value-a', minYear);
        document.querySelector('#lowerRange').parentNode.style.setProperty('--text-value-a', `"${minYear}"`);
        document.querySelector('#upperRange').setAttribute('value', maxYear);
        document.querySelector('#upperRange').parentNode.style.setProperty('--value-b', maxYear);
        document.querySelector('#upperRange').parentNode.style.setProperty('--text-value-b', `"${maxYear}"`);
    } else {
        minYear = Number(document.querySelector('#lowerRange').getAttribute('value'));
        maxYear = Number(document.querySelector('#upperRange').getAttribute('value'));
        years = ArrayRange(minYear, maxYear, true);
    }
    for (let year = minYear; year <= maxYear; year++) {
        if (existingOption && existingOption.dataset.month && existingOption.dataset.day) {
            let eventDate = new Date(Date.UTC(year, Number(existingOption.dataset.month) - 1, Number(existingOption.dataset.day), 0, 0, 0));
            if (eventDate.getUTCDay() === 0) {
                titleAttr = ` title="in the year ${year}, ${MonthDayFmt.format(eventDate)} is a Sunday"`;
                lightClass = ' bg-light';
            } else {
                titleAttr = ` title="${DTFormat.format(eventDate)}"`;
                lightClass = '';
            }
        } else {
            titleAttr = '';
            lightClass = '';
        }
        //console.log(`in the year ${year}, ${MonthDayFmt.format(eventDate)} is a ${DayOfTheWeekFmt.format(eventDate)}`);
        if (years.includes(year)) {
            htmlStr += `<span class="testYearSpan year-${year}${lightClass}"${titleAttr}>${hammerIcon}${year}${removeIcon}</span>`;
        } else {
            htmlStr += `<span class="testYearSpan year-${year} deleted"></span>`;
        }
    }
    document.querySelector('#yearsToTestGrid').insertAdjacentHTML('beforeend', htmlStr);
    isotopeYearsToTestGrid = new Isotope('#yearsToTestGrid', {
        layoutMode: 'fitRows'
    });
    document.querySelector('#yearsToTestGrid').classList.add('invisible');
    document.querySelector('#defineTestModalLabel').textContent = modalLabel[currentTestType];
    if ('edittest' in ev.relatedTarget.dataset) {
        carousel.to(1);
    }
});

document.querySelector('#modalDefineTest').addEventListener('hide.bs.modal', ev => {
    ev.currentTarget.querySelectorAll(`.${currentTestType}`).forEach(el => el.classList.add('d-none'));
});

document.querySelector('#carouselCreateNewUnitTest').addEventListener('slid.bs.carousel', ev => {
    const carouselItems = document.querySelectorAll('.carousel-item');
    if (ev.to > 0) {
        document.querySelector('#carouselPrevButton').removeAttribute('disabled');
    } else {
        document.querySelector('#carouselPrevButton').setAttribute('disabled', 'disabled');
    }
    if (ev.to === (carouselItems.length - 1)) {
        document.querySelector('#carouselNextButton').setAttribute('disabled', 'disabled');
    } else {
        document.querySelector('#carouselNextButton').removeAttribute('disabled');
    }
    if (ev.to === 1) {
        isotopeYearsToTestGrid.layout();
        document.querySelector('#yearsToTestGrid').classList.remove('invisible');
    }
    if (ev.to === 2) {
        let firstYear = document.querySelector('#lowerRange').value;
        let monthDay = '-01-01';
        const selectedEventVal = document.querySelector('#existingLitEventName').value;
        const selectedOption = document.querySelector(`#existingLitEventsList option[value="${selectedEventVal}"]`);
        if (selectedOption && selectedOption.dataset.month && selectedOption.dataset.month !== '' && selectedOption.dataset.day && selectedOption.dataset.day !== '') {
            const month = selectedOption.dataset.month.padStart(2, '0');
            const day = selectedOption.dataset.day.padStart(2, '0');
            monthDay = `-${month}-${day}`;
        }
        document.querySelector('#baseDate').value = `${firstYear}${monthDay}`;
        document.querySelector('#btnCreateTest').removeAttribute('disabled');
    }
});


/** SLIDER 1 INTERACTIONS */

document.querySelector('#existingLitEventName').addEventListener('change', ev => {
    const currentVal = ev.currentTarget.value;
    console.log(currentVal);
    // Determine whether an option exists with the current value of the input.
    const existingOption = document.querySelector(`#existingLitEventsList option[value="${currentVal}"]`);
    if (existingOption) {
        ev.currentTarget.classList.remove('is-invalid');
        ev.currentTarget.setCustomValidity('');
        const [name, grade] = existingOption.textContent.split(/[\(\)]+/).map(el => el.trim());
        let gradeStr = `The ${grade} of `;
        let onDateStr = 'the expected date';
        if (existingOption.dataset.month && existingOption.dataset.month !== '' && existingOption.dataset.day && existingOption.dataset.day !== '') {
            //console.log(`month=${existingOption.dataset.month},day=${existingOption.dataset.day}`);
            let eventDate = new Date(Date.UTC(1970, Number(existingOption.dataset.month) - 1, Number(existingOption.dataset.day), 0, 0, 0));
            onDateStr = MonthDayFmt.format(eventDate);
            if (Number(existingOption.dataset.grade) <= LitGrade.FEAST) {
                const minYear = parseInt(document.querySelector('#lowerRange').value);
                const maxYear = parseInt(document.querySelector('#upperRange').value);
                for (let year = minYear; year <= maxYear; year++) {
                    eventDate = new Date(Date.UTC(year, Number(existingOption.dataset.month) - 1, Number(existingOption.dataset.day), 0, 0, 0));
                    if (eventDate.getUTCDay() === 0) {
                        console.log(`%c in the year ${year}, ${MonthDayFmt.format(eventDate)} is a ${DayOfTheWeekFmt.format(eventDate)}`, 'color:lime;background:black;');
                        document.querySelector(`.testYearSpan.year-${year}`).setAttribute('title', `in the year ${year}, ${MonthDayFmt.format(eventDate)} is a Sunday`);
                        document.querySelector(`.testYearSpan.year-${year}`).classList.add('bg-light');
                    } else {
                        console.log(`in the year ${year}, ${MonthDayFmt.format(eventDate)} is a ${DayOfTheWeekFmt.format(eventDate)}`);
                        document.querySelector(`.testYearSpan.year-${year}`).setAttribute('title', DTFormat.format(eventDate));
                    }
                }
            }
            //const dayWithSuffix = new OrdinalFormat(locale).withOrdinalSuffix(Number(dayName));
        } else {
            console.log('selected option does not seem to have month or day values?');
            console.log(existingOption.dataset);
        }
        document.querySelector('#newUnitTestDescription').value = `${gradeStr}'${name}' should fall on ${onDateStr}`;
    } else {
        ev.currentTarget.classList.add('is-invalid');
        ev.currentTarget.setCustomValidity('Please choose a value from the list');
    }
});

/** SLIDER 2 INTERACTIONS */

document.addEventListener('change', ev => {
    if (!ev.target.matches('#yearsToTestRangeSlider [type=range]')) return;

    let rangeVals = [];
    document.querySelectorAll('#yearsToTestRangeSlider [type=range]').forEach(el => rangeVals.push(el.value));
    const minYear = Math.min(...rangeVals);
    const maxYear = Math.max(...rangeVals);
    isotopeYearsToTestGrid.destroy();
    document.querySelector('#yearsToTestGrid').innerHTML = '';
    let removeIcon = '<i class="fas fa-xmark-circle ms-1 opacity-50" role="button" title="remove"></i>';
    let hammerIcon = currentTestType === TestType.ExactCorrespondence ? '' : '<i class="fas fa-hammer me-1 opacity-50" role="button" title="set year"></i>';
    let htmlStr = '';
    let titleAttr = '';
    let lightClass = '';
    const currentEventKey = document.querySelector('#existingLitEventName').value;
    const existingOption = document.querySelector(`#existingLitEventsList option[value="${currentEventKey}"]`);
    for (let year = minYear; year <= maxYear; year++) {
        if (existingOption && existingOption.dataset.month && existingOption.dataset.day) {
            let eventDate = new Date(Date.UTC(year, Number(existingOption.dataset.month) - 1, Number(existingOption.dataset.day), 0, 0, 0));
            if (eventDate.getUTCDay() === 0) {
                titleAttr = ` title="in the year ${year}, ${MonthDayFmt.format(eventDate)} is a Sunday"`;
                lightClass = ' bg-light';
            } else {
                titleAttr = ` title="${DTFormat.format(eventDate)}"`;
                lightClass = '';
            }
        } else {
            titleAttr = '';
            lightClass = '';
        }
        htmlStr += `<span class="testYearSpan year-${year}${lightClass}"${titleAttr}>${hammerIcon}${year}${removeIcon}</span>`;
    }
    console.log(htmlStr);
    document.querySelector('#yearsToTestGrid').insertAdjacentHTML('beforeend', htmlStr);
    isotopeYearsToTestGrid = new Isotope('#yearsToTestGrid', {
        layoutMode: 'fitRows'
    });
    document.querySelector('#yearSinceUntilShadow').value = minYear;
});

document.addEventListener('click', ev => {
    const xmarkIcon = ev.target.closest('#yearsToTestGrid > .testYearSpan > svg.fa-circle-xmark');
    if (!xmarkIcon) return;

    const parnt = xmarkIcon.parentElement;
    parnt.style.opacity = '0';
    setTimeout(() => {
        parnt.innerHTML = '';
        parnt.classList.add('deleted');
        parnt.style.opacity = '1';
        isotopeYearsToTestGrid.layout();
    }, 200);
});

document.addEventListener('click', ev => {
    const hammerIcon = ev.target.closest('#yearsToTestGrid > .testYearSpan > svg.fa-hammer');
    if (!hammerIcon) return;

    const parnt = hammerIcon.parentElement;
    const bgClass = currentTestType === TestType.VariableCorrespondence ? 'bg-warning' : 'bg-info';
    if ([TestType.ExactCorrespondenceSince, TestType.ExactCorrespondenceUntil].includes(currentTestType)) {
        parnt.parentElement.querySelectorAll('.testYearSpan').forEach(el => {
            el.classList.remove('bg-info', 'bg-warning');
        });
        const siblings = Array.from(parnt.parentElement.children);
        const idxAsChild = siblings.indexOf(parnt);
        const allPrevSiblings = siblings.slice(0, idxAsChild);
        const allNextSiblings = siblings.slice(idxAsChild + 1);
        if (TestType.ExactCorrespondenceSince === currentTestType) {
            allPrevSiblings.forEach(el => {
                el.classList.remove('bg-light');
                el.classList.add('bg-warning');
            });
        } else {
            allNextSiblings.forEach(el => {
                el.classList.remove('bg-light');
                el.classList.add('bg-warning');
            });
        }
    }
    parnt.classList.remove('bg-light');
    parnt.classList.add(bgClass);
    document.querySelector('#yearSinceUntilShadow').value = parnt.innerText; //do not use textContent here!
});

/** FINAL CREATE TEST BUTTON */

/**
 * Helper function to get text content excluding child elements (text nodes only)
 * @param {Element} element - The element to extract text from
 * @returns {string} The text content of direct text nodes
 */
const getTextNodeContent = (element) => {
    return Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join('');
};

document.querySelector('#btnCreateTest').addEventListener('click', () => {
    let form = document.querySelector('#carouselCreateNewUnitTest form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        let firstInvalidInput = form.querySelector(':invalid');
        console.log(firstInvalidInput);
        let parentCarouselItem = firstInvalidInput.closest('.carousel-item');
        console.log(parentCarouselItem);
        console.log(parentCarouselItem.dataset.item);
        const carouselEl = document.querySelector('#carouselCreateNewUnitTest');
        const carousel = bootstrap.Carousel.getOrCreateInstance(carouselEl);
        carousel.to(parseInt(parentCarouselItem.dataset.item));
    } else {
        //let's build our new Unit Test
        proxiedTest = new Proxy({}, sanitizeOnSetValue);
        proxiedTest.event_key = document.querySelector('#existingLitEventName').value;
        console.log(document.querySelector('#existingLitEventName').value);
        console.log(proxiedTest.name);
        proxiedTest.test_type = currentTestType;
        proxiedTest.description = document.querySelector('#newUnitTestDescription').value;
        const yearsChosenEls = document.querySelectorAll('.testYearSpan:not(.deleted)');
        let yearSinceUntil = null;
        if ([TestType.ExactCorrespondenceSince, TestType.ExactCorrespondenceUntil].includes(currentTestType)) {
            const bgInfoEl = document.querySelector('.testYearSpan.bg-info');
            yearSinceUntil = parseInt(getTextNodeContent(bgInfoEl));
            if (currentTestType === TestType.ExactCorrespondenceSince) {
                proxiedTest.year_since = yearSinceUntil;
                document.querySelector('#yearSince').value = yearSinceUntil;
            } else {
                proxiedTest.year_until = yearSinceUntil;
                document.querySelector('#yearUntil').value = yearSinceUntil;
            }
        }
        let yearsNonExistence = Array.from(document.querySelectorAll('.testYearSpan.bg-warning')).map(el => parseInt(getTextNodeContent(el)));

        const yearsChosen = Array.from(yearsChosenEls).map(el => parseInt(getTextNodeContent(el)));
        const baseDate = new Date(document.querySelector('#baseDate').value + 'T00:00:00Z');
        proxiedTest.assertions = [];
        let assert = null;
        let dateX = null;
        let assertion = null;
        yearsChosen.forEach(year => {
            if (yearsNonExistence.includes(year)) {
                assert = 'eventNotExists';
                dateX = null;
                assertion = proxiedTest.description.replace('should fall on', 'should not exist on');
            } else {
                baseDate.setUTCFullYear(year);
                assert = 'eventExists AND hasExpectedDate';
                dateX = baseDate.toISOString().split('T')[0] + 'T00:00:00+00:00';
                assertion = proxiedTest.description;
            }
            proxiedTest.assertions.push(new Assertion(year, dateX, assert, assertion));
        });
        document.querySelector('#testName').textContent = proxiedTest.name;
        document.querySelector('#cardHeaderTestType').textContent = proxiedTest.test_type;
        document.querySelector('#description').setAttribute('rows', '2');
        const descriptionEl = document.querySelector('#description');
        descriptionEl.value = proxiedTest.description;
        descriptionEl.setAttribute('rows', Math.ceil(descriptionEl.scrollHeight / 30));
        document.querySelector('#assertionsContainer').innerHTML = '';
        const assertionsBuilder = new AssertionsBuilder(proxiedTest);
        const assertionBuildHtml = assertionsBuilder.buildHtml();
        document.querySelector('#assertionsContainer').append(assertionBuildHtml);
        document.querySelector('#perYearAssertions').classList.remove('invisible');
        document.querySelector('#serializeUnitTestData').removeAttribute('disabled');
        const myModalEl = document.querySelector('#modalDefineTest');
        const myModal = bootstrap.Modal.getInstance(myModalEl);
        myModal.hide();
    }
});
