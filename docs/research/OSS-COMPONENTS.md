# Open source components review

Working notes from comparing ImmersityXR with similar open source projects, to
find components worth adopting, adapting or learning from. This is a research
branch: nothing here is a commitment. Findings that turn into work get their
own issue or PR.

## What we are looking for

Immersity's known gaps and planned work, roughly in priority order:

| Area | Where Immersity is today | What would help |
|---|---|---|
| Relay auth | Socket.IO relay trusts the `client`/`session` URL params; `auth` param planned | A proven token handshake between portal, client and relay |
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

_None reviewed yet._

## Shortlist

_Filled in as candidates are reviewed: the components worth acting on, ranked
by value to Immersity against effort._
