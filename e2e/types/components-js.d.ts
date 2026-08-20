/**
 * Ambient stub for `@liturgical-calendar/components-js` (issue #48).
 *
 * This package is never installed via npm/yarn — it is deliberately absent from package.json.
 * The browser resolves the bare specifier at runtime through the import map emitted by
 * `layout/footer.php` (a local dev symlink or a pinned jsDelivr build); there is no on-disk
 * package for `tsc`'s Node module resolution to find at build time.
 *
 * This declaration exists solely to satisfy `tsc` for e2e specs (see components-js.spec.ts)
 * that import the specifier inside `page.evaluate()`. It intentionally types the module as
 * `any` rather than mirroring its real exports, since the real shape lives in the library's own
 * repository and would drift out of sync here.
 */
declare module '@liturgical-calendar/components-js';
