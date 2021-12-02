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
    
const SESSION_ID = 123;

const CLIENT_ID = 456;

const DUMMY_SOCKET_A = { "dummy": "socketA", "id": "DEADBEEF" };

const DUMMY_SOCKET_B = { "dummy": "socketB", "id": "LIVEBEEF" };

const DUMMY_SOCKET_C = { "dummy": "socketC", "id": "SCHRBEEF" };

describe("Sync Server: Integration", function (done) {
    beforeEach(function () {
        syncServer.notifyBumpAction = function () { 
            throw Error("An unexpected bump occurred.");
        };
        
        syncServer.reconnectAction = function () { 
            throw Error("An unexpected reconnect occurred.");
        };
        
        syncServer.disconnectedAction = function () { 
            throw Error("An unexpected disconnect occurred.");
        };

        syncServer.requestToJoinSessionAction = function (session_id, client_id, socket) {
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);
        };

        syncServer.initGlobals();
    });
    
    it("should create a correct session object when a client joins", function () {
        let success = syncServer.addSocketAndClientToSession(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

        success.should.equal(true); // we passed in err = null, so it should succeed.

        sessions = syncServer.getSessions();

        sessions.size.should.equal(1);

        let singularEntry;

        // TODO(Brandon) - are we supposed to dip into the syncServer.sessions variable directly like this? 

        for (let entry of sessions) {
            singularEntry = entry;
        }

        singularEntry[0].should.equal(SESSION_ID);

        //TODO - factor this out into a separate test? - it("should create a correct clients array"

        const expectedClients = [ CLIENT_ID ];

        assert(singularEntry[1].clients != null);

        singularEntry[1].clients.length.should.equal(expectedClients.length);

        singularEntry[1].clients[0].should.equal(expectedClients[0]);

        //TODO - factor this out into a separate test? - it("should create a correct sockets object"

        const expectedSockets = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A };

        let numSockets = Object.keys(singularEntry[1].sockets).length;

        numSockets.should.equal(1);

        singularEntry[1].sockets[DUMMY_SOCKET_A.id].should.eql(expectedSockets);

        //

        //this.addClientToSession(session, client_id);

        //this.bumpDuplicateSockets(session, client_id, do_bump_duplicates, socket.id);

        // socket to client mapping
        //this.addSocketToSession(session, socket, client_id);

        //this.requestToJoinSessionAction(session_id, client_id);
    });

    it("should create a correct clients array", function () {
        let success = syncServer.addSocketAndClientToSession(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

        sessions = syncServer.getSessions();

        let singularEntry;

        for (let entry of sessions) {
            singularEntry = entry;
        }

        const expectedClients = [ CLIENT_ID ];

        singularEntry[1].clients.length.should.equal(expectedClients.length);

        singularEntry[1].clients[0].should.equal(expectedClients[0]);
    });

    it("should create a correct sockets object", function () {
        let success = syncServer.addSocketAndClientToSession(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

        sessions = syncServer.getSessions();

        let singularEntry;

        for (let entry of sessions) {
            singularEntry = entry;
        }

        const socketA = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A };

        let numSockets = Object.keys(singularEntry[1].sockets).length;

        numSockets.should.equal(1);

        singularEntry[1].sockets[DUMMY_SOCKET_A.id].should.eql(socketA);
    });

    it("should perform a bump properly", function () {
        syncServer.notifyBumpAction = function (session_id, socket) {
            session_id.should.equal(SESSION_ID);

            socket.should.eql( { dummy: "socketA", id: "DEADBEEF" } );
        };
        
        syncServer.disconnectedAction = function (socket, session_id, client_id) {
            socket.should.eql( { dummy: "socketA", id: "DEADBEEF" } );
            
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);
        };
        
        let success = syncServer.addSocketAndClientToSession(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

        success = syncServer.addSocketAndClientToSession(null, DUMMY_SOCKET_B, SESSION_ID, CLIENT_ID, true);

        success.should.equal(true); // we passed in err = null, so it should succeed.

        sessions = syncServer.getSessions();

        // TODO(Brandon) - are we supposed to dip into the syncServer.sessions variable directly like this? 

        for (let entry of sessions) {
            singularEntry = entry;
        }

        const expectedClients = [ CLIENT_ID ];

        singularEntry[1].clients.length.should.equal(expectedClients.length);

        singularEntry[1].clients[0].should.equal(expectedClients[0]);

        numSockets = Object.keys(singularEntry[1].sockets).length;

        numSockets.should.equal(1);

        const socketB = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B };

        assert(singularEntry[1].sockets[DUMMY_SOCKET_B.id] != null);

        singularEntry[1].sockets[DUMMY_SOCKET_B.id].should.eql(socketB);

        assert(singularEntry[1].sockets[DUMMY_SOCKET_A.id] == null);
    });
});