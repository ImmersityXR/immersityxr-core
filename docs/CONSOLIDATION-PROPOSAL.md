# Proposal: Consolidate to Two Repositories

*Drafted June 2026 for team discussion. Status: **proposed** — nothing moves
until the team agrees and the four open PRs land.*

## TL;DR

Merge `immersity-deploy`, `immersity-relay`, `immersity-build`, and
`immersity-portal` into a single **`immersity`** monorepo (with full commit
history preserved). Keep **`immersity-unity`** as its own repository. Archive
the old repos read-only.

## Why now

The June 2026 modernization work (auth, WebRTC, capture durability, session
persistence) is concrete evidence of the coordination cost of the current
split:

- The **shared-secret auth** feature required **four coordinated PRs** across
  four repos, with cross-references and a shared branch name, that only make
  sense merged together.
- The **WebRTC port** touched three repos; **capture durability** touched two.
- `immersity-deploy` carries **duplicated copies** of the relay config and an
  entire `immersity-buildserver/` directory that shadows the `immersity-build`
  repo — two sources of truth that have already drifted (the build repo's
  README still documents a Traefik v1 setup the deploy repo replaced).
- Compose `build:` contexts reach into **sibling checkouts**
  (`../immersity-relay`, `../immersity-portal`) that only work if everyone
  clones repos in the same arrangement.
- Conventions have drifted: default branches are `main` in deploy/unity but
  `master` in relay/portal/build; docs are split across repos; the relay
  README links to an `immersity-docs` repo that doesn't exist in the org.

We have few collaborators and no external forks. The cost of consolidating
only grows as more volunteers build muscle memory for the current layout.
**Right now is the cheapest this will ever be.**

## Proposed structure

```
immersity/                      ← one monorepo for everything web
├── docs/                       ← ARCHITECTURE.md, PORTAL.md, this file —
│                                  one documentation home
├── deploy/                     ← docker-compose, Traefik config, deploy.sh,
│                                  env.example
├── services/
│   ├── relay/                  ← from immersity-relay
│   └── buildserver/            ← from immersity-build (11 files; it was
│                                  never really a separate project)
├── portal/
│   ├── backend/                ← immersity-portal is already organized
│   └── frontend/                  this way internally
└── frontend-next/              ← the new WebXR environment browser,
                                   when that work starts

immersity-unity/                ← stays a separate repository
```

### Why immersity-unity stays separate

Different tooling (Unity, not npm), different contributor profile, large
binary assets, Unity-license CI, and the WebGL build already crosses the
repo boundary as a versioned release artifact. The only coupling to the web
side is the template JS contract (relay events, launch URL parameters),
which is documentation, not shared code. Keeping engine clients separate is
standard practice even in monorepo-first organizations.

## What we gain

| Today | After |
|---|---|
| Cross-cutting change = 3–4 coordinated PRs | One PR, reviewed and merged atomically |
| Relay config + buildserver duplicated in deploy | One source of truth; compose builds from in-repo paths |
| Onboarding: clone 4 repos in the right layout | `git clone` + `docker compose up` |
| Frozen `0.1.0` image tags, drift between code and deploy | Image tags from git SHA; code and deploy config version together |
| Docs scattered (deploy has the architecture brief, relay has protocol docs) | One `docs/` tree |
| 4 issue trackers | One backlog the whole team can triage |

## Costs and risks (honest assessment)

- **CI needs path filters** so a portal change doesn't rebuild the relay
  image. ~An hour of GitHub Actions work, and it's the natural moment to
  finally run the relay's test suite in CI (mocha 20 + smoke tests RTC 12 /
  capture 11 / persistence 8) — today CI only builds a Docker image and runs
  no tests.
- **Per-repo access control is lost.** We don't use it, and at our scale we
  won't soon.
- **Old links and clones.** Mitigated by archiving (not deleting) the old
  repos — GitHub archives stay readable and searchable, and each gets a
  pointer README.
- **History.** Every repo's full commit history is rewritten into the
  monorepo with `git filter-repo`, so `git log -- services/relay` shows the
  original relay commits. No history is lost. (Verified: 500+ commits
  browsable per path in the rehearsal run.)
- **In-flight work.** Mitigated by sequencing: nothing moves until the four
  open PRs (deploy #4, relay #7, unity #8, portal #1) are merged.

## Migration plan

The mechanical steps are **scripted and rehearsed**:
[`deploy/tools/migrate-to-monorepo.sh`](../deploy/tools/migrate-to-monorepo.sh) assembles
the monorepo from the four repos (history-preserving `git filter-repo`
imports, in-repo compose rewiring with drift assertions, path-filtered CI)
and has been validated end-to-end — the generated repo's compose config
validates with the portal profile enabled and the relay test suite passes
inside it. Because the monorepo is a *generated artifact*, a preview can be
stood up at any time (e.g. an org repo named `immersity-preview`) without
touching the existing repos, then regenerated fresh when the team commits.

1. **Land the open PRs** (they're cross-referenced against the current
   layout).
2. **Run `tools/migrate-to-monorepo.sh`** and push the result (as the
   preview first, or directly as `immersity` once agreed).
3. **Prose pass:** the script rewires paths but deliberately leaves
   human-facing docs (clone instructions in deploy/README.md, docs/PORTAL.md)
   for a human read-through.
4. **CI follow-ups:** the relay test workflow ships with the script; image
   publishing workflows (registry choice, credentials) are a separate
   decision.
5. **Archive** the four old repos (read-only) with pointer READMEs.
   `immersity-unity` continues as-is, renaming its default branch to `main`
   if we adopt that convention.
6. **Update the VPS deployment** to clone the monorepo (the deploy flow is
   otherwise unchanged: `cd deploy && ./deploy.sh`).

Estimated effort: the scripted part takes minutes; the prose pass and team
sanity check are the real work (an afternoon).

## Alternative considered: minimal consolidation

Fold only `immersity-build` into `immersity-deploy` (eliminating the literal
duplication) and treat deploy as the documentation umbrella. An afternoon of
work, captures maybe a third of the benefit, leaves the multi-PR coordination
problem in place. Reasonable fallback if the team wants to defer the larger
move, but the larger move only gets more expensive with time.

## Decision checklist

- [ ] Team agrees on two-repo end state (or chooses the minimal alternative)
- [ ] Naming: monorepo is `immersity` (alternatives welcome)
- [ ] Default branch convention: `main`
- [ ] Open PRs merged
- [ ] Migration date set (avoid mid-semester research sessions)
