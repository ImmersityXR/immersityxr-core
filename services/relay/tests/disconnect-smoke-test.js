// Standalone smoke test for client cleanup on disconnect (/sync namespace).
//
// Run with: node tests/disconnect-smoke-test.js
//
// Guards against the ghost-avatar bug: a client whose connection died
// abruptly (closed tab, lost network - the server sees "transport close")
// used to stay in session.clients forever and was handed to every later
// joiner in the state catch-up. Drives the scenario with real
// socket.io-client connections:
//   - A and B join; A's transport dies without a leave message
//   - B must be told A left, and B's state catch-up must not list A
//   - a late joiner C must see only live clients
//   - an explicit leave still removes the client and acks the leaver
//   - when the last client drops, the session is cleaned up
//
// Starts a relay on port 3995 with its own temporary config.js (refuses to
// run if one already exists, same pattern as the other smoke tests).
// Requires socket.io-client (npm install --no-save socket.io-client@2).

/* jshint esversion: 8 */

const path = require('path');
const fs = require('fs');

const configPath = path.resolve(__dirname, '..', 'config.js');

if (fs.existsSync(configPath)) {
    console.error('config.js already exists - refusing to overwrite it.');
    console.error('Run this test in a checkout without a config.js (it provides its own).');
    process.exit(2);
}

fs.writeFileSync(configPath, `module.exports = {
    db: { user: '', host: '', database: '', password: '', port: '', ssl: { rejectUnauthorized: false } },
    cors: { origins: '*:*' },
    auth: { clientSecret: '', adminSecret: '' },
    rtc: { iceServers: [] },
    azure: { subscriptionKey: '', serviceRegion: '' },
    capture: { path: './captures/' },
    persistence: { enabled: false, path: './sessions/', snapshotIntervalMs: 60000, ttlHours: 168 }
};
`);

const removeTempConfig = () => {
    try { fs.unlinkSync(configPath); } catch (e) { /* already removed */ }
};

process.on('exit', removeTempConfig);
process.on('SIGINT', () => process.exit(130));

const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server, { origins: '*:*' });
const winston = require('winston');
const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'error' })] });

const syncServer = require(path.resolve(__dirname, '..', 'sync.js'));

const fakeNamespace = { on: () => {}, use: () => {}, to: () => ({ emit: () => {} }), sockets: {} };

syncServer.init(io, null, logger, fakeNamespace, fakeNamespace);

const ioc = require('socket.io-client');

const URL = 'http://localhost:3995/sync';

const SESSION = 4242;

// New sockets sit in the repair center for 2s before their messages are
// processed, so we idle past that threshold after joining.
const REPAIR_WAIT_MS = 2300;

const results = {};

const pass = (name, ok) => { results[name] = ok ? 'PASS' : 'FAIL'; };

const wait = ms => new Promise(res => setTimeout(res, ms));

function connect () {
    return ioc(URL, { reconnection: false, timeout: 2000, forceNew: true });
}

// Request a version-2 state catch-up and resolve with its payload (or null
// on timeout), exactly as the Unity client does right after joining.
function requestState (socket, clientId) {
    return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 3000);

        socket.once('state', (state) => { clearTimeout(timer); resolve(state); });

        socket.emit('state', { version: 2, session_id: SESSION, client_id: clientId });
    });
}

const clientsOf = state => (state && state.clients) || [];

server.listen(3995, async () => {
    // ----------------------------------------------------------------
    // 1. A and B join; A's transport dies abruptly
    // ----------------------------------------------------------------
    const a = connect();
    const b = connect();

    const leftSeenByB = [];
    b.on('left', (clientId) => { leftSeenByB.push(clientId); });

    a.emit('join', [SESSION, 1]);
    b.emit('join', [SESSION, 2]);

    await wait(REPAIR_WAIT_MS);

    // Close the engine without a namespace disconnect packet: the server
    // sees reason "transport close", as for a closed tab or dropped wifi.
    a.io.engine.close();

    await wait(1500);

    const stateB = await requestState(b, 2);

    pass('abrupt disconnect: survivor receives state catch-up', stateB !== null);
    pass('abrupt disconnect: dead client removed from session clients', !clientsOf(stateB).includes(1));
    pass('abrupt disconnect: survivor still in session', clientsOf(stateB).includes(2));
    pass('abrupt disconnect: survivor notified via left', leftSeenByB.includes(1));

    // ----------------------------------------------------------------
    // 2. Late joiner C must see only live clients
    // ----------------------------------------------------------------
    const c = connect();

    c.emit('join', [SESSION, 3]);

    await wait(REPAIR_WAIT_MS);

    const stateC = await requestState(c, 3);

    pass('late joiner: no ghost client in catch-up', stateC !== null && !clientsOf(stateC).includes(1));
    pass('late joiner: live clients present', clientsOf(stateC).includes(2) && clientsOf(stateC).includes(3));

    // ----------------------------------------------------------------
    // 3. Explicit leave still removes the client and acks the leaver
    // ----------------------------------------------------------------
    const bLeftAck = new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 3000);

        b.once('successfullyLeft', () => { clearTimeout(timer); resolve(true); });
    });

    const leftSeenByC = [];
    c.on('left', (clientId) => { leftSeenByC.push(clientId); });

    b.emit('leave', [SESSION, 2]);

    pass('explicit leave: leaver acked with successfullyLeft', await bLeftAck);

    await wait(500);

    const stateC2 = await requestState(c, 3);

    pass('explicit leave: client removed from session clients', stateC2 !== null && !clientsOf(stateC2).includes(2));
    pass('explicit leave: remaining client notified via left', leftSeenByC.includes(2));

    // ----------------------------------------------------------------
    // 4. Last client drops abruptly: session is cleaned up
    // ----------------------------------------------------------------
    c.io.engine.close();

    await wait(1500);

    pass('session cleaned up after last client disconnects', syncServer.getSessions().size === 0);

    console.log(JSON.stringify(results, null, 2));

    b.close();
    server.close();

    process.exit(Object.values(results).every(v => v === 'PASS') ? 0 : 1);
});
