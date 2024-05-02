<!-- Modal Exact Correspondence Type -->
<div class="modal fade" id="modalExactCorrespondenceType" tabindex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
        <div class="modal-header">
            <h5 class="modal-title" id="exampleModalLabel"><?php echo _('Exact Correspondence Test'); ?></h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body">
            <div id="carouselCreateNewUnitTest" class="carousel carousel-dark slide" style="min-height: 300px;" data-bs-ride="false" data-bs-interval="false">
                <div class="carousel-indicators">
                    <button type="button" data-bs-target="#carouselCreateNewUnitTest" data-bs-slide-to="0" class="active" aria-current="true" aria-label="Slide 1"></button>
                    <button type="button" data-bs-target="#carouselCreateNewUnitTest" data-bs-slide-to="1" aria-label="Slide 2"></button>
                    <button type="button" data-bs-target="#carouselCreateNewUnitTest" data-bs-slide-to="2" aria-label="Slide 3"></button>
                </div>
                <div class="carousel-inner">
                    <form class="row justify-content-left needs-validation" novalidate>
                        <div class="carousel-item active">
                            <div class="form-group d-block w-100">
                                <label for="existingFestivityName" class="fw-bold"><?php echo _( "Choose the liturgical event for which you would like to create a test"); ?>:</label>
                                <input list="existingFestivitiesList" class="form-control existingFestivityName" id="existingFestivityName" required>
                                <div class="invalid-feedback"><?php echo _( "This festivity does not seem to exist? Please choose from a value in the list."); ?></div>
                            </div>
                        </div>
                        <div class="carousel-item">
                            <div class="form-group d-block w-100"></div>
                        </div>
                        <div class="carousel-item">
                            <div class="form-group d-block w-100"></div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn btn-primary" type="button" id="carouselPrevButton" data-bs-target="#carouselCreateNewUnitTest" data-bs-slide="prev" disabled><!-- class carousel-control-prev -->
                <span class="fas fa-caret-left" aria-hidden="true"></span>
                <span>Previous</span>
            </button>
            <button class="btn btn-primary" type="button" id="carouselNextButton" data-bs-target="#carouselCreateNewUnitTest" data-bs-slide="next"><!-- class carousel-control-prev -->
                <span>Next</span>
                <span class="fas fa-caret-right" aria-hidden="true"></span>
            </button>
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><?php echo _('Close'); ?></button>
            <button type="button" class="btn btn-primary" disabled><?php echo _('Create test'); ?></button>
        </div>
        </div>
    </div>
</div>

<datalist id="existingFestivitiesList">
<?php
[ "LitCalAllFestivities" => $FestivityCollection ] = json_decode( file_get_contents( "https://litcal.johnromanodorazio.com/api/dev/LitCalAllFestivities.php?locale=" . $i18n->locale ), true );
foreach( $FestivityCollection as $key => $festivity ) {
    echo "<option value=\"{$key}\">{$festivity["NAME"]}</option>";
}
?>
</datalist>
