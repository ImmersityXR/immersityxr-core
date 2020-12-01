# Komodo Relay Server

## What is it
The relay server facilitates client communication during multiplayer sessions. It allows clients to join session 'rooms', propagates client updates (including positions and interactions), coordinates chat sessions (including text and voice/video/screen), maintains session state (including active clients, entity and scene state, session properties), and captures data during session recording. 

_______________
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

Primary dependencies:

| dependency                                         | use |
|:---------------------------------------------------|:----|
| [socket.io](https://github.com/socketio/socket.io) | create session namespaces, join clients to sessions, listen for and emit custom events (such as position updates) |
| [peer.js](https://github.com/peers/peerjs)         | WebRTC signaling | 

______________
### Deployment
