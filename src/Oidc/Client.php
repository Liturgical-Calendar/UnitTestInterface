<?php

declare(strict_types=1);

namespace LiturgicalCalendar\UnitTestInterface\Oidc;

use GuzzleHttp\Client as HttpClient;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use Psr\Http\Message\RequestInterface;
use RuntimeException;

/**
 * A deliberately small OIDC client: Authorization Code flow with PKCE, and nothing else.
 *
 * ## Why this is a quarter the size of LiturgicalCalendarFrontend's OidcClient
 *
 * **This class** never validates a token — it only obtains one. Validation lives next door in
 * {@see TokenValidator}, which `JwtAuth` uses for a Zitadel token before falling back to the API's
 * `/auth/me` for the legacy shape. Keeping the two apart is the point: acquiring a token and deciding
 * whether to trust one are separate jobs with separate failure modes.
 *
 * So no signature or audience checking, no userinfo call, and no role mapping happens here. What is
 * absent from this repository ENTIRELY is ID-token claim consumption beyond a display name — see
 * `JwtAuth::displayName()` — and any second opinion about the legacy token, which only the API can
 * verify because only the API holds that secret.
 *
 * ## Internal vs browser-facing URLs
 *
 * Zitadel answers 404 to any request whose `Host` does not match its configured external domain, so a
 * back-channel call sent to a Docker service name needs the issuer's host spoofed onto it. That is what
 * `ZITADEL_INTERNAL_URL` and {@see self::hostHeader()} are for. Browser-facing URLs — the authorization
 * and end-session endpoints — always keep their issuer-facing form: they are for the user agent, which
 * cannot resolve a container hostname.
 */
final class Client
{
    /** Scopes requested unless a caller overrides them. `offline_access` is what yields a refresh token. */
    public const DEFAULT_SCOPES = ['openid', 'profile', 'email', 'offline_access'];

    private string $issuer;
    private string $clientId;
    private string $redirectUri;
    private ?string $internalUrl;

    /** @var array<string, mixed>|null Discovery document, fetched at most once per instance. */
    private ?array $discovery = null;

    public function __construct(string $issuer, string $clientId, string $redirectUri, ?string $internalUrl = null)
    {
        $this->issuer      = rtrim($issuer, '/');
        $this->clientId    = $clientId;
        $this->redirectUri = $redirectUri;
        $this->internalUrl = ( null !== $internalUrl && '' !== trim($internalUrl) ) ? rtrim(trim($internalUrl), '/') : null;
    }

    /**
     * True when both the issuer and the client id are configured.
     *
     * Mirrors the API's own `Router::isOidcConfigured()`, so the two agree about whether this deployment
     * has Zitadel at all. When it returns false the interface keeps its legacy username/password modal.
     */
    public static function isConfigured(): bool
    {
        return '' !== trim((string) ( $_ENV['ZITADEL_ISSUER'] ?? '' ))
            && '' !== trim((string) ( $_ENV['ZITADEL_CLIENT_ID'] ?? '' ));
    }

    /**
     * @throws RuntimeException If OIDC is not configured.
     */
    public static function fromEnv(string $redirectUri): self
    {
        if (!self::isConfigured()) {
            throw new RuntimeException('OIDC is not configured: ZITADEL_ISSUER and ZITADEL_CLIENT_ID are both required.');
        }

        return new self(
            trim((string) $_ENV['ZITADEL_ISSUER']),
            trim((string) $_ENV['ZITADEL_CLIENT_ID']),
            $redirectUri,
            isset($_ENV['ZITADEL_INTERNAL_URL']) ? (string) $_ENV['ZITADEL_INTERNAL_URL'] : null
        );
    }

    /**
     * A fresh PKCE code verifier: 43-128 characters from the unreserved set (RFC 7636 §4.1).
     */
    public static function generateVerifier(): string
    {
        return self::base64Url(random_bytes(32));
    }

    /**
     * The S256 challenge for a verifier (RFC 7636 §4.2).
     */
    public static function challengeFor(string $verifier): string
    {
        return self::base64Url(hash('sha256', $verifier, true));
    }

    /**
     * An opaque value for `state` or `nonce`.
     */
    public static function randomValue(): string
    {
        return bin2hex(random_bytes(32));
    }

    /**
     * The URL to send the user agent to.
     *
     * @param string[] $scopes Overrides {@see self::DEFAULT_SCOPES} when non-empty.
     */
    public function getAuthorizationUrl(string $state, string $nonce, string $codeChallenge, array $scopes = []): string
    {
        $params = [
            'response_type'         => 'code',
            'client_id'             => $this->clientId,
            'redirect_uri'          => $this->redirectUri,
            'scope'                 => implode(' ', [] === $scopes ? self::DEFAULT_SCOPES : $scopes),
            'state'                 => $state,
            'nonce'                 => $nonce,
            'code_challenge'        => $codeChallenge,
            'code_challenge_method' => 'S256',
        ];

        return $this->browserEndpoint('authorization_endpoint', '/oauth/v2/authorize')
            . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Exchange an authorization code for tokens.
     *
     * @return array<string, mixed> The token endpoint's response.
     * @throws RuntimeException On a transport failure or a non-2xx response.
     */
    public function exchangeCode(string $code, string $codeVerifier): array
    {
        $endpoint = $this->backChannelEndpoint('token_endpoint', '/oauth/v2/token');

        try {
            $response = $this->httpClient()->post($endpoint, [
                'form_params' => [
                    'grant_type'    => 'authorization_code',
                    'code'          => $code,
                    'redirect_uri'  => $this->redirectUri,
                    'client_id'     => $this->clientId,
                    'code_verifier' => $codeVerifier,
                ],
                'headers'     => ['Accept' => 'application/json'],
            ]);
        } catch (GuzzleException $e) {
            throw new RuntimeException('Token exchange failed: ' . $e->getMessage(), 0, $e);
        }

        /** @var array<string, mixed>|null $decoded */
        $decoded = json_decode((string) $response->getBody(), true);
        if (!is_array($decoded)) {
            throw new RuntimeException('Token endpoint returned a non-JSON body.');
        }

        return $decoded;
    }

    /**
     * RP-initiated logout. Returns null when the provider advertises no end-session endpoint, which is the
     * caller's cue to simply drop its own cookies.
     *
     * The `id_token_hint` is forwarded ONLY when this client is the one it was minted for. Where sibling
     * sites share a cookie domain, the ID token in our cookie is frequently theirs: a user who logged in
     * on the frontend arrives here already authenticated, carrying the frontend's token. Passing that
     * alongside our own `client_id` makes Zitadel refuse the whole request —
     *
     *     {"error":"invalid_request","error_description":"client_id does not match azp of id_token_hint"}
     *
     * — and the user cannot log out at all. Dropping the hint costs only the provider's certainty about
     * which session to end; it still has the browser's own session cookie, and `client_id` still lets it
     * validate `post_logout_redirect_uri` against this application.
     */
    public function getLogoutUrl(?string $idTokenHint = null, ?string $postLogoutRedirectUri = null): ?string
    {
        $endpoint = $this->discover()['end_session_endpoint'] ?? null;
        if (!is_string($endpoint) || '' === $endpoint) {
            return null;
        }

        $params = [];
        if (null !== $idTokenHint && '' !== $idTokenHint && $this->wasIssuedToThisClient($idTokenHint)) {
            $params['id_token_hint'] = $idTokenHint;
        }
        if (null !== $postLogoutRedirectUri && '' !== $postLogoutRedirectUri) {
            $params['post_logout_redirect_uri'] = $postLogoutRedirectUri;
            $params['client_id']                = $this->clientId;
        }

        return [] === $params
            ? $endpoint
            : $endpoint . '?' . http_build_query($params, '', '&', PHP_QUERY_RFC3986);
    }

    /**
     * Whether an ID token names this client as its authorized party.
     *
     * The claim is read without verifying the signature, deliberately: the answer is only used to decide
     * whether to hand the token back to the provider that issued it, which then verifies it properly.
     * Nothing here trusts the contents — a forged `azp` would buy an attacker a hint Zitadel rejects.
     *
     * `azp` is required whenever the audience has more than one value; where it is absent, a single-valued
     * `aud` carries the same meaning.
     */
    private function wasIssuedToThisClient(string $idToken): bool
    {
        $claims = JwtSegments::payload($idToken);
        if (null === $claims) {
            return false;
        }

        $azp = $claims['azp'] ?? null;
        if (is_string($azp) && '' !== $azp) {
            return $azp === $this->clientId;
        }

        $aud = $claims['aud'] ?? null;
        return is_string($aud) && $aud === $this->clientId;
    }

    public function getIssuer(): string
    {
        return $this->issuer;
    }

    public function getClientId(): string
    {
        return $this->clientId;
    }

    /**
     * The discovery document, fetched at most once per instance.
     *
     * @return array<string, mixed>
     */
    private function discover(): array
    {
        if (null !== $this->discovery) {
            return $this->discovery;
        }

        $base = $this->internalUrl ?? $this->issuer;

        try {
            $response = $this->httpClient()->get($base . '/.well-known/openid-configuration', [
                'headers' => ['Accept' => 'application/json'],
            ]);
        } catch (GuzzleException $e) {
            throw new RuntimeException('Could not fetch the OIDC discovery document: ' . $e->getMessage(), 0, $e);
        }

        /** @var array<string, mixed>|null $decoded */
        $decoded = json_decode((string) $response->getBody(), true);
        if (!is_array($decoded)) {
            throw new RuntimeException('The OIDC discovery document was not JSON.');
        }

        $this->discovery = $decoded;
        return $this->discovery;
    }

    /**
     * An endpoint the *browser* will be sent to, so it must name the issuer rather than an internal host.
     */
    private function browserEndpoint(string $key, string $fallbackPath): string
    {
        $value = $this->discover()[$key] ?? null;
        return is_string($value) && '' !== $value ? $value : $this->issuer . $fallbackPath;
    }

    /**
     * An endpoint *this server* will call, rewritten onto the internal address when one is configured.
     */
    private function backChannelEndpoint(string $key, string $fallbackPath): string
    {
        $advertised = $this->browserEndpoint($key, $fallbackPath);

        if (null === $this->internalUrl) {
            return $advertised;
        }

        $path = parse_url($advertised, PHP_URL_PATH);
        return $this->internalUrl . ( is_string($path) && '' !== $path ? $path : $fallbackPath );
    }

    /**
     * The `Host` Zitadel expects, derived from the issuer. Sent on back-channel calls because those go to a
     * container hostname, which Zitadel would otherwise answer with a 404.
     */
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

    private function httpClient(): HttpClient
    {
        $config = ['timeout' => 10, 'http_errors' => true];

        $host = $this->hostHeader();
        if (null !== $host) {
            // Injected through the handler stack rather than as a default header: Guzzle derives `Host`
            // from the request URI, so a constructor default is overwritten before the request is sent and
            // Zitadel answers 404. LiturgicalCalendarAPI's OidcAuthMiddleware does the same thing for the
            // same reason when it fetches JWKS over the internal address.
            $stack = HandlerStack::create();
            $stack->push(Middleware::mapRequest(
                static fn (RequestInterface $request): RequestInterface => $request->withHeader('Host', $host)
            ));
            $config['handler'] = $stack;
        }

        return new HttpClient($config);
    }

    /**
     * base64url without padding (RFC 7636 §A).
     */
    private static function base64Url(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
}
