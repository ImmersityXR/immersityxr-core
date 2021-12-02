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

const syncServer = require("../sync");

const Session = require("../session");
    
const SESSION_ID = 123;

const CLIENT_ID = 456;

const DUMMY_SOCKET_A = { "dummy": "socketA", "id": "DEADBEEF" };

const DUMMY_SOCKET_B = { "dummy": "socketB", "id": "LIVEBEEF" };

const DUMMY_SOCKET_C = { "dummy": "socketC", "id": "SCHRBEEF" };

describe("Sync Server: Clients and Sockets", function (done) {
    beforeEach(function () {
        syncServer.notifyBumpAction = function () { 
            throw Error("An unexpected bump occurred.");
        };
        
        syncServer.reconnectAction = function () { 
            throw Error("An unexpected reconnect occurred.");
        };
        
        syncServer.disconnectAction = function () { 
            throw Error("An unexpected disconnect occurred.");
        };

        syncServer.requestToJoinSessionAction = function (session_id, client_id) {
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);
        };

        syncServer.initGlobals();
    });

    //TODO implement this if we ever keep a global list of clients

    /*
    it("should have 0 clients on startup", function () {
    });
    */

    it("should return an error when appending a valid client to a null session", function () {
        let sessions = new Map ();

        syncServer.sessions = sessions;
        
        let success = syncServer.addClientToSession(null, CLIENT_ID);

        success.should.eql(false);
    });

    it("should be able to bump one existing socket", function () {
        let session = new Session();
        
        session.clients = [ CLIENT_ID, CLIENT_ID ];

        session.sockets = { };

        session.sockets[DUMMY_SOCKET_A.id] = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A };

        session.sockets[DUMMY_SOCKET_B.id] = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B };

        syncServer.sessions.set(SESSION_ID, session);

        let outputSession = syncServer.sessions.get(SESSION_ID);

        Object.keys(outputSession.sockets).should.eql( [ DUMMY_SOCKET_A.id, DUMMY_SOCKET_B.id ] );

        let bumpCount = 0;

        syncServer.notifyBumpAction = function (session_id, socket) {
            session_id.should.equal(SESSION_ID);

            socket.should.equal(DUMMY_SOCKET_A);

            bumpCount += 1;
        };

        let leaveCount = 0;

        syncServer.makeSocketLeaveSessionAction = function (session_id, socket) {
            session_id.should.equal(SESSION_ID);

            socket.should.equal(DUMMY_SOCKET_A);

            leaveCount += 1;
        };

        let disconnectCount = 0;

        syncServer.disconnectAction = function (socket, session_id, client_id) {
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);

            socket.should.equal(DUMMY_SOCKET_A);

            disconnectCount += 1;
        };

        syncServer.bumpDuplicateSockets(SESSION_ID, CLIENT_ID, true, DUMMY_SOCKET_B.id);

        bumpCount.should.eql(1);

        leaveCount.should.eql(1);

        disconnectCount.should.eql(1);

        outputSession = syncServer.sessions.get(SESSION_ID);

        Object.keys(outputSession.sockets).should.eql( [ DUMMY_SOCKET_B.id ] );
    });

    it("should be able to bump two existing sockets", function () {
        let session = new Session(); 

        session.clients = [ CLIENT_ID, CLIENT_ID, CLIENT_ID ];

        session.sockets = { };

        session.sockets[DUMMY_SOCKET_A.id] = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A };

        session.sockets[DUMMY_SOCKET_B.id] = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B };

        session.sockets[DUMMY_SOCKET_C.id] = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_C };

        syncServer.sessions.set(SESSION_ID, session);

        let outputSession = syncServer.sessions.get(SESSION_ID);

        Object.keys(outputSession.sockets).should.eql( [ DUMMY_SOCKET_A.id, DUMMY_SOCKET_B.id, DUMMY_SOCKET_C.id ] );

        let bumpCount = 0;

        syncServer.notifyBumpAction = function (session_id, socket) {
            session_id.should.equal(SESSION_ID);

            socket.should.be.oneOf(DUMMY_SOCKET_A, DUMMY_SOCKET_B);

            bumpCount += 1;
        };

        let leaveCount = 0;

        syncServer.makeSocketLeaveSessionAction = function (session_id, socket) {
            session_id.should.equal(SESSION_ID);

            socket.should.be.oneOf(DUMMY_SOCKET_A, DUMMY_SOCKET_B);

            leaveCount += 1;
        };

        let disconnectCount = 0;

        syncServer.disconnectAction = function (socket, session_id, client_id) {
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);

            socket.should.be.oneOf(DUMMY_SOCKET_A, DUMMY_SOCKET_B);

            disconnectCount += 1;
        };

        syncServer.bumpDuplicateSockets(SESSION_ID, CLIENT_ID, true, DUMMY_SOCKET_C.id);

        bumpCount.should.eql(2);

        leaveCount.should.eql(2);

        disconnectCount.should.eql(2);

        outputSession = syncServer.sessions.get(SESSION_ID);

        Object.keys(outputSession.sockets).should.eql( [ DUMMY_SOCKET_C.id ] );
    });
});
