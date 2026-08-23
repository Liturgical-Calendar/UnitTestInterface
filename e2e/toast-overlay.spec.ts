import { test, expect, Page } from '@playwright/test';
import { installWebSocketStub } from './websocket-stub';

/**
 * A toast must never take a click aimed at the page beneath it (#67).
 *
 * The completion toast used to land on top of `#startTestRunnerBtn` — the stack was absolutely
 * positioned at the document's top-right, which is where the controls row is — and Playwright
 * reported the run button's click intercepted by the toast's own icon. A user hit the same thing:
 * the primary control was simply dead for the toast's lifetime. Parallel unit-test dispatch (#42)
 * widened the window by making runs finish while a user is still reaching for the button.
 *
 * Two properties are pinned here, one per test below, because either alone can regress:
 *   - the stack is anchored to the bottom-right of the *viewport*, clear of the controls row;
 *   - a toast is transparent to the pointer whatever it overlaps, and still dismissible.
 *
 * The second is the load-bearing one. Bootstrap already sets `pointer-events: none` on
 * `.toast-container` and `pointer-events: auto` back on `.toast`, so the fix had to neutralise the
 * toast box itself (`.page-toast-stack` in `assets/css/common.css`); nothing but this spec would
 * notice that rule being dropped in favour of the container one that Bootstrap already ships.
 *
 * No WebSocket server is needed — `installWebSocketStub()` stands in for it, and never replying is
 * harmless here since nothing waits on a run. The API on :8000 is required, as everywhere else:
 * its responses are what enable the run button.
 */

/** Every toast on both runner pages. `resources.php` carries the same nine ids as `index.php`. */
const TOAST_IDS = [
    'websocket-error',
    'websocket-connected',
    'websocket-closed',
    'tests-complete',
    'results-saved',
    'results-save-failed',
    'results-load-failed',
    'controls-load-failed',
    // Added by #63, for a /validations fetch that failed: the controls built fine, so the message the
    // components-js mount failure shows would have been untrue here.
    'validations-load-failed',
] as const;

const RUNNER_PAGES = ['/', '/resources.php'] as const;

const DESKTOP = { width: 1280, height: 720 };
const NARROW = { width: 375, height: 667 };

type BootstrapToast = { show(): void; hide(): void };
type BootstrapGlobal = {
    Toast: { getOrCreateInstance(el: Element, config?: { autohide?: boolean }): BootstrapToast };
};

/**
 * Put the stack in an exactly known state: every toast hidden, then the named ones shown and kept
 * up, so the assertions below are neither racing an autohide timer nor measuring a stack the page
 * itself has added to (`#websocket-connected` pops on its own as soon as the stubbed socket opens).
 *
 * Returns how many were shown, so a renamed or removed id fails loudly rather than quietly turning
 * an assertion vacuous.
 */
const showOnlyToasts = async (page: Page, ids: readonly string[], allIds: readonly string[]): Promise<number> =>
    page.evaluate(({ toShow, all }) => {
        const { bootstrap } = window as unknown as { bootstrap: BootstrapGlobal };
        const instance = (id: string): BootstrapToast | null => {
            const el = document.getElementById(id);
            return null === el ? null : bootstrap.Toast.getOrCreateInstance(el, { autohide: false });
        };
        // Never hide something this call is about to show: Bootstrap's hide queues a callback that
        // strips `.show` when the fade ends, and a show() issued in the same tick would be undone
        // by it. Only the toasts that must go down are touched.
        for (const id of all) {
            if (false === toShow.includes(id)) {
                instance(id)?.hide();
            }
        }
        let shown = 0;
        for (const id of toShow) {
            const toast = instance(id);
            if (null === toast) {
                continue;
            }
            toast.show();
            shown++;
        }
        return shown;
    }, { toShow: ids, all: allIds });

const readyRunButton = async (page: Page) => {
    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    return startBtn;
};

for (const path of RUNNER_PAGES) {
    for (const viewport of [DESKTOP, NARROW]) {
        const where = `${path} at ${viewport.width}x${viewport.height}`;

        test(`the toast stack sits clear of the run button on ${where}`, async ({ page }) => {
            await installWebSocketStub(page);
            await page.setViewportSize(viewport);
            await page.goto(path);

            const startBtn = await readyRunButton(page);
            // One toast, the one the issue is about: the realistic case, and the one whose stack is
            // short enough that "clear of the button" is a meaningful thing to assert. A stack of all
            // eight is taller than a phone viewport, so it necessarily reaches the button — which is
            // what the click-through test below covers instead.
            expect(await showOnlyToasts(page, ['tests-complete'], TOAST_IDS)).toBe(1);
            await expect(page.locator('#tests-complete')).toBeVisible();
            // Wait out the fade of whatever `showOnlyToasts()` just hid: a toast keeps its `.show`
            // class, and its height in the stack, until the transition ends.
            await expect(page.locator('.page-toast-stack .toast.show')).toHaveCount(1);

            const button = await startBtn.boundingBox();
            const stack = await page.locator('.page-toast-stack').boundingBox();
            expect(button).not.toBeNull();
            expect(stack).not.toBeNull();
            // Non-null asserted above; narrow for the arithmetic.
            const btnBox = button!;
            const stackBox = stack!;

            const overlaps =
                btnBox.x < stackBox.x + stackBox.width &&
                stackBox.x < btnBox.x + btnBox.width &&
                btnBox.y < stackBox.y + stackBox.height &&
                stackBox.y < btnBox.y + btnBox.height;
            expect(overlaps, `toast stack ${JSON.stringify(stackBox)} overlaps run button ${JSON.stringify(btnBox)}`).toBe(false);
        });

        test(`a toast neither swallows the run button's click nor loses its own dismiss on ${where}`, async ({ page }) => {
            await installWebSocketStub(page);
            await page.setViewportSize(viewport);
            await page.goto(path);

            const startBtn = await readyRunButton(page);
            // Every toast at once: the worst case the stack can reach, which on a phone viewport is
            // taller than the screen and so provably covers the button. The click must land anyway.
            expect(await showOnlyToasts(page, TOAST_IDS, TOAST_IDS)).toBe(TOAST_IDS.length);
            const completeToast = page.locator('#tests-complete');
            await expect(completeToast).toBeVisible();

            // No `force`: this is the whole assertion. An intercepted click fails actionability here
            // exactly as it did in the failure that opened #67.
            await startBtn.click({ timeout: 5000 });
            // The click landed *through* a toast that is still up, not after one quietly expired.
            await expect(completeToast).toBeVisible();

            // And the toast is still dismissible: `pointer-events` has to be handed back to the
            // controls inside it, or the fix trades a dead button for a toast that cannot be closed.
            await completeToast.locator('.btn-close').click();
            await expect(completeToast).toBeHidden();
        });
    }
}
