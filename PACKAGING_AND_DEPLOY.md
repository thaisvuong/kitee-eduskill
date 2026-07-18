# Đóng gói Kientre Web App để gửi cho người khác

Mục tiêu: người nhận **clone hoặc giải nén** là có thể chạy web app, rồi tự điền cấu hình riêng của họ (đường dẫn, model, router, OAuth/keys). Không nhúng token hay profile cá nhân của anh vào gói gửi đi.

---

## 1. Nên gửi cái gì

Gửi **repo web app này** (KHÔNG gửi `node_modules`, `.next`, `Output`, token, OAuth, memory, sessions):

```text
KientreApp/
 src/
 package.json
 package-lock.json
 Dockerfile
 docker-compose.yml
 .env.example
 README.md
 PACKAGING_AND_DEPLOY.md
 LICENSE
```

Không gửi:
- `.env.local`
- `~/.hermes/profiles/.../google_token.json`
- `google_client_secret.json`
- `Output/`
- `node_modules/`
- `.next/`
- session/history/memory cá nhân

---

## 2. Kiến trúc đúng để người khác dùng được

Tách làm 3 phần:

### A. Web app
- repo này
- Next.js UI + API route `/api/run`, `/api/files`, `/api/settings`

### B. Kientre
- thư mục riêng chứa `slash.mjs`
- web app chỉ **gọi sang** engine qua child process

### C. 9router / LLM router
- mỗi người tự có 9router/model/quota riêng
- web app chỉ cần biết:
 - `HERMES_ROUTER_URL` / `routerBaseUrl`
 - model mặc định

> Kết luận: **đóng gói repo web app + hướng dẫn setup**, không nên nhét Hermes profile riêng của anh vào bản phát hành.

---

## 3. Hai cách phân phối tốt nhất

## Cách 1 — Gửi repo + hướng dẫn setup riêng

Phù hợp nhất khi người nhận có máy riêng và quota/model riêng.

### Người nhận làm:

```bash
git clone <repo-url>
cd KientreApp
cp .env.example .env.local
npm install
npm run build
npm run start
```

Sau đó họ cấu hình trong tab **Cài đặt**:
- Output dir
- Workspace dir
- Kientre dir
- router URL
- model mặc định
- Drive folder riêng của họ

### Ưu điểm
- đơn giản
- an toàn
- mỗi người tự xài model/quota riêng
- không lộ token của anh

### Nhược điểm
- họ phải tự cài Hermes/9router/Kientre

---

## Cách 2 — Gửi bundle Docker/VPS

Phù hợp khi anh host cho nhiều người cùng dùng.

### Khi đó server nên có:
- web app này
- Kientre
- 9router đang chạy trên server
- volume bền cho `Output/`

Người dùng cuối chỉ mở web qua URL:

```text
https://your-domain.com
```

### Ưu điểm
- người dùng không cần cài gì
- dùng chung 1 hệ thống
- dễ kiểm soát phiên bản

### Nhược điểm
- anh phải vận hành server, quota, queue, storage
- nếu nhiều người dùng thật, nên thêm auth + queue bền + rate limit

---

## 4. Nếu muốn có luôn Hermes + 9router cho người khác

Có 2 hướng:

### Hướng A — tài liệu setup chuẩn
Cho người nhận tự cài Hermes + router:

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
hermes setup
```

Rồi họ tự cấu hình provider/model riêng trong Hermes/9router.

Đây là hướng khuyến nghị.

### Hướng B — script bootstrap
Anh có thể gửi kèm script cài:
- Hermes
- Node 22
- clone Kientre
- clone KientreApp
- tạo `.env.local`
- khởi động 9router
- chạy web app

Nhưng script này vẫn **không nên** chứa token/OAuth thật.
Người nhận vẫn phải tự nhập:
- key / login
- model/provider riêng
- Drive folder riêng

---

## 5. Checklist cấu hình người nhận phải tự thay

## Web app (`.env.local`)

```env
KIENTRE_WORKSPACE_DIR=/path/to/workspace
KIENTRE_OUTPUT_DIR=/path/to/workspace/Output
KIENTRE_ENGINE_DIR=/path/to/kientre-engine
HERMES_HOME=/path/to/.hermes/profile
HERMES_DRIVE_PARENT_ID=their_drive_folder_id
NINE_ROUTER_BASE_URL=http://localhost:20128/v1
HERMES_WORKER_MODEL=gc/gemini-2.5-flash
```

## Hermes / router / model
Người nhận tự có:
- model quota riêng
- OAuth/API key riêng
- 9router riêng
- profile Hermes riêng

## Google Drive / Docs
Người nhận tự cấp:
- `google_token.json`
- `google_client_secret.json`
- Drive folder riêng

---

## 6. Cách host cho nhiều người cùng dùng

Nếu anh muốn nhiều người dùng chung 1 web app, khuyến nghị kiến trúc:

### Giai đoạn 1 — nội bộ / ít người
- 1 VPS
- 1 instance web app
- 1 instance 9router
- 1 thư mục Output chung
- chưa cần auth thật

### Giai đoạn 2 — nhiều người thật
Cần thêm:
- auth user
- queue bền (SQLite/Redis/Postgres)
- per-user job history
- per-user output folder
- rate limit
- job retry / cancel / timeout
- logging/monitoring

### Giai đoạn 3 — production chuẩn
- reverse proxy (Nginx/Caddy)
- HTTPS
- PM2/systemd/Docker Compose
- database thật
- object storage (S3/MinIO)
- queue worker riêng

---

## 7. Cách gửi cho người khác ngay bây giờ

Phương án thực tế nhất lúc này:

### Gửi họ 2 repo/thư mục
1. `KientreApp` (repo web app)
2. `Kientre` (engine)

### Kèm 1 file hướng dẫn
- cài Node 22
- cài Hermes
- chạy 9router
- sửa `.env.local`
- `npm install`
- `npm run build`
- `npm run start`

### Và nói rõ
- không gửi token/OAuth cá nhân
- người nhận tự dùng router/model/quota riêng
- nếu muốn dùng như SaaS thì anh nên host tập trung thay vì phát từng bộ local

---

## 8. Lệnh đóng gói release sạch

Từ repo `KientreApp`:

```bash
rm -rf node_modules .next
zip -r kientre-webapp-release.zip . \
 -x "node_modules/*" \
 -x ".next/*" \
 -x "Output/*" \
 -x ".env.local" \
 -x ".DS_Store"
```

Tốt hơn: push lên GitHub/GitLab rồi gửi link repo.

---

## 9. Khuyến nghị chốt

**Nếu gửi cho 1-2 người kỹ thuật**:
- gửi repo + `Kientre` + hướng dẫn setup

**Nếu muốn nhiều người dùng ngay, ít lỗi nhất**:
- anh host 1 server chung
- gửi họ URL web app

**Nếu muốn bán / triển khai lâu dài**:
- em nên nâng tiếp thành bản production có auth + queue bền + DB.

---

## 10. Điều nên làm tiếp trong repo này

Để gói gửi đi "chạy luôn" tốt hơn, nên thêm tiếp:

1. `bootstrap.sh` / `bootstrap.ps1`
2. `docker-compose.prod.yml`
3. `pm2.config.js` hoặc service file
4. `nginx.conf` mẫu
5. auth tối thiểu
6. queue bền bằng SQLite/Postgres

Nếu anh muốn, bước tiếp em có thể làm luôn 1 trong 2 hướng:

### Hướng A — "gửi repo cho người khác tự chạy"
Em sẽ thêm:
- `bootstrap.sh`
- `bootstrap.ps1`
- `release.sh`
- docs setup đầy đủ

### Hướng B — "host 1 server cho nhiều người dùng"
Em sẽ thêm:
- `docker-compose.prod.yml`
- reverse proxy config
- queue bền
- auth tối thiểu
- cấu trúc deploy production

Chọn 1 hướng, em làm tiếp luôn.