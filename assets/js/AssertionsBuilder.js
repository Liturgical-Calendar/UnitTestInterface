/**
 * Enum-like constant that represents the different types of assertions for liturgical events tests.
 * @readonly
 */
const TestType = Object.freeze({
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
const AssertType = Object.freeze({
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
const LitGrade = Object.freeze({
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
 * Class AssertionsBuilder
 *
 * @description
 * This class is responsible for managing the interaction with the user when a new Unit Test is created.
 * It will build the HTML for the form that will allow the user to build the assertions for the Unit Test.
 */
class AssertionsBuilder {
    // set some default initial values
    static testType     = TestType.ExactCorrespondence;
    static yearSince    = null; // only useful in case of TestType.ExactCorrespondenceSince
    static appliesTo    = "Universal Roman Calendar";
    static bgColor      = 'bg-success';
    static txtColor     = 'text-dark';
    static currentTest  = null;


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
        AssertionsBuilder.test = litcal_events.filter(el => el.event_key === test.event_key)[0] ?? null;
        console.log('new instance of AssertionsBuilder, test = ', AssertionsBuilder.test);
        console.log('litcal_events = ', litcal_events);
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
        let assertionBuildStr = '';
        const dateFormatter = new Intl.DateTimeFormat(locale || navigator.language, { dateStyle: 'medium', timeZone: 'UTC' });
        //console.log(this.assertions);
        this.assertions.forEach( (assertion, idy) => {
            AssertionsBuilder.#setColors( assertion );
            //console.log(assertion);
            let eventDate = null;
            let expectedDateStr = '---';
            if (assertion.expected_value) {
                const parsed = new Date(assertion.expected_value);
                if (!isNaN(parsed.getTime())) {
                    eventDate = parsed;
                    expectedDateStr = dateFormatter.format(eventDate);
                }
            }
            const commentStr = commentIcon( assertion.hasOwnProperty('comment'), assertion?.comment);
            let sundayCheck = '';
            if(eventDate !== null && AssertionsBuilder.test.grade <= LitGrade.FEAST && AssertionsBuilder.test.month && AssertionsBuilder.test.day) {
                if( eventDate.getUTCDay() === 0 ) {
                    //console.log('this day is a Sunday!');
                    sundayCheck = 'bg-warning text-dark';
                }
            }
            const editDateDisabled = assertion.expected_value === null ? ' disabled' : '';
            assertionBuildStr += `<div class="d-flex flex-column col-2 border${idy===0 || idy % 5 === 0 ? ' offset-1' : ''}">
                <p class="text-center mb-0 fw-bold testYear">${assertion.year}</p>
                <p class="text-center mb-0 bg-secondary text-white"><span class="me-2 fw-bold text-center">Applies to: </span><span>${AssertionsBuilder.appliesTo}</span></p>
                <div class="d-flex justify-content-between align-items-center ps-2 pe-1 border-bottom ${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}" style="min-height:3em;"><span class="me-2 fw-bold w-25">ASSERT THAT: </span><span class="ms-2 text-end assert">${assertion.assert}</span><span role="button" class="btn btn-xs btn-danger ms-1 toggleAssert"><i class="fas fa-repeat" aria-hidden="true"></i></span></div>
                <div class="d-flex justify-content-between align-items-center ps-2 pe-1 ${sundayCheck !== '' ? sundayCheck : AssertionsBuilder.bgColor + ' ' + AssertionsBuilder.txtColor}" style="min-height:3em;"><span class="me-2 fw-bold w-25">EXPECT VALUE: </span><span class="ms-2 expectedValue" data-value="${assertion.expected_value}">${expectedDateStr}</span><span role="button" class="btn btn-xs ms-1 editDate${editDateDisabled ? ' btn-secondary' : ' btn-danger'}"><i class="fas fa-pen-to-square" aria-hidden="true"></i></span></div>
                <div class="flex-grow-1 d-flex flex-column text-white p-3" style="background-color: cadetblue;"><span class="fw-bold">ASSERTION:${commentStr}</span><span contenteditable="plaintext-only">${assertion.assertion}</span></div>
                </div>`;
        });
        const template = document.createElement('template');
        template.innerHTML = assertionBuildStr;
        return template.content;
    }
}

/**
 * commentIcon
 *
 * @description
 *      Creates a comment icon depending on whether there is a comment or not.
 *      If there is a comment, it creates a button with a comment icon and the comment as title.
 *      If there is no comment, it creates a button with a comment-medical icon and 'add a comment' as title.
 *      The button is meant to be used as a toggle to show the modal for adding or editing a comment.
 *
 * @param {boolean} hasComment - whether there is a comment or not
 * @param {string} [value=null] - the comment value, if any
 * @returns {string} the comment icon as a string of html
 */
const commentIcon = (hasComment, value = null) => {
    return hasComment
    /*? `<i title="${value}" class="fas fa-comment-dots fa-fw mb-1 btn btn-xs btn-dark float-end comment" role="button" data-bs-toggle="modal" data-bs-target="#modalAddEditComment"></i>`
    : ' <i title="add a comment" class="fas fa-comment-medical fa-fw mb-1 btn btn-xs btn-secondary float-end comment" role="button" data-bs-toggle="modal" data-bs-target="#modalAddEditComment"></i>'*/
    ? ` <span title="${value}" class="mb-1 btn btn-xs btn-dark float-end comment" role="button" data-bs-toggle="modal" data-bs-target="#modalAddEditComment"><i class="fas fa-comment-dots fa-fw" aria-hidden="true"></i></span>`
    : ' <span title="add a comment" class="mb-1 btn btn-xs btn-secondary float-end comment" role="button" data-bs-toggle="modal" data-bs-target="#modalAddEditComment"><i class="fas fa-comment-medical fa-fw" aria-hidden="true"></i></span>';
}
