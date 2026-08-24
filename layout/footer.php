<?php
// Note: dotenv is loaded in layout/head.php, no need to reload here

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

<?php
// The login modal ships on every page, not just admin.php. It has to follow the Bootstrap bundle
// above (its script constructs `bootstrap.Modal` and `bootstrap.Toast`) and precede the page's own
// module script below (which reads what it puts on `window`). `include_once` keeps a page that also
// includes it directly from emitting it twice.
include_once('components/login-modal.php');
?>

    <!-- Global configuration (set on window for ES6 module access) -->
    <script>
        window.LitCalConfig = Object.freeze({
            locale: <?php echo json_encode($i18n->locale); ?>,
            WS_PROTOCOL: <?php echo json_encode($_ENV['WS_PROTOCOL'] ?? 'wss'); ?>,
            WS_PORT: <?php echo (int)($_ENV['WS_PORT'] ?? 443); ?>,
            WS_HOST: <?php echo json_encode($_ENV['WS_HOST'] ?? 'litcal-test.johnromanodorazio.com'); ?>,
            API_PROTOCOL: <?php echo json_encode($_ENV['API_PROTOCOL'] ?? 'https'); ?>,
            API_PORT: <?php echo (int)($_ENV['API_PORT'] ?? 443); ?>,
            API_HOST: <?php echo json_encode($_ENV['API_HOST'] ?? 'litcal.johnromanodorazio.com'); ?>,
            API_BASE_PATH: <?php echo json_encode($_ENV['API_BASE_PATH'] ?? '/api/dev'); ?>,
            APP_ENV: <?php echo json_encode($_ENV['APP_ENV'] ?? 'production'); ?>,
<?php
// The absolute base of the same-origin API proxy, or null when it is switched off.
//
// Absolute rather than relative because `ApiBase` in @liturgical-calendar/components-js refuses a
// relative base outright ("it would resolve /calendars against the document and 404 silently") and
// appends `/calendars` to whatever it is given. The page's own fetches would be happy with a relative
// path; the library is what forces this shape.
//
// Off by default: the path form depends on the SAPI populating PATH_INFO, so a deployment turns this
// on only once it has confirmed `api-proxy.php/calendars` answers there. See api-proxy.php.
$proxyEnabled = filter_var($_ENV['API_PROXY_ENABLED'] ?? false, FILTER_VALIDATE_BOOL);
$proxyBase    = null;
if ($proxyEnabled) {
    $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null;
    if (is_string($forwardedProto) && '' !== $forwardedProto) {
        $scheme = strtolower(explode(',', $forwardedProto)[0]);
    } else {
        $scheme = ( !empty($_SERVER['HTTPS']) && 'off' !== $_SERVER['HTTPS'] ) ? 'https' : 'http';
    }
    $scheme    = in_array($scheme, ['http', 'https'], true) ? $scheme : 'https';
    $dir       = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
    $proxyBase = $scheme . '://' . ( $_SERVER['HTTP_HOST'] ?? 'localhost' ) . $dir . '/api-proxy.php';
}
?>
            API_PROXY_BASE: <?php echo json_encode($proxyBase); ?>,
            riteSelectLabel: <?php echo json_encode(_('Liturgical Rite')); ?>,
            calendarSelectLabel: <?php echo json_encode(_('Liturgical Calendar')); ?>,
            isAuthenticated: <?php echo isset($isAuthenticated) ? ($isAuthenticated ? 'true' : 'false') : 'false'; ?>
        });
    </script>
<?php
if ($pageName === 'admin') {
    echo "<script src=\"https://unpkg.com/isotope-layout@3/dist/isotope.pkgd.min.js\"></script>";
}

// The two runner pages mount liturgy-components-js controls (issue #48). The import map must
// precede the first module load, which is the page script emitted immediately below.
//
// In development the specifier resolves to a symlink at assets/components-js, so a local
// checkout of the library is picked up without publishing; in every other environment it
// resolves to a pinned CDN build. Mirrors LiturgicalCalendarFrontend/layout/footer.php.
if (in_array($pageName, ['index', 'resources'], true)) {
    $componentsJsUrl = ($_ENV['APP_ENV'] ?? 'production') === 'development'
        ? './assets/components-js/index.js'
        : 'https://cdn.jsdelivr.net/npm/@liturgical-calendar/components-js@2.7.0/+esm';
    echo '<script type="importmap">'
        . json_encode(
            ['imports' => ['@liturgical-calendar/components-js' => $componentsJsUrl]],
            JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT
        )
        . '</script>';
}

if (file_exists("assets/js/{$pageName}.js")) {
    echo "<script type=\"module\" src=\"assets/js/{$pageName}.js\"></script>";
}
?></body>
</html>
