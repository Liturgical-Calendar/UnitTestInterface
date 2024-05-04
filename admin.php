<?php
error_reporting(E_ALL);
ini_set("display_errors", 1);

include_once( 'includes/auth.php' );

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
include_once('layout/sidebar.php');
?>
<!-- Main Content -->
<main class="pb-5">
    <div class="container-fluid px-4">

        <!-- Page Heading -->
        <h1 class="h3 mb-2 text-black" style="--bs-text-opacity: .6;"><?php echo _( "Define a Unit Test for a Liturgical event"); ?></h1>
        <p class="mb-1 lh-sm"><small><i><?php echo _("In order to verify that the liturgical calendar data produced by the API is actually producing correct data, we can create Unit Tests that allow us to verify that events were / were not created in the calendar, or that they have expected dates from year to year."); ?></i></small></p>
        <div class="row justify-content-center align-items-start bg-light border p-2">
            <div class="form-group col col-md-2" id="editExistingTestOption">
                <label for="litCalTestsSelect" class="fw-bold border border-top-0 border-start-0 border-end-0 border-secondary mb-4 w-100 text-center"><?php echo _( "Edit an existing test"); ?></label>
                <select id="litCalTestsSelect" class="form-select">
                    <option value="" selected>--</option>
                    <?php foreach( $LitCalTests as $LitCalTest ) {
                        echo "<option value=\"$LitCalTest->name\">$LitCalTest->name</option>";
                    } ?>
                </select>
            </div>
            <div class="col col-md-10">
                <label class="w-100 text-center fw-bold border border-top-0 border-start-0 border-end-0 border-secondary"><?php echo _( 'Create a New Test' ); ?></label>
                <div class="row justify-content-center align-items-start">
                    <div class="form-group col col-md-3 border border-top-0 border-bottom-0 border-end-0 border-secondary">
                        <label for="APICalendarSelect"><?php echo _( 'Calendar to test' ); ?></label>
                        <select id="APICalendarSelect" class="form-select">
                        </select>
                    </div>
                    <div class="form-group col col-md-9">
                        <label><?php echo _( "Test Type" ); ?></label>
                        <div class="btn-group form-control p-0 border-0" role="group">
                            <button type="button" class="btn btn-primary col col-md-3" data-testtype="exactCorrespondence" data-bs-toggle="modal" data-bs-target="#modalExactCorrespondenceType"
                                title="<?php echo "In the span of years for which we are making an assertion, we assert that the liturgical event should exist, and should fall on an expected date (date can optionally be defined differently for each given year)"; ?>"><b><i class="fas fa-vial me-2"></i> <?php echo _( "Exact date" ); ?></b></button>
                            <button type="button" class="btn btn-primary col col-md-4" data-testtype="exactCorrespondenceSince"
                                title="<?php echo "When a liturgical event should only exist after a certain year, we assert that for a certain span of years before such year the liturgical event should not exist, while for a certain span of years after such year the liturgical event should exist and should fall on an expected date (date can optionally be defined differently for each given year)"; ?>"><b><i class="fas fa-right-from-bracket me-2"></i> <?php echo _( "Exact date since year" ); ?></b></button>
                            <button type="button" class="btn btn-primary col col-md-4" data-testtype="exactCorrespondenceUntil"
                                title="<?php echo "When a liturgical event should no longer exist after a certain year, we assert that for a certain span of years before such year the liturgical event should fall on an expected date (date can optionally be defined differently for each given year), while for a certain span of years after such year the liturgical event should not exist"; ?>"><b><?php echo _( "Exact date until year" ); ?> <i class="fas fa-right-to-bracket ms-2"></i></b></button>
                            <button type="button" class="btn btn-primary col col-md-4" data-testtype="variableCorrespondence"
                                title="<?php echo "When a liturgical event is expected to be overriden in various years for whatever reason, we assert that it should exist in certain given years on an expected date (date can optionally be defined differently for each given year), and that it should not exist for other given years"; ?>"><b><i class="fas fa-square-root-variable me-2"></i> <?php echo _( "Variable existence" ); ?></b></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card border-4 border-top-0 border-bottom-0 border-end-0 border-primary rounded-3 mt-4">
            <div class="card-header py-3">
                <h4 class="m-0 fw-bold text-primary position-relative"><i class="fas fa-flask-vial fa-2x text-black d-inline-block me-4" style="--bs-text-opacity: .1;"></i><span id="testName">Name of Test</span><div class="text-muted position-absolute bottom-0 end-0 pb-1"><i class="fas fa-layer-group me-2"></i><span id="cardHeaderTestType"></span></div></h4>
            </div>
            <div class="card-body">
                <form class="needs-validation" id="testDataForm" novalidate>
                    <div class="row justify-content-center align-items-start">
                        <!-- Description -->
                        <div class="mb-3 form-group col col-md-12">
                            <label for="description" class="form-label text-secondary">Description</label>
                            <textarea class="form-control" id="description" name="description" rows="1" required></textarea>
                        </div>
                    </div>
                    <!-- Assertions (Dynamic Fields) -->
                    <label class="text-secondary invisible" id="perYearAssertions">Per year assertions</label>
                    <div class="row gx-0 gy-1 m-2" id="assertionsContainer">
                    </div>
                </form>
            </div>
            <div class="card-footer text-center">
                <button class="btn btn-lg btn-primary m-2" id="serializeUnitTestData" disabled><i class="fas fa-save me-2"></i><?php echo _("Save Unit Test") ?></button>
            </div>
        </div>

    </div>
    <!-- /.container-fluid -->

</main>
<!-- End of Main Content -->
<?php include_once('components/NewTestModal.php') ?>

<?php 
echo "<script>const LitCalTests = $response;</script>";
include_once( 'layout/footer.php' );
?>
