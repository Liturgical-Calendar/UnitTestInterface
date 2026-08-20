import { test, expect } from '@playwright/test';

/**
 * The import map that makes `@liturgical-calendar/components-js` resolvable (issue #48).
 *
 * Deliberately asserts on the bare specifier rather than on the CDN URL: the URL is an
 * implementation detail that flips between the local symlink and jsDelivr depending on
 * APP_ENV, while the specifier is what every module in assets/js imports.
 */
for (const page_ of ['/', '/resources.php']) {
    test(`the components-js import map resolves on ${page_}`, async ({ page }) => {
        await page.goto(page_);
        const exported = await page.evaluate(async () => {
            const mod = await import('@liturgical-calendar/components-js');
            return {
                ApiClient: typeof mod.ApiClient,
                ApiBase: typeof mod.ApiBase,
                CalendarSelect: typeof mod.CalendarSelect,
                RiteSelect: typeof mod.RiteSelect,
                rites: Object.values(mod.Rite),
            };
        });
        expect(exported.ApiClient).toBe('function');
        expect(exported.ApiBase).toBe('function');
        expect(exported.CalendarSelect).toBe('function');
        expect(exported.RiteSelect).toBe('function');
        expect(exported.rites).toEqual(expect.arrayContaining(['roman', 'ambrosian']));
    });
}
