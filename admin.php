<?php

include_once("credentials.php");
include_once("./includes/i18n.php");

function authenticated() {
    if ( !isset($_SERVER['PHP_AUTH_USER']) || !isset($_SERVER['PHP_AUTH_PW']) ) return false;
    if ($_SERVER['PHP_AUTH_USER'] === AUTH_USERNAME && password_verify($_SERVER['PHP_AUTH_PW'], AUTH_PASSWORD)) return true;
    return false;
}

if(!authenticated()) {
    header("WWW-Authenticate: Basic realm=\"Please insert your credentials\"");
    header($_SERVER["SERVER_PROTOCOL"]." 401 Unauthorized");
    echo "You need a username and password to access this service.";
    die();
}


$langsAvailable = ['en', ...array_map('basename', glob("i18n/*", GLOB_ONLYDIR))];
$langsAssoc = [];
foreach( $langsAvailable as $lang ) {
    $langsAssoc[$lang] = Locale::getDisplayLanguage($lang, $i18n->LOCALE);
}
asort($langsAssoc);

$ch = curl_init();

curl_setopt( $ch, CURLOPT_URL, "https://litcal.johnromanodorazio.com/api/dev/LitCalTestsIndex.php" );
curl_setopt( $ch, CURLOPT_RETURNTRANSFER, true );
$response = curl_exec( $ch );
if ( curl_errno( $ch ) ) {
    $error_msg = curl_error( $ch );
    curl_close( $ch );
    die( $error_msg );
}
curl_close( $ch );
$LitCalTests = json_decode( $response );


?><!DOCTYPE html>
<html lang="<?php echo $i18n->LOCALE; ?>">
<head>
    <title>Administration tools</title>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <link rel="icon" type="image/x-icon" href="favicon.ico">

    <!-- Custom fonts for this template-->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.2.1/css/all.min.css" rel="stylesheet" type="text/css">

    <!-- Custom styles for this template-->
    <link href="https://cdn.jsdelivr.net/npm/startbootstrap-sb-admin@7.0.5/dist/css/styles.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-multiselect/1.1.1/css/bootstrap-multiselect.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.css" rel="stylesheet">
    <link href="css/admin.css" rel="stylesheet">

</head>
<body class="sb-nav-fixed">
    <!-- Topbar -->
    <nav class="sb-topnav navbar navbar-expand navbar-light bg-white shadow">
        <!-- Navbar Brand -->
        <a class="navbar-brand ps-3" href="./admin.php">Navbar</a>
        <!-- Sidebar Toggle (Topbar) -->
        <button class="btn btn-link btn-sm order-1 order-lg-0 me-4 me-lg-0" id="sidebarToggle"><i class="fas fa-bars"></i></button>

        <!-- Topbar Navbar -->
        <ul class="navbar-nav ms-auto ms-md-0 me-3 me-lg-4">
            <li class="nav-item ms-2 active" id="topNavBar_API"><a class="nav-link btn btn-outline-light border-0 fw-bold" href="./admin.php"><?php echo _( "Unit Tests Admin" ); ?></a></li>
        </ul>
        <ul class="navbar-nav ms-auto">
            <li class="nav-item dropdown">
                <!-- this should contain the value of the currently selected language, based on a cookie -->
                <a class="nav-link dropdown-toggle btn btn-outline-light border-0" href="#" id="langChoicesDropdown" role="button" data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                    <?php echo Locale::getDisplayLanguage($i18n->LOCALE, $i18n->LOCALE); ?>
                </a>
                <div class="dropdown-menu dropdown-menu-end shadow animated--grow-in" aria-labelledby="langChoicesDropdown" id="langChoicesDropdownItems">
                    <?php
                        foreach( $langsAssoc as $key => $lang ) {
                            $classList = substr( $i18n->LOCALE, 0, 2 ) === $key ? "dropdown-item active" : "dropdown-item";
                            $isoLang = strtoupper( $key );
                            $displayName = Locale::getDisplayLanguage( $key, 'en');
                            echo "<a class=\"$classList\" id=\"langChoice-$key\" href=\"#\" title=\"$displayName\"><span class=\"d-none d-md-inline\">$lang</span><span class=\"d-inline d-md-none\">$isoLang</span></a>";
                        }
                    ?>
                </div>
            </li>
        </ul>
        <a class="btn btn-outline-light text-dark border-0 me-2"
            href="https://github.com/Liturgical-Calendar/UnitTestInterface" target="_blank"
            title="See the Github repository">
            <i class="fab fa-github"></i>
        </a>
    </nav>


    <!-- Page Wrapper -->
    <div id="layoutSidenav">

        <div id="layoutSidenav_nav">

            <!-- Sidebar -->
            <nav class="sb-sidenav accordion sb-sidenav-dark bg-gradient" id="accordionSidebar">
                <div class="sb-sidenav-menu">
                    <div class="nav">
                        <!-- Sidebar - Brand -->
                        <div class="text-center lh-2 px-5 pt-2 sidebar-brand">
                            <a class="text-uppercase fs-6 fw-bold text-white text-decoration-none" href="/admin.php">
                                <?php echo _( "Catholic Liturgical Calendar" ); ?>
                            </a>
                        </div>
                        <!-- <hr> -->
                        <a class="nav-link active" href="/">
                            <i class="sb-nav-link-icon fas fa-fw fa-cross"></i>
                            <span><?php echo _( "Unit Tests Admin" ); ?></span>
                        </a>
                    </div>
                </div>
                <div class="sb-sidenav-footer">
                    <!-- Sidebar Toggler (Sidebar) -->
                    <div class="text-center">
                        <button type="button" class="btn btn-secondary rounded-circle border-0 sidebarToggle" id="sidebarToggleB"><i class="fas fa-angle-left"></i></button>
                    </div>
                </div>

            </nav>
        </div>
        <!-- End of Sidebar (layoutSidenav_nav) -->

        <!-- Content Wrapper -->
        <div id="layoutSidenav_content" class="pt-4">

            <!-- Main Content -->
            <main>
                <div class="container-fluid px-4">

                    <!-- Page Heading -->
                    <h1 class="h3 mb-2 text-black" style="--bs-text-opacity: .6;"><?php echo _( "Define a Unit Test for a Liturgical event"); ?></h1>
                    <p class="mb-1 lh-sm"><small><i>In order to verify that the liturgical calendar data produced by the API is actually producing correct data, we can create Unit Tests that allow us to verify that events were / were not created in the calendar, or that they have expected dates from year to year.</i></small></p>
                    <p>Type of $LitCalTests = <?php gettype( $LitCalTests ); ?></p>
                    <pre>
                        <?php echo $response; ?>
                    </pre>

                </div>
                <!-- /.container-fluid -->

            </main>
            <!-- End of Main Content -->

            <footer class="fixed-bottom p-3 bg-white">
                <div class="container my-auto">
                    <div class="copyright text-center my-auto">
                        <span>Copyright &copy; John D'Orazio 2020</span>
                    </div>
                </div>
            </footer>

        </div>
        <!-- End of Content Wrapper -->

    </div>
    <!-- End of Page Wrapper -->

    <!-- jQuery-->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-easing/1.4.1/jquery.easing.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/js-cookie/2.2.1/js.cookie.min.js"></script>

    <!-- Bootstrap / sb-admin JavaScript-->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.2.3/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/startbootstrap-sb-admin@7.0.5/dist/js/scripts.js"></script>

    <!-- i18next -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/i18next/21.6.6/i18next.min.js" integrity="sha512-3CUvxyR4WtlZanN/KmorrZ2VALnUndAQBYjf1HEYNa6McBY+G2zYq4gOZPUDkDtuk3uBdQIva0Lk89hYQ9fQrA==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-i18next/1.2.1/jquery-i18next.min.js" integrity="sha512-79RgNpOyaf8AvNEUdanuk1x6g53UPoB6Fh2uogMkOMGADBG6B0DCzxc+dDktXkVPg2rlxGvPeAFKoZxTycVooQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
    <script src="https://cdn.jsdelivr.net/npm/i18next-http-backend@1.3.1/i18nextHttpBackend.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-multiselect/1.1.2/js/bootstrap-multiselect.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js"></script>
    <script src="js/admin.js"></script>
</body>
</html>
