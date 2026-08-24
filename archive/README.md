# Archived: the Accuracy Tests Admin page

`admin.php` and its exclusive assets were retired from the UnitTestInterface on 2026-08-24. They are kept
here rather than deleted because the unit-test authoring workflow they implement has no replacement yet.

Nothing in this folder is served or included by the running interface. The paths are relative to the
repository root, so the files here would not even resolve their own includes without being moved back.

## What is here

| Path                                 | Was                                                    |
|--------------------------------------|--------------------------------------------------------|
| `admin.php`                          | The admin page itself                                  |
| `assets/js/admin.js`                 | Its page script                                        |
| `assets/js/AssertionsBuilder.js`     | Test-assertion UI builder, imported only by `admin.js` |
| `assets/css/admin.css`               | Its stylesheet                                         |
| `assets/css/multi-range-slider.css`  | Slider styles, loaded only by `admin.php`              |
| `components/NewTestModal.php`        | Its "new test" modal                                   |
| `layout/sidebar.php`                 | The sidebar, included only by `admin.php`              |
| `e2e/fixtures.ts`                    | Playwright page-object for `admin.spec.ts`             |

## Why it was retired

The page had not rendered for some time. It dies at `admin.php:122`, where Monolog fails while writing the
"Failed to fetch…" record it is in the middle of logging, so execution never reaches the page body.
Underneath that sits a `TypeError` from `CalendarSelect::hasNationalCalendarWithDioceses()` in
`liturgical-calendar/components` v3.3.1, which cannot parse the API's rite-aware `/calendars`:
`addNationalCalendarWithDioceses()` indexes `[0]` into an `array_filter` result that is empty for `CH`,
because the API ships the Ambrosian diocese `lugano_ch` under nation `CH` but no `nations/CH` calendar.

Because the page never rendered, it never emitted `components/login-modal.php` either — which is why
logging in did not work there, and the reason the login UI has since moved into the shared layout, where
every page gets it.

## What reviving it would require

1. A fix for `CalendarSelect::addNationalCalendarWithDioceses()` in `liturgy-components-php` — a diocese
   does not imply a national calendar — released as v4.2 or later.
2. Re-adding `liturgical-calendar/components` to `composer.json`. Note that v4.x raises the package's PHP
   floor to 8.2, against this repository's declared `>=8.1`.
3. Restoring these files to their original paths, and with them the `SIDEBAR` constant machinery that
   `layout/topnavbar.php` and `layout/footer.php` used to carry for the sidebar's wrapper divs.
4. Restoring the `$pageName === 'admin'` Isotope branch in `layout/footer.php`.
5. Nothing about authentication: that is no longer this page's concern.
