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

test('UNIVERSAL_CHECKS covers both rites, temporale and decrees, files and i18n folders', async ({ page }) => {
    await load(page);
    const checks: any = await page.evaluate(async () => {
        const { UNIVERSAL_CHECKS } = await import('/assets/js/wsProtocol.js' as any);
        return UNIVERSAL_CHECKS;
    });

    expect(checks).toHaveLength(8);
    // Every entry names exactly one of sourceFile / sourceFolder.
    expect(checks.every((c: any) => ('sourceFile' in c) !== ('sourceFolder' in c))).toBe(true);
    // Category tracks that same split, not a single constant: Health::executeValidation() only
    // recognises `sourceFolder` under `category: 'sourceDataCheck'` (Health.php:609-660) — every
    // other category, `universalcalendar` included, requires `sourceFile` and throws (which closes
    // the connection) when only `sourceFolder` is present. So files stay `universalcalendar`,
    // resolved from the path via CheckableInventory::byPath(); folders are `sourceDataCheck`.
    expect(checks.every((c: any) => ('sourceFile' in c) === (c.category === 'universalcalendar'))).toBe(true);
    expect(checks.every((c: any) => ('sourceFolder' in c) === (c.category === 'sourceDataCheck'))).toBe(true);
    // Four per rite, half of them i18n folders.
    expect(checks.filter((c: any) => c.rite === 'roman')).toHaveLength(4);
    expect(checks.filter((c: any) => c.rite === 'ambrosian')).toHaveLength(4);
    expect(checks.filter((c: any) => 'sourceFolder' in c)).toHaveLength(4);
    // validate values are distinct — they become card CSS classes.
    const validates = checks.map((c: any) => c.validate);
    expect(new Set(validates).size).toBe(validates.length);
    // The Ambrosian corpus is present at all, which is the gap issue #48 opens on.
    expect(checks.some((c: any) => c.rite === 'ambrosian' && 'sourceFolder' in c)).toBe(true);
});

test('universalChecksForRite returns only that rite', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { universalChecksForRite } = await import('/assets/js/wsProtocol.js' as any);
        return {
            roman: universalChecksForRite('roman').map((c: any) => c.rite),
            ambrosian: universalChecksForRite('ambrosian').map((c: any) => c.rite),
        };
    });
    expect(result.roman).toEqual(['roman', 'roman', 'roman', 'roman']);
    expect(result.ambrosian).toEqual(['ambrosian', 'ambrosian', 'ambrosian', 'ambrosian']);
});

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

test('toWireTarget maps the empty option to the rite-level calendar', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { toWireTarget } = await import('/assets/js/wsProtocol.js' as any);
        return {
            romanRiteLevel: toWireTarget('', '', 'roman'),
            ambrosianRiteLevel: toWireTarget('', '', 'ambrosian'),
            national: toWireTarget('IT', 'national', 'roman'),
            diocesan: toWireTarget('milano_it', 'diocesan', 'ambrosian'),
        };
    });
    expect(result.romanRiteLevel).toEqual({ calendar: 'roman', category: 'ritecalendar' });
    expect(result.ambrosianRiteLevel).toEqual({ calendar: 'ambrosian', category: 'ritecalendar' });
    expect(result.national).toEqual({ calendar: 'IT', category: 'nationalcalendar' });
    expect(result.diocesan).toEqual({ calendar: 'milano_it', category: 'diocesancalendar' });
});

test('toWireTarget throws on an unknown calendartype rather than sending a partial message', async ({ page }) => {
    await load(page);
    const message = await page.evaluate(async () => {
        const { toWireTarget } = await import('/assets/js/wsProtocol.js' as any);
        try {
            toWireTarget('IT', 'nationalcalendar', 'roman');
            return null;
        } catch (e) {
            return (e as Error).message;
        }
    });
    expect(message).toContain('nationalcalendar');
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
                rite: 'roman', nation: 'IT', widerRegion: 'Europe',
                missals: ['EDITIO_TYPICA_1970', 'IT_1983'], dioceseId: null,
            }),
            diocesan: inventoryIdsForCalendar({
                rite: 'ambrosian', nation: 'IT', widerRegion: 'Europe',
                missals: [], dioceseId: 'milano_it',
            }),
        };
    });

    expect(ids.national).toEqual([
        'temporale:roman',
        'decrees:roman',
        'widerregion:roman:Europe',
        'nation:roman:IT',
        'sanctorale:roman:EDITIO_TYPICA_1970',
        'sanctorale:roman:IT_1983',
    ]);
    // The diocese is qualified by its own rite; everything it inherits stays Roman.
    expect(ids.diocesan).toContain('diocese:ambrosian:milano_it');
    expect(ids.diocesan).toContain('nation:roman:IT');
    // Coverage is deliberately held constant: no i18n ids yet. See issue #61.
    expect(ids.national.some((id: string) => id.endsWith(':i18n'))).toBe(false);
});
