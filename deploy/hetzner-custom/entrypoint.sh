#!/usr/bin/env bash
# BetterUI container entrypoint: apply server patches, then start Open WebUI.
# Mount this directory at /custom and override entrypoint, e.g.:
#   docker run ... --entrypoint bash \
#     -v /opt/open-webui/custom:/custom:ro \
#     ghcr.io/open-webui/open-webui:main \
#     /custom/entrypoint.sh

set -euo pipefail

CUSTOM_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MIDDLEWARE="${OPEN_WEBUI_MIDDLEWARE:-/app/backend/open_webui/utils/middleware.py}"

if [[ -f "$CUSTOM_DIR/strip_bound_reasoning.py" && -f "$MIDDLEWARE" ]]; then
	# Image layer is writable; patch once per container filesystem.
	# Re-run is idempotent after upgrades that replace middleware.py.
	if ! python3 "$CUSTOM_DIR/strip_bound_reasoning.py" --check "$MIDDLEWARE" >/dev/null 2>&1; then
		echo "[betterui] applying strip-bound-reasoning patch..."
		python3 "$CUSTOM_DIR/strip_bound_reasoning.py" "$MIDDLEWARE" || {
			echo "[betterui] WARNING: reasoning patch failed; continuing without it" >&2
		}
	else
		echo "[betterui] strip-bound-reasoning already applied"
	fi
else
	echo "[betterui] skip reasoning patch (script or middleware missing)"
fi

cd /app
exec bash start.sh
