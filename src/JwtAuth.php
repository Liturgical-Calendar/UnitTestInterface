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
 * It now resolves identity in two steps, mirroring the API's own OidcAuthMiddleware:
 *
 *   1. **Zitadel token** — validated here by {@see TokenValidator}, against the provider's published
 *      signing keys.
 *   2. **Anything else** — forwarded to the API's `GET /auth/me`, which understands the legacy HS256
 *      token this interface used to issue.
 *
 * Step 1 is local reluctantly. The design for this migration assumed `/auth/me` could answer for both
 * kinds, since `OidcAuthMiddleware` reads the same cookie and tries Zitadel then legacy. That holds for
 * the routes the middleware is piped for, and `/auth/me` is not one of them — it verifies with the API's
 * HS256 service alone, so a valid Zitadel token comes back `401 Invalid or expired token`. That is known,
 * deliberate behaviour: LiturgicalCalendarFrontend's `e2e/rbac/support/actingAs.spec.ts` records it, and
 * that project validates locally for the same reason. Changing shared API semantics was the alternative,
 * and is a larger decision than this migration.
 *
 * `JWT_SECRET` is no longer read here: the legacy token is verified by the API, which owns that secret.
 *
 * The public surface is unchanged, so `layout/head.php`, `layout/topnavbar.php` and `results.php` did not
 * have to change with it.
 */

namespace LiturgicalCalendar\UnitTestInterface;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use LiturgicalCalendar\UnitTestInterface\Oidc\TokenValidator;
use RuntimeException;

class JwtAuth
{
    private const COOKIE_NAME = 'litcal_access_token';
    private const ID_TOKEN_COOKIE = 'litcal_id_token';

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

        // A Zitadel token is validated here, because the API's /auth/me does not accept one.
        $validator = TokenValidator::fromEnv();
        if (null !== $validator) {
            $payload = $validator->validate($token);
            if (null !== $payload) {
                self::$cachedPayload = (object) [
                    'sub'   => self::displayName($validator, $payload),
                    'roles' => self::zitadelRoles($payload),
                    'exp'   => isset($payload->exp) && is_int($payload->exp) ? $payload->exp : null,
                ];
                return self::$cachedPayload;
            }
        }

        // Not a Zitadel token (or not one for us): let the API answer, which covers the legacy shape.
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
     * A name worth showing in the navbar.
     *
     * Zitadel's ACCESS token carries only the opaque `sub` — the profile claims live in the ID token, which
     * `auth/callback.php` stored alongside it. So fall back to that, validated the same way rather than
     * merely decoded: it is a token, and reading claims out of an unverified one is a habit worth not
     * forming even where the value is only displayed.
     */
    private static function displayName(TokenValidator $validator, object $accessPayload): ?string
    {
        $fromAccess = self::firstClaim($accessPayload, ['preferred_username', 'email', 'name']);
        if (null !== $fromAccess) {
            return $fromAccess;
        }

        $idToken = $_COOKIE[self::ID_TOKEN_COOKIE] ?? null;
        if (is_string($idToken) && '' !== $idToken) {
            $idPayload = $validator->validate($idToken);
            if (null !== $idPayload) {
                $fromId = self::firstClaim($idPayload, ['preferred_username', 'email', 'name']);
                if (null !== $fromId) {
                    return $fromId;
                }
            }
        }

        $sub = $accessPayload->sub ?? null;
        return is_string($sub) ? $sub : null;
    }

    /**
     * @param array<int, string> $claims
     */
    private static function firstClaim(object $payload, array $claims): ?string
    {
        foreach ($claims as $claim) {
            $value = $payload->{$claim} ?? null;
            if (is_string($value) && '' !== $value) {
                return $value;
            }
        }
        return null;
    }

    /**
     * Zitadel publishes project roles as an object keyed by role name, e.g.
     * `{"admin": {"<org id>": "<domain>"}}` — so the role names are the keys, not the values.
     *
     * @return array<int, string>
     */
    private static function zitadelRoles(object $payload): array
    {
        $claim = $payload->{'urn:zitadel:iam:org:project:roles'} ?? null;
        if (is_object($claim)) {
            return array_values(array_filter(array_keys((array) $claim), 'is_string'));
        }
        if (is_array($claim)) {
            return array_values(array_filter($claim, 'is_string'));
        }
        return [];
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
