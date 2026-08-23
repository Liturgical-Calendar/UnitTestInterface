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

    test('rejects unauthenticated requests with 401', async ({ request }) => {
        const res = await request.get('results.php');
        expect(res.status()).toBe(401);
    });
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
