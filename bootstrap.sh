#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${KIENTRE_REPO_URL:-https://github.com/thaisvuong/kitee-eduskill.git}"
BRANCH="${KIENTRE_BRANCH:-main}"
APP_DIR="${KIENTRE_APP_DIR:-$HOME/KientreAAA}"

if [ -d "$APP_DIR/.git" ]; then
  echo "Updating existing install in $APP_DIR..."
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  echo "Cloning $REPO_URL into $APP_DIR..."
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

chmod +x "$APP_DIR/install.sh" "$APP_DIR/setup.sh" 2>/dev/null || true
exec "$APP_DIR/install.sh"