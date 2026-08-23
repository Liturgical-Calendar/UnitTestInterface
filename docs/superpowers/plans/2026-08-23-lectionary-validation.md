# Lectionary Validation and Locale Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 95-file lectionary corpus validatable through `GET /validations`, and add a `covers` step that checks any source folder
against the locales its owner declares.

**Architecture:** Upstream-first. LiturgicalCalendarAPI gains a `SchemaRole` enum, a `Lectionary.json` source schema built on a new
`CommonDef` `SourceReadings` definition, a fourth `Step::COVERS`, an `expectedLocales` field on `CheckableItem`, and 26 new lectionary
inventory items. UnitTestInterface then renders the new step and picks up the new items — `resources.js` for free from the inventory,
`index.js` by composing `:lectionary` siblings and discovering the ownerless corpus by id prefix.

**Tech Stack:** PHP 8.4 (API), PHPUnit, PHPStan level 10, phpcs PSR-12; native ES6 + Playwright (UnitTestInterface).

**Spec:** `docs/superpowers/specs/2026-08-23-lectionary-validation-design.md`

**Status:** Implemented. See the spec's Status section for the three points where the shipped code diverges from the plan — most
significantly Task 6, where the rite-level corpus producer had to move out of `staticItems()` because its locale set comes from
`CheckableInventory::metadata()`, and the section folders are enumerated from `LectionaryCategory` rather than from a hardcoded map.

## Global Constraints

- **Two repositories.** Tasks 1–7 are in `../LiturgicalCalendarAPI`; tasks 8–10 are in `UnitTestInterface`. Task 11 touches both.
  **PR 1 (tasks 1–7) must merge before PR 2 (tasks 8–10) is useful**, because PR 2 renders a step and consumes ids that only PR 1 produces.
- **API PHP standards:** PSR-12 via `composer lint`, PHPStan level 10 via `composer analyse`. Short array syntax, single quotes, 4-space
  indent. PHP 8.4 features allowed.
- **Never skip git hooks.** No `--no-verify`. CaptainHook runs phpcs and markdownlint on commit.
- **Card classes are addresses, not verdicts** (UnitTestInterface CLAUDE.md, #60). The new class is `step-covers` — it names *the card for
  this check's covers step*, and asserts nothing about whether anything is covered. Do not use a verdict word.
- **`CommonDef.json#/definitions/Readings` describes OUTPUT and must not be modified.** In output a vigil Mass is its own liturgical event
  with its own flat `readings`; admitting a nested `vigil` there would let `LitCal.json` validate a shape the API cannot emit.
- **Emptiness stays permissive.** No `minLength` anywhere in `Lectionary.json`. Readings completeness is LiturgicalCalendarAPI#712.
- **Locale comparison is a subset test by identity**, never by count: every expected locale must have a `{locale}.json`; extra files are
  reported in the frame text but do not fail the step.

---

## PR 1 — LiturgicalCalendarAPI

### Task 1: `SchemaRole` enum and `LitSchema::role()`

**Files:**

- Create: `src/Enum/SchemaRole.php`
- Modify: `src/Enum/LitSchema.php`
- Test: `phpunit_tests/Enum/SchemaRoleTest.php`

**Interfaces:**

- Produces: `SchemaRole::{SOURCE,OUTPUT,PAYLOAD,PROTOCOL,LIBRARY}` (backed string enum); `LitSchema::role(): SchemaRole`.

- [ ] **Step 1: Write the failing test**

Create `phpunit_tests/Enum/SchemaRoleTest.php`:

```php
<?php

declare(strict_types=1);

namespace LiturgicalCalendar\Api\Tests\Enum;

use LiturgicalCalendar\Api\Enum\LitSchema;
use LiturgicalCalendar\Api\Enum\SchemaRole;
use PHPUnit\Framework\TestCase;

final class SchemaRoleTest extends TestCase
{
    public function testEveryLitSchemaCaseHasARole(): void
    {
        foreach (LitSchema::cases() as $case) {
            $this->assertInstanceOf(SchemaRole::class, $case->role(), "LitSchema::{$case->name} has no role");
        }
    }

    public function testSourceSchemasAreClassifiedAsSource(): void
    {
        $expected = [
            LitSchema::DIOCESAN,
            LitSchema::NATIONAL,
            LitSchema::WIDERREGION,
            LitSchema::PROPRIUMDESANCTIS,
            LitSchema::PROPRIUMDETEMPORE,
            LitSchema::DECREES_SRC,
            LitSchema::I18N,
            LitSchema::TEST_SRC
        ];
        foreach ($expected as $case) {
            $this->assertSame(SchemaRole::SOURCE, $case->role(), "LitSchema::{$case->name} should be SOURCE");
        }
    }

    public function testOutputSchemasAreNotSource(): void
    {
        $expected = [
            LitSchema::LITCAL,
            LitSchema::METADATA,
            LitSchema::EVENTS,
            LitSchema::TESTS,
            LitSchema::MISSALS,
            LitSchema::EASTER,
            LitSchema::DATA,
            LitSchema::SCHEMAS,
            LitSchema::VALIDATIONS,
            LitSchema::DECREES
        ];
        foreach ($expected as $case) {
            $this->assertSame(SchemaRole::OUTPUT, $case->role(), "LitSchema::{$case->name} should be OUTPUT");
        }
    }

    public function testProtocolAndPayloadAndLibraryRoles(): void
    {
        $this->assertSame(SchemaRole::PROTOCOL, LitSchema::WEBSOCKET_MESSAGE->role());
        $this->assertSame(SchemaRole::PROTOCOL, LitSchema::WEBSOCKET_FRAME->role());
        $this->assertSame(SchemaRole::PAYLOAD, LitSchema::DECREE_WRITE->role());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `vendor/bin/phpunit phpunit_tests/Enum/SchemaRoleTest.php`
Expected: FAIL — `Class "LiturgicalCalendar\Api\Enum\SchemaRole" not found`.

- [ ] **Step 3: Create the enum**

Create `src/Enum/SchemaRole.php`:

```php
<?php

declare(strict_types=1);

namespace LiturgicalCalendar\Api\Enum;

/**
 * What a schema is for.
 *
 * The distinction is load-bearing and was, until now, drawn only by hand. `CommonDef.json`'s `Readings`
 * describes *output*, where a vigil Mass is a liturgical event in its own right carrying its own flat
 * readings; source data nests a `vigil` key because the vigil's readings belong to the event that has
 * one, which is why `PropriumDeSanctis.json` defines its own vigil-bearing variants rather than reusing
 * `Readings` wholesale. Nothing wrote that down, so a design that reused the output definition for a
 * source check read as a one-line change and would have loosened `LitCal.json` to accept a shape this
 * API cannot emit.
 *
 * `CheckableItem` requires a `LitSchema`, so classifying every case turns "`/validations` checks source
 * data" from a convention into an assertion — see `CheckableInventorySchemaRoleTest`.
 */
enum SchemaRole: string
{
    /** Validates data as it is stored under `jsondata/sourcedata/`. */
    case SOURCE = 'source';

    /** Validates a response this API emits. */
    case OUTPUT = 'output';

    /** Validates a request body this API accepts. */
    case PAYLOAD = 'payload';

    /** Validates a WebSocket message or frame. */
    case PROTOCOL = 'protocol';

    /** Holds shared definitions and validates nothing on its own. */
    case LIBRARY = 'library';
}
```

- [ ] **Step 4: Add `role()` to `LitSchema`**

In `src/Enum/LitSchema.php`, add the method after `error()`. The match is exhaustive with no default arm, so a
new case added without a role fails PHPStan rather than silently defaulting:

```php
    /**
     * What this schema is for — see {@see SchemaRole}.
     *
     * Exhaustive on purpose, with no default arm: a new schema must state its role or fail static
     * analysis, because the alternative is the silent misclassification this enum was added to stop.
     */
    public function role(): SchemaRole
    {
        return match ($this) {
            LitSchema::DIOCESAN,
            LitSchema::NATIONAL,
            LitSchema::WIDERREGION,
            LitSchema::PROPRIUMDESANCTIS,
            LitSchema::PROPRIUMDETEMPORE,
            LitSchema::DECREES_SRC,
            LitSchema::I18N,
            LitSchema::TEST_SRC          => SchemaRole::SOURCE,
            LitSchema::LITCAL,
            LitSchema::METADATA,
            LitSchema::EVENTS,
            LitSchema::TESTS,
            LitSchema::MISSALS,
            LitSchema::EASTER,
            LitSchema::DATA,
            LitSchema::SCHEMAS,
            LitSchema::VALIDATIONS,
            LitSchema::DECREES           => SchemaRole::OUTPUT,
            LitSchema::DECREE_WRITE      => SchemaRole::PAYLOAD,
            LitSchema::WEBSOCKET_MESSAGE,
            LitSchema::WEBSOCKET_FRAME   => SchemaRole::PROTOCOL
        };
    }
```

- [ ] **Step 5: Run the test and static analysis**

Run: `vendor/bin/phpunit phpunit_tests/Enum/SchemaRoleTest.php && composer analyse && composer lint`
Expected: PASS on all three.

- [ ] **Step 6: Commit**

```bash
git add src/Enum/SchemaRole.php src/Enum/LitSchema.php phpunit_tests/Enum/SchemaRoleTest.php
git commit -m "feat(schemas): classify every schema as source, output, payload, protocol or library"
```

---

### Task 2: The inventory guard test

**Files:**

- Test: `phpunit_tests/Models/CheckableInventorySchemaRoleTest.php`

**Interfaces:**

- Consumes: `LitSchema::role()` and `SchemaRole::SOURCE` from Task 1; `CheckableInventory::all()`.

This task is a test only. It states mechanically what `/validations` means, and it is what would have
caught the first draft of this design.

- [ ] **Step 1: Write the test**

Create `phpunit_tests/Models/CheckableInventorySchemaRoleTest.php`:

```php
<?php

declare(strict_types=1);

namespace LiturgicalCalendar\Api\Tests\Models;

use LiturgicalCalendar\Api\Enum\SchemaRole;
use LiturgicalCalendar\Api\Models\ValidationsPath\CheckableInventory;
use PHPUnit\Framework\TestCase;

final class CheckableInventorySchemaRoleTest extends TestCase
{
    /**
     * `/validations` checks source data. An item pointed at an output schema would validate stored
     * files against the shape of an API response, which passes or fails for reasons unrelated to
     * whether the source data is correct.
     */
    public function testEveryCheckableItemUsesASourceSchema(): void
    {
        $items = CheckableInventory::all();
        $this->assertNotEmpty($items);

        foreach ($items as $item) {
            $this->assertSame(
                SchemaRole::SOURCE,
                $item->schema->role(),
                "Checkable item {$item->id} validates against {$item->schema->name()}, which is not a source schema"
            );
        }
    }
}
```

- [ ] **Step 2: Run it**

Run: `vendor/bin/phpunit phpunit_tests/Models/CheckableInventorySchemaRoleTest.php`
Expected: PASS. Every current item uses `PROPRIUMDESANCTIS`, `PROPRIUMDETEMPORE`, `DECREES_SRC`, `I18N`,
`NATIONAL`, `WIDERREGION`, `DIOCESAN` or `TEST_SRC`, all classified `SOURCE` in Task 1. **If it fails, do
not adjust the role to make it pass** — report the item and the schema; a genuine mismatch is a finding.

- [ ] **Step 3: Commit**

```bash
git add phpunit_tests/Models/CheckableInventorySchemaRoleTest.php
git commit -m "test(validations): assert every checkable item validates against a source schema"
```

---

### Task 3: `SourceReadings`, `Lectionary.json`, and `LitSchema::LECTIONARY`

**Files:**

- Modify: `jsondata/schemas/CommonDef.json`
- Create: `jsondata/schemas/Lectionary.json`
- Modify: `src/Enum/LitSchema.php`
- Test: `phpunit_tests/LectionaryCorpusTest.php`

**Interfaces:**

- Produces: `CommonDef.json#/definitions/SourceReadings`, `LitSchema::LECTIONARY` (role `SOURCE`).

- [ ] **Step 1: Write the failing test**

Create `phpunit_tests/LectionaryCorpusTest.php`. It validates every lectionary file in the repository
against the new schema — this is the test that proves the schema fits the data:

```php
<?php

declare(strict_types=1);

namespace LiturgicalCalendar\Api\Tests;

use LiturgicalCalendar\Api\Enum\LitSchema;
use Opis\JsonSchema\Helper;
use Opis\JsonSchema\Validator;
use PHPUnit\Framework\TestCase;

final class LectionaryCorpusTest extends TestCase
{
    /** @return list<string> Every lectionary JSON file in the repository. */
    private static function lectionaryFiles(): array
    {
        $root  = dirname(__DIR__) . '/jsondata/sourcedata';
        $found = [];
        $iter  = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($root, \FilesystemIterator::SKIP_DOTS));
        foreach ($iter as $file) {
            /** @var \SplFileInfo $file */
            if ($file->isFile() && 'json' === $file->getExtension() && 'lectionary' === basename($file->getPath())) {
                $found[] = $file->getPathname();
            }
        }
        sort($found);
        return $found;
    }

    public function testTheCorpusIsNotEmpty(): void
    {
        $this->assertGreaterThan(90, count(self::lectionaryFiles()), 'expected ~95 lectionary files');
    }

    public function testEveryLectionaryFileValidatesAgainstTheLectionarySchema(): void
    {
        $validator = new Validator();
        $validator->resolver()?->registerPrefix(
            'https://litcal.johnromanodorazio.com/api/dev/jsondata/schemas/',
            dirname(__DIR__) . '/jsondata/schemas'
        );

        $schema  = json_decode(file_get_contents(LitSchema::LECTIONARY->path()), false, 512, JSON_THROW_ON_ERROR);
        $failures = [];

        foreach (self::lectionaryFiles() as $file) {
            $data   = json_decode(file_get_contents($file), false, 512, JSON_THROW_ON_ERROR);
            $result = $validator->validate(Helper::toJSON($data), $schema);
            if (!$result->isValid()) {
                $error      = $result->error();
                $failures[] = basename(dirname($file)) . '/' . basename($file) . ': ' . ($error?->message() ?? 'invalid');
            }
        }

        $this->assertSame([], $failures, "Lectionary files failed schema validation:\n" . implode("\n", $failures));
    }
}
```

**Note on the validator setup:** match whatever the existing schema tests in `phpunit_tests/` do for
resolver registration — check `phpunit_tests/Handlers/` or `phpunit_tests/Models/` for an existing
`Validator` usage and copy its prefix/resolver lines verbatim rather than inventing them.

- [ ] **Step 2: Run it to verify it fails**

Run: `vendor/bin/phpunit phpunit_tests/LectionaryCorpusTest.php`
Expected: FAIL — `LitSchema::LECTIONARY` does not exist.

- [ ] **Step 3: Add `SourceReadings` to `CommonDef.json`**

Add these three definitions to `CommonDef.json`'s `definitions` object. **Do not touch `Readings`.**

```json
"ReadingsWithVigil": {
    "type": "object",
    "title": "Readings with a Vigil Mass",
    "description": "Source-data shape for an event whose vigil Mass has proper readings of its own. Output does not use this shape: there a vigil is a liturgical event in its own right, with its own event_key and its own flat readings.",
    "additionalProperties": false,
    "properties": {
        "vigil": { "$ref": "#/definitions/Readings" },
        "day": { "$ref": "#/definitions/Readings" }
    },
    "required": ["vigil", "day"]
},
"ReadingsChristmasWithVigil": {
    "type": "object",
    "title": "Christmas Readings with a Vigil Mass",
    "description": "Source-data shape for Christmas, whose vigil, night, dawn and day Masses each have proper readings.",
    "additionalProperties": false,
    "properties": {
        "vigil": { "$ref": "#/definitions/Readings" },
        "night": { "$ref": "#/definitions/Readings" },
        "dawn": { "$ref": "#/definitions/Readings" },
        "day": { "$ref": "#/definitions/Readings" }
    },
    "required": ["vigil", "night", "dawn", "day"]
},
"SourceReadings": {
    "title": "Lectionary Readings (source data)",
    "description": "The readings for one liturgical event as stored in source data. Everything CommonDef's Readings admits, plus the two vigil-bearing shapes that only source data uses.",
    "oneOf": [
        { "$ref": "#/definitions/Readings" },
        { "$ref": "#/definitions/ReadingsWithVigil" },
        { "$ref": "#/definitions/ReadingsChristmasWithVigil" }
    ]
}
```

- [ ] **Step 4: Create `jsondata/schemas/Lectionary.json`**

```json
{
    "$schema": "https://json-schema.org/draft-07/schema#",
    "$id": "https://litcal.johnromanodorazio.com/api/dev/jsondata/schemas/Lectionary.json",
    "title": "Lectionary",
    "description": "One locale's lectionary readings for a section of the corpus: a map of event_key to that event's readings. Readings may be empty strings; this schema asserts that the structure is in place, not that the readings are written (see #712).",
    "type": "object",
    "propertyNames": { "$ref": "./CommonDef.json#/definitions/EventKey" },
    "additionalProperties": { "$ref": "./CommonDef.json#/definitions/SourceReadings" }
}
```

Match the `$id` host and path prefix to whatever the sibling schemas use — copy from
`jsondata/schemas/PropriumDeSanctis.json`.

- [ ] **Step 5: Add the `LitSchema` case**

Three edits in `src/Enum/LitSchema.php`:

```php
    case LECTIONARY        = '/Lectionary.json';
```

in `error()`:

```php
            LitSchema::LECTIONARY => $ERRMSG . 'Lectionary data not created / updated',
```

in `fromURL()`:

```php
            LitSchema::LECTIONARY->path()        => LitSchema::LECTIONARY,
```

and add `LitSchema::LECTIONARY,` to the `SchemaRole::SOURCE` arm of `role()` from Task 1.

- [ ] **Step 6: Run the corpus test**

Run: `vendor/bin/phpunit phpunit_tests/LectionaryCorpusTest.php`
Expected: PASS — all ~95 files validate. If any fail, the message names the file and the reason; a shape
not covered by `SourceReadings` is a real finding and should be reported, not patched around by loosening
the schema.

- [ ] **Step 7: Verify the output schema was not loosened**

Run: `vendor/bin/phpunit && composer analyse && composer lint:openapi`
Expected: PASS. In particular no `LitCal.json` test may change behaviour — `Readings` was not modified.

- [ ] **Step 8: Commit**

```bash
git add jsondata/schemas/CommonDef.json jsondata/schemas/Lectionary.json src/Enum/LitSchema.php phpunit_tests/LectionaryCorpusTest.php
git commit -m "feat(schemas): add Lectionary.json over a source-shaped SourceReadings definition"
```

---

### Task 4: `Step::COVERS`

**Files:**

- Modify: `src/Enum/Step.php`
- Modify: `src/Enum/FrameFamily.php`
- Modify: `jsondata/schemas/WebSocketFrame.json`
- Test: `phpunit_tests/Enum/StepCoversTest.php`

**Interfaces:**

- Produces: `Step::COVERS = 'covers'`; `FrameFamily::CHECK->frameClasses($f, Step::COVERS)` returns
  `.{$f}.locales-covered`.

- [ ] **Step 1: Write the failing test**

Create `phpunit_tests/Enum/StepCoversTest.php`:

```php
<?php

declare(strict_types=1);

namespace LiturgicalCalendar\Api\Tests\Enum;

use LiturgicalCalendar\Api\Enum\FrameFamily;
use LiturgicalCalendar\Api\Enum\Step;
use PHPUnit\Framework\TestCase;

final class StepCoversTest extends TestCase
{
    public function testCoversIsAPublishedStep(): void
    {
        $this->assertSame('covers', Step::COVERS->value);
    }

    public function testChecksCanAddressACoversCard(): void
    {
        $this->assertSame('.nation-roman-US-i18n.locales-covered', FrameFamily::CHECK->frameClasses('nation-roman-US-i18n', Step::COVERS));
    }

    public function testTestRunsCannotAddressACoversCard(): void
    {
        $this->expectException(\LogicException::class);
        FrameFamily::TEST_RUN->frameClasses('SomeTest', Step::COVERS);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `vendor/bin/phpunit phpunit_tests/Enum/StepCoversTest.php`
Expected: FAIL — `Step::COVERS` undefined.

- [ ] **Step 3: Add the case**

In `src/Enum/Step.php`, after `VALIDATES`:

```php
    case COVERS    = 'covers';
```

Update the class docblock: `CheckableInventory::STEPS` advertises `exists`, `parses`, `validates`, and
`covers` is advertised only by items that carry an expected locale set.

- [ ] **Step 4: Add the legacy class projection**

In `src/Enum/FrameFamily.php`, in `CLASS_FOR_STEP` under `self::CHECK->value`:

```php
            'covers'    => 'locales-covered'
```

`TEST_RUN` gets no entry: a test run has no folder and no locales, and `frameClasses()` already refuses a
step its family does not have.

- [ ] **Step 5: Add `covers` to the frame schema**

In `jsondata/schemas/WebSocketFrame.json`, find the `step` property's `enum` (it lists `exists`, `parses`,
`validates`, `complete`) and add `"covers"` after `"validates"`. Update the adjacent `description` to say
that `covers` reports whether a folder holds a file for every locale its owner declares, and is advertised
only by items carrying an expected locale set.

- [ ] **Step 6: Run the test**

Run: `vendor/bin/phpunit phpunit_tests/Enum/StepCoversTest.php && composer analyse`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/Enum/Step.php src/Enum/FrameFamily.php jsondata/schemas/WebSocketFrame.json phpunit_tests/Enum/StepCoversTest.php
git commit -m "feat(ws): add a covers step for locale coverage of source folders"
```

---

### Task 5: `CheckableItem::$expectedLocales`

**Files:**

- Modify: `src/Models/ValidationsPath/CheckableItem.php`
- Modify: `jsondata/schemas/LitCalValidationsPath.json`
- Test: `phpunit_tests/Models/CheckableItemExpectedLocalesTest.php`

**Interfaces:**

- Produces: `CheckableItem::__construct(..., array $steps, string $path, ?array $expectedLocales = null)`;
  serialized key `expected_locales`.

The parameter is added **last with a default**, so every existing construction site keeps working
unchanged and Task 6 only touches the ones that need it.

- [ ] **Step 1: Write the failing test**

Create `phpunit_tests/Models/CheckableItemExpectedLocalesTest.php`:

```php
<?php

declare(strict_types=1);

namespace LiturgicalCalendar\Api\Tests\Models;

use LiturgicalCalendar\Api\Enum\LitSchema;
use LiturgicalCalendar\Api\Enum\Rite;
use LiturgicalCalendar\Api\Models\ValidationsPath\CheckableItem;
use PHPUnit\Framework\TestCase;

final class CheckableItemExpectedLocalesTest extends TestCase
{
    public function testAnItemWithoutExpectedLocalesOmitsTheCoversStep(): void
    {
        $item = new CheckableItem('x:roman', 'file', Rite::ROMAN, null, 'X', LitSchema::NATIONAL, ['exists', 'parses', 'validates'], '/tmp/x');
        $json = $item->jsonSerialize();
        $this->assertNull($json['expected_locales']);
        $this->assertNotContains('covers', $json['steps']);
    }

    public function testAnItemWithExpectedLocalesSerialisesThem(): void
    {
        $item = new CheckableItem(
            'x:roman:i18n',
            'folder',
            Rite::ROMAN,
            null,
            'X translations',
            LitSchema::I18N,
            ['exists', 'parses', 'validates', 'covers'],
            '/tmp/x/i18n',
            ['en', 'it']
        );
        $json = $item->jsonSerialize();
        $this->assertSame(['en', 'it'], $json['expected_locales']);
        $this->assertContains('covers', $json['steps']);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `vendor/bin/phpunit phpunit_tests/Models/CheckableItemExpectedLocalesTest.php`
Expected: FAIL — too many constructor arguments / undefined `expected_locales` key.

- [ ] **Step 3: Add the property**

In `src/Models/ValidationsPath/CheckableItem.php`, add the constructor parameter and the serialized key:

```php
     * @param 'file'|'folder' $kind
     * @param list<string> $steps
     * @param ?list<string> $expectedLocales The locales this folder is expected to hold a file for, or null
     *        when nothing independent declares such a set. Non-null exactly when `$steps` contains `covers`:
     *        the step and the expectation are one fact, so they are never allowed to disagree.
     */
    public function __construct(
        public string $id,
        public string $kind,
        public Rite $rite,
        public ?string $region,
        public string $label,
        public LitSchema $schema,
        public array $steps,
        public string $path,
        public ?array $expectedLocales = null
    ) {
    }
```

and in `jsonSerialize()`, after `'steps'`:

```php
            'steps'            => $this->steps,
            'expected_locales' => $this->expectedLocales
```

Update the `@return` shape annotation to include `expected_locales:list<string>|null`.

- [ ] **Step 4: Declare it on the wire schema**

In `jsondata/schemas/LitCalValidationsPath.json`, add to the item's `properties`:

```json
     "expected_locales": {
      "type": ["array", "null"],
      "items": { "type": "string", "minLength": 1 },
      "description": "The locales this item's folder is expected to hold a file for, when something other than the folder itself declares such a set. Non-null exactly when `steps` contains `covers`. Null for file items and for folders whose declared locales are scanned from the folder being checked, where the comparison would be a tautology."
     }
```

Add `"expected_locales"` to the item's `required` array — the key is always present, its value is null
when there is no expectation.

- [ ] **Step 5: Run the tests**

Run: `vendor/bin/phpunit phpunit_tests/Models/ && composer analyse && composer lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Models/ValidationsPath/CheckableItem.php jsondata/schemas/LitCalValidationsPath.json phpunit_tests/Models/CheckableItemExpectedLocalesTest.php
git commit -m "feat(validations): carry an expected locale set on checkable items"
```

---

### Task 6: The inventory — expected locales and 26 lectionary items

**Files:**

- Modify: `src/Models/ValidationsPath/CheckableInventory.php`
- Test: `phpunit_tests/Models/CheckableInventoryLectionaryTest.php`

**Interfaces:**

- Consumes: `CheckableItem`'s ninth constructor argument (Task 5); `Step::COVERS` (Task 4);
  `LitSchema::LECTIONARY` (Task 3).
- Produces: inventory ids `lectionary:roman:{section}`, `decrees:roman:lectionary`,
  `{owner}:lectionary`; `CheckableInventory::STEPS_WITH_COVERAGE`.

- [ ] **Step 1: Write the failing test**

Create `phpunit_tests/Models/CheckableInventoryLectionaryTest.php`:

```php
<?php

declare(strict_types=1);

namespace LiturgicalCalendar\Api\Tests\Models;

use LiturgicalCalendar\Api\Enum\LitSchema;
use LiturgicalCalendar\Api\Models\ValidationsPath\CheckableInventory;
use PHPUnit\Framework\TestCase;

final class CheckableInventoryLectionaryTest extends TestCase
{
    public function testTheTenUniversalSectionsAreAdvertised(): void
    {
        $sections = [
            'dominicale_et_festivum_A', 'dominicale_et_festivum_B', 'dominicale_et_festivum_C',
            'feriale_per_annum_I', 'feriale_per_annum_II', 'feriale_tempus_adventus',
            'feriale_tempus_nativitatis', 'feriale_tempus_paschatis', 'feriale_tempus_quadragesimae',
            'sanctorum'
        ];
        foreach ($sections as $section) {
            $item = CheckableInventory::byId("lectionary:roman:{$section}");
            $this->assertNotNull($item, "lectionary:roman:{$section} is not advertised");
            $this->assertSame('folder', $item->kind);
            $this->assertSame(LitSchema::LECTIONARY, $item->schema);
            $this->assertContains('covers', $item->steps);
        }
    }

    public function testOwnedLectionaryFoldersUseTheSuffixForm(): void
    {
        foreach (['decrees:roman:lectionary', 'nation:roman:US:lectionary', 'diocese:roman:bredad_nl:lectionary', 'sanctorale:roman:US_2011:lectionary', 'widerregion:roman:Europe:lectionary'] as $id) {
            $this->assertNotNull(CheckableInventory::byId($id), "{$id} is not advertised");
        }
    }

    public function testAbsentLectionaryFoldersAreNotAdvertised(): void
    {
        // IT declares a national calendar but has no nation-level lectionary folder.
        $this->assertNull(CheckableInventory::byId('nation:roman:IT:lectionary'));
    }

    public function testCoversAndExpectedLocalesNeverDisagree(): void
    {
        foreach (CheckableInventory::all() as $item) {
            $this->assertSame(
                in_array('covers', $item->steps, true),
                null !== $item->expectedLocales,
                "{$item->id}: the covers step and expectedLocales disagree"
            );
        }
    }

    public function testTautologicalFoldersCarryNoExpectation(): void
    {
        // A wider region's and a missal's declared locales are scanned from these very folders.
        $this->assertNull(CheckableInventory::byId('widerregion:roman:Europe:i18n')?->expectedLocales);
        $this->assertNull(CheckableInventory::byId('sanctorale:roman:US_2011:i18n')?->expectedLocales);
    }

    public function testDeclaredFoldersCarryTheOwnersLocales(): void
    {
        $this->assertSame(['en_US'], CheckableInventory::byId('nation:roman:US:i18n')?->expectedLocales);
        $this->assertSame(['en_US'], CheckableInventory::byId('nation:roman:US:lectionary')?->expectedLocales);
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `vendor/bin/phpunit phpunit_tests/Models/CheckableInventoryLectionaryTest.php`
Expected: FAIL — none of the lectionary ids resolve.

- [ ] **Step 3: Add the coverage-bearing steps constant and a folder helper**

In `CheckableInventory`, beside the existing `STEPS`:

```php
    /** @var list<string> An item that also states which locales it should hold gets a fourth step. */
    private const STEPS_WITH_COVERAGE = ['exists', 'parses', 'validates', 'covers'];

    /**
     * The item for a folder that may or may not be on disk, or null when it is not.
     *
     * Conditional by design: a nation without a lectionary folder must produce no item rather than an
     * item whose `exists` step is guaranteed to fail. `is_dir()` here is a stat on an already-known
     * path, not a discovery glob — the owner comes from the calendar index either way.
     *
     * @param ?list<string> $expectedLocales
     */
    private static function folderItemIfPresent(
        string $id,
        Rite $rite,
        ?string $region,
        string $label,
        LitSchema $schema,
        string $path,
        ?array $expectedLocales
    ): ?CheckableItem {
        $path = rtrim($path, '/');
        if (!is_dir($path)) {
            return null;
        }

        return new CheckableItem(
            $id,
            'folder',
            $rite,
            $region,
            $label,
            $schema,
            null === $expectedLocales ? self::STEPS : self::STEPS_WITH_COVERAGE,
            $path,
            $expectedLocales
        );
    }
```

- [ ] **Step 4: Add the rite-level lectionary corpus**

Add a producer and call it from `staticItems()` (it reads only `JsonData` constants, so it belongs in the
static half beside `explicitItems()`):

```php
    /**
     * The rite's own lectionary corpus: ten sections plus the decrees lectionary.
     *
     * Sections come from the `JsonData::LECTIONARY_*_FOLDER` constants rather than from a glob, for the
     * same reason `explicitItems()` lists its paths: `JsonData` is where this repository's layout is
     * written down, and a second enumeration of it would be a second place to keep in step.
     *
     * The expected locale set is the General Roman Calendar's — `CalendarMetadataProvider::localesForRite()`
     * — which is the fully-translated set, not the fourteen gettext folders. Reading it here is a
     * registry lookup, not a source-data read, so this stays usable as the static-half fallback.
     *
     * @return list<CheckableItem>
     */
    private static function lectionaryCorpusItems(): array
    {
        $sections = [
            'dominicale_et_festivum_A'   => JsonData::LECTIONARY_SUNDAYS_SOLEMNITIES_A_FOLDER,
            'dominicale_et_festivum_B'   => JsonData::LECTIONARY_SUNDAYS_SOLEMNITIES_B_FOLDER,
            'dominicale_et_festivum_C'   => JsonData::LECTIONARY_SUNDAYS_SOLEMNITIES_C_FOLDER,
            'feriale_per_annum_I'        => JsonData::LECTIONARY_WEEKDAYS_ORDINARY_I_FOLDER,
            'feriale_per_annum_II'       => JsonData::LECTIONARY_WEEKDAYS_ORDINARY_II_FOLDER,
            'feriale_tempus_adventus'    => JsonData::LECTIONARY_WEEKDAYS_ADVENT_FOLDER,
            'feriale_tempus_nativitatis' => JsonData::LECTIONARY_WEEKDAYS_CHRISTMAS_FOLDER,
            'feriale_tempus_paschatis'   => JsonData::LECTIONARY_WEEKDAYS_EASTER_FOLDER,
            'feriale_tempus_quadragesimae' => JsonData::LECTIONARY_WEEKDAYS_LENT_FOLDER,
            'sanctorum'                  => JsonData::LECTIONARY_SAINTS_FOLDER
        ];

        $locales = CalendarMetadataProvider::localesForRite(Rite::ROMAN);
        $items   = [];

        foreach ($sections as $section => $folder) {
            $item = self::folderItemIfPresent(
                "lectionary:roman:{$section}",
                Rite::ROMAN,
                null,
                "Lectionary structure: {$section}",
                LitSchema::LECTIONARY,
                $folder->path(),
                $locales
            );
            if (null !== $item) {
                $items[] = $item;
            }
        }

        $decrees = self::folderItemIfPresent(
            'decrees:roman:lectionary',
            Rite::ROMAN,
            null,
            'Lectionary structure: memorials from decrees',
            LitSchema::LECTIONARY,
            JsonData::LECTIONARY_DECREES_FOLDER->path(),
            $locales
        );
        if (null !== $decrees) {
            $items[] = $decrees;
        }

        return $items;
    }
```

Then in `staticItems()`:

```php
        return array_merge(
            self::derivedRomanSanctorale(),
            self::explicitItems(),
            self::lectionaryCorpusItems()
        );
```

**Check `CalendarMetadataProvider::localesForRite()`'s actual return** before relying on it: if it does not
return the same set `buildLocales()` computes (`FULLY_TRANSLATED_LOCALES` ∩ gettext folders, i.e.
`['en','fr','it','nl','la']`), use whichever accessor does, and report the discrepancy.

- [ ] **Step 5: Add expected locales to the two rite-level i18n items**

In `explicitItems()`, the `temporale:roman:i18n` and `decrees:roman:i18n` items gain
`CalendarMetadataProvider::localesForRite(Rite::ROMAN)` as their ninth argument and
`self::STEPS_WITH_COVERAGE` as their steps. Same for the two Ambrosian i18n items using
`localesForRite(Rite::AMBROSIAN)` — **except** `temporale:ambrosian:i18n`, whose locales are scanned from
that very folder: leave it with `self::STEPS` and no expectation.

- [ ] **Step 6: Add the owned lectionary items and i18n expectations**

Four edits, one per producer:

`nationalCalendarItems()` — the `:i18n` item gains `$nation->locales` and `STEPS_WITH_COVERAGE`; then
append:

```php
            $lectionary = self::folderItemIfPresent(
                "nation:roman:{$id}:lectionary",
                Rite::ROMAN,
                $id,
                "National lectionary structure: {$id}",
                LitSchema::LECTIONARY,
                strtr(JsonData::NATIONAL_CALENDAR_LECTIONARY_FOLDER->path(), ['{nation}' => $id]),
                $nation->locales
            );
            if (null !== $lectionary) {
                $items[] = $lectionary;
            }
```

`widerRegionItems()` — the `:i18n` item is **unchanged** (tautological); append:

```php
            $lectionary = self::folderItemIfPresent(
                "widerregion:roman:{$name}:lectionary",
                Rite::ROMAN,
                null,
                "Wider region lectionary structure: {$name}",
                LitSchema::LECTIONARY,
                strtr(JsonData::WIDER_REGION_LECTIONARY_FOLDER->path(), ['{wider_region}' => $name]),
                $region->locales
            );
            if (null !== $lectionary) {
                $items[] = $lectionary;
            }
```

`diocesanCalendarItems()` — the `:i18n` item gains `$diocese->locales` and `STEPS_WITH_COVERAGE`; then
append, using `$replacements` already in scope:

```php
            $lectionary = self::folderItemIfPresent(
                "diocese:{$diocese->rite->value}:{$diocese->calendar_id}:lectionary",
                $diocese->rite,
                $diocese->nation,
                "Diocesan lectionary structure: {$diocese->diocese}",
                LitSchema::LECTIONARY,
                strtr(JsonData::DIOCESAN_CALENDAR_LECTIONARY_FOLDER->path(), $replacements),
                $diocese->locales
            );
            if (null !== $lectionary) {
                $items[] = $lectionary;
            }
```

`DIOCESAN_CALENDAR_LECTIONARY_FOLDER` is Roman-only and no Ambrosian counterpart exists; since no
Ambrosian diocese has a lectionary folder, `folderItemIfPresent()` returns null for them and nothing is
advertised. Do **not** invent an Ambrosian constant in this task.

`derivedRomanSanctorale()` — the `:i18n` item is **unchanged** (tautological); append inside the loop:

```php
            $lectionaryFolder = strtr(JsonData::MISSAL_LECTIONARY_FOLDER->path(), ['{missal_folder}' => "propriumdesanctis_{$missalId}"]);
            $lectionary       = self::folderItemIfPresent(
                "sanctorale:roman:{$missalId}:lectionary",
                Rite::ROMAN,
                $region,
                "{$name} lectionary structure",
                LitSchema::LECTIONARY,
                $lectionaryFolder,
                false === $i18n ? null : array_map(
                    static fn (string $f): string => basename($f, '.json'),
                    glob(rtrim($i18n, '/') . '/*.json') ?: []
                )
            );
            if (null !== $lectionary) {
                $items[] = $lectionary;
            }
```

**Verify the missal folder name** before relying on the `propriumdesanctis_{$missalId}` interpolation:
check whether `RomanMissal` exposes an accessor for the folder (e.g. alongside `getSanctoraleFileName()`)
and prefer it. If `RomanMissal::produceMetadata()` already exposes the missal's `locales`, use that
instead of the glob above.

- [ ] **Step 7: Add the import**

Add `use LiturgicalCalendar\Api\Services\CalendarMetadataProvider;` if not already imported (it is —
verify) and confirm no new `use` is needed for `Rite`, `JsonData`, `LitSchema`.

- [ ] **Step 8: Run the tests**

Run: `vendor/bin/phpunit phpunit_tests/Models/ && composer analyse && composer lint`
Expected: PASS, including `CheckableInventorySchemaRoleTest` from Task 2 (the new items use
`LitSchema::LECTIONARY`, classified `SOURCE` in Task 3).

- [ ] **Step 9: Verify the live inventory**

Start the API with `composer start`, then:

```bash
curl -s localhost:8000/validations | python3 -c "
import json, sys
items = json.load(sys.stdin)['litcal_validations']
print('items:', len(items))
print('prefixes:', sorted({i['id'].split(':')[0] for i in items}))
print('covers-bearing:', sum(1 for i in items if 'covers' in i['steps']))
"
```

Expected: the prefix list now includes `lectionary`, and the covers count is 45.

- [ ] **Step 10: Commit**

```bash
git add src/Models/ValidationsPath/CheckableInventory.php phpunit_tests/Models/CheckableInventoryLectionaryTest.php
git commit -m "feat(validations): advertise the lectionary corpus and expected locale sets"
```

---

### Task 7: `Health` reports the `covers` step

**Files:**

- Modify: `src/Health.php`
- Test: `phpunit_tests/HealthCoversStepTest.php`

**Interfaces:**

- Consumes: `CheckableItem::$expectedLocales` (Task 5), `Step::COVERS` (Task 4).
- Produces: a `stepResult` frame with `step: "covers"` for folder checks that carry an expectation.

- [ ] **Step 1: Write the failing test**

Create `phpunit_tests/HealthCoversStepTest.php`. Model it on the existing
`phpunit_tests/HealthFolderStepResultTest.php` — **read that file first and follow its harness exactly**
(how it fakes a `ConnectionInterface`, how it drains the ReactPHP promises). The assertions to make:

```php
    public function testAFolderWithEveryExpectedLocaleReportsCoversAsSuccess(): void
    {
        // Drive a folder check whose expectedLocales are all present; assert exactly one frame with
        // step === 'covers' and status === 'success'.
    }

    public function testAMissingLocaleFailsCoversAndNamesIt(): void
    {
        // expectedLocales includes a locale with no {locale}.json; assert step === 'covers',
        // status === 'error', and that the frame text names the missing locale.
    }

    public function testAnExtraLocaleDoesNotFailCovers(): void
    {
        // A folder holding a file for a locale not in expectedLocales still passes, and the extra is
        // named in the frame text.
    }

    public function testAFolderWithNoExpectationEmitsNoCoversFrame(): void
    {
        // expectedLocales === null; assert no frame carries step === 'covers'.
    }
```

- [ ] **Step 2: Run it to verify it fails**

Run: `vendor/bin/phpunit phpunit_tests/HealthCoversStepTest.php`
Expected: FAIL — no `covers` frame is ever emitted.

- [ ] **Step 3: Thread the expectation into the executor**

In `src/Health.php`, add a parameter to `runValidationSteps()`, last in the list with a default so no
existing call site changes:

```php
        ?string $requestId = null,
        ?array $expectedLocales = null
    ): void {
```

with the docblock entry:

```php
     * @param ?list<string> $expectedLocales For a folder check, the locales the folder is expected to hold a file for. Null when nothing
     *        independent declares such a set — a file check, or a folder whose declared locales are scanned from itself, where the
     *        comparison would be a tautology. Non-null is what makes the `covers` step reportable at all.
```

In `validateSource()`, pass it from the resolved item:

```php
            requestId: $requestId,
            expectedLocales: $item->expectedLocales
        );
```

- [ ] **Step 4: Compute coverage in the folder branch**

In the `if ($kind === 'folder')` branch, `$files` is already the `glob($dataPath . '/*.json')` result.
Immediately after the empty-`$files` early return, compute:

```php
            // Coverage is a statement about the folder as a whole, computed from the same glob the
            // per-file steps read. A locale the owner declares with no file fails; a file for a locale
            // the owner does not declare does not fail, but is named — holding data you do not declare
            // is worth seeing, and is how a stale `locales` declaration surfaces.
            $presentLocales  = array_map(static fn (string $f): string => basename($f, '.json'), $files);
            $missingLocales  = null === $expectedLocales ? [] : array_values(array_diff($expectedLocales, $presentLocales));
            $extraLocales    = null === $expectedLocales ? [] : array_values(array_diff($presentLocales, $expectedLocales));
```

In the empty-`$files` early return, if `$expectedLocales` is non-null the loop over the three steps must
also emit a failing `covers` frame — otherwise a run that advertised four steps gets three and the client
waits for a card that never arrives. Change that loop to:

```php
                $steps = null === $expectedLocales
                    ? [Step::EXISTS, Step::PARSES, Step::VALIDATES]
                    : [Step::EXISTS, Step::PARSES, Step::VALIDATES, Step::COVERS];
                foreach ($steps as $step) {
```

- [ ] **Step 5: Emit the frame**

In the `$allPromises->then(...)` callback, after the `Step::VALIDATES` call, add — and add
`$expectedLocales`, `$missingLocales`, `$extraLocales` to that closure's `use` list:

```php
                    if (null !== $expectedLocales) {
                        $expectedCount = count($expectedLocales);
                        $extraNote     = [] === $extraLocales ? '' : ' (also present, though not declared: ' . implode(', ', $extraLocales) . ')';
                        $this->sendFolderStepResult(
                            $to,
                            $classFragment,
                            $target,
                            Step::COVERS,
                            [] === $missingLocales ? [] : ['missing locale files: ' . implode(', ', array_map(static fn (string $l): string => "{$l}.json", $missingLocales))],
                            "Data folder $sourceFolder holds a file for all $expectedCount declared locales$extraNote",
                            "Data folder $sourceFolder is missing files for " . count($missingLocales) . " of $expectedCount declared locales",
                            $runToken,
                            requestId: $requestId
                        );
                    }
```

- [ ] **Step 6: Run the tests**

Run: `vendor/bin/phpunit && composer analyse && composer lint`
Expected: PASS. The whole suite, because `runValidationSteps()` changed.

- [ ] **Step 7: Commit**

```bash
git add src/Health.php phpunit_tests/HealthCoversStepTest.php
git commit -m "feat(ws): report locale coverage as a covers step on folder checks"
```

---

## PR 2 — UnitTestInterface

### Task 8: Render the `covers` card

**Files:**

- Modify: `assets/js/wsProtocol.js`
- Test: `e2e/ws-protocol.spec.ts`

**Interfaces:**

- Produces: `STEP_CARD_CLASS.covers === 'step-covers'`; `STEP_CARD_BODY.covers`;
  `DEFAULT_CHECK_STEPS`.

**The trap in this task:** `stepsForCheck()` currently falls back to `Object.keys(STEP_CARD_CLASS)` for a
check that advertises no `steps`. Adding `covers` to that table would silently give every legacy
three-step check — the bare-URL `executeValidation` checks, the calendar-data years, and every stored run
recorded before this change — a fourth card that no frame ever paints. The fallback must be pinned to the
three-step set **in the same edit**.

- [ ] **Step 1: Write the failing test**

Add to `e2e/ws-protocol.spec.ts` (follow the file's existing import and test style):

```typescript
test( 'the covers step has a card class and body', () => {
    expect( STEP_CARD_CLASS.covers ).toBe( 'step-covers' );
    expect( typeof STEP_CARD_BODY.covers ).toBe( 'function' );
} );

test( 'a check advertising no steps still falls back to exactly three', () => {
    expect( stepsForCheck( undefined ) ).toEqual( [ 'exists', 'parses', 'validates' ] );
    expect( stepsForCheck( { } ) ).toEqual( [ 'exists', 'parses', 'validates' ] );
} );

test( 'a four-step item renders four cards', () => {
    const html = stepCardsHtml( {
        steps: [ 'exists', 'parses', 'validates', 'covers' ],
        classesFor: c => c,
        icon: '?'
    } );
    expect( html.match( /class="card /g ) ?? [] ).toHaveLength( 4 );
    expect( html ).toContain( 'step-covers' );
} );
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/ws-protocol.spec.ts`
Expected: FAIL — `STEP_CARD_CLASS.covers` is undefined.

- [ ] **Step 3: Add the rows and pin the fallback**

In `assets/js/wsProtocol.js`:

```javascript
export const STEP_CARD_CLASS = Object.freeze({
    exists: 'step-exists',
    parses: 'step-parses',
    validates: 'step-validates',
    covers: 'step-covers'
});

/**
 * The steps a check falls back to when it advertises none.
 *
 * Pinned rather than derived from {@link STEP_CARD_CLASS}, which it used to be. The checks that carry
 * no `steps` are precisely the ones that never came from the inventory — the bare-URL
 * `executeValidation` checks, the calendar-data years, and runs stored before the #42 migration — and
 * every one of those is a three-step check by construction. Deriving the fallback from the card table
 * meant that adding a fourth card class silently gave all of them a fourth card no frame would ever
 * paint.
 *
 * @type {ReadonlyArray<string>}
 */
export const DEFAULT_CHECK_STEPS = Object.freeze([ 'exists', 'parses', 'validates' ]);
```

```javascript
export const stepsForCheck = ( check ) =>
    Array.isArray( check?.steps ) ? check.steps : [ ...DEFAULT_CHECK_STEPS ];
```

```javascript
export const STEP_CARD_BODY = Object.freeze({
    exists: () => 'data exists',
    parses: ( responseType ) => `<span class="response-type">${responseType}</span> valid`,
    validates: () => 'schema valid',
    covers: () => 'locales covered'
});
```

Update `stepsForCheck()`'s docblock to reference `DEFAULT_CHECK_STEPS` and say why it is pinned.

- [ ] **Step 4: Run the test**

Run: `npx playwright test e2e/ws-protocol.spec.ts && npm run lint:js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/js/wsProtocol.js e2e/ws-protocol.spec.ts
git commit -m "feat(ws): render a covers card, and pin the no-steps fallback to three"
```

---

### Task 9: Compose `:lectionary` ids

**Files:**

- Modify: `assets/js/wsProtocol.js`
- Test: `e2e/ws-protocol.spec.ts`

**Interfaces:**

- Consumes: nothing from Task 8.
- Produces: `inventoryIdsForCalendar()` emitting `:lectionary` siblings; `isConditionalInventoryId()`
  matching the four-segment `:lectionary` form.

- [ ] **Step 1: Write the failing test**

Add to `e2e/ws-protocol.spec.ts`:

```typescript
test( 'a lectionary sibling is composed beside every calendar-tier id', () => {
    const ids = inventoryIdsForCalendar( {
        rite: 'roman', dioceseRite: 'roman', nation: 'IT', widerRegion: 'Europe',
        missals: [ 'IT_1983' ], dioceseId: 'romamo_it'
    } );
    expect( ids ).toContain( 'nation:roman:IT:lectionary' );
    expect( ids ).toContain( 'widerregion:roman:Europe:lectionary' );
    expect( ids ).toContain( 'sanctorale:roman:IT_1983:lectionary' );
    expect( ids ).toContain( 'diocese:roman:romamo_it:lectionary' );
} );

test( 'the four-segment lectionary form is conditional, the three-segment one is not', () => {
    expect( isConditionalInventoryId( 'nation:roman:IT:lectionary' ) ).toBe( true );
    expect( isConditionalInventoryId( 'diocese:roman:romamo_it:lectionary' ) ).toBe( true );
    expect( isConditionalInventoryId( 'widerregion:roman:Europe:lectionary' ) ).toBe( true );
    expect( isConditionalInventoryId( 'sanctorale:roman:IT_1983:lectionary' ) ).toBe( true );
    expect( isConditionalInventoryId( 'decrees:roman:lectionary' ) ).toBe( false );
    expect( isConditionalInventoryId( 'lectionary:roman:sanctorum' ) ).toBe( false );
} );
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/ws-protocol.spec.ts`
Expected: FAIL — no `:lectionary` ids composed.

- [ ] **Step 3: Compose the siblings**

In `inventoryIdsForCalendar()`, add the fourth id to each tier:

```javascript
    if ( widerRegion ) {
        ids.push(
            `widerregion:roman:${widerRegion}`,
            `widerregion:roman:${widerRegion}:i18n`,
            `widerregion:roman:${widerRegion}:lectionary`
        );
    }
    if ( nation ) {
        ids.push( `nation:roman:${nation}`, `nation:roman:${nation}:i18n`, `nation:roman:${nation}:lectionary` );
    }
    ( missals ?? [] ).forEach( missalId => ids.push(
        `sanctorale:roman:${missalId}`,
        `sanctorale:roman:${missalId}:i18n`,
        `sanctorale:roman:${missalId}:lectionary`
    ) );
    if ( dioceseId ) {
        ids.push(
            `diocese:${dioceseRite}:${dioceseId}`,
            `diocese:${dioceseRite}:${dioceseId}:i18n`,
            `diocese:${dioceseRite}:${dioceseId}:lectionary`
        );
    }
```

The rite-level lectionary corpus is **not** added here — see Task 10 for why.

- [ ] **Step 4: Extend the conditional predicate**

Beside `CONDITIONAL_INVENTORY_ID`:

```javascript
/**
 * The shape of a calendar-owned lectionary folder id, e.g. `nation:roman:US:lectionary`.
 *
 * Four segments, which is what separates it from the *rite's own* decrees lectionary
 * (`decrees:roman:lectionary`, three segments) — that folder is on disk unconditionally and must keep
 * warning if the server ever stops advertising it. Exactly the same segment-count split that separates
 * a missal's conditional `:i18n` from a rite's unconditional one.
 *
 * Most calendars have no lectionary folder — 3 of 10 nations, 1 wider region, 2 of 5 missals — so
 * absence is the ordinary case here rather than the exception, and warning about it every page load
 * would train the reader to ignore the warnings that mean something.
 */
const CONDITIONAL_LECTIONARY_ID = /^(?:nation|widerregion|sanctorale|diocese):[^:]+:[^:]+:lectionary$/;
```

and:

```javascript
export const isConditionalInventoryId = id =>
    CONDITIONAL_INVENTORY_ID.test( id ) || CONDITIONAL_LECTIONARY_ID.test( id );
```

Update `isConditionalInventoryId()`'s docblock with a third bullet for the lectionary family.

- [ ] **Step 5: Run the test**

Run: `npx playwright test e2e/ws-protocol.spec.ts && npm run lint:js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/js/wsProtocol.js e2e/ws-protocol.spec.ts
git commit -m "feat(checks): compose a lectionary sibling beside every calendar-tier id"
```

---

### Task 10: Discover the rite-level lectionary corpus

**Files:**

- Modify: `assets/js/index.js`
- Test: `e2e/scaffold-advertised-steps.spec.ts`

**Interfaces:**

- Consumes: `ValidationsInventory` and `buildSourceDataChecks()` already in `index.js`.

The ten section ids are **not** composed. They are not derivable from `/calendars` metadata, and listing
them here would put a hand-maintained copy of the API's layout back into this repository — what CLAUDE.md
forbids resurrecting, and what would let a newly added section go silently unchecked. The rule:
**compose what calendar metadata implies; discover from the inventory what it does not.**

- [ ] **Step 1: Write the failing test**

Add to `e2e/scaffold-advertised-steps.spec.ts`, following the file's existing stub-inventory pattern: stub
`/validations` with a `lectionary:roman:sanctorum` item carrying four steps plus the usual rite-level
items, load `index.php`, and assert the scaffold renders a card set for `lectionary:roman:sanctorum`
including one `.step-covers` card.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/scaffold-advertised-steps.spec.ts`
Expected: FAIL — the lectionary item is advertised but no card is rendered for it.

- [ ] **Step 3: Discover by prefix**

In `buildSourceDataChecks()`, after the composed-id loop and before `return checks;`:

```javascript
    // The rite's own lectionary corpus is discovered rather than composed. Its section names are not
    // derivable from `/calendars` metadata, so composing them would mean hardcoding a list of the API's
    // on-disk layout here — the coupling the inventory replaced. Compose what calendar metadata implies;
    // discover from the inventory what it does not.
    ValidationsInventory
        .filter( item => item.id.startsWith( `lectionary:${rite}:` ) )
        .forEach( item => checks.push( { id: item.id, label: item.label, steps: item.steps } ) );
```

Extend `buildSourceDataChecks()`'s docblock to describe the two mechanisms and why they differ.

- [ ] **Step 4: Run the tests**

Run: `npx playwright test && npm run lint:js`
Expected: PASS.

- [ ] **Step 5: Verify against the live stack**

Start the API, the WebSocket server and this interface, load `index.php` for the General Roman Calendar,
and run the source-data phase. Expected: 22 checks / 79 cards, all green. Then select the Diocese of Rome:
27 checks / 99 cards, with `widerregion:roman:Europe:lectionary`'s `covers` card red naming 28 missing
locales, and every other card green.

- [ ] **Step 6: Commit**

```bash
git add assets/js/index.js e2e/scaffold-advertised-steps.spec.ts
git commit -m "feat(checks): discover the rite lectionary corpus from the inventory"
```

---

### Task 11: Documentation

**Files:**

- Modify: `../LiturgicalCalendarAPI/CLAUDE.md`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/specs/2026-08-23-lectionary-validation-design.md`

- [ ] **Step 1: Update the API's CLAUDE.md**

Document `SchemaRole` and the source/output boundary — specifically that `CommonDef`'s `Readings` is the
output shape, `SourceReadings` the source shape, and that the difference is a vigil being its own event in
output. Document `Step::COVERS` and `expected_locales`.

- [ ] **Step 2: Update this repository's CLAUDE.md**

In the WebSocket Messaging section: add `covers` to the step vocabulary and `step-covers` to the card-class
table; note that `stepsForCheck()`'s fallback is `DEFAULT_CHECK_STEPS` and why it is pinned rather than
derived. Add a "Lectionary Validation" subsection beside "Missal (Proprium de Sanctis) Validation" covering
the id scheme, the compose-versus-discover rule, and the conditional four-segment form. Update the
`:i18n` coverage section's card-count figures to the new totals.

- [ ] **Step 3: Mark the spec implemented**

Change the spec's Status section to **Implemented**, naming the two PRs, in the style of
`2026-08-23-index-js-v2-protocol-migration-design.md`.

- [ ] **Step 4: Lint and commit**

```bash
npx --yes markdownlint-cli "**/*.md"
git add CLAUDE.md docs/superpowers/specs/2026-08-23-lectionary-validation-design.md
git commit -m "docs: document the lectionary corpus, schema roles and the covers step"
```

---

## Closing the issue

After both PRs merge, comment on UnitTestInterface#61 recording that part 2 is done, the id scheme, the
final card counts, and the two data gaps this work surfaced but did not fix: `US.json` not declaring
`es_US`, and the 28 missing Europe wider-region lectionary locales. File each as its own issue.
