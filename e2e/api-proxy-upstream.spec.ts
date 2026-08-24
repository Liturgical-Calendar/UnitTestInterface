import { test, expect } from '@playwright/test';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';
import path from 'path';

/**
 * Which host `api-proxy.php` sends its server-side request to (issue #74).
 *
 * `API_HOST` describes the API **as the browser addresses it**. The proxy's fetch is server-side, so
 * wherever this app is served from a container those are two different addresses, and composing the
 * upstream from `API_HOST` reaches the container itself. LiturgicalCalendarFrontend already solves
 * this by honouring `API_INTERNAL_URL` and falling back to the browser-facing URL; these tests pin
 * the proxy doing the same, and pin the fallback staying byte-identical for a single-host deployment
 * (which is every deployment today, production included — so the fallback is the path that must not
 * move).
 *
 * ## Why two stub upstreams rather than the real API
 *
 * The question under test is *which* upstream was called, and a stub per candidate answers it
 * directly: each returns its own marker, so the assertion is an identity rather than an inference.
 * Pointing both candidates at the real API would make a passing test prove only that the API is up.
 * It also keeps the spec off the rate-limit budget and runnable with no API at all.
 *
 * ## Why each test spawns its own app server
 *
 * The behaviour is decided entirely by the environment `api-proxy.php` is started with, and the
 * suite's own server (`baseURL`) has a fixed one. `-d variables_order=EGPCS` is not incidental: the
 * app reads `$_ENV`, the docker image's PHP is EGPCS so that works there, and a host PHP defaulting
 * to `GPCS` would leave `$_ENV` empty and quietly test the fallback in every case.
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const STUB = path.join(__dirname, 'fixtures', 'upstream-stub.php');

const freePort = (): Promise<number> =>
    new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once('error', reject);
        probe.listen(0, '127.0.0.1', () => {
            const { port } = probe.address() as net.AddressInfo;
            probe.close(() => resolve(port));
        });
    });

/** Started processes, torn down in reverse order whatever a test did. */
const started: ChildProcess[] = [];

const waitUntilAnswering = async (url: string, timeoutMs = 15000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            const res = await fetch(url);
            if (res.status < 500) {
                return;
            }
        } catch {
            // Not up yet.
        }
        if (Date.now() > deadline) {
            throw new Error(`No PHP server answered at ${url} within ${timeoutMs}ms.`);
        }
        await new Promise((r) => setTimeout(r, 100));
    }
};

/**
 * Start `php -S` with a curated environment.
 *
 * Curated, not inherited: `playwright.config.ts` loads `.env.development` into `process.env`, which
 * carries an `API_HOST` and an `API_PROXY_ENABLED` of its own. Inheriting those would make what this
 * spec asserts depend on the developer's env file.
 */
const startPhpServer = async (args: string[], env: Record<string, string>, port: number): Promise<void> => {
    const child = spawn('php', ['-d', 'variables_order=EGPCS', '-S', `127.0.0.1:${port}`, ...args], {
        cwd: REPO_ROOT,
        env: { PATH: process.env.PATH ?? '', ...env },
        stdio: 'ignore',
    });
    started.push(child);
    await waitUntilAnswering(`http://127.0.0.1:${port}/`);
};

/** One stub upstream, answering every route with `marker`. */
const startUpstream = async (marker: string): Promise<number> => {
    const port = await freePort();
    await startPhpServer([STUB], { UPSTREAM_MARKER: marker }, port);
    return port;
};

/** This app, with the proxy on and whatever API location the test is pinning. */
const startApp = async (env: Record<string, string>): Promise<string> => {
    const port = await freePort();
    await startPhpServer(['-t', REPO_ROOT], { APP_ENV: 'development', API_PROXY_ENABLED: 'true', ...env }, port);
    return `http://127.0.0.1:${port}`;
};

test.afterEach(() => {
    while (started.length > 0) {
        started.pop()?.kill();
    }
});

test('prefers API_INTERNAL_URL over the browser-facing API_HOST', async () => {
    const internalPort = await startUpstream('internal');
    const browserFacingPort = await startUpstream('browser-facing');

    const app = await startApp({
        API_PROTOCOL: 'http',
        API_HOST: '127.0.0.1',
        API_PORT: String(browserFacingPort),
        API_INTERNAL_URL: `http://127.0.0.1:${internalPort}`,
    });

    const res = await fetch(`${app}/api-proxy.php/validations`);
    expect(res.status).toBe(200);

    const body = await res.json();
    // The identity assertion: both candidates are up, so only the proxy's choice decides this.
    expect(body.marker).toBe('internal');
    // And the route still lands where it did — preferring a host must not reshape the path.
    expect(body.path).toBe('/validations');
});

test('falls back to the API_HOST composition when no internal URL is set', async () => {
    const browserFacingPort = await startUpstream('browser-facing');

    const app = await startApp({
        API_PROTOCOL: 'http',
        API_HOST: '127.0.0.1',
        API_PORT: String(browserFacingPort),
    });

    const res = await fetch(`${app}/api-proxy.php/validations`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.marker).toBe('browser-facing');
    expect(body.path).toBe('/validations');
});

test('refuses a non-http internal URL instead of composing a request from it', async () => {
    const browserFacingPort = await startUpstream('browser-facing');

    const app = await startApp({
        API_PROTOCOL: 'http',
        API_HOST: '127.0.0.1',
        API_PORT: String(browserFacingPort),
        API_INTERNAL_URL: 'file:///etc/passwd',
    });

    const res = await fetch(`${app}/api-proxy.php/validations`);
    // Refused, not silently ignored: falling back here would send the API key somewhere the operator
    // did not configure, which is the failure a proxy cannot make quietly.
    expect(res.status).toBe(500);
    expect(res.headers.get('content-type')).toContain('application/problem+json');
    expect((await res.json()).title).toBe('Misconfigured proxy');
});

test('refuses an internal URL carrying credentials', async () => {
    const internalPort = await startUpstream('internal');

    const app = await startApp({
        API_PROTOCOL: 'http',
        API_HOST: '127.0.0.1',
        API_PORT: '8000',
        API_INTERNAL_URL: `http://someone:secret@127.0.0.1:${internalPort}`,
    });

    const res = await fetch(`${app}/api-proxy.php/validations`);
    expect(res.status).toBe(500);
    expect((await res.json()).title).toBe('Misconfigured proxy');
});
