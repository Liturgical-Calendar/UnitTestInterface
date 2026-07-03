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
$logger->pushHandler(new StreamHandler(__DIR__ . '/logs/results.log', Level::Warning));

header('Content-Type: application/json');

if (!JwtAuth::isAuthenticated()) {
    http_response_code(401);
    echo json_encode(['error' => 'Authentication required']);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

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
    $name = str_replace(':', '-', $data['timestamp']) . '.json';
    $path = RESULTS_DIR . '/' . $name;
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($json === false || file_put_contents($path, $json) === false) {
        $logger->error('Failed to write run file', ['path' => $path]);
        http_response_code(500);
        echo json_encode(['error' => 'Write failed']);
        exit;
    }
    pruneRuns($data['runType']);
    echo json_encode(['ok' => true, 'file' => $name]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);

/**
 * Resolve a client-supplied file name to a safe absolute path inside RESULTS_DIR,
 * or null if it fails validation (defends against path traversal).
 */
function safeResultPath(string $file): ?string
{
    if (!preg_match('/^[0-9T\-Z]+\.json$/', $file)) {
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
    foreach (glob(RESULTS_DIR . '/*.json') ?: [] as $path) {
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
    usort($out, fn($a, $b) => strcmp((string) $b['file'], (string) $a['file']));
    return $out;
}

/**
 * Delete the oldest files of a given run type beyond the retention limit.
 */
function pruneRuns(string $runType): void
{
    $files = [];
    foreach (glob(RESULTS_DIR . '/*.json') ?: [] as $path) {
        $data = json_decode((string) file_get_contents($path), true);
        if (is_array($data) && ($data['runType'] ?? null) === $runType) {
            $files[] = $path;
        }
    }
    rsort($files); // newest first by name
    foreach (array_slice($files, RETENTION_PER_TYPE) as $old) {
        @unlink($old);
    }
}
