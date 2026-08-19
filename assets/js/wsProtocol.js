/**
 * Shared helpers for the Health WebSocket protocol.
 *
 * `index.js` and `resources.js` are two independent implementations of the same protocol and have already
 * drifted apart in ways that cost debugging sessions — different state names, different runToken guards,
 * two vocabularies for the same file (see #42). New protocol behaviour lands here so both runners share one
 * definition rather than acquiring a fourth thing to keep in lockstep.
 * @module wsProtocol
 */

/**
 * Tell the server a run is abandoned, so it stops draining a backlog nobody is watching.
 *
 * Silent on the wire: the server acknowledges by dropping the run's queued requests and sends nothing back
 * (LiturgicalCalendarAPI#806 section H).
 *
 * Call this *before* clearing the run token — the cancel has to name the run it is stopping, and the server
 * ignores a cancel that names a run the connection is no longer on.
 *
 * @param {WebSocket} conn - The connection the run was started on.
 * @param {?string} runToken - The run being abandoned; the same token its requests carried.
 * @returns {boolean} true when a cancel was sent, false when there was nothing to send it on or about.
 */
export const sendCancelRun = ( conn, runToken ) => {
    if ( !conn || conn.readyState !== WebSocket.OPEN ) {
        return false;
    }
    if ( typeof runToken !== 'string' || runToken === '' ) {
        return false;
    }
    conn.send( JSON.stringify( { action: 'cancelRun', runToken } ) );
    return true;
};
