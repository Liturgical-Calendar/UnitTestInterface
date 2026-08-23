<?php

/**
 * Server-side proxy for the handful of API routes this interface reads *from the browser*.
 *
 * ## Why this exists
 *
 * The API's `ApiKeyRateLimitMiddleware` identifies a caller in exactly two ways: by the `api_key`
 * attribute an `X-Api-Key` header populates, or — failing that — by client IP, against
 * `UNAUTHENTICATED_RATE_LIMIT`. There is no JWT branch, so logging in to this interface buys nothing.
 * Live, that ceiling is 100 requests/hour, and one load of `index.php` spends five of them (measured,
 * not estimated: `/calendars` twice — once by the page, once by `ApiBase` — plus `/tests`, `/missals`
 * and `/validations`). Twenty page loads per hour per visitor, and then 429s.
 *
 * The project has a first-party key whose rate limit is effectively unlimited, but **a key delivered to
 * a browser is public** — anyone can read it out of the network tab. So the key stays here, server-side,
 * and the browser talks only to this file.
 *
 * ## What this is NOT
 *
 * Not a general-purpose API pass-through. `ROUTES` is an exact-match allowlist of the routes the browser
 * was measured to need; anything else is refused. That is what keeps this from being an SSRF hole: no
 * part of the upstream URL is taken from the request except a string that had to match this list
 * verbatim.
 *
 * It is also **not** where the runner's own checks go. Both pages send `sourceFile` URLs to the
 * WebSocket server naming the *real* API, and those must stay real: `Health` resolves a check's JSON
 * schema by matching the resource URL against the API's configured host, so a proxied URL there would
 * break schema resolution. The WS server has its own key (`WS_API_KEY`) and is already exempt. Only the
 * page's own `fetch()` calls come through here.
 *
 * ## Routing
 *
 * Two equivalent forms, because two callers need different things:
 *
 *   - `api-proxy.php/calendars`  — path form, required by `ApiBase`, which rejects a relative base and
 *                                  hard-codes `fetch(`${base}/calendars`)`. Needs `PATH_INFO`.
 *   - `api-proxy.php?route=calendars` — query form, which works on any SAPI.
 *
 * Both are accepted so that a deployment whose PHP SAPI does not populate `PATH_INFO` can still be
 * diagnosed (`?route=` will work when the path form 404s), and so the flag can be switched off without
 * touching code.
 */

declare(strict_types=1);

use Dotenv\Dotenv;
use Dotenv\Exception\ValidationException;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;

require_once __DIR__ . '/vendor/autoload.php';

$dotenv = Dotenv::createImmutable(__DIR__, ['.env', '.env.local', '.env.development', '.env.test', '.env.staging', '.env.production'], false);
$dotenv->safeLoad();

/**
 * The routes the browser is allowed to ask for, exact-match.
 *
 * Derived by capturing every request the two runner pages actually make to the API host, not by
 * enumerating what the API offers. Adding a route here is a deliberate act; nothing widens it at
 * runtime.
 */
const ROUTES = ['calendars', 'tests', 'missals', 'validations'];

/**
 * Answer with a problem document and stop.
 *
 * `application/problem+json` rather than bare JSON because that is what the API itself answers with,
 * and `index.js`'s `readJsonOrThrow()` already reads `detail` out of it — so a proxy failure reports
 * itself through the same path an upstream failure would.
 */
function refuse(int $status, string $title, string $detail): never
{
    http_response_code($status);
    header('Content-Type: application/problem+json');
    echo json_encode(['type' => 'about:blank', 'title' => $title, 'status' => $status, 'detail' => $detail], JSON_UNESCAPED_SLASHES);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if (false === in_array($method, ['GET', 'HEAD'], true)) {
    header('Allow: GET, HEAD');
    refuse(405, 'Method Not Allowed', 'This proxy forwards read requests only.');
}

// Path form first, query form second. `trim` rather than a regex: the value still has to survive the
// exact-match test below, so normalising is all that is needed here.
$route = trim((string) ($_SERVER['PATH_INFO'] ?? ''), '/');
if ('' === $route) {
    $route = is_string($_GET['route'] ?? null) ? trim($_GET['route'], '/') : '';
}

if (false === in_array($route, ROUTES, true)) {
    refuse(404, 'Unknown route', sprintf('This proxy forwards only: %s. Received: %s', implode(', ', ROUTES), '' === $route ? '(none)' : $route));
}

// Validated before use, the way `layout/head.php` validates the same variables — but this file has
// the stronger reason to: those values are not merely displayed here, they are composed into an
// outbound request. `API_PROTOCOL` is additionally constrained to http/https, which `head.php` has no
// need to do; a scheme is the one part of a URL that decides what kind of thing the request even is,
// and a typo like `file` in an env file should be a refusal rather than an attempt.
//
// Caught rather than allowed to escape: an uncaught ValidationException prints a PHP error page, and
// every caller of this endpoint is parsing JSON.
try {
    $dotenv->ifPresent(['API_HOST'])->notEmpty();
    $dotenv->ifPresent(['API_PROTOCOL'])->notEmpty()->allowedValues(['http', 'https']);
    $dotenv->ifPresent(['API_PORT'])->isInteger();
} catch (ValidationException $e) {
    refuse(500, 'Misconfigured proxy', 'The API location this proxy is configured with is not usable: ' . $e->getMessage());
}

$protocol = $_ENV['API_PROTOCOL'] ?? 'https';
$host     = $_ENV['API_HOST'] ?? 'litcal.johnromanodorazio.com';
$port     = (int) ($_ENV['API_PORT'] ?? 443);
$basePath = trim((string) ($_ENV['API_BASE_PATH'] ?? ''), '/');

$portPart = in_array($port, [80, 443], true) ? '' : ':' . $port;
$pathPart = '' === $basePath ? '/' : '/' . $basePath . '/';
$upstream = $protocol . '://' . $host . $portPart . $pathPart . $route;

// Belt and braces over the validation above: whatever the parts were, confirm the URL they actually
// composed still addresses the configured host over the configured scheme. `API_HOST` carrying
// something with structure in it — a userinfo `@`, a path, a second host — would otherwise compose a
// URL pointing somewhere else entirely, and this is a proxy, so "somewhere else" is the failure that
// matters. Cheap, and it checks the finished string rather than the ingredients.
$parsed = parse_url($upstream);
if (false === is_array($parsed) || ( $parsed['scheme'] ?? null ) !== $protocol || ( $parsed['host'] ?? null ) !== $host) {
    refuse(500, 'Misconfigured proxy', 'The configured API location does not compose a URL addressing that host.');
}

// Only two request headers are forwarded, and both are content negotiation rather than identity.
// Nothing that could authenticate the *visitor* travels upstream: no cookies, no Authorization. The
// visitor's identity is irrelevant to the API here — the key below is what the API authorises.
$headers = ['Accept' => 'application/json'];
if (isset($_SERVER['HTTP_ACCEPT_LANGUAGE']) && is_string($_SERVER['HTTP_ACCEPT_LANGUAGE'])) {
    // Bounded and character-restricted: it is attacker-controlled input being placed in an outbound
    // header, and a header value is exactly where an unvalidated string does damage.
    $acceptLanguage = substr($_SERVER['HTTP_ACCEPT_LANGUAGE'], 0, 200);
    if (1 === preg_match('/^[A-Za-z0-9,;=.\-* ]+$/', $acceptLanguage)) {
        $headers['Accept-Language'] = $acceptLanguage;
    }
}

$apiKey = $_ENV['LITCAL_API_KEY'] ?? '';
if (is_string($apiKey) && '' !== $apiKey) {
    $headers['X-Api-Key'] = $apiKey;
}

try {
    $client   = new Client(['timeout' => 15, 'connect_timeout' => 5, 'http_errors' => false]);
    $response = $client->request('GET', $upstream, ['headers' => $headers]);
} catch (GuzzleException $e) {
    // The upstream call failed as a transport, which is this proxy's fault to report rather than the
    // API's to answer for — hence 502 rather than passing a status through.
    refuse(502, 'Upstream request failed', sprintf('Could not reach the API at %s: %s', $upstream, $e->getMessage()));
}

http_response_code($response->getStatusCode());
header('Content-Type: ' . ($response->getHeaderLine('Content-Type') ?: 'application/json'));
// So a reader of the network tab can tell a proxied response from a direct one without guessing.
header('X-LitCal-Proxy: 1');
// Whatever the API said about the *key's* budget, not the visitor's. Passed through because it is the
// only way to see the shared budget being consumed.
foreach (['X-RateLimit-Limit', 'X-RateLimit-Remaining'] as $passthrough) {
    if ($response->hasHeader($passthrough)) {
        header($passthrough . ': ' . $response->getHeaderLine($passthrough));
    }
}

if ('HEAD' !== $method) {
    echo (string) $response->getBody();
}
