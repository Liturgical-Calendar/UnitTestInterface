/**
 * Authentication helper module for JWT token management
 * Handles login, logout, and authentication state management
 *
 * Uses HttpOnly cookie-based authentication exclusively.
 * Cookies are set by the API and cannot be read by JavaScript.
 * Use checkAuthAsync() or isAuthenticatedCached() to verify authentication state.
 *
 * @module Auth
 */

// Get BaseUrl from global config (set by PHP in footer.php)
const getBaseUrl = () => {
    const config = window.LitCalConfig;
    if (!config) {
        console.error('LitCalConfig not found');
        return null;
    }
    const { API_PROTOCOL, API_HOST, API_PORT, API_BASE_PATH } = config;
    const isDefaultPort = (API_PROTOCOL === 'https' && API_PORT === 443) ||
                          (API_PROTOCOL === 'http' && API_PORT === 80);
    const basePath = API_BASE_PATH ? API_BASE_PATH.replace(/\/$/, '') : '';
    const hostWithPort = isDefaultPort
        ? `${API_PROTOCOL}://${API_HOST}`
        : `${API_PROTOCOL}://${API_HOST}:${API_PORT}`;
    return `${hostWithPort}${basePath}`;
};

/**
 * Where to ask about the current session.
 *
 * Under OIDC this must be this application's own endpoint rather than the API's: the API's /auth/me
 * verifies with its legacy HS256 service and rejects Zitadel tokens, so asking it would report a
 * Zitadel-authenticated user as logged out. auth/me.php publishes what JwtAuth resolved, which handles
 * both kinds — see src/JwtAuth.php.
 *
 * @returns {string} An absolute or same-origin URL.
 */
const authMeEndpoint = () => (
    window.LitCalConfig?.oidcEnabled ? '/auth/me.php' : `${getBaseUrl()}/auth/me`
);

/**
 * Where to renew the current session.
 *
 * The sibling of {@link authMeEndpoint}, and it exists because for a long time it did not (issue #93).
 * `oidcEnabled` was consulted for identity but not for renewal, so a Zitadel session was resolved locally
 * and then renewed against the API's legacy HS256 `/auth/refresh` — which knows nothing about it and
 * answers 400. The session expired with no renewal and the user was silently logged out; the most
 * expensive place it landed was the end of a test run, where the terminal `postRunResults()` then got a
 * 401 and the run was not stored.
 *
 * Any future "where do I ask about the session?" belongs beside these two, not inlined at a call site.
 * One branch answering for identity while another path assumed the API is exactly how they diverged.
 *
 * @returns {string} An absolute or same-origin URL.
 */
const authRefreshEndpoint = () => (
    window.LitCalConfig?.oidcEnabled ? '/auth/refresh.php' : `${getBaseUrl()}/auth/refresh`
);

/**
 * Did a failed refresh settle the question, or is it worth trying again?
 *
 * Most 4xx answers are the server's verdict on what we sent — a missing, expired, revoked or
 * already-rotated refresh token — and no amount of retrying changes that. Anything else (a 5xx,
 * `auth/refresh.php`'s own 503, or a network fault that produced no response at all) is transient, and
 * the auto-refresh timer runs every minute over the last five before expiry, so it has several more
 * chances to succeed against a session that is still perfectly valid.
 *
 * A range rather than a bare `401` because the two refresh endpoints disagree on which code to use:
 * `auth/refresh.php` answers 401, while the API's legacy HS256 endpoint answers **400** for the same
 * fact. Testing for 401 alone would leave every legacy deployment retrying a session that is over.
 *
 * **With two exceptions, because not every 4xx is about what we sent.** A 429 and a 408 are about the
 * request's *timing*, and this repository has a documented history of rate limits — see the
 * `/validations` note in CLAUDE.md — so a throttled renewal ending a valid session is a live scenario
 * rather than a theoretical one. `Oidc\Client::TRANSIENT_STATUSES` excludes the same two on the server
 * side, and the two lists must stay in step: the browser deciding a failure is final while the server
 * says try again later is exactly the disagreement this pairing exists to prevent.
 *
 * One predicate, two readers — `_doRefreshToken()` decides whether to drop the cached state, and
 * `startAutoRefresh()` decides whether to announce the session as expired. Those two must never
 * disagree: clearing the cache while still believing the session might come back leaves an
 * authenticated-looking page over nothing.
 *
 * @param {unknown} error An error thrown by the refresh path, possibly carrying a `status`.
 * @returns {boolean} True when the session is over and retrying cannot help.
 */
const TRANSIENT_REFRESH_STATUSES = [408, 429];

const isDefinitiveRefreshFailure = (error) => {
    const status = error?.status;
    if (!Number.isInteger(status) || status < 400 || status >= 500) {
        return false;
    }
    return !TRANSIENT_REFRESH_STATUSES.includes(status);
};

const Auth = {
    /**
     * Cached authentication state from /auth/me endpoint
     * @private
     */
    _cachedAuthState: null,

    /**
     * Cache expiry timestamp (milliseconds since epoch)
     * @private
     */
    _cacheExpiry: 0,

    /**
     * Cache duration in milliseconds (1 minute)
     * @private
     */
    _cacheDuration: 60000,

    /**
     * Interval IDs for auto-refresh and expiry warning timers
     * @private
     */
    _autoRefreshInterval: null,
    _expiryWarningInterval: null,

    /**
     * Promise for in-flight token refresh to prevent race conditions
     * @private
     */
    _refreshPromise: null,

    /**
     * Flag to prevent token writes during logout
     * @private
     */
    _isLoggingOut: false,

    /**
     * Validate that BaseUrl is defined before making API calls
     * @private
     * @param {string} methodName - Name of the calling method for error messages
     * @returns {boolean} True if BaseUrl is valid, false otherwise
     */
    _validateBaseUrl(methodName) {
        const baseUrl = getBaseUrl();
        if (!baseUrl) {
            console.error(`Auth.${methodName}: BaseUrl is not defined - cannot make API request`);
            return false;
        }
        return true;
    },

    /**
     * Login with username and password
     *
     * The API sets HttpOnly cookies for the tokens automatically.
     * No client-side token storage is performed.
     *
     * @param {string} username - User's username
     * @param {string} password - User's password
     * @param {boolean} rememberMe - Passed to API to control cookie persistence
     * @returns {Promise<Object>} Authentication response
     * @throws {Error} When login fails
     */
    async login(username, password, rememberMe = false) {
        if (!this._validateBaseUrl('login')) {
            throw new Error('API base URL is not configured');
        }

        const baseUrl = getBaseUrl();
        try {
            const response = await fetch(`${baseUrl}/auth/login`, {
                method: 'POST',
                credentials: 'include', // Include cookies for cross-origin requests
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ username, password, remember_me: rememberMe })
            });

            if (!response.ok) {
                let message = 'Login failed';
                const text = await response.text();
                if (text) {
                    try {
                        const error = JSON.parse(text);
                        message = error.message || message;
                    } catch {
                        // Response wasn't JSON, use raw text
                        message = text;
                    }
                }
                throw new Error(message);
            }

            const data = await response.json();

            // Update auth cache immediately after successful login
            await this.updateAuthCache();

            // Clear any legacy tokens from localStorage/sessionStorage
            this.clearTokens(true);

            return data;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    },

    /**
     * Remove all legacy tokens from localStorage/sessionStorage
     *
     * @param {boolean} preserveCache - If true, only clear legacy tokens without touching auth cache
     */
    clearTokens(preserveCache = false) {
        // Clear auth cache unless preserveCache is true
        if (!preserveCache) {
            this._cachedAuthState = null;
            this._cacheExpiry = 0;
        }

        // Clear legacy tokens from storage (if any exist from previous implementations)
        try {
            localStorage.removeItem('litcal_jwt_token');
            sessionStorage.removeItem('litcal_jwt_token');
            localStorage.removeItem('litcal_refresh_token');
            sessionStorage.removeItem('litcal_refresh_token');
        } catch (e) {
            // Storage may be unavailable in hardened privacy modes
            console.warn('Unable to clear token storage:', e.message);
        }
    },

    /**
     * Check if user is authenticated (synchronous, uses cache)
     *
     * Returns the "last known good" authentication state from cache.
     * This method ignores cache expiry to prevent UI flicker when cache
     * expires but user is still logged in.
     *
     * @returns {boolean} True if last known state was authenticated, false otherwise
     */
    isAuthenticated() {
        return Boolean(this._cachedAuthState?.authenticated);
    },

    /**
     * Check if user is authenticated (synchronous, uses cache)
     * Returns null if auth state is unknown (never checked or cache expired)
     *
     * Three possible return values:
     * - true: definitely logged in (server confirmed)
     * - false: definitely logged out (server confirmed)
     * - null: unknown (never checked or cache expired)
     *
     * @returns {boolean|null} True/false if auth state known, null if unknown
     */
    isAuthenticatedCached() {
        const now = Date.now();

        // Check if cache is valid
        if (this._cachedAuthState !== null && now < this._cacheExpiry) {
            return this._cachedAuthState.authenticated === true;
        }

        // Cache expired or never populated - auth state unknown
        return null;
    },

    /**
     * Check if auth state is known (has been checked with server)
     *
     * @returns {boolean} True if auth state is known (cached), false if unknown
     */
    isAuthStateKnown() {
        const now = Date.now();
        return this._cachedAuthState !== null && now < this._cacheExpiry;
    },

    /**
     * Update the auth cache by fetching from /auth/me
     *
     * @returns {Promise<Object>} Auth state object with authenticated property
     */
    async updateAuthCache() {
        const state = await this.checkAuthAsync();
        this._cachedAuthState = state;
        this._cacheExpiry = Date.now() + this._cacheDuration;
        return state;
    },

    /**
     * Check authentication state with the server
     * Calls /auth/me endpoint to verify session (works with HttpOnly cookies)
     *
     * Returns an object with authenticated property:
     * - { authenticated: true, username, roles, exp, ... } if logged in
     * - { authenticated: false } if not logged in
     * - { authenticated: false, error: true } if network/API error occurred
     *
     * @returns {Promise<Object>} Auth state object (never null)
     */
    async checkAuthAsync() {
        if (!this._validateBaseUrl('checkAuthAsync')) {
            return { authenticated: false, error: true };
        }

        try {
            // Same-origin when OIDC is configured: the API's /auth/me verifies with its legacy HS256
            // service and rejects Zitadel tokens, so asking it would report a Zitadel-authenticated user
            // as logged out. This app's own auth/me.php publishes what JwtAuth resolved, which handles
            // both kinds — see src/JwtAuth.php.
            const response = await fetch(authMeEndpoint(), {
                method: 'GET',
                credentials: 'include', // Include cookies for cross-origin requests
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                return { authenticated: false };
            }

            const data = await response.json();
            return data.authenticated ? data : { authenticated: false };
        } catch (error) {
            console.error('Auth check failed:', error);
            return { authenticated: false, error: true };
        }
    },

    /**
     * Refresh access token using refresh token
     * Deduplicates concurrent refresh calls to prevent race conditions
     *
     * @returns {Promise<boolean>} True if refresh succeeded
     * @throws {Error} When refresh fails
     */
    async refreshToken() {
        // Deduplicate concurrent refresh calls
        if (this._refreshPromise) {
            return this._refreshPromise;
        }

        this._refreshPromise = this._doRefreshToken();
        try {
            return await this._refreshPromise;
        } finally {
            this._refreshPromise = null;
        }
    },

    /**
     * Internal method to perform the actual token refresh
     *
     * The API reads the refresh token from HttpOnly cookies and sets
     * new access/refresh tokens as HttpOnly cookies in the response.
     *
     * @private
     * @returns {Promise<boolean>} True if refresh succeeded
     * @throws {Error} When refresh fails
     */
    async _doRefreshToken() {
        // Only the legacy path needs the API's base URL. Under OIDC the endpoint is same-origin, and
        // requiring a configured API host to renew a Zitadel session would be a dependency it has not had
        // since auth/refresh.php existed.
        const oidc = Boolean(window.LitCalConfig?.oidcEnabled);
        if (!oidc && !this._validateBaseUrl('_doRefreshToken')) {
            throw new Error('API base URL is not configured');
        }

        try {
            const response = await fetch(authRefreshEndpoint(), {
                method: 'POST',
                credentials: 'include', // Include cookies for cross-origin requests
                headers: {
                    'Accept': 'application/json'
                }
                // No body needed - refresh token is read from HttpOnly cookie
            });

            if (!response.ok) {
                let message = 'Token refresh failed';
                const text = await response.text();
                if (text) {
                    try {
                        const error = JSON.parse(text);
                        message = error.message || error.error || message;
                    } catch {
                        // Response wasn't JSON, use raw text
                        message = text;
                    }
                }
                const err = new Error(message);
                // The status is what tells a caller whether to give up; see
                // {@link isDefinitiveRefreshFailure}. Parsing it back out of the message string would be
                // the fragile alternative — `postRunResults()` in testResults.js carries it the same way
                // and for the same reason.
                err.status = response.status;
                throw err;
            }

            // If logout started during the refresh, don't update cache
            if (this._isLoggingOut) {
                return true;
            }

            // Update auth cache after successful refresh
            await this.updateAuthCache();

            return true;
        } catch (error) {
            // Cleared only when the failure settles the question. This used to clear on *any* thrown
            // error, so one unreachable provider or dropped connection discarded a session that was
            // still valid and had minutes left to retry in. A transient failure leaves the cache alone
            // and the error propagates for the caller to decide about.
            if (!this._isLoggingOut && isDefinitiveRefreshFailure(error)) {
                this.clearTokens();
            }
            throw error;
        }
    },

    /**
     * Logout user
     * Calls logout endpoint and clears all tokens
     *
     * @returns {Promise<void>}
     */
    async logout() {
        // Set flag immediately to prevent in-flight refresh from writing tokens
        this._isLoggingOut = true;

        // Stop all timers first to prevent any new refresh attempts
        this.stopAllTimers();

        // Null out any pending refresh promise to prevent token writes
        this._refreshPromise = null;

        const baseUrl = getBaseUrl();
        // Attempt server logout to clear HttpOnly cookies
        if (this._validateBaseUrl('logout')) {
            try {
                await fetch(`${baseUrl}/auth/logout`, {
                    method: 'POST',
                    credentials: 'include', // Include cookies for cross-origin requests
                    headers: {
                        'Accept': 'application/json'
                    }
                });
            } catch (error) {
                console.error('Logout error:', error);
            }
        }

        this.clearTokens();
        this._isLoggingOut = false;
        window.location.reload(); // Refresh to reset UI state
    },

    /**
     * Auto-refresh tokens before expiry
     * Checks every minute and refreshes if less than 5 minutes until expiry.
     * Uses cached auth state to determine expiry time.
     */
    startAutoRefresh() {
        // Prevent multiple concurrent intervals
        if (this._autoRefreshInterval !== null) {
            console.warn('Auto-refresh already running');
            return;
        }

        const checkInterval = 60000; // Check every minute

        this._autoRefreshInterval = setInterval(async () => {
            // Check cached auth state
            if (!this._cachedAuthState || !this._cachedAuthState.exp) return;

            try {
                const now = Math.floor(Date.now() / 1000);
                const timeUntilExpiry = this._cachedAuthState.exp - now;

                // Refresh if less than 5 minutes until expiry
                if (timeUntilExpiry < 300 && timeUntilExpiry > 0) {
                    await this.refreshToken();
                    console.log('Token refreshed automatically');
                }
            } catch (error) {
                // A definitive rejection ends the session, and saying nothing would leave an
                // authenticated-looking navbar and an enabled Run Tests button above a session that no
                // longer exists — the user would find out at the end of a run, when the terminal
                // postRunResults() came back 401 and the run was not stored. The timers stop because
                // there is nothing left to renew, and the page is told so it can catch up.
                if (isDefinitiveRefreshFailure(error)) {
                    console.warn('Session could not be renewed; treating it as expired.', error);
                    this.stopAllTimers();
                    document.dispatchEvent(new CustomEvent('auth:session-expired'));
                    return;
                }
                // Transient. The access token has not expired yet — this runs every minute over the
                // last five — so the right response is to let the next tick try again, not to end a
                // session that is still valid.
                console.error('Auto-refresh failed; will retry before expiry:', error);
            }
        }, checkInterval);
    },

    /**
     * Stop auto-refresh timer
     */
    stopAutoRefresh() {
        if (this._autoRefreshInterval !== null) {
            clearInterval(this._autoRefreshInterval);
            this._autoRefreshInterval = null;
        }
    },

    /**
     * Show warning before token expiry
     * Checks every 30 seconds and warns if less than 2 minutes until expiry
     *
     * @param {Function} warningCallback - Function to call with seconds until expiry.
     *                                     Caller is responsible for i18n/message formatting.
     */
    startExpiryWarning(warningCallback) {
        // Prevent multiple concurrent intervals
        if (this._expiryWarningInterval !== null) {
            console.warn('Expiry warning already running');
            return;
        }

        this._expiryWarningInterval = setInterval(() => {
            // Check cached auth state
            if (!this._cachedAuthState || !this._cachedAuthState.exp) return;

            try {
                const now = Math.floor(Date.now() / 1000);
                const timeUntilExpiry = this._cachedAuthState.exp - now;

                // Warn if less than 2 minutes until expiry
                if (timeUntilExpiry > 0 && timeUntilExpiry < 120) {
                    warningCallback(timeUntilExpiry);
                }
            } catch (error) {
                console.error('Expiry warning check failed:', error);
            }
        }, 30000); // Check every 30 seconds
    },

    /**
     * Stop expiry warning timer
     */
    stopExpiryWarning() {
        if (this._expiryWarningInterval !== null) {
            clearInterval(this._expiryWarningInterval);
            this._expiryWarningInterval = null;
        }
    },

    /**
     * Stop all timers (auto-refresh and expiry warning)
     * Useful when cleaning up or logging out
     */
    stopAllTimers() {
        this.stopAutoRefresh();
        this.stopExpiryWarning();
    },

    /**
     * Check user role (for future RBAC implementation)
     * Uses cached auth state from /auth/me endpoint
     *
     * @param {string} role - Role to check
     * @returns {boolean} True if user has the role
     */
    hasRole(role) {
        if (!this._cachedAuthState || !this._cachedAuthState.authenticated) return false;

        const roles = this._cachedAuthState.roles;
        return roles && roles.includes(role);
    },

    /**
     * Get username from cached auth state
     *
     * @returns {string|null} Username or null if not authenticated
     */
    getUsername() {
        if (!this._cachedAuthState || !this._cachedAuthState.authenticated) return null;

        return this._cachedAuthState.username || null;
    }
};

// Warn if not using HTTPS in production
if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    console.warn('Authentication over HTTP is insecure. Use HTTPS in production.');
}

// Initialize auth state on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch auth state from server to populate cache
    let authState;
    try {
        authState = await Auth.updateAuthCache();
    } catch (error) {
        console.warn('Failed to initialize auth state on page load:', error);
        return;
    }

    if (authState && authState.authenticated) {
        // Start auto-refresh if authenticated
        Auth.startAutoRefresh();
    }
});

// Export for ES6 module usage
export { Auth, getBaseUrl, isDefinitiveRefreshFailure };
