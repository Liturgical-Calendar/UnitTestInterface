
<?php
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
    <!-- jQuery-->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-easing/1.4.1/jquery.easing.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/js-cookie/2.2.1/js.cookie.min.js"></script>

    <!-- Bootstrap / sb-admin JavaScript-->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/startbootstrap-sb-admin@7.0.5/dist/js/scripts.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/js/all.min.js"></script>

    <!-- i18next -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/i18next/21.6.6/i18next.min.js"
            integrity="sha512-3CUvxyR4WtlZanN/KmorrZ2VALnUndAQBYjf1HEYNa6McBY+G2zYq4gOZPUDkDtuk3uBdQIva0Lk89hYQ9fQrA=="
            crossorigin="anonymous"
            referrerpolicy="no-referrer">
    </script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery-i18next/1.2.1/jquery-i18next.min.js"
            integrity="sha512-79RgNpOyaf8AvNEUdanuk1x6g53UPoB6Fh2uogMkOMGADBG6B0DCzxc+dDktXkVPg2rlxGvPeAFKoZxTycVooQ=="
            crossorigin="anonymous"
            referrerpolicy="no-referrer">
    </script>
    <script src="https://cdn.jsdelivr.net/npm/i18next-http-backend@1.3.1/i18nextHttpBackend.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/bootstrap-multiselect/1.1.2/js/bootstrap-multiselect.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/toastr.js/latest/toastr.min.js"></script>
    <script src="assets/js/common.js"></script>
    <script>const locale = '<?php echo $i18n->locale ?>';</script>
<?php
if ($pageName === 'admin') {
    echo "<script src=\"assets/js/AssertionsBuilder.js\"></script>";
    echo "<script src=\"https://unpkg.com/isotope-layout@3/dist/isotope.pkgd.min.js\"></script>";
}
if (file_exists("assets/js/{$pageName}.js")) {
    echo "<script src=\"assets/js/{$pageName}.js\"></script>";
}
?></body>
</html>
