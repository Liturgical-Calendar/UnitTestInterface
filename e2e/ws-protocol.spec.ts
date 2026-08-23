import { test, expect } from '@playwright/test';

/**
 * The shared protocol helpers (issue #48).
 *
 * Exercised in the page context rather than in Node: assets/js/wsProtocol.js is a browser ES
 * module served by the PHP dev server, and this repo has no JS unit runner. Importing it by
 * URL keeps the test dependency-free and tests the file the browser actually loads.
 */
const load = async (page: import('@playwright/test').Page) => {
    await page.goto('/');
    return page;
};


test('inRiteScope treats a missing rite as roman, never as a wildcard', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { inRiteScope } = await import('/assets/js/wsProtocol.js' as any);
        return {
            match: inRiteScope({ rite: 'ambrosian' }, 'ambrosian'),
            mismatch: inRiteScope({ rite: 'ambrosian' }, 'roman'),
            absentUnderRoman: inRiteScope({}, 'roman'),
            absentUnderAmbrosian: inRiteScope({}, 'ambrosian'),
        };
    });
    expect(result.match).toBe(true);
    expect(result.mismatch).toBe(false);
    expect(result.absentUnderRoman).toBe(true);
    expect(result.absentUnderAmbrosian).toBe(false);
});

test('testAppliesToRite filters a rite-only scope and defaults an absent rite to roman', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { testAppliesToRite } = await import('/assets/js/wsProtocol.js' as any);
        return {
            ambrosianUnderAmbrosian: testAppliesToRite({ applies_to: { rite: 'ambrosian' } }, 'ambrosian'),
            ambrosianUnderRoman: testAppliesToRite({ applies_to: { rite: 'ambrosian' } }, 'roman'),
            legacyUnderRoman: testAppliesToRite({ appliesTo: { national_calendar: 'IT' } }, 'roman'),
            legacyUnderAmbrosian: testAppliesToRite({ appliesTo: { national_calendar: 'IT' } }, 'ambrosian'),
        };
    });
    expect(result.ambrosianUnderAmbrosian).toBe(true);
    expect(result.ambrosianUnderRoman).toBe(false);
    expect(result.legacyUnderRoman).toBe(true);
    expect(result.legacyUnderAmbrosian).toBe(false);
});

test('inventoryIdsForCalendar composes the ids the API advertises', async ({ page }) => {
    await page.goto('/resources.php');
    const ids = await page.evaluate(async () => {
        const { inventoryIdsForCalendar } = await import('/assets/js/wsProtocol.js' as any);
        return {
            national: inventoryIdsForCalendar({
                rite: 'roman', dioceseRite: 'roman', nation: 'IT', widerRegion: 'Europe',
                missals: ['EDITIO_TYPICA_1970', 'IT_1983'], dioceseId: null,
            }),
            // A national/diocesan calendar's universal corpus is always Roman (rite: 'roman'),
            // even though this diocese's own rite — and therefore its diocese id — is Ambrosian.
            diocesan: inventoryIdsForCalendar({
                rite: 'roman', dioceseRite: 'ambrosian', nation: 'IT', widerRegion: 'Europe',
                missals: [], dioceseId: 'milano_it',
            }),
            // A rite-level calendar has no diocese id, so `rite` and `dioceseRite` are simply the
            // same selected rite. Ambrosian's universal corpus is temporale + sanctorale, never
            // decrees (a Roman-only file v1 never checked here either).
            ambrosianRiteLevel: inventoryIdsForCalendar({
                rite: 'ambrosian', dioceseRite: 'ambrosian', nation: null, widerRegion: null,
                missals: [], dioceseId: null,
            }),
        };
    });

    // The universal corpus (temporale + decrees) includes i18n folders (#48); only the calendar-specific tier omits i18n (#61).
    expect(ids.national).toEqual([
        'temporale:roman',
        'temporale:roman:i18n',
        'decrees:roman',
        'decrees:roman:i18n',
        'widerregion:roman:Europe',
        'nation:roman:IT',
        'sanctorale:roman:EDITIO_TYPICA_1970',
        'sanctorale:roman:IT_1983',
    ]);
    // toEqual, not toContain: the diocese is qualified by its own rite while everything it inherits
    // stays Roman-qualified — a wrong rite on either half, or an extra/missing id, must fail this.
    expect(ids.diocesan).toEqual([
        'temporale:roman',
        'temporale:roman:i18n',
        'decrees:roman',
        'decrees:roman:i18n',
        'widerregion:roman:Europe',
        'nation:roman:IT',
        'diocese:ambrosian:milano_it',
    ]);
    expect(ids.ambrosianRiteLevel).toEqual([
        'temporale:ambrosian',
        'temporale:ambrosian:i18n',
        'sanctorale:ambrosian',
        'sanctorale:ambrosian:i18n',
    ]);
    // decrees:roman must never appear under a pure-Ambrosian scope — v1 never checked it there.
    expect(ids.ambrosianRiteLevel.some((id: string) => id.startsWith('decrees:'))).toBe(false);
});

test('toCalendarIdentity maps the select values onto the typed calendar', async ({ page }) => {
    await page.goto('/index.php');
    const identities = await page.evaluate(async () => {
        const { toCalendarIdentity } = await import('/assets/js/wsProtocol.js' as any);
        return {
            riteLevel: toCalendarIdentity('', '', 'roman'),
            ambrosianRiteLevel: toCalendarIdentity('', '', 'ambrosian'),
            national: toCalendarIdentity('IT', 'national', 'roman'),
            diocesan: toCalendarIdentity('milano_it', 'diocesan', 'ambrosian'),
        };
    });

    expect(identities.riteLevel).toEqual({ kind: 'rite', rite: 'roman' });
    expect(identities.ambrosianRiteLevel).toEqual({ kind: 'rite', rite: 'ambrosian' });
    expect(identities.national).toEqual({ kind: 'national', id: 'IT', rite: 'roman' });
    expect(identities.diocesan).toEqual({ kind: 'diocesan', id: 'milano_it', rite: 'ambrosian' });
});

test('toCalendarIdentity throws on an unknown calendartype rather than sending a partial message', async ({ page }) => {
    await page.goto('/index.php');
    const threw = await page.evaluate(async () => {
        const { toCalendarIdentity } = await import('/assets/js/wsProtocol.js' as any);
        try {
            toCalendarIdentity('IT', 'nationalcalendar', 'roman');
            return false;
        } catch {
            return true;
        }
    });
    expect(threw).toBe(true);
});
