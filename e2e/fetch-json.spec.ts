import { test, expect } from '@playwright/test';

/**
 * The header contract of `fetchJson()` in `assets/js/common.js`.
 *
 * This helper has drawn three separate review findings, each a *silent* failure: an exact-string
 * `Content-Type` comparison that discarded the API's `detail`, a whole-object default parameter that
 * dropped `Accept` the moment a caller passed anything, and an object spread that handled only one of
 * `HeadersInit`'s three legal shapes — a `Headers` instance spreads to `{}` and an array of tuples to
 * `{0: [...]}`, so in both cases the caller's headers vanished without a word.
 *
 * No caller passes `init` today. That is exactly why this test exists: the parameter is correct now,
 * and nothing else in the repository would notice if it stopped being. The helper lives in
 * `common.js` precisely so that callers *will* use it, and the reason it was consolidated there is
 * that each page had written its own and each had got it wrong differently.
 *
 * The probe URL is fulfilled by the test rather than reaching any server, so what is asserted is the
 * header set `fetch()` was actually called with.
 */

const PROBE = '/fetch-json-probe';

type ProbeCase = 'none' | 'object' | 'headers' | 'tuples' | 'override';

test('fetchJson normalises every HeadersInit shape and defaults Accept without overriding it', async ({ page }) => {
    // The runner pages are not the subject here, and reaching the real API would make this test
    // depend on a rate limit it has nothing to do with. Refusing the metadata routes leaves the page
    // to degrade the way #63 made it degrade, which is enough for the module to be importable.
    await page.route(/\/(calendars|tests|missals|validations)(\?|$)/, (route) =>
        route.fulfill({
            status: 503,
            contentType: 'application/problem+json',
            body: JSON.stringify({ detail: 'stubbed by fetch-json.spec.ts' }),
        }));

    const captured: Record<string, Record<string, string>> = {};
    let current: ProbeCase = 'none';
    await page.route(`**${PROBE}*`, async (route) => {
        captured[current] = route.request().headers();
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto('/resources.php');

    const probe = async (kind: ProbeCase): Promise<void> => {
        current = kind;
        await page.evaluate(async ({ kind: k, url }) => {
            const { fetchJson } = await import('/assets/js/common.js' as any);
            const init =
                'none' === k ? undefined
                : 'object' === k ? { headers: { 'X-Probe': 'yes' } }
                : 'headers' === k ? { headers: new Headers({ 'X-Probe': 'yes' }) }
                : 'tuples' === k ? { headers: [['X-Probe', 'yes']] }
                : { headers: { Accept: 'application/yaml' } };
            await fetchJson(url, init);
        }, { kind, url: PROBE });
    };

    for (const kind of ['none', 'object', 'headers', 'tuples', 'override'] as const) {
        await probe(kind);
    }

    // The default, when the caller says nothing.
    expect(captured.none.accept).toBe('application/json');
    expect(captured.none['x-probe']).toBeUndefined();

    // All three legal shapes must reach `fetch()` intact, alongside the default. `headers` and
    // `tuples` are the two the previous object-spread implementation silently discarded.
    for (const kind of ['object', 'headers', 'tuples'] as const) {
        expect(captured[kind].accept, `${kind}: default Accept`).toBe('application/json');
        expect(captured[kind]['x-probe'], `${kind}: caller's own header`).toBe('yes');
    }

    // A caller that genuinely wants a different Accept wins: the default is a default, not a policy.
    expect(captured.override.accept).toBe('application/yaml');
});
