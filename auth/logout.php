<?php

/**
 * Log out: drop this application's cookies, then hand off to the provider's end-session endpoint so the
 * Zitadel session goes too. Without that second step the next login would silently re-authenticate.
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

$idToken = $_COOKIE[Session::ID_COOKIE] ?? null;

Session::start();
Session::forgetPkce();
Session::clearAuthCookies();
session_destroy();

$destination = '/';

if (Client::isConfigured()) {
    try {
        $logoutUrl = Client::fromEnv(Session::redirectUri())
            ->getLogoutUrl(is_string($idToken) ? $idToken : null, Session::origin() . '/');
        if (is_string($logoutUrl)) {
            $destination = $logoutUrl;
        }
    } catch (Throwable $e) {
        // The local cookies are already gone, which is the part that matters. Ending the provider session
        // is best-effort: failing to reach Zitadel must not leave the user on an error page.
        error_log('OIDC logout URL could not be built: ' . $e->getMessage());
    }
}

header('Location: ' . $destination, true, 302);
exit;
