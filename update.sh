#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3100}"
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ -n "$(git status --short)" ]; then
  echo "Working tree has uncommitted changes. Resolve before update."
  git status --short
  exit 1
fi

echo "Updating repo..."
git fetch origin
git pull --ff-only origin main

echo "Installing deps..."
npm install

echo "Building app..."
npm run build

echo "Done. Restart app with: PORT=$PORT npm start"
