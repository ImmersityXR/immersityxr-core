# Deploying the Web Portal

The ImmersityXR Portal (course/lab management, asset library, session launcher)
can be deployed as part of this stack as an **opt-in compose profile**. With the
profile disabled (the default), `docker compose up` behaves exactly as before
and only runs the proxy, relay, and build server.

## What gets added

| Service | Container | Served at |
|---|---|---|
| Portal frontend (Vue SPA via nginx) | `immersity-portal-frontend` | `https://PORTAL_DOMAIN` |
| Portal backend (Express API + MariaDB) | `immersity-portal-backend` | `https://PORTAL_API_DOMAIN` |

Both are built from [`portal/`](../portal/) in this repository
and routed through the existing Traefik proxy with automatic Let's Encrypt
certificates. The portal's MariaDB runs inside the backend container (that's
how its Dockerfile is built today); its data directory is persisted to
`./immersity-portal/mysql-data/` on the host.

## Prerequisites

1. The base stack working (see the main README).
2. **DNS records** for both portal hostnames pointing at this server, e.g.:
   - `portal.yourdomain.edu` → server IP
   - `api.yourdomain.edu` → server IP

   Let's Encrypt issues a separate certificate per hostname, so both records
   must exist before you deploy. Remember the rate limit (5 certs/week) —
   use the staging CA if you're experimenting.

The portal source is part of this repository (`portal/`) — there is nothing
extra to clone.

## Setup

### 1. Enable the profile and set variables in `.env`

```bash
COMPOSE_PROFILES=portal
PORTAL_DOMAIN=portal.yourdomain.edu
PORTAL_API_DOMAIN=api.yourdomain.edu
PORTAL_MYSQL_DATABASE=immersity
PORTAL_MYSQL_USER=immersity
PORTAL_MYSQL_PASSWORD=<strong password>
PORTAL_MYSQL_ROOT_PASSWORD=<strong password>
PORTAL_ADMIN_EMAIL=<your email>
PORTAL_ADMIN_PASSWORD=<strong password>
```

### 2. Create the backend config

```bash
cp immersity-portal/config.example.js immersity-portal/config.js
nano immersity-portal/config.js
```

Fill in at minimum:
- `mysql.user` / `mysql.password` / `mysql.database` — must match the
  `PORTAL_MYSQL_*` values in `.env`
- `cors.origins` — `https://PORTAL_DOMAIN` (no trailing slash)
- `web.session_secret` and `jwt` — long random phrases
- `aws` — S3 credentials, only if you want 3D asset uploads to work

This file is gitignored; never commit it.

### 3. Create the frontend env file

The Vue frontend bakes its service URLs in **at image build time** from
`portal/frontend/.env.development` (its Dockerfile runs
`npm run build-dev`, which uses development mode). From the `deploy/`
directory:

```bash
cp ../portal/frontend/.env.development.template \
   ../portal/frontend/.env.development
```

Set the values to your deployed endpoints:

```bash
VUE_APP_API_BASE_URL=https://api.yourdomain.edu/
VUE_APP_VR_CLIENT_BASE_URL=https://yourdomain.edu
VUE_APP_RELAY_BASE_URL=https://yourdomain.edu
VUE_APP_RTC_URL=
VUE_APP_VR_AUTH_TOKEN=<same value as RELAY_CLIENT_SECRET in .env, if set>
```

Notes:
- `VR_CLIENT_BASE_URL` points at the build server (root domain) — the portal
  iframes Unity builds from `{VR_CLIENT_BASE_URL}/{buildScope}/{build}/`.
- `RELAY_BASE_URL` points at the root domain too; Traefik routes
  `/socket.io`, `/chat`, etc. to the relay.
- If you change these values later you must rebuild the frontend image:
  `docker compose build immersity-portal-frontend`.

### 4. Deploy

```bash
./deploy.sh
```

The script validates the portal config before starting anything. On first
start the backend initializes the database from the SQL scripts in
`portal/backend/db/` and creates the initial admin account from
`PORTAL_ADMIN_EMAIL` / `PORTAL_ADMIN_PASSWORD` (there is no hardcoded
default password).

## Day-to-day

```bash
# Rebuild after pulling portal changes
docker compose build immersity-portal-frontend immersity-portal-backend
docker compose up -d

# Logs
docker logs immersity-portal-backend -f
docker logs immersity-portal-frontend -f

# Database shell (inside the backend container)
docker exec -it immersity-portal-backend mariadb -u root -p
```

The database survives container restarts and rebuilds because the data
directory lives on the host at `./immersity-portal/mysql-data/`. Back this
directory up along with `acme.json` and the captures directory.

## Disabling the portal

Comment out `COMPOSE_PROFILES=portal` in `.env` and run
`docker compose --profile portal down` once to stop the portal containers.
The database data stays on disk for the next time you enable it.
