# Making the lectionary corpus validatable, and checking locale coverage

Design for part 2 of [#61](https://github.com/Liturgical-Calendar/UnitTestInterface/issues/61) — the lectionary corpus that no client can
check — together with a locale-coverage step that grew out of it and applies more broadly.

## Status

**Implemented.** Part 1 of #61 (calendar-tier `:i18n` coverage) shipped in PR #71 (`ba13cb7`). This document covered part 2, delivered as two
PRs: the API half on `feat/61-lectionary-validation` in LiturgicalCalendarAPI, and the client half on `feat/61-lectionary-coverage` here.
Where the shipped code and this document differ, the code is authoritative — notably three things corrected during implementation:

- **`covers` reaches 47 items (21 i18n + 26 lectionary), where the design predicted 45.** The prediction came from a scan of the Roman calendar
  tiers only; the two extra are Ambrosian diocesan `:i18n` folders, whose calendars declare `locales` in source like every other diocese. The
  figures below have been corrected to what shipped.
- **The Europe wider-region lectionary is missing 29 locales, where the design said 28.** `en_UK` is present but not declared, so only three of
  the thirty-two declared locales have files. Corrected below.
- **The rite-level corpus items are not part of `CheckableInventory::staticItems()`.** Their expected locale set comes from
  `CheckableInventory::metadata()`, so the producer can fail for the same reason the enumerating ones can, and the static half exists
  precisely as a fallback that cannot throw. A `lectionary:` id therefore does not resolve through `staticById()`, exactly as a national or
  diocesan id does not.

## Context

`jsondata/sourcedata/` holds 95 lectionary files across six tiers, 5,975 `event_key → readings` entries in all. None of it is checkable by any
client, because `CheckableItem` requires a `LitSchema` and no lectionary schema exists. `GET /validations` therefore advertises nothing for it,
and `CheckableInventory` emits no item. This is the same shape as LiturgicalCalendarAPI#800: the data exists, and no client lists it.

| tier               | folders | example                                              |
|--------------------|---------|------------------------------------------------------|
| universal sections | 10      | `rite/roman/lectionary/sanctorum/`                   |
| decrees            | 1       | `rite/roman/decrees/lectionary/`                     |
| missals            | 2       | `missals/propriumdesanctis_US_2011/lectionary/`      |
| nations            | 3       | `calendars/nations/US/lectionary/`                   |
| wider regions      | 1       | `calendars/wider_regions/Europe/lectionary/`         |
| dioceses           | 9       | `calendars/dioceses/NL/bredad_nl/lectionary/`        |

The issue body listed only the first three; the calendar-tier folders were found while designing this.

## What the corpus actually contains

Four facts, established by reading all 95 files, that the issue body either got wrong or could not have known.

**Every file is a flat `event_key → readings` map.** All 5,975 keys match `CommonDef.json#/definitions/EventKey` already, so `propertyNames`
is a free assertion rather than a new constraint to negotiate.

**Source readings nest a vigil; output readings do not.** Two key-sets in the corpus match no variant of
`CommonDef.json#/definitions/Readings`: `{vigil, day}` (37 entries) and `{vigil, night, dawn, day}` (18, all Christmas). That is correct, not a
gap. `Readings` describes **output**, where a vigil Mass is a liturgical event in its own right — its own `EventKeyVigilMass` (`…_vigil`), its
own `is_vigil_for`, and its own flat `readings`. Nothing in output ever nests a `vigil` key, so admitting one there would let `LitCal.json`
validate a shape the API must never emit.

Source data nests it because the vigil's readings belong to the event that has the vigil. `PropriumDeSanctis.json` — a source schema — already
says exactly this, defining `ReadingsWithVigil` and a vigil-bearing `ReadingsChristmas` locally while `$ref`-ing `CommonDef`'s `Readings` for the
leaves. So the issue's "close to a one-liner over the existing definition" is wrong in an instructive way: `Readings` is the wrong definition to
reuse wholesale, and the reason is a source/output boundary the schemas draw by hand and document nowhere.

**The `oneOf` ambiguity the issue worried about does not exist.** Every variant sets `additionalProperties: false` with disjoint `required`
sets, so variant selection is exact key-set equality. Checked over all 5,975 entries: no entry matches two variants, and none matches zero once
the two vigil variants are added.

**Emptiness is worse than the issue's sample.** Not 602 of 941 — **5,108 of 5,975 entries (85%)** carry at least one empty-string reading,
across every tier. `feriale_per_annum_I` is blank throughout.

## Decisions

**Emptiness: permissive.** `Lectionary.json` reuses `CommonDef`'s string types unchanged, with no `minLength`. A green `validates` card asserts
that the structure is in place, not that the readings are written; item labels say so ("lectionary structure"). Completeness remains
LiturgicalCalendarAPI#712's business.

*Rejected:* `minLength: 1` everywhere, which would paint 85% of the corpus red from day one and train readers to ignore red. *Also rejected:* a
second `…:complete` item per folder applying a recursive non-empty overlay — two honest cards instead of one ambiguous one, but it doubles the
lectionary card count to report a fact #712 already tracks.

**Source and output schemas are distinguished explicitly, and the distinction is enforced.** `LitSchema` gains a `role()` returning a new
`SchemaRole` enum — `SOURCE`, `OUTPUT`, `PAYLOAD`, `PROTOCOL`, `LIBRARY` — in the same shape as its existing `error()` match. `CheckableItem`
already requires a `LitSchema`, so this buys a test asserting that **every checkable item's schema has role `source`**, which is a mechanical
statement of "`/validations` checks source data".

This is not incidental scope. The first draft of this design proposed adding the vigil variants to `CommonDef`'s output `Readings`, which would
have loosened `LitCal.json` to accept a shape the API cannot emit — a wrong-green in the output schema, introduced by the design meant to add a
source check. The boundary was invisible because nothing writes it down. A role marker makes that class of error fail a test instead of shipping.

*Rejected:* prose descriptions on each schema root, which document the boundary without enforcing it. *Deferred:* an `x-litcal-role` keyword in
the schema files, advertised by `SchemasHandler`, so external consumers can tell source schemas from response schemas — worth doing when there
are third-party consumers to serve.

**Coverage is a fourth step, not a stricter `validates`.** "Is what is here well-formed?" and "is anything missing?" are different questions
about the same folder, and #60 settled that this repository gives distinct facts distinct cards. `Step::COVERS` answers the second.

*Rejected:* folding missing locales into the `exists` step's error list, which is cheaper (no protocol change) but fuses two verdicts onto one
card — the exact conflation #60 removed.

**`covers` applies to any folder item whose expected locale set has an authority other than the folder itself.** This is the whole rule; there
are no per-family carve-outs. It excludes exactly two families, where the declared locales are scanned from the very folder being checked and
the comparison would be a tautology.

| family                            | authority for the expected set                       | tautology |
|-----------------------------------|------------------------------------------------------|-----------|
| national i18n + lectionary        | `metadata.locales` declared in `{NATION}.json`       | no        |
| diocesan i18n + lectionary        | `metadata.locales` declared in the diocese's file    | no        |
| rite-level i18n + lectionary      | `FULLY_TRANSLATED_LOCALES` ∩ gettext `i18n/*`        | no        |
| wider-region lectionary           | the region's own i18n folder scan                    | no        |
| missal lectionary                 | the missal's own i18n folder scan                    | no        |
| wider-region i18n                 | scanned from itself                                  | **yes**   |
| missal i18n                       | scanned from itself                                  | **yes**   |

Note that national and diocesan locales are **declared** in source, not scanned — `US.json` carries `"locales": ["en_US"]`. That is what makes
`covers` meaningful on their i18n folders, and it is why the rule is phrased about authority rather than about lectionary-versus-i18n.

**The verdict is a subset test by locale identity, not by count.** A locale in the expected set with no matching `{locale}.json` fails the step
and is named in the frame text. A file present for a locale the owner does not declare does not fail, but is reported as an extra — that is how
"you hold data for a locale you do not declare" becomes visible.

**Rite-level items do get `covers`.** The General Roman Calendar's supported locales are `FULLY_TRANSLATED_LOCALES = ['en', 'fr', 'it', 'nl',
'la']` — five, not the fourteen gettext folders, which are translations in progress that `buildLocales()` intersects away. The lectionary
sections carry six. So the rite-level tier is green, and no expectation had to be invented to get there.

**Id scheme: `lectionary:` prefix for the ownerless corpus, `:lectionary` suffix on everything owned.** Mirrors the `:i18n` precedent, and makes
the conditional/unconditional split fall out of segment count for free (see PR 2 below).

```text
lectionary:roman:{section}              decrees:roman:lectionary
nation:roman:{id}:lectionary            widerregion:roman:{name}:lectionary
diocese:{rite}:{calendarId}:lectionary  sanctorale:roman:{missalId}:lectionary
```

## What `covers` reports today

47 items carry the step — 21 i18n folders and all 26 lectionary folders. **One is red.**

| item                                            | expected | present | verdict               |
|-------------------------------------------------|----------|---------|-----------------------|
| `lectionary:roman:{section}` ×10                | 5        | 6       | green (extra `hr`)    |
| `decrees:roman:lectionary`                      | 5        | 7       | green                 |
| `temporale:roman:i18n`, `decrees:roman:i18n`    | 5        | 14      | green                 |
| `nation:roman:{CA,NL,US}:lectionary`            | 1–2      | 1–2     | green                 |
| `nation:roman:US:lectionary`                    | 1        | 2       | green (extra `es_US`) |
| `diocese:roman:{9}:lectionary`                  | 1        | 1–2     | green                 |
| `sanctorale:roman:{IT_1983,US_2011}:lectionary` | 1        | 1–2     | green                 |
| all 21 i18n items with an authority             | 1–5      | 1–14    | green                 |
| `widerregion:roman:Europe:lectionary`           | 32       | 4       | **red — 29 missing**  |

The `es_US` extra on the US lectionary is a real finding: `US.json` declares only `en_US`, yet both the national lectionary and the US_2011
missal lectionary carry `es_US.json`. Fixing the declaration turns that item into expected 2 / present 2 and correctly turns
`nation:roman:US:i18n` red until `es_US.json` lands there too. The check surfaces the discrepancy either way, which is the point.

## PR 1 — LiturgicalCalendarAPI

**A0. `SchemaRole` enum and `LitSchema::role()`**, classifying all 24 schemas plus `Lectionary.json`:

| role       | schemas                                                                                                                                                                         |
|------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `SOURCE`   | `DiocesanCalendar`, `NationalCalendar`, `WiderRegionCalendar`, `PropriumDeSanctis`, `PropriumDeTempore`, `LitCalDecreesSource`, `LitCalTranslation`, `LitCalTest`, `Lectionary` |
| `OUTPUT`   | `LitCal`, `LitCalMetadata`, the seven `LitCal*Path` schemas, `Problem`, `LiturgicalCalendar.xsd`                                                                                |
| `PAYLOAD`  | `LitCalDecreeWritePayload`                                                                                                                                                      |
| `PROTOCOL` | `WebSocketMessage`, `WebSocketFrame`                                                                                                                                            |
| `LIBRARY`  | `CommonDef`                                                                                                                                                                     |

**A1. `CommonDef.json` gains a `SourceReadings` definition; `Readings` is not touched.** `SourceReadings` is a `oneOf` over the same variants as
`Readings` plus `ReadingsWithVigil` (`{vigil, day}`) and `ReadingsChristmasWithVigil` (`{vigil, night, dawn, day}`), each of whose members
`$ref`s `Readings` for the leaves — the shape `PropriumDeSanctis.json` already uses locally. All variants stay disjoint by
`additionalProperties: false` and differing `required`, so selection remains exact key-set equality.

`CommonDef` is a definitions library rather than a validating schema (hence `SchemaRole::LIBRARY`), so holding both a source-shaped and an
output-shaped readings definition is correct: the role belongs to the reference, not to the file. `PropriumDeSanctis.json`'s local copies are
left alone in this PR; folding them into `SourceReadings` afterwards is sharing, not a fix.

**A2. New `jsondata/schemas/Lectionary.json`.**

```json
{
    "$schema": "https://json-schema.org/draft-07/schema#",
    "title": "Lectionary",
    "type": "object",
    "propertyNames": { "$ref": "./CommonDef.json#/definitions/EventKey" },
    "additionalProperties": { "$ref": "./CommonDef.json#/definitions/SourceReadings" }
}
```

**A3. `LitSchema::LECTIONARY = '/Lectionary.json'`**, with its `error()` and `fromURL()` arms.

**A4. `Step::COVERS = 'covers'`**, plus the `step` enum in `WebSocketFrame.json` and a class in `FrameFamily::CLASS_FOR_STEP`. The name follows
the existing third-person-singular vocabulary (`exists`, `parses`, `validates`).

**A5. `CheckableItem` gains `?array $expectedLocales`**, serialized as `expected_locales` and declared optional in
`LitCalValidationsPath.json`. `steps` includes `covers` if and only if that list is non-null, so the two cannot disagree. `id` is opaque with no
pattern and `schema` already accepts `Lectionary.json`, so `LitCalValidationsPath.json` needs no other change.

**A6. `CheckableInventory` emits 26 lectionary folder items** — conditional on the folder existing — and populates `expectedLocales` on those and
on the 21 qualifying i18n items. The 10 universal sections come from the `JsonData::LECTIONARY_*_FOLDER` constants that already exist; the rest
hang off the existing producers, so a new calendar with a lectionary folder joins with no edit here.

**A7. `Health` needs no change for the three existing steps.** Its `kind: 'folder'` branch already validates every `*.json` in a folder against
the item's schema and emits exactly one frame per step, and its i18n filename regex accepts every filename in the corpus (`en.json`,
`en_US.json`, `la_NL.json`, `en_UK.json`). Lectionary items therefore need no new execution path.

**A8. `Health` emits the `covers` frame.** `runValidationSteps()` takes the item's `expectedLocales`, and the folder branch computes coverage
from the same `glob()` it already performs — no second filesystem read. Both of that branch's exits must honour it: the `$allPromises` callback
emits a fourth frame, and the empty-folder early return must emit a failing `covers` frame too, or an item that advertised four steps delivers
three and the client waits out the silence watchdog for a card that never arrives.

## PR 2 — UnitTestInterface

**`resources.js`: no change.** It takes its whole list from `GET /validations`, so all 26 items and the new step appear the moment the API ships.

**The universal corpus is discovered, not composed.** `buildSourceDataChecks()` in `index.js` additionally takes every advertised item whose id
starts with `lectionary:{rite}:`. Adding the ten section names to `inventoryIdsForCalendar()` would put a hand-maintained list of the API's
layout back into this repository — what CLAUDE.md forbids resurrecting — and a new section would silently go unchecked. The section names are
not derivable from `/calendars` metadata, so composition is the wrong tool. The rule: **compose what calendar metadata implies; discover from the
inventory what it does not.**

**`inventoryIdsForCalendar()` composes a `:lectionary` sibling** beside each calendar-tier id, exactly as it composes `:i18n` today.

**`isConditionalInventoryId()` gains a parallel arm.** Most calendar-tier lectionary folders do not exist (3 of 10 nations, 1 wider region, 2 of
5 missals, 9 dioceses), so these must be expected absences or every run warns. The four-segment/three-segment split that already separates the
conditional missal `:i18n` from the unconditional rite `:i18n` does the same work here:

| id                                    | segments | conditional |
|---------------------------------------|----------|-------------|
| `lectionary:roman:sanctorum`          | 3        | no          |
| `decrees:roman:lectionary`            | 3        | no          |
| `nation:roman:US:lectionary`          | 4        | yes         |
| `diocese:roman:bredad_nl:lectionary`  | 4        | yes         |

**`STEP_CARD_CLASS` and `STEP_CARD_BODY` each gain a `covers` row** (`step-covers`). Per CLAUDE.md the class is an address, not a verdict, so the
name carries no claim about whether anything is covered. `stepsForCheck()` already handles arbitrary step subsets, so four-step items render four
cards and the totals badges follow with no further change.

## Testing

**API.** A data-integrity PHPUnit test validating all 95 lectionary files against `Lectionary.json`, written first — it fails on the 55 vigil
entries until A1 lands. A `SchemaRole` guard test asserting every `CheckableItem`'s schema has role `SOURCE`, and that `LitCal.json` validation
never runs against a `SOURCE` schema. An inventory test asserting the 26 new ids with their kind, schema, rite and region. A `covers` test asserting the
subset semantics, the two tautological exclusions, and that `steps` and `expectedLocales` agree.

**Client.** `e2e/ws-protocol.spec.ts` for `inventoryIdsForCalendar()` and `isConditionalInventoryId()`.
`e2e/scaffold-advertised-steps.spec.ts` already guards the "advertised steps drive rendered cards" contract and should be extended with a
four-step item.

## Cost

The universal corpus adds 11 checks / 33 cards to every Roman run on `index.php`; `covers` adds one card to each of the 47 qualifying items.

| scaffold             | before      | after       |
|----------------------|-------------|-------------|
| General Roman        | 11 / 33     | 22 / 79     |
| Diocese of Rome      | 13 / 39     | 27 / 99     |

Runs roughly double in length and WebSocket traffic. There is **no** additional API rate-limit exposure: `Health::validateSource()` resolves an
inventory id to a filesystem path and reads it locally, unlike the calendar-data phase, which is where this repository's history of 429s comes
from. If the universal corpus proves too noisy on `index.php` it is reversible with one predicate, leaving it to `resources.php`.

## Out of scope

- **Filling in the readings.** LiturgicalCalendarAPI#712.
- **`US.json` declaring `es_US`.** A data fix this design surfaces but does not make — filed as LiturgicalCalendarAPI#883.
- **The 29 missing Europe wider-region lectionary locales.** A data gap this design surfaces — filed as LiturgicalCalendarAPI#882.
- **Folding `PropriumDeSanctis.json`'s local vigil definitions into `SourceReadings`.** They are correct source-shaped definitions, not
  duplication to repair; sharing them is a follow-up.
- **An `x-litcal-role` keyword in the schema files**, advertised by `SchemasHandler` for external consumers.
- **Ambrosian lectionary data.** None exists on disk; the inventory emits nothing for it, which is correct rather than an omission.
