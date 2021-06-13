var assert = require("assert");

const sync = require("../sync");

describe("Sync Server: Sessions Map", function (done) {

    beforeEach(() => {

        let syncServer = sync.initGlobals();
    });

    it("should create the correct sessions object", function () {

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
                    buffer: Buffer.alloc(sync.POS_WRITE_BUFFER_SIZE),
                    cursor: 0
                },
                int: {
                    buffer: Buffer.alloc(sync.INT_WRITE_BUFFER_SIZE),
                    cursor: 0
                }
            }
        };

        const session_id = 123;

        syncServer.createSession(session_id);
        
        assert.notStrictEqual(syncServer.sessions.get(session_id), 
            expectedSession);
    });
});