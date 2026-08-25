<?php

declare(strict_types=1);

namespace LiturgicalCalendar\UnitTestInterface;

use RuntimeException;

/**
 * Resolves the base URL this application uses to reach the API **server-side**.
 *
 * `API_PROTOCOL`/`API_HOST`/`API_PORT` describe the API as the *browser* addresses it — that is what
 * `layout/footer.php` hands to the page. Calls made from PHP are a different matter: wherever this app is
 * served from a container, the two are different addresses and `localhost` here means the container, not
 * the API. `API_INTERNAL_URL` names the server-side address, exactly as it does in `api-proxy.php` and in
 * LiturgicalCalendarFrontend.
 *
 * The validation below is deliberately as strict as `api-proxy.php`'s, and for the same reason: this
 * single string decides where an authentication cookie is forwarded, so a malformed value is refused
 * rather than fallen back from. Quietly using an upstream the operator did not configure is precisely how
 * a credential reaches somewhere it was not meant to go.
 */
final class ApiBase
{
    /**
     * Cached for the request. Resolution reads several environment variables and validates a URL; nothing
     * about it changes between calls within one request.
     */
    private static ?string $cached = null;

    /**
     * The API base URL for server-side calls, without a trailing slash.
     *
     * @throws RuntimeException If API_INTERNAL_URL is set but is not a plain http(s) base URL.
     */
    public static function resolve(): string
    {
        if (null !== self::$cached) {
            return self::$cached;
        }

        $internalUrl = trim((string) ( $_ENV['API_INTERNAL_URL'] ?? '' ));

        if ('' !== $internalUrl) {
            $parts  = parse_url($internalUrl);
            $scheme = is_array($parts) ? ( $parts['scheme'] ?? null ) : null;
            $host   = is_array($parts) ? ( $parts['host'] ?? null ) : null;
            $extras = is_array($parts) && (
                isset($parts['user']) || isset($parts['pass'])
                || isset($parts['query']) || isset($parts['fragment'])
            );

            if (false === in_array($scheme, ['http', 'https'], true) || null === $host || '' === $host || $extras) {
                throw new RuntimeException(
                    'API_INTERNAL_URL must be a plain http(s) base URL — scheme and host only, with no credentials, query or fragment.'
                );
            }

            self::$cached = rtrim($internalUrl, '/');
            return self::$cached;
        }

        $protocol = $_ENV['API_PROTOCOL'] ?? 'https';
        $host     = $_ENV['API_HOST'] ?? 'litcal.johnromanodorazio.com';
        $port     = isset($_ENV['API_PORT']) ? (int) $_ENV['API_PORT'] : null;
        $basePath = rtrim((string) ( $_ENV['API_BASE_PATH'] ?? '' ), '/');

        // A default port carries no information in a URL and only invites string comparisons to disagree.
        $portSuffix = '';
        if (null !== $port && 0 !== $port && !( 'https' === $protocol && 443 === $port ) && !( 'http' === $protocol && 80 === $port )) {
            $portSuffix = ':' . $port;
        }

        self::$cached = $protocol . '://' . $host . $portSuffix . $basePath;
        return self::$cached;
    }

    /**
     * Forget the cached value. Only needed by tests that manipulate the environment mid-process.
     */
    public static function clearCache(): void
    {
        self::$cached = null;
    }
}
