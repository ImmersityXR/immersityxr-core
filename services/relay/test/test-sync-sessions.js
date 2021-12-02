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

describe("Sync Server: Sessions", function (done) {
    beforeEach(function () {
        syncServer.initGlobals();
        
        syncServer.notifyBumpAndMakeSocketLeaveSessionAction = function () { 
            throw Error("An unexpected bump occurred.");
        };
        
        syncServer.reconnectAction = function () { 
            throw Error("An unexpected reconnect occurred.");
        };
        
        syncServer.disconnectedAction = function () { 
            throw Error("An unexpected disconnect occurred.");
        };
    });

    it("should have 0 sessions on startup", function () {
        let sessions = syncServer.getSessions();

        sessions.size.should.equal(0);
    });

    it("should create one singular sessions object", function () {
        const session_id = 123;
        
        let sessions = syncServer.getSessions();

        sessions.size.should.equal(0);

        syncServer.createSession(session_id);
        
        sessions = syncServer.getSessions();

        let count = 0;

        let singularEntry;

        // TODO(Brandon) - are we supposed to dip into the syncServer.sessions variable directly like this? 

        for (let entry of sessions) {
            count += 1;

            singularEntry = entry;
        }

        count.should.equal(1);

        let sessionType = typeof singularEntry;

        sessionType.should.not.equal("undefined");

        singularEntry[0].should.equal(session_id);
    });   

    it("should return failure on getting a nonexistent session", function () {
        let { success, session } = syncServer.getSession(SESSION_ID);

        success.should.equal(false);

        let sessionType = typeof session;

        sessionType.should.not.equal("undefined");

        assert.strictEqual(session, null);
    });

    it("should return success for getting an existing session", function () {
        let inputSession = {
            clients: [ CLIENT_ID ],
            sockets: { 
                socketA: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A }
            }
        };

        syncServer.sessions.set(SESSION_ID, inputSession);

        let { success, session } = syncServer.getSession(SESSION_ID);

        success.should.equal(true);

        let sessionType = typeof session;

        sessionType.should.not.equal("undefined");

        assert(session !== null);

        session.should.eql(inputSession);
    });
});