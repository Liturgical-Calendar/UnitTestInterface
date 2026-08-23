<?php

/**
 * A stand-in for the API, used only by `api-proxy-upstream.spec.ts`.
 *
 * The spec runs two of these at once and asks which one `api-proxy.php` actually called. Each is
 * started with a different `UPSTREAM_MARKER`, and answers every route with that marker — so the
 * assertion is "which upstream answered", which is precisely the question the proxy's host
 * resolution decides. Hitting the real API instead would answer the same question only by accident
 * (both candidate URLs would work), spend rate-limit budget, and make the spec depend on an API
 * being up.
 *
 * Used as `php -S host:port <this file>`: a router script answers every path, so no docroot layout
 * has to be mirrored here.
 */

declare(strict_types=1);

header('Content-Type: application/json');
echo json_encode([
    'marker'             => getenv('UPSTREAM_MARKER') ?: 'unknown',
    'path'               => $_SERVER['REQUEST_URI'] ?? '',
    'apiKey'             => $_SERVER['HTTP_X_API_KEY'] ?? null,
    // Enough shape that a caller parsing a real /validations response does not choke.
    'litcal_validations' => [],
], JSON_UNESCAPED_SLASHES);
