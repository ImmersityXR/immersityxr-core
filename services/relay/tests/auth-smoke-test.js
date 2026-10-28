// Standalone smoke test for shared-secret authentication (auth.js).
//
// Run with: node tests/auth-smoke-test.js
//
// Brings up the same four namespaces serve.js does (/sync, /chat, /rtc,
// /admin) with real socket.io-client connections and checks the gating:
//
//   with secrets configured:
//     - /sync and /chat reject a missing or wrong token and accept the
//       client secret, whether passed as a query option or in the URL
//       (the Unity template appends ?auth= to the page URL)
//     - /admin rejects a missing token AND the client secret, and accepts
//       only the admin secret
//   with no secrets configured (second phase, run in a child process
//   because auth.js reads the secrets once at module load):
//     - /sync accepts unauthenticated clients (backwards compatible)
//     - /admin rejects everything (deny-by-default)
//
// Starts a relay on port 3994 (3993 for the second phase) with its own
// temporary config.js (refuses to run if one already exists, same pattern
// as the other smoke tests). Requires socket.io-client.

/* jshint esversion: 8 */

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const PHASE = process.env.AUTH_SMOKE_PHASE === 'open' ? 'open' : 'secrets';

const CLIENT_SECRET = PHASE === 'secrets' ? 'client-secret-for-test' : '';
const ADMIN_SECRET = PHASE === 'secrets' ? 'admin-secret-for-test' : '';
const PORT = PHASE === 'secrets' ? 3994 : 3993;

const configPath = path.resolve(__dirname, '..', 'config.js');

if (fs.existsSync(configPath)) {
    console.error('config.js already exists - refusing to overwrite it.');
    console.error('Run this test in a checkout without a config.js (it provides its own).');
    process.exit(2);
}

fs.writeFileSync(configPath, `module.exports = {
    db: { user: '', host: '', database: '', password: '', port: '', ssl: { rejectUnauthorized: false } },
    cors: { origins: '*:*' },
    auth: { clientSecret: ${JSON.stringify(CLIENT_SECRET)}, adminSecret: ${JSON.stringify(ADMIN_SECRET)} },
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

// Same wiring order as serve.js.
const syncServer = require(path.resolve(__dirname, '..', 'sync.js'));
const chatServer = require(path.resolve(__dirname, '..', 'chat.js'));
const rtcServer = require(path.resolve(__dirname, '..', 'rtc.js'));
const adminServer = require(path.resolve(__dirname, '..', 'admin.js'));

const chatNamespace = chatServer.init(io, logger);
rtcServer.init(io, logger);
const adminNamespace = adminServer.init(io, logger, syncServer, chatServer);
syncServer.init(io, null, logger, chatNamespace, adminNamespace);

const ioc = require('socket.io-client');

const BASE = `http://localhost:${PORT}`;

const results = {};

const pass = (name, ok) => { results[name] = ok ? 'PASS' : 'FAIL'; };

// Resolve with 'connected', 'rejected' (middleware error), or 'timeout'.
// socket.io-client 2.x surfaces a middleware rejection as 'error';
// 4.x surfaces it as 'connect_error' - listen for both.
function tryConnect (nsPath, opts) {
    return new Promise((resolve) => {
        const socket = ioc(BASE + nsPath, Object.assign({ reconnection: false, timeout: 2000, forceNew: true }, opts || {}));

        const done = (outcome) => { clearTimeout(timer); socket.close(); resolve(outcome); };

        const timer = setTimeout(() => done('timeout'), 2500);

        socket.on('connect', () => done('connected'));
        socket.on('error', () => done('rejected'));
        socket.on('connect_error', () => done('rejected'));
    });
}

const withQuery = token => ({ query: { auth: token } });

async function secretsPhase () {
    // /sync
    pass('/sync: missing token rejected', await tryConnect('/sync') === 'rejected');
    pass('/sync: wrong token rejected', await tryConnect('/sync', withQuery('nope')) === 'rejected');
    pass('/sync: client secret accepted (query option)', await tryConnect('/sync', withQuery(CLIENT_SECRET)) === 'connected');
    pass('/sync: client secret accepted (URL ?auth=)', await tryConnect('/sync?auth=' + encodeURIComponent(CLIENT_SECRET)) === 'connected');
    pass('/sync: admin secret does not grant client access', await tryConnect('/sync', withQuery(ADMIN_SECRET)) === 'rejected');

    // /chat (same middleware, separately applied)
    pass('/chat: missing token rejected', await tryConnect('/chat') === 'rejected');
    pass('/chat: client secret accepted', await tryConnect('/chat', withQuery(CLIENT_SECRET)) === 'connected');

    // /admin
    pass('/admin: missing token rejected', await tryConnect('/admin') === 'rejected');
    pass('/admin: client secret does not grant admin access', await tryConnect('/admin', withQuery(CLIENT_SECRET)) === 'rejected');
    pass('/admin: admin secret accepted', await tryConnect('/admin', withQuery(ADMIN_SECRET)) === 'connected');
}

async function openPhase () {
    pass('no secrets: /sync accepts unauthenticated client', await tryConnect('/sync') === 'connected');
    pass('no secrets: /chat accepts unauthenticated client', await tryConnect('/chat') === 'connected');
    pass('no secrets: /admin rejects missing token (deny-by-default)', await tryConnect('/admin') === 'rejected');
    pass('no secrets: /admin rejects any token (deny-by-default)', await tryConnect('/admin', withQuery('anything')) === 'rejected');
}

server.listen(PORT, async () => {
    if (PHASE === 'secrets') {
        await secretsPhase();
    } else {
        await openPhase();
    }

    console.log(`[auth smoke: ${PHASE}] ` + JSON.stringify(results, null, 2));

    const ok = Object.values(results).every(v => v === 'PASS');

    server.close();

    if (PHASE === 'secrets') {
        // auth.js captures the secrets at require time, so the no-secrets
        // phase needs a fresh process. Remove our config first so the child
        // can write its own.
        removeTempConfig();

        const child = spawnSync(process.execPath, [__filename], {
            env: Object.assign({}, process.env, { AUTH_SMOKE_PHASE: 'open' }),
            stdio: 'inherit'
        });

        process.exit(ok && child.status === 0 ? 0 : 1);
    }

    process.exit(ok ? 0 : 1);
});
