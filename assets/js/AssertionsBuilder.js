
const TestType = Object.freeze({
    ExactCorrespondence:        'exactCorrespondence',
    ExactCorrespondenceSince:   'exactCorrespondenceSince',
    VariableCorrespondence:     'variableCorrespondence'
});

class AssertionsBuilder {
    static testType     = TestType.ExactCorrespondence;
    static yearSince    = 2018; // only useful in case of TestType.ExactCorrespondenceSince
    static bgColor      = 'bg-success';
    static txtColor     = 'text-dark';

    constructor( test ) {
        this.assertions = test.assertions;
        AssertionsBuilder.testType = test.testType;
        console.log( 'new instance of AssertionsBuilder, testType = ' + AssertionsBuilder.testType );
    }

    static #setColors( assertion ) {
        if( AssertionsBuilder.testType === TestType.ExactCorrespondenceSince ) {
            if( assertion.year < AssertionsBuilder.yearSince ) {
                AssertionsBuilder.bgColor = 'bg-warning';
                AssertionsBuilder.txtColor = 'text-dark';
            } else {
                AssertionsBuilder.bgColor = 'bg-success';
                AssertionsBuilder.txtColor = 'text-white';
            }
        }
    }

    build() {
        let assertionBuildStr = '';
        this.assertions.forEach( (assertion, idy) => {
            AssertionsBuilder.#setColors( assertion );
            const expectedDateStr = assertion.expectedValue !== null ? DTFormat.format(assertion.expectedValue * 1000) : '---';
            assertionBuildStr += `<div class="col-2 border${idy===0 || idy % 5 === 0 ? ' offset-1' : ''}">
                <p class="text-center mb-0 fw-bold">${assertion.year}</p>
                <p class="text-center mb-0 bg-secondary text-white"><span class="me-2 fw-bold text-center">Applies to: </span><span>Universal Roman Calendar</span></p>
                <div class="d-flex justify-content-between align-items-center ps-2 pe-2 border-bottom ${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}" style="min-height:3em;"><span class="me-2 fw-bold w-25">ASSERT THAT: </span><span class="ms-2 text-end assert">${assertion.assert}</span></div>
                <div class="d-flex justify-content-between align-items-center ps-2 pe-2 ${AssertionsBuilder.bgColor} ${AssertionsBuilder.txtColor}" style="min-height:3em;"><span class="me-2 fw-bold w-25">EXPECT VALUE: </span><span class="ms-2 expectedValue">${expectedDateStr}</span></div>
                <div class="card text-white bg-info rounded-0">
                    <div class="card-body">
                        <div class="card-text d-flex flex-column justify-content-between"><span class="fw-bold"><i class="fas fa-circle-question fa-fw me-2"></i> ASSERTION:</span>${assertion.assertion}</div>
                    </div>
                </div>
            </div>`;
        });
        return $.parseHTML( assertionBuildStr );
    }
}
