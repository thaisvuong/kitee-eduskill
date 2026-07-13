#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
ZIP="kitee-webapp-release-$(date +%Y%m%d-%H%M%S).zip"
rm -f "$ZIP"
zip -r "$ZIP" . \
  -x "node_modules/*" \
  -x ".next/*" \
  -x "Output/*" \
  -x ".env.local" \
  -x ".git/*" \
  -x "*.DS_Store"
echo "Created: $ZIP"
