import { test, expect, Page, APIRequestContext } from '@playwright/test';
import { installReplyingWebSocketStub } from './websocket-stub';

/**
 * The card scaffold must render exactly the steps the `/validations` inventory advertises (#62).
 *
 * #42 removed the hardcoded "3 responses per check" from the frame *counting*, but the literal three
 * survived in the scaffolds: both runner pages drew all three step cards
 * unconditionally, while `beginPhase()` registered only the steps the item advertised — and the run
 * totals were then derived by counting the rendered cards. Those two threes agreed only because
 * every item the API currently advertises happens to carry exactly `['exists','parses','validates']`.
 *
 * A two-step item is what breaks the tie: the third card would be painted by no frame and stay blue
 * for ever, and the totals badge would read one higher than the checks that can ever report.
 *
 * These specs doctor the *real* inventory rather than inventing one, so the rest of each page still
 * builds from what the API actually serves: only `temporale:roman` — an id both pages render under
 * the Roman rite, unconditionally — is rewritten to advertise two steps.
 */

/** The id rewritten to two steps, and the card class `idToCardClass()` gives it. */
const TWO_STEP_ID = 'temporale:roman';
const TWO_STEP_CLASS = 'temporale-roman';

const apiBase = (): string =>
    `${process.env.API_PROTOCOL || 'http'}://${process.env.API_HOST || 'localhost'}:${process.env.API_PORT || '8000'}`;

/**
 * Serve the API's own inventory with {@link TWO_STEP_ID} cut down to `exists` + `validates`.
 *
 * Deliberately *not* the first two steps: dropping the middle one proves the scaffold is reading the
 * list rather than merely truncating a fixed three.
 */
const serveTwoStepInventory = async (page: Page, request: APIRequestContext): Promise<void> => {
    const response = await request.get(`${apiBase()}/validations`);
    expect(response.ok()).toBe(true);
    const { litcal_validations } = await response.json() as { litcal_validations: { id: string; steps: string[] }[] };
    expect(litcal_validations.some((item) => item.id === TWO_STEP_ID)).toBe(true);

    const doctored = litcal_validations.map((item) =>
        item.id === TWO_STEP_ID ? { ...item, steps: ['exists', 'validates'] } : item);

    await page.route('**/validations', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ litcal_validations: doctored }),
        }));
};

/** Every check card the source-data scaffold rendered, whichever step families it used. */
const sourceCards = (page: Page) =>
    page.locator('.sourcedata-tests .step-exists, .sourcedata-tests .step-parses, .sourcedata-tests .step-validates');

const assertTwoStepScaffold = async (page: Page): Promise<void> => {
    await expect(page.locator(`.sourcedata-tests .${TWO_STEP_CLASS}.step-exists`)).toHaveCount(1);
    await expect(page.locator(`.sourcedata-tests .${TWO_STEP_CLASS}.step-validates`)).toHaveCount(1);
    // The card that would have been drawn for a step this item never reports.
    await expect(page.locator(`.sourcedata-tests .${TWO_STEP_CLASS}.step-parses`)).toHaveCount(0);
    // And nothing else was rendered for it either — two cards, not three with one hidden.
    await expect(page.locator(`.sourcedata-tests .${TWO_STEP_CLASS}`)).toHaveCount(2);

    // The badge must describe the cards actually on the page, not a card-count-per-check constant.
    const rendered = await sourceCards(page).count();
    await expect(page.locator('#totalSourceDataTestsCount')).toHaveText(String(rendered));
};

test('the Resources source scaffold renders only the steps the inventory advertises', async ({ page, request }) => {
    await serveTwoStepInventory(page, request);
    // The run button is gated on a live connection; nothing here starts a run, so it never replies.
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');
    await expect(page.locator('#startTestRunnerBtn')).toBeEnabled({ timeout: 20000 });

    await assertTwoStepScaffold(page);
});

test('the Calendars source scaffold renders only the steps the inventory advertises', async ({ page, request }) => {
    await serveTwoStepInventory(page, request);
    // The run button is gated on a live connection; nothing here starts a run, so it never replies.
    await installReplyingWebSocketStub(page);
    await page.goto('/index.php');
    await expect(page.locator('#startTestRunnerBtn')).toBeEnabled({ timeout: 20000 });

    await assertTwoStepScaffold(page);

    // The calendar-data scaffold is not inventory-driven — its checks are built locally and
    // advertise no steps — so it keeps the same three-card shape, from the shared fallback both the
    // scaffold and `beginPhase()` now read.
    const years = await page.locator('.calendardata-tests .step-exists').count();
    expect(years).toBeGreaterThan(0);
    await expect(page.locator('.calendardata-tests .step-parses')).toHaveCount(years);
    await expect(page.locator('.calendardata-tests .step-validates')).toHaveCount(years);
    await expect(page.locator('#totalCalendarDataTestsCount')).toHaveText(String(years * 3));
});
