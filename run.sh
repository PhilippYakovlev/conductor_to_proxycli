#!/bin/bash

# Get directory of the script
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Print banner
echo "==============================================="
echo "   SmartProxy Unified Stack Control Script   "
echo "==============================================="

# Load current BASE_URL from argument or default to whatever is in .env
BASE_URL_ARG="$1"

# If argument is not provided, try to read it from .env
if [ -z "$BASE_URL_ARG" ]; then
    if [ -f .env ]; then
        BASE_URL_ARG=$(grep "^BASE_URL=" .env | head -n 1 | cut -d'=' -f2 | tr -d '\r\n ')
    fi
    # Default to local if not found
    if [ -z "$BASE_URL_ARG" ]; then
        BASE_URL_ARG="local"
    fi
fi

# Apply rules based on BASE_URL
if [ "$BASE_URL_ARG" = "local" ]; then
    TARGET_HOST="cli-proxy-api"
    TARGET_PORT="8319"
    COMPOSE_PROFILES="local"
    echo "[SmartProxy] Mode: LOCAL"
    echo "[SmartProxy] Local cli-proxy-api WILL be started on port 8319."
else
    TARGET_HOST="$BASE_URL_ARG"
    TARGET_PORT="8319" # default remote port, can be customized in .env if needed
    COMPOSE_PROFILES=""
    echo "[SmartProxy] Mode: REMOTE ($TARGET_HOST)"
    echo "[SmartProxy] Local cli-proxy-api will NOT be started."
fi

# Ensure .env file exists
if [ ! -f .env ]; then
    echo "[SmartProxy] .env file not found, creating a default one..."
    if [ -f .env.example ]; then
        cp .env.example .env
    else
        touch .env
    fi
fi

# Helper to update .env variable
update_env_var() {
    local key="$1"
    local value="$2"
    if grep -q "^$key=" .env; then
        # Mac OS and Linux compatible sed replacement
        sed -i.bak "s|^$key=.*|$key=$value|" .env && rm -f .env.bak
    else
        echo "$key=$value" >> .env
    fi
}

# Update configurations in .env
update_env_var "BASE_URL" "$BASE_URL_ARG"
update_env_var "TARGET_HOST" "$TARGET_HOST"
update_env_var "TARGET_PORT" "$TARGET_PORT"
update_env_var "COMPOSE_PROFILES" "$COMPOSE_PROFILES"

echo "[SmartProxy] Environment updated in .env"
echo "-----------------------------------------------"

# Start the Docker Compose stack
echo "[SmartProxy] Rebuilding and launching containers..."
docker compose up -d --build

echo "-----------------------------------------------"
echo "[SmartProxy] Status:"
docker compose ps
echo "==============================================="
echo "[SmartProxy] Setup completed successfully!"
echo " - Smart Proxy (Conductor wrapper): http://localhost:\${PORT:-8317}"
echo " - Claude Proxy (free-claude-code): http://localhost:\${CLAUDE_PORT:-8082}"
if [ "$BASE_URL_ARG" = "local" ]; then
    echo " - Local CLI Proxy API: http://localhost:8319"
    echo " - Local CLI Proxy API Admin Panel: http://localhost:8319/management.html"
fi
echo "==============================================="
