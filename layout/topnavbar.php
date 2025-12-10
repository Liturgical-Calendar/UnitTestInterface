    <!-- Topbar -->
    <nav class="sb-topnav navbar navbar-expand-lg navbar-light bg-white shadow">
        <!-- Navbar Brand -->
        <a class="navbar-brand text-danger ps-3" href="/">
            <i class="fas fa-cross me-2"></i><span class="d-none d-sm-inline">LitCal Accuracy Tests</span><span class="d-inline d-sm-none">LitCal</span>
        </a>
        <?php if (!defined('SIDEBAR') || true === SIDEBAR) { ?>
        <!-- Sidebar Toggle (Topbar) - only visible on lg+ screens where sidebar is shown -->
        <button class="btn btn-link btn-sm d-none d-lg-inline-block sidebarToggle" id="sidebarToggle" title="<?php echo _('Toggle sidebar'); ?>">
            <i class="fas fa-table-columns"></i>
        </button>
        <?php } ?>
        <!-- Mobile toggle button -->
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarContent" aria-controls="navbarContent" aria-expanded="false" aria-label="Toggle navigation">
            <span class="navbar-toggler-icon"></span>
        </button>
        <!-- Collapsible navbar content -->
        <div class="collapse navbar-collapse" id="navbarContent">
            <!-- Main navigation -->
            <ul class="navbar-nav me-auto mb-2 mb-lg-0 align-items-center">
                <li class="nav-item<?php echo $pageName === 'index' ? ' bg-info' : '' ?>">
                    <a class="nav-link<?php echo $pageName === 'index' ? ' active' : '' ?>" href="index.php">
                        <i class="fas fa-calendar-check me-1"></i><?php echo _('Calendars'); ?>
                    </a>
                </li>
                <li class="nav-item<?php echo $pageName === 'resources' ? ' bg-info' : '' ?>">
                    <a class="nav-link<?php echo $pageName === 'resources' ? ' active' : '' ?>" href="resources.php">
                        <i class="fas fa-folder-open me-1"></i><?php echo _('Resources'); ?>
                    </a>
                </li>
                <li class="vr mx-2 d-none d-lg-block"></li>
                <li class="nav-item d-flex align-items-center">
                    <label id="apiVersionsDropdown" for="apiVersionsDropdownItems" class="nav-link mb-0 pe-1">
                        <i class="fas fa-code-branch me-1"></i><span class="d-none d-xl-inline"><?php echo _("API Version"); ?></span>
                    </label>
                    <select class="form-select form-select-sm" style="width: auto;"
                        aria-labelledby="apiVersionsDropdown" id="apiVersionsDropdownItems">
                        <option id="apiVersion-dev" value="dev" selected>dev</option>
                        <option id="apiVersion-v4" value="v4">v4</option>
                        <option id="apiVersion-v5" value="v5">v5</option>
                    </select>
                </li>
            </ul>
            <!-- Right side items -->
            <ul class="navbar-nav align-items-center">
                <!-- Section 1: External links -->
                <li class="nav-item">
                    <a class="nav-link" href="https://litcal.johnromanodorazio.com" title="<?php echo _("LitCal Project"); ?>">
                        <span class="d-none d-xl-inline"><?php echo _("LitCal Project"); ?></span>
                        <i class="fas fa-arrow-up-right-from-square ms-1"></i>
                    </a>
                </li>
                <li class="nav-item me-3">
                    <a class="nav-link" href="https://github.com/Liturgical-Calendar/UnitTestInterface" target="_blank" title="GitHub repository">
                        <i class="fab fa-github"></i>
                    </a>
                </li>
                <?php if ($pageName === 'index' || $pageName === 'resources') { ?>
                <!-- Section 2: Websocket status -->
                <li class="nav-item me-3">
                    <div class="text-white bg-secondary px-2 py-1 rounded small" id="websocket-status">
                        <i class="fas fa-plug fa-fw"></i><span class="d-none d-md-inline"> <?php echo _("Websocket connection status"); ?></span>
                    </div>
                </li>
                <?php } ?>
                <!-- Section 3: Settings -->
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle" href="#" id="langChoicesDropdown" role="button"
                        data-bs-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                        <i class="fas fa-globe me-1"></i><span class="d-none d-md-inline"><?php
                            echo Locale::getDisplayLanguage($i18n->locale, $i18n->locale);
                        ?></span>
                    </a>
                    <div class="dropdown-menu dropdown-menu-end shadow" aria-labelledby="langChoicesDropdown" id="langChoicesDropdownItems">
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
                <?php
                // Check if JwtAuth is available (set by admin.php or other pages that include it)
                $navbarIsAuth = isset($isAuthenticated) ? $isAuthenticated : false;
                $navbarUsername = '';
                if ($navbarIsAuth && class_exists('LiturgicalCalendar\UnitTestInterface\JwtAuth')) {
                    $navbarUsername = \LiturgicalCalendar\UnitTestInterface\JwtAuth::getUsername() ?? _('Admin');
                }
                ?>
                <li class="nav-item me-3">
                    <a class="nav-link" href="/admin.php?apiVersion=dev" id="admin_url" title="<?php echo _("Accuracy Tests Admin"); ?>">
                        <i class="fas fa-gear"></i>
                    </a>
                </li>
                <?php
                // Only show login/user UI on pages that include the login modal (admin.php)
                $hasLoginModal = defined('HAS_LOGIN_MODAL') && HAS_LOGIN_MODAL === true;
                ?>
                <!-- Section 4: Login/User menu -->
                <li class="nav-item me-2 <?php echo ($hasLoginModal && !$navbarIsAuth) ? '' : 'd-none'; ?>" data-requires-no-auth>
                    <button class="btn btn-outline-primary btn-sm" id="loginBtn" title="<?php echo _('Login'); ?>">
                        <i class="fas fa-sign-in-alt me-1"></i><span class="d-none d-sm-inline"><?php echo _('Login'); ?></span>
                    </button>
                </li>
                <li class="nav-item me-2 <?php echo ($hasLoginModal && $navbarIsAuth) ? '' : 'd-none'; ?>" data-requires-auth>
                    <div class="btn-group" id="userMenu">
                        <span class="btn btn-outline-success btn-sm" id="userInfo">
                            <i class="fas fa-user me-1"></i><span id="username" class="d-none d-sm-inline"><?php echo htmlspecialchars($navbarUsername); ?></span>
                        </span>
                        <button class="btn btn-outline-danger btn-sm" id="logoutBtn" title="<?php echo _('Logout'); ?>">
                            <i class="fas fa-sign-out-alt"></i>
                        </button>
                    </div>
                </li>
            </ul>
        </div>
    </nav>
