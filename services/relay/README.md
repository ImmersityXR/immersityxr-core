# ImmersityXR Relay Server

[Learn more about the ImmersityXR Platform](../../docs/ARCHITECTURE.md)

## What is it?
The relay server facilitates client communication during multiplayer sessions. It allows clients to join session namespaces or 'rooms', propagates client updates (including positions within the VR scene and interactions with entities or other clients), coordinates chat sessions (including text and voice/video/screen) [1], maintains session state (including active clients, entity and scene state, session properties), and captures data during session recording. 

- [ImmersityXR Relay Server](#immersity-relay-server)
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
1. Clone the monorepo
    * `git clone https://github.com/ImmersityXR/immersityxr-core.git immersity`
    * `cd immersity/services/relay/`

2. Configure the Docker container
   * `cp config.template.js config.js`
   * Edit config.js:
     * db: connection information for `immersity-db` or a comparable MySQL server
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
| [mysql2](https://github.com/sidorares/node-mysql2) | Connecting to immersity-db for connection, capture records | 
| [object.fromentries](https://github.com/es-shims/Object.fromEntries) | Polyfill for turning a map into an object | 
| [socket.io](https://github.com/socketio/socket.io) | Managing session namespaces, joining clients to sessions, listening for and emitting custom events (such as position updates), portal text & speech-to-text chat [1] |
| [winston](https://github.com/winstonjs/winston) | Logging | 

| Dependencies (Development) | Usage |
|:---------------------------------------------------|:------|
| [Mocha](https://github.com/mochajs/mocha) | Unit testing |
| [Instanbul](https://github.com/istanbuljs/nyc) | Code coverage | 
| [Should.JS](https://github.com/shouldjs/should.js) | Easy-to-read assertions | 

## WebRTC signaling (/rtc)

The `/rtc` namespace (`rtc.js`) provides signaling for peer-to-peer
voice/video/screen sharing between clients in the same session: SDP
offer/answer relay, trickle ICE, call rooms, and device-type negotiation.
The protocol is ported from [David Tamayo's KomodoSandbox
work](https://github.com/davtamay/RelayTesting), adapted to Socket.IO 2.x,
scoped per session, and gated by the same shared client secret as `/sync`.

Clients connect with query parameters `userName`, `client_id`, `session_id`
(and `auth` when a client secret is configured). On connection the server
emits `rtcConfig { iceServers }` from `config.rtc.iceServers`, so STUN/TURN
servers are managed centrally — add a TURN server there for participants
behind strict NATs.

Smoke test (drives a real two-peer offer/answer/ICE handshake):

```
npm install --no-save socket.io-client@2
node tests/rtc-smoke-test.js
```

## Session capture (research data logging)

While a session is recording, every message is **streamed to disk as it
arrives** (`capture-writer.js`), instead of being held in memory and written
only when recording stops. A crash, network disruption, or redeploy
mid-recording costs at most the last flush interval (500 ms) — everything
else is already on disk.

Each recording produces:

```
captures/<session_id>/<recording_start>/
  data.ndjson     one JSON message per line, appended continuously
  manifest.json   capture_id, start/end, status, message_count
```

- `manifest.json` `status` is `recording` while in progress, `complete` on a
  clean stop, or `interrupted` if the server went down mid-recording — on
  startup the relay finds orphaned recordings and finalizes them
  automatically. Interrupted captures remain fully usable.
- NDJSON loads directly into analysis tools:
  - pandas: `pd.read_json('data.ndjson', lines=True)`
  - jq: `jq -s '.' data.ndjson`
- For spreadsheet-friendly output, split a capture into per-message-type CSV
  files (also reads the legacy single-JSON `data` format):

  ```
  node tools/export-capture.js captures/<session_id>/<recording_start>
  ```

Smoke test (covers the interrupted-recording recovery path and a
9,000-message burst):

```
node tests/capture-smoke-test.js
```

## Session persistence (late join / rejoin / restart)

Shared session state — entity positions, lock/visibility, scene, and **draw
strokes** — survives beyond the sockets that created it:

- Draw messages are stored per stroke in session state
  (`applyDrawMessageToState`) and **replayed to any client that requests
  state catch-up**, through the normal `message` relay — so late joiners
  and rejoining clients see existing drawings with no client-side changes
  (the live draw handler reconstructs them).
- Session state is **snapshotted to disk** every 10 seconds when it changes
  (`session-persistence.js`, atomic writes to `sessions/<id>/state.json`)
  and restored when the session is recreated — whether after a relay
  restart or after the session emptied out. Stored state expires after a
  TTL (default 7 days).
- Configure via `config.persistence` (`enabled`, `path`,
  `snapshotIntervalMs`, `ttlHours`). Clients/sockets are never persisted —
  only the shared environment.

Smoke test (real clients: draw → late join → simulated restart → TTL):

```
node tests/persistence-smoke-test.js
```

## Authentication

The relay supports shared-secret authentication, configured in `config.js`:

```js
auth: {
    clientSecret: "<long random phrase>",  // required for /sync and /chat when set
    adminSecret: "<long random phrase>"    // required for /admin
}
```

- **`clientSecret`** — when set, clients must pass the secret as an `auth`
  query parameter on the Socket.IO connection
  (e.g. `io(url + '/sync?auth=<secret>')` or `io(url, { query: { auth: secret } })`).
  The Unity WebGL template's `relay.js` forwards the page's `?auth=` URL
  parameter automatically, so deployments append `&auth=<secret>` to the
  client launch URL. When left empty, connections are accepted as before and
  a warning is logged at startup.
- **`adminSecret`** — the `/admin` diagnostics namespace is deny-by-default:
  while this is unset, **all** `/admin` connections are rejected. The admin
  dashboard (`/public`) prompts for the secret on load.

This is a perimeter control to keep uninvited clients off a deployment — the
secret is shared by all clients of a deployment and visible to anyone who can
load the client page. Per-user authentication (e.g. portal-issued JWTs) is
future work.

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
The recommended ImmersityXR deployment uses [Docker](https://www.docker.com/products/container-runtime) and docker-compose.  