// University of Illinois/NCSA
// Open Source License
// http://otm.illinois.edu/disclose-protect/illinois-open-source-license

// Copyright (c) 2020 Grainger Engineering Library Information Center.  All rights reserved.

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

/* jshint esversion: 6 */

// TODO: add test for getting state
// TODO: add test for connecting without valid credentials

var assert = require("assert");

var should = require("should");

const { debug } = require("winston");

const Session = require("../session");
    
const SESSION_ID = 123;

const CLIENT_ID = 456;

const DUMMY_SOCKET_A = { "dummy": "socketA", "id": "DEADBEEF" };

const DUMMY_SOCKET_B = { "dummy": "socketB", "id": "LIVEBEEF" };

const DUMMY_SOCKET_C = { "dummy": "socketC", "id": "SCHRBEEF" };

describe("Session", function (done) {
    beforeEach(function () {
    });

    //TODO implement this if we ever keep a global list of clients

    /*
    it("should have 0 clients on startup", function () {
    });
    */
   
    it("should create one singular, correct sessions object", function () {
        const session_id = 123;
        
        let session = new Session(session_id);

        let sessionType = typeof session;

        sessionType.should.not.equal("undefined");
        
        session.should.not.equal(null);

        const expectedSession = {
            id: session_id,
            sockets: {}, // socket.id -> client_id
            clients: [],
            entities: [],
            scene: null,
            isRecording: false,
            start: Date.now(),
            recordingStart: 0,
            seq: 0,
            // NOTE(rob): DEPRECATED, use message_buffer. 8/3/2021
            // writers: {
            //     pos: {
            //         buffer: Buffer.alloc(syncServer.positionWriteBufferSize()),
            //         cursor: 0
            //     },
            //     int: {
            //         buffer: Buffer.alloc(syncServer.interactionWriteBufferSize()),
            //         cursor: 0
            //     }
            // },
            message_buffer: []
        };

        session.id.should.equal(expectedSession.id);
        
        assert.deepStrictEqual(session.sockets, expectedSession.sockets);
        
        assert.deepStrictEqual(session.clients, expectedSession.clients);

        assert.deepStrictEqual(session.entities, expectedSession.entities);

        assert.deepStrictEqual(session.scene, expectedSession.scene);

        assert.deepStrictEqual(session.isRecording, expectedSession.isRecording);

        // Do not check start time for strict equality.
        assert(Math.abs(session.start - expectedSession.start) < 1000);

        assert.deepStrictEqual(session.recordingStart, expectedSession.recordingStart);

        assert.deepStrictEqual(session.seq, expectedSession.seq);

        assert.deepStrictEqual(session.message_buffer, expectedSession.message_buffer);
    });   

    it("should append a valid client to an empty session", function () {
        let session = new Session();

        session.addClient(CLIENT_ID);

        let expectedClients = [ CLIENT_ID ];

        session.clients.should.eql(expectedClients);
    });

    it("should append a duplicate client to a session", function () {
        let session = new Session();

        session.addClient(CLIENT_ID);

        let expectedClients = [ CLIENT_ID ];

        session.clients.should.eql(expectedClients);

        session.addClient(CLIENT_ID);

        expectedClients = [ CLIENT_ID, CLIENT_ID ];

        session.clients.should.eql(expectedClients);
    });

    it("should reduce two duplicate clients to one client", function () {
        let session = new Session();

        session.clients.length.should.equal(0);

        session.addClient(CLIENT_ID);

        session.clients.length.should.equal(1);

        session.addClient(CLIENT_ID);

        session.clients.length.should.equal(2);

        session.removeDuplicateClients(CLIENT_ID);

        session.clients.length.should.equal(1);

        let expectedClients = [ CLIENT_ID ];

        session.clients.should.eql(expectedClients);
    });

    it("should return true if it found a socket", function () {
        let session = new Session();

        Object.keys(session.sockets).length.should.equal(0);

        session.addSocket(DUMMY_SOCKET_A, CLIENT_ID);

        let success = session.hasSocket(DUMMY_SOCKET_A);

        success.should.equal(true);
    });

    it("should return false if it couldn't find a socket", function () {
        let session = new Session();

        Object.keys(session.sockets).length.should.equal(0);

        session.addSocket(DUMMY_SOCKET_A, CLIENT_ID);

        let success = session.hasSocket(DUMMY_SOCKET_B);

        success.should.equal(false);
    });

    it("should be able to remove a socket", function () {
        let session = new Session();

        Object.keys(session.sockets).length.should.equal(0);

        session.addSocket(DUMMY_SOCKET_A, CLIENT_ID);

        Object.keys(session.sockets).length.should.equal(1);

        session.addSocket(DUMMY_SOCKET_B, CLIENT_ID);

        Object.keys(session.sockets).length.should.equal(2);

        let success = session.removeSocket(DUMMY_SOCKET_A);

        success.should.equal(true);

        Object.keys(session.sockets).length.should.equal(1);

        let expectedSockets = {};

        expectedSockets[DUMMY_SOCKET_B.id] = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B };

        session.sockets.should.eql(expectedSockets);
    });

    it("should return all session sockets for a given client ID", function () {
        let session = new Session();

        session.clients = [CLIENT_ID];

        session.sockets = {
            socketA: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A }
        };

        let sockets = session.getSocketsFromClientId(CLIENT_ID, null);

        sockets.should.eql([ DUMMY_SOCKET_A ]);

        session.addSocket(DUMMY_SOCKET_B, CLIENT_ID);
        
        // syncServer.notifyBumpAndMakeSocketLeaveSessionAction = function (session_id, socket) {
        //     session_id.should.equal(SESSION_ID);

        //     socket.should.eql( { dummy: "socketA", id: "DEADBEEF" } );
        // };

        // syncServer.sessions.set(SESSION_ID, {
        //     clients: [CLIENT_ID, CLIENT_ID],
        //     sockets: {
        //         socketA: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A },
        //         socketB: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B }
        //     }
        // });

        sockets = session.getSocketsFromClientId(CLIENT_ID, null);

        sockets.should.eql([ DUMMY_SOCKET_A, DUMMY_SOCKET_B ]);
    });

    it("should exclude a socket when requesting session sockets", function () {
        let session = new Session();

        session.clients = [ CLIENT_ID, CLIENT_ID, CLIENT_ID ];

        session.sockets = {
            socketA: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A },
            socketB: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B },
            socketC: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_C },
        };

        let sockets = session.getSocketsFromClientId(CLIENT_ID, DUMMY_SOCKET_C.id);

        sockets.should.eql( [ DUMMY_SOCKET_A, DUMMY_SOCKET_B ] );
    });
});
