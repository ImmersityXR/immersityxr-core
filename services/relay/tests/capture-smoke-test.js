// Standalone smoke test for durable streaming capture.
//
// Run with: node tests/capture-smoke-test.js
//
// Exercises capture-writer.js directly and through sync.js, including the
// failure mode the design exists for: a recording interrupted mid-stream
// (crash / network disruption / redeploy) must keep everything flushed to
// disk, and startup recovery must finalize its manifest.
//
// Writes only to a temporary directory; does not touch config.js (provides
// its own, same pattern as tests/rtc-smoke-test.js).

/* jshint esversion: 8 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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
    capture: { path: ${JSON.stringify(path.join(path.relative(path.resolve(__dirname, '..'), tmpRoot), 'captures'))} },
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

const readManifest = dir => JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

async function main () {
    const capturesRoot = path.join(tmpRoot, 'captures');

    // -----------------------------------------------------------------
    // 1. Clean lifecycle: data reaches disk DURING recording, not at end
    // -----------------------------------------------------------------
    const dirA = path.join(capturesRoot, '100', '1111');

    const writerA = new CaptureWriter(dirA, '100_1111', '100', 1111, null, { flushIntervalMs: 100 });

    pass('manifest written at start with status=recording', readManifest(dirA).status === 'recording');

    for (let i = 0; i < 50; i++) {
        writerA.record({ seq: i, type: 'position', message: { x: i, y: i * 2 } });
    }

    await wait(300); // > flush interval; no end() called yet

    pass('messages on disk while still recording', readLines(path.join(dirA, 'data.ndjson')).length === 50);

    await new Promise(res => writerA.end(res));

    const manifestA = readManifest(dirA);

    pass('clean stop: manifest complete with correct count',
        manifestA.status === 'complete' && manifestA.message_count === 50 && manifestA.end > manifestA.start);

    // -----------------------------------------------------------------
    // 2. The headline scenario: interrupted recording survives
    // -----------------------------------------------------------------
    const dirB = path.join(capturesRoot, '200', '2222');

    const writerB = new CaptureWriter(dirB, '200_2222', '200', 2222, null, { flushIntervalMs: 100 });

    for (let i = 0; i < 30; i++) {
        writerB.record({ seq: i, type: 'interaction', message: { action: 'grab' } });
    }

    await wait(300); // flushed...

    // ...then the server "crashes": no end(), writer abandoned, plus a torn
    // half-written line such as a kill mid-write would leave behind
    clearInterval(writerB.flushTimer);

    fs.appendFileSync(path.join(dirB, 'data.ndjson'), '{"seq":30,"type":"interaction","mess');

    pass('interrupted: flushed messages survive the crash',
        readLines(path.join(dirB, 'data.ndjson')).length === 31); // 30 good + 1 torn

    // simulated restart: startup recovery runs
    const finalized = CaptureWriter.finalizeOrphans(capturesRoot, null);

    const manifestB = readManifest(dirB);

    pass('startup recovery finalizes exactly the orphan',
        finalized === 1 && manifestB.status === 'interrupted' && manifestB.message_count === 31);

    pass('completed captures left untouched by recovery', readManifest(dirA).status === 'complete');

    // -----------------------------------------------------------------
    // 3. Export tool: NDJSON -> per-type CSV, torn line skipped
    // -----------------------------------------------------------------
    const exportOut = execFileSync('node', [
        path.resolve(__dirname, '..', 'tools', 'export-capture.js'),
        dirB
    ], { encoding: 'utf8' });

    const csvLines = readLines(path.join(dirB, 'export', 'interaction.csv'));

    pass('export: per-type CSV with all intact rows',
        csvLines.length === 31 && csvLines[0].includes('message.action')); // header + 30 rows

    pass('export: torn line skipped and reported', exportOut.includes('Skipped 1'));

    // -----------------------------------------------------------------
    // 4. Through sync.js: start/record/end + the empty-session bug fix
    // -----------------------------------------------------------------
    const syncServer = require(path.resolve(__dirname, '..', 'sync.js'));

    const fakeNamespace = { on: () => {}, use: () => {}, to: () => ({ emit: () => {} }), sockets: {} };
    const fakeIo = { of: () => fakeNamespace };

    const winston = require('winston');
    const logger = winston.createLogger({ transports: [new winston.transports.Console({ level: 'error' })] });

    syncServer.init(fakeIo, null, logger, fakeNamespace, fakeNamespace);

    const session = syncServer.getOrCreateSession(300);

    syncServer.start_recording(null, 300);

    pass('sync.js: capture writer attached on start_recording', !!session.captureWriter);

    // simulate a 90 fps burst from two clients (a short research recording)
    const burst = 9000;

    for (let i = 0; i < burst; i++) {
        syncServer.record_message_data({
            session_id: 300,
            client_id: (i % 2) + 1,
            type: 'sync',
            ts: session.recordingStart + Math.floor(i / 2) * 11,
            message: JSON.stringify({ x: i, y: i, z: i })
        });
    }

    const recordingStart = session.recordingStart;

    // the empty-session path (was dropping recordings entirely before the fix)
    syncServer.try_to_end_recording(300);

    await wait(300); // allow stream close + manifest finalize

    const dirC = path.join(capturesRoot, '300', String(recordingStart));

    const manifestC = readManifest(dirC);

    pass('sync.js: 9000-message burst all on disk after empty-session stop',
        readLines(path.join(dirC, 'data.ndjson')).length === burst
        && manifestC.status === 'complete' && manifestC.message_count === burst);

    const sample = JSON.parse(readLines(path.join(dirC, 'data.ndjson'))[100]);

    pass('sync.js: messages carry seq and capture_id',
        typeof sample.seq === 'number' && sample.capture_id === `300_${recordingStart}`);

    console.log(JSON.stringify(results, null, 2));

    process.exit(Object.values(results).every(v => v === 'PASS') ? 0 : 1);
}

main();
