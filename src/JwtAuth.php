<?php

/**
 * JWT Authentication helper for server-side token verification.
 *
 * Validates JWT access tokens from HttpOnly cookies using the same
 * secret as the LiturgicalCalendarAPI. This enables PHP to verify
 * authentication state without client-side JavaScript.
 *
 * Cookie name: litcal_access_token (set by API)
 */

namespace LiturgicalCalendar\UnitTestInterface;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\SignatureInvalidException;
use Firebase\JWT\BeforeValidException;

class JwtAuth
{
    private const COOKIE_NAME = 'litcal_access_token';

    /**
     * @var string|null JWT secret key from environment
     */
    private static ?string $secret = null;

    /**
     * @var string JWT algorithm from environment (default: HS256)
     */
    private static string $algorithm = 'HS256';

    /**
     * @var object|null Cached decoded token payload
     */
    private static ?object $cachedPayload = null;

    /**
     * @var bool Whether initialization has been attempted
     */
    private static bool $initialized = false;

    /**
     * Initialize JWT configuration from environment variables.
     * Must be called after dotenv is loaded.
     */
    public static function init(): void
    {
        if (self::$initialized) {
            return;
        }

        self::$secret = $_ENV['JWT_SECRET'] ?? null;
        self::$algorithm = $_ENV['JWT_ALGORITHM'] ?? 'HS256';
        self::$initialized = true;
    }

    /**
     * Check if JWT configuration is available.
     *
     * @return bool True if JWT_SECRET is configured
     */
    public static function isConfigured(): bool
    {
        self::init();
        return self::$secret !== null && self::$secret !== '' && self::$secret !== 'change-this-to-match-api-jwt-secret';
    }

    /**
     * Get the JWT access token from the HttpOnly cookie.
     *
     * @return string|null The token or null if not present
     */
    public static function getToken(): ?string
    {
        return $_COOKIE[self::COOKIE_NAME] ?? null;
    }

    /**
     * Verify and decode the JWT access token.
     *
     * @return object|null Decoded token payload or null if invalid/missing
     */
    public static function verifyToken(): ?object
    {
        // Return cached result if available
        if (self::$cachedPayload !== null) {
            return self::$cachedPayload;
        }

        self::init();

        if (!self::isConfigured()) {
            return null;
        }

        $token = self::getToken();
        if ($token === null) {
            return null;
        }

        try {
            $decoded = JWT::decode($token, new Key(self::$secret, self::$algorithm));

            // Verify token type is 'access' (not 'refresh')
            if (!isset($decoded->type) || $decoded->type !== 'access') {
                return null;
            }

            self::$cachedPayload = $decoded;
            return $decoded;
        } catch (ExpiredException $e) {
            // Token has expired
            return null;
        } catch (SignatureInvalidException $e) {
            // Invalid signature
            return null;
        } catch (BeforeValidException $e) {
            // Token not yet valid
            return null;
        } catch (\UnexpectedValueException $e) {
            // Malformed token
            return null;
        } catch (\Exception $e) {
            // Any other error
            return null;
        }
    }

    /**
     * Check if the current request is authenticated.
     *
     * @return bool True if valid JWT token is present
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
        if ($payload === null) {
            return null;
        }
        return $payload->sub ?? null;
    }

    /**
     * Get the authenticated user's roles.
     *
     * @return array Array of role strings
     */
    public static function getRoles(): array
    {
        $payload = self::verifyToken();
        if ($payload === null) {
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
        if ($payload === null) {
            return null;
        }
        return $payload->exp ?? null;
    }

    /**
     * Clear the cached payload (useful for testing).
     */
    public static function clearCache(): void
    {
        self::$cachedPayload = null;
    }
}
