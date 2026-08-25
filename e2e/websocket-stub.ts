import { Page } from '@playwright/test';

/**
 * Replaces `window.WebSocket` with a recorder that reports itself open and never replies.
 *
 * Both runners drive themselves from `conn.onmessage` — the next request is only sent once the previous
 * response has been handled — so a stub that never answers parks a started run after its first outbound
 * frame. That is exactly the state the stop button exists for, and it is reachable without a WebSocket
 * server, which `playwright.config.ts` does not start.
 *
 * Every outbound frame is recorded on `window.__wsSent` for assertions.
 *
 * Must be installed before navigation: the runners construct their WebSocket at module scope.
 */
export const installWebSocketStub = async (page: Page): Promise<void> => {
    await page.addInitScript(() => {
        const sent: string[] = [];
        (window as unknown as { __wsSent: string[] }).__wsSent = sent;

        class StubWebSocket {
            static readonly CONNECTING = 0;
            static readonly OPEN = 1;
            static readonly CLOSING = 2;
            static readonly CLOSED = 3;

            readonly CONNECTING = 0;
            readonly OPEN = 1;
            readonly CLOSING = 2;
            readonly CLOSED = 3;

            readyState = 0;
            onopen: ((event: unknown) => void) | null = null;
            onmessage: ((event: unknown) => void) | null = null;
            onclose: ((event: unknown) => void) | null = null;
            onerror: ((event: unknown) => void) | null = null;

            constructor(public readonly url: string) {
                // `onopen` is assigned after the constructor returns, so open on the next tick.
                setTimeout(() => {
                    this.readyState = 1;
                    this.onopen?.({});
                }, 0);
            }

            send(data: string): void {
                sent.push(data);
            }

            close(): void {
                this.readyState = 3;
            }

            addEventListener(): void {}

            removeEventListener(): void {}
        }

        (window as unknown as { WebSocket: unknown }).WebSocket = StubWebSocket;
    });
};

/** Every frame the page has sent, oldest first. */
export const sentFrames = (page: Page): Promise<string[]> =>
    page.evaluate(() => (window as unknown as { __wsSent: string[] }).__wsSent ?? []);

/**
 * A stub that answers, so a whole run can be driven without a WebSocket server.
 *
 * `installWebSocketStub()` never replies, which parks a run after its first frame — the state the
 * stop button exists for. This one plays the server's side of the structured contract instead:
 * a `hello` on connect, then for each `executeValidation` the three step frames and the terminal
 * `complete` frame, echoing back the `runToken` and `requestId` the page sent.
 *
 * **The `classes` selector it sends is deliberately wrong.** Every frame is addressed at
 * `.stub-addresses-nothing.<step-class>`, which matches no card on the page. A run that paints its
 * cards anyway is proof the page is attributing frames by `requestId` rather than by executing a
 * selector the server composed — which is the whole of #42 item 2, and cannot be demonstrated by a
 * stub that sends a *correct* selector, since then both mechanisms would agree.
 *
 * @param page - The page to install into; must be called before navigation.
 * @param options.protocol - The protocol version the `hello` frame advertises, or null to send no
 *   hello at all, standing in for a server that predates the handshake.
 * @param options.omitComplete - Answer without the terminal frame, standing in for the server hole
 *   at LiturgicalCalendarAPI#823: the work succeeded, every card is painted, and only the ending is
 *   missing.
 * @param options.stopAfterStep - Answer only up to this step, and send no terminal frame — a request
 *   that died partway, leaving its remaining cards grey. The other way a request goes outstanding,
 *   and the one that has to be counted.
 * @param options.rejectActions - Answer these `action`s with a single `protocolError` frame instead of
 *   step frames, echoing back the `runToken` and `requestId` the message carried — what the server does
 *   for a message it cannot act on at all (`Health::rejectMessage()`). A rejection is the whole answer
 *   to that request: no step frames and no terminal `complete` frame follow it, so a page that does not
 *   read it leaves the request outstanding until the silence watchdog gives up sixty seconds later (#70).
 * @param options.answerOnly - Restrict the set of `action`s this stub replies to; any other action is
 *   received (and recorded in `__wsSent`) but never gets a response, parking the run at that request —
 *   the same "never replies" state `installWebSocketStub()` produces, but for only part of the protocol.
 *   Defaults to every action the `hello` frame advertises, i.e. current behaviour, so existing callers
 *   are unaffected.
 */
/**
 * Serve an inventory in which every item advertises exactly the three steps this stub answers with.
 *
 * The stub plays the server's side of the WebSocket, but the page still fetches `/validations` over
 * HTTP, and those two have to agree: the scaffold renders one card per advertised step and the runner
 * waits for one frame per card. Once the real inventory began advertising a fourth step (`covers`) for
 * folder items, a stub that always answered three left those cards unpainted — a failure about the
 * stub's fidelity, not about the behaviour under test.
 *
 * Normalising rather than teaching the stub to answer `covers` keeps it honest in the other direction
 * too: a stub that always sent four frames would over-deliver for the file items that legitimately
 * have three.
 *
 * Installed by {@link installReplyingWebSocketStub} for every stub test, because almost all of them
 * assert on painted cards or on totals and so need the frames and the scaffold to agree.
 *
 * **Ordering matters.** Playwright gives the *last* registered route handler precedence, so a test that
 * serves its own `/validations` — an empty inventory, or an item doctored to two steps — must register
 * it **after** calling {@link installReplyingWebSocketStub}, or this one silently overrides it.
 */
export const serveThreeStepInventory = async (page: Page): Promise<void> => {
    await page.route('**/validations', async (route) => {
        // This handler proxies upstream, so it is asynchronous and can still be awaiting the API
        // when the test ends. Playwright then tears the context down underneath it and reports
        // `route.fetch: Target page, context or browser has been closed` as a failure of whichever
        // test happened to be last — a flake with nothing to do with what that test asserts.
        //
        // The race is latent rather than new: it needs the upstream fetch to be slow enough to
        // outlive the test, so it only shows up when the API is under load (a bigger suite, or a
        // rate-limited API answering slowly). Left alone it surfaces as an occasional red in an
        // unrelated spec, which is the least actionable kind of failure this suite can produce.
        //
        // A page that has gone away is not a failure to report, so bail quietly. Anything else
        // still throws: this must not become a blanket catch that hides a genuinely broken stub.
        let response;
        try {
            response = await route.fetch();
        } catch (err) {
            if (page.isClosed() || /closed/i.test(String(err))) {
                return;
            }
            throw err;
        }
        const body = await response.json() as { litcal_validations?: { steps: string[] }[] };
        const items = (body.litcal_validations ?? []).map(
            (item) => ({ ...item, steps: ['exists', 'parses', 'validates'] })
        );
        try {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ ...body, litcal_validations: items }),
            });
        } catch (err) {
            if (page.isClosed() || /closed/i.test(String(err))) {
                return;
            }
            throw err;
        }
    });
};

export const installReplyingWebSocketStub = async (
    page: Page,
    options: {
        protocol?: number | null;
        omitComplete?: boolean;
        stopAfterStep?: string | null;
        answerOnly?: string[] | null;
        rejectActions?: string[] | null;
        responseFormats?: Record<string, string[]>;
    } = {}
): Promise<void> => {
    await serveThreeStepInventory(page);
    const protocol = options.protocol === undefined ? 1 : options.protocol;
    const omitComplete = options.omitComplete ?? false;
    const stopAfterStep = options.stopAfterStep ?? null;
    const answerOnly = options.answerOnly ?? null;
    const rejectActions = options.rejectActions ?? null;
    // Overridable so a spec can play a server that advertises nothing for an action — the
    // disagreement case the pages warn about rather than silently emptying their select.
    const responseFormats = options.responseFormats ?? {
        validateCalendar: ['JSON', 'XML', 'ICS', 'YML'],
        executeValidation: ['JSON', 'YML'],
    };

    await page.addInitScript(
        ({ protocol, omitComplete, stopAfterStep, answerOnly, rejectActions, responseFormats }) => {
            const sent: string[] = [];
            (window as unknown as { __wsSent: string[] }).__wsSent = sent;

            // Mirrors `STEP_CARD_CLASS` in `assets/js/wsProtocol.js` — address-shaped step names
            // (#60), not verdicts. Only the DEPRECATED `classes` projection is built from this; a
            // frame is attributed by `(requestId, step)`.
            const STEP_CLASS: Record<string, string> = {
                exists: 'step-exists',
                parses: 'step-parses',
                validates: 'step-validates',
            };

            class ReplyingWebSocket {
                static readonly CONNECTING = 0;
                static readonly OPEN = 1;
                static readonly CLOSING = 2;
                static readonly CLOSED = 3;

                readonly CONNECTING = 0;
                readonly OPEN = 1;
                readonly CLOSING = 2;
                readonly CLOSED = 3;

                readyState = 0;
                onopen: ((event: unknown) => void) | null = null;
                onmessage: ((event: { data: string }) => void) | null = null;
                onclose: ((event: unknown) => void) | null = null;
                onerror: ((event: unknown) => void) | null = null;

                constructor(public readonly url: string) {
                    // Published so a spec can play the server *after* the fact — a frame that
                    // arrives once the page has stopped waiting for it. See `deliverLateFrame()`.
                    (window as unknown as { __wsStub: unknown }).__wsStub = this;
                    setTimeout(() => {
                        this.readyState = 1;
                        this.onopen?.({});
                        if (null !== protocol) {
                            this.deliver({
                                type: 'hello',
                                protocol,
                                capabilities: {
                                    rites: ['roman', 'ambrosian'],
                                    actions: ['executeValidation', 'validateCalendar', 'executeUnitTest', 'runTest', 'cancelRun', 'validateSource'],
                                    // Per-action since API#886, and the two lists genuinely differ:
                                    // /calendar serves all four, every route a resource check
                                    // addresses answers 406 to XML and ICS. A stub that advertised
                                    // one flat list could not exercise the difference the pages
                                    // now build their format select from.
                                    responseFormats,
                                    steps: ['exists', 'parses', 'validates', 'complete'],
                                    statuses: ['pass', 'fail'],
                                },
                            });
                        }
                    }, 0);
                }

                private deliver(frame: unknown): void {
                    setTimeout(() => this.onmessage?.({ data: JSON.stringify(frame) }), 0);
                }

                /** Deliver an arbitrary frame, for a spec driving the server's side directly. */
                pushFrame(frame: unknown): void {
                    this.deliver(frame);
                }

                /**
                 * Deliver a payload verbatim, without serialising it.
                 *
                 * `pushFrame()` cannot express this: it JSON-stringifies, so everything it sends is
                 * parseable by construction, and the client's parse-failure branch is unreachable
                 * through it.
                 */
                pushRaw(data: string): void {
                    setTimeout(() => this.onmessage?.({ data }), 0);
                }

                send(data: string): void {
                    sent.push(data);
                    let message: Record<string, unknown>;
                    try {
                        message = JSON.parse(data);
                    } catch {
                        return;
                    }
                    if (null !== rejectActions && rejectActions.includes(message.action as string)) {
                        // The whole answer to this request: `Health::rejectMessage()` refuses the
                        // message before it is interpreted, so no step frame and no terminal frame
                        // follow. The `requestId` is echoed, which is what makes the rejection
                        // attributable to the cards the request registered.
                        this.deliver({
                            type: 'protocolError',
                            errorCode: 'invalid_message',
                            text: 'stub rejects this message',
                            runToken: message.runToken,
                            requestId: message.requestId,
                        });
                        return;
                    }
                    const CHECK_ACTIONS = ['executeValidation', 'validateSource', 'validateCalendar'];
                    const TEST_ACTIONS = ['runTest', 'executeUnitTest'];
                    if (!CHECK_ACTIONS.includes(message.action as string) && !TEST_ACTIONS.includes(message.action as string)) {
                        return;
                    }
                    if (null !== answerOnly && !answerOnly.includes(message.action as string)) {
                        return;
                    }
                    const isTestRun = TEST_ACTIONS.includes(message.action as string);
                    const allSteps = (isTestRun ? ['validates'] : ['exists', 'parses', 'validates']) as string[];
                    const stepClassFor = (step: string): string => (isTestRun ? 'step-test-validates' : STEP_CLASS[step]);
                    const runToken = message.runToken;
                    const requestId = message.requestId;
                    // Mirrors `Health::frameTarget()`: the server never reads a client-sent `target`
                    // for a check or a test run — it synthesizes one from the fields the message
                    // already carries. A `runTest` message carries `test`/`calendar`/`year` at the top
                    // level (never a `target`), and `Health::sendTestResult()` builds
                    // `frameTarget($test, ['calendar' => ..., 'year' => ...])` from exactly those, so
                    // `target.id` is the test name. `validateSource` is the one action that *does* send
                    // its own `target` (`{ id: check.id }`), which is used as-is when present.
                    const target = message.target
                        ?? (isTestRun
                            ? { id: String(message.test ?? 'unknown'), calendar: message.calendar, year: message.year }
                            : { id: String(message.validate ?? 'unknown') });

                    const upTo = null === stopAfterStep
                        ? allSteps.length
                        : allSteps.indexOf(stopAfterStep as 'exists') + 1;

                    allSteps.slice(0, upTo).forEach((step) => {
                        this.deliver({
                            type: 'success',
                            text: `stub ${step}`,
                            classes: `.stub-addresses-nothing.${stepClassFor(step)}`,
                            target,
                            step,
                            status: 'pass',
                            runToken,
                            runId: runToken,
                            requestId,
                        });
                    });

                    if (false === omitComplete && null === stopAfterStep) {
                        this.deliver({
                            type: 'success',
                            text: 'All checks for this request are complete',
                            target,
                            step: 'complete',
                            runToken,
                            runId: runToken,
                            requestId,
                        });
                    }
                }

                close(): void {
                    this.readyState = 3;
                }

                addEventListener(): void {}

                removeEventListener(): void {}
            }

            (window as unknown as { WebSocket: unknown }).WebSocket = ReplyingWebSocket;
        },
        { protocol, omitComplete, stopAfterStep, answerOnly, rejectActions, responseFormats }
    );
};

/**
 * Deliver one frame from the stub as if the server had just sent it.
 *
 * For the frames a run does not ask for at a predictable moment — a straggler arriving after the
 * page has given up waiting for it (#64). The frame is delivered through the same `onmessage` path
 * every other frame takes, so nothing about how the page receives it is special-cased.
 */
export const deliverLateFrame = (page: Page, frame: Record<string, unknown>): Promise<void> =>
    page.evaluate((payload) => {
        const stub = (window as unknown as { __wsStub?: { pushFrame: (frame: unknown) => void } }).__wsStub;
        if (undefined === stub) {
            throw new Error('No stub WebSocket has been constructed on this page.');
        }
        stub.pushFrame(payload);
    }, frame);

/**
 * Deliver one payload from the stub exactly as given, without serialising it.
 *
 * For the frame no well-behaved server sends and every client has to survive: one that is not JSON
 * at all. The client's parse-failure branch is the only thing standing between a garbled frame and a
 * wedged run (#43), and it cannot be reached through `deliverLateFrame()`, which serialises.
 */
export const deliverRawFrame = (page: Page, data: string): Promise<void> =>
    page.evaluate((payload) => {
        const stub = (window as unknown as { __wsStub?: { pushRaw: (data: string) => void } }).__wsStub;
        if (undefined === stub) {
            throw new Error('No stub WebSocket has been constructed on this page.');
        }
        stub.pushRaw(payload);
    }, data);
