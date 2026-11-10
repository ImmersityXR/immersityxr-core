// Standalone smoke test for session capture (format version 2).
//
// Run with: node tests/capture-smoke-test.js
//
// Exercises capture-writer.js directly, through sync.js, and end to end with
// real socket clients, including the failure mode the streaming design
// exists for: a recording interrupted mid-stream (crash / network disruption
// / redeploy) must keep everything flushed to disk, and startup recovery
// must finalize its manifest.
//
// Writes only to a temporary directory; does not touch config.js (provides
// its own, same pattern as tests/rtc-smoke-test.js).

/* jshint esversion: 8 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RELAY_PORT = 3997;
const PORTAL_PORT = 3996;

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'immersity-capture-test-'));

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
    capture: { path: ${JSON.stringify(path.join(path.relative(path.resolve(__dirname, '..'), tmpRoot), 'captures'))}, entityIds: 'import-order' },
    portal: { url: 'http://localhost:${PORTAL_PORT}/' },
    persistence: { enabled: false, path: './sessions/', snapshotIntervalMs: 60000, ttlHours: 168 }
};
`);

const cleanup = () => {
    try { fs.unlinkSync(configPath); } catch (e) { /* already removed */ }
    try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) { /* best effort */ }
};

process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));

const CaptureWriter = require(path.resolve(__dirname, '..', 'capture-writer.js'));

const results = {};
const pass = (name, ok) => { results[name] = ok ? 'PASS' : 'FAIL'; };
const wait = ms => new Promise(res => setTimeout(res, ms));
const readLines = p => fs.readFileSync(p, 'utf8').split('\n').filter(l => l.length > 0);
const readEvents = dir => readLines(path.join(dir, 'data.ndjson')).map(l => JSON.parse(l));
const readManifest = dir => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const exportCapture = dir => execFileSync('node', [path.resolve(__dirname, '..', 'tools', 'export-capture.js'), dir], { encoding: 'utf8' });

// What the Unity client sends for a position update, an interaction and a
// draw segment (JsonUtility output of Position, Interaction and Draw).
const positionOf = (clientId, entityId, entityType, x) => JSON.stringify({
    clientId: clientId, entityId: entityId, entityType: entityType, scaleFactor: 1,
    rot: { x: 0, y: 0, z: 0, w: 1 }, pos: { x: x, y: 1.5, z: -2 }
});
const interactionOf = (source, target, type) => JSON.stringify({
    sourceEntity_id: source, targetEntity_id: target, interactionType: type
});
const drawOf = (clientId, strokeId, strokeType) => JSON.stringify({
    clientId: clientId, strokeId: strokeId, strokeType: strokeType, lineWidth: 0.01,
    curStrokePos: { x: 1, y: 2, z: 3 }, curColor: { x: 1, y: 0, z: 0, w: 1 }
});

async function main () {
    const capturesRoot = path.join(tmpRoot, 'captures');

    // -----------------------------------------------------------------
    // 1. Clean lifecycle: data reaches disk DURING recording, not at end
    // -----------------------------------------------------------------
    const dirA = path.join(capturesRoot, '100', '1111');
    const writerA = new CaptureWriter(dirA, '100_1111', '100', 1111, null, {
        flushIntervalMs: 100,
        manifest: { entity_ids: 'import-order', started_by: 7 }
    });

    const startManifest = readManifest(dirA);

    pass('manifest written at start: recording, version 2, extra fields',
        startManifest.status === 'recording' && startManifest.format_version === 2
        && startManifest.entity_ids === 'import-order' && startManifest.started_by === 7);

    for (let i = 0; i < 50; i++) {
        writerA.recordEvent('message', 7, { type: 'sync', message: { x: i }, ts: 5 }, 1111 + i);
    }

    await wait(300); // > flush interval; no end() called yet

    const eventsA = readEvents(dirA);

    pass('events on disk while still recording', eventsA.length === 50);
    pass('events carry relay-clock t, increasing seq, kind and client',
        eventsA[10].t === 10 && eventsA[10].seq === 10 && eventsA[10].kind === 'message' && eventsA[10].client === 7);

    writerA.updateManifest({ assets: [{ asset_id: 1 }] });

    await new Promise(res => writerA.end(res));

    const manifestA = readManifest(dirA);

    pass('clean stop: manifest complete with count and later-added fields',
        manifestA.status === 'complete' && manifestA.event_count === 50 && manifestA.end > manifestA.start
        && manifestA.assets.length === 1);

    // -----------------------------------------------------------------
    // 2. The headline scenario: interrupted recording survives
    // -----------------------------------------------------------------
    const dirB = path.join(capturesRoot, '200', '2222');
    const writerB = new CaptureWriter(dirB, '200_2222', '200', 2222, null, { flushIntervalMs: 100 });

    for (let i = 0; i < 30; i++) {
        writerB.recordEvent('message', 3, { type: 'interaction', message: JSON.parse(interactionOf(3, 9, 4)), ts: 5 });
    }

    await wait(300); // flushed...

    // ...then the server "crashes": no end(), writer abandoned, plus a torn
    // half-written line such as a kill mid-write would leave behind
    clearInterval(writerB.flushTimer);
    fs.appendFileSync(path.join(dirB, 'data.ndjson'), '{"t":30,"seq":30,"kind":"message","da');

    pass('interrupted: flushed events survive the crash',
        readLines(path.join(dirB, 'data.ndjson')).length === 31); // 30 good + 1 torn

    // simulated restart: startup recovery runs
    const finalized = CaptureWriter.finalizeOrphans(capturesRoot, null);
    const manifestB = readManifest(dirB);

    pass('startup recovery finalizes exactly the orphan',
        finalized === 1 && manifestB.status === 'interrupted' && manifestB.event_count === 31);
    pass('completed captures left untouched by recovery', readManifest(dirA).status === 'complete');

    const exportOutB = exportCapture(dirB);
    const interactionRowsB = readLines(path.join(dirB, 'export', 'interactions.csv'));

    pass('export of interrupted capture: all intact rows, named interaction',
        interactionRowsB.length === 31 && interactionRowsB[0].startsWith('t_ms,seq,client,source_entity_id')
        && interactionRowsB[1].includes(',grab,')); // header + 30 rows
    pass('export: torn line skipped and reported', exportOutB.includes('Skipped 1'));

    // -----------------------------------------------------------------
    // 3. End to end with real clients
    // -----------------------------------------------------------------
    // a stand-in for the portal: knows the assets of lab 400 only
    const portal = http.createServer((req, res) => {
        if (req.url === '/labs/400') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ session_id: 400, assetList: [
                { asset_id: 12, asset_name: 'Syringe', path: 'https://example.edu/syringe.glb', is_whole_object: 1, scale: 1, extra: 'dropped' }
            ] }));
        } else {
            res.statusCode = 404;
            res.end();
        }
    });

    await new Promise(res => portal.listen(PORTAL_PORT, res));

    const server = http.createServer(require('express')());
    const io = require('socket.io')(server, { origins: '*:*' });
    const winston = require('winston');
    const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'error' })] });
    const syncServer = require(path.resolve(__dirname, '..', 'sync.js'));
    const fakeNamespace = { on: () => {}, use: () => {}, to: () => ({ emit: () => {} }), sockets: {} };

    syncServer.init(io, null, logger, fakeNamespace, fakeNamespace);

    await new Promise(res => server.listen(RELAY_PORT, res));

    const ioc = require('socket.io-client');
    const connect = () => ioc(`http://localhost:${RELAY_PORT}/sync`, { reconnection: false, timeout: 2000, forceNew: true });
    const send = (socket, session, client, type, message) =>
        socket.emit('message', { session_id: session, client_id: client, type: type, message: message, ts: 1 });

    const SESSION = 400;
    const a = connect(); // client 1, starts the recording
    const b = connect(); // client 2
    const outsider = connect(); // client 9, in a different session

    a.emit('join', [SESSION, 1]);
    b.emit('join', [SESSION, 2]);
    outsider.emit('join', [401, 9]);

    await wait(2300); // sockets leave the relay's repair center after 2 s

    // state that exists BEFORE the recording: a moved object and a stroke
    send(a, SESSION, 1, 'sync', positionOf(1, 12, 3, 0.5));
    send(a, SESSION, 1, 'draw', drawOf(1, 1110001, 10));

    await wait(200);

    const session = syncServer.getSessions().get(SESSION);

    outsider.emit('start_recording', SESSION);

    await wait(200);

    pass('a socket outside the session cannot start its recording', session.isRecording === false);

    a.emit('start_recording', SESSION);

    await wait(300);

    pass('a member starts the recording', session.isRecording === true);

    const dirC = path.join(capturesRoot, String(SESSION), String(session.recordingStart));
    const liveManifest = readManifest(dirC);

    pass('manifest names who started it and the id scheme',
        liveManifest.started_by === 1 && liveManifest.entity_ids === 'import-order' && liveManifest.format_version === 2);
    pass('manifest lists the lab assets from the portal, known fields only',
        Array.isArray(liveManifest.assets) && liveManifest.assets.length === 1
        && liveManifest.assets[0].asset_id === 12 && liveManifest.assets[0].extra === undefined);

    // during the recording
    send(a, SESSION, 1, 'sync', positionOf(1, 1, 0, 0.1)); // a's head
    send(b, SESSION, 1, 'sync', positionOf(1, 2, 0, 0.2)); // b claims to be client 1
    send(a, SESSION, 1, 'interaction', interactionOf(1, 12, 4)); // a grabs entity 12
    send(a, SESSION, 1, 'draw', drawOf(1, 1110002, 10));
    send(a, SESSION, 1, 'reaction', JSON.stringify({ emoji: 'wave' })); // a type the exporter has no table for
    a.emit('update', [0, SESSION, 1, 12, 3, 1, 0, 0, 0, 1, 0.5, 1.5, -2, 5]); // older array event

    const c = connect(); // client 4 joins and leaves mid-recording

    c.emit('join', [SESSION, 4]);

    await wait(400);

    c.emit('leave', [SESSION, 4]);

    await wait(300);

    outsider.emit('end_recording', SESSION);

    await wait(200);

    pass('a socket outside the session cannot stop its recording', session.isRecording === true);

    a.emit('end_recording', SESSION);

    await wait(400); // allow stream close + manifest finalize

    const eventsC = readEvents(dirC);
    const manifestC = readManifest(dirC);
    const first = eventsC[0];

    pass('first event is a snapshot of the pre-recording state',
        first.kind === 'snapshot' && first.t === 0 && first.seq === 0 && first.client === null
        && first.data.clients.includes(1) && first.data.clients.includes(2)
        && first.data.entities.some(e => e.id === 12)
        && first.data.strokes.length === 1 && first.data.strokes[0].stroke_id === '1110001');
    pass('seq counts up from 0 and t never goes backwards',
        eventsC.every((e, i) => e.seq === i && e.t >= 0 && (i === 0 || e.t >= eventsC[i - 1].t)));

    const spoofed = eventsC.find(e => e.kind === 'message' && e.data.type === 'sync' && e.data.message.entityId === 2);

    pass('a message with a spoofed client_id is recorded under its real sender', !!spoofed && spoofed.client === 2);
    pass('message payloads are stored parsed, with the client timestamp',
        !!spoofed && spoofed.data.message.pos.x === 0.2 && spoofed.data.ts === 1);
    pass('older array events are recorded', eventsC.some(e => e.kind === 'update' && e.client === 1 && e.data[3] === 12));
    pass('joins and leaves are recorded',
        eventsC.some(e => e.kind === 'joined' && e.client === 4) && eventsC.some(e => e.kind === 'left' && e.client === 4));
    pass('clean stop over the socket: manifest complete, count matches the file',
        manifestC.status === 'complete' && manifestC.event_count === eventsC.length && manifestC.assets.length === 1);

    exportCapture(dirC);

    const csv = name => readLines(path.join(dirC, 'export', name));
    const positions = csv('positions.csv');

    pass('export: positions.csv has head rows with position, rotation and names',
        positions[0] === 't_ms,seq,client,entity_id,entity_type,entity,pos_x,pos_y,pos_z,rot_x,rot_y,rot_z,rot_w,scale,client_ts'
        && positions.length === 3 && positions.some(r => r.includes(',1,0,head,0.1,1.5,-2,0,0,0,1,1,1')));
    pass('export: interactions.csv, drawing.csv and presence.csv',
        csv('interactions.csv').length === 2 && csv('interactions.csv')[1].includes(',1,12,4,grab,')
        && csv('drawing.csv').length === 2 && csv('drawing.csv')[1].includes(',1110002,10,line,')
        && csv('presence.csv').length === 3);
    pass('export: unknown message types and older events get their own files',
        csv('reaction.csv')[0].includes('message.emoji') && csv('update.csv').length === 2);
    pass('export: snapshot.json holds the starting state',
        JSON.parse(fs.readFileSync(path.join(dirC, 'export', 'snapshot.json'), 'utf8')).entities.some(e => e.id === 12));

    // -----------------------------------------------------------------
    // 4. Volume, and the empty-session stop
    // -----------------------------------------------------------------
    const session300 = syncServer.getOrCreateSession(300);

    syncServer.start_recording(null, 300);

    pass('sync.js: capture writer attached on start_recording', !!session300.captureWriter);

    // simulate a 90 fps burst from two clients (a short research recording)
    const burst = 9000;

    for (let i = 0; i < burst; i++) {
        syncServer.recordCaptureEvent(session300, 'message', (i % 2) + 1,
            { type: 'sync', message: { entityId: i % 6, entityType: 0, pos: { x: i, y: i, z: i } }, ts: i });
    }

    const recordingStart = session300.recordingStart;

    // the empty-session path (was dropping recordings entirely before the fix)
    syncServer.try_to_end_recording(300);

    await wait(300); // allow stream close + manifest finalize

    const dirD = path.join(capturesRoot, '300', String(recordingStart));
    const manifestD = readManifest(dirD);

    pass('sync.js: 9000-event burst all on disk after empty-session stop',
        readLines(path.join(dirD, 'data.ndjson')).length === burst + 1 // + snapshot
        && manifestD.status === 'complete' && manifestD.event_count === burst + 1);
    pass('recording works when the portal has no such lab: no assets in the manifest',
        manifestD.assets === undefined && manifestD.started_by === null);

    console.log(JSON.stringify(results, null, 2));

    [a, b, c, outsider].forEach(s => s.close());

    process.exit(Object.values(results).every(v => v === 'PASS') ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
