# Spec: runtime asset spawning and per-user relay auth

**Status:** draft for review, October 2026.
**Covers:** shortlist items 1–3 from [OSS-COMPONENTS.md](OSS-COMPONENTS.md).
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
- Existing builds keep working during a transition period.

**Non-goals for this spec**

- Instructor permission switches (shortlist item 4). Part C provides the
  role they will need.
- Voice, lab templates, and multiple catalogs (items 5 and 6).
- Moving lab-asset sub-objects to the new id rule (see open questions).
- Replacing Socket.IO or changing the position packet format.

## Part A: deterministic sub-object ids

### Id ranges

Entity ids stay 32-bit signed integers, as in the Unity client.

| Range | Used for | Assigned by |
|---|---|---|
| 1 – 699,999 | Lab asset roots (portal `asset_id`) | Portal database |
| 700,000 – 799,999 | Catalog `entity_id`, used only by the static sandbox lab | Catalog `sources.json` |
| 999,300 + n | Lab asset sub-objects (legacy counter, unchanged) | Each client, in import order |
| 1,100,000 – 1,999,999 | Spawned instance roots | Relay, per session |
| 1,100,000,001 – 1,999,999,999 | Spawned instance parts: `root * 1000 + k`, where `k` is 1–999 | Each client, by rule A |

The legacy counter would need more than 100,000 sub-objects in one lab to
reach the spawned range.

### Rule A

For a model instance with root id `R`, list the glTF nodes that have a
`mesh`, in ascending glTF node index. The k-th of them (k starting at 1)
gets id `R * 1000 + k`. A model with more than 999 mesh nodes cannot be
spawned with per-part networking. It must be marked `is_whole_object`, in
which case only the root is networked.

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
    accepts one, so the change is confined to the import path.
- **Godot:** after `GLTFDocument.append_from_file`, map node index to scene
  node with `GLTFState.get_scene_node(i)` and assign ids by the same rule.
- **Catalog:** `validate_catalog.py` checks that every model has 999 or fewer
  mesh nodes, and `catalog.json` gains a `networked_parts` count that clients
  can compare against what they derived. The current maximum is 53
  (ultrasound).

### Tests

- A shared fixture GLB with nested and mesh-less nodes, plus its expected
  `(node index → id)` table, checked into both client repos. Each client has
  a test that imports it and compares against the table.
- A relay-level integration test is not needed for this part, since the relay
  never computes part ids.

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
- **Instance ids.** A per-session counter starting at 1,100,000, stored with
  the session so ids are never reused within a session, even after a relay
  restart.
- **State.**
  - `session.instances` maps `instanceId` to the `spawned` payload.
  - It is saved in snapshots next to `entities` and `strokes`
    (`session-persistence.js`).
  - Despawning removes the instance and every entry in `session.entities`
    whose id is the root or within `root * 1000 + 1 … + 999`.
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
- **Captures.** `spawned` and `despawned` are written to the capture stream,
  so playback recreates instances at the right moment.

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

## Rollout

Each step is its own PR and can ship independently, in this order:

1. **C0. Portal API auth.** Portal only. Do first and soon.
2. **A. Id rule.** Unity and Godot import paths, catalog validator. No
   protocol change; it takes effect once B sends spawned instances.
3. **C1–C3. Tokens,** in `token-or-shared-secret` mode. Touches the portal,
   the relay, and both client templates (`relay.js`, `immersity.js`).
4. **B. Spawn and despawn.** Relay, both clients, a relay config pointing at
   the catalog. Spawning works without C, since anyone may spawn, but until
   C ships the relay cannot tell teachers apart. Persisting and removing
   other people's instances stay disabled until then, and creators are
   identified by the ids in their messages, which can be spoofed.
5. **Switch** production to `auth.mode = token` once old builds are retired.

## Decisions

- **Who may spawn:** anyone in the session (decided October 2026). Teachers
  can remove any instance and are the only ones who can make an instance
  persist. The per-client cap and rate limit keep one person from filling
  the session. The instructor switches in shortlist item 4 can later let a
  teacher turn spawning off for students.

## Open questions

1. **Lab asset parts:** should lab assets also move to rule A? It removes the
   last order-dependent ids, but captures recorded before the change would
   replay sub-object movement onto the wrong parts unless captures are
   versioned.
2. **Token delivery:** URL fragment (proposed) or `postMessage` from the
   portal page to the iframe. `postMessage` keeps the token out of the URL
   entirely, but needs a handshake, because the portal and build server are
   on different origins.
3. **Catalog scope:** one relay-wide catalog (proposed), or per-lab catalog
   lists? Per-lab lists fit shortlist item 6.
4. **Lock authority for lab assets:** should relay-enforced locks (Part B)
   apply to lab assets as well, not just spawned instances? It would fix
   grab conflicts generally but changes existing behaviour.
5. **Relay client id:** should it stay the portal `user_id`, or should the
   relay use an opaque per-connection id? The latter is ARENA's approach and
   avoids exposing user ids to other clients.
