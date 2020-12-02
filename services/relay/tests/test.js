
var io = require('socket.io-client');
const { assert } = require('console');

const DEFAULT_LOCAL_RELAY = `http://localhost:3000`;

const INTERACTION_LOOK          = 0;
const INTERACTION_LOOK_END      = 1;
const INTERACTION_RENDER        = 2;
const INTERACTION_RENDER_END    = 3;
const INTERACTION_GRAB          = 4;
const INTERACTION_GRAB_END      = 5;
const INTERACTION_SCENE_CHANGE  = 6;
const INTERACTION_UNSET         = 7; // NOTE(rob): this value is currently unused. 2020-12-1
const INTERACTION_LOCK          = 8;
const INTERACTION_LOCK_END      = 9;

// parse command line args
let args = process.argv;
let relayHost = args[2] || DEFAULT_LOCAL_RELAY;
let relaySecure = args[3] || false;
if (relaySecure === "true") {
    relaySecure = true;
} else {
    relaySecure = false;
}
console.log(`Using local relay: ${relayHost}`)

// test connections
const client1 = io.connect(relayHost, { secure: relaySecure, reconnection: false, rejectUnauthorized : false } );
const client2 = io.connect(relayHost, { secure: relaySecure, reconnection: false, rejectUnauthorized : false } );

// client and session
let sessionID = 1;
let client1ID = 1;
let client2ID = 2;

// test joined events from relay
// first connecting client should receive events for both its id
// and all subsequent client join events
let joinedClients = [];
client1.on('joined', (id) => {
    joinedClients.push(id);
    if (joinedClients.length == 2) {
        let pass = (joinedClients[0] === 1 && joinedClients[1] === 2);
        console.log('[TEST] Joined event test passe:', true);
    }
});
// test join session
client1.emit('join', [sessionID, client1ID]);
client2.emit('join', [sessionID, client2ID]);


// test client updates
let updatePacket = [
    0,       // update sequence number
    1,       // session ID
    1,       // client ID
    1,       // entity ID
    3,       // entity type 
    1,       // scale
    0,       // rotation x
    1,       // rotation y
    2,       // rotation z
    3,       // rotation w
    0,       // position x
    0,       // position y
    0,       // position z
    1       // dirty bit (always 1 on update)
]

client2.on('relayUpdate', (data) => {
    for(let i = 0; i < data.length; i++) {
        if (updatePacket[i] !== data[i]) {
            console.log('[TEST] Relay update passed:', false);
            break;
        }
    }
    console.log('[TEST] Relay update pass:', true);

})
client1.emit('update', updatePacket);


// test interaction event
let interactionPacket = [
    0, // sequence number
    1, // session ID
    1, // client ID
    0, // source entity ID
    1, // targe entity ID
    INTERACTION_LOOK, // interaction type
    1, // dirty bit

]

client2.on('interactionUpdate', (data) => {
    for(let i = 0; i < data.length; i++) {
        assert(interactionPacket[i] === data[i])
    }
});
client1.emit('interact', interactionPacket);

// client1.emit('state', { session_id: sessionID, client_id: client1ID });

// client1.on('state', function(data) {
//     console.log(data);
//     client1.close();
//     process.exit(1);
// });
