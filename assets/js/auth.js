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

        const baseUrl = getBaseUrl();
        try {
            const response = await fetch(`${baseUrl}/auth/me`, {
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
        if (!this._validateBaseUrl('_doRefreshToken')) {
            throw new Error('API base URL is not configured');
        }

        const baseUrl = getBaseUrl();
        try {
            const response = await fetch(`${baseUrl}/auth/refresh`, {
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
                        message = error.message || message;
                    } catch {
                        // Response wasn't JSON, use raw text
                        message = text;
                    }
                }
                throw new Error(message);
            }

            // If logout started during the refresh, don't update cache
            if (this._isLoggingOut) {
                return true;
            }

            // Update auth cache after successful refresh
            await this.updateAuthCache();

            return true;
        } catch (error) {
            if (!this._isLoggingOut) {
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
                console.error('Auto-refresh failed:', error);
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
export { Auth, getBaseUrl };
