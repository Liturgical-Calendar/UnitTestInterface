<?php

/**
 * "Who am I?", answered by this application rather than by the API.
 *
 * The API's own `/auth/me` verifies with its legacy HS256 service and rejects Zitadel tokens, so a page
 * that asked it directly would show a logged-out navbar to a user who had just logged in through Zitadel.
 * LiturgicalCalendarFrontend has its own `auth/me.php` for exactly this reason.
 *
 * This one simply publishes what {@see JwtAuth} resolved, so the client-side view of the session can never
 * disagree with the server-rendered one.
 */

declare(strict_types=1);

require_once dirname(__DIR__) . '/vendor/autoload.php';

use Dotenv\Dotenv;
use LiturgicalCalendar\UnitTestInterface\JwtAuth;

$dotenv = Dotenv::createImmutable(
    dirname(__DIR__),
    ['.env', '.env.local', '.env.development', '.env.test', '.env.staging', '.env.production'],
    false
);
$dotenv->safeLoad();

header('Content-Type: application/json');
header('Cache-Control: no-store');

JwtAuth::init();

if (!JwtAuth::isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['authenticated' => false]);
    exit;
}

echo json_encode([
    'authenticated' => true,
    'username'      => JwtAuth::getUsername(),
    'roles'         => JwtAuth::getRoles(),
    'exp'           => JwtAuth::getExpiry(),
]);
