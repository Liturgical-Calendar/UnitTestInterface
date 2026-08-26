import { test, expect } from '@playwright/test';
import { postStoredRun, removeSeededRuns } from './storedRuns';

// Clean up seeded run files so e2e fixtures don't pollute the real Past Runs dropdown.
test.afterAll(removeSeededRuns);

// No `timestamp` here: this spec's subject is the POST route, so it cannot avoid triggering
// retention; postStoredRun() stamps the run with the current UTC second so it sorts above every
// stored run and survives its own prune (issue #65).
const sampleRun = {
    schemaVersion: 1,
    runType: 'calendars',
    calendar: 'VA',
    calendarCategory: 'nationalcalendar',
    responseType: 'JSON',
    duration: 1234,
    counts: { successful: 2, failed: 0 },
    timings: { sourceData: 10, calendarData: 20, unitTests: 30 },
    scaffold: { sourceDataChecks: [], years: [], unitTests: [] },
    sourceDataResults: [],
    calendarDataResults: [],
    unitTestResults: [],
};

test.describe('unauthenticated', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    // Reading stored runs is deliberately public: this is a public test dashboard, and the
    // stored runs carry no credentials and no user identity. Writing is not — see the POST
    // cases below. The two used to share one gate at the top of results.php.
    test('lists runs without a session', async ({ request }) => {
        const res = await request.get('results.php');
        expect(res.status()).toBe(200);
        expect(Array.isArray(await res.json())).toBe(true);
    });

    test('loads one stored run without a session', async ({ request }) => {
        // Seeded by an authenticated request in the shared `test` project below; if no run is
        // stored yet there is nothing to read back, and the listing case above already covers
        // the route being open.
        const list = await request.get('results.php');
        const summaries = await list.json();
        test.skip(summaries.length === 0, 'no stored run to read back');
        const detail = await request.get(`results.php?file=${encodeURIComponent(summaries[0].file)}`);
        expect(detail.status()).toBe(200);
        expect(await detail.json()).toHaveProperty('runType');
    });

    test('still refuses to store a run', async ({ request }) => {
        const res = await request.post('results.php', {
            headers: { 'Content-Type': 'application/json' },
            data: sampleRun,
        });
        expect(res.status()).toBe(401);
    });

    // safeResultPath() is the only thing between a now-public `?file=` and an arbitrary file
    // read, so the traversal cases are asserted without a session too.
    for (const attempt of [
        '..%2F..%2Fcomposer.json',
        '..%2Fcomposer.json',
        '%2Fetc%2Fpasswd',
        'calendars-2026-01-01T00-00-00Z.json%00.png',
        'calendars-..%2F..%2Fcomposer.json',
        'results/../../composer.json',
        'composer.json',
    ]) {
        test(`refuses \`?file=${attempt}\``, async ({ request }) => {
            const res = await request.get(`results.php?file=${attempt}`);
            // 400 (rejected by the pattern) or 404 (accepted shape, no such run) — never 200,
            // and never the contents of a file outside the results directory.
            expect([400, 404]).toContain(res.status());
        });
    }
});

test('the listing never advertises a run that cannot be loaded', async ({ request }) => {
    // The globs listRuns() uses are broader than safeResultPath()'s allow-list: `calendars-foo.json`
    // matches `calendars-*.json` but is not loadable. Such a file must not reach the listing, or the
    // dropdown offers an entry whose `?file=` answers 400 — and, now that listing is public, the
    // names of unrelated files in the directory would be published.
    const list = await request.get('results.php');
    expect(list.status()).toBe(200);
    const summaries = await list.json() as { file: string }[];

    // Every listed name must be one the detail route accepts. Asserted against the pattern rather
    // than by fetching each: the listing can hold up to RETENTION_PER_TYPE * 2 entries, and this
    // suite shares the API's rate-limit budget.
    for (const summary of summaries) {
        expect(summary.file, `${summary.file} is listed but safeResultPath() would reject it`)
            .toMatch(/^(calendars|resources)-[0-9TZ-]+\.json$/);
    }
});

test('rejects path traversal on load', async ({ request }) => {
    const res = await request.get('results.php?file=..%2F..%2Fcomposer.json');
    expect(res.status()).toBe(400);
});

test('rejects malformed body on save', async ({ request }) => {
    const res = await request.post('results.php', {
        headers: { 'Content-Type': 'application/json' },
        data: 'not-json',
    });
    expect(res.status()).toBe(400);
});

test('saves, lists, and loads a run', async ({ request }) => {
    // postStoredRun() does the POST and throws if the endpoint refused it or if the stored
    // file could not be read back, so reaching this line already covers save + reload.
    const file = await postStoredRun(request, sampleRun);
    expect(file).toMatch(/^(calendars|resources)-[0-9T-]+Z\.json$/);

    const list = await request.get('results.php');
    expect(list.ok()).toBeTruthy();
    const summaries = await list.json();
    const found = summaries.find((r: { file: string }) => r.file === file);
    expect(found).toBeTruthy();
    expect(found.counts).toEqual({ successful: 2, failed: 0 });
    expect(found).not.toHaveProperty('sourceDataResults');

    const detail = await request.get(`results.php?file=${encodeURIComponent(file)}`);
    expect(detail.ok()).toBeTruthy();
    const full = await detail.json();
    expect(full.runType).toBe('calendars');
    expect(full).toHaveProperty('scaffold');
});
