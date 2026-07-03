# Immersity

> **EXPERIMENTAL PREVIEW** — this repository is a generated
> rehearsal of the consolidation proposed in
> [docs/CONSOLIDATION-PROPOSAL.md](docs/CONSOLIDATION-PROPOSAL.md).
> The five existing repositories remain the source of truth. This repo may
> be regenerated or deleted at any time; do not build on it yet.

Immersity (formerly Project Komodo) is a multi-user WebXR education
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
[immersity-unity](https://github.com/ImmersityXR/immersity-unity) — see
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
(`git log -- <path>` works across the import boundary).
