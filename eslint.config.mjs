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
            // admin.php was retired (#51, superseded by admin-tests.php in
            // LiturgicalCalendarFrontend) and its assets moved under archive/. Nothing there is
            // served or included, so linting it would mean acting on findings in code that does
            // not run. It carries the only use of the `Isotope` global in this repository, which
            // is why no such global is declared below. See archive/README.md.
            'archive/**',
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
