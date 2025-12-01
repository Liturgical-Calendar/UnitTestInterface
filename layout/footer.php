
<?php
require "./vendor/autoload.php";

use Dotenv\Dotenv;

$dotenv = Dotenv::createImmutable(dirname(__DIR__), ['.env', '.env.local', '.env.development', '.env.staging', '.env.production'], false);
$dotenv->safeLoad();
$dotenv->ifPresent(['API_PROTOCOL', 'API_HOST'])->notEmpty();
$dotenv->ifPresent(['API_PORT', 'WS_PORT'])->isInteger();
$dotenv->ifPresent(['APP_ENV'])->notEmpty()->allowedValues(['development', 'staging', 'production']);
$dotenv->ifPresent('WS_PROTOCOL')->notEmpty()->allowedValues(['ws', 'wss']);
$dotenv->ifPresent('WS_HOST')->notEmpty();

include_once('layout/disclaimer.php');
if (!defined('SIDEBAR') || true === SIDEBAR) {
    ?>
        </div>
        <!-- End of Content Wrapper -->

    </div>
    <!-- End of Page Wrapper -->
    <?php
}
?>
    <!-- Bootstrap / sb-admin JavaScript-->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.3.8/js/bootstrap.bundle.min.js"
        integrity="sha512-HvOjJrdwNpDbkGJIG2ZNqDlVqMo77qbs4Me4cah0HoDrfhrbA+8SBlZn1KrvAQw7cILLPFJvdwIgphzQmMm+Pw=="
        crossorigin="anonymous"
        referrerpolicy="no-referrer"></script>
    <script src="https://cdn.jsdelivr.net/npm/startbootstrap-sb-admin@7.0.7/dist/js/scripts.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.0.1/js/all.min.js"
        integrity="sha512-6BTOlkauINO65nLhXhthZMtepgJSghyimIalb+crKRPhvhmsCdnIuGcVbR5/aQY2A+260iC1OPy1oCdB6pSSwQ=="
        crossorigin="anonymous"
        referrerpolicy="no-referrer"></script>

    <!-- Global configuration (set on window for ES6 module access) -->
    <script>
        window.locale = '<?php echo $i18n->locale ?>';
        window.WS_PROTOCOL = '<?php echo ($_ENV['WS_PROTOCOL'] ?? 'wss'); ?>';
        window.WS_PORT = <?php echo ($_ENV['WS_PORT'] ?? 443); ?>;
        window.WS_HOST = '<?php echo ($_ENV['WS_HOST'] ?? 'litcal-test.johnromanodorazio.com'); ?>';
        window.API_PROTOCOL = '<?php echo ($_ENV['API_PROTOCOL'] ?? 'https'); ?>';
        window.API_PORT = <?php echo ($_ENV['API_PORT'] ?? 443); ?>;
        window.API_HOST = '<?php echo ($_ENV['API_HOST'] ?? 'litcal.johnromanodorazio.com'); ?>';
        window.APP_ENV = '<?php echo ($_ENV['APP_ENV'] ?? 'production'); ?>';
    </script>
<?php
if ($pageName === 'admin') {
    echo "<script src=\"https://unpkg.com/isotope-layout@3/dist/isotope.pkgd.min.js\"></script>";
}
if (file_exists("assets/js/{$pageName}.js")) {
    echo "<script type=\"module\" src=\"assets/js/{$pageName}.js\"></script>";
}
?></body>
</html>
