# Immersity System Architecture & Modernization Briefing

*Prepared June 2026. Covers all five ImmersityXR repositories as they stand
today, for planning the move to University of Illinois VPS hosting and a
refreshed front end.*

Immersity (formerly **Project Komodo**, gelic-idealab / IDEA Lab) is a
multi-user WebXR education platform: instructors schedule VR lab sessions,
students join them in the browser (or a headset browser), and a relay server
synchronizes everyone in real time.

## 1. System map

```
                       ┌──────────────────────────────────────────┐
                       │            immersity-deploy              │
                       │  docker compose · Traefik v3.3 · TLS     │
                       │  (single-VM deployment, this repo)       │
                       └──────────────────────────────────────────┘
                                routes all traffic to ▼

 Browser ──► Portal frontend ──► Portal backend API ──► MariaDB
             (Vue 2 SPA)         (Express :4040)         (in container)
                 │                      │
                 │ iframe               │ presigned uploads
                 ▼                      ▼
             Unity WebGL build      AWS S3 (vrcat-assets)
             served by buildserver  3D assets (glTF), loaded
             (nginx, static)        at runtime by Unity client
                 │
                 ▼ socket.io
             Relay server (/sync /chat /admin)
             multiplayer state · capture/playback

 immersity-unity ──(WebGL build, manual upload)──► buildserver builds/
```

**The contract that makes a new front end easy:** the portal launches a VR
session by iframing the Unity build with URL parameters —
`{BUILD_URL}/{scope}/{build}/?client={userId}&session={sessionId}&teacher={0|1}`
(plus `playback={captureId}` for replays) with `allow="xr-spatial-tracking"`.
Any new frontend that can render that iframe and call the existing REST API
is a drop-in replacement.

## 2. Repository inventory

| Repo | Role | Stack | Last activity | Health |
|---|---|---|---|---|
| immersity-deploy | Single-VM deployment of the whole stack | docker compose, Traefik 3.3, Let's Encrypt | Apr 2026 | Good — most current repo |
| immersity-unity | XR client (WebGL/WebXR) | Unity 2020.3.49 LTS, de-panther WebXR 0.5.1-preview | Feb 2026 | Active; Unity LTS past EOL, preview packages |
| immersity-portal | Web portal: courses, labs, assets, users, metrics + REST API | Vue 2.6 / Vuetify 2 frontend; Express 4 + MariaDB backend | May 2025 | Works; frontend on EOL foundations |
| immersity-relay | Realtime sync: sessions, state, capture/playback, chat | Node.js, Socket.IO 2.3, Express, optional MySQL | Apr 2025 | Works; Socket.IO EOL, no auth |
| immersity-build | Static server for Unity WebGL builds | nginx:stable-alpine, WebDAV upload | Apr 2025 | Simple and fine; README stale |

Key cross-repo couplings:
- **Socket.IO 2.x protocol** is shared by the relay, the portal frontend
  (`socket.io-client` 2.3), and the Unity WebGL template (`socket.io.js`).
  Upgrading to 4.x must happen in all three at once.
- The Unity WebGL template's `relay.js` resolves the relay/API URLs at
  runtime; the portal frontend bakes its URLs in at build time.
- 3D assets live in an **AWS S3 bucket** (`vrcat-assets`, us-east-2),
  uploaded via presigned POSTs from the portal backend, downloaded by the
  Unity client at runtime. Moving fully on-campus means migrating this
  bucket or pointing the config at a MinIO/campus object store.

## 3. Security checklist (do before campus-facing exposure)

**P0 — open doors** *(all three addressed June 2026 — see notes)*
- [x] **Relay had no authentication at all.** The relay now supports
      shared-secret auth (`config.auth.clientSecret` for `/sync` and
      `/chat`; `config.auth.adminSecret` for `/admin`, which is now
      deny-by-default). Configure via `RELAY_CLIENT_SECRET` /
      `RELAY_ADMIN_SECRET` in this repo's `.env`. **Enforcement requires a
      relay image built from source** (`docker compose build
      immersity-relay`) until a new image is published — the 0.1.0 image on
      Docker Hub predates auth. Clients pass the secret via `&auth=` on the
      launch URL (the Unity template's `relay.js` forwards it; the portal
      sends it when `VUE_APP_VR_AUTH_TOKEN` is set). This is a perimeter
      control: the secret is shared per-deployment, not per-user —
      portal-issued per-user tokens remain Phase 3 work.
- [x] **Default admin account** (`admin@immersity.edu` / `password`) is no
      longer seeded. The portal entrypoint creates the initial admin from
      `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars (wired to
      `PORTAL_ADMIN_*` in this repo's `.env`) on first initialization, and
      refuses to initialize without them.
- [x] **Relay CORS was `*:*`** in this repo's `immersity-relay/config.js`.
      It now reads `RELAY_ORIGINS` from `.env` (deploy.sh requires it) and
      falls back to localhost-only. Works with the existing 0.1.0 image,
      since config.js is mounted at runtime.

**P1 — weak crypto / hygiene**
- [ ] Portal passwords are **client-side SHA1** stored as-is. Move to bcrypt
      server-side (requires a migration path for existing users).
- [ ] Relay's MySQL connection uses `rejectUnauthorized: false` (TLS cert
      validation disabled).
- [ ] Both relay and portal-backend images bake in `root:Docker!` SSH
      passwords (an Azure App Service convention). Harmless if port 2222 is
      never published — verify it isn't — and remove when Azure is retired.
- [ ] Traefik dashboard runs in insecure mode on :8080 (bound to localhost;
      confirm that on the VPS, or disable per the README's Security Notes).
- [ ] Buildserver WebDAV upload (PUT/DELETE enabled in
      `immersity-build/default.conf`) has no authentication of its own —
      make sure it is not reachable through the proxy, or add basic auth.

**P2 — robustness**
- [ ] Pin Docker base images (relay was `node:latest`; fixed to `node:22`
      on this branch). Portal uses `node:lts-alpine` (floating).
- [ ] Back up: `immersity-proxy/acme.json`, `immersity-relay/captures/`,
      `immersity-portal/mysql-data/`.

## 4. Modernization roadmap

### Phase 0 — Stand it up on the VPS (days)
Use this repo as-is: `./deploy.sh` with your campus domain. Add the portal
with the new opt-in profile (see `docs/PORTAL.md`). Needs: Ubuntu 22.04+,
Docker, DNS records for the root domain + `portal.` + `api.` subdomains,
ports 80/443 open.

### Phase 1 — Security hardening (1–2 weeks of volunteer time)
The P0/P1 checklist above. Nothing here requires architectural change.

### Phase 2 — Fresh frontend (the main event, ~3–6 months part-time)
**Keep the Express backend, replace the Vue 2 frontend.** The backend's REST
API is clean and decoupled (`/users`, `/courses`, `/labs`, `/assets`,
`/labs/captures`, Swagger spec in `backend/server/openapi.json`); the Vue 2
frontend is EOL and a Vue 2→3 migration touches every component anyway, so a
rewrite costs the same and sheds six years of dependency debt.

Suggested shape for the new "browse WebXR environments" app:
- Vue 3 or React + Vite; Tailwind or a maintained component library.
- Gallery/browse views over the existing endpoints, with live 3D previews of
  the glTF assets (`<model-viewer>` or three.js r170+).
- Reuse the iframe launch contract verbatim (the current implementation is
  ~30 lines: `frontend/src/components/VR/VrClient.vue` in the portal repo).
- Skip the chat/media components — disabled since 2021, relay side is
  explicitly experimental.
- Run it side-by-side with the old portal (new subdomain) until parity.

### Phase 2.5 — Voice/video via WebRTC (signaling + web layer done)
The relay's `/rtc` namespace and the client web layer are ported from
David Tamayo's fork (see Related forks below); what remains is the in-editor
call UI in immersity-unity (`docs/WEBRTC-PORT.md` there has the contract)
and, for off-campus participants, standing up a TURN server (`RTC_TURN_*`
in this repo's `.env` — coturn on the VPS is the usual choice).

### Phase 2.6 — Session persistence (capture half done)
Two related gaps share one mechanism (an append-only event journal):
- **Research capture durability — done (June 2026).** Recordings now stream
  to disk as NDJSON with a manifest, flushed every 500 ms; interrupted
  recordings are finalized on relay startup and stay usable; a converter
  (`tools/export-capture.js` in immersity-relay) produces per-message-type
  CSVs. Previously the whole recording lived in memory and was written once
  at stop — a disruption lost everything.
- **Late-join / rejoin state — remaining.** The relay's state catch-up
  omits drawings (draw events are relayed, never stored) and all state is
  in-memory (lost on relay restart). Plan: store strokes in session state,
  reuse the capture writer as an always-on per-session journal + periodic
  snapshots, restore sessions on startup, and make "recording" a labeled
  time range of the journal instead of a separate buffer. Client side:
  verify the Unity client applies catch-up on rejoin and add stroke
  re-rendering.

### Phase 3 — Protocol & engine upgrades (after the new frontend)
- **Socket.IO 2 → 4** across relay + frontend + Unity template, in lockstep
  (RelayTesting fork is a working reference).
- **Unity 2020.3 → 2022/6000 LTS** and current WebXR Export; budget real QA
  time, the WebXR initialization code is sensitive (see recent commits).
- Automate Unity build upload to the buildserver (CI), replacing the manual
  WebDAV/SFTP flow.
- Decide the asset-storage future: stay on S3 or migrate to campus object
  storage; the backend's `aws.js` is the only integration point.

## 5. Related forks worth knowing about

### David Tamayo's KomodoSandbox + RelayTesting (reviewed June 2026)

A pair of forks containing the most substantial independent Komodo work we
know of, developed Jan–Apr 2024:

- **[KomodoSandbox](https://github.com/davtamay/KomodoSandbox)** — forked
  from `gelic-idealab/impress`, restructured as a standalone Unity project
- **[RelayTesting](https://github.com/davtamay/RelayTesting)** — the
  matching komodo-relay fork with his WebRTC signaling server

**Three valuable bodies of work in them:**

1. **WebRTC mesh voice/video/screen-share** — multi-peer offer/answer/ICE
   over socket.io signaling; mic mute, camera toggle, screen share, device
   switching; per-peer video painted onto Unity textures
   (video → canvas → `texImage2D`); and a `requestAnimationFrame` hijack so
   video keeps updating inside WebXR sessions. *Status: ported into our
   stack June 2026* — the signaling now lives in immersity-relay as the
   `/rtc` namespace (Socket.IO 2.x, per-session rooms, shared-secret auth,
   server-provided ICE config), and the client web layer
   (`webrtc.js`, `webrtcUnity.jslib`, `WebRTCVideoTexture.cs`) is staged in
   immersity-unity. Remaining: in-editor call UI — see
   `docs/WEBRTC-PORT.md` in immersity-unity.
2. **A working Socket.IO 2→4 migration** — RelayTesting runs Socket.IO
   4.7.2 with a migrated `sync.js` and matching 4.x client in the Unity
   template. Use as the playbook for our Phase 3 protocol upgrade.
3. **A working XR-stack modernization** — Unity 2023.2, WebXR Export
   0.22.0 (vs. our 0.5.1-preview), XR Interaction Toolkit 3.0.1, XR Hands
   1.4 with networked grab/scale. De-risks our Unity upgrade; target
   Unity 6 LTS rather than the now-EOL 2023.2 when adopting.

**Caveats:** abandoned mid-refactor in April 2024 (one-developer
prototype); no authentication (ported code had auth added); STUN-only (no
TURN — now configurable via `RTC_TURN_*` in this repo); mesh topology caps
practical video calls at ~4–6 participants; his C# UI layer
(`ShareMediaConnection` etc.) depends on third-party audio libs and his
Unity 2023 UI stack, so it was treated as reference material rather than
ported. If David is reachable through the volunteer network, his
first-hand knowledge of the multi-peer ICE and WebXR rendering-loop edge
cases is worth more than the code.

## 6. Azure / external dependencies to inventory before fully moving on-campus

- Azure Web App deployments (GitHub Actions in relay + portal repos) — retire
  once the VPS is primary.
- Azure Container Registry (`immersityxr.azurecr.io`) vs Docker Hub
  (`immersityxr/*`) — pick one home for images.
- Azure Cognitive Services Speech (relay speech-to-text; optional, currently
  unconfigured).
- AWS S3 `vrcat-assets` bucket (asset storage — actively used).
- Twilio TURN credentials (portal `/turn` endpoint; only needed for the
  disabled WebRTC media chat).
