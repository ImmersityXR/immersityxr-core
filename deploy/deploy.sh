#!/bin/bash

# ===========================================================================
# ImmersityXR Unified Deployment Script
# ===========================================================================

set -e  # Exit on error

COLOR_RESET='\033[0m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_BLUE='\033[0;34m'

echo -e "${COLOR_BLUE}"
echo "======================================================================="
echo "  ImmersityXR VR Deployment"
echo "======================================================================="
echo -e "${COLOR_RESET}"

# Check if running from correct directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${COLOR_RED}Error: docker-compose.yml not found${COLOR_RESET}"
    echo "Please run this script from the deploy/ directory of the immersity repository"
    exit 1
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${COLOR_YELLOW}Warning: .env file not found${COLOR_RESET}"
    echo "Creating .env from env.example..."
    cp env.example .env
    echo -e "${COLOR_YELLOW}WARNING: Please edit .env with your domain before continuing${COLOR_RESET}"
    echo "Run: nano .env"
    exit 1
fi

# Source .env
source .env

echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Configuration loaded"
echo "  Domain: ${DOMAIN}"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${COLOR_RED}Error: Docker not installed${COLOR_RESET}"
    exit 1
fi
echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Docker installed"

# Check Docker Compose
if ! docker compose version &> /dev/null; then
    echo -e "${COLOR_RED}Error: Docker Compose not installed${COLOR_RESET}"
    exit 1
fi
echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Docker Compose installed"

# Check if network exists
if ! docker network inspect proxy &> /dev/null; then
    echo -e "${COLOR_YELLOW}Creating Docker network 'proxy'...${COLOR_RESET}"
    docker network create proxy
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Network created"
else
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Docker network 'proxy' exists"
fi

# Check acme.json permissions
if [ -f "immersity-proxy/acme.json" ]; then
    PERMS=$(stat -c "%a" immersity-proxy/acme.json)
    if [ "$PERMS" != "600" ]; then
        echo -e "${COLOR_YELLOW}Fixing acme.json permissions...${COLOR_RESET}"
        chmod 600 immersity-proxy/acme.json
    fi
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} acme.json permissions correct"
else
    echo -e "${COLOR_YELLOW}Creating acme.json...${COLOR_RESET}"
    echo '{}' > immersity-proxy/acme.json
    chmod 600 immersity-proxy/acme.json
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} acme.json created"
fi

# Check if builds directory has content
if [ -z "$(ls -A immersity-buildserver/builds/)" ]; then
    echo -e "${COLOR_YELLOW}WARNING: No Unity builds found in immersity-buildserver/builds/${COLOR_RESET}"
    echo "   Upload your Unity WebGL build before accessing the site"
fi

# Relay security checks
if [ -z "${RELAY_ORIGINS}" ]; then
    echo -e "${COLOR_RED}Error: RELAY_ORIGINS must be set in .env${COLOR_RESET}"
    echo "It restricts which sites may connect to the relay server. Example:"
    echo "  RELAY_ORIGINS=https://${DOMAIN}:443"
    echo "(add https://<portal domain>:443 too if you deploy the portal)"
    exit 1
fi
echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Relay origins restricted to: ${RELAY_ORIGINS}"

if [ -z "${RELAY_CLIENT_SECRET}" ]; then
    echo -e "${COLOR_YELLOW}WARNING: RELAY_CLIENT_SECRET is empty - anyone who can reach the server can join sessions.${COLOR_RESET}"
    echo "   Set it in .env and rebuild the relay from source to enforce it:"
    echo "   docker compose build immersity-relay"
fi

# Portal checks (only when the portal profile is enabled in .env)
PORTAL_ENABLED=0
if [[ "${COMPOSE_PROFILES:-}" == *portal* ]]; then
    PORTAL_ENABLED=1
    PORTAL_PATH="../portal"

    if [ ! -d "${PORTAL_PATH}" ]; then
        echo -e "${COLOR_RED}Error: portal repo not found at ${PORTAL_PATH}${COLOR_RESET}"
        echo "The portal should be at ../portal inside this repository."
        echo "Is this a complete checkout of the immersity monorepo?"
        exit 1
    fi
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Portal repo found at ${PORTAL_PATH}"

    if [ ! -f "immersity-portal/config.js" ]; then
        echo -e "${COLOR_RED}Error: immersity-portal/config.js not found${COLOR_RESET}"
        echo "Create it from the template and fill in the values:"
        echo "  cp immersity-portal/config.example.js immersity-portal/config.js"
        echo "  nano immersity-portal/config.js"
        exit 1
    fi
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Portal backend config.js present"

    # The frontend bakes its URLs in at build time from this file
    if [ ! -f "${PORTAL_PATH}/frontend/.env.development" ]; then
        echo -e "${COLOR_RED}Error: ${PORTAL_PATH}/frontend/.env.development not found${COLOR_RESET}"
        echo "The portal frontend reads its URLs at build time. Create it:"
        echo "  cp ${PORTAL_PATH}/frontend/.env.development.template ${PORTAL_PATH}/frontend/.env.development"
        echo "Then set (using your domains from .env):"
        echo "  VUE_APP_API_BASE_URL=https://${PORTAL_API_DOMAIN:-api.yourdomain.edu}/"
        echo "  VUE_APP_VR_CLIENT_BASE_URL=https://${DOMAIN}"
        echo "  VUE_APP_RELAY_BASE_URL=https://${DOMAIN}"
        exit 1
    fi
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Portal frontend .env.development present"

    if [ -z "${PORTAL_MYSQL_PASSWORD}" ] || [ -z "${PORTAL_MYSQL_ROOT_PASSWORD}" ]; then
        echo -e "${COLOR_RED}Error: PORTAL_MYSQL_PASSWORD and PORTAL_MYSQL_ROOT_PASSWORD must be set in .env${COLOR_RESET}"
        exit 1
    fi
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Portal database credentials set"

    if [ -z "${PORTAL_ADMIN_EMAIL}" ] || [ -z "${PORTAL_ADMIN_PASSWORD}" ]; then
        echo -e "${COLOR_RED}Error: PORTAL_ADMIN_EMAIL and PORTAL_ADMIN_PASSWORD must be set in .env${COLOR_RESET}"
        echo "They create the initial portal admin account on first start (there is no default password)."
        exit 1
    fi
    echo -e "${COLOR_GREEN}[OK]${COLOR_RESET} Portal admin account configured"
fi

echo ""
echo -e "${COLOR_BLUE}Deploying containers...${COLOR_RESET}"
echo ""

# Deploy
docker compose up -d

echo ""
echo -e "${COLOR_GREEN}======================================================================="
echo "  Deployment Complete!"
echo "=======================================================================${COLOR_RESET}"
echo ""
echo "Services:"
echo "  • Traefik Proxy:    Running on ports 80, 443, 8080"
echo "  • Relay Server:     Running (internal)"
echo "  • Build Server:     Running (internal)"
if [ "$PORTAL_ENABLED" -eq 1 ]; then
    echo "  • Portal Frontend:  Running (internal)"
    echo "  • Portal Backend:   Running (internal)"
fi
echo ""
echo "URLs:"
echo "  • Your site:        https://${DOMAIN}"
if [ "$PORTAL_ENABLED" -eq 1 ]; then
    echo "  • Portal:           https://${PORTAL_DOMAIN}"
    echo "  • Portal API:       https://${PORTAL_API_DOMAIN}"
fi
echo "  • Traefik Dashboard: http://${DOMAIN}:8080/dashboard/"
echo ""
echo "Next Steps:"
echo "  1. Check logs:      docker logs immersity-proxy -f"
echo "  2. Wait for Let's Encrypt certificate (30-60 seconds)"
echo "  3. Test:            curl -I https://${DOMAIN}"
echo "  4. Open in browser: https://${DOMAIN}/your-build/index.html?session=test&client=1"
echo ""
echo "View all containers: docker ps"
echo "View captures:       ls -la immersity-relay/captures/"
echo ""
echo -e "${COLOR_RESET}"

