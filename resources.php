<?php
define('SIDEBAR', false);
include_once('layout/head.php');
?>
    <!-- Toasts -->
    <div aria-live="polite" aria-atomic="true" class="position-relative" style="z-index:9999;">
        <div class="toast-container position-absolute top-0 end-0 p-3">
            <div class="toast align-items-center text-white bg-danger border-0 p-3 shadow" aria-live="assertive" role="alert" id="websocket-error">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-circle-xmark fa-fw"></i> <?php echo _("There was an error opening the connection to the server over the websocket. Perhaps the server is offline?"); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
            <div class="toast align-items-center text-white bg-success border-0 p-3 shadow" aria-live="assertive" role="alert" id="websocket-connected">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-circle-check fa-fw"></i> <?php echo _("Websocket connected successfully!"); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
            <div class="toast align-items-center text-white bg-warning border-0 p-3 shadow" aria-live="assertive" role="alert" id="websocket-closed">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-triangle-exclamation fa-fw"></i> <?php echo _("Websocket connection closed."); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
            <div class="toast align-items-center text-white bg-success border-0 p-3 shadow" aria-live="assertive" role="alert" id="tests-complete">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas fa-circle-check fa-fw"></i> <?php echo _("All tests complete!"); ?>
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        </div>
    </div>

    <main class="pb-5" style="margin-top: 6em;">
    <div class="container-fluid">

        <div id="testsContainer">
            <div class="row mb-3 text-center g-3 litcaltests-header align-items-end justify-content-center">
                <div class="col-1"></div>
                <div class="col-2">
                    <label for="APIResponseSelect"><?php echo _("Response Format"); ?></label>
                    <select id="APIResponseSelect" class="form-select form-select-sm">
                        <option data-responsetype="json" value="JSON">JSON</option>
                        <option data-responsetype="yaml" value="YML">YAML</option>
                    </select>
                </div>
                <div class="col-2">
                    <button id="startTestRunnerBtn" type="button"
                            class="btn btn-primary" disabled
                    ><i class="fa fa-rotate fa-fw d-inline-block"></i> <span id="startTestRunnerBtnLbl"><?php
                        echo _("Run Tests");
                    ?></span></button>
                </div>
                <div class="col-2 text-white bg-success p-2">
                    <i class="fas fa-circle-check fa-fw"></i> <?php echo _("Successful tests:"); ?> <span id="successfulCount" class="successfulCount">0</span>
                </div>
                <div class="col-2 text-white bg-danger p-2">
                    <i class="fas fa-circle-xmark fa-fw"></i> <?php echo _("Failed tests:"); ?> <span id="failedCount" class="failedCount">0</span>
                </div>
                <div class="col-3 text-white bg-dark p-2">
                    <i class="fas fa-stopwatch fa-fw"></i> <?php
                        echo sprintf(_("Total time for %s tests:"), "<span id=\"total-tests-count\"></span>");
                    ?> <span id="total-time">0 seconds, 0ms</span>
                </div>
            </div>
            <div class="accordion" id="testSuiteAccordion">
                <div class="accordion-item">
                    <h2 class="row g-0 accordion-header" id="resourceDataHeader">
                        <button class="accordion-button collapsed" type="button"
                            data-bs-toggle="collapse" data-bs-target="#resourceDataTests"
                            aria-expanded="false" aria-controls="resourceDataTests"
                        >
                            <div class="col-4">
                                <i class="fas fa-file-export fa-fw"></i>&nbsp;<?php
                                    echo _("API Paths");
                                ?></span>
                            </div>
                            <div class="col-2 text-white p-2 text-center test-results bg-success">
                                <i class="fas fa-circle-check fa-fw"></i> <?php
                                    echo _("Successful tests:");
                                ?> <span id="successfulResourceDataTestsCount" class="successfulCount">0</span>
                            </div>
                            <div class="col-2 text-white p-2 text-center test-results bg-danger">
                                <i class="fas fa-circle-xmark fa-fw"></i> <?php
                                    echo _("Failed tests:");
                                ?> <span id="failedResourceDataTestsCount" class="failedCount">0</span>
                            </div>
                            <div class="col-3 text-white p-2 text-center test-results bg-dark">
                                <i class="fas fa-stopwatch fa-fw"></i> <?php
                                    echo sprintf(_("Total time for %s tests:"), "<span id=\"totalResourceDataTestsCount\"></span>");
                                ?> <span id="totalResourceDataTestsTime">0 seconds, 0ms</span>
                            </div>
                        </button>
                    </h2>
                    <div id="resourceDataTests" class="accordion-collapse collapse" aria-labelledby="resourceDataHeader" data-bs-parent="#testSuiteAccordion">
                        <div class="row g-0 resourcedata-tests"></div>
                    </div>
                </div>
                <div class="accordion-item">
                    <h2 class="row g-0 accordion-header" id="sourceDataHeader">
                        <button class="accordion-button" type="button"
                            data-bs-toggle="collapse" data-bs-target="#sourceDataTests"
                            aria-expanded="true" aria-controls="sourceDataTests"
                        >
                            <div class="col-4"><i class="fas fa-file-import fa-fw"></i>&nbsp;<span><?php echo _("Source data"); ?></span></div>
                            <div class="col-2 text-white p-2 text-center test-results bg-success">
                                <i class="fas fa-circle-check fa-fw"></i> <?php
                                    echo _("Successful tests:");
                                ?> <span id="successfulSourceDataTestsCount" class="successfulCount">0</span>
                            </div>
                            <div class="col-2 text-white p-2 text-center test-results bg-danger">
                                <i class="fas fa-circle-xmark fa-fw"></i> <?php
                                    echo _("Failed tests:");
                                ?> <span id="failedSourceDataTestsCount" class="failedCount">0</span>
                            </div>
                            <div class="col-3 text-white p-2 text-center test-results bg-dark">
                                <i class="fas fa-stopwatch fa-fw"></i> <?php
                                    echo sprintf(_("Total time for %s tests:"), "<span id=\"totalSourceDataTestsCount\"></span>");
                                ?> <span id="totalSourceDataTestsTime">0 seconds, 0ms</span>
                            </div>
                        </button>
                    </h2>
                    <div id="sourceDataTests" class="accordion-collapse collapse show" aria-labelledby="sourceDataHeader" data-bs-parent="#testSuiteAccordion">
                        <div class="row g-0 sourcedata-tests"></div>
                    </div>
                </div>
            </div><!-- end accordion -->
        </div><!-- end testsContainer -->
    </div><!-- end containerFluid -->
    </main>
    <!-- End of Main Content -->


    <div class="bg-light position-absolute top-0 left-0 text-center page-loader" style="width:100vw;height:100vh;opacity:.5;">
        <div class="spinner-border text-dark m-auto position-relative" role="status" style="top:50%;">
            <span class="visually-hidden"><?php echo _("Loading..."); ?></span>
        </div>
    </div>

    <?php include_once('layout/disclaimer.php'); ?>

<!-- </div> -->
<!-- End of Content Wrapper -->

<!-- </div> -->
<!-- End of Page Wrapper -->

<?php include_once('layout/footer.php'); ?>
