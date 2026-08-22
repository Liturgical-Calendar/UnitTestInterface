import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat config, deliberately close to LiturgicalCalendarFrontend's `eslint.config.mjs`: the two
 * repositories share authors and idioms, and a second dialect of the same tool would be one more
 * thing to keep in step.
 */
export default [
    {
        // `assets/js` is the whole scope. The e2e specs are TypeScript and already covered by
        // `npm run typecheck`; linting them properly means typescript-eslint, which is a larger
        // dependency and a separate decision. `assets/components-js` is a symlink into a sibling
        // checkout — someone else's build output.
        ignores: [
            '**/vendor/**',
            '**/node_modules/**',
            'assets/components-js/**',
            'playwright-report/**',
            'test-results/**',
            // admin.js is excluded because admin.php is being retired (#51) as superseded by
            // admin-tests.php in LiturgicalCalendarFrontend. Its five findings are small, but its
            // e2e specs are excluded from CI too, so fixing them would mean unverified edits to a
            // page nothing is watching and nobody intends to keep. It carries the only use of the
            // `Isotope` global in this repository, which is why no such global is declared below.
            // If the page survives after all, delete this line and fix what appears.
            'assets/js/admin.js',
        ],
    },
    js.configs.recommended,
    {
        files: ['assets/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Loaded from CDN script tags in layout/footer.php, so undeclared as far as a
                // module is concerned. Read-only: nothing here assigns them.
                bootstrap: 'readonly',
                // Set on `window` by layout/footer.php from the PHP environment, and destructured
                // at the top of each runner.
                LITCAL_LOCALE: 'readonly',
            },
        },
        rules: {
            // Off in the Frontend's config too. The pattern it objects to —
            // `data.hasOwnProperty('litcal_metadata')` — is used throughout the runners against
            // plain JSON that has just been parsed, where the prototype concern it guards against
            // does not arise. Rewriting them all to `Object.hasOwn` would be churn, not a fix.
            'no-prototype-builtins': 'off',
        },
    },
];
