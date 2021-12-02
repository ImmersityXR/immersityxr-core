# Komodo Relay Server

[Learn more about the Komodo Platform](https://github.com/gelic-idealab/komodo-docs)

## What is it?
The relay server facilitates client communication during multiplayer sessions. It allows clients to join session namespaces or 'rooms', propagates client updates (including positions within the VR scene and interactions with entities or other clients), coordinates chat sessions (including text and voice/video/screen) [1], maintains session state (including active clients, entity and scene state, session properties), and captures data during session recording. 

- [Komodo Relay Server](#komodo-relay-server)
  - [What is it?](#what-is-it)
    - [Development](#development)
      - [Getting started](#getting-started)
  - [Footnotes](#footnotes)
    - [Testing](#testing)
    - [Deployment](#deployment)

_______________
<a name="development"></a>
### Development
#### Getting started
You will need [Node.js](https://nodejs.org/en/download/) installed on your machine.
1. Clone this repository
    * `git clone https://github.com/gelic-idealab/komodo-relay.git`
    * `cd komodo-relay/`

2. Configure the Docker container
   * `cp config.template.js config.js`
   * Edit config.js:
     * db: connection information for `komodo-db` or a comparable MySQL server
     * azure: Microsoft Speech SDK credentials
     * capture: local file directory for capture files
3. Install dependencies
    * `npm install`
4. Run the relay server
    * `node serve.js`

| Dependencies (Production) | Usage |
|:---------------------------------------------------|:------|
| [Microsoft Speech SDK](https://docs.microsoft.com/en-us/javascript/api/microsoft-cognitiveservices-speech-sdk/?view=azure-node-latest) [1] | Processing client audio for speech-to-text |
| [mkdirp](https://github.com/isaacs/node-mkdirp) | Creating directories for writing capture files | 
| [mysql2](https://github.com/sidorares/node-mysql2) | Connecting to komodo-db for connection, capture records | 
| [object.fromentries](https://github.com/es-shims/Object.fromEntries) | Polyfill for turning a map into an object | 
| [socket.io](https://github.com/socketio/socket.io) | Managing session namespaces, joining clients to sessions, listening for and emitting custom events (such as position updates), portal text & speech-to-text chat [1] |
| [winston](https://github.com/winstonjs/winston) | Logging | 

| Dependencies (Development) | Usage |
|:---------------------------------------------------|:------|
| [Mocha](https://github.com/mochajs/mocha) | Unit testing |
| [Instanbul](https://github.com/istanbuljs/nyc) | Code coverage | 
| [Should.JS](https://github.com/shouldjs/should.js) | Easy-to-read assertions | 

## Footnotes

[1] NOTE: The chat namespace is experimental and not ready for production usage.

_______________
<a name="testing"></a>
### Testing
The `test` directory contains scripts which use and validate relay functionality. Please run tests during development, and especially before submitting pull requests.  

`npm run test`

OR 

`nyc mocha --debug-brk --exit`
______________
<a name="deployment"></a>
### Deployment
The recommended Komodo deployment uses [Docker](https://www.docker.com/products/container-runtime) and docker-compose.  