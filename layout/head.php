<?php
include_once("includes/I18n.php");

use LiturgicalCalendar\UnitTestInterface\I18n;

// Only create I18n if not already initialized (e.g., by admin.php for early API calls)
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
if ($pageName === 'admin') {
    echo "<link href=\"assets/css/multi-range-slider.css\" rel=\"stylesheet\">";
}
?>
</head>
<body class="sb-nav-fixed pb-5">
<?php
include_once('layout/topnavbar.php');
