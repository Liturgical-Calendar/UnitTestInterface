<!-- Modal Exact Correspondence Type -->
<div class="modal fade" id="modalDefineTest" tabindex="-1" aria-labelledby="defineTestModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="defineTestModalLabel"><?php echo _('Exact Correspondence Test'); ?></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <div id="carouselCreateNewUnitTest" class="carousel carousel-dark slide" style="min-height: 300px;" data-bs-ride="false" data-bs-interval="false">
                    <div class="carousel-indicators">
                        <button type="button" data-bs-target="#carouselCreateNewUnitTest" data-bs-slide-to="0"
                            class="active" aria-current="true" aria-label="Slide 1"></button>
                        <button type="button" data-bs-target="#carouselCreateNewUnitTest" data-bs-slide-to="1" aria-label="Slide 2"></button>
                        <button type="button" data-bs-target="#carouselCreateNewUnitTest" data-bs-slide-to="2" aria-label="Slide 3"></button>
                    </div>
                    <div class="carousel-inner">
                        <form class="row justify-content-left needs-validation" novalidate>
                            <div class="carousel-item active" data-item='0'>
                                <div class="form-group">
                                    <label for="existingLitEventName" class="fw-bold"><?php
                                        echo _("Choose the liturgical event for which you would like to create a test");
                                    ?>:</label>
                                    <input list="existingLitEventsList" class="form-control existingLitEventName" id="existingLitEventName" required>
                                    <div class="invalid-feedback"><?php
                                        echo _("This liturgical event does not seem to exist? Please choose from a value in the list.");
                                    ?></div>
                                </div>
                                <div class="form-group mt-5">
                                    <label for="newUnitTestDescription"><?php echo _('Description') ?></label>
                                    <textarea class="form-control" id="newUnitTestDescription" rows=2
                                        placeholder="Describe what the test intends to accomplish"></textarea>
                                </div>
                            </div>
                            <div class="carousel-item" data-item='1'>
                                <div class="form-group">
                                    <label class="fw-bold" for="yearSinceUntilShadow"><?php echo _('Years to test'); ?></label><br>
                                    <div>
                                        <small>
                                            <p class="text-muted lh-sm">
                                                <small><?php echo _('First choose the range of years that we will be testing.'); ?></small>
                                                <small class="exactCorrespondenceSince d-none"> &#x28;<i><?php
                                                    echo _('This range should include a few years before the year in which the liturgical event should start to exist.');
                                                ?></i>&#x29; </small>
                                                <small class="exactCorrespondenceUntil d-none"> &#x28;<i><?php
                                                    echo _('This range should include a few years after the year in which the liturgical event should cease to exist.');
                                                ?></i>&#x29; </small>
                                                <small><?php
                                                    echo _('You can then remove any years that won\'t be needed.');
                                                ?></small>
                                                <small class="exactCorrespondenceSince d-none"> <?php
                                                    echo _(
                                                        'Finally, set the year from which the liturgical event should exist '
                                                        . 'by clicking on the hammer icon inside one of the years in the range.'
                                                    );
                                                    ?> </small>
                                                <small class="exactCorrespondenceUntil d-none"> <?php
                                                    echo _(
                                                        'Finally, set the year until which the liturgical event should exist '
                                                        . 'by clicking on the hammer icon inside one of the years in the range.'
                                                    );
                                                    ?> </small>
                                                <small class="variableCorrespondence d-none"> <?php
                                                    echo _(
                                                        'Finally, set the years in which the liturgical event shouldn\'t exist '
                                                        . 'by clicking on the hammer icon inside the years in the range.'
                                                    );
                                                    ?></small>
                                            </p>
                                            <p class="text-muted lh-sm"><?php
                                                echo _("First choose the range of years that we will be testing.");
                                            ?></p>
                                        </small>
                                    </div>
                                    <!-- Double range slider (flat design)  -->
                                    <div class="range-slider flat" id="yearsToTestRangeSlider" data-ticks-position='top'>
                                        <input type="range" id="lowerRange" min="1970" max="2049" value="1999"
                                            oninput="this.parentNode.style.setProperty('--value-a',this.value); this.parentNode.style.setProperty('--text-value-a', JSON.stringify(this.value))">
                                        <output></output>
                                        <input type="range" id="upperRange" min="1971" max="2050" value="2030"
                                            oninput="this.parentNode.style.setProperty('--value-b',this.value); this.parentNode.style.setProperty('--text-value-b', JSON.stringify(this.value))">
                                        <output></output>
                                        <div class='range-slider__progress'></div>
                                    </div>
                                    <div id="yearsToTestGrid"></div>
                                    <input type="number" class="invisible" id="yearSinceUntilShadow" value="1970" required>
                                    <div class="invalid-feedback exactCorrespondenceSince d-none"><?php
                                        echo _("Please set the year from which the liturgical event should exist.");
                                    ?></div>
                                    <div class="invalid-feedback exactCorrespondenceUntil d-none"><?php
                                        echo _("Please set the year until which the liturgical event should exist.");
                                    ?></div>
                                    <div class="invalid-feedback variableCorrespondence d-none"><?php
                                        echo _("Please set the years in which the liturgical event should not exist.");
                                    ?></div>
                                </div>
                            </div>
                            <div class="carousel-item" data-item='2'>
                                <div class="form-group">
                                    <label class="fw-bold" for="baseDate"><?php echo _("Set the base date for this liturgical event.") ?></label><br>
                                    <small><small><p class="lh-sm"><?php
                                        echo _(
                                            'If the liturgical event is mobile rather than fixed, set the date for the first year you are testing against. '
                                            . 'In any case you will later be able to adjust the date for each year if needed.'
                                        );
                                        ?></p></small></small>
                                    <input type="date" id="baseDate" min="1970-01-01" max="2050-12-31" class="form-control mt-4 w-25" required>
                                    <div class="invalid-feedback"><?php echo _("The date input cannot be empty."); ?></div>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-primary" type="button" id="carouselPrevButton"
                    data-bs-target="#carouselCreateNewUnitTest" data-bs-slide="prev" disabled><!-- class carousel-control-prev -->
                    <span class="fas fa-caret-left" aria-hidden="true"></span>
                    <span>Previous</span>
                </button>
                <button class="btn btn-primary" type="button" id="carouselNextButton"
                    data-bs-target="#carouselCreateNewUnitTest" data-bs-slide="next"><!-- class carousel-control-prev -->
                    <span>Next</span>
                    <span class="fas fa-caret-right" aria-hidden="true"></span>
                </button>
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><?php echo _('Close'); ?></button>
                <button type="button" class="btn btn-primary" id="btnCreateTest" disabled><?php echo _('Create test'); ?></button>
            </div>
        </div>
    </div>
</div>

<datalist id="existingLitEventsList">
<?php
foreach ($LitCalAllLitEvents as $litEvent) {
    $dataMonth = '';
    $dataDay = '';
    $dataGrade = '';
    if (isset($litEvent["month"])) {
        $dataMonth = " data-month=\"{$litEvent["month"]}\"";
    }
    if (isset($litEvent["day"])) {
        $dataDay = " data-day=\"{$litEvent["day"]}\"";
    }
    if (isset($litEvent["grade"])) {
        $dataGrade = " data-grade=\"{$litEvent["grade"]}\"";
    }
    echo "<option value=\"{$litEvent["event_key"]}\"{$dataMonth}{$dataDay}{$dataGrade}>{$litEvent["name"]} ({$litEvent["grade_lcl"]})</option>";
}
?>
</datalist>
