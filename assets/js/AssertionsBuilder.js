/**
 * Assertions Builder module for the LiturgicalCalendar Unit Test Interface.
 * Contains classes and constants for building and managing test assertions.
 * @module AssertionsBuilder
 */

/**
 * Enum-like constant that represents the different types of assertions for liturgical events tests.
 * @readonly
 * @enum {string}
 */
export const TestType = Object.freeze({
    ExactCorrespondence:        'exactCorrespondence',
    ExactCorrespondenceSince:   'exactCorrespondenceSince',
    ExactCorrespondenceUntil:   'exactCorrespondenceUntil',
    VariableCorrespondence:     'variableCorrespondence'
});

/**
 * Enum-like constant that represents the different types of assertions for liturgical events.
 * @readonly
 * @enum {string}
 * @property {string} EventNotExists - Represents that the liturgical event does not exist.
 * @property {string} EventTypeExact - Represents that the liturgical event exists and has the expected date.
 */
export const AssertType = Object.freeze({
    EventNotExists:             'eventNotExists',
    EventTypeExact:             'eventExists AND hasExpectedDate'
});

/**
 * Enum-like constant that represents the different liturgical grades or ranks, from lowest to highest.
 * @readonly
 * @enum {number}
 * @property {number} WEEKDAY - The liturgical grade of a weekday (Feria).
 * @property {number} COMMEMORATION - The liturgical grade of a Commemoration.
 * @property {number} OPTIONAL_MEMORIAL - The liturgical grade of an Optional Memorial.
 * @property {number} MEMORIAL - The liturgical grade of a Memorial.
 * @property {number} FEAST - The liturgical grade of a Feast.
 * @property {number} FEAST_OF_THE_LORD - The liturgical grade of a Feast of the Lord.
 * @property {number} SOLEMNITY - The liturgical grade of a Solemnity.
 * @property {number} HIGHER_SOLEMNITY - The liturgical grade of a Higher Solemnity.
 * @property {string[]} stringVals - An array of string values for each of the above constants, in the same order as the constants.
 */
export const LitGrade = Object.freeze({
    WEEKDAY:            0,
    COMMEMORATION:      1,
    OPTIONAL_MEMORIAL:  2,
    MEMORIAL:           3,
    FEAST:              4,
    FEAST_OF_THE_LORD:  5,
    SOLEMNITY:          6,
    HIGHER_SOLEMNITY:   7,
    stringVals: [
        'weekday',
        'commemoration',
        'optional memorial',
        'Memorial',
        'FEAST',
        'FEAST OF THE LORD',
        'SOLEMNITY',
        'HIGHER SOLEMNITY'
    ],
    toString: ( n ) => LitGrade.stringVals[parseInt(n)]
});

/**
 * Class representing an assertion for a liturgical event in a unit test.
 * @class
 */
export class Assertion {
    /**
     * @description
     *      Creates a new instance of Assertion.
     *      The constructor can be called with 4 or 5 arguments, or with a single object argument.
     *      If called with 4 or 5 arguments, it assigns the arguments to the properties year, expected_value, assert, assertion and optionally comment.
     *      If called with a single object argument, it checks if the object has the required properties (year, expected_value, assert, assertion and optionally comment) and assigns them to the respective properties if they are present.
     * @param {number} year - The year of the assertion.
     * @param {string|null} expected_value - The expected value of the assertion (RFC 3339 datetime string or null).
     * @param {string} assert - The assert type (one of AssertType values: 'eventNotExists' or 'eventExists AND hasExpectedDate').
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
 * Creates a comment icon DOM element depending on whether there is a comment or not.
 * If there is a comment, it creates a button with a comment icon and the comment as title.
 * If there is no comment, it creates a button with a comment-medical icon and 'add a comment' as title.
 * The button is meant to be used as a toggle to show the modal for adding or editing a comment.
 *
 * @param {boolean} hasComment - whether there is a comment or not
 * @param {string} [value=null] - the comment value, if any
 * @returns {HTMLSpanElement} the comment icon as a DOM element
 */
export const createCommentIcon = (hasComment, value = null) => {
    const span = document.createElement('span');
    span.className = hasComment
        ? 'mb-1 btn btn-xs btn-dark float-end comment'
        : 'mb-1 btn btn-xs btn-secondary float-end comment';
    span.setAttribute('role', 'button');
    span.setAttribute('data-bs-toggle', 'modal');
    span.setAttribute('data-bs-target', '#modalAddEditComment');
    span.setAttribute('title', hasComment && value ? value : 'add a comment');

    const icon = document.createElement('i');
    icon.className = hasComment
        ? 'fas fa-comment-dots fa-fw'
        : 'fas fa-comment-medical fa-fw';
    icon.setAttribute('aria-hidden', 'true');

    span.appendChild(icon);
    return span;
};

/**
 * Class AssertionsBuilder
 *
 * @description
 * This class is responsible for managing the interaction with the user when a new Unit Test is created.
 * It will build the HTML for the form that will allow the user to build the assertions for the Unit Test.
 */
export class AssertionsBuilder {
    // set some default initial values
    static testType     = TestType.ExactCorrespondence;
    static yearSince    = null; // only useful in case of TestType.ExactCorrespondenceSince
    static appliesTo    = "Universal Roman Calendar";
    static bgColor      = 'bg-success';
    static txtColor     = 'text-dark';
    static currentTest  = null;
    static #dateFormatter = null;

    /**
     * Gets a cached Intl.DateTimeFormat instance for efficiency.
     * @returns {Intl.DateTimeFormat}
     */
    static getDateFormatter() {
        if (!AssertionsBuilder.#dateFormatter) {
            const loc = typeof window !== 'undefined' && window.locale ? window.locale : navigator.language;
            AssertionsBuilder.#dateFormatter = new Intl.DateTimeFormat(loc, { dateStyle: 'medium', timeZone: 'UTC' });
        }
        return AssertionsBuilder.#dateFormatter;
    }


    /**
     * constructor
     *
     * @param {object} test - a single testUnit (Unitest instance).
     *
     * @description
     *      This constructor creates a new AssertionsBuilder instance from a given single testUnit (Unitest instance).
     *      The testUnit is expected to have the following properties:
     *          - assertions: an array of objects with the following properties: year, expected_value, assert, assertion, comment
     *          - event_key: the event_key of the event for which the testUnit has been created
     *          - test_type: the type of the testUnit, which can be one of the values in TestType
     *          - year_since: only useful in case of TestType.ExactCorrespondenceSince, the year from which the testUnit applies
     *
     *      It maps the assertions array to an array of Assertion instances.
     *      It sets the AssertionsBuilder.testType, and if the test_type is TestType.ExactCorrespondenceSince, it also sets the AssertionsBuilder.yearSince.
     *      It sets the AssertionsBuilder.test to the event with the event_key of the testUnit.
     */
    constructor( test ) {
        this.assertions = test.assertions.map(el => new Assertion(el));
        AssertionsBuilder.testType = test.test_type;
        if( test.test_type === TestType.ExactCorrespondenceSince ) {
            AssertionsBuilder.yearSince = test.year_since;
        }
        AssertionsBuilder.test = window.litcal_events.filter(el => el.event_key === test.event_key)[0] ?? null;
        console.log('new instance of AssertionsBuilder, test = ', AssertionsBuilder.test);
        console.log('litcal_events = ', window.litcal_events);
    }

    /**
     * @private
     * @static
     * @method #setColors
     * @param {Assertion} assertion - the assertion for which to set the colors
     * @description
     *      A private static method that sets the colors for the AssertionsBuilder to be used in the buildHtml method.
     *      It takes an assertion as argument and sets the backgroundColor and textColor of the AssertionsBuilder instance based on the assert property of the assertion.
     *      The colors are set as follows:
     *          - if assert is AssertType.EventNotExists, the backgroundColor is set to 'bg-warning' and the textColor is set to 'text-dark'
     *          - if assert is AssertType.EventTypeExact, the backgroundColor is set to 'bg-success' and the textColor is set to 'text-white'
     *          - otherwise, the backgroundColor is set to 'bg-success' and the textColor is set to 'text-white'
     */
    static #setColors( assertion ) {
        switch( assertion.assert ) {
            case AssertType.EventNotExists:
                AssertionsBuilder.bgColor = 'bg-warning';
                AssertionsBuilder.txtColor = 'text-dark';
                break;
            case AssertType.EventTypeExact:
                AssertionsBuilder.bgColor = 'bg-success';
                AssertionsBuilder.txtColor = 'text-white';
                break;
            default:
                AssertionsBuilder.bgColor = 'bg-success';
                AssertionsBuilder.txtColor = 'text-white';
        }
    }

    /**
     * buildHtml
     *
     * @description
     *      Builds the html for the assertions in the AssertionsBuilder instance.
     *      It loops through all assertions in the assertions array and creates a div for each one.
     *      The div contains the year of the assertion, a span indicating whether the assertion applies to the currently selected calendar, the assert property of the assertion (which is an AssertType), and the expected value of the assertion.
     *      The assert property and the expected value are each in a div that can be clicked to toggle the assert property between AssertType.EventNotExists and AssertType.EventTypeExact, and to edit the expected value respectively.
     *      The div also contains a span with the assertion (which is editable) and a span with the comment (if any) for the assertion.
     *      The div is styled with a background color and text color based on the assert property of the assertion.
     *      The method returns the built html as a DocumentFragment.
     *
     * @returns {DocumentFragment} the built html as a DocumentFragment
     */
    buildHtml() {
        console.log('building html for AssertionsBuilder with test = ', AssertionsBuilder.test);
        const fragment = document.createDocumentFragment();
        const dateFormatter = AssertionsBuilder.getDateFormatter();

        this.assertions.forEach( (assertion, idy) => {
            AssertionsBuilder.#setColors( assertion );
            let eventDate = null;
            let expectedDateStr = '---';
            if (assertion.expected_value) {
                const parsed = new Date(assertion.expected_value);
                if (!isNaN(parsed.getTime())) {
                    eventDate = parsed;
                    expectedDateStr = dateFormatter.format(eventDate);
                }
            }
            let sundayCheck = '';
            if(eventDate !== null && AssertionsBuilder.test && AssertionsBuilder.test.grade <= LitGrade.FEAST && AssertionsBuilder.test.month != null && AssertionsBuilder.test.day != null) {
                if( eventDate.getUTCDay() === 0 ) {
                    sundayCheck = 'bg-warning text-dark';
                }
            }
            const editDateDisabled = (assertion.expected_value === null || eventDate === null);

            // Build container div
            const container = document.createElement('div');
            container.className = `d-flex flex-column col-2 border${idy===0 || idy % 5 === 0 ? ' offset-1' : ''}`;

            // Year paragraph
            const yearP = document.createElement('p');
            yearP.className = 'text-center mb-0 fw-bold testYear';
            yearP.textContent = assertion.year;
            container.appendChild(yearP);

            // Applies to paragraph
            const appliesP = document.createElement('p');
            appliesP.className = 'text-center mb-0 bg-secondary text-white';
            const appliesLabel = document.createElement('span');
            appliesLabel.className = 'me-2 fw-bold text-center';
            appliesLabel.textContent = 'Applies to: ';
            const appliesValue = document.createElement('span');
            appliesValue.textContent = AssertionsBuilder.appliesTo;
            appliesP.appendChild(appliesLabel);
            appliesP.appendChild(appliesValue);
            container.appendChild(appliesP);

            // Assert that div
            const assertDiv = document.createElement('div');
            assertDiv.className = `d-flex justify-content-between align-items-center ps-2 pe-1 border-bottom ${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}`;
            assertDiv.style.minHeight = '3em';
            const assertLabel = document.createElement('span');
            assertLabel.className = 'me-2 fw-bold w-25';
            assertLabel.textContent = 'ASSERT THAT: ';
            const assertValue = document.createElement('span');
            assertValue.className = 'ms-2 text-end assert';
            assertValue.textContent = assertion.assert;
            const toggleBtn = document.createElement('span');
            toggleBtn.setAttribute('role', 'button');
            toggleBtn.className = 'btn btn-xs btn-danger ms-1 toggleAssert';
            const toggleIcon = document.createElement('i');
            toggleIcon.className = 'fas fa-repeat';
            toggleIcon.setAttribute('aria-hidden', 'true');
            toggleBtn.appendChild(toggleIcon);
            assertDiv.appendChild(assertLabel);
            assertDiv.appendChild(assertValue);
            assertDiv.appendChild(toggleBtn);
            container.appendChild(assertDiv);

            // Expected value div
            const expectDiv = document.createElement('div');
            const expectDivClass = sundayCheck !== '' ? sundayCheck : `${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}`;
            expectDiv.className = `d-flex justify-content-between align-items-center ps-2 pe-1 ${expectDivClass}`;
            expectDiv.style.minHeight = '3em';
            const expectLabel = document.createElement('span');
            expectLabel.className = 'me-2 fw-bold w-25';
            expectLabel.textContent = 'EXPECT VALUE: ';
            const expectValue = document.createElement('span');
            expectValue.className = 'ms-2 expectedValue';
            expectValue.setAttribute('data-value', assertion.expected_value ?? '');
            expectValue.textContent = expectedDateStr;
            const editBtn = document.createElement('span');
            editBtn.setAttribute('role', 'button');
            editBtn.className = `btn btn-xs ms-1 editDate${editDateDisabled ? ' btn-secondary disabled' : ' btn-danger'}`;
            const editIcon = document.createElement('i');
            editIcon.className = 'fas fa-pen-to-square';
            editIcon.setAttribute('aria-hidden', 'true');
            editBtn.appendChild(editIcon);
            expectDiv.appendChild(expectLabel);
            expectDiv.appendChild(expectValue);
            expectDiv.appendChild(editBtn);
            container.appendChild(expectDiv);

            // Assertion div
            const assertionDiv = document.createElement('div');
            assertionDiv.className = 'flex-grow-1 d-flex flex-column text-white p-3';
            assertionDiv.style.backgroundColor = 'cadetblue';
            const assertionLabel = document.createElement('span');
            assertionLabel.className = 'fw-bold';
            assertionLabel.textContent = 'ASSERTION:';
            assertionLabel.appendChild(createCommentIcon(assertion.hasOwnProperty('comment'), assertion?.comment));
            const assertionText = document.createElement('span');
            assertionText.setAttribute('contenteditable', 'plaintext-only');
            assertionText.textContent = assertion.assertion;
            assertionDiv.appendChild(assertionLabel);
            assertionDiv.appendChild(assertionText);
            container.appendChild(assertionDiv);

            fragment.appendChild(container);
        });

        return fragment;
    }
}
