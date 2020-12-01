// playbackClient request session data from relay server by id.
// on update, client allocates new Float32Array with a constant
// field size, then unpacks relay data into array. 

var io = require('socket.io-client');
const { assert } = require('console');
var socket = io.connect('http://localhost:3000', { secure: true, reconnect: true, rejectUnauthorized : false } );
socket.emit('connection');

let client_id = 98765;
let session_id = 1;

// join session by id
var joinIds = [session_id, client_id]
socket.emit('join', joinIds);
socket.emit('state', { session_id: session_id, client_id: client_id });
socket.on('state', function(data) {
    console.log(data);
    socket.close();
    process.exit(1);
});
