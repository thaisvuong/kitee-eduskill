#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "[1/5] Check Node"
if ! command -v node >/dev/null 2>&1; then
 echo "Node.js chưa cài. Cài Node 22 LTS trước." >&2
 exit 1
fi
node -v

echo "[2/5] Install deps"
npm install

echo "[3/5] Seed env"
if [ ! -f .env.local ]; then
 cp .env.example .env.local
 echo "Đã tạo .env.local — nhớ sửa giá trị cho máy bạn."
fi

echo "[4/5] Build"
npm run build

echo "[5/5] Start"
echo "Chạy: npm run start"
echo "Mở: http://localhost:3100"
