<!-- Page Wrapper -->
<div id="layoutSidenav">

    <!-- Sidebar wrapper (layoutSidenav_nav) -->
    <div id="layoutSidenav_nav">
        <!-- Sidebar -->
        <nav class="sb-sidenav accordion sb-sidenav-dark bg-gradient" id="accordionSidebar">
            <div class="sb-sidenav-menu">
                <div class="nav">
                    <!-- Sidebar - Brand -->
                    <div class="text-center lh-2 px-5 pt-2 sidebar-brand">
                        <a class="text-uppercase fs-6 fw-bold text-white text-decoration-none" href="/admin.php">
                            <?php echo _("Catholic Liturgical Calendar"); ?>
                        </a>
                    </div>
                    <!-- <hr> -->
                    <a class="nav-link<?php echo $pageName === 'index' ? ' active' : '' ?>" href="/">
                        <i class="sb-nav-link-icon fas fa-house"></i>
                        <span><?php echo _("Unit Tests Runner"); ?></span>
                    </a>
                    <a class="nav-link<?php echo $pageName === 'admin' ? ' active' : '' ?>" href="/admin.php">
                        <i class="sb-nav-link-icon fas fa-cog"></i>
                        <span><?php echo _("Unit Tests Admin"); ?></span>
                    </a>
                </div>
            </div>
            <div class="sb-sidenav-footer">
                <!-- Sidebar Toggler (Sidebar) -->
                <div class="text-center">
                    <button type="button" class="btn btn-secondary rounded-circle border-0 sidebarToggle" id="sidebarToggleB"><i class="fas fa-angle-left"></i></button>
                </div>
            </div>
        </nav>
        <!-- End Sidebar -->
    </div>
    <!-- End Sidebar wrapper (layoutSidenav_nav) -->

<!-- Content Wrapper -->
<div id="layoutSidenav_content" class="pt-4">
