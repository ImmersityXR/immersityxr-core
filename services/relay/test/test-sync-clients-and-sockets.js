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

describe("Sync Server: Clients and Sockets", function (done) {
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

    it("should append a valid client to an empty session", function () {
        let sessions = new Map ();

        let session = {
            clients: [ ]
        };

        sessions.set(SESSION_ID, session);

        syncServer.sessions = sessions;

        syncServer.addClientToSession(session, CLIENT_ID);

        let expectedClients = [ CLIENT_ID ];

        session.clients.should.eql(expectedClients);
    });

    it("should create a session when appending a valid client to a null session, appropriately", function () {
        let sessions = new Map ();

        syncServer.sessions = sessions;

        syncServer.addClientToSession(null, CLIENT_ID, true);

        let expectedClients = [ CLIENT_ID ];

        session.clients.should.eql(expectedClients);
    });

    it("should return an error when appending a valid client to a null session, appropriately", function () {
        let sessions = new Map ();

        syncServer.sessions = sessions;
        
        let success = syncServer.addClientToSession(null, CLIENT_ID, false);

        success.should.eql(false);
    });

    it("should append a duplicate client to a session", function () {
        let sessions = new Map ();

        let session = {
            clients: [ CLIENT_ID ]
        };

        sessions.set(SESSION_ID, session);

        syncServer.sessions = sessions;

        syncServer.addClientToSession(session, CLIENT_ID);

        let expectedClients = [ CLIENT_ID, CLIENT_ID ];

        session.clients.should.eql(expectedClients);
    });

    it("should be able to bump one existing socket", function () {
        let session = {
            clients: [ CLIENT_ID, CLIENT_ID ],
            sockets: { }
        };

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

        let disconnectCount = 0;

        syncServer.disconnectedAction = function (socket, session_id, client_id) {
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);

            socket.should.equal(DUMMY_SOCKET_A);

            disconnectCount += 1;
        };

        syncServer.bumpDuplicateSockets(session, CLIENT_ID, true, DUMMY_SOCKET_B.id);

        bumpCount.should.eql(1);

        disconnectCount.should.eql(1);

        outputSession = syncServer.sessions.get(SESSION_ID);

        Object.keys(outputSession.sockets).should.eql( [ DUMMY_SOCKET_B.id ] );
    });

    it("should be able to bump two existing sockets", function () {
        let session = {
            clients: [ CLIENT_ID, CLIENT_ID, CLIENT_ID ],
            sockets: { }
        };

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

        let disconnectCount = 0;

        syncServer.disconnectedAction = function (socket, session_id, client_id) {
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);

            socket.should.be.oneOf(DUMMY_SOCKET_A, DUMMY_SOCKET_B);

            disconnectCount += 1;
        };

        syncServer.bumpDuplicateSockets(session, CLIENT_ID, true, DUMMY_SOCKET_C.id);

        bumpCount.should.eql(2);

        disconnectCount.should.eql(2);

        outputSession = syncServer.sessions.get(SESSION_ID);

        Object.keys(outputSession.sockets).should.eql( [ DUMMY_SOCKET_C.id ] );
    });

    it("should reduce two duplicate clients to one client", function () {
        syncServer.createSession(SESSION_ID);

        let { success, session } = syncServer.getSession(SESSION_ID);

        session.should.not.eql(null);

        session.clients.should.not.eql(null);

        session.clients.length.should.equal(0);

        syncServer.addClientToSession(session, CLIENT_ID);

        session.clients.length.should.equal(1);

        syncServer.addClientToSession(session, CLIENT_ID);

        session.clients.length.should.equal(2);

        syncServer.removeDuplicateClientsFromSession(session, CLIENT_ID);

        session.clients.length.should.equal(1);
    });

    it("should be able to remove a socket", function () {
        let inputSession = {
            clients: [CLIENT_ID, CLIENT_ID],
            sockets: { }
        };

        inputSession.sockets[DUMMY_SOCKET_A.id] = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A };

        inputSession.sockets[DUMMY_SOCKET_B.id] = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B };

        syncServer.createSession(SESSION_ID);

        syncServer.sessions.set(SESSION_ID, inputSession);

        Object.keys(inputSession.sockets).length.should.equal(2);

        let removeSuccess = syncServer.removeSocketFromSession(DUMMY_SOCKET_A, SESSION_ID);

        removeSuccess.should.equal(true);
        
        let { success, session } = syncServer.getSession(SESSION_ID);

        Object.keys(session.sockets).length.should.equal(1);
    });

    it("should return true if it found a socket", function () {
        throw Error("unimplemented");
    });

    it("should return false if it couldn't find a socket", function () {
        throw Error("unimplemented");
    });

    it("should be able to remove a socket and client from a session then disconnect the socket", function () {
        throw Error("unimplemented");
    });

    it("should return all session sockets for a given client ID", function () {
        syncServer.sessions = new Map ();

        let session =  {
                clients: [CLIENT_ID],
                sockets: {
                    socketA: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A }
                }
        };

        syncServer.sessions.set(SESSION_ID, session);

        let sockets = syncServer.getSessionSocketsFromClientId(session, CLIENT_ID, null);

        sockets.should.eql([ DUMMY_SOCKET_A ]);
        
        syncServer.notifyBumpAction = function (session_id, socket) {
            session_id.should.equal(SESSION_ID);

            socket.should.eql( { dummy: "socketA", id: "DEADBEEF" } );
        };

        syncServer.sessions.set(SESSION_ID, {
            clients: [CLIENT_ID, CLIENT_ID],
            sockets: {
                socketA: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A },
                socketB: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B }
            }
        });

        session = syncServer.sessions.get(SESSION_ID);

        sockets = syncServer.getSessionSocketsFromClientId(session, CLIENT_ID, null);

        sockets.should.eql([ DUMMY_SOCKET_A, DUMMY_SOCKET_B ]);
    });

    it("should exclude a socket when requesting session sockets", function () {
        let session = {
            clients: [ CLIENT_ID, CLIENT_ID, CLIENT_ID ],
            sockets: {
                socketA: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A },
                socketB: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B },
                socketC: { client_id: CLIENT_ID, socket: DUMMY_SOCKET_C },
            }
        };

        syncServer.sessions.set(SESSION_ID, session);

        let sockets = syncServer.getSessionSocketsFromClientId(session, CLIENT_ID, DUMMY_SOCKET_C.id);

        sockets.should.eql( [ DUMMY_SOCKET_A, DUMMY_SOCKET_B ] );
    });
});
