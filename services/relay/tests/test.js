
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

function logResult(status, name) {
    let result = status ? 'PASS' : 'FAIL'
    let color = status ? '\x1b[32m' : '\x1b[31m' 
    console.log(`[ ${color}${result}\x1b[0m ] ... ${name}`);
}


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
console.log('======= Running tests =======\n')

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
        let stat = (joinedClients[0] === 1 && joinedClients[1] === 2);
        logResult(stat, '"joined" event');
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
    let pass = false;
    for(let i = 0; i < data.length; i++) {
        if (updatePacket[i] !== data[i]) {
            pass = false;
            break;
        } else {
            pass = true;
        }
    }
    logResult(pass, '"update" event');

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

client2.once('interactionUpdate', (data) => {
    let pass = false;
    for(let i = 0; i < data.length; i++) {
        if(interactionPacket[i] !== data[i]) {
            pass = false;
            break
        } else {
            pass = true;
        }
    }
    logResult(pass, '"interaction" event');
});
client1.emit('interact', interactionPacket);


// test state events
// unregister interaction event handler for previous test

let stateUpdatePacket1 = [
    0, // sequence number
    1, // session ID
    1, // client ID
    0, // source entity ID
    1, // targe entity ID
    INTERACTION_RENDER, // interaction type
    1, // dirty bit
]
let stateUpdatePacket2 = [
    0, // sequence number
    1, // session ID
    1, // client ID
    0, // source entity ID
    2, // targe entity ID
    INTERACTION_SCENE_CHANGE, // interaction type
    1, // dirty bit
]
// client 1 updates the session state
client1.emit('interact', stateUpdatePacket1);
client1.emit('interact', stateUpdatePacket2);

// client 2 state update handler
client2.once('state', (data) => {
    let pass = false;
    if (data.clients[0] === 1 &&
        data.clients[1] === 2 &&
        data.entities[0].id === 1 &&
        data.entities[0].render === true &&
        data.scene === 2 &&
        data.isRecording === false
    ) {
        pass = true;    
    }
    logResult(pass, '"state" event');

})

// client 2 requests session state
client2.emit('state', {
    session_id: 1,
    client_id: 2,
    version: 2
});


// test start and end recording
setTimeout(() => { // delay a bit to wait for previous test to finish
    client2.once('state', (data) => {
        let pass = data.isRecording === true;
        logResult(pass, '"start_recording" event');
    });
    client1.emit('start_recording', 1);
    client2.emit('state', {
        session_id: 1,
        client_id: 2,
        version: 2
    });
    client1.emit('end_recording', 1);
}, 50)

setTimeout(() => {
    console.log('\n=========== Done. ===========')
    client1.close();
    client2.close();
    process.exit();
}, 1000)

