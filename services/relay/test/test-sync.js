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
        
        syncServer.bumpAction = function () { 
            throw Error("An unexpected bump occurred.");
        };
        
        syncServer.reconnectAction = function () { 
            throw Error("An unexpected reconnect occurred.");
        };
        
        syncServer.disconnectAction = function () { 
            throw Error("An unexpected disconnect occurred.");
        };
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
        
        assert.deepStrictEqual(singularEntry[1].sockets, expectedSession.sockets);
        
        assert.deepStrictEqual(singularEntry[1].clients, expectedSession.clients);

        assert.deepStrictEqual(singularEntry[1].entities, expectedSession.entities);

        assert.deepStrictEqual(singularEntry[1].scene, expectedSession.scene);

        assert.deepStrictEqual(singularEntry[1].isRecording, expectedSession.isRecording);

        // Do not check start time for strict equality.
        assert(Math.abs(singularEntry[1].start - expectedSession.start) < 1000);

        assert.deepStrictEqual(singularEntry[1].recordingStart, expectedSession.recordingStart);

        assert.deepStrictEqual(singularEntry[1].seq, expectedSession.seq);

        // NOTE(rob): DEPRECATED, use message_buffer. 8/3/2021
        // assert.deepStrictEqual(singularEntry[1].writers, expectedSession.writers);

        assert.deepStrictEqual(singularEntry[1].message_buffer, expectedSession.message_buffer);
    });   

    it("should return failure on getting a nonexistent session", function () {
        let { success, session } = syncServer.getSession(SESSION_ID);

        success.should.equal(false);

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

        assert(session !== null);

        session.should.eql(inputSession);
    });
});

describe("Sync Server: Clients and Sockets", function (done) {
    beforeEach(function () {
        syncServer.bumpAction = function () { 
            throw Error("An unexpected bump occurred.");
        };
        
        syncServer.reconnectAction = function () { 
            throw Error("An unexpected reconnect occurred.");
        };
        
        syncServer.disconnectAction = function () { 
            throw Error("An unexpected disconnect occurred.");
        };

        syncServer.joinSessionAction = function (session_id, client_id) {
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

    it("should be able to bump an existing socket", function () {
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

        syncServer.bumpAction = function (session_id, socket) {
            session_id.should.equal(SESSION_ID);

            socket.should.be.oneOf(DUMMY_SOCKET_A, DUMMY_SOCKET_B);

            bumpCount += 1;
        };

        let disconnectCount = 0;

        syncServer.disconnectAction = function (socket, session_id, client_id) {
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
        
        syncServer.bumpAction = function (session_id, socket) {
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

describe("Sync Server: Integration", function (done) {
    beforeEach(function () {
        syncServer.bumpAction = function () { 
            throw Error("An unexpected bump occurred.");
        };
        
        syncServer.reconnectAction = function () { 
            throw Error("An unexpected reconnect occurred.");
        };
        
        syncServer.disconnectAction = function () { 
            throw Error("An unexpected disconnect occurred.");
        };

        syncServer.joinSessionAction = function (session_id, client_id) {
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);
        };

        syncServer.initGlobals();
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

        //this.joinSessionAction(session_id, client_id);
    });

    it("should create a correct clients array", function () {
        let success = syncServer.handleJoin(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

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
        let success = syncServer.handleJoin(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

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
        syncServer.bumpAction = function (session_id, socket) {
            session_id.should.equal(SESSION_ID);

            socket.should.eql( { dummy: "socketA", id: "DEADBEEF" } );
        };
        
        syncServer.disconnectAction = function (socket, session_id, client_id) {
            socket.should.eql( { dummy: "socketA", id: "DEADBEEF" } );
            
            session_id.should.equal(SESSION_ID);

            client_id.should.equal(CLIENT_ID);
        };
        
        let success = syncServer.handleJoin(null, DUMMY_SOCKET_A, SESSION_ID, CLIENT_ID, true);

        success = syncServer.handleJoin(null, DUMMY_SOCKET_B, SESSION_ID, CLIENT_ID, true);

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