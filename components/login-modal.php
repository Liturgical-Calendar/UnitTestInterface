<!-- Session Expiry Warning Toast -->
<div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 1090;">
    <div id="sessionExpiryToast" class="toast bg-white text-dark border-warning" role="alert" aria-live="assertive" aria-atomic="true" data-bs-autohide="false">
        <div class="toast-header bg-warning text-dark">
            <i class="fas fa-clock me-2"></i>
            <strong class="me-auto"><?php echo _('Session Expiring'); ?></strong>
        </div>
        <div class="toast-body bg-white text-dark">
            <p id="sessionExpiryMessage" class="mb-3"></p>
            <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-sm btn-outline-secondary" id="sessionExpiryLogout">
                    <i class="fas fa-sign-out-alt me-1"></i><?php echo _('Logout'); ?>
                </button>
                <button type="button" class="btn btn-sm btn-primary" id="sessionExpiryExtend">
                    <i class="fas fa-refresh me-1"></i><?php echo _('Extend Session'); ?>
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Login Modal for JWT Authentication -->
<div class="modal fade" id="loginModal" tabindex="-1" aria-labelledby="loginModalLabel" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="loginModalLabel"><?php echo _('Administrator Login'); ?></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <form id="loginForm">
                    <div class="mb-3">
                        <label for="loginUsername" class="form-label"><?php echo _('Username'); ?></label>
                        <input type="text" class="form-control" id="loginUsername" name="username" required autocomplete="username">
                    </div>
                    <div class="mb-3">
                        <label for="loginPassword" class="form-label"><?php echo _('Password'); ?></label>
                        <div class="input-group">
                            <input type="password" class="form-control" id="loginPassword" name="password" required autocomplete="current-password">
                            <button class="btn btn-outline-secondary" type="button" id="togglePassword" title="<?php echo _('Show password'); ?>">
                                <i class="fas fa-eye" id="togglePasswordIcon"></i>
                            </button>
                        </div>
                    </div>
                    <div class="mb-3 form-check">
                        <input type="checkbox" class="form-check-input" id="rememberMe" name="rememberMe">
                        <label class="form-check-label" for="rememberMe"><?php echo _('Remember me'); ?></label>
                    </div>
                    <div class="alert alert-danger d-none" id="loginError" role="alert"></div>
                    <!-- Hidden submit button to enable Enter key submission -->
                    <button type="submit" class="d-none" aria-hidden="true"></button>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal"><?php echo _('Cancel'); ?></button>
                <button type="button" class="btn btn-primary" id="loginSubmit"><?php echo _('Login'); ?></button>
            </div>
        </div>
    </div>
</div>

<script type="module">
import { Auth } from './assets/js/auth.js';

// Make Auth available globally for non-module scripts
window.Auth = Auth;

// Localized strings injected from PHP
const i18n = {
    admin: '<?php echo _('Admin'); ?>'
};

// Module-scoped variables to avoid global pollution
let loginModal = null;
let loginSuccessCallback = null;
let expiryWarningShown = false;
let sessionExpiryToast = null;
let sessionExpiryTimeout = null;

/**
 * Initialize authentication UI components
 * Uses async initialization to wait for auth cache to be populated
 */
document.addEventListener('DOMContentLoaded', async () => {
    // Wait for auth cache to be populated (auth.js may have already done this)
    if (Auth.isAuthenticatedCached() === null) {
        // First attempt - quick check
        let authState = await Auth.updateAuthCache();

        // If first attempt failed, retry in background without blocking UI
        if (authState && authState.error) {
            // Initialize UI immediately with unauthenticated state
            updateNavbarAuthUI();
            initPermissionUI();

            // Retry in background
            const retryInBackground = async () => {
                const maxRetries = 2;
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    // Skip retry if user has since authenticated (e.g., via login modal)
                    if (Auth.isAuthenticatedCached() !== null) {
                        return;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    authState = await Auth.updateAuthCache();
                    if (!authState.error) {
                        // Success - update UI with actual auth state
                        updateNavbarAuthUI();
                        initPermissionUI();
                        if (authState.authenticated) {
                            Auth.startAutoRefresh();
                            startSessionExpiryWarning();
                        }
                        return;
                    }
                }
                // All retries failed
                const message = <?php echo json_encode(_('Unable to verify authentication status. The server may be unavailable.')); ?>;
                console.warn(message);
            };
            retryInBackground();
            return; // Exit early - UI already initialized
        }
    }

    // Initialize navbar UI based on current auth state (login button vs user menu)
    updateNavbarAuthUI();

    // Login button click handler
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            showLoginModal();
        });
    }

    // Logout button click handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (confirm(<?php echo json_encode(_('Are you sure you want to logout?')); ?>)) {
                // Clear session expiry timeout to avoid confusing auto-logout message
                if (sessionExpiryTimeout) {
                    clearTimeout(sessionExpiryTimeout);
                    sessionExpiryTimeout = null;
                }
                hideSessionExpiryToast();
                await Auth.logout();
                // Update navbar (login button vs user menu) and protected elements (data-requires-auth)
                updateNavbarAuthUI();
                initPermissionUI();
                // Dispatch event for page-specific form resets
                document.dispatchEvent(new CustomEvent('auth:logout'));
            }
        });
    }

    // Login form submit handler
    const loginSubmit = document.getElementById('loginSubmit');
    if (loginSubmit) {
        loginSubmit.addEventListener('click', async () => {
            await handleLogin();
        });
    }

    // Allow Enter key to submit login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleLogin();
        });
    }

    // Toggle password visibility
    const togglePassword = document.getElementById('togglePassword');
    if (togglePassword) {
        togglePassword.addEventListener('click', () => {
            const passwordInput = document.getElementById('loginPassword');
            const toggleIcon = document.getElementById('togglePasswordIcon');
            const toggleButton = document.getElementById('togglePassword');

            if (passwordInput && toggleIcon && toggleButton) {
                if (passwordInput.type === 'password') {
                    passwordInput.type = 'text';
                    toggleIcon.classList.remove('fa-eye');
                    toggleIcon.classList.add('fa-eye-slash');
                    toggleButton.title = <?php echo json_encode(_('Hide password')); ?>;
                } else {
                    passwordInput.type = 'password';
                    toggleIcon.classList.remove('fa-eye-slash');
                    toggleIcon.classList.add('fa-eye');
                    toggleButton.title = <?php echo json_encode(_('Show password')); ?>;
                }
            }
        });
    }

    // Initialize session expiry warning toast and its event handlers
    initSessionExpiryWarning();

    // Focus username input when login modal is shown
    const loginModalElement = document.getElementById('loginModal');
    if (loginModalElement) {
        loginModalElement.addEventListener('shown.bs.modal', () => {
            const usernameInput = document.getElementById('loginUsername');
            if (usernameInput) {
                usernameInput.focus();
            }
        });
    }

    // Initialize data-requires-auth elements (forms, buttons, etc.) based on current auth state
    initPermissionUI();
});

/**
 * Show login modal
 *
 * @param {Function} onSuccess - Callback to execute after successful login
 */
function showLoginModal(onSuccess = null) {
    // Always reset callback to prevent stale callbacks from previous modal opens
    loginSuccessCallback = null;

    // Guard against missing bootstrap or modal element
    if (typeof bootstrap === 'undefined') {
        console.error('Bootstrap library not loaded - cannot show login modal');
        return;
    }

    const loginModalElement = document.getElementById('loginModal');
    if (!loginModalElement) {
        console.error('Login modal element not found');
        return;
    }

    // Initialize modal instance only once
    if (!loginModal) {
        loginModal = new bootstrap.Modal(loginModalElement);
    }

    // Store success callback in module scope if provided
    if (onSuccess !== null) {
        if (typeof onSuccess === 'function') {
            loginSuccessCallback = onSuccess;
        } else {
            console.warn('showLoginModal: onSuccess callback should be a function');
        }
    }

    // Clear previous errors and form values
    const loginError = document.getElementById('loginError');
    const loginFormEl = document.getElementById('loginForm');

    if (loginError) {
        loginError.classList.add('d-none');
    }
    if (loginFormEl) {
        loginFormEl.reset();
    }

    loginModal.show();
}

// Expose showLoginModal globally for use by other scripts
window.showLoginModal = showLoginModal;

/**
 * Handle login form submission
 */
async function handleLogin() {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const rememberMeInput = document.getElementById('rememberMe');
    const errorDiv = document.getElementById('loginError');
    const loginSubmitBtn = document.getElementById('loginSubmit');

    // Guard against missing form elements
    if (!usernameInput || !passwordInput || !rememberMeInput || !errorDiv || !loginSubmitBtn) {
        console.error('Login form elements not found');
        return;
    }

    // Guard against rapid double-submits
    if (loginSubmitBtn.disabled) {
        return;
    }

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberMeInput.checked;

    if (!username || !password) {
        errorDiv.textContent = <?php echo json_encode(_('Please enter both username and password')); ?>;
        errorDiv.classList.remove('d-none');
        return;
    }

    try {
        // Show loading state
        loginSubmitBtn.disabled = true;
        loginSubmitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>' + <?php echo json_encode(_('Logging in...')); ?>;

        await Auth.login(username, password, rememberMe);

        // Hide modal with proper cleanup after transition
        const loginModalElement = document.getElementById('loginModal');
        if (loginModalElement && typeof bootstrap !== 'undefined') {
            const modalInstance = bootstrap.Modal.getInstance(loginModalElement);

            if (modalInstance) {
                modalInstance.hide();
            }
        }

        // Update navbar (login button vs user menu) and enable data-requires-auth elements
        updateNavbarAuthUI();
        initPermissionUI();
        document.dispatchEvent(new CustomEvent('auth:login'));

        // Start auto-refresh and expiry warning for new session
        Auth.startAutoRefresh();
        startSessionExpiryWarning();

        // Show success message
        console.log('Login successful');

        // Call success callback if provided
        if (loginSuccessCallback) {
            loginSuccessCallback();
            loginSuccessCallback = null;
        }
    } catch (error) {
        errorDiv.textContent = error.message || <?php echo json_encode(_('Login failed. Please check your credentials.')); ?>;
        errorDiv.classList.remove('d-none');
    } finally {
        // Reset button state
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.textContent = <?php echo json_encode(_('Login')); ?>;
    }
}

/**
 * Update navbar authentication UI based on auth state.
 *
 * Handles visibility of login button and user menu in the navbar.
 */
function updateNavbarAuthUI() {
    const isAuth = Auth.isAuthenticated();
    const loginBtn = document.getElementById('loginBtn');
    const userMenu = document.getElementById('userMenu');

    if (isAuth) {
        if (loginBtn) {
            loginBtn.classList.add('d-none');
        }
        if (userMenu) {
            userMenu.classList.remove('d-none');
        }

        // Display username
        const usernameElement = document.getElementById('username');
        if (usernameElement) {
            const authUsername = Auth.getUsername();
            usernameElement.textContent = authUsername || i18n.admin;
        }
    } else {
        if (loginBtn) {
            loginBtn.classList.remove('d-none');
        }
        if (userMenu) {
            userMenu.classList.add('d-none');
        }
    }
}

// Expose updateNavbarAuthUI globally
window.updateNavbarAuthUI = updateNavbarAuthUI;

/**
 * Initialize permission-based UI elements marked with data-requires-auth attribute.
 *
 * Handles three types of elements differently:
 * - FORM elements: Toggles opacity-50 class and disables/enables all child form controls
 * - Form controls (INPUT, SELECT, TEXTAREA): Only disables when logged out
 * - Other elements (buttons, divs): Toggles d-none class for visibility
 */
function initPermissionUI() {
    const protectedElements = document.querySelectorAll('[data-requires-auth]');
    const isAuth = Auth.isAuthenticated();
    const formControlTags = ['INPUT', 'SELECT', 'TEXTAREA'];

    protectedElements.forEach(el => {
        if (el.tagName === 'FORM') {
            // For forms, disable/enable all form controls inside
            const formControls = el.querySelectorAll('input, select, textarea, button');
            formControls.forEach(control => {
                if (!control.hasAttribute('data-requires-auth')) {
                    control.disabled = !isAuth;
                }
            });
            // Add visual indicator for disabled forms
            if (isAuth) {
                el.classList.remove('opacity-50');
            } else {
                el.classList.add('opacity-50');
            }
        } else if (formControlTags.includes(el.tagName)) {
            // For standalone form controls, set disabled based on auth state
            el.disabled = !isAuth;
        } else {
            // For other elements (buttons, etc.), only control visibility
            if (isAuth) {
                el.classList.remove('d-none');
            } else {
                el.classList.add('d-none');
            }
        }
    });
}

// Expose initPermissionUI globally
window.initPermissionUI = initPermissionUI;

/**
 * Format the session expiry message with proper localization
 *
 * @param {number} seconds - Seconds until session expires
 * @returns {string} Localized message
 */
function formatExpiryMessage(seconds) {
    // Clamp to minimum of 1 second to avoid "0 minutes" or negative values
    const clampedSeconds = Math.max(1, Math.floor(seconds));
    const minutes = Math.ceil(clampedSeconds / 60);
    const message = <?php echo json_encode(_('Your session will expire in less than %d minute(s).')); ?>;
    return message.replace('%d', minutes);
}

/**
 * Show the session expiry warning toast
 *
 * @param {number} timeUntilExpiry - Seconds until session expires
 */
function showSessionExpiryToast(timeUntilExpiry) {
    const toastElement = document.getElementById('sessionExpiryToast');
    const messageElement = document.getElementById('sessionExpiryMessage');

    if (!toastElement || !messageElement) {
        console.warn('Session expiry toast elements not found');
        return;
    }

    // Update the message with current time remaining
    messageElement.textContent = formatExpiryMessage(timeUntilExpiry);

    // Initialize Bootstrap Toast if not already done
    if (!sessionExpiryToast) {
        if (typeof bootstrap === 'undefined' || !bootstrap.Toast) {
            console.error('Bootstrap Toast is not available - cannot show session expiry toast');
            return;
        }
        sessionExpiryToast = new bootstrap.Toast(toastElement);
    }

    // Show the toast
    sessionExpiryToast.show();
}

/**
 * Hide the session expiry warning toast
 */
function hideSessionExpiryToast() {
    if (sessionExpiryToast) {
        sessionExpiryToast.hide();
    }
}

/**
 * Handle the "Extend Session" button click
 */
async function handleExtendSession() {
    const extendButton = document.getElementById('sessionExpiryExtend');
    const originalContent = extendButton ? extendButton.innerHTML : '';

    try {
        // Show loading state
        if (extendButton) {
            extendButton.disabled = true;
            extendButton.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>' +
                <?php echo json_encode(_('Extending...')); ?>;
        }

        // Clear the auto-logout timeout
        if (sessionExpiryTimeout) {
            clearTimeout(sessionExpiryTimeout);
            sessionExpiryTimeout = null;
        }

        // Refresh the token
        await Auth.refreshToken();

        // Hide the warning toast
        hideSessionExpiryToast();

        // Restart auto-refresh and expiry warning for the new session
        Auth.startAutoRefresh();
        startSessionExpiryWarning();

        console.log('Session extended successfully');
    } catch (error) {
        console.error('Failed to extend session:', error);

        // Show error to user before logout
        const messageElement = document.getElementById('sessionExpiryMessage');
        if (messageElement) {
            messageElement.textContent = <?php echo json_encode(_('Failed to extend session. Please login again.')); ?>;
        }
        // Brief delay to show the message
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Hide the warning and stop all auth timers
        hideSessionExpiryToast();
        if (sessionExpiryTimeout) {
            clearTimeout(sessionExpiryTimeout);
            sessionExpiryTimeout = null;
        }
        Auth.stopAllTimers();
        Auth.clearTokens();

        // Perform full logout sequence
        updateNavbarAuthUI();
        initPermissionUI();
        document.dispatchEvent(new CustomEvent('auth:logout'));

        showLoginModal();
    } finally {
        // Reset button state
        if (extendButton) {
            extendButton.disabled = false;
            extendButton.innerHTML = originalContent;
        }
    }
}

/**
 * Handle the "Logout" button click from the session expiry warning
 */
async function handleSessionExpiryLogout() {
    if (confirm(<?php echo json_encode(_('Are you sure you want to logout?')); ?>)) {
        // Clear the auto-logout timeout
        if (sessionExpiryTimeout) {
            clearTimeout(sessionExpiryTimeout);
            sessionExpiryTimeout = null;
        }
        hideSessionExpiryToast();
        await Auth.logout();
        updateNavbarAuthUI();
        initPermissionUI();
        document.dispatchEvent(new CustomEvent('auth:logout'));
    }
}

/**
 * Handle automatic logout when session expires
 */
function handleAutoLogout() {
    sessionExpiryTimeout = null;
    hideSessionExpiryToast();

    console.warn('Session expired. Please login again.');

    Auth.clearTokens();
    Auth.stopAllTimers();

    updateNavbarAuthUI();
    initPermissionUI();
    document.dispatchEvent(new CustomEvent('auth:logout'));
}

/**
 * Expiry warning callback
 *
 * @param {number} timeUntilExpiry - Seconds until token expires
 */
function expiryWarningCallback(timeUntilExpiry) {
    if (expiryWarningShown) {
        // Update the message if toast is already visible
        const messageElement = document.getElementById('sessionExpiryMessage');
        if (messageElement) {
            messageElement.textContent = formatExpiryMessage(timeUntilExpiry);
        }
        // Always (re)create the auto-logout timer to stay in sync with actual expiry time
        if (sessionExpiryTimeout) {
            clearTimeout(sessionExpiryTimeout);
        }
        sessionExpiryTimeout = setTimeout(handleAutoLogout, timeUntilExpiry * 1000);
        return;
    }

    expiryWarningShown = true;

    // Stop auto-refresh - user must explicitly extend session
    Auth.stopAutoRefresh();

    // Set auto-logout timer for when the token actually expires
    if (sessionExpiryTimeout) {
        clearTimeout(sessionExpiryTimeout);
    }
    sessionExpiryTimeout = setTimeout(handleAutoLogout, timeUntilExpiry * 1000);

    // Show the warning toast
    showSessionExpiryToast(timeUntilExpiry);
}

/**
 * Start or restart the session expiry warning timer
 */
function startSessionExpiryWarning() {
    // Only start expiry warnings when authenticated
    if (!Auth.isAuthenticated()) {
        return;
    }

    // Reset the warning flag
    expiryWarningShown = false;

    // Clear any existing auto-logout timeout
    if (sessionExpiryTimeout) {
        clearTimeout(sessionExpiryTimeout);
        sessionExpiryTimeout = null;
    }

    // Stop any existing expiry warning timer before starting a new one
    Auth.stopExpiryWarning();

    // Start the expiry warning timer with our callback
    Auth.startExpiryWarning(expiryWarningCallback);
}

/**
 * Initialize the session expiry warning system
 */
function initSessionExpiryWarning() {
    // Set up event handlers for toast buttons (only once)
    const extendButton = document.getElementById('sessionExpiryExtend');
    const logoutButton = document.getElementById('sessionExpiryLogout');

    if (extendButton) {
        extendButton.addEventListener('click', handleExtendSession);
    }

    if (logoutButton) {
        logoutButton.addEventListener('click', handleSessionExpiryLogout);
    }

    // Start the expiry warning timer
    startSessionExpiryWarning();
}
</script>
