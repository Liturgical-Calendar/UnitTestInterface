let currentTest = null;

const DTFormat = new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    //timeStyle: 'long',
    timeZone: 'UTC'
  });

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
        $('#testType').val( currentTest.testType ).change();
        $('#description').attr('rows', 2);
        $('#description').val( currentTest.description );
        $('#description').attr('rows', Math.ceil( $('#description')[0].scrollHeight / 30 ));
        $( '#assertionsContainer' ).empty();
        const assertionsBuilder = new AssertionsBuilder( currentTest );
        const assertionBuildHtml = assertionsBuilder.buildHtml();
        $( assertionBuildHtml ).appendTo( '#assertionsContainer' );
    } else {
        currentTest = null;
    }
});

let $iso = null;

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
        if( null === $iso ) {
            $iso = $('#yearsToTestGrid').isotope({
                layoutMode: 'fitRows'
            });
        }
    }
    if( ev.to === 2 ) {
        let firstYear = document.querySelector('#lowerRange').value;
        console.log('firstYear = ' + firstYear);
        document.querySelector('#baseDate').value = firstYear + '-01-01';
        document.querySelector('#btnCreateTest').removeAttribute('disabled');
    }
});

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
    }
});

$(document).on('click', '#yearsToTestGrid > .testYearSpan > svg', ev => {
    const parnt = ev.currentTarget.parentElement;
    $(parnt).fadeOut('slow', () => {
        //parnt.remove();
        $(parnt).empty();
        parnt.classList.add('deleted');
        $(parnt).fadeIn('fast', () => {
            $('#yearsToTestGrid').isotope('layout');
        });
    });
});

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
    $iso = $('#yearsToTestGrid').isotope({
        layoutMode: 'fitRows'
    });
});
