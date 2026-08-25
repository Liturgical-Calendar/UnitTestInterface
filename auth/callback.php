<?php

/**
 * OIDC callback: exchange the authorization code for tokens and store them as HttpOnly cookies.
 *
 * The tokens are never inspected here. They go into the cookies the API reads, and `JwtAuth` asks the API
 * who the caller is — see that class for why this repository validates nothing itself.
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

Session::start();

$storedState    = $_SESSION[Session::KEY_STATE] ?? null;
$storedVerifier = $_SESSION[Session::KEY_VERIFIER] ?? null;
$returnTo       = Session::sanitizeReturnTo($_SESSION[Session::KEY_RETURN_TO] ?? null);

// Single-use: whatever happens below, this attempt is over. Clearing before the exchange means a replayed
// callback cannot reuse the verifier even if the exchange itself throws.
Session::forgetPkce();

if (!Client::isConfigured()) {
    Session::redirectWithError('oidc_not_configured');
}

// Zitadel reports its own failures here rather than at the token endpoint.
if (isset($_GET['error'])) {
    error_log('OIDC provider returned an error: ' . substr((string) $_GET['error'], 0, 128));
    Session::redirectWithError('provider_error');
}

$code  = isset($_GET['code']) ? (string) $_GET['code'] : '';
$state = isset($_GET['state']) ? (string) $_GET['state'] : '';

if ('' === $code || '' === $state) {
    Session::redirectWithError('invalid_request');
}

// hash_equals, not ===: state is the CSRF defence for this flow, so the comparison is not a place to leak
// timing. A missing stored state means no login was started from this browser.
if (!is_string($storedState) || !hash_equals($storedState, $state)) {
    Session::redirectWithError('state_mismatch');
}

if (!is_string($storedVerifier) || '' === $storedVerifier) {
    Session::redirectWithError('missing_verifier');
}

try {
    $tokens = Client::fromEnv(Session::redirectUri())->exchangeCode($code, $storedVerifier);
} catch (Throwable $e) {
    error_log('OIDC token exchange failed: ' . $e->getMessage());
    Session::redirectWithError('token_exchange_failed');
}

$accessToken = $tokens['access_token'] ?? null;
if (!is_string($accessToken) || '' === $accessToken) {
    error_log('OIDC token endpoint returned no access_token.');
    Session::redirectWithError('no_access_token');
}

$expiresIn    = is_int($tokens['expires_in'] ?? null) ? $tokens['expires_in'] : 3600;
$accessExpiry = time() + $expiresIn;

Session::setAuthCookie(Session::ACCESS_COOKIE, $accessToken, $accessExpiry);

$refreshToken = $tokens['refresh_token'] ?? null;
if (is_string($refreshToken) && '' !== $refreshToken) {
    Session::setAuthCookie(Session::REFRESH_COOKIE, $refreshToken, time() + Session::refreshLifetime());
}

// Kept only so logout can present it as `id_token_hint`; nothing here reads its claims.
$idToken = $tokens['id_token'] ?? null;
if (is_string($idToken) && '' !== $idToken) {
    Session::setAuthCookie(Session::ID_COOKIE, $idToken, $accessExpiry);
}

header('Location: ' . $returnTo, true, 302);
exit;
