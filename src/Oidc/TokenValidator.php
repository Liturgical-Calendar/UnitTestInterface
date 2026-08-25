<?php

declare(strict_types=1);

namespace LiturgicalCalendar\UnitTestInterface\Oidc;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use GuzzleHttp\Client as HttpClient;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use Psr\Http\Message\RequestInterface;
use Throwable;

/**
 * Validates a Zitadel access token locally, against the provider's published signing keys.
 *
 * ## Why this exists, when the plan was to delegate
 *
 * The design for this migration assumed `GET /auth/me` on the API could answer "who is this?" for both
 * token kinds, because `OidcAuthMiddleware` reads the same cookie and tries Zitadel then legacy. That is
 * true of the routes the middleware is piped for — and `/auth/me` is not one of them. It verifies with the
 * API's own HS256 service only, so a valid Zitadel token comes back `401 Invalid or expired token`.
 *
 * This is known, deliberate behaviour rather than a bug to route around quietly: LiturgicalCalendarFrontend's
 * `e2e/rbac/support/actingAs.spec.ts` says outright that "the API's /auth/me is HS256/admin-only and rejects
 * Zitadel OIDC tokens", and validates locally in its own `auth/me.php` for exactly that reason. This class
 * follows that precedent rather than changing shared API semantics.
 *
 * ## Why not CachedKeySet
 *
 * `Firebase\JWT\CachedKeySet` needs a PSR-6 cache, which would mean adding `symfony/cache` to this
 * repository for one call site. `JWK::parseKeySet()` plus a small file cache does the same job with no new
 * dependency.
 */
final class TokenValidator
{
    /** How long a fetched key set is trusted before being refetched. */
    private const JWKS_TTL_SECONDS = 3600;

    /**
     * The oldest a cached key set may be and still be used when the provider cannot be reached.
     *
     * Serving a stale set indefinitely would keep tokens signed by a revoked or compromised key valid for
     * as long as the outage lasted. A day is long enough to ride out a provider blip without turning an
     * availability problem into an unbounded security one.
     */
    private const JWKS_MAX_STALE_SECONDS = 86400;

    /**
     * The shortest interval between two key-set refetches forced by an unknown key id.
     *
     * The rotation retry deliberately fires only for an unknown `kid`, but that is a guard on the REASON,
     * not on the RATE: a stream of tokens each carrying a different unknown `kid` would otherwise cause one
     * outbound request apiece, turning cheap junk into load on the provider. A genuine rotation is still
     * picked up within this window, because the first such token refetches and every later one then finds
     * the new key already cached.
     */
    private const JWKS_MIN_REFETCH_SECONDS = 60;

    private string $issuer;
    private ?string $internalUrl;

    /** @var array<int, string> Audiences this deployment accepts. */
    private array $validAudiences;

    /**
     * @param array<int, string> $validAudiences
     */
    public function __construct(string $issuer, array $validAudiences, ?string $internalUrl = null)
    {
        $this->issuer         = rtrim($issuer, '/');
        $this->validAudiences = array_values(array_filter($validAudiences, static fn ($a): bool => is_string($a) && '' !== $a));
        $this->internalUrl    = ( null !== $internalUrl && '' !== trim($internalUrl) ) ? rtrim(trim($internalUrl), '/') : null;
    }

    public static function fromEnv(): ?self
    {
        if (!Client::isConfigured()) {
            return null;
        }

        return new self(
            trim((string) $_ENV['ZITADEL_ISSUER']),
            // Zitadel puts the client id in `aud` for a user-facing token and the project id alongside it.
            // Accepting either mirrors the API's OidcAuthMiddleware, so the two agree about what counts.
            [
                trim((string) ( $_ENV['ZITADEL_CLIENT_ID'] ?? '' )),
                trim((string) ( $_ENV['ZITADEL_PROJECT_ID'] ?? '' )),
            ],
            isset($_ENV['ZITADEL_INTERNAL_URL']) ? (string) $_ENV['ZITADEL_INTERNAL_URL'] : null
        );
    }

    /**
     * Validate a token's signature, issuer and audience.
     *
     * @return object|null The decoded payload, or null for anything that is not a valid token for us —
     *                     including a legacy HS256 token, which the caller then handles another way.
     */
    public function validate(string $token): ?object
    {
        // Cheap structural reject before any crypto or network: a non-JWT cannot be ours.
        if (3 !== count(explode('.', $token))) {
            return null;
        }

        $jwks = $this->keySet();
        if (null === $jwks) {
            return null;
        }

        $payload = self::decode($token, $jwks);

        if (null === $payload) {
            // One failure is worth retrying, and only one: a key id we have never seen. Zitadel rotates
            // its signing keys, and a rotation inside the cache TTL would otherwise send every valid
            // token down the legacy path — where the API rejects it — leaving users logged out for up to
            // an hour with nothing in the logs to explain it.
            //
            // Deliberately NOT retried: a malformed token, an absent kid, a bad signature from a key we
            // do hold, expiry, or an issuer or audience mismatch. Those are answers, not staleness, and
            // refetching on them would let any junk token trigger an outbound request.
            $kid = self::kidOf($token);
            if (null !== $kid && !self::keySetHasKid($jwks, $kid)) {
                $fresh = $this->keySet(true);
                if (null !== $fresh) {
                    $payload = self::decode($token, $fresh);
                }
            }
        }

        if (null === $payload) {
            return null;
        }

        if (!isset($payload->iss) || $payload->iss !== $this->issuer) {
            return null;
        }

        if (!$this->audienceMatches($payload->aud ?? null)) {
            return null;
        }

        return $payload;
    }

    /**
     * Decode and signature-check, or null for anything that does not verify.
     *
     * @param array<string, mixed> $jwks
     */
    private static function decode(string $token, array $jwks): ?object
    {
        try {
            return JWT::decode($token, JWK::parseKeySet($jwks));
        } catch (Throwable) {
            return null;
        }
    }

    /**
     * The `kid` from a token's header, without trusting anything else in it.
     */
    private static function kidOf(string $token): ?string
    {
        $header = JwtSegments::header($token);
        if (null === $header) {
            return null;
        }

        $kid = $header['kid'] ?? null;
        return is_string($kid) && '' !== $kid ? $kid : null;
    }

    /**
     * @param array<string, mixed> $jwks
     */
    private static function keySetHasKid(array $jwks, string $kid): bool
    {
        $keys = $jwks['keys'] ?? null;
        if (!is_array($keys)) {
            return false;
        }

        foreach ($keys as $key) {
            if (is_array($key) && ( $key['kid'] ?? null ) === $kid) {
                return true;
            }
        }

        return false;
    }

    /**
     * @param mixed $aud
     */
    private function audienceMatches($aud): bool
    {
        if ([] === $this->validAudiences) {
            return false;
        }

        if (is_string($aud)) {
            return in_array($aud, $this->validAudiences, true);
        }

        if (is_array($aud)) {
            $strings = array_filter($aud, 'is_string');
            return [] !== array_intersect($strings, $this->validAudiences);
        }

        return false;
    }

    /**
     * The provider's key set, from a short-lived file cache or from the provider.
     *
     * @return array<string, mixed>|null
     */
    private function keySet(bool $forceRefresh = false): ?array
    {
        $cacheFile = $this->cacheFile();

        // A forced refresh still respects a short cooldown, so an unknown key id cannot be used to drive
        // unbounded traffic at the provider. See JWKS_MIN_REFETCH_SECONDS.
        $ttl = $forceRefresh ? self::JWKS_MIN_REFETCH_SECONDS : self::JWKS_TTL_SECONDS;

        if (null !== $cacheFile && is_file($cacheFile) && ( time() - (int) filemtime($cacheFile) ) < $ttl) {
            /** @var array<string, mixed>|null $cached */
            $cached = json_decode((string) file_get_contents($cacheFile), true);
            if (is_array($cached) && isset($cached['keys'])) {
                return $cached;
            }
        }

        $base = $this->internalUrl ?? $this->issuer;

        try {
            $body = (string) $this->httpClient()->get($base . '/oauth/v2/keys', [
                'headers' => ['Accept' => 'application/json'],
            ])->getBody();
        } catch (GuzzleException $e) {
            error_log('OIDC: could not fetch the signing keys: ' . $e->getMessage());
            // Fall back to a stale cache rather than logging everyone out over a transient blip — but
            // only up to JWKS_MAX_STALE_SECONDS, so a long outage cannot keep a revoked key usable.
            if (null !== $cacheFile && is_file($cacheFile)) {
                $age = time() - (int) filemtime($cacheFile);
                if ($age <= self::JWKS_MAX_STALE_SECONDS) {
                    /** @var array<string, mixed>|null $stale */
                    $stale = json_decode((string) file_get_contents($cacheFile), true);
                    if (is_array($stale) && isset($stale['keys'])) {
                        return $stale;
                    }
                } else {
                    error_log('OIDC: cached signing keys are older than the maximum stale window; refusing to use them.');
                }
            }
            return null;
        }

        /** @var array<string, mixed>|null $decoded */
        $decoded = json_decode($body, true);
        if (!is_array($decoded) || !isset($decoded['keys'])) {
            return null;
        }

        if (null !== $cacheFile) {
            // Written via a temporary file so a concurrent reader never sees a half-written key set.
            $tmp = $cacheFile . '.' . getmypid() . '.tmp';
            if (false !== @file_put_contents($tmp, $body)) {
                @rename($tmp, $cacheFile);
            }
        }

        return $decoded;
    }

    /**
     * Where to cache the key set, or null when nowhere is writable.
     *
     * Every filesystem call here is silenced and checked rather than trusted. The application directory
     * is READ-ONLY in the container image, and an un-silenced mkdir() there prints a PHP warning — which,
     * for a JSON endpoint, lands in the response body ahead of the payload and makes it unparseable. A
     * corrupted response is far worse than an uncached fetch, and it fails in a place that looks nothing
     * like the cause.
     *
     * Keyed by issuer, so moving the provider (or its port) cannot serve keys from the previous one.
     */
    private function cacheFile(): ?string
    {
        $candidates = [
            dirname(__DIR__, 2) . '/cache',
            sys_get_temp_dir() . '/litcal-uti-jwks',
        ];

        foreach ($candidates as $dir) {
            if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
                continue;
            }
            if (is_writable($dir)) {
                return $dir . '/jwks-' . hash('sha256', $this->issuer) . '.json';
            }
        }

        return null;
    }

    private function httpClient(): HttpClient
    {
        $config = ['timeout' => 5, 'http_errors' => true];

        $host = $this->hostHeader();
        if (null !== $host) {
            // Same reason as in Client: Guzzle derives Host from the URI, so a default header is
            // overwritten and Zitadel answers 404 for a request that did not name its external domain.
            $stack = HandlerStack::create();
            $stack->push(Middleware::mapRequest(
                static fn (RequestInterface $request): RequestInterface => $request->withHeader('Host', $host)
            ));
            $config['handler'] = $stack;
        }

        return new HttpClient($config);
    }

    private function hostHeader(): ?string
    {
        if (null === $this->internalUrl) {
            return null;
        }

        $host = parse_url($this->issuer, PHP_URL_HOST);
        if (!is_string($host) || '' === $host) {
            return null;
        }

        $port = parse_url($this->issuer, PHP_URL_PORT);
        return is_int($port) ? $host . ':' . $port : $host;
    }
}
