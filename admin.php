<?php
error_reporting(E_ALL);
ini_set("display_errors", 1);

include_once("credentials.php");

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

include_once('layout/head.php');
include_once('layout/topnavbar.php');
include_once('layout/sidebar.php');
?>
<!-- Main Content -->
<main class="pb-5">
    <div class="container-fluid px-4">

        <!-- Page Heading -->
        <h1 class="h3 mb-2 text-black" style="--bs-text-opacity: .6;"><?php echo _( "Define a Unit Test for a Liturgical event"); ?></h1>
        <p class="mb-1 lh-sm"><small><i>In order to verify that the liturgical calendar data produced by the API is actually producing correct data, we can create Unit Tests that allow us to verify that events were / were not created in the calendar, or that they have expected dates from year to year.</i></small></p>
            <div class="row justify-content-center align-items-end">
                <div class="form-group col col-md-3">
                    <label for="litCalTestsSelect" class="fw-bold"><?php echo _( "Edit an existing test"); ?></label>
                    <select id="litCalTestsSelect" class="form-select">
                        <option value="" selected>--</option>
                        <?php foreach( $LitCalTests as $LitCalTest ) {
                            echo "<option value=\"$LitCalTest->name\">$LitCalTest->name</option>";
                        } ?>
                    </select>
                </div>
                <div class="form-group col col-md-2">
                    <label class="fw-bold"><?php echo _( "Create new test " ); ?></label>
                    <button type="button" class="btn btn-primary form-control" title="<?php echo _( "Create new test " ); ?>"><b>+</b></button>
                </div>
            </div>

            <div class="card border-4 border-top-0 border-bottom-0 border-end-0 border-primary rounded-3 m-4">
                <div class="card-header py-3">
                    <h4 class="m-0 fw-bold text-primary"><i class="fas fa-flask-vial fa-2x text-black d-inline-block me-4" style="--bs-text-opacity: .1;"></i><span id="testName">Name of Test</span></h4>
                </div>
                <div class="card-body">
                    <hr>
                    <form class="needs-validation regionalNationalDataForm" id="widerRegionForm" novalidate>
                        <div class="row justify-content-center align-items-start">
                            <!-- TestType -->
                            <div class="mb-3 form-group col col-md-3">
                                <label for="testType" class="form-label">Test Type</label>
                                <select class="form-select" id="testType" name="testType" disabled>
                                    <option value="exactCorrespondence">exactCorrespondence</option>
                                    <option value="exactCorrespondenceSince">exactCorrespondenceSince</option>
                                    <option value="variableCorrespondence">variableCorrespondence</option>
                                </select>
                            </div>
                            <!-- Description -->
                            <div class="mb-3 form-group col col-md-9">
                                <label for="description" class="form-label">Description</label>
                                <textarea class="form-control" id="description" name="description" rows="2" required></textarea>
                            </div>
                        </div>
                        <!-- Assertions (Dynamic Fields) -->
                        <div class="row g-0 m-2" id="assertionsContainer">
                        </div>
                    </form>
                </div>
                <div class="card-footer text-center">
                    <button class="btn btn-lg btn-primary m-2" id="serializeUnitTestData" disabled><i class="fas fa-save me-2"></i><?php echo _("Save Unit Test") ?></button>
                </div>
            </div>


        <pre>
            <?php echo $response; ?>
        </pre>

    </div>
    <!-- /.container-fluid -->

</main>
<!-- End of Main Content -->
<?php 
echo "<script>const LitCalTests = $response;</script>";
include_once( 'layout/footer.php' );
?>
