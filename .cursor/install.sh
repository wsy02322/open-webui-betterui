#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for Open WebUI (betterui).
# Installs frontend (npm) and backend (Python) dependencies after checkout.
set -euo pipefail

REPO_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ── uv (fast Python package manager) ─────────────────────────────────────────
if ! command -v uv >/dev/null 2>&1; then
  echo "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"

# ── Frontend dependencies ────────────────────────────────────────────────────
echo "Installing frontend dependencies (npm ci)..."
npm ci

# ── Backend Python environment ───────────────────────────────────────────────
echo "Creating Python virtual environment (.venv)..."
uv venv --python 3.12 .venv

echo "Installing backend dependencies..."
VIRTUAL_ENV="$REPO_ROOT/.venv" uv pip install -r backend/requirements.txt

echo "Install complete."
