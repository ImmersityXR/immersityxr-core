# Komodo Relay Server

## What is it?
The relay server facilitates client communication during multiplayer sessions. It allows clients to join session namespaces or 'rooms', propagates client updates (including positions within the VR scene and interactions with entities or other clients), coordinates chat sessions (including text and voice/video/screen), maintains session state (including active clients, entity and scene state, session properties), and captures data during session recording. 

1. [Development](#development)
2. [Deployment](#deployment)

_______________
<a name="development"></a>
### Development
#### Getting started
You will need [Node.js](https://nodejs.org/en/download/) installed on your machine.
1. Clone this repository
    * `git clone https://github.com/gelic-idealab/komodo-relay.git`
    * `cd komodo-relay/`
2. Install dependencies
    * `npm install`
3. Run the relay server
    * `node serve.js`

| dependencies | usage |
|:---------------------------------------------------|:------|
| [socket.io](https://github.com/socketio/socket.io) | create session namespaces, join clients to sessions, listen for and emit custom events (such as position updates) |
| [peer.js](https://github.com/peers/peerjs)         | WebRTC signaling |
| [Microsoft Speech SDK](https://docs.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/?view=azure-node-latest) | Processing client audio for speech-to-text |
| [bson](https://github.com/mongodb/js-bson) | binary encoding of client audio for recorded sessions | 
| [wavefile](https://github.com/rochars/wavefile) | resampling client audio for speech-to-text | 
| [winston](https://github.com/winstonjs/winston) | logging | 
______________
<a name="deployment"></a>
### Deployment
The recommended Komodo deployment uses [Docker](https://www.docker.com/products/container-runtime) and docker-compose.  