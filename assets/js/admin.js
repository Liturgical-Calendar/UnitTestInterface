/**
 * Admin module for the LiturgicalCalendar Unit Test Interface.
 * Handles test management, editing, and creation.
 * @module admin
 */

import { updateText } from './common.js';
import {
    TestType,
    AssertType,
    LitGrade,
    Assertion,
    AssertionsBuilder
} from './AssertionsBuilder.js';

/** @typedef {import('./types.js').UnitTestDefinition} UnitTestDefinition */
/** @typedef {import('./types.js').TestAssertion} TestAssertion */

// Access global config from window (set by PHP in footer.php and admin.php)
const { locale } = window.LitCalConfig;
const { baseUrl, LitCalTests } = window;

/**
 * Escapes a value for safe use in CSS attribute selectors.
 * Uses CSS.escape when available, with a fallback for older browsers.
 * @param {string} value - The value to escape.
 * @returns {string} The escaped value safe for use in selectors.
 */
const escapeSelector = (value) => {
    // Normalize to string to handle non-string values
    const str = String(value);
    if (typeof CSS !== 'undefined' && CSS.escape) {
        return CSS.escape(str);
    }
    // Fallback: escape special characters for CSS selectors
    return str.replace(/["'\\#.:[\]()>+~=^$*|]/g, '\\$&');
};

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
 * Also exposed on window for AssertionsBuilder module access.
 */
// @ts-ignore 2570 LitcalEvents is defined in admin.php
let litcal_events = window.LitcalEvents;
window.litcal_events = litcal_events;
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
 * Fades in an alert element, displays it for a specified duration, then fades it out.
 * @param {HTMLElement} alertEl - The alert element to fade in/out
 * @param {number} [displayDelay=2000] - How long to display the alert before fading out (ms)
 * @param {number} [fadeDelay=500] - How long the fade out transition takes (ms)
 * @param {string} [easing='ease-in-out'] - The CSS easing function for the transition
 */
const fadeOutAlert = (alertEl, displayDelay = 2000, fadeDelay = 500, easing = 'ease-in-out') => {
    if (!alertEl) return;
    alertEl.classList.remove('d-none');
    alertEl.style.transition = `opacity ${fadeDelay}ms ${easing}`;
    alertEl.style.opacity = '1';
    setTimeout(() => {
        alertEl.style.opacity = '0';
        setTimeout(() => {
            alertEl.classList.add('d-none');
        }, fadeDelay);
    }, displayDelay);
};

/**
 * Computes date attributes for a year span based on the event option.
 * @param {number} year - The year to compute attributes for
 * @param {HTMLOptionElement|null} existingOption - The selected option element with event data
 * @returns {{titleAttr: string, lightClass: string}} The computed title attribute and CSS class
 */
const computeYearDateAttrs = (year, existingOption) => {
    let titleAttr = '';
    let lightClass = '';

    if (existingOption?.dataset?.month && existingOption?.dataset?.day) {
        const eventDate = new Date(Date.UTC(year, Number(existingOption.dataset.month) - 1, Number(existingOption.dataset.day), 0, 0, 0));
        if (eventDate.getUTCDay() === 0) {
            titleAttr = `in the year ${year}, ${MonthDayFmt.format(eventDate)} is a Sunday`;
            lightClass = 'bg-light';
        } else {
            titleAttr = DTFormat.format(eventDate);
        }
    }

    return { titleAttr, lightClass };
};

/**
 * Generates HTML for a year span element in the year grid.
 * @param {number} year - The year to generate HTML for
 * @param {HTMLOptionElement|null} existingOption - The selected option element with event data
 * @param {string} hammerIcon - HTML for the hammer icon (empty for ExactCorrespondence tests)
 * @param {string} removeIcon - HTML for the remove icon
 * @param {boolean} [isIncluded=true] - Whether this year is included in the test range
 * @returns {string} The HTML string for the year span
 */
const generateYearSpanHtml = (year, existingOption, hammerIcon, removeIcon, isIncluded = true) => {
    const { titleAttr, lightClass } = computeYearDateAttrs(year, existingOption);
    const titleStr = titleAttr ? ` title="${titleAttr}"` : '';

    if (!isIncluded) {
        return `<span class="testYearSpan year-${year} deleted"${titleStr}></span>`;
    }

    const classStr = lightClass ? ` ${lightClass}` : '';

    return `<span class="testYearSpan year-${year}${classStr}"${titleStr}>${hammerIcon}${year}${removeIcon}</span>`;
};

/**
 * Updates the year grid to highlight years where the event falls on a Sunday.
 * @param {HTMLOptionElement} existingOption - The selected option element with event data
 * @param {number} minYear - The minimum year in the range
 * @param {number} maxYear - The maximum year in the range
 */
const updateYearGridForEvent = (existingOption, minYear, maxYear) => {
    // Always clear previous highlights first
    for (let year = minYear; year <= maxYear; year++) {
        const yearSpan = document.querySelector(`.testYearSpan.year-${year}`);
        if (!yearSpan) continue;
        yearSpan.removeAttribute('title');
        yearSpan.classList.remove('bg-light');
    }

    if (!existingOption?.dataset?.month || !existingOption?.dataset?.day) {
        return;
    }

    if (Number(existingOption.dataset.grade) > LitGrade.FEAST) {
        return;
    }

    for (let year = minYear; year <= maxYear; year++) {
        const yearSpan = document.querySelector(`.testYearSpan.year-${year}`);
        if (!yearSpan) continue;

        const { titleAttr, lightClass } = computeYearDateAttrs(year, existingOption);
        if (titleAttr) {
            yearSpan.setAttribute('title', titleAttr);
        }
        if (lightClass) {
            yearSpan.classList.add(lightClass);
        }
    }
};

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
            // expected_value must be stored as RFC 3339 datetime strings (e.g., "2024-12-25T00:00:00+00:00")
            // This ensures clean round-tripping with the API and consistent date handling
            case 'expected_value':
                // Timezone offsets range from -12:00 to +14:00 (e.g., Pacific/Kiritimati is UTC+14)
                const dateRegex = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T(0[0-9]|1[0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])(\.[0-9]+)?(\+|\-)(0[0-9]|1[0-4]):([0-5][0-9])$/;
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
    const eventkey    = document.querySelector('#testName').textContent.replace('Test','');
    const description = document.querySelector('#description').value;
    const test_type   = document.querySelector('#cardHeaderTestType').textContent;
    const year_since  = test_type === 'exactCorrespondenceSince' ? Number(document.querySelector('#yearSince').value) : null;
    const year_until  = test_type === 'exactCorrespondenceUntil' ? Number(document.querySelector('#yearUntil').value) : null;

    proxiedTest.event_key   = eventkey;
    proxiedTest.description = description;
    proxiedTest.test_type   = test_type;

    if( test_type === 'exactCorrespondenceSince' ) {
        proxiedTest.year_since = year_since;
    }
    if( test_type === 'exactCorrespondenceUntil' ) {
        proxiedTest.year_until = year_until;
    }
    proxiedTest.assertions = [];

    const assertionDivs = document.querySelectorAll('#assertionsContainer > div');
    assertionDivs.forEach(div => {
        const yearEl          = div.querySelector('p.testYear');
        const year            = yearEl ? Number(yearEl.textContent) : null;
        const expectedValueEl = div.querySelector('.expectedValue');
        // Get RFC 3339 datetime string from data-value attribute (e.g., "2024-12-25T00:00:00+00:00")
        // Normalize undefined to null for API consistency
        const expected_value = expectedValueEl?.textContent === '---' ? null : (expectedValueEl?.getAttribute('data-value') ?? null);
        const assertEl       = div.querySelector('.assert');
        const assert         = assertEl?.textContent ?? null;
        const assertionEl    = div.querySelector('[contenteditable]');
        const assertion      = assertionEl?.textContent ?? null;
        const commentSvg     = div.querySelector('.comment > svg');
        const hasComment     = commentSvg?.getAttribute('data-icon') === 'comment-dots';
        const comment        = hasComment ? div.querySelector('.comment').getAttribute('title') : null;
        proxiedTest.assertions.push(new Assertion(year, expected_value, assert, assertion, comment));
    });
    const apiCalendarSelect = document.querySelector('#APICalendarSelect');
    if( apiCalendarSelect?.value !== 'VA' ) {
        const selectedOption      = apiCalendarSelect.options[apiCalendarSelect.selectedIndex];
        const currentCalendarType = selectedOption?.dataset.calendartype;
        proxiedTest.applies_to    = {[currentCalendarType]: apiCalendarSelect.value};
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
    const selectedOption = element.options[element.selectedIndex];
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
    window.litcal_events = litcal_events;
    litcal_events_keys = litcal_events.map(event => event.event_key);
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

        updateText('testName', proxiedTest.name);
        //$('#testType').val( proxiedTest.testType ).change();
        updateText('cardHeaderTestType', proxiedTest.test_type);
        const descEl = document.querySelector('#description');
        descEl.value = proxiedTest.description;
        // Auto-resize: reset to 1 row, then calculate rows based on actual content height
        descEl.style.height = 'auto';
        descEl.style.height = `${descEl.scrollHeight}px`;
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
        // Reset form to default state when empty option is selected
        proxiedTest = null;

        // Reset test name and type display
        const testNameEl = document.querySelector('#testName');
        updateText('testName', testNameEl.dataset.default || 'Name of Test');
        updateText('cardHeaderTestType', '');

        // Reset description
        const descEl = document.querySelector('#description');
        descEl.value = '';
        descEl.style.height = 'auto';

        // Clear hidden year fields
        document.querySelector('#yearSince').value = '';
        document.querySelector('#yearUntil').value = '';

        // Reset calendar select to default (VA / General Roman Calendar)
        const apiCalendarSelect = document.querySelector('#APICalendarSelect');
        if (apiCalendarSelect.value !== 'VA') {
            apiCalendarSelect.value = 'VA';
            await rebuildLitEventsOptions(apiCalendarSelect);
        }

        // Clear assertions container and hide the label
        document.querySelector('#assertionsContainer').innerHTML = '';
        document.querySelector('#perYearAssertions').classList.add('invisible');
        document.querySelector('#perYearAssertions .btn').dataset.testtype = '';

        // Disable save button (requires test to be defined)
        document.querySelector('#serializeUnitTestData').setAttribute('disabled', 'disabled');

        // Re-enable create new test buttons
        document.querySelectorAll('#createNewTestBtnGrp button').forEach(el => el.removeAttribute('disabled'));
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
    const curDate    = new Date(prevEl.dataset.value);
    const curDateVal = curDate.toISOString().split('T')[0];
    const pElement   = editDate.parentElement;
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
        const defaultDate = `${year}-01-01`;
        const defaultDateTime = `${defaultDate}T00:00:00+00:00`;
        nextDiv.children[1].innerHTML = `<input type="date" value="${defaultDate}" />`;
        nextDiv.children[1].dataset.value = defaultDateTime;
        proxiedTest.assertions[assertionIndex].expected_value = defaultDateTime;
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
    // Format date for display using shared formatter from AssertionsBuilder
    const parsedDate = new Date(dateTimeString);
    const displayText = isNaN(parsedDate.getTime())
        ? dateTimeString
        : AssertionsBuilder.getDateFormatter().format(parsedDate);
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
    // Use onclick to replace previous handler, preventing stale handlers accumulating
    btnSaveComment.onclick = () => {
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
    };
});

// Blur any focused element inside the modal before it hides to prevent aria-hidden warning
document.querySelector('#modalAddEditComment').addEventListener('hide.bs.modal', ev => {
    const activeEl = ev.currentTarget.querySelector(':focus');
    if (activeEl) {
        activeEl.blur();
    }
});

const contenteditableHandler = ev => {
    const target = ev.target.closest('[contenteditable]');
    if (!target) return;

    // With contenteditable="plaintext-only", paste/drop are handled by the browser
    // We only need to update the proxied test on blur or input
    const grandpa = target.parentElement.parentElement;
    const assertionIndex = countPrevSiblingsWithSelector(grandpa, '.testYear');
    proxiedTest.assertions[assertionIndex].assertion = target.textContent;
};
document.addEventListener('blur', contenteditableHandler, true);
document.addEventListener('input', contenteditableHandler, true);

document.querySelector('#serializeUnitTestData').addEventListener('click', () => {
    const newUnitTest = serializeUnitTest();
    // Use PATCH for existing tests, PUT for new tests
    // PATCH requires test name in URL path: /tests/{testName}
    const isExistingTest = LitCalTests.some(test => test.name === newUnitTest.name);
    const httpMethod = isExistingTest ? 'PATCH' : 'PUT';
    const endpoint = isExistingTest ? `${ENDPOINTS.TESTSINDEX}/${newUnitTest.name}` : ENDPOINTS.TESTSINDEX;
    let responseStatus = 400;
    fetch(endpoint, {
        method: httpMethod,
        credentials: 'include', // Include HttpOnly cookies for JWT authentication
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify(newUnitTest)
    })
    .then(response => {
        responseStatus = response.status;
        // Handle 401 Unauthorized - user needs to login
        if (response.status === 401) {
            const alertEl = document.querySelector('#responseToPutRequest');
            document.querySelector('#responseToPutRequest > #responseMessage').textContent = 'Authentication required. Please login to save tests.';
            alertEl.classList.remove('alert-success', 'alert-warning', 'alert-danger');
            alertEl.classList.add('alert-warning');
            fadeOutAlert(alertEl, 3000);
            // Show login modal if available
            if (typeof window.showLoginModal === 'function') {
                window.showLoginModal();
            }
            const authError = new Error('Authentication required');
            authError.isAuthError = true;
            return Promise.reject(authError);
        }
        return response.json();
    })
    .then(data => {
        console.log(responseStatus);
        const alertEl = document.querySelector('#responseToPutRequest');
        document.querySelector('#responseToPutRequest > #responseMessage').textContent = data.response || 'Operation completed';
        // Normalize alert classes before adding the appropriate one
        // PUT returns 201 Created, PATCH returns 200 OK
        alertEl.classList.remove('alert-success', 'alert-warning', 'alert-danger');
        alertEl.classList.add((responseStatus === 200 || responseStatus === 201) ? 'alert-success' : 'alert-warning');
        fadeOutAlert(alertEl);
        console.log(data);
    })
    .catch(error => {
        // Don't show network error for auth rejection (already handled above)
        if (error.isAuthError) {
            return;
        }
        console.error('Failed to save unit test:', error);
        const alertEl = document.querySelector('#responseToPutRequest');
        document.querySelector('#responseToPutRequest > #responseMessage').textContent = 'Network error: Failed to save test';
        // Normalize alert classes before adding the error class
        alertEl.classList.remove('alert-success', 'alert-warning', 'alert-danger');
        alertEl.classList.add('alert-danger');
        fadeOutAlert(alertEl);
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
    const removeIcon = '<i class="fas fa-circle-xmark ms-1 opacity-50" aria-hidden="true" role="button" title="remove"></i>';
    const hammerIcon = currentTestType === TestType.ExactCorrespondence ? '' : '<i class="fas fa-hammer me-1 opacity-50" aria-hidden="true" role="button" title="set year"></i>';
    let htmlStr = '';
    let years;
    let minYear = 1970;
    let maxYear = 2030;
    let existingOption = null;
    if ('edittest' in ev.relatedTarget.dataset) {
        console.log('we are editing an existing test: description and event_key will be pre-filled');
        console.log('description: ', proxiedTest.description);
        console.log('event_key: ', proxiedTest.event_key);
        document.querySelector('#newUnitTestDescription').value = proxiedTest.description;
        document.querySelector('#existingLitEventName').value = proxiedTest.event_key;
        existingOption = document.querySelector(`#existingLitEventsList option[value="${escapeSelector(proxiedTest.event_key)}"]`);
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
        htmlStr += generateYearSpanHtml(year, existingOption, hammerIcon, removeIcon, years.includes(year));
    }
    document.querySelector('#yearsToTestGrid').insertAdjacentHTML('beforeend', htmlStr);
    if (typeof Isotope !== 'undefined') {
        isotopeYearsToTestGrid = new Isotope('#yearsToTestGrid', {
            layoutMode: 'fitRows'
        });
    } else {
        console.warn('Isotope library not loaded; year grid layout may be affected');
    }
    document.querySelector('#yearsToTestGrid').classList.add('invisible');
    updateText('defineTestModalLabel', modalLabel[currentTestType]);
    if ('edittest' in ev.relatedTarget.dataset) {
        // Apply visual indication for year_since/year_until when editing existing test
        let pivotYear = null;
        if (currentTestType === TestType.ExactCorrespondenceSince && proxiedTest.year_since) {
            pivotYear = proxiedTest.year_since;
        } else if (currentTestType === TestType.ExactCorrespondenceUntil && proxiedTest.year_until) {
            pivotYear = proxiedTest.year_until;
        }
        if (pivotYear !== null) {
            const pivotSpan = document.querySelector(`#yearsToTestGrid .testYearSpan.year-${pivotYear}`);
            if (pivotSpan) {
                pivotSpan.classList.remove('bg-light');
                pivotSpan.classList.add('bg-info');
                const siblings = Array.from(pivotSpan.parentElement.children);
                const idxAsChild = siblings.indexOf(pivotSpan);
                if (currentTestType === TestType.ExactCorrespondenceSince) {
                    // Years before pivotYear get bg-warning (event doesn't exist)
                    siblings.slice(0, idxAsChild).forEach(el => {
                        el.classList.remove('bg-light');
                        el.classList.add('bg-warning');
                    });
                } else {
                    // Years after pivotYear get bg-warning (event doesn't exist)
                    siblings.slice(idxAsChild + 1).forEach(el => {
                        el.classList.remove('bg-light');
                        el.classList.add('bg-warning');
                    });
                }
                document.querySelector('#yearSinceUntilShadow').value = pivotYear;
            }
        }
        // Apply visual indication for Variable Existence tests
        if (currentTestType === TestType.VariableCorrespondence && proxiedTest.assertions) {
            proxiedTest.assertions.forEach(assertion => {
                if (assertion.assert === AssertType.EventNotExists) {
                    const yearSpan = document.querySelector(`#yearsToTestGrid .testYearSpan.year-${assertion.year}`);
                    if (yearSpan) {
                        yearSpan.classList.remove('bg-light');
                        yearSpan.classList.add('bg-warning');
                    }
                }
            });
        }
        carousel.to(1);
    }
});

document.querySelector('#modalDefineTest').addEventListener('hide.bs.modal', ev => {
    // Blur any focused element inside the modal before it hides to prevent aria-hidden warning
    const activeEl = ev.currentTarget.querySelector(':focus');
    if (activeEl) {
        activeEl.blur();
    }
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
        isotopeYearsToTestGrid?.layout();
        document.querySelector('#yearsToTestGrid').classList.remove('invisible');
    }
    if (ev.to === 2) {
        let firstYear = document.querySelector('#lowerRange').value;
        let monthDay = '-01-01';
        const selectedEventVal = document.querySelector('#existingLitEventName').value;
        const selectedOption = document.querySelector(`#existingLitEventsList option[value="${escapeSelector(selectedEventVal)}"]`);
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
    const existingOption = document.querySelector(`#existingLitEventsList option[value="${escapeSelector(currentVal)}"]`);
    const minYear = parseInt(document.querySelector('#lowerRange').value);
    const maxYear = parseInt(document.querySelector('#upperRange').value);
    // Always update year grid (clears previous highlights; applies new ones if applicable)
    updateYearGridForEvent(existingOption, minYear, maxYear);
    if (existingOption) {
        ev.currentTarget.classList.remove('is-invalid');
        ev.currentTarget.setCustomValidity('');
        const [name, grade] = existingOption.textContent.split(/[\(\)]+/).map(el => el.trim());
        let gradeStr = `The ${grade} of `;
        let onDateStr = 'the expected date';
        if (existingOption.dataset.month && existingOption.dataset.month !== '' && existingOption.dataset.day && existingOption.dataset.day !== '') {
            const eventDate = new Date(Date.UTC(1970, Number(existingOption.dataset.month) - 1, Number(existingOption.dataset.day), 0, 0, 0));
            onDateStr = MonthDayFmt.format(eventDate);
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
    isotopeYearsToTestGrid?.destroy();
    document.querySelector('#yearsToTestGrid').innerHTML = '';
    const removeIcon = '<i class="fas fa-circle-xmark ms-1 opacity-50" aria-hidden="true" role="button" title="remove"></i>';
    const hammerIcon = currentTestType === TestType.ExactCorrespondence ? '' : '<i class="fas fa-hammer me-1 opacity-50" aria-hidden="true" role="button" title="set year"></i>';
    const currentEventKey = document.querySelector('#existingLitEventName').value;
    const existingOption = document.querySelector(`#existingLitEventsList option[value="${escapeSelector(currentEventKey)}"]`);
    let htmlStr = '';
    for (let year = minYear; year <= maxYear; year++) {
        htmlStr += generateYearSpanHtml(year, existingOption, hammerIcon, removeIcon);
    }
    document.querySelector('#yearsToTestGrid').insertAdjacentHTML('beforeend', htmlStr);
    if (typeof Isotope !== 'undefined') {
        isotopeYearsToTestGrid = new Isotope('#yearsToTestGrid', {
            layoutMode: 'fitRows'
        });
    } else {
        console.warn('Isotope library not loaded; year grid layout may be affected');
    }
    document.querySelector('#yearSinceUntilShadow').value = minYear;
});

document.addEventListener('click', ev => {
    const xmarkIcon = ev.target.closest('#yearsToTestGrid > .testYearSpan > .fa-circle-xmark');
    if (!xmarkIcon) return;

    const parnt = xmarkIcon.parentElement;
    parnt.style.opacity = '0';
    setTimeout(() => {
        parnt.innerHTML = '';
        parnt.classList.add('deleted');
        parnt.style.opacity = '1';
        isotopeYearsToTestGrid?.layout();
    }, 200);
});

document.addEventListener('click', ev => {
    const deletedSpan = ev.target.closest('#yearsToTestGrid > .testYearSpan.deleted');
    if (!deletedSpan) return;

    // Extract year from class (e.g., "year-2024")
    const yearClass = Array.from(deletedSpan.classList).find(c => c.startsWith('year-'));
    if (!yearClass) return;
    const year = yearClass.replace('year-', '');

    // Get current event option for highlighting
    const currentEventKey = document.querySelector('#existingLitEventName').value;
    const existingOption = document.querySelector(`#existingLitEventsList option[value="${escapeSelector(currentEventKey)}"]`);
    const { titleAttr, lightClass } = computeYearDateAttrs(Number(year), existingOption);

    // Generate icons
    const removeIcon = '<i class="fas fa-circle-xmark ms-1 opacity-50" aria-hidden="true" role="button" title="remove"></i>';
    const hammerIcon = currentTestType === TestType.ExactCorrespondence ? '' : '<i class="fas fa-hammer me-1 opacity-50" aria-hidden="true" role="button" title="set year"></i>';

    // Reinstate the span
    deletedSpan.classList.remove('deleted');
    if (lightClass) {
        deletedSpan.classList.add(lightClass);
    }
    if (titleAttr) {
        deletedSpan.setAttribute('title', titleAttr);
    }
    deletedSpan.innerHTML = `${hammerIcon}${year}${removeIcon}`;
    isotopeYearsToTestGrid?.layout();
});

document.addEventListener('click', ev => {
    const hammerIcon = ev.target.closest('#yearsToTestGrid > .testYearSpan > .fa-hammer');
    if (!hammerIcon) return;

    const parentEl      = hammerIcon.parentElement;
    const grandParentEl = parentEl.parentElement;
    const bgClass       = currentTestType === TestType.VariableCorrespondence ? 'bg-warning' : 'bg-info';
    if ([TestType.ExactCorrespondenceSince, TestType.ExactCorrespondenceUntil].includes(currentTestType)) {
        grandParentEl.querySelectorAll('.testYearSpan').forEach(el => {
            el.classList.remove('bg-info', 'bg-warning');
        });
        const siblings = Array.from(grandParentEl.children);
        const idxAsChild = siblings.indexOf(parentEl);
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
    parentEl.classList.remove('bg-light');
    parentEl.classList.add(bgClass);
    document.querySelector('#yearSinceUntilShadow').value = parentEl.innerText; //do not use textContent here!
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
    const form = document.querySelector('#carouselCreateNewUnitTest form');
    if (!form.checkValidity()) {
        form.classList.add('was-validated');
        const firstInvalidInput = form.querySelector(':invalid');
        console.log(firstInvalidInput);
        const parentCarouselItem = firstInvalidInput.closest('.carousel-item');
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
            if (bgInfoEl) {
                yearSinceUntil = parseInt(getTextNodeContent(bgInfoEl));
                if (currentTestType === TestType.ExactCorrespondenceSince) {
                    proxiedTest.year_since = yearSinceUntil;
                    document.querySelector('#yearSince').value = yearSinceUntil;
                } else {
                    proxiedTest.year_until = yearSinceUntil;
                    document.querySelector('#yearUntil').value = yearSinceUntil;
                }
            }
        }

        const yearsNonExistence = Array.from(document.querySelectorAll('.testYearSpan.bg-warning')).map(el => parseInt(getTextNodeContent(el)));

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
        updateText('testName', proxiedTest.name);
        updateText('cardHeaderTestType', proxiedTest.test_type);
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
