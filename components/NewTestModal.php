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
                        <div class="carousel-item active" data-item='0'>
                            <div class="form-group">
                                <label for="existingFestivityName" class="fw-bold"><?php echo _( "Choose the liturgical event for which you would like to create a test"); ?>:</label>
                                <input list="existingFestivitiesList" class="form-control existingFestivityName" id="existingFestivityName" required>
                                <div class="invalid-feedback"><?php echo _( "This festivity does not seem to exist? Please choose from a value in the list."); ?></div>
                            </div>
                        </div>
                        <div class="carousel-item" data-item='1'>
                            <div class="form-group">
                                <div>
                                    <label class="fw-bold"><?php echo _( "Years to test" ); ?></label><br>
                                    <small class="text-muted">First choose the maximum range of years that will belong to the Unit Test. Then you can remove any years that won't be needed.</small>
                                </div>
                                <!-- Double range slider (flat design)  -->
                                <div class="range-slider flat" id="yearsToTestRangeSlider" data-ticks-position='top'>
                                    <input type="range" id="lowerRange" min="1970" max="2049" value="1999" oninput="this.parentNode.style.setProperty('--value-a',this.value); this.parentNode.style.setProperty('--text-value-a', JSON.stringify(this.value))">
                                    <output></output>
                                    <input type="range" id="upperRange" min="1971" max="2050" value="2030" oninput="this.parentNode.style.setProperty('--value-b',this.value); this.parentNode.style.setProperty('--text-value-b', JSON.stringify(this.value))">
                                    <output></output>
                                    <div class='range-slider__progress'></div>
                                </div>
                            </div>
                            <div id="yearsToTestGrid">
                                <?php
                                for( $i=1999; $i<= 2030; $i++ ) {
                                    $title = _( 'remove' );
                                    echo "<span class=\"testYearSpan\">$i<i class=\"fas fa-xmark-circle ms-1 opacity-50\" role=\"button\" title=\"$title\"></i></span>";
                                }
                                ?>
                            </div>
                        </div>
                        <div class="carousel-item" data-item='2'>
                            <div class="form-group">
                                <label class="fw-bold"><?php echo _( "Set the base date for this liturgical event" ) ?></label><br>
                                <small><small>You will later be able to adjust the date for each year if needed. If the liturgical event is mobile rather than fixed, set the date for the first year you are testing against, then later you can adjust each successive year with the respective date.</small></small>
                                <input type="date" id="baseDate" min="1970-01-01" max="2050-12-31" class="form-control mt-4 w-25" required>
                                <div class="invalid-feedback"><?php echo _( "The date input cannot be empty"); ?></div>
                            </div>
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
            <button type="button" class="btn btn-primary" id="btnCreateTest" disabled><?php echo _('Create test'); ?></button>
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
