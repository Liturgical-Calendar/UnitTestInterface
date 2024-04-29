
$(document).on('click', '.sidebarToggle', event => {
    event.preventDefault();
    if(document.body.classList.contains('sb-sidenav-collapsed') ) {
        $('.sidebarToggle i').removeClass('fa-angle-right').addClass('fa-angle-left');
    }
    else {
        $('.sidebarToggle i').removeClass('fa-angle-left').addClass('fa-angle-right');
    }
    document.body.classList.toggle('sb-sidenav-collapsed');
});
