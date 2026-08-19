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
