// University of Illinois/NCSA
// Open Source License
// http://otm.illinois.edu/disclose-protect/illinois-open-source-license

// Copyright (c) 2026 Grainger Engineering Library Information Center.  All rights reserved.

// Developed by: IDEA Lab
//               Grainger Engineering Library Information Center - University of Illinois Urbana-Champaign
//               https://library.illinois.edu/enx

// Permission is hereby granted, free of charge, to any person obtaining a copy of
// this software and associated documentation files (the "Software"), to deal with
// the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
// of the Software, and to permit persons to whom the Software is furnished to
// do so, subject to the following conditions:
// * Redistributions of source code must retain the above copyright notice,
//   this list of conditions and the following disclaimers.
// * Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimers in the documentation
//   and/or other materials provided with the distribution.
// * Neither the names of IDEA Lab, Grainger Engineering Library Information Center,
//   nor the names of its contributors may be used to endorse or promote products
//   derived from this Software without specific prior written permission.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
// CONTRIBUTORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS WITH THE
// SOFTWARE.

/* jshint esversion: 8 */

// WebRTC signaling namespace (/rtc) for peer-to-peer voice/video/screen
// sharing between clients in the same Komodo session.
//
// The signaling protocol (offer/answer/ICE relay, room call-outs, device-type
// negotiation) is ported from David Tamayo's KomodoSandbox work:
//   https://github.com/davtamay/RelayTesting   (server, Socket.IO 4)
//   https://github.com/davtamay/KomodoSandbox  (client webrtc.js)
// adapted here to Socket.IO 2.x, scoped per session (his prototype used a
// single global call room), and gated by the shared-secret client auth.
//
// Clients connect with query parameters:
//   userName   - display name, unique within the session
//   client_id  - Komodo client id (optional; random fallback)
//   session_id - Komodo session id; signaling is isolated per session
//   auth       - shared client secret (see auth.js), when configured
//
// On connection the server emits 'rtcConfig' { iceServers } so STUN/TURN
// servers are configured centrally (config.rtc.iceServers) instead of being
// baked into client builds.

const config = require('./config');
const auth = require('./auth');

const DEFAULT_ICE_SERVERS = [
    {
        urls: [
            'stun:stun.l.google.com:19302',
            'stun:stun1.l.google.com:19302'
        ]
    }
];

// Per-session signaling state.
class RtcSession {
    constructor (sessionId) {
        this.sessionId = sessionId;

        // [{ socket, socketId, userName }]
        this.connectedSockets = [];

        // offers in progress: { offer, offererUserName, answererUserName,
        //   offererSocketID, answererSocketID, offererClientID,
        //   answererClientID, offerIceCandidates, answer,
        //   answererIceCandidates, isForSync }
        this.offers = [];

        this.nameToClientID = new Map();

        this.nameToDeviceType = new Map();

        // userNames currently in the call
        this.callMembers = new Set();
    }

    get roomName () {
        return `rtc_call_${this.sessionId}`;
    }

    findByName (userName) {
        return this.connectedSockets.find(s => s.userName === userName);
    }

    otherUserNames (excludedSocketId) {
        return this.connectedSockets
            .filter(s => s.socketId !== excludedSocketId)
            .map(s => s.userName);
    }

    removeOffer (offererUserName, answererUserName) {
        this.offers = this.offers.filter(offer =>
            !(offer.offererUserName === offererUserName && offer.answererUserName === answererUserName));
    }

    isEmpty () {
        return this.connectedSockets.length === 0;
    }
}

module.exports = {

    // exposed for tests and the admin namespace
    sessions: new Map(),

    init: function (io, logger) {
        const self = this;

        const rtc = io.of('/rtc');

        // Same shared client secret as /sync and /chat (no-op until
        // config.auth.clientSecret is set).
        rtc.use(auth.clientAuth('/rtc', logger));

        const iceServers = (config.rtc && config.rtc.iceServers && config.rtc.iceServers.length)
            ? config.rtc.iceServers
            : DEFAULT_ICE_SERVERS;

        function getSession (sessionId) {
            let session = self.sessions.get(sessionId);

            if (!session) {
                session = new RtcSession(sessionId);

                self.sessions.set(sessionId, session);
            }

            return session;
        }

        // Emit to every connected socket in the session (including `socket`
        // itself unless excludeSocketId is given).
        function emitToSession (session, eventName, data, excludeSocketId) {
            session.connectedSockets.forEach(entry => {
                if (entry.socketId === excludeSocketId) {
                    return;
                }

                entry.socket.emit(eventName, data);
            });
        }

        rtc.on('connection', function (socket) {
            const query = socket.handshake.query || {};

            const userName = query.userName;

            const sessionId = (query.session_id || 'default').toString();

            let clientId = parseInt(query.client_id, 10);

            if (!userName) {
                if (logger) logger.warn(`rtc: rejecting connection without userName (socket ${socket.id})`);

                socket.emit('connectionError', 'userName is required');

                socket.disconnect(true);

                return;
            }

            if (isNaN(clientId)) {
                clientId = Math.floor(Math.random() * 100000);
            }

            const session = getSession(sessionId);

            if (session.findByName(userName)) {
                if (logger) logger.warn(`rtc: rejecting duplicate userName ${userName} in session ${sessionId}`);

                socket.emit('connectionError', 'userName already connected in this session');

                socket.disconnect(true);

                return;
            }

            session.nameToClientID.set(userName, clientId);

            session.connectedSockets.push({
                socket: socket,
                socketId: socket.id,
                userName: userName
            });

            if (logger) logger.info(`rtc: ${userName} (client ${clientId}) joined signaling for session ${sessionId}`);

            // Centrally-configured STUN/TURN servers for RTCPeerConnection
            socket.emit('rtcConfig', { iceServers: iceServers });

            emitToSession(session, 'clientsUpdate', session.otherUserNames(null));

            socket.on('disconnect', function () {
                const disconnecting = session.connectedSockets.find(s => s.socketId === socket.id);

                if (!disconnecting) {
                    return;
                }

                session.nameToClientID.delete(disconnecting.userName);

                session.nameToDeviceType.delete(disconnecting.userName);

                session.callMembers.delete(disconnecting.userName);

                session.connectedSockets = session.connectedSockets.filter(s => s.socketId !== socket.id);

                session.offers = session.offers.filter(offer => offer.offererUserName !== disconnecting.userName);

                emitToSession(session, 'clientsUpdate', session.otherUserNames(null));

                emitToSession(session, 'availableOffers', session.offers);

                emitToSession(session, 'clientDisconnected', disconnecting.userName);

                if (logger) logger.info(`rtc: ${disconnecting.userName} left signaling for session ${sessionId}`);

                if (session.isEmpty()) {
                    self.sessions.delete(sessionId);
                }
            });

            socket.on('setDeviceType', function (data) {
                if (!data || !data.userName) {
                    return;
                }

                session.nameToDeviceType.set(data.userName, data.deviceType);
            });

            // 0 = has camera; anything else = audio only
            socket.on('checkPeerDeviceType', function (videoId, ackFunction) {
                if (typeof ackFunction !== 'function') {
                    return;
                }

                ackFunction(session.nameToDeviceType.get(videoId) === 0);
            });

            // Offerer creates an SDP offer for a specific answerer.
            socket.on('newOffer', function (data, ackFn) {
                if (!data || !data.offererUserName || !data.answererUserName) {
                    return;
                }

                const answererEntry = session.findByName(data.answererUserName);

                const newOffer = {
                    offer: data.offer,
                    offererUserName: data.offererUserName,
                    answererUserName: data.answererUserName,
                    offererSocketID: socket.id,
                    answererSocketID: answererEntry ? answererEntry.socketId : null,
                    answererClientID: session.nameToClientID.get(data.answererUserName),
                    offererClientID: session.nameToClientID.get(data.offererUserName),
                    offerIceCandidates: [],
                    answer: null,
                    answererIceCandidates: []
                };

                session.offers.push(newOffer);

                if (!answererEntry) {
                    if (logger) logger.warn(`rtc: no socket found for answerer ${data.answererUserName} in session ${sessionId}`);

                    return;
                }

                const relayAck = function (response) {
                    if (typeof ackFn === 'function') {
                        ackFn(response);
                    }
                };

                if (data.isForClientSync) {
                    answererEntry.socket.emit('newOfferAwaiting2', {
                        isForClientSync: data.isForClientSync,
                        newOffer: newOffer,
                        offererSocketID: newOffer.offererSocketID,
                        offererClientID: newOffer.offererClientID,
                        answererClientID: newOffer.answererClientID
                    }, relayAck);
                } else {
                    answererEntry.socket.emit('newOfferAwaiting', {
                        newOffer: newOffer,
                        offererClientID: newOffer.offererClientID
                    }, relayAck);
                }
            });

            // Answerer responds; both peers join the session's call room.
            socket.on('newAnswer', function (data, ackFunction) {
                if (!data || !data.offer) {
                    return;
                }

                const offererEntry = session.findByName(data.offer.offererUserName);

                const answererEntry = session.findByName(data.offer.answererUserName);

                if (offererEntry) {
                    offererEntry.socket.join(session.roomName);

                    session.callMembers.add(offererEntry.userName);

                    offererEntry.socket.emit('roomCreated', {
                        roomName: session.roomName,
                        nameToAdd: data.offer.answererUserName,
                        socketID: answererEntry ? answererEntry.socketId : null
                    });
                }

                if (answererEntry) {
                    answererEntry.socket.join(session.roomName);

                    session.callMembers.add(answererEntry.userName);

                    answererEntry.socket.emit('roomCreated', {
                        roomName: session.roomName,
                        nameToAdd: data.offer.offererUserName,
                        socketID: offererEntry ? offererEntry.socketId : null
                    });
                }

                const offerToUpdate = session.offers.find(o => o.offererUserName === data.offer.offererUserName);

                if (!offerToUpdate) {
                    if (logger) logger.warn(`rtc: newAnswer with no matching offer from ${data.offer.offererUserName} in session ${sessionId}`);

                    return;
                }

                offerToUpdate.answer = data.offer.answer;

                offerToUpdate.answererUserName = data.offer.answererUserName;

                offerToUpdate.isForSync = data.offer.isForSync;

                if (typeof ackFunction === 'function') {
                    ackFunction(data.offer);
                }

                if (offererEntry) {
                    offererEntry.socket.emit('answerResponse', {
                        offer: offerToUpdate,
                        offererClientID: session.nameToClientID.get(data.offer.answererUserName)
                    });
                }
            });

            // Trickle ICE relay between offerer and answerer.
            socket.on('sendIceCandidateToSignalingServer', function (iceCandidateObj) {
                if (!iceCandidateObj) {
                    return;
                }

                const didIOffer = iceCandidateObj.didIOffer;

                const iceUserName = iceCandidateObj.iceUserName;

                const iceCandidate = iceCandidateObj.iceCandidate;

                let offerInOffers;

                let recipientName;

                if (didIOffer) {
                    offerInOffers = session.offers.find(o => o.offererUserName === iceUserName);

                    if (!offerInOffers) {
                        return;
                    }

                    offerInOffers.offerIceCandidates.push(iceCandidate);

                    // Candidates buffered here are delivered with the offer;
                    // once answered, pass new ones straight through.
                    if (!offerInOffers.answererUserName) {
                        return;
                    }

                    recipientName = offerInOffers.answererUserName;
                } else {
                    offerInOffers = session.offers.find(o => o.answererUserName === iceUserName);

                    if (!offerInOffers) {
                        return;
                    }

                    recipientName = offerInOffers.offererUserName;
                }

                const recipientEntry = session.findByName(recipientName);

                if (!recipientEntry) {
                    if (logger) logger.warn(`rtc: ICE candidate for unknown recipient ${recipientName} in session ${sessionId}`);

                    return;
                }

                recipientEntry.socket.emit('receivedIceCandidateFromServer', {
                    iceCandidate: iceCandidate,
                    offer: offerInOffers,
                    from: iceUserName,
                    to: recipientName
                });
            });

            // A peer who answered asks everyone already in the call (minus
            // those it is connected to) to send the new participant an offer.
            socket.on('roomCallClient', function (data) {
                if (!data || !data.clientToAdd) {
                    return;
                }

                const alreadyConnected = new Set(data.clientsAlreadyConnectedTo || []);

                alreadyConnected.add(data.clientToAdd);

                session.callMembers.forEach(function (memberName) {
                    if (alreadyConnected.has(memberName)) {
                        return;
                    }

                    const memberEntry = session.findByName(memberName);

                    if (!memberEntry || memberEntry.socketId === socket.id) {
                        return;
                    }

                    // Slight delay so the new participant finishes its first
                    // peer connection before more offers arrive (matches the
                    // original implementation).
                    setTimeout(function () {
                        memberEntry.socket.emit('makeClientSendOffer', data.clientToAdd);
                    }, 3000);
                });
            });

            // Peers report a completed connection so the offer can be cleaned up.
            socket.on('connectionEstablished', function (data) {
                if (!data) {
                    return;
                }

                session.removeOffer(data.offererUserName, data.answererUserName);
            });

            socket.on('requestRejectOffer', function (message) {
                if (!message || message.type !== 'offer-rejection') {
                    return;
                }

                let offererUserName = null;

                session.nameToClientID.forEach(function (id, name) {
                    if (id === message.offererClientID) {
                        offererUserName = name;
                    }
                });

                if (logger) logger.info(`rtc: call offer from ${offererUserName} rejected by ${message.answererUserName}: ${message.reason}`);

                const offererEntry = offererUserName ? session.findByName(offererUserName) : null;

                if (offererEntry) {
                    offererEntry.socket.emit('rejectedClientOffer', {
                        offererUserName: offererUserName,
                        reason: message.reason,
                        answererUserName: message.answererUserName,
                        answererClientID: session.nameToClientID.get(message.answererUserName),
                        offererClientID: message.offererClientID
                    });
                }

                if (offererUserName) {
                    session.removeOffer(offererUserName, message.answererUserName);
                }
            });

            // Round trip that decorates a call request with the target's
            // device type (so the caller knows whether to expect video).
            socket.on('callClientFromServer', function (data) {
                if (!data) {
                    return;
                }

                socket.emit('receiveCallClientFromServer', {
                    userName: data.userName,
                    sendToUserName: data.sendToUserName,
                    isForClientSync: data.isForClientSync,
                    restartIce: data.restartIce,
                    sendToUserDeviceType: session.nameToDeviceType.get(data.sendToUserName)
                });
            });

            socket.on('sendCallEndedToServer', function (endingUserName) {
                socket.leave(session.roomName);

                session.callMembers.delete(endingUserName);

                emitToSession(session, 'callEnded', {
                    clientID: session.nameToClientID.get(endingUserName),
                    clientName: endingUserName
                }, socket.id);

                if (session.callMembers.size <= 1) {
                    emitToSession(session, 'callEndedAndEmptyRoom', null, socket.id);
                }
            });

            // Generic point-to-point relay with acknowledgement.
            socket.on('sendToClient', function (data, ackFn) {
                if (!data || !data.targetClientId) {
                    return;
                }

                const targetEntry = session.findByName(data.targetClientId);

                if (!targetEntry) {
                    if (typeof ackFn === 'function') {
                        ackFn('Target client not found');
                    }

                    return;
                }

                targetEntry.socket.emit('messageFromClient', { message: data.message, from: socket.id }, function (response) {
                    if (typeof ackFn === 'function') {
                        ackFn(response);
                    }
                });
            });
        });

        if (logger) logger.info(`RTC signaling namespace is waiting for connections...`);

        return rtc;
    }
};
