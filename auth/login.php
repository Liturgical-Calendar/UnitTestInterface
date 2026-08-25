<?php

/**
 * OIDC login initiator.
 *
 * Mints a PKCE verifier, state and nonce, stores them in the session, and redirects the user agent to
 * Zitadel. The matching `callback.php` is the only thing that reads them back.
 *
 * UnitTestInterface has its own Zitadel client registration rather than borrowing the Frontend's, so it
 * keeps working if the two are ever served from different hosts — cookie sharing across registrable
 * domains is not possible, and planning for a separately deployed test interface is cheaper than
 * retrofitting it. `scripts/setup-zitadel.sh` in LiturgicalCalendarAPI already provisions that client as
 * "LiturgicalCalendar Tests", with this file's callback as its redirect URI.
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

if (!Client::isConfigured()) {
    // Not an error page: the interface falls back to its legacy modal when Zitadel is absent, and this
    // endpoint simply should not have been reached.
    header('Content-Type: application/json');
    http_response_code(503);
    echo json_encode(['error' => 'OIDC is not configured']);
    exit;
}

$returnTo = Session::sanitizeReturnTo($_GET['return_to'] ?? null);

try {
    $client = Client::fromEnv(Session::redirectUri());

    $verifier = Client::generateVerifier();
    $state    = Client::randomValue();
    $nonce    = Client::randomValue();

    Session::start();
    $_SESSION[Session::KEY_VERIFIER]  = $verifier;
    $_SESSION[Session::KEY_STATE]     = $state;
    $_SESSION[Session::KEY_NONCE]     = $nonce;
    $_SESSION[Session::KEY_RETURN_TO] = $returnTo;

    $url = $client->getAuthorizationUrl($state, $nonce, Client::challengeFor($verifier));
} catch (Throwable $e) {
    error_log('OIDC login could not be started: ' . $e->getMessage());
    Session::redirectWithError('login_failed');
}

header('Location: ' . $url, true, 302);
exit;
