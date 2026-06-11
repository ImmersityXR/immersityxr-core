// Standalone smoke test for the /rtc WebRTC signaling namespace.
//
// Run with: node tests/rtc-smoke-test.js
//
// Starts a relay on port 3997 with an in-memory config (does not read or
// write config.js) and drives a full two-peer offer/answer/ICE handshake,
// device-type negotiation, call teardown, session isolation, and
// shared-secret auth gating with real socket.io-client connections.
// Requires socket.io-client (npm install --no-save socket.io-client@2).

/* jshint esversion: 8 */

const path = require('path');
const fs = require('fs');

// The relay modules require('./config') at load time. To avoid clobbering a
// developer's real configuration, this test writes a temporary config.js
// only when none exists, and removes it when the test ends.
const configPath = path.resolve(__dirname, '..', 'config.js');

if (fs.existsSync(configPath)) {
    console.error('config.js already exists - refusing to overwrite it.');
    console.error('Run this test in a checkout without a config.js (it provides its own).');
    process.exit(2);
}

fs.writeFileSync(configPath, `module.exports = {
    db: { user: '', host: '', database: '', password: '', port: '', ssl: { rejectUnauthorized: false } },
    cors: { origins: '*:*' },
    auth: { clientSecret: 'rtc-secret', adminSecret: '' },
    rtc: { iceServers: [{ urls: ['stun:stun.example.edu:3478'] }] },
    azure: { subscriptionKey: '', serviceRegion: '' },
    capture: { path: './captures/' }
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

const rtcServer = require(path.resolve(__dirname, '..', 'rtc.js'));

rtcServer.init(io, logger);

const ioc = require('socket.io-client');

const URL = 'http://localhost:3997/rtc';

const results = {};

const pass = (name, ok) => { results[name] = ok ? 'PASS' : 'FAIL'; };

function connect (userName, clientId, sessionId, authToken) {
    return ioc(URL, {
        reconnection: false,
        timeout: 2000,
        forceNew: true,
        query: {
            userName: userName,
            client_id: clientId,
            session_id: sessionId,
            auth: authToken === undefined ? 'rtc-secret' : authToken
        }
    });
}

const wait = ms => new Promise(res => setTimeout(res, ms));

server.listen(3997, async () => {
    // auth gating
    await new Promise(res => {
        const bad = connect('eve', 99, 'sess1', 'wrong');

        bad.on('connect', () => { pass('auth: wrong token rejected', false); bad.close(); res(); });
        bad.on('error', () => { pass('auth: wrong token rejected', true); bad.close(); res(); });

        setTimeout(res, 2500);
    });

    // two peers in session 100, a bystander in session 200
    const alice = connect('alice', 1, '100');
    const bob = connect('bob', 2, '100');
    const carol = connect('carol', 3, '200');

    let bobConfig = null;
    let aliceClients = [];
    let bobGotOffer = null;
    let aliceGotAnswer = null;
    let bobGotIce = null;
    let aliceGotRoom = null;
    let bobGotRoom = null;
    let carolSawSession100 = false;
    let bobGotCallEnded = null;
    let bobGotEmptyRoom = false;

    bob.on('rtcConfig', cfg => bobConfig = cfg);
    alice.on('clientsUpdate', list => aliceClients = list);
    carol.on('clientsUpdate', list => { if (list.includes('alice') || list.includes('bob')) carolSawSession100 = true; });
    bob.on('newOfferAwaiting', (data, ack) => { bobGotOffer = data; if (ack) ack('offer-received'); });
    alice.on('answerResponse', data => aliceGotAnswer = data);
    bob.on('receivedIceCandidateFromServer', data => bobGotIce = data);
    alice.on('roomCreated', data => aliceGotRoom = data);
    bob.on('roomCreated', data => bobGotRoom = data);
    bob.on('callEnded', data => bobGotCallEnded = data);
    bob.on('callEndedAndEmptyRoom', () => bobGotEmptyRoom = true);

    await wait(800);

    pass('rtcConfig delivered with configured ICE servers',
        !!bobConfig && bobConfig.iceServers[0].urls[0] === 'stun:stun.example.edu:3478');

    pass('clientsUpdate lists session peers',
        aliceClients.includes('bob') && !aliceClients.includes('carol'));

    alice.emit('setDeviceType', { userName: 'alice', deviceType: 0 });
    bob.emit('setDeviceType', { userName: 'bob', deviceType: 1 });

    await wait(200);

    const aliceHasVideo = await new Promise(res => bob.emit('checkPeerDeviceType', 'alice', v => res(v)));
    const bobHasVideo = await new Promise(res => alice.emit('checkPeerDeviceType', 'bob', v => res(v)));

    pass('device type negotiation', aliceHasVideo === true && bobHasVideo === false);

    // offer/answer/ICE handshake
    const offerAck = await new Promise(res => {
        alice.emit('newOffer', {
            offer: { type: 'offer', sdp: 'fake-sdp-alice' },
            offererUserName: 'alice',
            answererUserName: 'bob'
        }, r => res(r));
    });

    pass('offer relayed to answerer with ack',
        bobGotOffer && bobGotOffer.newOffer.offer.sdp === 'fake-sdp-alice'
        && bobGotOffer.offererClientID === 1 && offerAck === 'offer-received');

    bob.emit('newAnswer', {
        offer: Object.assign({}, bobGotOffer.newOffer, {
            answer: { type: 'answer', sdp: 'fake-sdp-bob' },
            answererUserName: 'bob'
        })
    }, () => {});

    await wait(300);

    pass('answer relayed to offerer',
        aliceGotAnswer && aliceGotAnswer.offer.answer.sdp === 'fake-sdp-bob'
        && aliceGotAnswer.offererClientID === 2);

    pass('both peers told of call room',
        aliceGotRoom && bobGotRoom && aliceGotRoom.roomName === 'rtc_call_100'
        && aliceGotRoom.nameToAdd === 'bob' && bobGotRoom.nameToAdd === 'alice');

    alice.emit('sendIceCandidateToSignalingServer', {
        didIOffer: true,
        iceUserName: 'alice',
        iceCandidate: { candidate: 'fake-ice-1' }
    });

    await wait(300);

    pass('ICE candidate relayed offerer->answerer',
        bobGotIce && bobGotIce.iceCandidate.candidate === 'fake-ice-1'
        && bobGotIce.from === 'alice' && bobGotIce.to === 'bob');

    pass('session isolation: carol saw nothing from session 100', !carolSawSession100);

    // call end
    alice.emit('sendCallEndedToServer', 'alice');

    await wait(300);

    pass('callEnded broadcast with client id',
        bobGotCallEnded && bobGotCallEnded.clientID === 1 && bobGotCallEnded.clientName === 'alice');

    pass('empty-room notification when one peer remains', bobGotEmptyRoom === true);

    alice.close();
    bob.close();
    carol.close();

    await wait(300);

    pass('session state cleaned up after disconnects', rtcServer.sessions.size === 0);

    console.log(JSON.stringify(results, null, 2));

    process.exit(Object.values(results).every(v => v === 'PASS') ? 0 : 1);
});
