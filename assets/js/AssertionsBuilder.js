
const TestType = Object.freeze({
    ExactCorrespondence:        'exactCorrespondence',
    ExactCorrespondenceSince:   'exactCorrespondenceSince',
    ExactCorrespondenceUntil:   'exactCorrespondenceUntil',
    VariableCorrespondence:     'variableCorrespondence'
});

const AssertType = Object.freeze({
    EventNotExists:             'eventNotExists',
    EventTypeExact:             'eventExists AND hasExpectedTimestamp'
});

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


class AssertionsBuilder {
    // set some default initial values
    static testType     = TestType.ExactCorrespondence;
    static yearSince    = null; // only useful in case of TestType.ExactCorrespondenceSince
    static bgColor      = 'bg-success';
    static txtColor     = 'text-dark';


    constructor( test ) {
        this.assertions = test.assertions.map(el => new Assertion(el));
        AssertionsBuilder.testType = test.testType;
        if( test.testType === TestType.ExactCorrespondenceSince ) {
            AssertionsBuilder.yearSince = test.yearSince;
        }
        console.log( 'new instance of AssertionsBuilder, testType = ' + AssertionsBuilder.testType );
    }

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

    buildHtml() {
        let assertionBuildStr = '';
        //console.log(this.assertions);
        this.assertions.forEach( (assertion, idy) => {
            AssertionsBuilder.#setColors( assertion );
            //console.log(assertion);
            const expectedDateStr = assertion.expectedValue !== null ? DTFormat.format(assertion.expectedValue * 1000) : '---';
            const commentStr = commentIcon( assertion.hasOwnProperty('comment'), assertion?.comment);
            //unfortunately Firefox does not implement the "plaintext-only" value for [contenteditable], so we won't use it yet
            assertionBuildStr += `<div class="d-flex flex-column col-2 border${idy===0 || idy % 5 === 0 ? ' offset-1' : ''}">
                <p class="text-center mb-0 fw-bold testYear">${assertion.year}</p>
                <p class="text-center mb-0 bg-secondary text-white"><span class="me-2 fw-bold text-center">Applies to: </span><span>Universal Roman Calendar</span></p>
                <div class="d-flex justify-content-between align-items-center ps-2 pe-1 border-bottom ${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}" style="min-height:3em;"><span class="me-2 fw-bold w-25">ASSERT THAT: </span><span class="ms-2 text-end assert">${assertion.assert}</span><span role="button" class="btn btn-xs btn-danger ms-1 toggleAssert"><i class="fas fa-repeat"></i></span></div>
                <div class="d-flex justify-content-between align-items-center ps-2 pe-2 ${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}" style="min-height:3em;"><span class="me-2 fw-bold w-25">EXPECT VALUE: </span><span class="ms-2 expectedValue">${expectedDateStr}</span></div>
                <div class="flex-grow-1 d-flex flex-column text-white p-3" style="background-color: cadetblue;"><span class="fw-bold">ASSERTION:${commentStr}</span><span contenteditable>${assertion.assertion}</span></div>
                </div>`;
        });
        return $.parseHTML( assertionBuildStr );
    }
}

const commentIcon = (hasComment, value = null) => {
    return hasComment
    ? ` <span title="${value}" class="mb-1 btn btn-xs btn-dark float-end" role="button" data-bs-toggle="modal" data-bs-target="#modalAddEditComment"><i class="fas fa-comment-dots fa-fw"></i></span>`
    : ' <span title="add a comment" class="mb-1 btn btn-xs btn-secondary float-end" role="button" data-bs-toggle="modal" data-bs-target="#modalAddEditComment"><i class="fas fa-comment-medical fa-fw"></i></span>';
}
