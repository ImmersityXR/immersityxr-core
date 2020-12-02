# Komodo Relay Server

[Learn more about the Komodo Platform](https://github.com/gelic-idealab/komodo-docs)

## What is it?
The relay server facilitates client communication during multiplayer sessions. It allows clients to join session namespaces or 'rooms', propagates client updates (including positions within the VR scene and interactions with entities or other clients), coordinates chat sessions (including text and voice/video/screen), maintains session state (including active clients, entity and scene state, session properties), and captures data during session recording. 

1. [Development](#development)
2. [Testing](#testing)
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
| [socket.io](https://github.com/socketio/socket.io) | managing session namespaces, joining clients to sessions, listening for and emitting custom events (such as position updates), portal text & speech-to-text chat |
| [peer.js](https://github.com/peers/peerjs)         | WebRTC signaling for voice/video chat and screen sharing |
| [Microsoft Speech SDK](https://docs.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/?view=azure-node-latest) | Processing client audio for speech-to-text |
| [bson](https://github.com/mongodb/js-bson) | binary encoding of client audio packets during session recording | 
| [wavefile](https://github.com/rochars/wavefile) | resampling client audio for speech-to-text | 
| [winston](https://github.com/winstonjs/winston) | logging | 

_______________
<a name="testing"></a>
### Testing
The `tests` directory contains scripts which use and validate relay functionality. Please run tests during development, and especially before submitting pull requests.  
______________
<a name="deployment"></a>
### Deployment
The recommended Komodo deployment uses [Docker](https://www.docker.com/products/container-runtime) and docker-compose.  