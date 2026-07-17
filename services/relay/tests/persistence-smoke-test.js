// Standalone smoke test for session-state persistence and stroke replay.
//
// Run with: node tests/persistence-smoke-test.js
//
// Drives the full late-join / restart story with real socket.io clients:
//   - client A joins, draws strokes, deletes one, and moves an entity
//   - client B joins late, requests state catch-up, and must receive the
//     surviving stroke (replayed through the normal message relay) and the
//     entity state - without having been connected when they happened
//   - all clients leave (session cleaned up), the in-memory session map is
//     wiped to simulate a relay restart, and client C joins fresh: state
//     must be restored from the disk snapshot, strokes and all
//   - expired snapshots (past TTL) must be removed, not restored
//
// Writes only to a temporary directory; does not touch config.js (provides
// its own, same pattern as the other smoke tests).

/* jshint esversion: 8 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'immersity-persist-test-'));

const configPath = path.resolve(__dirname, '..', 'config.js');

if (fs.existsSync(configPath)) {
    console.error('config.js already exists - refusing to overwrite it.');
    console.error('Run this test in a checkout without a config.js (it provides its own).');
    process.exit(2);
}

const relRoot = path.relative(path.resolve(__dirname, '..'), tmpRoot);

fs.writeFileSync(configPath, `module.exports = {
    db: { user: '', host: '', database: '', password: '', port: '', ssl: { rejectUnauthorized: false } },
    cors: { origins: '*:*' },
    auth: { clientSecret: '', adminSecret: '' },
    rtc: { iceServers: [] },
    azure: { subscriptionKey: '', serviceRegion: '' },
    capture: { path: ${JSON.stringify(path.join(relRoot, 'captures'))} },
    persistence: { enabled: true, path: ${JSON.stringify(path.join(relRoot, 'sessions'))}, snapshotIntervalMs: 200, ttlHours: 168 },
};
`);

const cleanup = () => {
    try { fs.unlinkSync(configPath); } catch (e) { /* already removed */ }
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) { /* best effort */ }
};

process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });
const winston = require('winston');
const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'error' })] });

const syncServer = require(path.resolve(__dirname, '..', 'sync.js'));

const fakeNamespace = { on: () => {}, use: () => {}, to: () => ({ emit: () => {} }), sockets: {} };

syncServer.init(io, null, logger, fakeNamespace, fakeNamespace);

const ioc = require('socket.io-client');

const URL = 'http://localhost:3996/sync';

const SESSION = 777;

const results = {};

const pass = (name, ok) => { results[name] = ok ? 'PASS' : 'FAIL'; };

const wait = ms => new Promise(res => setTimeout(res, ms));

function connect () {
    return ioc(URL, { reconnection: false, timeout: 2000, forceNew: true });
}

function drawPacket (clientId, strokeId, strokeType, x) {
    return {
        session_id: SESSION,
        client_id: clientId,
        type: 'draw',
        ts: Date.now(),
        // the Unity client serializes the Draw struct to a JSON string
        // (KomodoMessage); the relay parses it server-side
        message: JSON.stringify({
            clientId: clientId,
            strokeId: strokeId,
            strokeType: strokeType,
            lineWidth: 0.01,
            curStrokePos: { x: x, y: 1, z: 0 },
            curColor: { x: 1, y: 0, z: 0, w: 1 }
        })
    };
}

// New sockets sit in the repair center for 2s before their messages are
// processed, so we idle past that threshold before sending.
const REPAIR_WAIT_MS = 2300;

server.listen(3996, async () => {
    // ----------------------------------------------------------------
    // 1. Client A joins, draws, deletes a stroke, moves an entity
    // ----------------------------------------------------------------
    const a = connect();

    a.emit('join', [SESSION, 1]);

    await wait(REPAIR_WAIT_MS);

    // stroke 5001: three segments + end (survives)
    a.emit('message', drawPacket(1, 5001, 10, 0.1));
    a.emit('message', drawPacket(1, 5001, 10, 0.2));
    a.emit('message', drawPacket(1, 5001, 10, 0.3));
    a.emit('message', drawPacket(1, 5001, 11, 0.3));

    // stroke 5002: drawn then deleted (must NOT be replayed)
    a.emit('message', drawPacket(1, 5002, 10, 0.5));
    a.emit('message', drawPacket(1, 5002, 11, 0.6));
    a.emit('message', drawPacket(1, 5002, 12, 0));

    // entity 9001 moved (90fps-style update packet: [seq, session, client, entity, type=3, ...])
    a.emit('update', [0, SESSION, 1, 9001, 3, 0.5, 1.5, 2.5]);

    await wait(400);

    const session = syncServer.sessions.get(SESSION);

    pass('stroke stored in session state, deleted stroke removed',
        session && session.strokes && session.strokes['5001']
        && session.strokes['5001'].packets.length === 4
        && session.strokes['5002'] === undefined);

    // ----------------------------------------------------------------
    // 2. Client B joins late and requests state catch-up
    // ----------------------------------------------------------------
    const b = connect();

    const bMessages = [];

    let bState = null;

    b.on('message', m => bMessages.push(m));

    b.on('state', s => bState = s);

    b.emit('join', [SESSION, 2]);

    await wait(300);

    b.emit('state', { version: 2, session_id: SESSION, client_id: 2 });

    await wait(500);

    const bStroke5001 = bMessages.filter(m => m.type === 'draw' && m.message.strokeId === 5001);

    const bStroke5002 = bMessages.filter(m => m.type === 'draw' && m.message.strokeId === 5002);

    pass('late joiner receives surviving stroke via replay',
        bStroke5001.length === 4 && bStroke5001[3].message.strokeType === 11);

    pass('late joiner does not receive deleted stroke', bStroke5002.length === 0);

    pass('late joiner receives entity state in catch-up',
        bState && bState.entities && bState.entities.some(e => e.id === 9001));

    // ----------------------------------------------------------------
    // 3. Snapshot written; simulated relay restart; client C restores
    // ----------------------------------------------------------------
    await wait(500); // > snapshotIntervalMs

    const snapshotPath = path.join(tmpRoot, 'sessions', String(SESSION), 'state.json');

    pass('snapshot written to disk while session live', fs.existsSync(snapshotPath));

    a.close();
    b.close();

    await wait(500); // session cleanup (final snapshot) runs on disconnect

    syncServer.sessions.clear(); // simulate a relay restart (memory wiped)

    const c = connect();

    const cMessages = [];

    let cState = null;

    c.on('message', m => cMessages.push(m));

    c.on('state', s => cState = s);

    c.emit('join', [SESSION, 3]); // join recreates the session -> restores snapshot

    await wait(300);

    c.emit('state', { version: 2, session_id: SESSION, client_id: 3 });

    await wait(500);

    const cStroke5001 = cMessages.filter(m => m.type === 'draw' && m.message.strokeId === 5001);

    pass('after restart: strokes restored from snapshot and replayed',
        cStroke5001.length === 4);

    pass('after restart: entity state restored from snapshot',
        cState && cState.entities && cState.entities.some(e => e.id === 9001));

    c.close();

    // ----------------------------------------------------------------
    // 4. Expired snapshots are purged, not restored
    // ----------------------------------------------------------------
    const oldDir = path.join(tmpRoot, 'sessions', '999');

    fs.mkdirSync(oldDir, { recursive: true });

    fs.writeFileSync(path.join(oldDir, 'state.json'), JSON.stringify({
        version: 1,
        session_id: 999,
        savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days old (TTL is 7)
        entities: [{ id: 1 }],
        scene: null,
        strokes: {},
        strokeOrder: 0
    }));

    const expired = syncServer.persistence.loadSnapshot(999);

    pass('expired snapshot not restored and removed from disk',
        expired === null && !fs.existsSync(oldDir));

    console.log(JSON.stringify(results, null, 2));

    process.exit(Object.values(results).every(v => v === 'PASS') ? 0 : 1);
});
