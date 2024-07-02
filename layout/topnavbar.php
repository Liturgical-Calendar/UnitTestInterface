    <!-- Topbar -->
    <nav class="sb-topnav navbar navbar-expand navbar-light bg-white shadow">
        <!-- Navbar Brand -->
        <a class="navbar-brand text-danger ps-3"><i class="me-3 fas fa-cross"></i>LitCal Unit Tests</a>
        <?php if (!defined('SIDEBAR') || true === SIDEBAR) { ?>
        <!-- Sidebar Toggle (Topbar) -->
        <button class="btn btn-link btn-sm order-1 order-lg-0 me-4 me-lg-0" id="sidebarToggle"><i class="fas fa-bars"></i></button>
        <?php } ?>
        <!-- Topbar Navbar -->
        <ul class="navbar-nav ms-auto ms-md-0 me-3 me-lg-4">
            <li class="nav-item ms-4">
                <a class="nav-link<?php echo $pageName === 'index' ? ' active' : '' ?>" href="index.php"><?php echo _('Calendars'); ?></a>
            </li>
            <li class="nav-item ms-4">
                <a class="nav-link<?php echo $pageName === 'resources' ? ' active' : '' ?>" href="resources.php"><?php echo _('Resources'); ?></a>
            </li>
            <li class="nav-item ms-4">
                <label id="apiVersionsDropdown" for="apiVersionsDropdownItems" class="nav-link"><i class="fas fa-code-branch me-2"></i><?php
                    echo _("API Version");
                ?></label>
            </li>
            <li>
                <select class="form-select"
                    aria-labelledby="apiVersionsDropdown" id="apiVersionsDropdownItems">
                    <!-- v3 is not a viable option since it didn't use JSON unit test files -->
                    <!-- <option id="apiVersion-v3" value="v3">v3 (latest stable)</option> -->
                    <option id="apiVersion-v9" value="v9">v9 (experimental)</option>
                    <option id="apiVersion-dev" value="dev">dev (development)</option>
                </select>
            </li>
        </ul>
        <ul class="navbar-nav ms-auto">
            <li class="nav-item dropdown me-4">
                <a class="nav-link dropdown-toggle btn btn-outline-light border-0"
                    href="#" id="langChoicesDropdown" role="button"
                    data-bs-toggle="dropdown"
                    aria-haspopup="true" aria-expanded="false"
                ><i class="fas fa-globe me-2"></i><?php
                    echo Locale::getDisplayLanguage($i18n->locale, $i18n->locale);
                ?>
                </a>
                <div class="dropdown-menu dropdown-menu-end shadow animated--grow-in"
                    aria-labelledby="langChoicesDropdown" id="langChoicesDropdownItems">
                    <?php
                    foreach ($i18n->langsAssoc as $key => $lang) {
                        $classList = substr($i18n->locale, 0, 2) === $key ? "dropdown-item active" : "dropdown-item";
                        $isoLang = strtoupper($key);
                        $displayName = Locale::getDisplayLanguage($key, 'en');
                        echo "<a class=\"$classList\" id=\"langChoice-$key\" href=\"#\" title=\"$displayName\">"
                            . "<span class=\"d-none d-md-inline\">$lang</span><span class=\"d-inline d-md-none\">$isoLang</span>"
                            . "</a>";
                    }
                    ?>
                </div>
            </li>
            <?php if ($pageName === 'index' || $pageName === 'resources') { ?>
            <li class="me-2">
                <div class="text-white bg-secondary p-2" id="websocket-status"><i class="fas fa-plug fa-fw"></i> <?php
                    echo _("Websocket connection status");
                ?></div>
            </li>
            <?php } ?>
            <li class="nav-item ms-2">
                <a class="nav-link btn btn-outline-light border-0 fw-bold" href="https://litcal.johnromanodorazio.com"><?php
                    echo _("LitCal Project");
                ?><i class="fas fa-arrow-up-right-from-square ms-2"></i>
                </a>
            </li>
        </ul>
        <a class="btn btn-outline-light text-dark border-0 fw-bold"
            href="/admin.php?apiVersion=dev"
            id = "admin_url"
            title="<?php echo _("Unit Tests Admin"); ?>">
            <i class="fas fa-cog"></i>
        </a>
        <a class="btn btn-outline-light text-dark border-0 me-2"
            href="https://github.com/Liturgical-Calendar/UnitTestInterface" target="_blank"
            title="See the Github repository">
            <i class="fab fa-github"></i>
        </a>
    </nav>
