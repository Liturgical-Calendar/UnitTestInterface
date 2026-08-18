import { test, expect, Page } from '@playwright/test';

/**
 * Rite awareness (issue #39).
 *
 * The API made the liturgical rite a first-class dimension: /calendars announces rite-level
 * calendars under `ambrosian_calendars`, and every diocesan calendar carries a required `rite`.
 * These specs cover the parts of that capability that need no WebSocket server: what ends up in
 * the calendar dropdown, and how selecting a rite-level calendar reshapes the live scaffold.
 */

const apiBase = `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}`;

/** Mirrors common.js slugify(): lowercase, whitespace → '-', strip other punctuation. */
const slugify = (value: string) => value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-_]/g, '');

/**
 * Waits for setupPage() to have rendered the live scaffold.
 *
 * Deliberately NOT `expect('#startTestRunnerBtn').toBeEnabled()`: the run button also requires a
 * live WebSocket connection, and playwright.config.ts starts no WebSocket server. The scaffold, on
 * the other hand, is built purely from the /calendars, /missals and /tests fetches.
 */
const waitForLiveScaffold = async (page: Page) => {
    await page.waitForSelector('.sourcedata-tests > div', { timeout: 15000 });
};

test('the Ambrosian rite-level calendar is offered as a peer of the General Roman calendar', async ({ page, request }) => {
    const metadata = await (await request.get(`${apiBase}/calendars`)).json();
    const ambrosianCalendars = metadata.litcal_metadata.ambrosian_calendars;
    expect(ambrosianCalendars.length).toBeGreaterThan(0);

    await page.goto('/');
    await waitForLiveScaffold(page);

    for (const cal of ambrosianCalendars) {
        const option = page.locator(`#APICalendarSelect > option[value="${cal.calendar_id}"]`);
        await expect(option).toHaveCount(1);
        await expect(option).toHaveAttribute('data-calendartype', 'ritecalendar');
        await expect(option).toHaveAttribute('data-rite', cal.rite);
        // The label is the translated rite name, never the raw id and never `undefined`.
        await expect(option).not.toHaveText(cal.calendar_id);
        await expect(option).not.toHaveText('undefined');
    }

    // Rite-level calendars are peers of General Roman: they sit directly after it, before the
    // per-nation options and optgroups.
    const topLevelValues = await page.locator('#APICalendarSelect > option').evaluateAll(
        (opts) => opts.map((o) => (o as HTMLOptionElement).value)
    );
    expect(topLevelValues[0]).toBe('VA');
    expect(topLevelValues.slice(1, 1 + ambrosianCalendars.length).sort()).toEqual(
        ambrosianCalendars.map((c: { calendar_id: string }) => c.calendar_id).sort()
    );

    // The General Roman option must declare its rite too, so the change handler never has to guess.
    await expect(page.locator('#APICalendarSelect > option[value="VA"]')).toHaveAttribute('data-rite', 'roman');
});

test('Ambrosian dioceses are distinguishable from Roman ones in the dropdown', async ({ page, request }) => {
    const metadata = await (await request.get(`${apiBase}/calendars`)).json();
    const diocesanCalendars: { calendar_id: string; diocese: string; rite: string }[] =
        metadata.litcal_metadata.diocesan_calendars;
    const ambrosianDioceses = diocesanCalendars.filter((d) => d.rite === 'ambrosian');
    const romanDioceses = diocesanCalendars.filter((d) => d.rite === 'roman');
    expect(ambrosianDioceses.length).toBeGreaterThan(0);
    expect(romanDioceses.length).toBeGreaterThan(0);

    await page.goto('/');
    await waitForLiveScaffold(page);

    for (const diocese of ambrosianDioceses) {
        const option = page.locator(`#APICalendarSelect option[value="${diocese.calendar_id}"]`);
        await expect(option).toHaveCount(1);
        await expect(option).toHaveAttribute('data-calendartype', 'diocesancalendar');
        await expect(option).toHaveAttribute('data-rite', 'ambrosian');
        // The rite is spelled out in the label, so the diocese is distinguishable at a glance.
        await expect(option).toContainText(diocese.diocese);
        const label = (await option.textContent()) ?? '';
        expect(label).not.toBe(diocese.diocese);
    }

    // Roman dioceses (the large majority) keep exactly the label they always had.
    for (const diocese of romanDioceses.slice(0, 5)) {
        const option = page.locator(`#APICalendarSelect option[value="${diocese.calendar_id}"]`);
        await expect(option).toHaveAttribute('data-rite', 'roman');
        await expect(option).toHaveText(diocese.diocese);
    }
});

test('selecting the Ambrosian rite calendar rebuilds the scaffold for that rite', async ({ page, request }) => {
    const { litcal_tests: tests } = await (await request.get(`${apiBase}/tests`)).json();
    const ambrosianTests = tests.filter((t: { applies_to?: { rite?: string } }) => t.applies_to?.rite === 'ambrosian');
    const romanOnlyTests = tests.filter(
        (t: { applies_to?: Record<string, unknown> }) =>
            t.applies_to?.rite === 'roman' && Object.keys(t.applies_to ?? {}).length === 1
    );
    expect(ambrosianTests.length).toBeGreaterThan(0);
    expect(romanOnlyTests.length).toBeGreaterThan(0);

    await page.goto('/');
    await waitForLiveScaffold(page);

    // General Roman: the rite-only Ambrosian tests must NOT be offered (before rite awareness they
    // were, because a rite-only `applies_to` matched no calendar-scope key and so was never filtered).
    for (const t of ambrosianTests) {
        await expect(page.locator(`#${slugify(t.name)}Header`)).toHaveCount(0);
    }
    for (const t of romanOnlyTests) {
        await expect(page.locator(`#${slugify(t.name)}Header`)).toHaveCount(1);
    }
    // The Roman universal corpus is six source-data checks.
    await expect(page.locator('.sourcedata-tests > div')).toHaveCount(6);

    // Switch to the Ambrosian rite calendar.
    await page.selectOption('#APICalendarSelect', 'ambrosian');
    await waitForLiveScaffold(page);

    for (const t of ambrosianTests) {
        await expect(page.locator(`#${slugify(t.name)}Header`)).toHaveCount(1);
    }
    for (const t of romanOnlyTests) {
        await expect(page.locator(`#${slugify(t.name)}Header`)).toHaveCount(0);
    }
    // Ambrosian universal corpus: metadata + temporale + the 2024 sanctorale. No decrees check —
    // the decrees source data is Roman-only.
    await expect(page.locator('.sourcedata-tests > div')).toHaveCount(3);
});
