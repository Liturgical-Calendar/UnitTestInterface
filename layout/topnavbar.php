    <!-- Topbar -->
    <nav class="sb-topnav navbar navbar-expand navbar-light bg-white shadow">
        <!-- Navbar Brand -->
        <a class="navbar-brand text-danger ps-3"><i class="me-3 fas fa-cross"></i>LitCal Accuracy Tests</a>
        <?php if (!defined('SIDEBAR') || true === SIDEBAR) { ?>
        <!-- Sidebar Toggle (Topbar) -->
        <button class="btn btn-link btn-sm order-1 order-lg-0 me-4 me-lg-0" id="sidebarToggle"><i class="fas fa-bars"></i></button>
        <?php } ?>
        <!-- Topbar Navbar -->
        <ul class="navbar-nav ms-auto ms-md-0 me-3 me-lg-4">
            <li class="nav-item ms-4<?php echo $pageName === 'index' ? ' bg-info' : '' ?>">
                <a class="nav-link<?php echo $pageName === 'index' ? ' active' : '' ?>" href="index.php"><?php echo _('Calendars'); ?></a>
            </li>
            <li class="nav-item ms-4<?php echo $pageName === 'resources' ? ' bg-info' : '' ?>">
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
                    <option id="apiVersion-dev" value="dev" selected>dev (development)</option>
                    <option id="apiVersion-v4" value="v4">v4</option>
                    <option id="apiVersion-v5" value="v5">v5 (latest)</option>
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
        <?php
        // Check if JwtAuth is available (set by admin.php or other pages that include it)
        $navbarIsAuth = isset($isAuthenticated) ? $isAuthenticated : false;
        $navbarUsername = '';
        if ($navbarIsAuth && class_exists('LiturgicalCalendar\UnitTestInterface\JwtAuth')) {
            $navbarUsername = \LiturgicalCalendar\UnitTestInterface\JwtAuth::getUsername() ?? _('Admin');
        }
        ?>
        <a class="btn btn-outline-light text-dark border-0 fw-bold"
            href="/admin.php?apiVersion=dev"
            id="admin_url"
            title="<?php echo _("Accuracy Tests Admin"); ?>">
            <i class="fas fa-gear"></i>
        </a>
        <a class="btn btn-outline-light text-dark border-0 me-2"
            href="https://github.com/Liturgical-Calendar/UnitTestInterface" target="_blank"
            title="See the Github repository">
            <i class="fab fa-github"></i>
        </a>
        <?php
        // Only show login/user UI on pages that include the login modal (admin.php)
        // Other pages should use the gear icon to navigate to admin.php for login
        $hasLoginModal = defined('HAS_LOGIN_MODAL') && HAS_LOGIN_MODAL === true;
        ?>
        <!-- Login button (shown when not authenticated, only on pages with login modal) -->
        <button class="btn btn-outline-primary btn-sm me-2 <?php echo ($hasLoginModal && !$navbarIsAuth) ? '' : 'd-none'; ?>" id="loginBtn" title="<?php echo _('Login'); ?>" data-requires-no-auth>
            <i class="fas fa-sign-in-alt me-1"></i><?php echo _('Login'); ?>
        </button>
        <!-- User menu (shown when authenticated, only on pages with login modal) -->
        <div class="btn-group me-2 <?php echo ($hasLoginModal && $navbarIsAuth) ? '' : 'd-none'; ?>" id="userMenu" data-requires-auth>
            <span class="btn btn-outline-success btn-sm" id="userInfo">
                <i class="fas fa-user me-1"></i><span id="username"><?php echo htmlspecialchars($navbarUsername); ?></span>
            </span>
            <button class="btn btn-outline-danger btn-sm" id="logoutBtn" title="<?php echo _('Logout'); ?>">
                <i class="fas fa-sign-out-alt"></i>
            </button>
        </div>
    </nav>
