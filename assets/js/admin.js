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
        $('#description').val( currentTest.description );
        const assertionsBuilder = new AssertionsBuilder( currentTest );
        const assertionBuildHtml = assertionsBuilder.build();
        $( assertionBuildHtml ).appendTo( '#assertionsContainer' );
    } else {
        currentTest = null;
    }
});

