/* jshint esversion: 6 */

var assert = require("assert");

var should = require("should");
const { debug } = require("winston");

const syncServer = require("../sync");

describe("Sync Server", function (done) {

    beforeEach(function () {

        syncServer.initGlobals();
    });

    it("should have 0 sessions on startup", function () {
        
        let sessions = syncServer.getSessions();

        sessions.size.should.equal(0);
    });

    it("should create one singular, correct sessions object", function () {

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

        singularEntry[0].should.equal(session_id);

        const expectedSession = {

            sockets: {}, // socket.id -> client_id
            clients: [],
            entities: [],
            scene: null,
            isRecording: false,
            start: Date.now(),
            recordingStart: 0,
            seq: 0,
            writers: {
                pos: {
                    buffer: Buffer.alloc(syncServer.positionWriteBufferSize()),
                    cursor: 0
                },
                int: {
                    buffer: Buffer.alloc(syncServer.interactionWriteBufferSize()),
                    cursor: 0
                }
            }
        };
        
        assert.deepStrictEqual(singularEntry[1].sockets, expectedSession.sockets);
        
        assert.deepStrictEqual(singularEntry[1].clients, expectedSession.clients);

        assert.deepStrictEqual(singularEntry[1].entities, expectedSession.entities);

        assert.deepStrictEqual(singularEntry[1].scene, expectedSession.scene);

        assert.deepStrictEqual(singularEntry[1].isRecording, expectedSession.isRecording);

        // Do not check start time for strict equality.
        assert(Math.abs(singularEntry[1].start - expectedSession.start) < 1000);

        assert.deepStrictEqual(singularEntry[1].recordingStart, expectedSession.recordingStart);

        assert.deepStrictEqual(singularEntry[1].seq, expectedSession.seq);

        assert.deepStrictEqual(singularEntry[1].writers, expectedSession.writers);
    });

    //TODO implement this if we ever keep a global list of clients

    /*
    it("should have 0 clients on startup", function () {
        
    });
    */
});

describe("Sync Server: Clients", function (done) {
    
    const SESSION_ID = 123;

    const CLIENT_ID = 456;

    const DUMMY_SOCKET_A = { "dummy": "socketA", "id": "DEADBEEF" };

    const DUMMY_SOCKET_B = { "dummy": "socketB", "id": "LIVEBEEF" };

    beforeEach(function () {
        syncServer.joinSessionAction = function (session_id, client_id) {

            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);
        };
    });

    it("should create a correct session object when a client joins", function () {

        let success = syncServer.handleJoin(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

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

        singularEntry[1].clients.length.should.equal(expectedClients.length);

        singularEntry[1].clients[0].should.equal(expectedClients[0]);

        //TODO - factor this out into a separate test? - it("should create a correct sockets object"

        const expectedSockets = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A };

        let numSockets = Object.keys(singularEntry[1].sockets).length;

        numSockets.should.equal(1);

        singularEntry[1].sockets[DUMMY_SOCKET_A.id].should.eql(expectedSockets);
    });
    

    it("should perform a bump properly", function () {

        let success = syncServer.handleJoin(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

        sessions = syncServer.getSessions();

        let singularEntry;

        // TODO(Brandon) - are we supposed to dip into the syncServer.sessions variable directly like this? 

        for (let entry of sessions) {

            singularEntry = entry;
        }

        //TODO - factor this out into a separate test? - it("should create a correct clients array"

        const expectedClients = [ CLIENT_ID ];

        singularEntry[1].clients.length.should.equal(expectedClients.length);

        singularEntry[1].clients[0].should.equal(expectedClients[0]);

        //TODO - factor this out into a separate test? - it("should create a correct sockets object"

        const socketA = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_A };

        let numSockets = Object.keys(singularEntry[1].sockets).length;

        numSockets.should.equal(1);

        singularEntry[1].sockets[DUMMY_SOCKET_A.id].should.eql(socketA);
        
        // duplicated here
        
        syncServer.bumpAction = function (session_id, socket) {
            
            session_id.should.equal(SESSION_ID);

            socket.should.eql( { dummy: "socketA", id: "DEADBEEF" } );
        };
        
        syncServer.disconnectAction = function (socket, session_id, client_id) {

            socket.should.eql( { dummy: "socketA", id: "DEADBEEF" } );
            
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);
        };

        success = syncServer.handleJoin(null, DUMMY_SOCKET_B, SESSION_ID, CLIENT_ID, true);

        success.should.equal(true); // we passed in err = null, so it should succeed.

        sessions = syncServer.getSessions();

        // TODO(Brandon) - are we supposed to dip into the syncServer.sessions variable directly like this? 

        for (let entry of sessions) {

            singularEntry = entry;
        }

        //TODO - factor this out into a separate test? - it("should create a correct clients array"

        singularEntry[1].clients.length.should.equal(expectedClients.length);

        singularEntry[1].clients[0].should.equal(expectedClients[0]);

        //TODO - factor this out into a separate test? - it("should create a correct sockets object"

        numSockets = Object.keys(singularEntry[1].sockets).length;

        numSockets.should.equal(1);

        const socketB = { client_id: CLIENT_ID, socket: DUMMY_SOCKET_B };

        singularEntry[1].sockets[DUMMY_SOCKET_A.id].should.eql(socketB);
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

    it("should return all session sockets for a given client ID", function () {

        syncServer.createSession(SESSION_ID);

        let sockets = syncServer.getSessionSocketsFromClientId(session, CLIENT_ID, null);

        sockets.should.eql([]);

        syncServer.addClientToSession(session, CLIENT_ID);

        sockets = syncServer.getSessionSocketsFromClientId(session, CLIENT_ID, null);

        syncServer.handleJoin(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

        sockets.should.eql([ DUMMY_SOCKET_A ]);

        syncServer.handleJoin(null, DUMMY_SOCKET_B, SESSION_ID, CLIENT_ID, true);

        sockets.should.eql([ DUMMY_SOCKET_A, DUMMY_SOCKET_B ]);
    });
});