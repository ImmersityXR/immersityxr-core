# Roadmap from the Komodo planning boards

**Status:** approved to start Phase 1, November 2026.
**Source:** the Miro board "Planey Copy of Internal + Partners (Komodo)", read
in November 2026.

This document triages the feature ideas, priorities and retrospectives from
the original Komodo planning board against the project as it stands today,
and orders the most impactful ones into phases.

## What was read

- **Covered:** about 75 frames of notes.
  - Planning: feature ideas, Spring 2022 priorities, two impact/effort
    matrices, class-session retrospectives, the data pipeline roadmap.
  - Per-repository issue inboxes.
  - User story maps for fashion, materials science, finance, accounting and
    the IMPRESS drawing study.
- **Not covered:**
  - Hand-drawn content, such as the Gantt chart and sketches.
  - One large crystal-structures working frame.
  - Roughly 3,000 loose items outside frames, mostly drawings.
  - Two other boards (`o9J_kvFBNz4=` and `uXjVMMZ1VsE=`), which could not be
    opened. If they hold different content, this triage should be revisited.

## Triage

Many items on the board have since been fixed, or are already designed in
[the spawn and relay auth spec](https://github.com/ImmersityXR/immersityxr-core/blob/research/oss-components/docs/research/SPEC-SPAWN-AND-RELAY-AUTH.md),
which lives on the `research/oss-components` branch until it merges. Each theme shows
where it stands today.

| # | Theme | What the board asked for | Where it stands | Priority |
|---|---|---|---|---|
| 1 | Reliable sessions | Models vanish or vibrate; out of sync until rejoin; reconnect clones your avatar; connection status unclear; anyone can toggle locks; "instructor mode" | Mostly fixed or specified: ghost avatars, reconnect (PR #7), late-join catch-up (Unity PR #10), relay-enforced locks (spec Part B). Left: a connection-status indicator and disconnect notices in the client | Now |
| 2 | Research data | Export head and hand positions and interactions as CSV; linear playback; capture permissions; live capture status; metrics | Capture format v2 is specified (spec Part D) but not built. Capture permissions were designed on the board | Now |
| 3 | Content during a session | "Can't add assets without everyone refreshing"; a Google Poly replacement; lab presets | Spawning is specified (spec Part B). The asset catalog has 20 models built | Now |
| 4 | Getting into a lab | Easier way to join; sharing a URL to headsets is hard; SSO, magic links, password reset; self-registration | Accounts are blocked on the portal. A short join code for headsets needs no portal | Join codes now; accounts with the portal |
| 5 | Everyone participates | Desktop and tablet users who can point, annotate, follow a presenter, and jump to preset views | Desktop spectator mode exists but is view-only | Next |
| 6 | Onboarding in the headset | In-world controls tutorial; auto height calibration; show controllers; long setup time | Height calibration exists. The rest does not | Next |
| 7 | Voice and captions | Jitsi in place of the built-in voice; TURN; captions in VR | Voice signalling and TURN support exist. A media server is the larger step | Next |
| 8 | Student uploads | Students add, preview and re-upload their own work; images and moodboards | Needs the portal | With the portal |
| 9 | Asynchronous sessions | Record a presentation; timestamped comments; watch later | Depends on playback (theme 2) | Later |
| 10 | Creation tools | Primitives, grouping, lights, partial erase, networked undo | Partly built for IMPRESS | Later, unless that study resumes |
| 11 | Avatars | A set of avatars to choose from; "we all look the same" | Not built. Per-user colors would be a cheap first step | Later |
| 12 | Domain modules | Miller indices, molecular dynamics, trading floor, empathy maps, AR maps | Each is its own project | Parked; keep the platform able to host them |
| 13 | Project health | Docs site, load testing, license audit, accessibility, privacy and security audits, Unity upgrade | Monorepo, tests and CI are done. Unity 2020 is still end-of-life | Load testing now; the rest ongoing |

## Plan

### Phase 1: sessions you can trust and data you can use

Everything here works without the portal.

- **Open PRs.** Land the Socket.IO 4 migration (#2), the reconnect fix (#7),
  the debug-logging fix (#8), and Unity's late-join fix (immersity-unity #10).
- **Capture format v2.** Recordings start with a full state snapshot, include
  every kind of state change, and use the relay's clock (spec Part D).
- **Part ids.** Every client derives a model's part ids from the glTF file
  (spec Part A). The relay and catalog side can be built here; the Unity and
  Godot import paths need an editor to verify.
- **CSV exporter.** A tool that turns a capture into CSV files of positions
  and interactions. This was the most-requested research feature on the
  board.
- **Bot clients for load testing.** A script that puts N simulated users in a
  session. The board asked for this twice: "re-verify reliability of
  multiplayer" and "grid of iFrames for load testing".
- **Connection status.** Relay-side events so clients can show connection
  state and who dropped.

### Phase 2: bring things in

- **Spawning.** Spawn and despawn, and relay-enforced locks (spec Part B).
- **Catalog.** Publish it, including a small core set.
- **Join codes.** A short number typed into the headset browser that opens the
  right session.
- **Teacher role.** Through the teacher secret (spec Part C3), so "instructor
  mode" works before the portal exists.

### Phase 3: portal relaunch

- **Security and sign-in.** API authentication first (spec C0), then per-user
  tokens and campus SSO. SSO replaces the password-reset and magic-link ideas.
- **Student uploads** and the capture-permissions screen.

### Phase 4: everyone participates

- **Tablet and desktop users** can point and annotate.
- **Playback,** and then asynchronous sessions built on it.

## Constraints

Relay, portal, catalog and tooling work can be built and tested without a
headset. Unity C# changes need the Unity editor to compile and a headset to
verify.

## Open questions

1. Should theme 5 (tablet and desktop participation) move up, given planned
   research on collaboration across headsets and tablets?
2. Do the two unread boards change any of these priorities?
