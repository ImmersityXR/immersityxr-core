# Spec: runtime asset spawning and per-user relay auth

**Status:** draft for review, October 2026.
**Covers:** shortlist items 1–3 from [OSS-COMPONENTS.md](OSS-COMPONENTS.md),
plus a capture format revision that the id change makes timely.
**Touches:** immersity-core (relay, portal), immersity-unity, immersityxr-godot,
immersityxr-asset-catalog.

## Summary

This spec lets anyone in a session pull a model from the asset catalog into
it, with every client seeing the same object, and gives the relay a real
identity for every connection. It has three parts:

- **A. Deterministic sub-object ids.** Every client derives the ids of a
  model's parts from the model's id and the glTF file itself, not from a
  local counter.
- **B. Spawn and despawn.** The relay assigns instance ids, resolves catalog
  ids to model URLs, decides who may spawn and move what, and replays
  instances to late joiners.
- **C. Per-user relay tokens.** The portal signs a short-lived token naming
  the user, session and role. The relay verifies it on connect and stops
  trusting the ids inside messages. It depends on a prerequisite, **C0**,
  putting authentication on the portal's own API.
- **D. Capture format, version 2.** Recordings start with a full state
  snapshot, include every kind of state change, and use the relay's clock.
  This makes them replayable.

## Background: how it works today

**Entity ids (Unity).** A lab's models load once at startup, in the order of
the lab's `assetList` (`ModelImportInitializer.InstantiateModels`). Each
model's root takes its portal `asset_id`. Every other networked part gets
`999 * 1000 + 3 * 100 + n` from one counter shared by all imports
(`NetworkedObjectsManager.GenerateUniqueEntityID`). Clients agree on part ids
only because they all import the same list in the same order. A model loaded
at runtime breaks this: a client that joins later, or loads in a different
order, numbers the parts differently, and transform updates land on the
wrong objects.

**Identity at the relay.**

- The only client credential is one shared secret (`config.auth.clientSecret`,
  checked in `services/relay/auth.js`). The portal passes it to clients from
  `VUE_APP_VR_AUTH_TOKEN`, which is compiled into the portal's JavaScript
  bundle (`portal/frontend/src/pages/LabDetail/LabDetail.vue`), so anyone who
  loads the portal can read it.
- After connecting, the client states who it is in each message:
  - `join` sends `[session_id, client_id]`;
  - `update` and `draw` carry ids at fixed array positions;
  - `message` carries `session_id` and `client_id` fields.

  The relay forwards each message to the room the payload names, without
  checking that the socket joined that session (`processMessage` →
  `messageAction` in `services/relay/sync.js`). The socket repair path can
  even add the socket to the named session. Any client holding the shared
  secret can act as any user in any session.
- The teacher flag exists only as a `teacher=` URL parameter for the client
  UI. The relay has no notion of roles: `start_recording`, `end_recording`
  and `playback` are accepted from any socket.

**Portal API.** Routes are mounted with no authentication middleware
(`portal/backend/server/index.js`). Only `GET /users/initial` verifies the
login cookie. Anyone who can reach the API can:

- list and delete users;
- reset a password given only a `user_id` (`POST /users/password`);
- request Twilio TURN credentials (`GET /turn`), which are billed to our
  account.

The login cookie is also weak:

- it is an HS256 JWT with `httpOnly: false`, so page scripts can read it;
- `expiresIn: 7 * 24 * 60 * 60 * 1000` is read as *seconds*, so tokens last
  about 19 years, not a week.

## Goals and non-goals

**Goals**

- Anyone in a session can spawn catalog models and remove their own, and a
  teacher can remove any. Every client, including late joiners and both the
  Unity and Godot clients, sees the same objects with the same ids.
- The relay knows each connection's user, session and role from a credential
  it can verify, and enforces that a client only acts as itself in its own
  session.
- Existing builds keep working during the auth transition. The id change
  needs each lab moved to the new build in one step (Part A).
- Recordings capture enough to be replayed later.

**Non-goals for this spec**

- Instructor permission switches (shortlist item 4). Part C provides the
  role they will need.
- Voice, lab templates, and multiple catalogs (items 5 and 6).
- Replacing Socket.IO or changing the position packet format.
- Building capture playback (Part D defines the format it will read).
- Supporting recordings made before this change.

## Part A: deterministic sub-object ids

Rule A applies to every networked model: lab assets loaded at startup and
instances spawned at runtime. Lab assets moving to it was decided in October
2026 (see Decisions).

### Id ranges

Entity ids stay 32-bit signed integers, as in the Unity client. All roots sit
below 1,000,000 and all parts sit at or above 1,000,000,000, so the two can
never collide. Any id of 1,000,000,000 or more is a part, and its root is
`(id - 1,000,000,000) / 1000`, rounded down.

| Range | Used for | Assigned by |
|---|---|---|
| 1 – 699,999 | Lab asset roots (portal `asset_id`) | Portal database |
| 700,000 – 799,999 | Catalog `entity_id`, used only by the static sandbox lab | Catalog `sources.json` |
| 800,000 – 999,999 | Spawned instance roots | Relay, per session |
| 1,000,000,001 – 1,999,999,999 | Parts of any root: `1,000,000,000 + root * 1000 + k`, where `k` is 1–999 | Each client, by rule A |

The largest part id, 1,999,999,999, is below the 32-bit limit of
2,147,483,647. If a portal `asset_id` ever reaches 700,000, the lab range has
to move; the portal should refuse to create assets past 699,999 rather than
overlap the catalog range. Draw strokes have their own `strokeId` space and
are unaffected.

### Rule A

For a model with root id `R`, list the glTF nodes that have a `mesh`, in
ascending glTF node index. The k-th of them (k starting at 1) gets id
`1,000,000,000 + R * 1000 + k`. A model with more than 999 mesh nodes cannot
use per-part networking. It must be marked `is_whole_object`, in which case
only the root is networked.

The rule is defined on the **glTF file, not the engine's scene tree**,
because the two clients build different trees:

- Unity's `ModelImportPostProcessor.SetUpSubObjects` inserts pivot parents
  around meshes.
- Godot's importer has its own node naming and merging.

The node list in the file is the only structure both clients share. Hubs uses
scene-graph traversal order for the same purpose (`assign-network-ids.ts`),
which works because Hubs has a single client.

### Client changes

- **Unity:**
  - While instantiating a glTF, record which GameObject each glTF node index
    became. With glTFast this means a custom instantiator that hooks node
    creation. If the Siccity GLTFUtility path stays in use, it needs the
    equivalent mapping.
  - Then call `NetworkedObjectsManager.CreateNetworkedGameObject` with an
    explicit `uniqueEntityID`. `NetworkedGameObject.Instantiate` already
    accepts one.
  - Remove `GenerateUniqueEntityID` and its shared counter, so nothing can
    fall back to order-dependent ids. Any networked object that is not part
    of a glTF model needs an explicit id instead.
- **Godot:** after `GLTFDocument.append_from_file`, map node index to scene
  node with `GLTFState.get_scene_node(i)` and assign ids by the same rule.
  The Godot template has not shipped lab asset support yet, so it starts on
  rule A.
- **Catalog:** `validate_catalog.py` checks that every model has 999 or fewer
  mesh nodes, and `catalog.json` gains a `networked_parts` count that clients
  can compare against what they derived. The current maximum is 53
  (ultrasound).
- **Portal:** reject uploads that are not `is_whole_object` and have more
  than 999 mesh nodes, so a lab cannot contain a model the clients cannot
  number.

### Compatibility

- **Mixed builds.** An old build (legacy counter) and a new build (rule A)
  disagree on lab asset part ids, so they must not share a session. Switch a
  lab's build folder to the new build in one step; old build folders can
  stay on the server for other labs until they are moved too.
- **Saved session state.** Relay snapshots (`session-persistence.js`) from
  before the change hold part positions under legacy ids. The relay bumps
  its snapshot version, and when it restores an older snapshot it keeps only
  lab asset roots (ids below 700,000) and draw strokes, so stale part
  transforms are never replayed.
- **Recordings.** Captures made before the change are not supported (decided
  October 2026). Part D replaces the capture format.

### Tests

- A shared fixture GLB with nested and mesh-less nodes, plus its expected
  `(node index → id)` table, checked into both client repos. Each client has
  a test that imports it and compares against the table.
- A Unity test that loads a lab with several multi-part assets in different
  orders and gets identical ids each time.
- A relay test that restoring an old-version snapshot keeps only lab asset
  roots and strokes.

## Part B: spawn and despawn

The relay already sits between all clients and keeps per-session state, so
it can **decide** ownership instead of letting clients settle it by
tie-breaking, which is what Hubs has to do. Spawning uses new events on
`/sync`, not the general `message` channel, so old clients ignore them.

### Events

**Client → relay**

| Event | Payload | Rules |
|---|---|---|
| `spawn` | `{ requestId, catalogId, position: [x,y,z], rotation: [x,y,z,w], persist?: bool }` | The sender must have joined the session. Any role may spawn (`config.spawn.policy`, default `any`; `teacher` restricts it). `catalogId` must exist in the relay's loaded catalog. Limits: at most `config.spawn.maxInstances` per session (default 50) and `config.spawn.maxPerClient` live instances per client (default 5), so one person cannot fill the session, plus a rate limit of `config.spawn.ratePerMinute` per client (default 10). `persist: true` requires the teacher role. |
| `despawn` | `{ instanceId }` | Allowed for the instance's creator or a teacher. |

**Relay → clients**

| Event | Payload | Sent to |
|---|---|---|
| `spawned` | `{ requestId, instanceId, catalogId, modelUrl, isWholeObject, scale, creator, position, rotation, persist, createdAt }` | Whole session, sender included. `requestId` lets the sender match its request. |
| `spawnFailed` | `{ requestId, reason }` | Sender only |
| `despawned` | `{ instanceId, reason }`, where `reason` is `requested`, `creatorLeft` or `expired` | Whole session |

### Relay behaviour

- **Catalog.**
  - The relay loads the catalog from `config.catalog.url` at startup and
    refreshes it on an interval.
  - It resolves `catalogId` to `modelUrl` itself. Clients never send a URL,
    so nobody can make every headset download an arbitrary file.
  - If the catalog cannot be loaded, the relay rejects spawns with
    `catalogUnavailable`.
- **Instance ids.** A per-session counter starting at 800,000, stored with
  the session so ids are never reused within a session, even after a relay
  restart.
- **State.**
  - `session.instances` maps `instanceId` to the `spawned` payload.
  - It is saved in snapshots next to `entities` and `strokes`
    (`session-persistence.js`).
  - Despawning removes the instance and every entry in `session.entities`
    whose id is the root or one of its parts (`1,000,000,000 + root * 1000 + 1`
    to `+ 999`).
- **Late joiners.**
  - State catch-up becomes version 3, which adds `instances`, sent before
    `entities`.
  - Clients asking for version 2 or older get the current payload and never
    see instances. Those clients log "entity not found" for spawned ids, which
    is harmless.
- **Who may move what.**
  - Today a `LOCK` interaction only marks an entity as locked. For spawned
    instances and their parts, the relay records `lockedBy` and accepts a
    `LOCK` only if the entity is unlocked or already held by the same client.
  - While an entity is locked, the relay drops position updates for it from
    anyone else.
  - Locks are released on `LOCK_END`, and when the holder disconnects.
- **Creator leaves.**
  - Instances without `persist` are removed when their creator has been
    disconnected for `config.spawn.creatorGraceSeconds` (default 60). The
    grace period covers reconnects and the socket repair path.
  - `persist: true` instances stay with the session and survive restarts.
    An optional `ttlSeconds` expires them.
- **Captures.** `spawned` and `despawned` are recorded like every other
  state change (Part D), so playback recreates instances at the right moment.

### Client behaviour

- On `spawned`, load `modelUrl` through the existing model downloader, set up
  the object with root id `instanceId`, and assign part ids by rule A.
- Buffer position updates for ids that are not yet loaded, for up to 30
  seconds, and apply them in order once the import finishes. This is the same
  approach as Hubs's `storedUpdates`, and the same gate the state catch-up fix
  uses (`isAssetImportFinished`).
- On `despawned`, destroy the instance and drop any buffered updates for it.
- **UI:** the first version only needs a list of catalog entries with a
  spawn button, available to everyone, plus a remove action on instances the
  user created (teachers: on all instances). A thumbnail browser can follow,
  since `catalog.json` already lists thumbnails.

### Tests (relay, mocha)

- Spawn accepted and broadcast; rejected for:
  - unknown catalog id;
  - wrong role;
  - the instance cap;
  - the rate limit;
  - a sender who has not joined.
- A late joiner receives `instances` before `entities`.
- A lock held by one client causes another client's updates to be dropped.
- A creator leaving despawns its instances after the grace period, and a
  reconnect within the grace period does not.
- A persisted instance survives a snapshot save and restore.
- Spawn and despawn appear in the capture stream.

## Part C: per-user relay tokens

### C0. Prerequisite: authenticate the portal API

This ships on its own, first. If the portal is reachable anywhere today, it
is urgent.

- Add middleware that verifies the login cookie on every route except
  `POST /users/login`, `GET /users/initial`, `GET /users/logout` and
  `/public`, and attaches the user to the request.
- Routes that manage users (create, edit, delete) require the admin role.
  The `/data` research exports require an instructor of that lab or course,
  or an admin. `POST /users/password` checks that the caller is that user or
  an admin.
- `GET /turn` requires a logged-in user.
- Fix the cookie:
  - set `httpOnly: true`;
  - `sameSite: 'lax'`;
  - `expiresIn: '7d'`.

  Rotate `config.jwt` when this deploys, so the existing long-lived tokens
  stop working.

### C1. Token

The portal issues relay tokens from a new route:

```
POST /labs/:labId/relay-token   (cookie auth)
→ 200 { token, expiresAt }
→ 403 if the user is not enrolled in the lab's course and is not an instructor or admin
```

| Claim | Value |
|---|---|
| `iss` | `immersityxr-portal` |
| `aud` | `immersityxr-relay` |
| `sub` | portal `user_id`, as a string (becomes the relay `client_id`) |
| `sid` | lab/session id (or the playback session id; see below) |
| `role` | `student`, `teacher` or `admin`, from course membership |
| `playback` | capture id, present only for playback launches |
| `iat`, `exp`, `jti` | `exp` = `iat` + 120 seconds. The token is only needed to connect, and the socket keeps its identity afterwards. |

- **Signing:**
  - ES256 with a key pair kept separately from the cookie secret.
  - The portal holds the private key; the relay only needs the public key,
    so a compromised relay cannot mint tokens.
  - The `kid` header selects the key, and the relay accepts a list of public
    keys, so keys can be rotated without downtime.
  - Keys are configured through `deploy/.env`, with `env.example` markers.
- **Playback:** today the portal turns a playback launch into session id
  `9999 + sessionId` (`LabDetail.vue`). The token carries that same
  `sid` plus the `playback` claim, so the relay can tell it is a replay.

### C2. Getting the token to the client

- The portal calls the route just before it builds the iframe URL, and puts
  the token in the URL **fragment**: `…/index.html?session=…&client=…#token=…`.
- Browsers never send fragments to servers, so the token stays out of
  build-server access logs and proxies.
- `relay.js` (Unity) and `immersity.js` (Godot) read `location.hash`, strip
  it from the address bar with `history.replaceState`, and pass the token on
  the Socket.IO connection as `auth: { token }`. That is the Socket.IO v4
  handshake payload, not a query string.
- `client`, `session` and `teacher` stay in the URL for the client UI, but
  the relay ignores them.

### C3. Relay

- **Middleware.** `auth.js` gains `tokenAuth`:
  - It reads `socket.handshake.auth.token`, falling back to the `token`
    query parameter for older clients.
  - It verifies the signature, `iss`, `aud` and `exp` (30 seconds of clock
    skew allowed).
  - It sets `socket.data.identity = { clientId: sub, sessionId: sid, role, playback }`.
  - On failure it rejects the connection with `unauthorized`.
  - The same middleware is applied to `/sync`, `/chat` and `/rtc`. `/admin`
    keeps its admin secret.
- **Identity comes from the socket.**
  - `join` uses `socket.data.identity` and ignores its payload.
  - `update`, `draw`, `interact`, `message`, `state`, `leave` and the
    recording events check the ids in the payload against the socket's
    identity. They drop and log any mismatch, and only emit to the room the
    socket actually joined.
  - The socket repair path uses `socket.data.identity`, never payload ids.
- **Roles.**
  - `start_recording`, `end_recording` and `playback` require the `teacher`
    or `admin` role.
  - Part B uses the same role for persisting instances and for removing
    other people's instances.
- **Transition.** `config.auth.mode` is one of:

  | Mode | Behaviour |
  |---|---|
  | `none` | No authentication, as today with no secret set. |
  | `shared-secret` | Today's behaviour. |
  | `token-or-shared-secret` | Accept either. Identity from a token is enforced; shared-secret sockets get today's behaviour, with no teacher role. |
  | `token` | Token only. |

  Deploy in `token-or-shared-secret` until no old builds remain, then switch
  to `token`.
- **No portal (static sandbox, development).** A script,
  `services/relay/tools/mint-token.js`, signs a token with a local key, for
  demos and tests. The sandbox can also stay on `shared-secret`.

### Tests

- **Relay:**
  - valid token connects;
  - expired token, wrong audience, wrong key and tampered token are rejected;
  - mismatched payload ids are dropped;
  - a student cannot start recording;
  - each `auth.mode` behaves as described;
  - the existing `tests/auth-smoke-test.js` is extended.
- **Portal:**
  - every protected route returns 401 without a cookie;
  - the token route returns 403 for a user not in the course;
  - the token's claims match the user's role.

## Part D: capture format, version 2

### Why now

Rule A changes every part id, so recordings made after it are incompatible
with those made before. Old recordings are not needed (decided October
2026), which makes this the cheapest moment to fix the format. Today a
capture (`capture-writer.js`, `record_message_data` in `sync.js`):

- records only events that arrive on the `message` channel: not `update`,
  `interact` or `draw` events, and not joins or leaves;
- has no starting state, so a recording begun mid-session cannot show
  objects that were already moved or strokes already drawn;
- orders events by the sending client's own clock (`data.ts`), as the code's
  own comment notes, so clients with skewed clocks interleave wrongly;
- can be started or stopped by any socket for any session.

### Format

A capture stays a directory with a manifest and an NDJSON event stream.

**Manifest** (`format_version: 2`):

| Field | Meaning |
|---|---|
| `capture_id`, `session_id` | As today |
| `start`, `end` | Relay clock, ms since epoch |
| `entityIds` | `"gltf-node"`, meaning rule A |
| `startedBy` | Client id of the teacher who started it (from the token, Part C) |
| `assets` | The lab's asset list at start: `asset_id`, `path`, `is_whole_object`, `scale`. The relay fetches it from the portal (`GET {config.portal.url}/labs/{session}`) when configured; otherwise the field is omitted and playback falls back to the portal's current list. |
| `catalog` | URL and a hash of the `catalog.json` the relay had loaded, so spawned instances resolve to the same models |
| `status` | `recording`, `complete` or `interrupted`, as today |

**Events.** Every line is `{ t, seq, kind, client, data }`:

- `t` is ms since `start` on the **relay's** clock when the event was
  received.
- `seq` is a per-capture counter, so ties in `t` replay in arrival order.
- `client` is the sender's id from its socket identity (Part C), not from
  the payload.
- `kind` is one of:
  - `snapshot`: always the first line. The full state catch-up payload
    (version 3: clients, entities, instances, scene) plus all stored draw
    strokes.
  - `update`, `message`, `interact`, `draw`: the payload as relayed.
  - `spawned`, `despawned`: as broadcast (Part B).
  - `joined`, `left`.

The relay writes events after it has validated them, so a capture only holds
what the session actually saw.

### Control

- `start_recording` and `end_recording` need the teacher or admin role
  (Part C), and act only on the sender's own session. The payload's session
  id is ignored.
- Until Part C ships, recording control keeps today's behaviour.

### Not in this spec

Playback itself. The relay's `handlePlayback` is mostly unimplemented. With
this format, playback becomes:

1. load the manifest's assets;
2. apply the snapshot;
3. replay events by `t`.

That is a follow-up, as is research export of captures through the portal's
`/data` routes.

### Tests

- The first line of a new capture is a `snapshot` matching the session state.
- Each event kind is written with relay-side `t`, increasing `seq`, and the
  socket's identity.
- A message with a spoofed `client_id` is recorded under the real sender.
- Without the portal configured, the manifest omits `assets` and recording
  still works.
- A student cannot start a recording once tokens are enabled.

## Rollout

Each step is its own PR and can ship independently, in this order:

1. **C0. Portal API auth.** Portal only. Do first and soon.
2. **A. Id rule, with D. Capture format v2.** Unity and Godot import paths,
   catalog validator, portal upload check, relay snapshot handling and
   capture writer. Ship A and D together, since both change what recorded
   ids mean. Switch each lab to the new client build when it deploys.
3. **C1–C3. Tokens,** in `token-or-shared-secret` mode. Touches the portal,
   the relay, and both client templates (`relay.js`, `immersity.js`).
4. **B. Spawn and despawn.** Relay, both clients, a relay config pointing at
   the catalog. Spawning works without C, since anyone may spawn, but until
   C ships the relay cannot tell teachers apart. Persisting and removing
   other people's instances stay disabled until then, and creators are
   identified by the ids in their messages, which can be spoofed.
5. **Switch** production to `auth.mode = token` once old builds are retired.

## Decisions

- **Lab assets use rule A** (decided October 2026). Every networked model
  gets part ids from the glTF node list, not only spawned ones, and the
  shared import-order counter is removed. Reasons:
  - The legacy numbering depends on Unity's import path, including the pivot
    objects it inserts. The Godot client cannot reproduce it, so without
    this change the two clients could not share a lab with multi-part
    models.
  - The counter only advances when a model finishes loading. If one download
    fails on one client, every later model's parts are numbered differently
    there, and that client's grabs move the wrong parts for everyone. Under
    rule A each model's ids depend only on its own file.
  - One numbering scheme instead of two.

  The cost is a one-time switch of each lab to the new build (Part A,
  Compatibility).
- **Old recordings are not supported** (decided October 2026). This frees
  the capture format to change (Part D).
- **Token delivery by URL fragment** (decided October 2026), as described in
  C2. `postMessage` was the alternative.
- **Who may spawn:** anyone in the session (decided October 2026). Teachers
  can remove any instance and are the only ones who can make an instance
  persist. The per-client cap and rate limit keep one person from filling
  the session. The instructor switches in shortlist item 4 can later let a
  teacher turn spawning off for students.

## Open questions

1. **Catalog scope:** one relay-wide catalog (proposed), or per-lab catalog
   lists? Per-lab lists fit shortlist item 6.
2. **Lock authority for lab assets:** should relay-enforced locks (Part B)
   apply to lab assets as well, not just spawned instances? It would fix
   grab conflicts generally but changes existing behaviour.
3. **Relay client id:** should it stay the portal `user_id`, or should the
   relay use an opaque per-connection id? The latter is ARENA's approach and
   avoids exposing user ids to other clients.
