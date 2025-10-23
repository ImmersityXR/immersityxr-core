#!/bin/bash

# ===========================================================================
# Immersity Unified Shutdown and Cleanup Script
# ===========================================================================

set -e  # Exit on error

COLOR_RESET='\033[0m'
COLOR_GREEN='\033[0;32m'
COLOR_YELLOW='\033[1;33m'
COLOR_RED='\033[0;31m'
COLOR_BLUE='\033[0;34m'

echo -e "${COLOR_BLUE}"
echo "======================================================================="
echo "  Immersity VR Shutdown & Cleanup"
echo "======================================================================="
echo -e "${COLOR_RESET}"

# Check if running from correct directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${COLOR_RED}Error: docker-compose.yml not found${COLOR_RESET}"
    echo "Please run this script from the immersity-deployment directory"
    exit 1
fi

# Parse command line arguments
CLEAN_CAPTURES=false
CLEAN_CERTIFICATES=false
CLEAN_NETWORK=false
CLEAN_ALL=false
FORCE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --clean-captures)
            CLEAN_CAPTURES=true
            shift
            ;;
        --clean-certificates)
            CLEAN_CERTIFICATES=true
            shift
            ;;
        --clean-network)
            CLEAN_NETWORK=true
            shift
            ;;
        --clean-all)
            CLEAN_ALL=true
            CLEAN_CAPTURES=true
            CLEAN_CERTIFICATES=true
            CLEAN_NETWORK=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --help|-h)
            echo "Usage: ./down.sh [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --clean-captures       Remove all capture data"
            echo "  --clean-certificates   Remove SSL certificates (will be re-requested)"
            echo "  --clean-network        Remove Docker network 'proxy'"
            echo "  --clean-all            Remove everything (captures, certificates, network)"
            echo "  --force                Skip confirmation prompts"
            echo "  --help, -h             Show this help message"
            echo ""
            echo "Examples:"
            echo "  ./down.sh                         # Stop containers only"
            echo "  ./down.sh --clean-all             # Stop and clean everything"
            echo "  ./down.sh --clean-captures        # Stop and remove captures"
            echo "  ./down.sh --clean-all --force     # Clean everything without prompts"
            exit 0
            ;;
        *)
            echo -e "${COLOR_RED}Unknown option: $1${COLOR_RESET}"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Show what will be done
echo "Actions to perform:"
echo "  • Stop all containers: YES"
if [ "$CLEAN_CAPTURES" = true ]; then
    echo "  • Remove capture data: YES"
else
    echo "  • Remove capture data: NO"
fi
if [ "$CLEAN_CERTIFICATES" = true ]; then
    echo "  • Remove SSL certificates: YES"
else
    echo "  • Remove SSL certificates: NO"
fi
if [ "$CLEAN_NETWORK" = true ]; then
    echo "  • Remove Docker network: YES"
else
    echo "  • Remove Docker network: NO"
fi
echo ""

# Confirmation prompt (unless --force)
if [ "$FORCE" = false ]; then
    if [ "$CLEAN_ALL" = true ] || [ "$CLEAN_CAPTURES" = true ] || [ "$CLEAN_CERTIFICATES" = true ]; then
        echo -e "${COLOR_YELLOW}⚠️  Warning: Cleanup operations will delete data!${COLOR_RESET}"
        read -p "Continue? (yes/no): " CONFIRM
        if [ "$CONFIRM" != "yes" ]; then
            echo "Aborted."
            exit 0
        fi
    fi
fi

# Stop containers
echo ""
echo -e "${COLOR_BLUE}Stopping containers...${COLOR_RESET}"
docker compose down

if [ $? -eq 0 ]; then
    echo -e "${COLOR_GREEN}✓${COLOR_RESET} Containers stopped and removed"
else
    echo -e "${COLOR_RED}✗${COLOR_RESET} Failed to stop containers"
    exit 1
fi

# Clean captures
if [ "$CLEAN_CAPTURES" = true ]; then
    echo ""
    echo -e "${COLOR_YELLOW}Cleaning capture data...${COLOR_RESET}"
    
    if [ -d "immersity-relay/captures" ]; then
        # Count captures before deletion
        CAPTURE_COUNT=$(find immersity-relay/captures -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        
        if [ "$CAPTURE_COUNT" -gt 0 ]; then
            # Remove all captures except .gitkeep
            find immersity-relay/captures -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} + 2>/dev/null || true
            echo -e "${COLOR_GREEN}✓${COLOR_RESET} Removed $CAPTURE_COUNT capture session(s)"
        else
            echo -e "${COLOR_GREEN}✓${COLOR_RESET} No captures to remove"
        fi
    else
        echo -e "${COLOR_YELLOW}⚠️${COLOR_RESET}  Captures directory not found"
    fi
fi

# Clean certificates
if [ "$CLEAN_CERTIFICATES" = true ]; then
    echo ""
    echo -e "${COLOR_YELLOW}Cleaning SSL certificates...${COLOR_RESET}"
    
    if [ -f "immersity-proxy/acme.json" ]; then
        # Backup existing certificates
        if [ -s "immersity-proxy/acme.json" ]; then
            BACKUP_FILE="immersity-proxy/acme.json.backup.$(date +%Y%m%d_%H%M%S)"
            cp immersity-proxy/acme.json "$BACKUP_FILE"
            echo -e "${COLOR_GREEN}✓${COLOR_RESET} Backed up certificates to: $BACKUP_FILE"
        fi
        
        # Reset acme.json
        echo '{}' > immersity-proxy/acme.json
        chmod 600 immersity-proxy/acme.json
        echo -e "${COLOR_GREEN}✓${COLOR_RESET} Certificates removed (will be re-requested on next deploy)"
    else
        echo -e "${COLOR_YELLOW}⚠️${COLOR_RESET}  acme.json not found"
    fi
fi

# Clean network
if [ "$CLEAN_NETWORK" = true ]; then
    echo ""
    echo -e "${COLOR_YELLOW}Removing Docker network...${COLOR_RESET}"
    
    if docker network inspect proxy &> /dev/null; then
        # Check if any containers are still using the network
        NETWORK_USERS=$(docker network inspect proxy -f '{{range .Containers}}{{.Name}} {{end}}' 2>/dev/null | wc -w)
        
        if [ "$NETWORK_USERS" -gt 0 ]; then
            echo -e "${COLOR_RED}✗${COLOR_RESET} Cannot remove network 'proxy': still in use by $NETWORK_USERS container(s)"
            echo "   Stop all containers using this network first"
        else
            docker network rm proxy
            echo -e "${COLOR_GREEN}✓${COLOR_RESET} Network 'proxy' removed"
        fi
    else
        echo -e "${COLOR_YELLOW}⚠️${COLOR_RESET}  Network 'proxy' not found"
    fi
fi

# Summary
echo ""
echo -e "${COLOR_GREEN}======================================================================="
echo "  Shutdown Complete"
echo "=======================================================================${COLOR_RESET}"
echo ""
echo "Summary:"
echo "  • Containers:     Stopped and removed"

if [ "$CLEAN_CAPTURES" = true ]; then
    echo "  • Captures:       Cleaned"
else
    echo "  • Captures:       Preserved"
fi

if [ "$CLEAN_CERTIFICATES" = true ]; then
    echo "  • Certificates:   Removed"
else
    echo "  • Certificates:   Preserved"
fi

if [ "$CLEAN_NETWORK" = true ]; then
    echo "  • Network:        Removed"
else
    echo "  • Network:        Preserved"
fi

echo ""
echo "To start again:"
echo "  ./deploy.sh"
echo ""

# Show preserved data
if [ "$CLEAN_ALL" = false ]; then
    echo "Preserved data:"
    
    if [ "$CLEAN_CAPTURES" = false ] && [ -d "immersity-relay/captures" ]; then
        REMAINING_CAPTURES=$(find immersity-relay/captures -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
        if [ "$REMAINING_CAPTURES" -gt 0 ]; then
            echo "  • Captures: $REMAINING_CAPTURES session(s) in immersity-relay/captures/"
        fi
    fi
    
    if [ "$CLEAN_CERTIFICATES" = false ] && [ -f "immersity-proxy/acme.json" ]; then
        if [ -s "immersity-proxy/acme.json" ]; then
            echo "  • Certificates: SSL certificates preserved"
        fi
    fi
    
    echo "  • Builds: Unity builds in immersity-buildserver/builds/"
    echo ""
fi

echo -e "${COLOR_RESET}"


