#!/usr/bin/env bash
set -euo pipefail

# Install Open WebUI BetterUI customization on a Docker host.
# Includes:
#   - custom.css / loader.js  (UI chrome)
#   - strip_bound_reasoning.py + entrypoint.sh  (cross-model encrypted reasoning fix)
#
# Usage:
#   sudo bash install.sh
# Optional:
#   OPEN_WEBUI_DIR=/opt/open-webui/custom OPEN_WEBUI_PORT=80 bash install.sh

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${OPEN_WEBUI_DIR:-/opt/open-webui/custom}"
COMPOSE_FILE="${OPEN_WEBUI_COMPOSE:-/opt/open-webui/docker-compose.yml}"
CONTAINER_NAME="${OPEN_WEBUI_CONTAINER:-open-webui}"

mkdir -p "$TARGET_DIR"
install -m 0644 "$SCRIPT_DIR/custom.css" "$TARGET_DIR/custom.css"
install -m 0644 "$SCRIPT_DIR/loader.js" "$TARGET_DIR/loader.js"
install -m 0644 "$SCRIPT_DIR/strip_bound_reasoning.py" "$TARGET_DIR/strip_bound_reasoning.py"
install -m 0755 "$SCRIPT_DIR/entrypoint.sh" "$TARGET_DIR/entrypoint.sh"

echo "Installed:"
echo "  $TARGET_DIR/custom.css"
echo "  $TARGET_DIR/loader.js"
echo "  $TARGET_DIR/strip_bound_reasoning.py"
echo "  $TARGET_DIR/entrypoint.sh"

cat <<EOF

Recommended docker run (UI + reasoning patch):

  docker pull ghcr.io/open-webui/open-webui:main
  docker stop $CONTAINER_NAME 2>/dev/null; docker rm $CONTAINER_NAME 2>/dev/null
  docker run -d -p 80:8080 \\
    -v open-webui:/app/backend/data \\
    -v $TARGET_DIR:/custom:ro \\
    -v $TARGET_DIR/custom.css:/app/build/static/custom.css:ro \\
    -v $TARGET_DIR/loader.js:/app/build/static/loader.js:ro \\
    --entrypoint bash \\
    --restart unless-stopped \\
    --name $CONTAINER_NAME \\
    ghcr.io/open-webui/open-webui:main \\
    /custom/entrypoint.sh

EOF

if [[ ! -f "$COMPOSE_FILE" ]]; then
	exit 0
fi

if ! grep -q '/app/build/static/custom.css' "$COMPOSE_FILE"; then
	echo "Warning: $COMPOSE_FILE does not mount custom.css yet."
	echo "Add volumes + entrypoint override as shown above."
	exit 0
fi

if docker ps --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
	# Re-apply patch inside running container if possible (no rebuild needed for py-only)
	if docker exec "$CONTAINER_NAME" test -f /custom/strip_bound_reasoning.py 2>/dev/null; then
		docker exec "$CONTAINER_NAME" python3 /custom/strip_bound_reasoning.py || true
		echo "Patched running container: $CONTAINER_NAME (restart recommended)"
	fi
	docker compose -f "$COMPOSE_FILE" up -d
	echo
	echo "Restarted stack via: $COMPOSE_FILE"
else
	echo
	echo "Container '$CONTAINER_NAME' is not running. Start it with the docker run block above,"
	echo "or: docker compose -f \"$COMPOSE_FILE\" up -d"
fi

PORT="${OPEN_WEBUI_PORT:-80}"
echo
echo "Verify:"
echo "  curl -I http://127.0.0.1:${PORT}/static/custom.css"
echo "  docker exec $CONTAINER_NAME python3 /custom/strip_bound_reasoning.py --check"
echo
echo "Then hard-refresh the browser: Ctrl+Shift+R"
