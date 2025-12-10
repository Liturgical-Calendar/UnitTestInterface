import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.development (same as the app)
dotenv.config({ path: path.resolve(__dirname, '.env.development') });

/**
 * Playwright configuration for UnitTestInterface
 * Tests the admin.php JWT authentication and test management functionality
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
        /* Base URL for the frontend */
        baseURL: process.env.FRONTEND_URL || 'http://localhost:3003',

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
            command: `PHP_CLI_SERVER_WORKERS=6 php -S ${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'} -t public`,
            cwd: process.env.API_REPO_PATH || path.resolve(__dirname, '../LiturgicalCalendarAPI'),
            url: `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}/calendars`,
            reuseExistingServer: !process.env.CI,
            timeout: 120 * 1000,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            // Start UnitTestInterface server
            command: `php -S ${new URL(process.env.FRONTEND_URL || 'http://localhost:3003').host}`,
            url: process.env.FRONTEND_URL || 'http://localhost:3003',
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
