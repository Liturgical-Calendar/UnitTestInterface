<?php

declare(strict_types=1);

namespace LiturgicalCalendar\UnitTestInterface\Oidc;

/**
 * The bits of the OIDC round trip that `auth/login.php`, `auth/callback.php` and `auth/logout.php` share:
 * the PKCE session keys, the redirect URI, `return_to` validation, and cookie writing.
 *
 * They live together because they are the security-sensitive half. `return_to` is an open-redirect vector
 * if it is not pinned to this origin, and the cookies must carry exactly the attributes the API expects,
 * since the API is what reads them back.
 */
final class Session
{
    public const KEY_VERIFIER  = 'oidc_code_verifier';
    public const KEY_STATE     = 'oidc_state';
    public const KEY_NONCE     = 'oidc_nonce';
    public const KEY_RETURN_TO = 'oidc_return_to';

    public const ACCESS_COOKIE  = 'litcal_access_token';
    public const REFRESH_COOKIE = 'litcal_refresh_token';
    public const ID_COOKIE      = 'litcal_id_token';

    /** Mirrors the API's own refresh-token lifetime so the two cookies expire together. */
    private const REFRESH_LIFETIME = 2592000;

    /**
     * Start the PHP session with cookie parameters that match how the auth cookies themselves are written.
     */
    public static function start(): void
    {
        if (PHP_SESSION_ACTIVE === session_status()) {
            return;
        }

        session_set_cookie_params([
            'lifetime' => 0,
            'path'     => '/',
            'secure'   => self::isSecure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    /**
     * Forget the PKCE material. Called as soon as the exchange has been attempted, successfully or not: a
     * verifier is single-use, and leaving it behind lets a replayed callback try again.
     */
    public static function forgetPkce(): void
    {
        foreach ([self::KEY_VERIFIER, self::KEY_STATE, self::KEY_NONCE, self::KEY_RETURN_TO] as $key) {
            unset($_SESSION[$key]);
        }
    }

    /**
     * This deployment's callback URL, which has to match the one registered with the Zitadel client.
     */
    public static function redirectUri(): string
    {
        return self::origin() . '/auth/callback.php';
    }

    /**
     * The scheme and host this request arrived on, honouring a reverse proxy's forwarding headers.
     */
    public static function origin(): string
    {
        $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null;
        if (is_string($forwardedProto) && '' !== $forwardedProto) {
            $scheme = strtolower(explode(',', $forwardedProto)[0]);
        } else {
            $scheme = self::isSecure() ? 'https' : 'http';
        }
        $scheme = in_array($scheme, ['http', 'https'], true) ? $scheme : 'https';

        $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
        $host = explode(',', (string) $host)[0];

        return $scheme . '://' . trim($host);
    }

    /**
     * Reduce a caller-supplied `return_to` to something safe to send a browser to after login.
     *
     * Anything naming another host is discarded rather than corrected: an open redirect out of a login
     * flow is a phishing primitive, and there is no reading of a foreign host here that is legitimate.
     */
    public static function sanitizeReturnTo(?string $returnTo): string
    {
        if (!is_string($returnTo) || '' === trim($returnTo)) {
            return '/';
        }

        $returnTo = trim($returnTo);

        // Two shapes parse_url() will not protect against, both rejected before it is consulted:
        //
        //   //evil.example   a protocol-relative URL, naming another host with no scheme;
        //   /\evil.example   a backslash, which parse_url() reports as an ordinary path with NO host —
        //                    but browsers normalise when following a Location header, so this reaches
        //                    https://evil.example/ despite looking local. Verified against parse_url().
        //
        // A backslash has no legitimate use in a same-origin path here, so reject it wherever it appears
        // rather than trying to work out which positions are dangerous.
        if (str_starts_with($returnTo, '//') || str_contains($returnTo, '\\')) {
            return '/';
        }

        $parts = parse_url($returnTo);
        if (false === $parts) {
            return '/';
        }

        if (isset($parts['host'])) {
            $ourHost = parse_url(self::origin(), PHP_URL_HOST);
            if (!is_string($ourHost) || $parts['host'] !== $ourHost) {
                return '/';
            }
        }

        $path = $parts['path'] ?? '/';
        if (!str_starts_with($path, '/')) {
            $path = '/' . $path;
        }

        return $path
            . ( isset($parts['query']) ? '?' . $parts['query'] : '' )
            . ( isset($parts['fragment']) ? '#' . $parts['fragment'] : '' );
    }

    /**
     * Abandon the flow, telling the landing page what went wrong without leaking detail into the URL.
     */
    public static function redirectWithError(string $code): never
    {
        header('Location: /?auth_error=' . rawurlencode($code), true, 302);
        exit;
    }

    /**
     * Write one auth cookie with the attributes the API's CookieHelper uses, so both agree about scope.
     */
    public static function setAuthCookie(string $name, string $value, int $expiresAt): void
    {
        $options = [
            'expires'  => $expiresAt,
            'path'     => '/',
            'secure'   => self::isSecure(),
            'httponly' => true,
            'samesite' => 'Lax',
        ];

        $domain = self::cookieDomain();
        if ('' !== $domain) {
            $options['domain'] = $domain;
        }

        setcookie($name, $value, $options);
    }

    /**
     * Drop every auth cookie this application may have written.
     */
    public static function clearAuthCookies(): void
    {
        foreach ([self::ACCESS_COOKIE, self::REFRESH_COOKIE, self::ID_COOKIE] as $name) {
            self::setAuthCookie($name, '', time() - 3600);
            unset($_COOKIE[$name]);
        }
    }

    public static function refreshLifetime(): int
    {
        return self::REFRESH_LIFETIME;
    }

    /**
     * Cross-subdomain sharing, opt-in through COOKIE_DOMAIN exactly as the API does it.
     */
    private static function cookieDomain(): string
    {
        $domain = $_ENV['COOKIE_DOMAIN'] ?? null;
        return is_string($domain) ? trim($domain) : '';
    }

    private static function isSecure(): bool
    {
        $forwardedProto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? null;
        if (is_string($forwardedProto) && '' !== $forwardedProto) {
            return 'https' === strtolower(explode(',', $forwardedProto)[0]);
        }

        return !empty($_SERVER['HTTPS']) && 'off' !== strtolower((string) $_SERVER['HTTPS']);
    }
}
