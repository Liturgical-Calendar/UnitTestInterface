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

/** The live API, for the specs that check a composition against what it really advertises. */
const apiBase = `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}`;


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

    // Every tier carries its i18n folder: the universal corpus since #48, the calendar-specific
    // tier (wider region, nation, missals, diocese) since #61 part 1. Each calendar-tier id is
    // followed by its ':i18n' and ':lectionary' partners, which is the ordering the scaffold renders
    // the cards in. The universal corpus has no ':lectionary' sibling composed here — the rite-level
    // lectionary sections are discovered from the inventory by prefix instead, because their names
    // are not derivable from /calendars metadata.
    expect(ids.national).toEqual([
        'temporale:roman',
        'temporale:roman:i18n',
        'decrees:roman',
        'decrees:roman:i18n',
        'widerregion:roman:Europe',
        'widerregion:roman:Europe:i18n',
        'widerregion:roman:Europe:lectionary',
        'nation:roman:IT',
        'nation:roman:IT:i18n',
        'nation:roman:IT:lectionary',
        'sanctorale:roman:EDITIO_TYPICA_1970',
        'sanctorale:roman:EDITIO_TYPICA_1970:i18n',
        'sanctorale:roman:EDITIO_TYPICA_1970:lectionary',
        'sanctorale:roman:IT_1983',
        'sanctorale:roman:IT_1983:i18n',
        'sanctorale:roman:IT_1983:lectionary',
    ]);
    // toEqual, not toContain: the diocese is qualified by its own rite while everything it inherits
    // stays Roman-qualified — a wrong rite on either half, or an extra/missing id, must fail this.
    // The diocese's i18n id is qualified by the same rite as the diocese itself.
    expect(ids.diocesan).toEqual([
        'temporale:roman',
        'temporale:roman:i18n',
        'decrees:roman',
        'decrees:roman:i18n',
        'widerregion:roman:Europe',
        'widerregion:roman:Europe:i18n',
        'widerregion:roman:Europe:lectionary',
        'nation:roman:IT',
        'nation:roman:IT:i18n',
        'nation:roman:IT:lectionary',
        'diocese:ambrosian:milano_it',
        'diocese:ambrosian:milano_it:i18n',
        'diocese:ambrosian:milano_it:lectionary',
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

test('every composed id is one the API really advertises', async ({ page, request }) => {
    // The failure mode #61 has to defend against: buildSourceDataChecks() resolves a composed id
    // against /validations and *skips* one the server does not know, so a mistyped id degrades to
    // silently-missing coverage rather than to a visible error. Checking the composition against
    // the live inventory is what turns that back into a test failure.
    // Status-checked before parsing. This endpoint answers 429 routinely in local development, and a
    // problem document parses perfectly well — so an unchecked `.json()` fails later, on a property
    // access, reporting a shape error for what is really a rate limit.
    const validationsResponse = await request.get(`${apiBase}/validations`);
    expect(validationsResponse.ok(), `GET /validations: ${validationsResponse.status()} ${validationsResponse.statusText()}`).toBeTruthy();
    const advertised: string[] = (await validationsResponse.json())
        .litcal_validations.map((item: { id: string }) => item.id);
    expect(advertised.length).toBeGreaterThan(0);

    // A real national calendar rather than a fixture, taken from the same metadata the runner uses,
    // so the wider region and missal ids are the ones a live run would actually compose.
    const calendarsResponse = await request.get(`${apiBase}/calendars`);
    expect(calendarsResponse.ok(), `GET /calendars: ${calendarsResponse.status()} ${calendarsResponse.statusText()}`).toBeTruthy();
    const metadata = (await calendarsResponse.json()).litcal_metadata;
    const nation = metadata.national_calendars.find(
        (n: { calendar_id: string }) => n.calendar_id === 'IT'
    );
    const diocese = metadata.diocesan_calendars.find(
        (d: { nation: string; rite?: string }) => d.nation === 'IT' && (d.rite ?? 'roman') === 'roman'
    );
    expect(nation).toBeTruthy();
    expect(diocese).toBeTruthy();

    await page.goto('/resources.php');
    const { composed, conditional } = await page.evaluate(async (scope) => {
        const { inventoryIdsForCalendar, isConditionalInventoryId } =
            await import('/assets/js/wsProtocol.js' as any);
        const ids: string[] = inventoryIdsForCalendar(scope);
        return { composed: ids, conditional: ids.filter(isConditionalInventoryId) };
    }, {
        rite: 'roman', dioceseRite: 'roman', nation: nation.calendar_id,
        widerRegion: nation.wider_region, missals: nation.missals, dioceseId: diocese.calendar_id,
    });

    // The missal ids the API is entitled not to publish, named explicitly. Deriving this from
    // `advertised` — "excuse any missal id that happens to be missing" — would excuse a genuine
    // composition bug just as readily as this known gap, and the assertion would then be testing
    // nothing about the missal family at all: `IT.json` declares IT_2020, for which the API has no
    // sanctorale source file, so neither of its ids is published.
    const TOLERATED_ABSENT = ['sanctorale:roman:IT_2020', 'sanctorale:roman:IT_2020:i18n'];
    const optional = new Set([...conditional, ...TOLERATED_ABSENT]);
    const mustExist = composed.filter((id) => !optional.has(id));
    // Guard the guard: a filter that removed everything would make the assertion below vacuous.
    expect(mustExist.length).toBeGreaterThanOrEqual(8);
    expect(mustExist.filter((id) => !advertised.includes(id))).toEqual([]);

    // The tolerated set is exactly what is absent, once the lectionary family is set aside — nothing
    // more, and nothing less. This is what restores the coverage `optional` removes: it asserts that
    // every *other* missal id (IT_1983 and both its forms) really is advertised, and it fails if the
    // upstream gap is ever filled, so the tolerance cannot outlive the reason for it.
    //
    // The lectionary family is excluded rather than enumerated because absence is its *ordinary*
    // state, not a gap: a `:lectionary` sibling is composed beside every calendar-tier id, and most
    // calendars have no such folder. Listing today's absentees here would pin the contents of
    // jsondata/sourcedata rather than the composition, and would fail the day anyone writes one.
    // The positive assertion below is what keeps this family honest instead.
    const absentNonLectionary = composed
        .filter((id) => !advertised.includes(id) && !id.endsWith(':lectionary'))
        .sort();
    expect(absentNonLectionary).toEqual([...TOLERATED_ABSENT].sort());

    // The lectionary folders that do exist upstream are genuinely advertised, not merely "not
    // disagreed with": excluding the family above would otherwise pass just as well if the API
    // published none of them. Italy has a wider-region and a missal lectionary; its nation tier does
    // not, which is exactly why the composed id for it is allowed to go unadvertised.
    for (const id of [
        `widerregion:roman:${nation.wider_region}:lectionary`,
        'sanctorale:roman:IT_1983:lectionary',
    ]) {
        expect(composed).toContain(id);
        expect(advertised).toContain(id);
    }

    // And the calendar-specific i18n ids #61 added are genuinely present upstream, not merely
    // "not disagreed with" — the assertion above would pass just as well if the API published none.
    for (const id of [
        `widerregion:roman:${nation.wider_region}:i18n`,
        `nation:roman:${nation.calendar_id}:i18n`,
        `diocese:roman:${diocese.calendar_id}:i18n`,
    ]) {
        expect(composed).toContain(id);
        expect(advertised).toContain(id);
    }
});

test('only the missal family is treated as optionally absent', async ({ page }) => {
    await page.goto('/resources.php');
    const verdicts = await page.evaluate(async () => {
        const { isConditionalInventoryId } = await import('/assets/js/wsProtocol.js' as any);
        return {
            // Both missal forms. The API emits the translation id only when the missal has an i18n
            // folder, and the base id only when it has a sanctorale source file at all — IT.json
            // declares IT_2020, for which it has neither. Missal ids are composed from /calendars
            // metadata rather than typed, so an unadvertised one is an upstream data gap this page
            // cannot act on, and warning per page load would only bury the warnings that matter.
            missalI18n: isConditionalInventoryId('sanctorale:roman:IT_1983:i18n'),
            missalFile: isConditionalInventoryId('sanctorale:roman:IT_1983'),
            unpublishedMissalFile: isConditionalInventoryId('sanctorale:roman:IT_2020'),
            unpublishedMissalI18n: isConditionalInventoryId('sanctorale:roman:IT_2020:i18n'),
            // Three segments like a base missal id, and deliberately NOT optional: the Ambrosian
            // rite's own sanctorale translations are unconditional, and treating them as optional
            // would silently drop universal coverage. This is the case the predicate's negative
            // lookahead exists for.
            riteSanctoraleI18n: isConditionalInventoryId('sanctorale:ambrosian:i18n'),
            riteSanctorale: isConditionalInventoryId('sanctorale:ambrosian'),
            nationI18n: isConditionalInventoryId('nation:roman:IT:i18n'),
            widerRegionI18n: isConditionalInventoryId('widerregion:roman:Europe:i18n'),
            dioceseI18n: isConditionalInventoryId('diocese:ambrosian:milano_it:i18n'),
        };
    });

    expect(verdicts).toEqual({
        missalI18n: true,
        missalFile: true,
        unpublishedMissalFile: true,
        unpublishedMissalI18n: true,
        riteSanctoraleI18n: false,
        riteSanctorale: false,
        nationI18n: false,
        widerRegionI18n: false,
        dioceseI18n: false,
    });
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

test('the covers step has a card class and a card body', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { STEP_CARD_CLASS, STEP_CARD_BODY } = await import('/assets/js/wsProtocol.js' as any);
        return {
            cardClass: STEP_CARD_CLASS.covers,
            hasBody: 'function' === typeof STEP_CARD_BODY.covers,
        };
    });
    expect(result.cardClass).toBe('step-covers');
    expect(result.hasBody).toBe(true);
});

/**
 * The fallback is for checks that never came from the inventory — the bare-URL `executeValidation`
 * checks, the calendar-data years, and runs stored before the #42 migration — and every one of those
 * is a three-step check by construction. It used to be derived from `STEP_CARD_CLASS`, so adding a
 * fourth card class would silently have given all of them a fourth card no frame ever paints.
 */
test('a check advertising no steps still falls back to exactly the three', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { stepsForCheck } = await import('/assets/js/wsProtocol.js' as any);
        return {
            undef: stepsForCheck(undefined),
            empty: stepsForCheck({}),
            advertised: stepsForCheck({ steps: ['exists', 'parses', 'validates', 'covers'] }),
        };
    });
    expect(result.undef).toEqual(['exists', 'parses', 'validates']);
    expect(result.empty).toEqual(['exists', 'parses', 'validates']);
    expect(result.advertised).toEqual(['exists', 'parses', 'validates', 'covers']);
});

test('a four-step item renders four cards', async ({ page }) => {
    await load(page);
    const html = await page.evaluate(async () => {
        const { stepCardsHtml } = await import('/assets/js/wsProtocol.js' as any);
        return stepCardsHtml({
            steps: ['exists', 'parses', 'validates', 'covers'],
            classesFor: (c: string) => c,
            icon: '?',
        });
    });
    expect((html.match(/class="card /g) ?? []).length).toBe(4);
    expect(html).toContain('step-covers');
});

test('a lectionary sibling is composed beside every calendar-tier id', async ({ page }) => {
    await load(page);
    const ids = await page.evaluate(async () => {
        const { inventoryIdsForCalendar } = await import('/assets/js/wsProtocol.js' as any);
        return inventoryIdsForCalendar({
            rite: 'roman',
            dioceseRite: 'roman',
            nation: 'IT',
            widerRegion: 'Europe',
            missals: ['IT_1983'],
            dioceseId: 'romamo_it',
        });
    });
    expect(ids).toContain('nation:roman:IT:lectionary');
    expect(ids).toContain('widerregion:roman:Europe:lectionary');
    expect(ids).toContain('sanctorale:roman:IT_1983:lectionary');
    expect(ids).toContain('diocese:roman:romamo_it:lectionary');
});

/**
 * Most calendars have no lectionary folder, so absence is the ordinary case for the four-segment form
 * and warning about it every page load would train the reader to ignore the warnings that mean
 * something. The three-segment `decrees:roman:lectionary` is on disk unconditionally and must keep
 * warning, exactly as `sanctorale:{rite}:i18n` does beside the conditional missal form.
 */
test('the four-segment lectionary form is conditional, the three-segment one is not', async ({ page }) => {
    await load(page);
    const result = await page.evaluate(async () => {
        const { isConditionalInventoryId } = await import('/assets/js/wsProtocol.js' as any);
        return {
            nation: isConditionalInventoryId('nation:roman:IT:lectionary'),
            diocese: isConditionalInventoryId('diocese:roman:romamo_it:lectionary'),
            widerRegion: isConditionalInventoryId('widerregion:roman:Europe:lectionary'),
            missal: isConditionalInventoryId('sanctorale:roman:IT_1983:lectionary'),
            decrees: isConditionalInventoryId('decrees:roman:lectionary'),
            corpus: isConditionalInventoryId('lectionary:roman:sanctorum'),
            riteI18n: isConditionalInventoryId('sanctorale:ambrosian:i18n'),
        };
    });
    expect(result.nation).toBe(true);
    expect(result.diocese).toBe(true);
    expect(result.widerRegion).toBe(true);
    expect(result.missal).toBe(true);
    expect(result.decrees).toBe(false);
    expect(result.corpus).toBe(false);
    expect(result.riteI18n).toBe(false);
});
