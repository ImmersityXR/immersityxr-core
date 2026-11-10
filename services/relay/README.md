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

While a session is recording, every event is **streamed to disk as it
arrives** (`capture-writer.js`), instead of being held in memory and written
only when recording stops. A crash, network disruption, or redeploy
mid-recording costs at most the last flush interval (500 ms) — everything
else is already on disk.

Each recording produces:

```
captures/<session_id>/<recording_start>/
  manifest.json   what was recorded, by whom, and its status
  data.ndjson     one JSON event per line, appended continuously
```

### Format (version 2)

Every line of `data.ndjson` is one event:

```json
{ "t": 1234, "seq": 17, "kind": "message", "client": 2, "data": { "type": "sync", "message": { }, "ts": 1718040001234 } }
```

| Field | Meaning |
|---|---|
| `t` | Milliseconds since the capture started, on the **relay's** clock, taken when the event arrived. Clients' own clocks differ between headsets, so they are not used for ordering. |
| `seq` | Per-capture counter. Events with the same `t` replay in arrival order. |
| `kind` | See below. |
| `client` | The sender's client id as the relay knows it from the socket, not the id written inside the payload. |
| `data` | The payload. |

| `kind` | When | `data` |
|---|---|---|
| `snapshot` | Always the first line | The session's shared state when recording started: `clients`, `entities`, `scene`, `strokes`. A recording begun mid-session is still complete. |
| `message` | A client's `message` event. Current clients send positions (`sync`), interactions and drawing this way | `{ type, message, ts }`, with `message` parsed and `ts` the client's own clock |
| `update`, `interact`, `draw` | The older array-based events | The array as relayed |
| `joined`, `left` | A client entered or left the session | `{}` |

`manifest.json`:

| Field | Meaning |
|---|---|
| `capture_id`, `session_id` | Which recording, of which session |
| `start`, `end` | Relay clock, ms since epoch |
| `status` | `recording` while in progress, `complete` on a clean stop, or `interrupted` if the server went down mid-recording. On startup the relay finds orphaned recordings and finalizes them. Interrupted captures remain fully usable. |
| `format_version` | `2` |
| `event_count` | Lines in `data.ndjson` |
| `started_by` | Client id of whoever started the recording, or `null` |
| `entity_ids` | How clients numbered a model's parts: `import-order` or `gltf-node` (`config.capture.entityIds`) |
| `assets` | The lab's asset list at the start, when `config.portal.url` is set and the portal answered |

Only a client that has joined a session can start or stop its recording.

### Reading a capture

- NDJSON loads directly into analysis tools:
  - pandas: `pd.read_json('data.ndjson', lines=True)`
  - jq: `jq -s '.' data.ndjson`
- For spreadsheets and statistics packages, convert a capture to CSV:

  ```
  node tools/export-capture.js captures/<session_id>/<recording_start>
  ```

  This writes an `export/` folder next to the capture:

  | File | Rows |
  |---|---|
  | `positions.csv` | Head, hand and object position updates: position, rotation (quaternion), scale |
  | `interactions.csv` | Grab, drop, show, hide, lock, menu use |
  | `drawing.csv` | Draw stroke segments and stroke actions |
  | `presence.csv` | Who joined and left |
  | `<type>.csv` | Any other message type |
  | `snapshot.json` | The state when recording started |

  Every row starts with `t_ms`, `seq` and `client`. Captures recorded before
  format version 2 are split into one CSV per message type.

Smoke test (covers real clients, a spoofed sender, the interrupted-recording
recovery path, the export, and a 9,000-event burst):

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