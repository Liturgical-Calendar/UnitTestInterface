<?php
require_once dirname(__DIR__) . "/vendor/autoload.php";
include_once("includes/I18n.php");

use Dotenv\Dotenv;
use LiturgicalCalendar\UnitTestInterface\I18n;
use LiturgicalCalendar\UnitTestInterface\JwtAuth;
use LiturgicalCalendar\UnitTestInterface\Oidc\Client as OidcClient;

// Load environment variables early so they're available in topnavbar.php
$dotenv = Dotenv::createImmutable(
    dirname(__DIR__),
    ['.env', '.env.local', '.env.development', '.env.test', '.env.staging', '.env.production'],
    false
);
$dotenv->safeLoad();
$dotenv->ifPresent(['API_PROTOCOL', 'API_HOST'])->notEmpty();
$dotenv->ifPresent(['API_PORT', 'WS_PORT'])->isInteger();
$dotenv->ifPresent(['APP_ENV'])->notEmpty()->allowedValues(['development', 'test', 'staging', 'production']);
$dotenv->ifPresent('WS_PROTOCOL')->notEmpty()->allowedValues(['ws', 'wss']);
$dotenv->ifPresent('WS_HOST')->notEmpty();
$dotenv->ifPresent('LITCAL_FRONTEND_URL')->notEmpty();
// API_BASE_PATH can be empty for local development

// Authentication is a property of every page, not of admin.php. `topnavbar.php` and `footer.php`
// both read `$isAuthenticated` when it happens to be set; setting it here is what makes it always
// set, so the login button and the `data-requires-auth` regions render in the right state on first
// paint instead of flashing the logged-out state until initPermissionUI() catches up.
JwtAuth::init();
$isAuthenticated = JwtAuth::isAuthenticated();

// Whether this deployment has Zitadel at all. The login control redirects to the OIDC flow when it
// does, and falls back to the legacy username/password modal when it does not — one visible button
// whose destination depends on what is available, rather than two to keep in step.
$oidcEnabled = OidcClient::isConfigured();
// Published so a test can assert the implication "org id configured => org scope sent" without needing
// to know this deployment's configuration. Asked of the client rather than recomputed here: it drops a
// non-numeric org id, and a template checking only for non-emptiness would disagree with it.
$oidcOrgScoped = OidcClient::isOrgScoped();

// Whether this visitor may start a test run and store its results. Distinct from `$isAuthenticated`:
// reading Past Runs is public now, so being logged in is no longer what the runner pages gate on —
// holding one of JwtAuth::RUN_TESTS_ROLES is. Published so the Run Tests button renders disabled on
// first paint rather than enabling and then failing at the POST.
$canRunTests = JwtAuth::canRunTests();

// Only create I18n if not already initialized (a page may need it before including this file,
// e.g. to make an early API call whose errors are shown translated)
if (!isset($i18n)) {
    $i18n = new I18n();
}
$pageName = basename($_SERVER["SCRIPT_FILENAME"], '.php');
?><!DOCTYPE html>
<html lang="<?php echo $i18n->locale; ?>">
<head>

    <title>LitCal Accuracy Tests</title>
    <meta name="copyright" content="Copyright 2022. John Romano D'Orazio. All Rights Reserved.">
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta http-equiv="Cache-Control" content="no-cache">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <link rel="shortcut icon" type="image/x-icon" href="favicon.ico">

    <!-- Custom fonts for this template-->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/css/all.min.css"
        integrity="sha512-2SwdPD6INVrV/lHTZbO2nodKhrnDdJK9/kg2XD1r9uGqPo1cUbujc+IYdlYdEErWNu69gVcYgdxlmVmzTWnetw=="
        crossorigin="anonymous"
        referrerpolicy="no-referrer" />

    <!-- Custom styles for this template-->
    <link href="https://cdn.jsdelivr.net/npm/startbootstrap-sb-admin@7.0.7/dist/css/styles.css" rel="stylesheet">
<?php
if (in_array($pageName, ['index', 'resources'], true)) {
    echo "<link href=\"assets/css/common.css\" rel=\"stylesheet\">";
}
if (file_exists("assets/css/{$pageName}.css")) {
    echo "<link href=\"assets/css/{$pageName}.css\" rel=\"stylesheet\">";
}
?>
</head>
<body class="sb-nav-fixed pb-5">
<?php
include_once('layout/topnavbar.php');
