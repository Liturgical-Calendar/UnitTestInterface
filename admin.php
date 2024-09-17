<?php
error_reporting(E_ALL);
ini_set("display_errors", 1);
require_once 'vendor/autoload.php';
require_once 'includes/auth.php';

use LiturgicalCalendar\Components\CalendarSelect;

if (!authenticated()) {
    header("WWW-Authenticate: Basic realm=\"Please insert your credentials\"");
    header($_SERVER["SERVER_PROTOCOL"] . " 401 Unauthorized");
    echo "You need a username and password to access this service.";
    die();
}

$apiVersion = isset($_GET['apiVersion']) ? $_GET['apiVersion'] : 'dev';

$ch = curl_init();

if ($apiVersion === 'dev') {
    curl_setopt($ch, CURLOPT_URL, "https://litcal.johnromanodorazio.com/api/$apiVersion/tests");
} else {
    curl_setopt($ch, CURLOPT_URL, "https://litcal.johnromanodorazio.com/api/$apiVersion/testsindex/");
}
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
if (curl_errno($ch)) {
    $error_msg = curl_error($ch);
    curl_close($ch);
    die($error_msg);
}
curl_close($ch);
if ($apiVersion === 'dev') {
    $LitCalTests = json_decode($response)->litcal_tests;
} else {
    $LitCalTests = json_decode($response);
}

include_once 'layout/head.php';
include_once 'layout/sidebar.php';
?>
<!-- Main Content -->
<main class="pb-5">
    <div class="container-fluid px-4">

        <!-- Page Heading -->
        <h1 class="h3 mb-2 text-black" style="--bs-text-opacity: .6;"><?php echo _("Define a Unit Test for a Liturgical event"); ?></h1>
        <p class="mb-1 lh-sm"><small><i><?php echo _("In order to verify that the liturgical calendar data produced by the API is actually producing correct data, we can create Unit Tests that allow us to verify that events were / were not created in the calendar, or that they have expected dates from year to year."); ?></i></small></p>
        <div class="row justify-content-center align-items-start bg-light border p-2 mt-4">
            <div class="form-group col col-md-2" id="editExistingTestOption">
                <label for="litCalTestsSelect" class="fw-bold border border-top-0 border-start-0 border-end-0 border-secondary mb-4 w-100 text-center"><?php echo _("Edit an existing test"); ?></label>
                <select id="litCalTestsSelect" class="form-select">
                    <option value="" selected>--</option>
                    <?php foreach ($LitCalTests as $LitCalTest) {
                        echo "<option value=\"$LitCalTest->name\">$LitCalTest->name</option>";
                    } ?>
                </select>
            </div>
            <div class="col col-md-10">
                <label class="w-100 text-center fw-bold border border-top-0 border-start-0 border-end-0 border-secondary"><?php echo _('Create a New Test'); ?></label>
                <div class="row justify-content-center align-items-start">
                    <div class="form-group col col-md-3 border border-top-0 border-bottom-0 border-end-0 border-secondary">
                        <?php
                            $options = ['locale' => 'it']; // set the locale to Italian
                            $CalendarSelect = new CalendarSelect($options); // use the default API url, but set the locale to Italian
                            echo $CalendarSelect->getSelect([
                                                    'class'    => 'form-select',
                                                    'id'       => 'APICalendarSelect',
                                                    'options'  => 'all',
                                                    'label'    => true,
                                                    'labelStr' => _('Calendar to test')
                                                ]);
                            ?>
                    </div>
                    <div class="form-group col col-md-9">
                        <label><?php echo _("Test Type"); ?></label>
                        <div class="btn-group form-control p-0 border-0" id="createNewTestBtnGrp" role="group">
                            <button type="button" class="btn btn-primary col col-md-3"
                                data-testtype="exactCorrespondence" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                                title="<?php echo _("In the span of years for which we are making an assertion, we assert that the liturgical event should exist, and should fall on an expected date (date can optionally be defined differently for each given year)"); ?>">
                                <small><b><i class="fas fa-vial me-2"></i> <?php echo _("Exact date"); ?></b></small>
                            </button>
                            <button type="button" class="btn btn-primary col col-md-4"
                                data-testtype="exactCorrespondenceSince" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                                title="<?php echo _("When a liturgical event should only exist after a certain year, we assert that for a certain span of years before such year the liturgical event should not exist, while for a certain span of years after such year the liturgical event should exist and should fall on an expected date (date can optionally be defined differently for each given year)"); ?>">
                                <small><b><i class="fas fa-right-from-bracket me-2"></i> <?php echo _("Exact date since year"); ?></b></small>
                            </button>
                            <button type="button" class="btn btn-primary col col-md-4"
                                data-testtype="exactCorrespondenceUntil" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                                title="<?php echo _("When a liturgical event should no longer exist after a certain year, we assert that for a certain span of years before such year the liturgical event should fall on an expected date (date can optionally be defined differently for each given year), while for a certain span of years after such year the liturgical event should not exist"); ?>">
                                <small><b><?php echo _("Exact date until year"); ?> <i class="fas fa-right-to-bracket ms-2"></i></b></small>
                            </button>
                            <button type="button" class="btn btn-primary col col-md-4"
                                data-testtype="variableCorrespondence" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                                title="<?php echo _("When a liturgical event is expected to be overriden in various years for whatever reason, we assert that it should exist in certain given years on an expected date (date can optionally be defined differently for each given year), and that it should not exist for other given years"); ?>">
                                <small><b><i class="fas fa-square-root-variable me-2"></i> <?php echo _("Variable existence"); ?></b></small>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card border-4 border-top-0 border-bottom-0 border-end-0 border-primary rounded-3 mt-4">
            <div class="card-header py-3">
                <h4 class="m-0 fw-bold text-primary position-relative"><i class="fas fa-flask-vial fa-2x text-black d-inline-block me-4" style="--bs-text-opacity: .1;"></i><span id="testName"><?php echo _("Name of Test"); ?></span><div class="text-muted position-absolute bottom-0 end-0 pb-1"><i class="fas fa-layer-group me-2"></i><span id="cardHeaderTestType"></span></div></h4>
            </div>
            <div class="card-body">
                <form class="needs-validation" id="testDataForm" novalidate>
                    <div class="row justify-content-center align-items-start">
                        <div class="mb-3 form-group col col-md-12">
                            <label for="description" class="form-label text-secondary"><?php echo _("Description"); ?></label>
                            <textarea class="form-control" id="description" name="description" rows="1" required></textarea>
                        </div>
                    </div>
                    <label class="text-secondary text-center w-100 invisible" id="perYearAssertions"><?php echo _("Per year assertions"); ?> <i class="btn btn-secondary fas fa-pen-to-square ms-5" data-testtype="" data-edittest="true" data-bs-toggle="modal" data-bs-target="#modalDefineTest" title="Edit year range"></i></label>
                    <div class="row gx-0 gy-1 m-2" id="assertionsContainer">
                    </div>
                    <input type="hidden" id="yearSince" />
                    <input type="hidden" id="yearUntil" />
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
<?php
if ($apiVersion === 'dev') {
    $eventsEndpoint = "https://litcal.johnromanodorazio.com/api/dev/events/";
    [ "litcal_events" => $LitCalAllFestivities ] = json_decode(
        file_get_contents("$eventsEndpoint?locale=" . $i18n->locale),
        true
    );
}
include_once 'components/NewTestModal.php';
?>
<div class="modal fade" id="modalAddEditComment" tabindex="-1" aria-labelledby="addEditCommentModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="addEditCommentModalLabel"><?php echo _('Add or Edit Comment'); ?></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cancel"></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="unitTestComment" class="fw-bold"><?php echo _('Comment') ?></label>
                    <textarea class="form-control" id="unitTestComment" rows=2 placeholder="This test is significant because..."></textarea>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" id="btnSaveComment" data-bs-dismiss="modal"><?php echo _('Save'); ?></button>
            </div>
        </div>
    </div>
</div>

<!-- Warning alert for attempts at pasting scripted material in contenteditables -->
<div class="alert alert-danger d-flex align-items-center position-fixed top-50 start-50 d-none" role="alert" id="noScriptedContentAlert">
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor"
        class="bi bi-exclamation-triangle-fill flex-shrink-0 me-2" viewBox="0 0 16 16"
        role="img" aria-label="Warning:">
        <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
    </svg>
    <div>Hey! No script or html allowed here!</div>
</div>
<div class="alert alert-success d-flex align-items-center position-fixed top-50 start-50 d-none" role="alert" id="responseToPutRequest">
    <i class="fas fa-circle-check me-2"></i>
    <div id="responseMessage"></div>
</div>
<?php
$LitEventKeys = json_encode($LitCalAllFestivities);
echo "<script>const LitCalTests = Object.freeze($response); let LitCalAllFestivities = Object.freeze($LitEventKeys);</script>";
include_once 'layout/footer.php';
?>
