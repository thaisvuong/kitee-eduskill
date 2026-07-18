# 📦 Hướng dẫn đưa KientreAAA lên GitHub & cho người khác dùng

Tài liệu này gồm 2 phần:
1. **Cho anh** — cách đẩy repo này lên GitHub.
2. **Cho người dùng khác** — cách họ clone về và tự cài đặt.

---

## PHẦN A — ĐẨY LÊN GITHUB (dành cho anh)

### 0. Chuẩn bị

- Cài `git`: kiểm tra bằng `git --version`.
- Có tài khoản GitHub: https://github.com

### 1. Kiểm tra không lộ thông tin nhạy cảm

Repo này đã cấu hình sẵn `.gitignore` để **không** commit:
- `.env.local` (đường dẫn, model của anh)
- `node_modules`, `.next`, `Output/`
- `google_token.json`, `google_client_secret.json`, mọi file `*token*.json`, `*_secret.json`, `settings.json`

> ⚠️ Tuyệt đối không xóa các dòng này khỏi `.gitignore`. Không bao giờ commit API key / OAuth token.

Kiểm tra nhanh trước khi push:

```bash
cd /Users/nguyenthaivuong/KientreApp
git status --short     # xem file nào sắp được commit
git check-ignore .env.local # phải in ra ".env.local" (nghĩa là đã bị bỏ qua)
```

### 2. Tạo repo trên GitHub

Cách 1 — Trên web:
1. Vào https://github.com/new
2. Repository name: `kientreaaa` (tùy anh).
3. Chọn **Private** (khuyến nghị) hoặc Public.
4. **KHÔNG** tick "Add README" (repo này đã có sẵn).
5. Bấm **Create repository**.

Cách 2 — Dùng GitHub CLI (nếu đã cài `gh`):
```bash
gh repo create kientreaaa --private --source=. --remote=origin
```

### 3. Khởi tạo git & push

```bash
cd /Users/nguyenthaivuong/KientreApp

git init
git add .
git commit -m "KientreAAA web app - initial release"

git branch -M main
git remote add origin https://github.com/<USERNAME>/kientreaaa.git
git push -u origin main
```

Thay `<USERNAME>` bằng tên GitHub của anh.

> Nếu GitHub hỏi mật khẩu khi push HTTPS: dùng **Personal Access Token** thay mật khẩu.
> Tạo token: GitHub → Settings → Developer settings → Personal access tokens → Fine-grained token → cấp quyền `repo`.

### 4. Cập nhật code sau này

Mỗi lần sửa xong:

```bash
git add .
git commit -m "Mô tả thay đổi"
git push
```

### 5. Phát hành phiên bản (tùy chọn)

```bash
./release.sh     # hoặc:
git tag v0.1.0
git push origin v0.1.0
```

---

## PHẦN B — NGƯỜI DÙNG KHÁC CÀI ĐẶT

Copy phần này vào mô tả repo hoặc để họ đọc `README.md`.

### Yêu cầu
- **Node.js 20 hoặc 22 LTS** (https://nodejs.org)
- Một **LLM router tương thích OpenAI** (ví dụ Hermes 9router chạy local, hoặc bất kỳ endpoint OpenAI-compatible nào).
- **Kientre** (thư mục chứa `slash.mjs`) — cần cho tính năng tạo/giải/nhận xét tài liệu.
- (Tùy chọn) Google OAuth nếu muốn tự động upload lên Google Drive.

### Cài đặt nhanh (macOS / Linux)

```bash
git clone https://github.com/<USERNAME>/kientreaaa.git
cd kientreaaa
./setup.sh
```

`setup.sh` sẽ: kiểm tra Node → tạo `.env.local` → `npm install` → `npm run build`.

### Cài đặt thủ công (mọi hệ điều hành, gồm Windows)

```bash
git clone https://github.com/<USERNAME>/kientreaaa.git
cd kientreaaa

# 1. Tạo file cấu hình riêng
cp .env.example .env.local    # Windows: copy .env.example .env.local

# 2. Mở .env.local và sửa các đường dẫn / router / model cho máy bạn

# 3. Cài & build
npm install
npm run build

# 4. Chạy
npm start
```

Mở trình duyệt: **http://localhost:3100**

### Cấu hình `.env.local` cần sửa

| Biến | Ý nghĩa |
|------|---------|
| `KIENTRE_WORKSPACE_DIR` | Thư mục làm việc chính |
| `KIENTRE_OUTPUT_DIR` | Nơi lưu file `.docx`/`.pdf` |
| `KIENTRE_ENGINE_DIR` | Thư mục Kientre (chứa `slash.mjs`) |
| `HERMES_HOME` | Hồ sơ Hermes (OAuth, settings) |
| `NINE_ROUTER_BASE_URL` | Endpoint LLM (OpenAI-compatible) |
| `HERMES_WORKER_MODEL` | Model chính |
| `HERMES_FALLBACK_MODELS` | Danh sách model dự phòng khi lỗi/quota |
| `HERMES_DRIVE_PARENT_ID` | (tùy chọn) folder Google Drive để upload |

> Mỗi người tự điền cấu hình của họ. Repo **không** chứa key/token của bất kỳ ai.

### Google Drive (tùy chọn)
Người dùng muốn auto-upload lên Drive cần:
1. Có OAuth Google riêng đặt trong `HERMES_HOME` (không đi kèm repo).
2. Điền `HERMES_DRIVE_PARENT_ID` là id folder Drive của họ.
3. Bật checkbox "Tự động upload lên Drive" trong Cài đặt.

### Chạy bằng Docker (tùy chọn)

```bash
cp .env.example .env.local  # sửa cấu hình
docker compose up -d --build
```

App chạy ở cổng `3100`.

---

## Câu hỏi thường gặp

**App mở lên nhưng UI không có style?**
Kiểm tra bước build đã copy static vào standalone chưa (script `build` đã tự làm). Chạy lại `npm run build`.

**Lỗi `fetch failed` khi tạo tài liệu?**
Router LLM chưa sẵn sàng. Kiểm tra `NINE_ROUTER_BASE_URL` đúng và endpoint đang chạy.

**Không tạo được file?**
Kiểm tra `KIENTRE_ENGINE_DIR` trỏ đúng thư mục chứa `slash.mjs`, và Python 3.12 có đủ `python-docx`.
