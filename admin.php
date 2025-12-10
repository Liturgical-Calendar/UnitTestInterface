<?php

// phpcs:disable PSR1.Files.SideEffects
ini_set('date.timezone', 'Europe/Vatican');

require_once 'vendor/autoload.php';

use LiturgicalCalendar\Components\CalendarSelect;
use LiturgicalCalendar\Components\CalendarSelect\OptionsType;
use LiturgicalCalendar\UnitTestInterface\ApiClient;
use LiturgicalCalendar\UnitTestInterface\JwtAuth;
use Dotenv\Dotenv;
use Monolog\Logger;
use Monolog\Level;
use Monolog\Handler\StreamHandler;

/**
 * Returns true if the server is running on localhost.
 *
 * @return bool true if the server is running on localhost, false otherwise
 */
function isLocalhost(): bool
{
    $serverAddress      = isset($_SERVER['SERVER_ADDR']) ? $_SERVER['SERVER_ADDR'] : '';
    $remoteAddress      = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
    $serverName         = isset($_SERVER['SERVER_NAME']) ? $_SERVER['SERVER_NAME'] : '';
    $localhostAddresses = ['127.0.0.1', '::1', '0.0.0.0'];
    $localhostNames     = ['localhost', ...$localhostAddresses];
    return in_array($serverAddress, $localhostAddresses) ||
            in_array($remoteAddress, $localhostAddresses) ||
            in_array($serverName, $localhostNames);
}

$dotenv = Dotenv::createImmutable(__DIR__, ['.env', '.env.local', '.env.development', '.env.staging', '.env.production'], false);
$dotenv->safeLoad();

// Initialize JWT authentication (must be after dotenv loads)
JwtAuth::init();
$isAuthenticated = JwtAuth::isAuthenticated();

$dotenv->ifPresent(['API_PROTOCOL', 'API_HOST'])->notEmpty();
$dotenv->ifPresent(['API_PROTOCOL'])->allowedValues(['http', 'https']);
$dotenv->ifPresent(['API_PORT'])->isInteger();
$dotenv->ifPresent(['APP_ENV'])->notEmpty()->allowedValues(['development', 'test', 'staging', 'production']);

// Setup logging directory
$logsFolder = __DIR__ . DIRECTORY_SEPARATOR . 'logs';
if (!file_exists($logsFolder)) {
    if (!mkdir($logsFolder, 0755, true)) {
        throw new RuntimeException('Failed to create logs directory: ' . $logsFolder);
    }
}
$logFile = $logsFolder . DIRECTORY_SEPARATOR . 'litcaltests-error.log';

$debugMode = isLocalhost() || (isset($_ENV['APP_ENV']) && $_ENV['APP_ENV'] === 'development');

if ($debugMode) {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    ini_set('log_errors', 1);
    ini_set('error_log', $logFile);
    error_reporting(E_ALL);
} else {
    ini_set('display_errors', 0);
    ini_set('display_startup_errors', 0);
    ini_set('log_errors', 1);
    ini_set('error_log', $logFile);
    error_reporting(E_ALL & ~E_NOTICE & ~E_DEPRECATED);
}

// Setup PSR-3 Logger (Monolog)
$logger = new Logger('litcal-tests');
$logger->pushHandler(new StreamHandler(
    $logsFolder . DIRECTORY_SEPARATOR . 'litcal.log',
    $debugMode ? Level::Debug : Level::Warning
));

// Build API base URL
$schema     = isset($_ENV['API_PROTOCOL']) ? $_ENV['API_PROTOCOL'] : (isLocalhost() ? 'http' : 'https');
$host       = isset($_ENV['API_HOST']) ? $_ENV['API_HOST'] : (isLocalhost() ? 'localhost' : 'litcal.johnromanodorazio.com');
$port       = isset($_ENV['API_PORT']) ? (int) $_ENV['API_PORT'] : (isLocalhost() ? 8000 : 443);
$apiVersion = isset($_GET['apiVersion']) ? $_GET['apiVersion'] : 'dev';
$baseUrl    = isLocalhost() ? "$schema://$host:$port" : "$schema://$host/api/$apiVersion";

// Create PSR-compliant HTTP client
$apiClient = new ApiClient(null, 10, 5, $logger);

// Fetch tests data from API
try {
    $testsData   = $apiClient->fetchJsonWithKey("$baseUrl/tests", 'litcal_tests');
    $LitCalTests = $testsData['litcal_tests'];
    // Convert to objects to maintain compatibility with existing template code
    $LitCalTests = json_decode(json_encode($LitCalTests));
} catch (RuntimeException $e) {
    $logger->error('Failed to fetch tests data', ['error' => $e->getMessage()]);
    die('Failed to fetch tests data: ' . $e->getMessage());
}

// Signal that this page has the login modal (for topnavbar.php)
define('HAS_LOGIN_MODAL', true);

include_once 'layout/head.php';
include_once 'layout/sidebar.php';
?>
<!-- Main Content -->
<main class="pb-5">
    <div class="container-fluid px-4">

        <!-- Page Heading -->
        <h1 class="h3 mb-2 text-black" style="--bs-text-opacity: .6;"><?php echo _("Define a Liturgical Accuracy Test"); ?></h1>
        <p class="mb-1 lh-sm"><small><i><?php
            echo _("In order to verify that the liturgical calendar data produced by the API is accurate, we can create Liturgical Accuracy Tests that allow us to verify that events were / were not created in the calendar, or that they have expected dates from year to year.");
        ?></i></small></p>
        <div class="row justify-content-center align-items-start bg-light border p-2 mt-4">
            <div class="form-group col col-md-2" id="editExistingTestOption">
                <label for="litCalTestsSelect" class="fw-bold border border-top-0 border-start-0 border-end-0 border-secondary mb-4 w-100 text-center"><?php
                    echo _("Edit an existing test");
                ?></label>
                <select id="litCalTestsSelect" class="form-select" data-requires-auth <?php echo $isAuthenticated ? '' : 'disabled'; ?>>
                    <option value="" selected>--</option>
                    <?php
                    foreach ($LitCalTests as $LitCalTest) {
                        echo "<option value=\"$LitCalTest->name\">$LitCalTest->name</option>";
                    }
                    ?>
                </select>
            </div>
            <div class="col col-md-10">
                <label class="w-100 text-center fw-bold border border-top-0 border-start-0 border-end-0 border-secondary"><?php echo _('Create a New Test'); ?></label>
                <div class="row justify-content-center align-items-start">
                    <div class="form-group col col-md-3 border border-top-0 border-bottom-0 border-end-0 border-secondary">
                        <?php
                            $options = ['locale' => $i18n->locale, 'url' => $baseUrl];
                            $CalendarSelect = new CalendarSelect($options)
                                                    ->class('form-select')
                                                    ->id('APICalendarSelect')
                                                    ->label(true)
                                                    ->labelText(_('Calendar to test'))
                                                    ->setOptions(OptionsType::ALL)
                                                    ->disabled(!$isAuthenticated);
                            $selectHtml = $CalendarSelect->getSelect();
                            // Add data-requires-auth attribute for JS to enable on login
                            $selectHtml = str_replace('<select ', '<select data-requires-auth ', $selectHtml);
                            echo $selectHtml;
                        ?>
                    </div>
                    <div class="form-group col col-md-9">
                        <label><?php echo _("Test Type"); ?></label>
                        <div class="btn-group form-control p-0 border-0" id="createNewTestBtnGrp" role="group">
                            <button type="button" class="btn btn-primary col col-md-3 <?php echo $isAuthenticated ? '' : 'd-none'; ?>" data-requires-auth
                                data-testtype="exactCorrespondence" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                                title="<?php
                                    echo _("In the span of years for which we are making an assertion, we assert that the liturgical event should exist, and should fall on an expected date (date can optionally be defined differently for each given year)");
                                ?>">
                                <small><b><i class="fas fa-vial me-2"></i> <?php echo _("Exact date"); ?></b></small>
                            </button>
                            <button type="button" class="btn btn-primary col col-md-4 <?php echo $isAuthenticated ? '' : 'd-none'; ?>" data-requires-auth
                                data-testtype="exactCorrespondenceSince" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                                title="<?php
                                    echo _("When a liturgical event should only exist after a certain year, we assert that for a certain span of years before such year the liturgical event should not exist, while for a certain span of years after such year the liturgical event should exist and should fall on an expected date (date can optionally be defined differently for each given year).");
                                ?>">
                                <small><b><i class="fas fa-right-from-bracket me-2"></i> <?php echo _("Exact date since year"); ?></b></small>
                            </button>
                            <button type="button" class="btn btn-primary col col-md-4 <?php echo $isAuthenticated ? '' : 'd-none'; ?>" data-requires-auth
                                data-testtype="exactCorrespondenceUntil" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                                title="<?php
                                    echo _("When a liturgical event should no longer exist after a certain year, we assert that for a certain span of years before such year the liturgical event should fall on an expected date (date can optionally be defined differently for each given year), while for a certain span of years after such year the liturgical event should not exist.");
                                ?>">
                                <small><b><?php echo _("Exact date until year"); ?> <i class="fas fa-right-to-bracket ms-2"></i></b></small>
                            </button>
                            <button type="button" class="btn btn-primary col col-md-4 <?php echo $isAuthenticated ? '' : 'd-none'; ?>" data-requires-auth
                                data-testtype="variableCorrespondence" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                                title="<?php
                                    echo _("When a liturgical event is expected to be overriden in various years for whatever reason, we assert that it should exist in certain given years on an expected date (date can optionally be defined differently for each given year), and that it should not exist for other given years.");
                                ?>">
                                <small><b><i class="fas fa-square-root-variable me-2"></i> <?php echo _("Variable existence"); ?></b></small>
                            </button>
                        </div>
                        <div class="alert alert-info mb-0 <?php echo $isAuthenticated ? 'd-none' : ''; ?>" role="alert" data-requires-no-auth>
                            <i class="fas fa-sign-in-alt me-2"></i><?php echo _("Please login to create or edit tests."); ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card border-4 border-top-0 border-bottom-0 border-end-0 border-primary rounded-3 mt-4">
            <div class="card-header py-3">
                <h4 class="m-0 fw-bold text-primary position-relative"><i
                    class="fas fa-flask-vial fa-2x text-black d-inline-block me-4"
                    style="--bs-text-opacity: .1;"
                    ></i><span id="testName" data-default="<?php echo _("Name of Test"); ?>"><?php
                        echo _("Name of Test");
                    ?></span>
                    <div class="text-muted position-absolute bottom-0 end-0 pb-1"><i class="fas fa-layer-group me-2"></i><span id="cardHeaderTestType"></span></div>
                </h4>
            </div>
            <div class="card-body">
                <form class="needs-validation <?php echo $isAuthenticated ? '' : 'd-none'; ?>" id="testDataForm" novalidate data-requires-auth>
                    <div class="row justify-content-center align-items-start">
                        <div class="mb-3 form-group col col-md-12">
                            <label for="description" class="form-label text-secondary"><?php echo _("Description"); ?></label>
                            <textarea class="form-control" id="description" name="description" rows="1" required></textarea>
                        </div>
                    </div>
                    <label class="text-secondary text-center w-100 invisible" id="perYearAssertions"><?php
                        echo _("Per year assertions");
                    ?> <i class="btn btn-secondary fas fa-pen-to-square ms-5"
                        data-testtype="" data-edittest="true" data-bs-toggle="modal" data-bs-target="#modalDefineTest"
                        title="Edit year range"></i></label>
                    <div class="row gx-0 gy-1 m-2" id="assertionsContainer">
                    </div>
                    <input type="hidden" id="yearSince" />
                    <input type="hidden" id="yearUntil" />
                </form>
                <div class="text-center text-muted py-4 <?php echo $isAuthenticated ? 'd-none' : ''; ?>" data-requires-no-auth>
                    <i class="fas fa-lock fa-3x mb-3"></i>
                    <p><?php echo _("Login to view and edit test details."); ?></p>
                </div>
            </div>
            <div class="card-footer text-center <?php echo $isAuthenticated ? '' : 'd-none'; ?>" data-requires-auth>
                <button class="btn btn-lg btn-primary m-2" id="serializeUnitTestData" disabled><i class="fas fa-save me-2"></i><?php echo _("Save Accuracy Test") ?></button>
            </div>
        </div>

    </div>
    <!-- /.container-fluid -->

</main>
<!-- End of Main Content -->
<?php
// Fetch events data from API with locale
$eventsEndpoint = "$baseUrl/events";
$apiClient->setLocale($i18n->locale);
try {
    $eventsData = $apiClient->fetchJsonWithKey($eventsEndpoint, 'litcal_events');
    $LitCalAllLitEvents = $eventsData['litcal_events'];
} catch (RuntimeException $e) {
    $logger->error('Failed to fetch events data', ['error' => $e->getMessage()]);
    die('Could not fetch data from ' . $eventsEndpoint . ': ' . $e->getMessage());
}
// Include the test creation modal (hidden by JS when not authenticated)
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
$jsonFlags     = JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT;
$testsIndex    = json_encode($LitCalTests, $jsonFlags);
$litcal_events = json_encode($LitCalAllLitEvents, $jsonFlags);
$baseUrlJson   = json_encode($baseUrl, $jsonFlags);
$javascript    = <<<SCRIPT
    <script>
        window.LitCalTests = Object.freeze($testsIndex);
        window.LitcalEvents = Object.freeze($litcal_events);
        window.baseUrl = $baseUrlJson;
    </script>
SCRIPT;
echo $javascript;
include_once 'components/login-modal.php';
include_once 'layout/footer.php';
?>
