#!/usr/bin/env bash
# Kitee eduSkill — cài đặt 1 lệnh cho người dùng mới.
# Dùng: ./setup.sh   (macOS / Linux)
set -euo pipefail

echo "==> Kitee eduSkill — Cài đặt"

# 1) Kiểm tra Node
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Chưa có Node.js. Cài Node 20/22 LTS: https://nodejs.org"
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "❌ Node quá cũ ($(node -v)). Cần Node 18+ (khuyến nghị 20/22 LTS)."
  exit 1
fi
echo "✓ Node $(node -v)"

# 2) Tạo .env.local nếu chưa có
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "✓ Đã tạo .env.local từ .env.example — HÃY MỞ và sửa đường dẫn/model của bạn."
else
  echo "✓ Đã có .env.local (giữ nguyên)."
fi

# 3) Cài dependencies
echo "==> npm install"
npm install

# 4) Build
echo "==> npm run build"
npm run build

echo ""
echo "✅ Xong! Chạy app:"
echo "    npm start"
echo "Rồi mở: http://localhost:3100"
echo ""
echo "Nhớ sửa .env.local trước khi chạy (thư mục eduSkill, router LLM, Google Drive...)."
