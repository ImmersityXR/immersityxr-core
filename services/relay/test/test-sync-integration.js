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
        syncServer.notifyBumpAndMakeSocketLeaveSessionAction = function () { 
            throw Error("An unexpected bump occurred.");
        };
        
        syncServer.reconnectAction = function () { 
            throw Error("An unexpected reconnect occurred.");
        };
        
        syncServer.disconnectedAction = function () { 
            throw Error("An unexpected disconnect occurred.");
        };

        syncServer.requestToJoinSessionAction = function (session_id, client_id) {
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
        syncServer.notifyBumpAndMakeSocketLeaveSessionAction = function (session_id, socket) {
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