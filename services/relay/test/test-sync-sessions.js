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
        
        syncServer.notifyBumpAction = function () { 
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

        let sessionType = typeof singularEntry;

        sessionType.should.not.equal("undefined");

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