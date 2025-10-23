#!/bin/bash

# ===========================================================================
# Immersity Unified Deployment Script
# ===========================================================================

set -e  # Exit on error

COLOR_RESET='\033[0m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_BLUE='\033[0;34m'

echo -e "${COLOR_BLUE}"
echo "======================================================================="
echo "  Immersity VR Deployment"
echo "======================================================================="
echo -e "${COLOR_RESET}"

# Check if running from correct directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${COLOR_RED}Error: docker-compose.yml not found${COLOR_RESET}"
    echo "Please run this script from the immersity-deployment directory"
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
echo ""
echo "URLs:"
echo "  • Your site:        https://${DOMAIN}"
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

