<?php

/**
 * Server-side authentication state, resolved by asking the API.
 *
 * ## Why this does not verify anything itself
 *
 * It used to: it decoded the `litcal_access_token` cookie locally with `JWT::decode()` against a shared
 * `JWT_SECRET`, and required `type === 'access'`. That only ever understood the API's own HS256 tokens, so
 * once the project moved to Zitadel a perfectly valid RS256 access token — the one LiturgicalCalendarFrontend
 * writes into that same cookie — failed to decode and the user read as anonymous.
 *
 * Rather than teach this class a second validation path, it now forwards the cookie to `GET /auth/me` and
 * believes the answer. The API's `OidcAuthMiddleware` already reads that exact cookie, validates it RS256
 * against Zitadel's JWKS, and falls back to the legacy HS256 shape — so delegation covers **both** token
 * kinds, and the legacy fallback costs this repository nothing to keep working.
 *
 * There is deliberately no local-decode fallback for an unreachable API. This is a test interface *for*
 * that API; if it is down there is nothing useful to do, and a second validation path that could disagree
 * with the first is exactly the failure mode being removed. `JWT_SECRET` is no longer read.
 *
 * The public surface is unchanged, so `layout/head.php`, `layout/topnavbar.php` and `results.php` did not
 * have to change with it.
 */

namespace LiturgicalCalendar\UnitTestInterface;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use RuntimeException;

class JwtAuth
{
    private const COOKIE_NAME = 'litcal_access_token';

    /** How long to wait on /auth/me. Short: it gates page rendering. */
    private const TIMEOUT_SECONDS = 5;

    /**
     * @var object|null Cached identity for this request, shaped like the payload this class used to decode.
     */
    private static ?object $cachedPayload = null;

    /**
     * @var bool Whether the identity lookup has run. Distinct from the payload being non-null, so that an
     *           anonymous request costs one HTTP call rather than one per caller.
     */
    private static bool $resolved = false;

    /**
     * Kept for call-site compatibility. Configuration is read lazily, so there is nothing to initialize.
     */
    public static function init(): void
    {
    }

    /**
     * True when the API this class delegates to can be addressed.
     *
     * @return bool
     */
    public static function isConfigured(): bool
    {
        try {
            return '' !== ApiBase::resolve();
        } catch (RuntimeException) {
            return false;
        }
    }

    /**
     * Get the access token from the HttpOnly cookie.
     *
     * @return string|null The token or null if not present
     */
    public static function getToken(): ?string
    {
        $token = $_COOKIE[self::COOKIE_NAME] ?? null;
        return is_string($token) && '' !== $token ? $token : null;
    }

    /**
     * Resolve the caller's identity, asking the API at most once per request.
     *
     * @return object|null An object carrying `sub`, `roles` and `exp`, or null when not authenticated.
     */
    public static function verifyToken(): ?object
    {
        if (self::$resolved) {
            return self::$cachedPayload;
        }

        self::$resolved      = true;
        self::$cachedPayload = null;

        $token = self::getToken();
        if (null === $token) {
            return null;
        }

        try {
            $base = ApiBase::resolve();
        } catch (RuntimeException $e) {
            error_log('JwtAuth: cannot resolve the API base URL: ' . $e->getMessage());
            return null;
        }

        try {
            $response = ( new Client(['timeout' => self::TIMEOUT_SECONDS, 'http_errors' => false]) )
                ->get($base . '/auth/me', [
                    'headers' => [
                        'Accept' => 'application/json',
                        // Forwarded rather than relying on a cookie jar: this is a server-to-server call
                        // made on behalf of the browser, and the API reads this exact cookie name.
                        'Cookie' => self::COOKIE_NAME . '=' . $token,
                    ],
                ]);
        } catch (GuzzleException $e) {
            // A transport failure is not an authorization decision, but it cannot be treated as success.
            error_log('JwtAuth: /auth/me is unreachable: ' . $e->getMessage());
            return null;
        }

        if (200 !== $response->getStatusCode()) {
            return null;
        }

        /** @var array<string, mixed>|null $body */
        $body = json_decode((string) $response->getBody(), true);
        if (!is_array($body) || true !== ( $body['authenticated'] ?? false )) {
            return null;
        }

        self::$cachedPayload = (object) [
            // `sub` rather than `username` so getUsername() keeps working unchanged.
            'sub'   => is_string($body['username'] ?? null) ? $body['username'] : null,
            'roles' => is_array($body['roles'] ?? null) ? $body['roles'] : [],
            'exp'   => is_int($body['exp'] ?? null) ? $body['exp'] : null,
        ];

        return self::$cachedPayload;
    }

    /**
     * Check if the current request is authenticated.
     *
     * @return bool True if the API recognises the token
     */
    public static function isAuthenticated(): bool
    {
        return self::verifyToken() !== null;
    }

    /**
     * Get the authenticated username.
     *
     * @return string|null Username or null if not authenticated
     */
    public static function getUsername(): ?string
    {
        $payload = self::verifyToken();
        if ($payload === null || !is_object($payload)) {
            return null;
        }
        return $payload->sub ?? null;
    }

    /**
     * Get the authenticated user's roles.
     *
     * @return array<int, string> Array of role strings
     */
    public static function getRoles(): array
    {
        $payload = self::verifyToken();
        if ($payload === null || !is_object($payload)) {
            return [];
        }
        return is_array($payload->roles ?? null) ? $payload->roles : [];
    }

    /**
     * Check if the authenticated user has a specific role.
     *
     * @param string $role Role to check
     * @return bool True if user has the role
     */
    public static function hasRole(string $role): bool
    {
        return in_array($role, self::getRoles(), true);
    }

    /**
     * Get the token expiry timestamp.
     *
     * @return int|null Unix timestamp or null if not authenticated
     */
    public static function getExpiry(): ?int
    {
        $payload = self::verifyToken();
        if ($payload === null || !is_object($payload)) {
            return null;
        }
        return $payload->exp ?? null;
    }

    /**
     * Clear the cached identity (useful for testing).
     */
    public static function clearCache(): void
    {
        self::$cachedPayload = null;
        self::$resolved      = false;
    }
}
