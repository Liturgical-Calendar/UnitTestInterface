<?php

/**
 * Renew this application's Zitadel session by spending the stored refresh token.
 *
 * The counterpart of `auth/me.php`, and it exists for the same reason (issue #93). `assets/js/auth.js`
 * branched on `oidcEnabled` in exactly one place — the identity endpoint — while `_doRefreshToken()`
 * always called the **API's** legacy HS256 `/auth/refresh`. That endpoint knows nothing about a Zitadel
 * session and correctly answers 400, so an OIDC session had no renewal path at all: it expired at the
 * access token's lifetime and the user was silently logged out. The pieces were already here —
 * `offline_access` is requested, `auth/callback.php` stores the refresh token — and nothing spent it.
 *
 * **The status codes are the contract, because the remedies differ.**
 *
 *   200  renewed; the cookies are rewritten
 *   401  the session is over — no refresh token, or the provider refused the one we hold. Cookies are
 *        cleared, and the client should stop retrying and show a logged-out UI.
 *   502  the provider could not be reached. Cookies are LEFT ALONE and the client should retry, because
 *        a session that is still perfectly valid must not be ended by one failed DNS lookup.
 *
 * Collapsing 502 into 401 would be the tempting simplification and the wrong one: the browser retries
 * every minute over the last five before expiry, so a transient fault has several chances to resolve —
 * but only if it is not mistaken for a verdict on the token.
 *
 * The body carries no identity. `auth.js` refreshes its cache from `auth/me.php` after a successful
 * renewal, so publishing claims here would be a second, racing answer to a question that already has one.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';

use Dotenv\Dotenv;
use LiturgicalCalendar\UnitTestInterface\Oidc\Client;
use LiturgicalCalendar\UnitTestInterface\Oidc\Session;

$dotenv = Dotenv::createImmutable(
    dirname(__DIR__),
    ['.env', '.env.local', '.env.development', '.env.test', '.env.staging', '.env.production'],
    false
);
$dotenv->safeLoad();

header('Content-Type: application/json');
header('Cache-Control: no-store');

// POST only, unlike `auth/me.php` and `auth/logout.php` beside it — this one *changes state*, rotating
// the refresh token the provider hands back. The auth cookies are `SameSite=Lax`, which withholds them
// from a cross-site POST but sends them on a cross-site top-level GET navigation, so accepting GET would
// let a third-party page force a rotation in the victim's browser simply by linking here. The damage is
// bounded — the rotated session is still the victim's own and still valid — but there is no reason to
// leave it reachable, and `assets/js/auth.js` has always sent POST.
if ('POST' !== ($_SERVER['REQUEST_METHOD'] ?? 'GET')) {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['error' => 'method_not_allowed']);
    exit;
}

if (!Client::isConfigured()) {
    // Not an error state to report as a failed refresh: this deployment has no Zitadel, so the legacy
    // path is the only one there is and the client should never have asked us.
    http_response_code(404);
    echo json_encode(['error' => 'oidc_not_configured']);
    exit;
}

$refreshToken = $_COOKIE[Session::REFRESH_COOKIE] ?? null;
if (!is_string($refreshToken) || '' === $refreshToken) {
    Session::clearAuthCookies();
    http_response_code(401);
    echo json_encode(['error' => 'no_refresh_token']);
    exit;
}

try {
    $tokens = Client::fromEnv(Session::redirectUri())->refreshTokens($refreshToken);
} catch (Throwable $e) {
    // Unreachable provider. Say so distinctly and keep the cookies: see the status contract above.
    error_log('OIDC token refresh could not reach the provider: ' . $e->getMessage());
    http_response_code(502);
    echo json_encode(['error' => 'provider_unreachable']);
    exit;
}

if (null === $tokens) {
    // The provider's verdict on the token, not a fault on our side. The session is over.
    Session::clearAuthCookies();
    http_response_code(401);
    echo json_encode(['error' => 'refresh_rejected']);
    exit;
}

$accessToken = $tokens['access_token'] ?? null;
if (!is_string($accessToken) || '' === $accessToken) {
    // A 200 with no access token is a provider contract violation rather than an expired session, but it
    // leaves us with nothing to store either way, so it is reported as the session ending.
    error_log('OIDC refresh response carried no access_token.');
    Session::clearAuthCookies();
    http_response_code(401);
    echo json_encode(['error' => 'no_access_token']);
    exit;
}

$expiresIn    = is_int($tokens['expires_in'] ?? null) ? $tokens['expires_in'] : 3600;
$accessExpiry = time() + $expiresIn;

Session::setAuthCookie(Session::ACCESS_COOKIE, $accessToken, $accessExpiry);

// Zitadel rotates refresh tokens, so this is normally a NEW one and storing it is not optional — the one
// we just spent is dead, and keeping it would make the next renewal fail. A provider with rotation
// disabled sends none, in which case the stored token is still the live one and is left untouched.
$rotatedRefreshToken = $tokens['refresh_token'] ?? null;
if (is_string($rotatedRefreshToken) && '' !== $rotatedRefreshToken) {
    Session::setAuthCookie(Session::REFRESH_COOKIE, $rotatedRefreshToken, time() + Session::refreshLifetime());
}

// Kept only so logout can present it as `id_token_hint`; nothing here reads its claims. Refreshed
// alongside the access token so the hint does not outlive the session it describes.
$idToken = $tokens['id_token'] ?? null;
if (is_string($idToken) && '' !== $idToken) {
    Session::setAuthCookie(Session::ID_COOKIE, $idToken, $accessExpiry);
}

echo json_encode(['ok' => true, 'expires_in' => $expiresIn]);
