#!/usr/bin/env bash

# =============================================================================
# ImmersityXR Monorepo Migration Script
# =============================================================================
# Assembles the `immersity` monorepo from the four web repositories, with
# full commit history preserved via `git subtree add`. The output is a build
# artifact: re-run the script any time to regenerate it from the current
# state of the source repos. See docs/CONSOLIDATION-PROPOSAL.md.
#
#   immersity/
#   ├── docs/                  <- moved up from the deploy repo
#   ├── deploy/                <- immersity-deploy
#   ├── services/
#   │   ├── relay/             <- immersity-relay
#   │   └── buildserver/       <- immersity-build
#   ├── portal/                <- immersity-portal (backend/ + frontend/)
#   └── .github/workflows/     <- path-filtered CI
#
# Usage:
#   ./migrate-to-monorepo.sh [output-dir]
#
# Sources default to the GitHub repos and their default branches. Override
# with environment variables to test against local clones or feature
# branches, e.g.:
#
#   DEPLOY_SRC=~/immersity-deploy DEPLOY_REF=my-branch \
#   RELAY_SRC=~/immersity-relay  RELAY_REF=my-branch  \
#   ./migrate-to-monorepo.sh /tmp/immersity
#
#   PREVIEW=1   adds an "experimental preview" banner to the root README
#
# The script only reads from the source repos and only writes to the output
# directory. It fails loudly (set -e + explicit assertions) if the expected
# file contents have drifted from what it knows how to rewire.
# =============================================================================

set -euo pipefail

OUT="${1:-./immersity}"

DEPLOY_SRC="${DEPLOY_SRC:-https://github.com/ImmersityXR/immersity-deploy.git}"
DEPLOY_REF="${DEPLOY_REF:-main}"
RELAY_SRC="${RELAY_SRC:-https://github.com/ImmersityXR/immersity-relay.git}"
RELAY_REF="${RELAY_REF:-master}"
BUILD_SRC="${BUILD_SRC:-https://github.com/ImmersityXR/immersity-build.git}"
BUILD_REF="${BUILD_REF:-master}"
PORTAL_SRC="${PORTAL_SRC:-https://github.com/ImmersityXR/immersity-portal.git}"
PORTAL_REF="${PORTAL_REF:-master}"
PREVIEW="${PREVIEW:-0}"

say () { printf '\n\033[0;34m== %s\033[0m\n' "$*"; }
ok () { printf '\033[0;32m[OK]\033[0m %s\n' "$*"; }
die () { printf '\033[0;31m[FAIL]\033[0m %s\n' "$*" >&2; exit 1; }

# assert_gone <file> <pattern> - fail if pattern still present after rewiring
assert_gone () {
    if grep -q "$2" "$1"; then die "expected '$2' to be rewired out of $1"; fi
}

# assert_has <file> <pattern> - fail if an expected result is missing
assert_has () {
    if ! grep -q "$2" "$1"; then die "expected '$2' to be present in $1"; fi
}

[ -e "$OUT" ] && die "output directory $OUT already exists - remove it first (the monorepo is regenerated, not updated in place)"

command -v git >/dev/null || die "git is required"
git filter-repo --version >/dev/null 2>&1 || die "git-filter-repo is required (pip install git-filter-repo)"

# =============================================================================
say "Creating monorepo at $OUT"
# =============================================================================

git init -q -b main "$OUT"
cd "$OUT"

BANNER=""
if [ "$PREVIEW" = "1" ]; then
    BANNER="> **EXPERIMENTAL PREVIEW** — this repository is a generated
> rehearsal of the consolidation proposed in
> [docs/CONSOLIDATION-PROPOSAL.md](docs/CONSOLIDATION-PROPOSAL.md).
> The five existing repositories remain the source of truth. This repo may
> be regenerated or deleted at any time; do not build on it yet.

"
fi

cat > README.md <<EOF
# ImmersityXR

${BANNER}ImmersityXR (formerly Project Komodo) is a multi-user WebXR education
platform: instructors schedule VR lab sessions, students join them in the
browser or a headset, and a relay server synchronizes everyone in real time.

## Repository layout

| Path | What it is |
|---|---|
| \`deploy/\` | Single-VM deployment: docker compose, Traefik + Let's Encrypt, deploy scripts |
| \`services/relay/\` | Realtime server: session sync, WebRTC signaling, capture, persistence |
| \`services/buildserver/\` | nginx static server for Unity WebGL builds |
| \`portal/\` | Web portal: Vue frontend + Express/MariaDB backend |
| \`docs/\` | Architecture briefing, setup guides, proposals |

The Unity client lives separately in
[immersityxr-unity](https://github.com/ImmersityXR/immersityxr-unity) — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together.

## Quick start (deploy the stack)

\`\`\`bash
cd deploy
cp env.example .env   # set your domain, secrets, etc.
./deploy.sh
\`\`\`

See \`deploy/README.md\` for the full guide and \`docs/PORTAL.md\` for
enabling the web portal.

## History

This repository was assembled from the original
\`immersity-deploy\`, \`immersity-relay\`, \`immersity-build\`, and
\`immersity-portal\` repositories with full commit history preserved
(\`git log -- <path>\` works across the import boundary).
EOF

git add README.md
git commit -qm "Initialize immersity monorepo"
ok "root README committed"

# =============================================================================
say "Importing repositories with history (git filter-repo)"
# =============================================================================
# Each source is cloned to a temp dir, its entire history is rewritten so
# every commit lives under the target prefix (this is what makes
# `git log -- services/relay` show the original commits), then merged in.

import_repo () {
    local prefix="$1" src="$2" ref="$3"

    local tmp
    tmp=$(mktemp -d)

    git clone -q --no-local -b "$ref" "$src" "$tmp" 2>/dev/null \
        || git clone -q -b "$ref" "$src" "$tmp"

    git -C "$tmp" filter-repo --quiet --force --to-subdirectory-filter "$prefix"

    git fetch -q "$tmp" "$ref"

    git merge -q --allow-unrelated-histories -m "Import $src ($ref) as $prefix/ with full history" FETCH_HEAD

    rm -rf "$tmp"

    ok "$prefix <- $src ($ref)"
}

import_repo deploy "$DEPLOY_SRC" "$DEPLOY_REF"
import_repo services/relay "$RELAY_SRC" "$RELAY_REF"
import_repo services/buildserver "$BUILD_SRC" "$BUILD_REF"
import_repo portal "$PORTAL_SRC" "$PORTAL_REF"

# =============================================================================
say "Moving docs to the repository root"
# =============================================================================

if [ -d deploy/docs ]; then
    git mv deploy/docs docs
    git commit -qm "Move docs from deploy/ to the repository root"
    ok "docs/ moved to root"
else
    die "deploy/docs not found - was DEPLOY_REF a branch that includes the docs?"
fi

# =============================================================================
say "Rewiring deploy for in-repo paths"
# =============================================================================

COMPOSE=deploy/docker-compose.yml

# Relay build context: env-var indirection -> fixed in-repo path
sed -i 's|context: ${RELAY_REPO_PATH:-../immersity-relay}|context: ../services/relay|' "$COMPOSE"
assert_gone "$COMPOSE" 'RELAY_REPO_PATH'
assert_has "$COMPOSE" 'context: ../services/relay'
ok "relay build context -> ../services/relay"

# Portal build contexts
sed -i 's|context: ${PORTAL_REPO_PATH:-../immersity-portal}/frontend|context: ../portal/frontend|' "$COMPOSE"
sed -i 's|context: ${PORTAL_REPO_PATH:-../immersity-portal}/backend|context: ../portal/backend|' "$COMPOSE"
sed -i 's|# Requires the immersity-portal repo checked out next to this one|# Built from ../portal in this repository. See docs/PORTAL.md for setup.|' "$COMPOSE"
sed -i '\|# (or set PORTAL_REPO_PATH). See docs/PORTAL.md for setup.|d' "$COMPOSE"
assert_gone "$COMPOSE" 'PORTAL_REPO_PATH'
assert_has "$COMPOSE" 'context: ../portal/frontend'
assert_has "$COMPOSE" 'context: ../portal/backend'
ok "portal build contexts -> ../portal/{frontend,backend}"

# Buildserver: give it a build context too (same pattern as the relay), so
# the image can be built from source in-repo
python3 - "$COMPOSE" <<'PYEOF'
import sys
path = sys.argv[1]
text = open(path).read()
old = """  immersity-buildserver:
    image: immersityxr/immersity-buildserver:0.1.0
    container_name: immersity-buildserver"""
new = """  immersity-buildserver:
    image: immersityxr/immersity-buildserver:0.1.0
    build:
      context: ../services/buildserver
    pull_policy: missing
    container_name: immersity-buildserver"""
if old not in text:
    sys.exit("buildserver service block has drifted - update the migration script")
open(path, 'w').write(text.replace(old, new))
PYEOF
assert_has "$COMPOSE" 'context: ../services/buildserver'
ok "buildserver gains an in-repo build context"

# env.example: the repo-path variables are meaningless in a monorepo
sed -i '/^# Path to your checkout of the immersity-portal repository$/,+2d' deploy/env.example
sed -i '/^# Path to a local checkout of immersity-relay (only needed to build the$/,+2d' deploy/env.example
assert_gone deploy/env.example 'PORTAL_REPO_PATH'
assert_gone deploy/env.example 'RELAY_REPO_PATH'
ok "env.example: repo-path variables removed"

# deploy.sh: fixed portal path instead of PORTAL_REPO_PATH
sed -i 's|PORTAL_PATH="${PORTAL_REPO_PATH:-../immersity-portal}"|PORTAL_PATH="../portal"|' deploy/deploy.sh
sed -i 's|echo "Clone it (git clone https://github.com/ImmersityXR/immersity-portal.git)"|echo "The portal should be at ../portal inside this repository."|' deploy/deploy.sh
sed -i 's|echo "or set PORTAL_REPO_PATH in .env"|echo "Is this a complete checkout of the immersity monorepo?"|' deploy/deploy.sh
assert_gone deploy/deploy.sh 'PORTAL_REPO_PATH'
bash -n deploy/deploy.sh || die "deploy.sh no longer parses"
ok "deploy.sh rewired and parses"

git add -A
git commit -qm "Rewire deploy for in-repo paths

Build contexts point at ../services/relay, ../services/buildserver, and
../portal/{frontend,backend} instead of env-var-configured sibling
checkouts; the RELAY_REPO_PATH / PORTAL_REPO_PATH variables are removed."
ok "rewiring committed"

# =============================================================================
say "Adding path-filtered CI"
# =============================================================================

mkdir -p .github/workflows

cat > .github/workflows/relay-tests.yml <<'EOF'
name: relay-tests

on:
  pull_request:
    paths:
      - 'services/relay/**'
  push:
    branches: [main]
    paths:
      - 'services/relay/**'

jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: services/relay
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm install --no-save socket.io-client@2
      - name: Unit and integration tests (mocha)
        run: |
          cp config.template.js config.js
          npm test
          rm config.js
      - name: RTC signaling smoke test
        run: node tests/rtc-smoke-test.js
      - name: Capture durability smoke test
        run: node tests/capture-smoke-test.js
      - name: Session persistence smoke test
        run: node tests/persistence-smoke-test.js
EOF

git add .github
git commit -qm "Add path-filtered CI: relay test suite runs on relay changes

mocha suite plus the RTC, capture, and persistence smoke tests run on
every PR that touches services/relay/."
ok ".github/workflows/relay-tests.yml"

# =============================================================================
say "Verifying"
# =============================================================================

for prefix in deploy services/relay services/buildserver portal; do
    count=$(git log --oneline -- "$prefix" | wc -l)
    [ "$count" -gt 5 ] || die "history for $prefix looks too small ($count commits) - path rewrite may have failed"
    ok "$prefix: $count commits of history browsable via 'git log -- $prefix'"
done

printf '\n\033[0;32m=======================================================\033[0m\n'
printf '\033[0;32m  Monorepo assembled at: %s\033[0m\n' "$OUT"
printf '\033[0;32m=======================================================\033[0m\n'
cat <<'EOF'

Validate before publishing:
  1. (cd deploy && cp env.example .env.test && docker compose --env-file .env.test config --quiet && rm .env.test)
  2. (cd services/relay && npm install && node tests/persistence-smoke-test.js)
  3. Read `git log --oneline | head -30` - imports and rewiring are discrete commits

Manual follow-ups the script deliberately leaves to humans:
  - docs/PORTAL.md and deploy/README.md still describe the multi-repo clone
    layout in places (clone instructions, paths) - prose needs a pass
  - Image publishing workflows (Docker Hub / registry creds) - decide where
    images live before adding publish CI
  - The old repos' open PRs must be merged (or ported) before this replaces
    them - regenerate this repo afterwards rather than patching it

To publish as the org preview:
  git remote add origin git@github.com:ImmersityXR/immersity-preview.git
  git push -u origin main
EOF
