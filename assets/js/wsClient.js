/**
 * The WebSocket *connection* shared by both test-runner pages — #69 item 2.
 *
 * #42 asked for one client owning "connection, `hello`/version negotiation, request/response
 * correlation by `requestId`, cancellation". {@link module:wsRunner} took the correlation,
 * cancellation and send-path halves; the `hello` read landed on both pages as #69 item 1. This
 * module is the half that was left: the socket's own lifecycle — URL composition, the duplicate
 * connection guard, the status badge, the reconnect timer, and the `resetHello()` that must happen
 * on every close.
 *
 * Before this, each page owned a `conn`, an `onopen`, an `onclose`, an `onerror` and a
 * `connectionAttempt` that were character-identical apart from one enum member name. That is not a
 * theoretical cost: the `onopen` mid-run guard of #66 had to be written twice, and the `resetHello()`
 * of #69 item 1 had to be written twice again.
 *
 * **What stays with the page.** `onmessage` is *not* handled here — the two pages genuinely differ
 * there, which is the whole of `wsRunner.js`'s reason to exist as a separate seam. Neither is the
 * page's state machine: `TestState` is a different enum on each page (`ReadyState` on `index.js`,
 * `Ready` on `resources.js`), and `ReadyToRunTests` is a different object. Those reach this module
 * as the `onOpen` / `onClose` callbacks rather than being pulled into it, so this module stays
 * ignorant of what a run is.
 *
 * @module wsClient
 */

import { safeToastShow } from './common.js';
import { resetHello } from './wsProtocol.js';

/** How long to wait before retrying a dropped or refused connection. */
const RECONNECT_DELAY_MS = 3000;

/**
 * Repaint the `#websocket-status` badge for one connection state.
 *
 * The badge carries exactly one `bg-*` class and its icon exactly one `fa-plug*` glyph, so every
 * repaint has to remove the other three of each. Doing that inline at four call sites across two
 * files is how the two pages' copies stayed identical only by luck; naming the four states once
 * makes a fifth state a one-line addition instead of an eight-site edit.
 *
 * @param {'connected'|'closed'|'error'} state
 * @returns {void}
 */
const paintStatusBadge = ( state ) => {
    const background = {
        connected: 'bg-success',
        closed: 'bg-warning',
        error: 'bg-danger'
    }[ state ];
    const glyph = {
        connected: 'fa-plug-circle-check',
        closed: 'fa-plug-circle-xmark',
        error: 'fa-plug-circle-exclamation'
    }[ state ];

    const wsStatus = document.querySelector( '#websocket-status' );
    if ( null === wsStatus ) {
        return;
    }
    wsStatus.classList.remove( 'bg-secondary', 'bg-warning', 'bg-danger', 'bg-success' );
    wsStatus.classList.add( background );
    const wsSvg = wsStatus.querySelector( 'svg' );
    if ( null === wsSvg ) {
        return;
    }
    wsSvg.classList.remove( 'fa-plug', 'fa-plug-circle-check', 'fa-plug-circle-xmark', 'fa-plug-circle-exclamation' );
    wsSvg.classList.add( glyph );
};

/**
 * Stop every spinner on the page.
 *
 * A socket that closed or errored mid-run leaves the run's spinners turning forever, which reads as
 * "still working" when nothing is. Both pages did this at both failure sites already.
 *
 * @returns {void}
 */
const stopSpinners = () => {
    document.querySelectorAll( '.fa-spin' ).forEach( el => el.classList.remove( 'fa-spin' ) );
};

/**
 * Compose the WebSocket URL from the page config PHP published in `layout/footer.php`.
 *
 * The default ports are elided rather than spelled out, because `wss://host:443` and `ws://host:80`
 * are the same origin as the bare form to a server but not to every proxy in between.
 *
 * @param {{WS_PROTOCOL: string, WS_HOST: string, WS_PORT: number}} config
 * @returns {string}
 */
const composeWebSocketUrl = ( { WS_PROTOCOL, WS_HOST, WS_PORT } ) =>
    `${WS_PROTOCOL}://${WS_HOST}${[ 443, 80 ].includes( WS_PORT ) ? '' : `:${WS_PORT}`}`;

/**
 * Build one page's WebSocket connection, with reconnection and status reporting.
 *
 * @param {object} options
 * @param {function(MessageEvent): void} options.onMessage - the page's own frame handler; this
 *   module never inspects a frame beyond the `resetHello()` bookkeeping on close.
 * @param {function(): void} options.onOpen - called once the socket is open and the reconnect timer
 *   has been cleared, for the page to settle its own state machine and enable its Start button.
 * @param {function(): void} options.onClose - called on every close, before the reconnect is
 *   scheduled, for the page to mark its socket unready.
 * @returns {{connect: function(): void, socket: function(): (WebSocket|undefined)}}
 */
export const createWebSocketClient = ( { onMessage, onOpen, onClose } ) => {
    /** @type {WebSocket|undefined} */
    let conn;
    /** @type {?number} The retry timer, non-null only while a reconnect is pending. */
    let connectionAttempt = null;

    const connect = () => {
        // Guard against creating multiple connections
        if ( conn && ( conn.readyState === WebSocket.OPEN || conn.readyState === WebSocket.CONNECTING ) ) {
            console.log( 'WebSocket connection already exists, skipping new connection' );
            return;
        }

        const config = window.LitCalConfig;
        console.log( `Connecting to websocket... WS_PROTOCOL: ${config.WS_PROTOCOL}, WS_HOST: ${config.WS_HOST}, WS_PORT: ${config.WS_PORT}` );
        conn = new WebSocket( composeWebSocketUrl( config ) );

        conn.onopen = () => {
            console.log( 'Websocket connection established!' );
            safeToastShow( '#websocket-connected' );
            paintStatusBadge( 'connected' );
            if ( connectionAttempt !== null ) {
                clearInterval( connectionAttempt );
                connectionAttempt = null;
            }
            onOpen();
        };

        conn.onmessage = onMessage;

        conn.onclose = () => {
            console.log( 'Connection closed on remote end' );
            // Forget what this connection advertised. The reconnection below may reach a server of a
            // different vintage — a deploy is exactly when a socket drops — and answering it with the
            // previous one's capabilities would declare a protocol it never claimed to read.
            resetHello();
            onClose();
            // Only when no retry is already pending: a close that arrives while the error handler's
            // interval is already retrying is the same outage, and would otherwise queue a second
            // reconnect and double the retry rate for as long as the server stays down.
            if ( connectionAttempt === null ) {
                paintStatusBadge( 'closed' );
                safeToastShow( '#websocket-closed' );
                stopSpinners();
                setTimeout( connect, RECONNECT_DELAY_MS );
            }
        };

        conn.onerror = ( e ) => {
            paintStatusBadge( 'error' );
            console.error( 'Websocket connection error:' );
            console.log( e );
            safeToastShow( '#websocket-error' );
            stopSpinners();
            if ( connectionAttempt === null ) {
                connectionAttempt = setInterval( connect, RECONNECT_DELAY_MS );
            }
        };
    };

    return {
        connect,

        /**
         * The live socket, or `undefined` before the first {@link connect}.
         *
         * Handed out rather than wrapped, because both `wsRunner.js`'s send path and
         * `sendCancelRun()` already take a `WebSocket` and the pages read `readyState` directly to
         * decide whether a run can start.
         *
         * @returns {WebSocket|undefined}
         */
        socket: () => conn
    };
};
