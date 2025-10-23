# Quick Setup Guide

## What You Have

A **unified deployment** with:
- ✅ Single `docker-compose.yml` - All 3 services
- ✅ Traefik 2.x with Let's Encrypt - Automatic HTTPS
- ✅ No manual certificates needed
- ✅ Uses existing Docker images (`immersity-relay:latest`, `immersity-buildserver:latest`)

## 5-Minute Setup

### 1. Copy to VM

```bash
# From your local machine
scp -r immersity-deployment youruser@yourdomain.edu:~/
```

### 2. Configure

```bash
ssh youruser@yourdomain.edu
cd ~/immersity-deployment

# Create .env from template
cp env.example .env

# Edit with your domain
nano .env
```

Change:
```bash
DOMAIN=yourdomain.edu          # Your actual domain
ACME_EMAIL=admin@yourdomain.edu  # Your email
```

### 3. Update Traefik Email

```bash
nano immersity-proxy/traefik.yml
```

Line 23 - change email:
```yaml
email: admin@yourdomain.edu  # Your actual email
```

### 4. Deploy!

```bash
# Make deploy script executable
chmod +x deploy.sh

# Run deployment
./deploy.sh
```

Done! The script will:
- ✅ Check prerequisites
- ✅ Create Docker network
- ✅ Set correct permissions
- ✅ Start all containers
- ✅ Let's Encrypt will auto-generate certificates

### 5. Test

```bash
# Wait 30-60 seconds for Let's Encrypt, then:
curl -I https://yourdomain.edu

# Should return: HTTP/2 200
```

Open browser: `https://yourdomain.edu/your-build/index.html?session=test&client=1`

## Upload Unity Build

```bash
# From local machine
scp -r ./your-unity-build youruser@yourdomain.edu:~/immersity-deployment/immersity-buildserver/builds/
```

No restart needed!

## Create Clean URLs (Optional)

Make your URLs cleaner with symbolic links:

**Before:**
```
https://yourdomain.edu/james-working/builds/live/index.html?session=test&client=1
```

**After:**
```
https://yourdomain.edu/unity/index.html?session=test&client=1
```

**How to:**

```bash
cd ~/immersity-deployment/immersity-buildserver/builds
ln -s james-working/builds/live unity
```

**Update symlink to new build:**
```bash
ln -sf new-build-folder unity
```

**For full details, see README.md section on "Create Clean URLs with Symbolic Links"**

## View Status

```bash
# All containers
docker ps

# Logs
docker logs immersity-proxy -f      # Watch Let's Encrypt certificate generation
docker logs immersity-relay --tail 50
docker logs immersity-buildserver --tail 50

# Captures
ls -la immersity-relay/captures/
```

## Troubleshooting

**Certificate not generated?**
```bash
docker logs immersity-proxy | grep -i acme
```

Common issues:
- Port 80/443 not open: Check firewall
- Domain not pointing to server: `nslookup yourdomain.edu`
- Rate limit: Use staging (see README.md)

**Container won't start?**
```bash
docker logs container-name
```

**Need to restart?**
```bash
docker compose restart
```

## Management

```bash
# Start all
./deploy.sh

# Stop all (preserves data)
./down.sh

# Stop and clean everything
./down.sh --clean-all

# Stop and remove captures only
./down.sh --clean-captures

# Restart all
docker compose restart

# View specific logs
docker logs immersity-relay --tail 100 -f
```

## Migration from Old Setup

If you're coming from the three-repo setup:

```bash
# Copy Unity builds
cp -r ~/workspace-immersity/immersity-build/builds/* \
      ~/immersity-deployment/immersity-buildserver/builds/

# Copy captures
cp -r ~/workspace-immersity/immersity-relay/captures/* \
      ~/immersity-deployment/immersity-relay/captures/

# Stop old containers
cd ~/workspace-immersity/immersity-proxy && docker compose down
cd ~/workspace-immersity/immersity-relay && docker compose down
cd ~/workspace-immersity/immersity-build && docker compose down

# Start new deployment
cd ~/immersity-deployment
./deploy.sh
```

## What Changed from Old Setup?

### Old Way (3 repositories):
```bash
cd ~/workspace-immersity/immersity-proxy && docker compose up -d
cd ~/workspace-immersity/immersity-relay && docker compose up -d
cd ~/workspace-immersity/immersity-build && docker compose up -d
```

### New Way (Unified):
```bash
cd ~/immersity-deployment
./deploy.sh
```

### Key Improvements:
- ✅ Traefik 1.7 → 2.x (modern)
- ✅ Manual certs → Let's Encrypt (automatic)
- ✅ 3 commands → 1 command
- ✅ 3 directories → 1 directory
- ✅ Complex setup → Simple setup

---

**For detailed documentation, see `README.md`**

