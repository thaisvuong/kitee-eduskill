#!/usr/bin/env bash
# Kitee eduSkill — cài đặt "all-in-one" cho người dùng cuối.
# Chạy 1 lệnh, tự cài mọi thứ và mở giao diện thiết lập.
#
# Yêu cầu duy nhất: macOS/Linux với internet.

set -euo pipefail

BLUE=$'\033[1;34m'; ORANGE=$'\033[1;33m'; GREEN=$'\033[1;32m'; RED=$'\033[1;31m'; RESET=$'\033[0m'

banner() {
  cat <<'BANNER'

   ██ ██╗██╗████████╗███████╗███████╗
   ██ ██╔╝██║╚══██╔══╝██╔════╝██╔════╝
   █████╔╝ ██║   ██║   █████╗  █████╗
   ██╔═██╗ ██║   ██║   ██╔══╝  ██╔══╝
   ██║  ██╗██║   ██║   ███████╗███████╗
   ╚═╝  ╚═╝╚═╝   ╚═╝   ╚══════╝╚══════╝
        eduSkill · one-shot installer

BANNER
}

log()   { printf "%s==>%s %s\n" "$BLUE" "$RESET" "$*"; }
ok()    { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn()  { printf "%s⚠%s %s\n" "$ORANGE" "$RESET" "$*"; }
fail()  { printf "%s✗%s %s\n" "$RED" "$RESET" "$*"; exit 1; }

OS="$(uname -s)"
[ "$OS" = "Darwin" ] || [ "$OS" = "Linux" ] || fail "Chỉ hỗ trợ macOS/Linux. Trên Windows dùng WSL2."

banner

# ── 1) Node.js 20+ ─────────────────────────────────────────────────
ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major=$(node -p 'process.versions.node.split(".")[0]')
    if [ "$major" -ge 18 ]; then
      ok "Node.js $(node -v) sẵn có"
      return
    fi
    warn "Node.js quá cũ: $(node -v). Sẽ cài Node 22 LTS."
  fi

  log "Cài Node.js 22 LTS..."
  if [ "$OS" = "Darwin" ]; then
    if ! command -v brew >/dev/null 2>&1; then
      log "Cài Homebrew..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      # nạp brew vào shell hiện tại
      if [ -x /opt/homebrew/bin/brew ]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
      if [ -x /usr/local/bin/brew ];    then eval "$(/usr/local/bin/brew shellenv)"; fi
    fi
    brew install node@22
    BREW_PREFIX="$(brew --prefix node@22 2>/dev/null || echo /opt/homebrew/opt/node@22)"
    export PATH="$BREW_PREFIX/bin:$PATH"
    # ghi PATH vĩnh viễn
    if [ -f "$HOME/.zshrc" ] && ! grep -q "node@22/bin" "$HOME/.zshrc" 2>/dev/null; then
      printf '\nexport PATH="%s/bin:$PATH"\n' "$BREW_PREFIX" >> "$HOME/.zshrc"
    fi
  else
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
    sudo apt-get install -y nodejs
  fi
  command -v node >/dev/null || fail "Cài Node thất bại."
  ok "Node.js $(node -v)"
}
ensure_node

# ── 2) 9router (LLM gateway) ───────────────────────────────────────
ensure_9router() {
  # cài 9router vào ~/.npm-global để không cần sudo
  mkdir -p "$HOME/.npm-global"
  npm config set prefix "$HOME/.npm-global" >/dev/null 2>&1 || true
  export PATH="$HOME/.npm-global/bin:$PATH"
  if [ -f "$HOME/.zshrc" ] && ! grep -q ".npm-global/bin" "$HOME/.zshrc" 2>/dev/null; then
    printf '\nexport PATH="$HOME/.npm-global/bin:$PATH"\n' >> "$HOME/.zshrc"
  fi

  if command -v 9router >/dev/null 2>&1; then
    ok "9router $(9router --version 2>/dev/null || echo installed)"
    return
  fi
  log "Cài 9router (LLM router)..."
  npm install -g 9router
  ok "9router $(9router --version 2>/dev/null || echo installed)"
}
ensure_9router

# ── 3) eduSkill engine (đi kèm repo) ───────────────────────────────
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
EDUSKILL_DIR="$REPO_DIR/eduSkill"
if [ ! -f "$EDUSKILL_DIR/slash.mjs" ]; then
  fail "Không tìm thấy eduSkill/slash.mjs trong repo. Repo có thể bị hỏng — hãy clone lại."
fi
ok "eduSkill engine: $EDUSKILL_DIR"

# ── 3b) Python deps cho eduSkill ───────────────────────────────────
ensure_python_deps() {
  local py
  for cand in \
    "${HERMES_PYTHON:-}" \
    /Library/Frameworks/Python.framework/Versions/3.12/bin/python3 \
    /opt/homebrew/bin/python3 \
    /usr/local/bin/python3 \
    python3; do
    [ -n "$cand" ] && command -v "$cand" >/dev/null 2>&1 && { py="$cand"; break; }
  done
  [ -n "${py:-}" ] || { warn "Không tìm thấy Python 3. Bỏ qua cài lib Python — tính năng Word sẽ không chạy."; return; }
  log "Cài Python deps cho eduSkill bằng $py..."
  env -u PYTHONPATH -u PYTHONHOME "$py" -m pip install --user --quiet -r "$EDUSKILL_DIR/requirements.txt" \
    || warn "Cài lib Python thất bại — hãy cài tay: pip install -r eduSkill/requirements.txt"
}
ensure_python_deps

# ── 4) Cài dependencies + build Kitee web app ──────────────────────
log "Cài phụ thuộc web app..."
npm install
log "Build web app..."
npm run build
ok "Build xong"

# ── 5) Tạo .env.local với đường dẫn thật ───────────────────────────
if [ ! -f .env.local ]; then
  USER_HOME="$HOME"
  cat > .env.local <<ENV
# Kitee eduSkill — cấu hình máy của bạn
KITEE_WORKSPACE_DIR=$USER_HOME/Kitee
HERMES_EDUSKILL_OUTPUT_DIR=$USER_HOME/Kitee/Output
EDUSKILL_DIR=$EDUSKILL_DIR
HERMES_HOME=$USER_HOME/.hermes/profiles/cmkitee
HERMES_DRIVE_PARENT_ID=
NINE_ROUTER_BASE_URL=http://localhost:20128/v1
HERMES_WORKER_MODEL=gc/gemini-2.5-flash
HERMES_FALLBACK_MODELS=gc/gemini-2.5-flash,gc/gemini-2.5-pro,cx/gpt-5.5,cc/claude-opus-4-8,openrouter/openrouter/free
HERMES_MODEL_RETRIES=2
HERMES_MODEL_RETRY_DELAY_MS=1200
ENV
  ok "Đã tạo .env.local"
else
  ok "Giữ .env.local hiện có"
fi

mkdir -p "$HOME/Kitee/Output"

# ── 6) Khởi động 9router (nếu chưa chạy) và mở UI để nhập key ──────
if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:20128/ | grep -qE "^(200|3..)$"; then
  ok "9router đã chạy tại http://localhost:20128"
else
  log "Khởi động 9router ở nền..."
  nohup 9router -H 127.0.0.1 -p 20128 -n --skip-update >/tmp/9router.out 2>/tmp/9router.err &
  sleep 3
fi

open_url() {
  local url="$1"
  if [ "$OS" = "Darwin" ]; then open "$url" >/dev/null 2>&1 || true
  else xdg-open "$url" >/dev/null 2>&1 || true; fi
}

cat <<EOF

${GREEN}✅ Cài đặt hoàn tất!${RESET}

Bước tiếp theo:
  1. Trình duyệt sẽ mở giao diện 9router để bạn dán API key
     (OpenRouter / OpenAI / Gemini / Claude…). Bạn chỉ cần 1 key là chạy được.
  2. Sau khi lưu key, quay lại đây và nhấn ENTER để mở Kitee web app.

Địa chỉ 9router (cấu hình key): http://localhost:20128
Địa chỉ Kitee (dùng app):        http://localhost:3100

EOF

open_url "http://localhost:20128"
read -r -p "Đã nhập key xong? Nhấn ENTER để chạy Kitee... " _
open_url "http://localhost:3100"

log "Chạy Kitee web app..."
exec npm start
