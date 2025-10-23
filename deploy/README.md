# Immersity Unified Deployment

This directory contains everything needed to deploy the complete Immersity VR environment with a single `docker compose up` command.

## Features

- **Single docker-compose.yml** - All 3 services in one file  
- **Traefik 2.x** - Modern reverse proxy  
- **Automatic HTTPS** - Let's Encrypt integration (no manual certificates)  
- **Auto-renewal** - Certificates renew automatically  
- **HTTP to HTTPS redirect** - Automatic redirection  
- **Unified configuration** - All configs in one place  
- **Git-based deployment** - Version control for all configurations

---

## Table of Contents

- [Features](#features)
- [What You Get](#what-you-get)
- [5-Minute Quick Start](#5-minute-quick-start)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Detailed Setup](#detailed-setup)
- [Verification](#verification)
- [Management](#management)
  - [Update Unity Build](#update-unity-build)
  - [Create Clean URLs with Symbolic Links](#create-clean-urls-with-symbolic-links)
  - [Update Relay Server](#update-relay-server)
  - [View Captures](#view-captures)
  - [Updating from Git](#updating-from-git)
  - [Restart/Stop Services](#restart-all-services)
- [Let's Encrypt Details](#lets-encrypt-details)
- [Migration from Old Setup](#migration-from-old-setup)
- [Security Notes](#security-notes)
- [Advanced Configuration](#advanced-configuration)
- [Troubleshooting](#troubleshooting)
- [Change Log](#change-log)

---

## What You Get

A **unified deployment** with:
- Single `docker-compose.yml` - All 3 services
- Traefik 2.x with Let's Encrypt - Automatic HTTPS
- No manual certificates needed
- Git-based configuration management
- Uses Docker images: `immersityxr/immersity-relay:0.1.0` and `immersityxr/immersity-buildserver:0.1.0`

---

## 5-Minute Quick Start

Perfect for first-time setup or quick deployment.

### Step 1: Clone Repository on VM

```bash
# SSH into your VM
ssh youruser@yourdomain.edu

# Clone the repository
git clone https://github.com/ImmersityXR/immersity-deploy.git
cd immersity-deploy
```

### Step 2: Configure Environment

```bash
# Create .env from template
cp env.example .env

# Edit with your domain and email
nano .env
```

Update these values:
```bash
DOMAIN=yourdomain.edu                 # Your actual domain
ACME_EMAIL=admin@yourdomain.edu       # Email for Let's Encrypt notifications
TZ=America/Chicago                     # Your timezone
```

**Note:** The email from `.env` is automatically used for Let's Encrypt. You don't need to edit `traefik.yml`.

### Step 3: Add Unity Builds to builds Folder

**Important:** Unity WebGL builds must be placed in the `immersity-buildserver/builds/` directory.

**Download from GitHub Releases:**

1. Visit the [Komodo Unity releases page](https://github.com/gelic-idealab/komodo-unity/releases)
2. Download the desired version (e.g., v0.5.8, v0.5.7)
3. Place the build in the builds folder:

```bash
# Navigate to builds directory
cd ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds

# Download and extract build (example using v0.5.8)
wget https://github.com/gelic-idealab/komodo-unity/releases/download/upm%2Fv0.5.8/v0.5.8.zip
unzip v0.5.8.zip
rm v0.5.8.zip

# Or copy from existing deployment if available
cp -R ~/workspace-immersity/immersity-deployment/immersity-buildserver/builds/your-build-folder ./

# Or upload from local machine
# scp -r ./your-unity-build youruser@yourdomain.edu:~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/

# Verify builds are in place
ls -la ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/
```

**Note:** 
- Unity builds are large and should NOT be committed to Git
- The `.gitkeep` file ensures the builds directory structure is tracked
- Multiple build versions can coexist in the builds folder

### Step 4: Deploy!

```bash
# Run deployment
./deploy.sh
```

Done! The script will:
- Check prerequisites
- Create Docker network
- Set correct permissions
- Start all containers
- Let's Encrypt will auto-generate certificates (30-60 seconds)

### Step 5: Test

```bash
# Wait 30-60 seconds for Let's Encrypt, then test:
curl -I https://yourdomain.edu

# Should return: HTTP/2 200
```

Open browser: `https://yourdomain.edu/your-build/index.html?session=test&client=1`

That's it! Your Immersity VR environment is live at `https://yourdomain.edu`

---

## Directory Structure

```
immersity-deploy/
├── docker-compose.yml          # Main deployment file
├── env.example                 # Environment variables template
├── deploy.sh                   # Automated deployment script
├── down.sh                     # Shutdown and cleanup script
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

- **Ubuntu 22.04+ VM** with Docker and Docker Compose installed
- **Domain name** pointing to your VM's public IP
- **Ports 80 and 443 open** in firewall (required for Let's Encrypt HTTP challenge)
- **Git** installed on the VM
- Docker images are pulled automatically from Docker Hub:
  - `immersityxr/immersity-relay:0.1.0`
  - `immersityxr/immersity-buildserver:0.1.0`

---

## Detailed Setup

For those who want more control or need detailed explanations, here's the step-by-step process.

### 1. Clone Repository

```bash
# SSH into your VM
ssh youruser@yourdomain.edu

# Clone the repository
git clone https://github.com/ImmersityXR/immersity-deploy.git
cd immersity-deploy
```

### 2. Configure Environment

```bash
# Copy environment template
cp env.example .env

# Edit with your domain and email
nano .env
```

Update `.env` with your values:
```bash
DOMAIN=yourdomain.edu                 # Your actual domain
ACME_EMAIL=admin@yourdomain.edu       # Email for Let's Encrypt certificate notifications
TZ=America/Chicago                     # Your timezone
```

**Note:** The email from `.env` is automatically passed to Traefik. You don't need to edit `traefik.yml`.

### 3. Copy Unity Builds

**Important:** The `immersity-deploy` repository is for deployment configuration only. Unity builds must be obtained from outside sources.

#### Option 1: Copy from Existing Deployment

```bash
# Navigate to your existing deployment's builds directory
cd ~/workspace-immersity/immersity-deployment/immersity-buildserver/builds

# Copy your Unity build folder to new deployment
cp -R your-build-folder ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/

# Verify builds are copied
ls -la ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/
```

**Where to get Unity builds:** Download from the [Komodo Unity releases page](https://github.com/gelic-idealab/komodo-unity/releases)

#### Option 2: Upload from Local Machine

```bash
# Using SCP from your local machine
scp -r ./your-unity-build youruser@yourdomain.edu:~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/

# Using rsync (recommended for large builds - shows progress and resumes on interruption)
rsync -avz --progress ./your-unity-build youruser@yourdomain.edu:~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/
```

#### Option 3: Download from Build Server

```bash
# If builds are hosted elsewhere, download them
cd ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds
wget https://your-build-server.com/unity-builds/v0.5.7.zip
unzip v0.5.7.zip
rm v0.5.7.zip
```

**Notes:** 
- Unity builds are large (10-100+ MB) and should NOT be committed to Git
- The `.gitkeep` file ensures the builds directory structure is tracked in Git
- Ensure your build has the correct `relay.js` configuration for your domain
- No container restart needed after copying builds

### 4. Set Permissions

The `acme.json` file must have restricted permissions for security:

```bash
chmod 600 immersity-proxy/acme.json
```

### 5. Create Docker Network

If the `proxy` network doesn't exist yet:

```bash
docker network create proxy
```

### 6. Deploy

```bash
cd ~/immersity-deploy

# Option 1: Use the automated deploy script (recommended)
./deploy.sh

# Option 2: Manual deployment
docker compose up -d
```

The deploy script will:
- Check prerequisites
- Create Docker network if needed
- Set correct permissions
- Start all containers
- Show deployment status and URLs

Let's Encrypt will automatically:
- Request SSL certificates (30-60 seconds)
- Configure HTTPS
- Set up auto-renewal (every 90 days)

---

## Verification

### View Status

```bash
# Check all running containers
docker ps

# View Traefik logs (watch Let's Encrypt certificate generation)
docker logs immersity-proxy -f

# View relay server logs
docker logs immersity-relay --tail 50

# View build server logs
docker logs immersity-buildserver --tail 50

# Check captures directory
ls -la ~/immersity-deploy/immersity-relay/captures/
```

Should see 3 running containers:
- `immersity-proxy` (Traefik)
- `immersity-relay` (Node.js Socket.IO server)
- `immersity-buildserver` (NGINX static file server)

### Test HTTPS

```bash
# Wait 30-60 seconds for Let's Encrypt certificate generation
# Then test HTTPS (should return HTTP/2 200)
curl -I https://yourdomain.edu

# Check certificate details
openssl s_client -connect yourdomain.edu:443 -servername yourdomain.edu < /dev/null
```

### Test VR Application

Open in browser:
```
https://yourdomain.edu/your-build/index.html?session=test123&client=1&teacher=1
```

Verify:
- Valid HTTPS (no certificate warnings)
- Unity app loads successfully
- Socket.IO connects to relay server
- Capture functionality works
- No mixed content warnings in console

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

**IMPORTANT:** 
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

Unity builds are stored outside of Git. Update them using one of these methods:

```bash
# Option 1: Copy from existing deployment
cd ~/workspace-immersity/immersity-deployment/immersity-buildserver/builds
cp -R new-build ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/

# Option 2: Upload new build via SCP from local machine
scp -r ./new-build youruser@yourdomain.edu:~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/

# Option 3: Upload using rsync (better for large builds)
rsync -avz --progress ./new-build youruser@yourdomain.edu:~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/

# Option 4: Download from build server
cd ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds
wget https://your-build-server.com/new-build.zip
unzip new-build.zip
rm new-build.zip
```

**Apply capture fix to relay.js if needed:**

```bash
cd ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds

# Copy working relay.js to new build
cp v0.5.7/relay.js new-build/relay.js

# Update cache buster in index.html
sed -i 's/relay.js"/relay.js?v=1"/' new-build/index.html
```

**Important:** 
- No container restart needed - NGINX serves files directly
- Builds should NOT be committed to Git (they're in .gitignore)
- The buildserver serves from `~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/`

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
cd ~/immersity-deploy/immersity-buildserver/builds

# Create symbolic link
ln -s james-working/builds/live unity

# Verify
ls -la unity
# Output: unity -> james-working/builds/live
```

**Benefits:**
- No file duplication (saves disk space)
- Updates to source automatically apply to symlink
- Easy to switch between build versions
- Professional, user-friendly URLs

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
# List all capture sessions
ls -la ~/immersity-deploy/immersity-relay/captures/

# View specific capture data
cat ~/immersity-deploy/immersity-relay/captures/test123/*/data | jq .
```

### Updating from Git

Pull the latest changes from the repository:

```bash
# Pull latest changes
cd ~/immersity-deploy
git pull

# Restart services to apply changes
docker compose restart

# Or redeploy completely (recommended for major changes)
./deploy.sh
```

### Restart All Services

```bash
# Restart all containers
docker compose restart

# Restart specific service
docker compose restart immersity-relay
docker compose restart immersity-buildserver
docker compose restart immersity-proxy
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
- **Containers stopped** - No services running
- **Captures preserved** - All recordings kept in `immersity-relay/captures/`
- **Certificates preserved** - SSL certificates remain valid
- **Builds preserved** - Unity builds stay in `immersity-buildserver/builds/`
- **Network preserved** - Docker network `proxy` remains for fast restart

### Update Configuration

After editing `traefik.yml`, `config.js`, or `.env`:

```bash
docker compose down
docker compose up -d
```

---

## Migration from Old Setup

If you're migrating from the three-repository setup:

### 1. Clone New Repository

```bash
cd ~
git clone https://github.com/ImmersityXR/immersity-deploy.git
cd immersity-deploy
```

### 2. Copy Unity Builds

```bash
# Copy builds from existing deployment
cd ~/workspace-immersity/immersity-deployment/immersity-buildserver/builds
cp -R your-build-folder ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/

# Or copy from older three-repo setup
cp -r ~/workspace-immersity/immersity-build/builds/* \
      ~/workspace-immersity/immersity-deploy/immersity-buildserver/builds/

# Or download from releases
# See: https://github.com/gelic-idealab/komodo-unity/releases
```

### 3. Copy Captures

```bash
cp -r ~/workspace-immersity/immersity-relay/captures/* \
      immersity-relay/captures/
```

### 4. Copy Config

```bash
cp ~/workspace-immersity/immersity-relay/config.js \
   immersity-relay/config.js
```

### 5. Stop Old Containers

```bash
cd ~/workspace-immersity/immersity-proxy
docker compose down

cd ~/workspace-immersity/immersity-relay
docker compose down

cd ~/workspace-immersity/immersity-build
docker compose down
```

### 6. Configure and Start New Deployment

```bash
cd ~/immersity-deploy
cp env.example .env
nano .env  # Update DOMAIN and ACME_EMAIL
./deploy.sh
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
cat ~/immersity-deploy/immersity-relay/config.js

# Check permissions
ls -la ~/immersity-deploy/immersity-relay/captures/

# Test capture manually
# Start capture: curl -X POST http://yourdomain.edu/sync/start_recording/1001
# End capture: curl -X POST http://yourdomain.edu/sync/end_recording/1001
```

---

## Additional Resources

- **Traefik Documentation**: https://doc.traefik.io/traefik/
- **Let's Encrypt Documentation**: https://letsencrypt.org/docs/
- **Docker Compose Documentation**: https://docs.docker.com/compose/

---

## Change Log

### Version 2.1 (Current - Git-Based Deployment)
- Git-based deployment and version control
- Automated deploy.sh and down.sh scripts
- Email configuration via .env (single source of truth)
- Enhanced documentation with quick start guide
- Merged comprehensive documentation into single README

### Version 2.0 (Unified Deployment)
- Single docker-compose.yml for all services
- Upgraded to Traefik 2.x
- Automatic HTTPS via Let's Encrypt
- No manual certificate management
- Simplified deployment structure

### Version 1.0 (Original)
- Three separate repositories
- Traefik 1.7
- Manual SSL certificates
- Complex deployment process

---

**© 2024 Immersity XR. This is a unified, single-repository deployment for Immersity VR.**

