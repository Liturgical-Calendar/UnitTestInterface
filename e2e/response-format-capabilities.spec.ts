import { test, expect, Page } from '@playwright/test';
import { installReplyingWebSocketStub } from './websocket-stub';

/**
 * The response-format select is built from what the server advertises, not from a list in this repo.
 *
 * Both pages used to ship the list as literal `<option>` markup — four on `index.php`, two on
 * `resources.php`. That is the same hand-maintained mirror of the API's truth that `UNIVERSAL_CHECKS`
 * was before #42, and that one went stale three times (#38, API#795, API#800). Since API#886 the
 * server states it per action in the `hello` frame, and each page knows which action it sends.
 *
 * Being unusable before `hello` costs nothing, which is what makes building it (rather than
 * reconciling it against server-rendered markup) the right shape: `ReadyToRunTests.check()` gates the
 * run on `SocketReady`, so a page with no socket cannot start a run for this control to serve.
 */

const formatOptions = async (page: Page): Promise<string[]> =>
    page.locator('#APIResponseSelect option').evaluateAll(
        (opts) => opts.map((o) => (o as HTMLOptionElement).value)
    );

test('index.php offers the four formats /calendar serves', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/');
    // Polled, not read once: the list arrives with `hello`, after the markup has rendered.
    await expect.poll(() => formatOptions(page)).toEqual(['JSON', 'XML', 'ICS', 'YML']);
});

test('resources.php offers only the two every resource path serves', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');
    await expect.poll(() => formatOptions(page)).toEqual(['JSON', 'YML']);

    // The point of the per-action advertisement: XML and ICS are valid on validateCalendar and would
    // 406 on every route this page checks, so offering them here would be offering a guaranteed fail.
    const options = await formatOptions(page);
    expect(options).not.toContain('XML');
    expect(options).not.toContain('ICS');
});

test('YML is labelled YAML, the one presentational fact the advertisement does not carry', async ({ page }) => {
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');
    await expect.poll(
        () => page.locator('#APIResponseSelect option[value="YML"]').textContent()
    ).toBe('YAML');
});

test('before hello, and without a socket, JSON is still selectable', async ({ page }) => {
    // The floor. `resyncLiveStateFromDom()` reads this select back when a stored run is closed, so an
    // empty value would become `currentResponseType` and be sent as the response format. A page whose
    // socket never opens must therefore still have a valid one selected.
    await page.route('**/*', (route) => route.continue());
    await page.goto('/resources.php');
    await expect(page.locator('#APIResponseSelect')).toHaveValue('JSON');
    expect(await formatOptions(page)).toContain('JSON');
});

test('a selection the server stops offering falls back rather than persisting', async ({ page }) => {
    // Select ICS on index.php (advertised there), then reload as resources.php, whose action
    // advertises neither ICS nor XML. The select must not keep a format every check would fail on.
    await installReplyingWebSocketStub(page);
    await page.goto('/');
    await expect.poll(() => formatOptions(page)).toContain('ICS');
    await page.selectOption('#APIResponseSelect', 'ICS');
    await expect(page.locator('#APIResponseSelect')).toHaveValue('ICS');

    await page.goto('/resources.php');
    await expect.poll(() => formatOptions(page)).toEqual(['JSON', 'YML']);
    await expect(page.locator('#APIResponseSelect')).toHaveValue('JSON');
});

test('a run sends the format the advertisement left selected', async ({ page }) => {
    // The whole chain, end to end: advertisement -> select -> currentResponseType -> the wire.
    await installReplyingWebSocketStub(page);
    await page.goto('/resources.php');
    await expect.poll(() => formatOptions(page)).toEqual(['JSON', 'YML']);
    await page.selectOption('#APIResponseSelect', 'YML');

    const startBtn = page.locator('#startTestRunnerBtn');
    await expect(startBtn).toBeEnabled({ timeout: 20000 });
    await startBtn.click();
    await expect(page.locator('#startTestRunnerBtnLbl')).toHaveText('Tests Complete', { timeout: 30000 });

    const sent = (await page.evaluate(() => (window as unknown as { __wsSent: string[] }).__wsSent ?? []))
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
        .filter((m) => m.action === 'executeValidation');
    expect(sent.length).toBeGreaterThan(0);
    for (const message of sent) {
        expect(message.responseFormat).toBe('YML');
    }
});

test('a server advertising nothing for this action keeps the floor and says so', async ({ page }) => {
    // The disagreement case. An action this page sends that the server advertises no formats for is
    // a real contradiction, said out loud the same way an unadvertised inventory id is — and the
    // floor stands rather than the select being emptied.
    const warnings: string[] = [];
    page.on('console', (m) => { if (m.type() === 'warning') { warnings.push(m.text()); } });

    await installReplyingWebSocketStub(page, { responseFormats: {} });
    await page.goto('/resources.php');

    await expect.poll(() => warnings.filter((t) => t.includes('advertises no response formats'))).not.toEqual([]);
    await expect(page.locator('#APIResponseSelect')).toHaveValue('JSON');
});
