/**
 * Shared helpers for the Health WebSocket protocol.
 *
 * `index.js` and `resources.js` are two independent implementations of the same protocol and have already
 * drifted apart in ways that cost debugging sessions — different state names, different runToken guards,
 * two vocabularies for the same file (see #42). New protocol behaviour lands here so both runners share one
 * definition rather than acquiring a fourth thing to keep in lockstep.
 * @module wsProtocol
 */

/**
 * Tell the server a run is abandoned, so it stops draining a backlog nobody is watching.
 *
 * Silent on the wire: the server acknowledges by dropping the run's queued requests and sends nothing back
 * (LiturgicalCalendarAPI#806 section H).
 *
 * Call this *before* clearing the run token — the cancel has to name the run it is stopping, and the server
 * ignores a cancel that names a run the connection is no longer on.
 *
 * @param {WebSocket} conn - The connection the run was started on.
 * @param {?string} runToken - The run being abandoned; the same token its requests carried.
 * @returns {boolean} true when a cancel was sent, false when there was nothing to send it on or about.
 */
export const sendCancelRun = ( conn, runToken ) => {
    if ( !conn || conn.readyState !== WebSocket.OPEN ) {
        return false;
    }
    if ( typeof runToken !== 'string' || runToken === '' ) {
        return false;
    }
    conn.send( JSON.stringify( { action: 'cancelRun', runToken } ) );
    return true;
};

/**
 * The rite-level universal source corpus, as one list for both runner pages.
 *
 * `index.js` and `resources.js` each carried their own version of this, with two different
 * vocabularies for the same file on disk — `PropriumDeTempore` under `universalcalendar` here,
 * `proprium-de-tempore` under `sourceDataCheck` there (see #42). Neither listed the Ambrosian
 * corpus, and neither listed any i18n folder (#48).
 *
 * `category: 'universalcalendar'` for every entry, folders included. The server resolves that
 * category's schema from the path, through `CheckableInventory::byPath()`, which knows all eight
 * of these; and its `sourceFolder` handling branches on the property being present, not on the
 * category. One category therefore covers file and folder, Roman and Ambrosian alike.
 *
 * `validate` values are card CSS class names once slugified, and the server echoes them back in
 * its `classes` selector — so they are effectively part of the wire contract and must stay
 * distinct. See CLAUDE.md, "Server Response Format".
 *
 * These paths are the last hardcoded copy of the API's on-disk layout; #42 replaces the whole
 * list with a fetch of the `/validations` inventory once the wire accepts opaque ids.
 *
 * @type {ReadonlyArray<{rite: string, validate: string, category: string, sourceFile?: string, sourceFolder?: string}>}
 */
export const UNIVERSAL_CHECKS = Object.freeze([
    {
        rite: 'roman',
        validate: 'PropriumDeTempore',
        sourceFile: 'jsondata/sourcedata/rite/roman/missals/propriumdetempore/propriumdetempore.json',
        category: 'universalcalendar'
    },
    {
        rite: 'roman',
        validate: 'PropriumDeTemporeI18n',
        sourceFolder: 'jsondata/sourcedata/rite/roman/missals/propriumdetempore/i18n',
        category: 'universalcalendar'
    },
    {
        rite: 'roman',
        validate: 'MemorialsFromDecrees',
        sourceFile: 'jsondata/sourcedata/rite/roman/decrees/decrees.json',
        category: 'universalcalendar'
    },
    {
        rite: 'roman',
        validate: 'MemorialsFromDecreesI18n',
        sourceFolder: 'jsondata/sourcedata/rite/roman/decrees/i18n',
        category: 'universalcalendar'
    },
    {
        rite: 'ambrosian',
        validate: 'AmbrosianPropriumDeTempore',
        sourceFile: 'jsondata/sourcedata/rite/ambrosian/missals/propriumdetempore/propriumdetempore.json',
        category: 'universalcalendar'
    },
    {
        rite: 'ambrosian',
        validate: 'AmbrosianPropriumDeTemporeI18n',
        sourceFolder: 'jsondata/sourcedata/rite/ambrosian/missals/propriumdetempore/i18n',
        category: 'universalcalendar'
    },
    {
        rite: 'ambrosian',
        validate: 'AmbrosianPropriumDeSanctis',
        sourceFile: 'jsondata/sourcedata/rite/ambrosian/missals/propriumdesanctis_2024/propriumdesanctis.json',
        category: 'universalcalendar'
    },
    {
        rite: 'ambrosian',
        validate: 'AmbrosianPropriumDeSanctisI18n',
        sourceFolder: 'jsondata/sourcedata/rite/ambrosian/missals/propriumdesanctis_2024/i18n',
        category: 'universalcalendar'
    }
]);

/**
 * Whether a rite-tagged item belongs to the selected rite.
 *
 * An absent `rite` means Roman, never "applies to every rite". Everything in this interface
 * predates the rite dimension and was Roman by construction, so treating an absent value as a
 * wildcard would be a fail-open filter — it would show Roman-only items under the Ambrosian rite,
 * where the API rejects several of them outright.
 *
 * @param {{rite?: string}} item - Any object carrying an optional `rite`.
 * @param {string} rite - The selected rite.
 * @returns {boolean}
 */
export const inRiteScope = ( item, rite ) => ( item?.rite ?? 'roman' ) === rite;

/**
 * The universal source checks belonging to one rite.
 *
 * @param {string} rite - The selected rite.
 * @returns {Array<object>} A fresh array; callers push calendar-specific checks onto it.
 */
export const universalChecksForRite = ( rite ) =>
    UNIVERSAL_CHECKS.filter( check => inRiteScope( check, rite ) ).map( check => ( { ...check } ) );

/**
 * Translate a `CalendarSelect` selection into the protocol's calendar/category vocabulary.
 *
 * The library speaks `national` / `diocesan` and represents the rite-level calendar as its empty
 * option; the WebSocket protocol speaks `nationalcalendar` / `diocesancalendar` / `ritecalendar`
 * and names the rite-level calendar explicitly. This is the only place the two meet.
 *
 * The empty option maps to `{calendar: rite, category: 'ritecalendar'}` for both rites. For the
 * Roman rite this is the same request the old `VA` option produced —
 * `Health::buildCalendarRequestPath()` reads `'VA'` as the historical marker for the rite-level
 * calendar and resolves it to `/roman/{year}` exactly as `ritecalendar` does — but it stops
 * naming the General Roman Calendar `VA`, which matters now that Vatican City is to gain its own
 * national calendar data distinct from it.
 *
 * @param {string} value - The selected option's value; '' for the rite-level calendar.
 * @param {string} calendartype - The selected option's `data-calendartype`; '' for the empty option.
 * @param {string} rite - The selected rite.
 * @returns {{calendar: string, category: string}}
 * @throws {Error} If `calendartype` is not one the library emits. Throwing beats returning a
 *         partial message: a wrong `category` silently checks a different path and reports success.
 */
export const toWireTarget = ( value, calendartype, rite ) => {
    if ( value === '' ) {
        return { calendar: rite, category: 'ritecalendar' };
    }
    switch ( calendartype ) {
        case 'national':
            return { calendar: value, category: 'nationalcalendar' };
        case 'diocesan':
            return { calendar: value, category: 'diocesancalendar' };
        default:
            throw new Error(
                `Unknown data-calendartype "${calendartype}" on calendar option "${value}"; `
                + 'expected "national" or "diocesan" from liturgy-components-js CalendarSelect.'
            );
    }
};

/**
 * The calendar-scope keys a test's `applies_to` / `appliesTo` / `filter` may carry, in the order
 * they are checked.
 *
 * `rite` is deliberately excluded: since API #785 it is a separate dimension present on every
 * scope object, not one of the mutually exclusive calendar-identity keys. Selecting the key
 * explicitly — rather than by `Object.keys(...).length` or `[0]` — avoids depending on key count
 * or key order, both of which broke once already when `rite` became a sibling required property.
 *
 * @type {ReadonlyArray<string>}
 */
export const CALENDAR_SCOPE_KEYS = Object.freeze([
    'national_calendar',
    'national_calendars',
    'diocesan_calendar',
    'diocesan_calendars'
]);

/**
 * Whether a unit test belongs to the given liturgical rite.
 *
 * Kept out of the calendar-scope handling for the reason {@link CALENDAR_SCOPE_KEYS} gives: a
 * rite-only scope such as `{ "rite": "ambrosian" }` carries no calendar identity at all, so it
 * would fall through the calendar-scope switch and be kept for every calendar. Handled here, it
 * correctly restricts the test to its own rite.
 *
 * @param {Object} unitTest - The unit test definition.
 * @param {string} rite - The selected rite.
 * @returns {boolean}
 */
export const testAppliesToRite = ( unitTest, rite ) =>
    inRiteScope( unitTest.applies_to ?? unitTest.appliesTo ?? {}, rite );
