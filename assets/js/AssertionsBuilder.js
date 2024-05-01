
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

class AssertionsBuilder {
    // set some default initial values
    static testType     = TestType.ExactCorrespondence;
    static yearSince    = null; // only useful in case of TestType.ExactCorrespondenceSince
    static bgColor      = 'bg-success';
    static txtColor     = 'text-dark';

    constructor( test ) {
        this.assertions = test.assertions;
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
        this.assertions.forEach( (assertion, idy) => {
            AssertionsBuilder.#setColors( assertion );
            const expectedDateStr = assertion.expectedValue !== null ? DTFormat.format(assertion.expectedValue * 1000) : '---';
            const commentStr = assertion.hasOwnProperty('comment') ? ` <i class="fas fa-circle-question fa-fw me-2" title="${assertion.comment}"></i>` : '';
            assertionBuildStr += `<div class="col-2 border${idy===0 || idy % 5 === 0 ? ' offset-1' : ''}">
                <p class="text-center mb-0 fw-bold">${assertion.year}</p>
                <p class="text-center mb-0 bg-secondary text-white"><span class="me-2 fw-bold text-center">Applies to: </span><span>Universal Roman Calendar</span></p>
                <div class="d-flex justify-content-between align-items-center ps-2 pe-2 border-bottom ${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}" style="min-height:3em;"><span class="me-2 fw-bold w-25">ASSERT THAT: </span><span class="ms-2 text-end assert">${assertion.assert}</span></div>
                <div class="d-flex justify-content-between align-items-center ps-2 pe-2 ${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}" style="min-height:3em;"><span class="me-2 fw-bold w-25">EXPECT VALUE: </span><span class="ms-2 expectedValue">${expectedDateStr}</span></div>
                <div class="card text-white bg-info rounded-0">
                    <div class="card-body">
                        <div class="card-text d-flex flex-column justify-content-between"><span class="fw-bold">ASSERTION:${commentStr}</span>${assertion.assertion}</div>
                    </div>
                </div>
            </div>`;
        });
        return $.parseHTML( assertionBuildStr );
    }
}
