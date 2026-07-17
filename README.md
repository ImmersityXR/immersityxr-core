# ImmersityXR

This repository is the **source of truth** for the ImmersityXR web stack —
the monorepo consolidation proposed in
[docs/CONSOLIDATION-PROPOSAL.md](docs/CONSOLIDATION-PROPOSAL.md) and
adopted in July 2026. All new work on the deploy stack, relay, build
server, and portal happens here.

ImmersityXR (formerly Project Komodo) is a multi-user WebXR education
platform: instructors schedule VR lab sessions, students join them in the
browser or a headset, and a relay server synchronizes everyone in real time.

## Repository layout

| Path | What it is |
|---|---|
| `deploy/` | Single-VM deployment: docker compose, Traefik + Let's Encrypt, deploy scripts |
| `services/relay/` | Realtime server: session sync, WebRTC signaling, capture, persistence |
| `services/buildserver/` | nginx static server for Unity WebGL builds |
| `portal/` | Web portal: Vue frontend + Express/MariaDB backend |
| `docs/` | Architecture briefing, setup guides, proposals |

The Unity client lives separately in
[immersityxr-unity](https://github.com/ImmersityXR/immersityxr-unity) — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Quick start (deploy the stack)

```bash
cd deploy
cp env.example .env   # set your domain, secrets, etc.
./deploy.sh
```

See `deploy/README.md` for the full guide and `docs/PORTAL.md` for
enabling the web portal.

## History

This repository was assembled from the original
`immersity-deploy`, `immersity-relay`, `immersity-build`, and
`immersity-portal` repositories with full commit history preserved
(`git log -- <path>` works across the import boundary). See
[docs/CONSOLIDATION-PROPOSAL.md](docs/CONSOLIDATION-PROPOSAL.md) for the
rationale and migration record.
