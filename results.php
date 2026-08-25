<?php

// phpcs:disable PSR1.Files.SideEffects
ini_set('date.timezone', 'Europe/Vatican');

require_once 'vendor/autoload.php';

use LiturgicalCalendar\UnitTestInterface\JwtAuth;
use Dotenv\Dotenv;
use Monolog\Logger;
use Monolog\Level;
use Monolog\Handler\StreamHandler;

const RESULTS_DIR = __DIR__ . '/results';
const MAX_BODY_BYTES = 5242880; // 5 MB
const RETENTION_PER_TYPE = 50;
const VALID_RUN_TYPES = ['calendars', 'resources'];

$dotenv = Dotenv::createImmutable(__DIR__, ['.env', '.env.local', '.env.development', '.env.test', '.env.staging', '.env.production'], false);
$dotenv->safeLoad();

JwtAuth::init();

$logger = new Logger('results');
if (!is_dir(__DIR__ . '/logs') && !mkdir(__DIR__ . '/logs', 0775, true) && !is_dir(__DIR__ . '/logs')) {
    // logs directory unavailable; continue without file logging
} else {
    $logger->pushHandler(new StreamHandler(__DIR__ . '/logs/results.log', Level::Warning));
}

header('Content-Type: application/json');

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Reading is public; writing is not. This used to be one `isAuthenticated()` gate covering every
// method, which meant an anonymous visitor to a public test dashboard could not see any past run.
//
// What a stored run exposes was checked before opening it: no credentials and no user identity —
// only which calendars are failing validation and which API paths a run exercised. That is
// acceptable for a dashboard whose whole purpose is publishing test outcomes, and it is a
// deliberate choice rather than an oversight.
//
// The write gate answers with two distinct statuses because the client handles them differently:
// 401 means log in, 403 means logged in but not permitted, and telling an authorized-but-unroled
// user to "log in" would send them round a loop that cannot help.
if ($method === 'POST') {
    if (!JwtAuth::isAuthenticated()) {
        http_response_code(401);
        echo json_encode(['error' => 'Authentication required']);
        exit;
    }
    if (!JwtAuth::canRunTests()) {
        http_response_code(403);
        echo json_encode(['error' => 'You do not have permission to store test runs']);
        exit;
    }
}

if ($method === 'GET') {
    $file = $_GET['file'] ?? null;
    if ($file === null) {
        echo json_encode(listRuns());
        exit;
    }
    $safe = safeResultPath((string) $file);
    if ($safe === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid file parameter']);
        exit;
    }
    if (!is_file($safe)) {
        http_response_code(404);
        echo json_encode(['error' => 'Run not found']);
        exit;
    }
    readfile($safe);
    exit;
}

if ($method === 'POST') {
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    if ($raw === false || strlen($raw) > MAX_BODY_BYTES) {
        http_response_code(400);
        echo json_encode(['error' => 'Body missing or too large']);
        exit;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(400);
        echo json_encode(['error' => 'Malformed JSON']);
        exit;
    }
    $error = validateRun($data);
    if ($error !== null) {
        http_response_code(400);
        echo json_encode(['error' => $error]);
        exit;
    }
    if (!is_dir(RESULTS_DIR) && !mkdir(RESULTS_DIR, 0775, true) && !is_dir(RESULTS_DIR)) {
        $logger->error('Could not create results directory', ['dir' => RESULTS_DIR]);
        http_response_code(500);
        echo json_encode(['error' => 'Storage unavailable']);
        exit;
    }
    $name = $data['runType'] . '-' . str_replace(':', '-', $data['timestamp']) . '.json';
    $path = RESULTS_DIR . '/' . $name;
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false || file_put_contents($path, $json) === false) {
        $logger->error('Failed to write run file', ['path' => $path]);
        http_response_code(500);
        echo json_encode(['error' => 'Write failed']);
        exit;
    }
    pruneRuns($data['runType'], $logger);
    echo json_encode(['ok' => true, 'file' => $name]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

/**
 * Resolve a client-supplied file name to a safe absolute path inside RESULTS_DIR,
 * or null if it fails validation (defends against path traversal).
 *
 * This is the only thing between a **public** `?file=` parameter and an arbitrary file read, so it
 * is worth saying exactly what stops what. Traversal is blocked by the character class rather than
 * by the `basename()` check: `[0-9T\-Z]` admits no `.`, no `/` and no `\`, so `..` and an absolute
 * path are both unrepresentable, and a null byte fails it too. The `basename()` check is a second,
 * redundant line rather than the load-bearing one — kept deliberately, since a later widening of
 * the character class would otherwise silently remove the only defence.
 *
 * The `D` modifier matters here: without it PCRE's `$` also matches before a trailing newline, so
 * `calendars-….json\n` passed this check. It resolved to a path that does not exist, so nothing
 * could be read through it — but an allow-list that accepts a string it did not mean to accept is
 * not one worth relying on, and this one is now reachable without a session.
 */
function safeResultPath(string $file): ?string
{
    if (!preg_match('/^(calendars|resources)-[0-9T\-Z]+\.json$/D', $file)) {
        return null;
    }
    if (basename($file) !== $file) {
        return null;
    }
    return RESULTS_DIR . '/' . $file;
}

/**
 * Validate the run envelope. Returns an error string, or null when valid.
 *
 * @param array<string,mixed> $d
 */
function validateRun(array $d): ?string
{
    if (($d['schemaVersion'] ?? null) !== 1) {
        return 'Unsupported schemaVersion';
    }
    $ts = $d['timestamp'] ?? '';
    if (!is_string($ts) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $ts)) {
        return 'Invalid timestamp';
    }
    if (!in_array($d['runType'] ?? null, VALID_RUN_TYPES, true)) {
        return 'Invalid runType';
    }
    if (!is_int($d['duration'] ?? null) && !is_float($d['duration'] ?? null)) {
        return 'Invalid duration';
    }
    $counts = $d['counts'] ?? null;
    if (!is_array($counts) || !isset($counts['successful'], $counts['failed'])) {
        return 'Invalid counts';
    }
    return null;
}

/**
 * List metadata for every stored run, newest first.
 *
 * @return array<int,array<string,mixed>>
 */
function listRuns(): array
{
    $out = [];
    // Only list files whose names safeResultPath() would accept on load —
    // anything else (legacy or foreign .json files) would list but never load.
    $paths = array_merge(
        glob(RESULTS_DIR . '/calendars-*.json') ?: [],
        glob(RESULTS_DIR . '/resources-*.json') ?: []
    );
    foreach ($paths as $path) {
        $data = json_decode((string) file_get_contents($path), true);
        if (!is_array($data)) {
            continue;
        }
        $out[] = [
            'file'         => basename($path),
            'timestamp'    => $data['timestamp'] ?? null,
            'runType'      => $data['runType'] ?? null,
            'calendar'     => $data['calendar'] ?? null,
            'responseType' => $data['responseType'] ?? null,
            'counts'       => $data['counts'] ?? null,
            'duration'     => $data['duration'] ?? null,
        ];
    }
    usort($out, fn($a, $b) => strcmp((string) $b['timestamp'], (string) $a['timestamp']));
    return $out;
}

/**
 * Delete the oldest files of a given run type beyond the retention limit.
 */
function pruneRuns(string $runType, Logger $logger): void
{
    // Type-prefix in the filename lets us filter by runType without decoding JSON.
    $files = glob(RESULTS_DIR . '/' . $runType . '-*.json') ?: [];
    rsort($files); // newest first by name (ISO timestamp follows the prefix, sort is correct)
    foreach (array_slice($files, RETENTION_PER_TYPE) as $old) {
        if (!unlink($old)) {
            $logger->warning('Failed to prune old run file', ['path' => $old]);
        }
    }
}
