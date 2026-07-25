#!/usr/bin/env bash
set -euo pipefail

# Install Open WebUI UI customization on a Docker host.
# Usage:
#   sudo bash install.sh
# Optional:
#   OPEN_WEBUI_DIR=/opt/open-webui OPEN_WEBUI_PORT=3000 bash install.sh

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${OPEN_WEBUI_DIR:-/opt/open-webui/custom}"
COMPOSE_FILE="${OPEN_WEBUI_COMPOSE:-/opt/open-webui/docker-compose.yml}"
CONTAINER_NAME="${OPEN_WEBUI_CONTAINER:-open-webui}"

mkdir -p "$TARGET_DIR"
install -m 0644 "$SCRIPT_DIR/custom.css" "$TARGET_DIR/custom.css"
install -m 0644 "$SCRIPT_DIR/loader.js" "$TARGET_DIR/loader.js"

echo "Installed:"
echo "  $TARGET_DIR/custom.css"
echo "  $TARGET_DIR/loader.js"

if [[ ! -f "$COMPOSE_FILE" ]]; then
	cat <<EOF

Compose file not found at: $COMPOSE_FILE

Add these volumes to your open-webui service:

  volumes:
    - open-webui:/app/backend/data
    - $TARGET_DIR/custom.css:/app/build/static/custom.css:ro
    - $TARGET_DIR/loader.js:/app/build/static/loader.js:ro

Then run:
  docker compose -f "$COMPOSE_FILE" up -d
EOF
	exit 0
fi

if ! grep -q '/app/build/static/custom.css' "$COMPOSE_FILE"; then
	echo
	echo "Warning: $COMPOSE_FILE does not mount custom.css yet."
	echo "Add these lines under the open-webui service volumes:"
	echo "    - $TARGET_DIR/custom.css:/app/build/static/custom.css:ro"
	echo "    - $TARGET_DIR/loader.js:/app/build/static/loader.js:ro"
	exit 0
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
	docker compose -f "$COMPOSE_FILE" up -d
	echo
	echo "Restarted stack via: $COMPOSE_FILE"
else
	echo
	echo "Container '$CONTAINER_NAME' is not running. Start it with:"
	echo "  docker compose -f \"$COMPOSE_FILE\" up -d"
fi

PORT="${OPEN_WEBUI_PORT:-3000}"
echo
echo "Verify:"
echo "  curl -I http://127.0.0.1:${PORT}/static/custom.css"
echo "  curl -I http://127.0.0.1:${PORT}/static/loader.js"
echo
echo "Then hard-refresh the browser: Ctrl+Shift+R"
