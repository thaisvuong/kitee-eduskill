#!/usr/bin/env bash
# Kitee eduSkill — cập nhật local app từ GitHub.
# Chạy trong repo: ./update.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

log() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

if ! command -v git >/dev/null 2>&1; then fail "Chưa có git"; fi
if ! command -v npm >/dev/null 2>&1; then fail "Chưa có npm/Node.js"; fi

if [ -n "$(git status --short)" ]; then
  echo "Local đang có thay đổi chưa commit:"
  git status --short
  fail "Dừng cập nhật để tránh ghi đè code local. Hãy commit/stash/xóa thay đổi trước."
fi

log "Tải thông tin mới nhất từ GitHub"
git fetch origin main

LOCAL="$(git rev-parse --short HEAD)"
REMOTE="$(git rev-parse --short origin/main)"
if [ "$LOCAL" = "$REMOTE" ]; then
  ok "Đang ở bản mới nhất: $LOCAL"
else
  log "Cập nhật $LOCAL → $REMOTE"
  git pull --ff-only origin main
fi

log "Cài/cập nhật thư viện"
npm install

log "Build lại app"
npm run build

ok "Cập nhật xong"
echo
echo "Chạy lại app bằng:"
echo "  npm start"
