import { test, expect } from '@playwright/test';

const sampleRun = {
    schemaVersion: 1,
    timestamp: '2026-07-03T14:30:00Z',
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
    const save = await request.post('results.php', { data: sampleRun });
    expect(save.ok()).toBeTruthy();
    const { ok, file } = await save.json();
    expect(ok).toBe(true);
    expect(file).toMatch(/^[0-9T-]+Z\.json$/);

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
