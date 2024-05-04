
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

let currentTest = null;


/**
 * LOAD METADATA FOR EXISTING CALENDARS
 */
const endpointV = 'dev'; // 'v3';
const METADATA_URL = `https://litcal.johnromanodorazio.com/api/${endpointV}/LitCalMetadata.php`;
const COUNTRY_NAMES = new Intl.DisplayNames([locale], {type: 'region'});
let CalendarNations = [];
let SelectOptions = {};
//const COUNTRIES is available from Countries.js, included in footer.php for admin.php

fetch( METADATA_URL )
    .then(data => data.json())
    .then(jsonData => {
        const { LitCalMetadata } = jsonData;
        const { NationalCalendars, DiocesanCalendars } = LitCalMetadata;

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

$(document).on('change', '#litCalTestsSelect', ev => {
    //console.log(ev.currentTarget.value);
    if( ev.currentTarget.value !== '' ) {
        currentTest = LitCalTests.filter(el => el.name === ev.currentTarget.value)[0];
        $('#testName').text( currentTest.name );
        //$('#testType').val( currentTest.testType ).change();
        $('#cardHeaderTestType').text( currentTest.testType );
        $('#description').attr('rows', 1);
        $('#description').val( currentTest.description );
        $('#description').attr('rows', Math.ceil( $('#description')[0].scrollHeight / 40 ));
        $( '#assertionsContainer' ).empty();
        const assertionsBuilder = new AssertionsBuilder( currentTest );
        const assertionBuildHtml = assertionsBuilder.buildHtml();
        $( assertionBuildHtml ).appendTo( '#assertionsContainer' );
        document.querySelector('#perYearAssertions').classList.remove('invisible');
    } else {
        currentTest = null;
    }
});

$(document).on('click', '.toggleAssert', ev => {
    if(ev.currentTarget.parentElement.classList.contains('bg-warning')) {
        ev.currentTarget.previousSibling.innerText = 'eventExists AND hasExpectedTimestamp';
        ev.currentTarget.parentElement.classList.remove('bg-warning', 'text-dark');
        ev.currentTarget.parentElement.classList.add('bg-success', 'text-white');
        let $pNode = $(ev.currentTarget.parentNode);
        console.log($pNode);
        console.log($pNode.siblings('.testYear'));
        const year = $pNode.siblings('.testYear')[0].innerText;
        $pNode.next()[0].children[1].innerHTML = '';
        $pNode.next()[0].children[1].insertAdjacentHTML('beforeend', `<input type="date" value="${year}-01-01" onchange="let timestamp = Date.parse(this.value+'T00:00:00.000+00:00');const $grandpa=$(this).closest('div');$grandpa[0].classList.remove('bg-warning','text-dark');$grandpa[0].classList.add('bg-success','text-white');this.parentNode.innerText=DTFormat.format(timestamp);" />`);
    } else {
        ev.currentTarget.previousSibling.innerText = 'eventNotExists';
        ev.currentTarget.parentElement.classList.remove('bg-success', 'text-white');
        ev.currentTarget.parentElement.classList.add('bg-warning', 'text-dark');
        let $pNode = $(ev.currentTarget.parentNode);
        $pNode.next()[0].classList.remove('bg-success', 'text-white');
        $pNode.next()[0].classList.add('bg-warning', 'text-dark');
        $pNode.next()[0].children[1].innerText = '---';
    }
});

/**
 * DEFINE INTERACTIONS FOR CREATE NEW TEST MODAL
 */
let $isotopeYearsToTestGrid = null;

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
        if( null === $isotopeYearsToTestGrid ) {
            $isotopeYearsToTestGrid = $('#yearsToTestGrid').isotope({
                layoutMode: 'fitRows'
            });
        }
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
        let gradeStr = '';
        let onDateStr = 'the expected date';
        if( $existingOption[0].dataset.month && $existingOption[0].dataset.month !== '' && $existingOption[0].dataset.day && $existingOption[0].dataset.day !== '' ) {
            console.log(`month=${$existingOption[0].dataset.month},day=${$existingOption[0].dataset.day}`);
            const eventDate = new Date(Date.UTC(1970, Number($existingOption[0].dataset.month)-1, Number($existingOption[0].dataset.day), 0, 0, 0));
            onDateStr = MonthDayFmt.format(eventDate);
            //const dayWithSuffix = new OrdinalFormat(locale).withOrdinalSuffix(Number(dayName));
        }
        if( $existingOption[0].dataset.grade && $existingOption[0].dataset.grade !== '' ) {
            gradeStr = `The ${LitGrade.toString(Number($existingOption[0].dataset.grade) )} of `;
        }
        document.querySelector('#newExactCorrespondenceTestDescription').value = `${gradeStr}'${$existingOption.text()}' should fall on ${onDateStr}`;
    } else {
        ev.currentTarget.classList.add('is-invalid');
        ev.currentTarget.setCustomValidity('Please choose a value from the list');
    }
});

/** SLIDER 2 INTERACTIONS */

$(document).on('change', '#yearsToTestRangeSlider [type=range]', ev => {
    let rangeVals = [];
    document.querySelectorAll('#yearsToTestRangeSlider [type=range]').forEach(el => rangeVals.push(el.value));
    const min = Math.min(...rangeVals);
    const max = Math.max(...rangeVals);
    $('#yearsToTestGrid').isotope('destroy');
    $('#yearsToTestGrid').empty();
    let htmlStr = '';
    for( let i = min; i <= max; i++ ) {
        htmlStr += `<span class="testYearSpan">${i}<i class="fas fa-xmark-circle ms-1 opacity-50" role="button" title="remove"></i></span>`;
    }
    console.log(htmlStr);
    //$parsedHtml = $.parseHTML( htmlStr );
    //console.log($parsedHtml);
    document.querySelector('#yearsToTestGrid').insertAdjacentHTML('beforeend', htmlStr);
    $isotopeYearsToTestGrid = $('#yearsToTestGrid').isotope({
        layoutMode: 'fitRows'
    });
});

$(document).on('click', '#yearsToTestGrid > .testYearSpan > svg', ev => {
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
        //let's build our new currentTest
        currentTest = {};
        currentTest.name = document.querySelector('#existingFestivityName').value;
        currentTest.testType = 'exactCorrespondence';
        currentTest.description = document.querySelector('#newExactCorrespondenceTestDescription').value;
        const yearsChosenEls = document.querySelectorAll('.testYearSpan:not(.deleted)');
        const yearsChosen = Array.from(yearsChosenEls).map(el => parseInt($(el).contents().filter(function() {
            return this.nodeType === Node.TEXT_NODE;
          }).text()));
        //const baseDate = document.querySelector('#baseDate').valueAsDate;
        const baseDate = new Date(document.querySelector('#baseDate').value + 'T00:00:00.000+00:00');
        const baseDateMonth = ((baseDate.getMonth()+1) + '').padStart(2, '0');
        const baseDateDay = (baseDate.getDate() + '').padStart(2, '0');
        currentTest.assertions = [];
        yearsChosen.forEach(year => {
            const dateX = Date.parse(`${year}-${baseDateMonth}-${baseDateDay}T00:00:00.000+00:00`) / 1000;
            currentTest.assertions.push({
                "year": year,
                "assert": "eventExists AND hasExpectedTimestamp",
                "assertion": currentTest.description,
                "expectedValue": dateX
            });
        });
        $('#testName').text( currentTest.name );
        //$('#testType').val( currentTest.testType ).change();
        $('#cardHeaderTestType').text( currentTest.testType );
        $('#description').attr('rows', 2);
        $('#description').val( currentTest.description );
        $('#description').attr('rows', Math.ceil( $('#description')[0].scrollHeight / 30 ));
        $('#assertionsContainer').empty();
        const assertionsBuilder = new AssertionsBuilder( currentTest );
        const assertionBuildHtml = assertionsBuilder.buildHtml();
        $(assertionBuildHtml).appendTo('#assertionsContainer');
        document.querySelector('#perYearAssertions').classList.remove('invisible');
        const myModalEl = document.querySelector('#modalExactCorrespondenceType');
        const myModal = bootstrap.Modal.getInstance(myModalEl);
        myModal.hide();
    }
});
