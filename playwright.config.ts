import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.development (same as the app)
dotenv.config({ path: path.resolve(__dirname, '.env.development') });

/**
 * Playwright configuration for UnitTestInterface
 * Tests both runner pages, the shared WebSocket protocol, and the authenticated results.php
 * endpoints behind Past Runs.
 */
export default defineConfig({
    testDir: './e2e',
    /* Run tests serially - authentication state is shared */
    fullyParallel: false,
    workers: 1,
    /* Fail the build on CI if you accidentally left test.only in the source code */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Reporter to use */
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['list']
    ],
    /* Shared settings for all the projects below */
    use: {
        /*
         * Base URL for the frontend.
         *
         * `127.0.0.1` rather than `localhost`, and it has to match `WS_HOST` below. Since
         * LiturgicalCalendarAPI#894 the WebSocket server reads its caller from the
         * `litcal_access_token` cookie on the handshake, and on a loopback host that cookie carries
         * no Domain attribute — browsers reject one for `localhost` and `127.0.0.1` alike — so it is
         * sent only to the exact host that set it. Serving the page from `localhost` while the socket
         * listens on `127.0.0.1` means the handshake arrives with no credential, every visitor reads
         * as anonymous, and the run controls stay disabled however well the HTTP session is doing.
         */
        baseURL: process.env.FRONTEND_URL || 'http://127.0.0.1:3003',

        /* Collect trace when retrying the failed test */
        trace: 'on-first-retry',

        /* Take screenshots on failure */
        screenshot: 'only-on-failure',

        /* Default timeout for actions */
        actionTimeout: 10000,
    },

    /* Configure projects for major browsers */
    projects: [
        // Setup project to authenticate
        {
            name: 'setup',
            testMatch: /.*\.setup\.ts/,
        },
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Use authenticated state
                storageState: 'e2e/.auth/user.json',
            },
            dependencies: ['setup'],
        },
        {
            name: 'firefox',
            use: {
                ...devices['Desktop Firefox'],
                storageState: 'e2e/.auth/user.json',
            },
            dependencies: ['setup'],
        },
        {
            name: 'webkit',
            use: {
                ...devices['Desktop Safari'],
                storageState: 'e2e/.auth/user.json',
            },
            dependencies: ['setup'],
        },
    ],

    /* Run servers before starting the tests */
    webServer: [
        {
            // Start API server first (foreground mode for Playwright)
            // API_REPO_PATH must be set in CI; defaults to sibling directory for local development
            command: `PHP_CLI_SERVER_WORKERS=6 php -S ${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'} -t public`,
            cwd: (() => {
                if (process.env.API_REPO_PATH) {
                    return process.env.API_REPO_PATH;
                }
                const defaultPath = path.resolve(__dirname, '../LiturgicalCalendarAPI');
                if (!process.env.CI) {
                    console.warn(`API_REPO_PATH not set, using default: ${defaultPath}`);
                }
                return defaultPath;
            })(),
            url: `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}/calendars`,
            reuseExistingServer: !process.env.CI,
            timeout: 120 * 1000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            // The Health WebSocket server, from the same API checkout.
            //
            // Not optional scenery: the runner pages enable their start button only once the socket
            // is open (`ReadyToRunTests.SocketReady`), so without one, any spec that waits for that
            // button waits for ever. It was easy to miss because a developer usually has one running
            // already — which is also why `reuseExistingServer` matters here as much as for the
            // other two.
            //
            // `port` rather than `url`: this speaks WebSocket, so an HTTP readiness probe would
            // never succeed. Playwright waits for the TCP port to accept instead.
            command: 'php bin/LitCalTestServer.php',
            cwd: (() => {
                if (process.env.API_REPO_PATH) {
                    return process.env.API_REPO_PATH;
                }
                return path.resolve(__dirname, '../LiturgicalCalendarAPI');
            })(),
            port: Number(process.env.WS_PORT || 8082),
            reuseExistingServer: !process.env.CI,
            timeout: 60 * 1000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            // Start UnitTestInterface server.
            //
            // Multi-worker, like the API server above, and for a sharper reason than throughput:
            // `api-proxy.php` makes a *blocking* outbound HTTP call to the API while it holds a
            // worker. On a single-worker `php -S` every other request to this origin queues behind
            // it — page assets, and the dynamic `import()` some specs run inside `page.evaluate` —
            // which surfaces as an intermittent "Execution context was destroyed" rather than as
            // anything that names the real cause. Anyone serving this app by hand wants the same
            // (see README).
            command: `PHP_CLI_SERVER_WORKERS=6 php -S ${new URL(process.env.FRONTEND_URL || 'http://127.0.0.1:3003').host}`,
            url: process.env.FRONTEND_URL || 'http://127.0.0.1:3003',
            reuseExistingServer: !process.env.CI,
            timeout: 60 * 1000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
    ],

    /* Global timeout */
    timeout: 60000,

    /* Expect timeout */
    expect: {
        timeout: 10000,
    },
});
