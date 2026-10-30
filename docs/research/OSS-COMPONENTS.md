# Open source components review

Working notes from comparing ImmersityXR with similar open source projects, to
find components worth adopting, adapting or learning from. This is a research
branch: nothing here is a commitment. Findings that turn into work get their
own issue or PR.

## What we are looking for

Immersity's known gaps and planned work, roughly in priority order:

| Area | Where Immersity is today | What would help |
|---|---|---|
| Relay auth | One shared client secret (`auth` param) for everyone; user and session ids still come from the `client`/`session` URL params | A per-user token handshake between portal, client and relay |
| Shared object state | Relay keeps per-session state and replays draw strokes to late joiners; entity ids partly per-client | Authoritative state, ownership/locking, spawn/despawn of networked objects |
| On-demand assets | Static asset list per lab; asset catalog (`immersityxr-asset-catalog`, in progress) planned for runtime spawning | Runtime glTF loading, asset browser UI, catalog formats |
| Voice and presence | `webrtc.js` in the Unity template | Spatial voice, SFU, avatar presence that scales past a handful of users |
| Unity client | Unity 2020.3 LTS (EOL), de-panther WebXR 0.5.1-preview | Maintained WebXR path for Unity 6, or a web-native client |
| Portal | Vue 2 / Vuetify 2 (EOL) + Express 4 + MariaDB | Course/lab/session management patterns, LMS (LTI) integration |
| Capture and playback | Relay records session events for replay | Recording formats, scrubbing, analytics |
| Deployment | Single VM, docker compose, Traefik | Scaling and monitoring patterns for small teams |

## How each candidate is assessed

- **License:** Immersity is NCSA (permissive). Copying code needs a compatible
  license: MIT, BSD, Apache-2.0, NCSA, ISC or similar. GPL/AGPL code can be
  studied or run as a separate service but not copied in. No license means no
  reuse.
- **Fit:** stack (Unity/C#, WebXR/JS, Node, Vue), protocol and data model
  compatibility, and how much of Immersity would have to change to use it.
- **Health:** recent activity, maintainers, issue response, release cadence.
- **Adoption path:** adopt as a dependency, vendor a component, port an idea,
  or just learn from it.

## Candidates

<!-- One section per repository. Template:

### owner/repo

- **What it is:**
- **License:**
- **Stack:**
- **Activity:**

| Component | Immersity gap | Path | Effort | Notes |
|---|---|---|---|---|

**Verdict:**
-->

Reviewed October 2026 from shallow clones of each project's default branch.
Paths below are relative to each project's repository.

### Hubs (Hubs-Foundation/hubs)

- **What it is:** the client for Hubs, the browser-based social VR platform
  Mozilla built and the Hubs Foundation now maintains. Rooms, avatars, voice,
  and dropping any media (glTF, images, video, PDF) into a shared space.
- **License:** MPL-2.0. This is file-level copyleft. We can run Hubs services
  next to Immersity and copy individual files, but copied or modified files stay
  MPL and their source must stay available. Re-implementing an idea carries no
  obligation.
- **Stack:** three.js, A-Frame and bitECS in the browser. Phoenix (Elixir)
  backend "Reticulum" for presence and state. mediasoup SFU "Dialog" for voice.
- **Activity:** last commit August 2026. Maintained by a small foundation after
  Mozilla shut down its hosted service in 2024.

| Component | Immersity gap | Path | Effort | Notes |
|---|---|---|---|---|
| Deterministic child network ids (`src/utils/assign-network-ids.ts`) | On-demand assets: Unity numbers sub-objects from a per-client counter, so clients disagree on ids for models loaded at runtime | Port the idea | Small | Children get `<rootId>.<index>` in scene-graph traversal order, so every client derives the same ids from the root id alone. For Immersity's integer ids that becomes `rootId * 1000 + index`, computed after import. |
| Create/update/delete message model (`src/utils/networking-types.ts`, `src/bit-systems/network-receive-system.ts`) | Shared object state; on-demand spawn/despawn | Port the design | Medium | `create` carries `{networkId, prefabName, initialData}`, so the media URL travels with it. Updates carry `owner` and `lastOwnerTime`, and ownership conflicts resolve deterministically (newest wins, ties broken by client id). Updates that arrive before their create are buffered. Objects a client created are removed when that client leaves unless they were pinned. |
| Pinning (`src/utils/bit-pinning-helper.ts`) | Persistent vs. temporary spawned objects | Port the idea | Small | Pinning (gated by a `pin_objects` permission) saves the object with the room and hands its creator to the server, so it outlives the person who spawned it. This maps to a relay-owned flag on Immersity spawns. |
| Spawn permissions per object type (`src/utils/permissions.ts`) | Teacher control over what students can add | Port the idea | Small | Every prefab names the permission needed to spawn it, and receivers check it too, not just senders. |
| Media loading by URL type (`src/utils/load-model.tsx`, `load-image.tsx`, `load-pdf.tsx`, `load-video.tsx`, `src/utils/media-url-utils.js`) | Assets beyond glTF: slides, images, video in a lab | Learn from | Medium | Shows the set of loaders and the URL sniffing in front of them. The Unity side would need its own loaders. |
| Dialog SFU ([Hubs-Foundation/dialog](https://github.com/Hubs-Foundation/dialog), client in `src/naf-dialog-adapter.js`) | Voice: Immersity's `webrtc.js` is a peer-to-peer mesh with Google STUN and no TURN server | Run as a service | Large | An SFU sends each speaker's audio once and fans it out on the server, instead of every pair of users connecting directly. Needs a public UDP port range, and a TURN server for restrictive networks. |

**Verdict:** the most directly useful project for the planned on-demand asset
work. Its networking model has already solved the problems Immersity's Phase 2
spawn message will hit. Port the design rather than the code: the client is
A-Frame/bitECS and the server is Elixir, so neither drops into Unity plus a Node
relay.

### ARENA (arenaxr, Carnegie Mellon)

- **What it is:** a multi-user XR platform for scenes anchored to the real
  world, from CMU's CONIX centre. Browser client, Unity and Python clients,
  real-time pub/sub, persistence, video conferencing.
- **License:** BSD-3-Clause on every repository checked (`arena-web-core`,
  `arena-persist`, `arena-account`, `arena-services-docker`, `arena-unity`,
  `arena-py`). Compatible with NCSA: code can be copied with the copyright
  notice kept.
- **Stack:** A-Frame/three.js web client; MQTT broker (Mosquitto) as the
  message bus; Node persistence service on MongoDB; Django account service
  issuing JWTs; Jitsi for audio/video; docker compose deployment.
- **Activity:** very active, with commits across repos in October 2026 and
  [documentation](https://docs.arenaxr.org/) that includes a cross-component
  message validation reference.

| Component | Immersity gap | Path | Effort | Notes |
|---|---|---|---|---|
| JWT with scoped permissions (`arena-account/users/mqtt.py`, docs: *Architecture → Security*) | Relay auth: one shared secret for all clients, and identity taken from the `client` and `session` URL parameters | Port the design (copying allowed) | Medium | The account service signs a short-lived RS256 token whose claims list exactly what the holder may publish and subscribe to. The broker enforces it, so a client cannot claim another user's id. The server also assigns a per-connection session id to stop spoofing. For Immersity: the portal signs `{user, session, role, exp}`, and the relay verifies it in Socket.IO connection middleware, which `auth.js` already provides for the shared secret, and takes identity from the token. |
| Persistence by message flag (`arena-persist/server.js`, docs: *Architecture → Persistence DB*) | Shared object state across sessions | Port the design | Medium | Any `create` message with `persist: true` is upserted into the store, and late joiners load it over HTTP before switching to live updates. `ttl` expires objects automatically. This fits a relay that already snapshots session state. |
| Templates (docs: *Persistence → Templates*) | Lab presets: "load the surgical tray set" as one action | Port the idea | Medium | A template is a saved group of objects, instantiated under a parent with ids `templateId::instanceId::objectId`, so several copies never collide and the group moves as one. |
| Message validation reference (docs: *Architecture → Message Validation*) | Relay robustness | Learn from | Small | A table of which component enforces which check on every message. A good model for documenting what the Immersity relay accepts. |
| `arena-unity` package | Unity client modernisation | Reference | n/a | A Unity 6 package that loads glTF scenes and syncs over MQTT with the same JWT flow. Useful to see how they structure a Unity client against a web-first protocol. It targets the editor and standalone, not WebGL. |

**Verdict:** the best source for the security and persistence design, and the
licence lets us copy code. Its MQTT bus is a different transport from
Immersity's Socket.IO, so the protocol ideas port and the services don't drop
in. Worth a conversation with the ARENA team: the problems overlap a lot and
they document their decisions well.

### CollabXR (Envision-Center, Purdue)

- **What it is:** a shared immersive classroom platform for Meta Quest and PC
  VR, the closest of the four to Immersity's purpose. It covers instructor-led
  sessions, co-located classrooms joined by QR code, user-made content mods,
  drawing and playback.
- **License:** custom *CollabXR Non-Commercial Open Source Software License*.
  It is non-commercial only, derivative works must use the same licence, and
  no patent licence is granted. **Not compatible with copying into
  Immersity:** any copied code would force Immersity's derivative work under a
  non-commercial licence. Read for ideas only, or talk to Purdue (the licence
  points to the Purdue Research Foundation; the README invites collaborators).
- **Stack:** Unity 6000.0 (Unity 6), URP, XR Interaction Toolkit 3, Meta XR
  SDK, glTFast 6.15, Cesium. Networking is Photon Fusion, a hosted commercial
  service with a free tier. Native builds (Quest `.apk`, Windows), not WebXR.
- **Activity:** active, last commit October 2026.

| Component | Immersity gap | Path | Effort | Notes |
|---|---|---|---|---|
| Instructor permission toggles (`Assets/Scripts/Networking/NetworkPermissions.cs`) | Teacher control: Immersity has a `teacher` flag but no classroom controls | Idea only | Small–medium | Networked switches for whether students can interact, draw, place or delete. Immersity's relay would hold and enforce these, so a modified client can't bypass them. |
| Mod repositories (`Assets/Scripts/Modding/RepositoryManager.cs`) | On-demand assets from more than one source | Idea only | Medium | Clients keep a list of repository URLs, fetch each index, and merge the content. For Immersity: a lab lists catalog URLs, each serving a `catalog.json` like the one in `immersityxr-asset-catalog`. |
| Co-location (`Assets/Scripts/Colocation/`) | In-room headsets sharing one physical space | Idea only | Large | Room code by QR plus calibration so co-present users line up. Needs passthrough/anchor support that WebXR exposes unevenly. |
| Networked playback scrubbing (`Assets/Scripts/Playback/`) | Capture and playback | Idea only | Medium | Everyone in the session watches a shared timeline that one person scrubs. |
| Unity 6 project setup | Unity 2020.3 is end of life | Reference | n/a | A working Unity 6 education project with glTFast and XRI 3, though for native rather than WebGL. |

**Verdict:** the nearest neighbour in purpose and a good reference for
classroom features, but the licence rules out reusing code. Reach out about
collaborating rather than borrowing.

### ILLIXR (ILLIXR/ILLIXR, University of Illinois)

- **What it is:** an open XR *system* testbed: an OpenXR-compatible runtime with
  swappable components for tracking (VIO/SLAM), reprojection, rendering,
  audio, and offloading work over the network. It is a platform for
  researching XR systems, not a collaboration app.
- **License:** University of Illinois/NCSA, the same licence family as
  Immersity. Fully compatible. Third-party plugin licences are listed in
  `LICENSES/`.
- **Stack:** C++ with CMake, Vulkan/OpenGL, Docker; Linux first, with Windows
  and Android support in many plugins. v4.2.
- **Activity:** active, last commit September 2026, from Prof. Sarita Adve's
  group in Illinois CS.

| Component | Immersity gap | Path | Effort | Notes |
|---|---|---|---|---|
| Offload rendering (`plugins/offload_rendering_server`, `offload_rendering_client`, `openxr_interface`) | Headsets can't render full-detail models such as the 1M-triangle SimReady originals | Research collaboration | Large | A GPU server renders frames and streams encoded video to a Quest-class headset, with pose sent back. It sits outside the browser/WebXR stack. |
| Network latency probe (`plugins/network_latency`) | Visibility into relay latency | Port the idea | Small | Periodic ping/pong with round-trip stats. The relay could publish the same per client to its admin view. |
| Quest 3 capture (`plugins/quest3/unity`) | Research data collection in sessions | Reference | n/a | Captures RGB and depth from Quest 3 in Unity with poses attached. |

**Verdict:** no component drops into Immersity's browser stack. Its value is a
research partnership on the same campus, for example offloaded rendering of
detailed lab models or measuring XR quality in classroom sessions.

### 8th Wall (8thwall/8thwall)

- **What it is:** the web AR engine from Niantic Spatial, open-sourced when
  its hosted platform shut down. It runs camera-based AR in an ordinary mobile
  browser, including iPhone Safari, which has no WebXR. It also contains the
  "Studio" game engine and helper libraries.
- **License:** MIT for the repository (framework, engine modules, tools),
  compatible with NCSA. **The exception is SLAM world tracking**, which is
  only a separately distributed binary
  ([8thwall/engine](https://github.com/8thwall/engine/blob/main/LICENSE)). That
  licence is free unless the product is sold *and* gets its value mainly from
  the engine, so free Immersity use looks permitted. But it is revocable,
  requires attribution, forbids modification, and assigns any feedback we send
  to Niantic Spatial. The university should review it before we rely on it.
- **Stack:** C++ compiled to WebAssembly for tracking (`reality/`, `c8/`),
  JS/TS camera pipeline with A-Frame, three.js and PlayCanvas bindings, Bazel
  build. Studio's engine (`packages/ecs`) uses FLECS, three.js and Jolt
  physics.
- **Activity:** active as a community project, last commit October 2026.
  The engine package is a pre-release (`0.1.0`).

| Component | Immersity gap | Path | Effort | Notes |
|---|---|---|---|---|
| Image targets (`packages/engine`, MIT; `apps/image-target-cli`) | AR on phones, which Immersity has none of today; iPhones can't run WebXR at all | Adopt as a dependency | Medium | Points a phone camera at a printed image and anchors 3D content to it, with no SLAM binary needed. Flat, cylindrical and conical targets. Fits a classroom: print a target on the lab handout, and a phone shows the catalog model on the page. |
| Unsupported-device fallback (`packages/landing-page`; `packages/xrextras/src/almosttheremodule`) | Students opening a lab on a device that can't run it get a broken page | Adopt or port | Small | A splash page with a QR code to reopen the link on a supported device. The same idea works for the headset build: a desktop browser could show a QR code that opens the session on a headset or phone. |
| Session helpers (`packages/xrextras/src/`: `loadingmodule`, `runtimeerrormodule`, `pauseonhiddenmodule`, `mediarecorder`) | Client polish: load progress, error screens, recording | Port selectively | Small each | Self-contained modules. `mediarecorder` captures video of the XR view, which is useful for students' lab write-ups. |
| WebXR controller and hand models for three.js (`reality/app/xr/js/src/webxrcontrollersthreejs/`) | A web-native client, if Immersity ever moves off a game engine | Reference | n/a | MIT three.js code for controller and hand rendering. |
| World tracking (SLAM, binary only) | Placing models on a tabletop or floor from a phone | Defer | Medium | Needs the restricted binary; see licence above. |

**Verdict:** worth adopting for one specific thing: an **AR catalog viewer for
phones**. It would be a small static page that reads `catalog.json` from the
asset catalog and shows a model on a printed image target, so students
without headsets, including on iPhone, can still handle the lab's objects.
That adds to Immersity rather than replacing anything, and uses only MIT
parts. It does not plug into the Unity or Godot clients, which render
through their own engines.

## Shortlist

Ranked by value to Immersity against effort. Every item is a design to port,
not code to copy, unless marked. Items 1–4 change the client contract, so
they need to land in both clients: immersity-unity and the Godot template
(immersityxr-godot), which implements the same protocol.

1. **Deterministic sub-object ids** (from Hubs). Derive child ids from the root
   id and traversal order. Small, and it unblocks runtime asset spawning.
   *Repo: immersity-unity.*
2. **Spawn/despawn protocol** (Hubs message model + ARENA persistence flag).
   Covers relay-assigned ids, `initialData` carrying the catalog id, creator vs.
   owner, newest-owner-wins, buffering early updates, and cleanup when the
   creator leaves unless the object is pinned or `persist`ed. Medium. This is the
   Phase 2 design for the asset catalog. *Repos: immersity-core relay, immersity-unity.*
3. **Portal-issued JWT for the relay** (ARENA; code may be copied). The portal
   signs `{user, session, role, exp}`. The relay verifies it in the existing
   `auth.js` middleware in place of the shared secret, and takes the user,
   session and teacher role from the token, not the URL. Medium. This is where
   the `&auth=` parameter goes next. *Repos: immersity-core portal and relay,
   Unity template.*
4. **Instructor permission toggles** (idea from CollabXR, enforcement pattern
   from Hubs). Relay-held switches for student interact/draw/place/delete,
   checked by the relay on every message. Small–medium once 3 lands.
5. **Voice through a TURN server now, an SFU later** (Hubs Dialog or Jitsi as
   used by ARENA). Adding coturn fixes users who can't connect behind strict
   NATs today. Moving to an SFU removes the peer-to-peer mesh limit on
   class size. Small, then large.
6. **Lab templates and multiple catalogs** (ARENA templates, CollabXR
   repositories). Medium, after 2.
7. **Phone AR catalog viewer** (8th Wall image targets, MIT only). A static
   page that shows catalog models on printed image targets, reaching students
   without headsets, iPhones included. Medium, independent of the rest.
   *Repo: immersityxr-asset-catalog or a new one.*
8. **Conversations:** ARENA (CMU) on protocol and security; CollabXR (Purdue) on
   classroom features and licensing; ILLIXR (Illinois CS) on offloaded
   rendering research.
