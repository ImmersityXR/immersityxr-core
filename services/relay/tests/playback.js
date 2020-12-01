// playbackClient request session data from relay server by id.
// on update, client allocates new Float32Array with a constant
// field size, then unpacks relay data into array. 

var io = require('socket.io-client');
var socket = io.connect('http://localhost:3000', { secure: true, reconnect: true, rejectUnauthorized : false } );
socket.emit('connection');

let client_id = 98765;
let session_id = 4567;
let plackback_id = 51;

// join session by id
var joinIds = [session_id, client_id]
socket.emit("join", joinIds);

let playbackArgs = [client_id, session_id, plackback_id];
socket.emit('playback', playbackArgs);

socket.on('relayUpdate', function(data) {
    console.log(data);
});

socket.on('playbackEnd', function() {
    console.log('playback data stream ended');
    process.exit(1);
})