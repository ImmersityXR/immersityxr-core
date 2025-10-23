# Immersity Unified Deployment

This directory contains everything needed to deploy the complete Immersity VR environment with a single `docker compose up` command.

## Features

✅ **Single docker-compose.yml** - All 3 services in one file  
✅ **Traefik 2.x** - Modern reverse proxy  
✅ **Automatic HTTPS** - Let's Encrypt integration (no manual certificates)  
✅ **Auto-renewal** - Certificates renew automatically  
✅ **HTTP → HTTPS redirect** - Automatic redirection  
✅ **Unified configuration** - All configs in one place  

---

## Table of Contents

- [Features](#features)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Verification](#verification)
- [Let's Encrypt Details](#lets-encrypt-details)
- [Management](#management)
  - [Update Unity Build](#update-unity-build)
  - [Create Clean URLs with Symbolic Links](#create-clean-urls-with-symbolic-links)
  - [Update Relay Server](#update-relay-server)
  - [View Captures](#view-captures)
  - [Restart/Stop Services](#restart-all-services)
- [Migration from Old Setup](#migration-from-old-setup)
- [Security Notes](#security-notes)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)
- [Support](#support)

---

## Directory Structure

```
immersity-deployment/
├── docker-compose.yml          # Main deployment file
├── env.example                 # Environment variables template
├── README.md                   # This file
├── immersity-proxy/           # Traefik configuration
│   ├── traefik.yml            # Traefik static config
│   └── acme.json              # Let's Encrypt certificates (auto-generated)
├── immersity-relay/           # Relay server
│   ├── config.js              # Relay configuration
│   └── captures/              # Recorded sessions (auto-created)
└── immersity-buildserver/     # Static file server
    └── builds/                # Unity WebGL builds
```

---

## Prerequisites

- Ubuntu 22.04+ VM with Docker installed
- Domain name pointing to your VM's public IP
- **Ports 80 and 443 open** in firewall (required for Let's Encrypt HTTP challenge)
- Existing Docker images:
  - `immersity-relay:latest`
  - `immersity-buildserver:latest`
- Docker network: `proxy`

---

## Quick Start

### 1. Configure Environment

```bash
cd ~/immersity-deployment

# Copy environment template
cp env.example .env

# Edit with your domain
nano .env
```

Update `.env`:
```bash
DOMAIN=yourdomain.edu
ACME_EMAIL=admin@yourdomain.edu
TZ=America/Chicago
```

### 2. Update Traefik Configuration

```bash
nano immersity-proxy/traefik.yml
```

Update email (line 23):
```yaml
email: admin@yourdomain.edu  # Change this
```

### 3. Set ACME File Permissions

**IMPORTANT:** The `acme.json` file must have restricted permissions:

```bash
chmod 600 immersity-proxy/acme.json
```

### 4. Upload Unity Build

```bash
# From your local machine
scp -r ./your-unity-build youruser@yourdomain.edu:~/immersity-deployment/immersity-buildserver/builds/

# Or use SFTP/FTP client
```

**Important:** Ensure your build has the fixed `relay.js` (see main documentation).

### 5. Create Docker Network (if not exists)

```bash
docker network create proxy
```

### 6. Deploy!

```bash
cd ~/immersity-deployment
docker compose up -d
```

That's it! Let's Encrypt will automatically:
- Request SSL certificates
- Configure HTTPS
- Set up auto-renewal

---

## Verification

### Check Containers

```bash
docker ps
```

Should show 4 containers:
- `immersity-proxy` (Traefik)
- `immersity-relay` (Node.js)
- `immersity-buildserver` (NGINX)
- `traefik-middlewares` (helper, will exit immediately)

### Check Logs

```bash
# Traefik logs (watch Let's Encrypt certificate generation)
docker logs immersity-proxy -f

# Relay logs
docker logs immersity-relay --tail 50

# Build server logs
docker logs immersity-buildserver --tail 50
```

### Test HTTPS

```bash
# Should return HTTP/2 200
curl -I https://yourdomain.edu

# Check certificate
openssl s_client -connect yourdomain.edu:443 -servername yourdomain.edu < /dev/null
```

### Test VR App

Open browser:
```
https://yourdomain.edu/your-build/index.html?session=test123&client=1&teacher=1
```

Should see:
- ✅ Valid HTTPS (no certificate warnings)
- ✅ Unity app loads
- ✅ Socket.IO connects
- ✅ Capture functionality works

---

## Let's Encrypt Details

### How It Works

1. **HTTP Challenge**: Let's Encrypt sends requests to `http://yourdomain.edu/.well-known/acme-challenge/`
2. **Traefik Responds**: Automatically handles the challenge
3. **Certificate Issued**: Stored in `immersity-proxy/acme.json`
4. **Auto-Renewal**: Certificates automatically renew before expiration (90 days)

### Certificate Storage

Certificates are stored in `immersity-proxy/acme.json`:
```bash
# View certificates
cat immersity-proxy/acme.json | jq .
```

**⚠️ IMPORTANT:** 
- Keep `acme.json` permissions at `600` (owner read/write only)
- Backup this file regularly
- Don't delete it or certificates will be re-requested

### Troubleshooting Let's Encrypt

**Issue: Certificate not generated**

```bash
# Check Traefik logs for errors
docker logs immersity-proxy | grep -i acme

# Common issues:
# 1. Port 80 not accessible from internet
curl -I http://yourdomain.edu

# 2. Domain not pointing to your server
nslookup yourdomain.edu

# 3. Rate limit reached (5 certificates per week)
# Solution: Use staging environment for testing
```

**Enable Let's Encrypt Staging (for testing):**

Edit `immersity-proxy/traefik.yml`:
```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      caServer: https://acme-staging-v02.api.letsencrypt.org/directory  # Add this line
      email: admin@yourdomain.edu
      ...
```

**Force certificate regeneration:**

```bash
# Stop Traefik
docker compose stop immersity-proxy

# Delete certificates
rm immersity-proxy/acme.json
echo '{}' > immersity-proxy/acme.json
chmod 600 immersity-proxy/acme.json

# Restart
docker compose up -d immersity-proxy
docker logs immersity-proxy -f
```

---

## Management

### Update Unity Build

```bash
# Upload new build
scp -r ./new-build youruser@yourdomain.edu:~/immersity-deployment/immersity-buildserver/builds/

# Apply capture fix to relay.js
cp ~/immersity-deployment/immersity-buildserver/builds/v0.5.7/relay.js \
   ~/immersity-deployment/immersity-buildserver/builds/new-build/relay.js

# Update cache buster in index.html
sed -i 's/relay.js"/relay.js?v=1"/' \
   ~/immersity-deployment/immersity-buildserver/builds/new-build/index.html

# No container restart needed - NGINX serves files directly
```

**Important:** The NGINX buildserver serves files from `immersity-deployment/immersity-buildserver/builds/`, not from `immersity-build/builds/`. Always update files in the deployment directory!

### Create Clean URLs with Symbolic Links

Instead of using long URLs like:
```
https://yourdomain.edu/james-working/builds/live/index.html?session=test123&client=1
```

Create clean URLs like:
```
https://yourdomain.edu/unity/index.html?session=test123&client=1
```

**How to create:**

```bash
cd ~/immersity-deployment/immersity-buildserver/builds

# Create symbolic link
ln -s james-working/builds/live unity

# Verify
ls -la unity
# Output: unity -> james-working/builds/live
```

**Benefits:**
- ✅ No file duplication (saves disk space)
- ✅ Updates to source automatically apply to symlink
- ✅ Easy to switch between build versions
- ✅ Professional, user-friendly URLs

**Common patterns:**

```bash
# Production URL
ln -s james-working/builds/live production

# Staging URL
ln -s james-working/builds/testbuild-01 staging

# Latest version
ln -s v2.0 latest
```

**To update a symlink:**

```bash
# Point to different build
ln -sf v2.1 production

# Easy rollback if needed
ln -sf v2.0 production
```

**Troubleshooting:**

If capture doesn't work after creating symlink:
- Clear browser cache: `Ctrl+Shift+R` (or `Cmd+Shift+R` on Mac)
- Or open in incognito/private browsing mode

**See full documentation** in `IMMERSITY_DEPLOYMENT_GUIDE.md` section "Creating Clean URLs with Symbolic Links" for more details.

### Update Relay Server

If you rebuild the `immersity-relay` image:

```bash
docker compose up -d immersity-relay --build
```

### View Captures

```bash
ls -la ~/immersity-deployment/immersity-relay/captures/

# View specific capture
cat ~/immersity-deployment/immersity-relay/captures/test123/*/data | jq .
```

### Restart All Services

```bash
docker compose restart
```

### Stop All Services

**Option 1: Using down.sh script (Recommended)**

```bash
# Stop containers only
./down.sh

# Stop and clean everything
./down.sh --clean-all

# Stop and clean specific items
./down.sh --clean-captures          # Remove capture data
./down.sh --clean-certificates      # Remove SSL certificates
./down.sh --clean-network           # Remove Docker network

# Skip confirmation prompts
./down.sh --clean-all --force
```

**Option 2: Using docker compose directly**

```bash
docker compose down
```

**Cleanup Options Explained:**

- **No options** (`./down.sh`) - Stops containers only, preserves all data
- **`--clean-captures`** - Removes all recorded capture sessions
- **`--clean-certificates`** - Removes SSL certificates (backs them up first, certificates will be re-requested on next deploy)
- **`--clean-network`** - Removes Docker network `proxy` (only if no containers are using it)
- **`--clean-all`** - Removes everything (captures, certificates, network)
- **`--force`** - Skips confirmation prompts (useful for scripts)

**Examples:**

```bash
# Standard shutdown - preserves everything
./down.sh

# Clean shutdown before redeploying
./down.sh --clean-all

# Remove old captures to free disk space
./down.sh --clean-captures

# Force certificate renewal (e.g., after domain change)
./down.sh --clean-certificates

# Automated scripts (no prompts)
./down.sh --clean-all --force
```

**Data Preservation:**

When you run `./down.sh` without options:
- ✅ **Containers stopped** - No services running
- ✅ **Captures preserved** - All recordings kept in `immersity-relay/captures/`
- ✅ **Certificates preserved** - SSL certificates remain valid
- ✅ **Builds preserved** - Unity builds stay in `immersity-buildserver/builds/`
- ✅ **Network preserved** - Docker network `proxy` remains for fast restart

### Update Configuration

After editing `traefik.yml`, `config.js`, or `.env`:

```bash
docker compose down
docker compose up -d
```

---

## Migration from Old Setup

If you're migrating from the three-repository setup:

### 1. Copy Builds

```bash
cp -r ~/workspace-immersity/immersity-build/builds/* \
      ~/immersity-deployment/immersity-buildserver/builds/
```

### 2. Copy Captures

```bash
cp -r ~/workspace-immersity/immersity-relay/captures/* \
      ~/immersity-deployment/immersity-relay/captures/
```

### 3. Copy Config

```bash
cp ~/workspace-immersity/immersity-relay/config.js \
   ~/immersity-deployment/immersity-relay/config.js
```

### 4. Stop Old Containers

```bash
cd ~/workspace-immersity/immersity-proxy
docker compose down

cd ~/workspace-immersity/immersity-relay
docker compose down

cd ~/workspace-immersity/immersity-build
docker compose down
```

### 5. Start New Deployment

```bash
cd ~/immersity-deployment
docker compose up -d
```

---

## Security Notes

1. **acme.json permissions**: Must be `600` (owner read/write only)
2. **Dashboard**: Traefik dashboard is on port 8080 (insecure). Disable in production:
   - Remove port `8080:8080` from docker-compose.yml
   - Set `insecure: false` in traefik.yml
3. **Firewall**: Only ports 80, 443, and 22 (SSH) should be open
4. **Rate limits**: Let's Encrypt has rate limits (5 certs/week). Use staging for testing.
5. **Email**: Use a real email in `traefik.yml` for expiration notifications

---

## Advanced Configuration

### Use DNS Challenge (Instead of HTTP)

If you prefer DNS challenge (useful if port 80 is blocked):

Edit `immersity-proxy/traefik.yml`:
```yaml
certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@yourdomain.edu
      storage: /acme.json
      dnsChallenge:
        provider: cloudflare  # or your DNS provider
        delayBeforeCheck: 30
```

Then add DNS provider credentials to docker-compose.yml:
```yaml
environment:
  - CF_API_EMAIL=your-email@example.com
  - CF_API_KEY=your-cloudflare-api-key
```

Supported providers: cloudflare, route53, digitalocean, etc.

---

## Troubleshooting

### Container won't start

```bash
docker logs immersity-proxy
docker logs immersity-relay
docker logs immersity-buildserver
```

### Network issues

```bash
docker network inspect proxy
```

### Certificate issues

```bash
# Check if Let's Encrypt challenge is accessible
curl http://yourdomain.edu/.well-known/acme-challenge/test

# Check Traefik logs
docker logs immersity-proxy | grep -i acme
```

### Capture not working

```bash
# Check relay logs
docker logs immersity-relay --tail 100

# Verify config
cat ~/immersity-deployment/immersity-relay/config.js

# Check permissions
ls -la ~/immersity-deployment/immersity-relay/captures/
```

---

## Support

- **Main Documentation**: See `IMMERSITY_DEPLOYMENT_GUIDE.md` in parent directory
- **Traefik Docs**: https://doc.traefik.io/traefik/
- **Let's Encrypt Docs**: https://letsencrypt.org/docs/

---

## Change Log

### Version 2.0 (Unified Deployment)
- ✅ Single docker-compose.yml for all services
- ✅ Upgraded to Traefik 2.x
- ✅ Automatic HTTPS via Let's Encrypt
- ✅ No manual certificate management
- ✅ Simplified deployment structure

### Version 1.0 (Original)
- Three separate repositories
- Traefik 1.7
- Manual SSL certificates
- Complex deployment process

---

**End of README**

