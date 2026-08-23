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
 */
export const installReplyingWebSocketStub = async (
    page: Page,
    options: { protocol?: number | null; omitComplete?: boolean; stopAfterStep?: string | null } = {}
): Promise<void> => {
    const protocol = options.protocol === undefined ? 1 : options.protocol;
    const omitComplete = options.omitComplete ?? false;
    const stopAfterStep = options.stopAfterStep ?? null;

    await page.addInitScript(
        ({ protocol, omitComplete, stopAfterStep }) => {
            const sent: string[] = [];
            (window as unknown as { __wsSent: string[] }).__wsSent = sent;

            const STEP_CLASS: Record<string, string> = {
                exists: 'file-exists',
                parses: 'json-valid',
                validates: 'schema-valid',
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
                                    responseFormats: ['JSON', 'XML', 'ICS', 'YML'],
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

                send(data: string): void {
                    sent.push(data);
                    let message: Record<string, unknown>;
                    try {
                        message = JSON.parse(data);
                    } catch {
                        return;
                    }
                    const CHECK_ACTIONS = ['executeValidation', 'validateSource', 'validateCalendar'];
                    const TEST_ACTIONS = ['runTest', 'executeUnitTest'];
                    if (!CHECK_ACTIONS.includes(message.action as string) && !TEST_ACTIONS.includes(message.action as string)) {
                        return;
                    }
                    const isTestRun = TEST_ACTIONS.includes(message.action as string);
                    const allSteps = (isTestRun ? ['validates'] : ['exists', 'parses', 'validates']) as string[];
                    const stepClassFor = (step: string): string => (isTestRun ? 'test-valid' : STEP_CLASS[step]);
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
        { protocol, omitComplete, stopAfterStep }
    );
};
