# Kitee eduSkill Web

Giao diện web (kiểu **chat code**) cho bộ công cụ soạn tài liệu giáo dục **eduSkill**.
Gõ lệnh slash (`/es-create`, `/es-test`, `/es-solve`, `/es-review`) — có **gợi ý tự động** khi gõ `/` — hệ thống chạy trực tiếp flow agent eduSkill và trả về file `.docx` để tải xuống.

- **Chat + autocomplete**: gõ `/` hiện danh sách lệnh, `Tab` để chọn, `Enter` để chạy.
- **Chạy thật**: spawn engine eduSkill (`slash.mjs`), stream tiến trình realtime (SSE).
- **Tải kết quả**: file sinh ra trong `Output/` hiện link tải ngay trong chat + tab "Kết quả".
- **Tab Cài đặt**: chỉnh nơi lưu, thư mục eduSkill, model/router, Google Drive — lưu bền vào file JSON.
- **Brand**: trắng · cam `#E8741C` · navy `#1B3C6E`.

## Yêu cầu

- **Node.js 20 hoặc 22 LTS** (KHÔNG Node 24 — Next 14 chưa ổn định trên đó).
- Bộ **eduSkill** (thư mục chứa `slash.mjs`) — engine chạy pipeline. Trỏ đường dẫn trong tab Cài đặt hoặc biến môi trường `EDUSKILL_DIR`.
- 9Router (hoặc endpoint OpenAI-compatible) để eduSkill gọi LLM.

## Cài & chạy (local)

```bash
npm install
cp .env.example .env.local   # sửa đường dẫn cho máy bạn
npm run dev                  # http://localhost:3100
```

Production:

```bash
npm run build
npm run start                # http://localhost:3100
```

> ⚠️ **Không đặt project trong thư mục iCloud Drive** (Desktop & Documents sync). Next build/dev sẽ treo do iCloud evict file trong `node_modules`. Dùng thư mục local thường (vd `~/KiteeApp`).

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `KITEE_WORKSPACE_DIR` | `.../Kitee` | Thư mục làm việc |
| `HERMES_EDUSKILL_OUTPUT_DIR` | `.../Kitee/Output` | Nơi lưu file kết quả |
| `EDUSKILL_DIR` | `.../eduSkill` | Thư mục chứa `slash.mjs` (engine) |
| `HERMES_HOME` | `~/.hermes/profiles/cmkitee` | Hồ sơ Hermes (OAuth, settings) |
| `HERMES_DRIVE_PARENT_ID` | *(Kitee folder id)* | Google Drive folder id |
| `NINE_ROUTER_BASE_URL` | `http://localhost:20128/v1` | LLM router endpoint |
| `HERMES_WORKER_MODEL` | `gc/gemini-2.5-flash` | Model mặc định |

Cài đặt trong UI (tab Cài đặt) ghi đè và lưu vào `$HERMES_HOME/kitee-webapp-settings.json`.

## Lệnh slash

| Lệnh | Chức năng | Ví dụ |
|---|---|---|
| `/es-create` | Soạn chuyên đề đầy đủ | `/es-create Phân số lớp 5 toán --summary` |
| `/es-test` | Soạn đề kiểm tra | `/es-test phân số lớp 5 toán mc=12 fill=4 essay=3` |
| `/es-solve` | Giải chi tiết tài liệu | `/es-solve ~/Desktop/de.docx lớp 4 toán` |
| `/es-review` | Nhận xét / thẩm định | `/es-review ~/Desktop/bai.docx lớp 4 toán` |
| `/help` | Xem hướng dẫn | `/help` |

## Docker

```bash
docker compose up --build      # http://localhost:3100
```

Gắn eduSkill + Output từ host qua volume (xem `docker-compose.yml`).

## Deploy

- **Docker/VPS**: build image, chạy container, đặt env. Engine eduSkill + Output nên là volume bền.
- **Vercel**: dùng được cho UI, nhưng `/api/run` spawn tiến trình node cần eduSkill + LLM router có mặt trên server — Vercel serverless không hợp để chạy engine nặng/lâu. Khuyến nghị **VPS/Docker** cho bản chạy thật.

## Kiến trúc

```
src/
  app/
    page.tsx              # UI: chat, autocomplete, files, settings, dashboard
    globals.css           # brand trắng-cam-navy
    api/
      run/route.ts        # spawn slash.mjs, stream SSE
      files/route.ts      # list + download Output (chống path traversal)
      settings/route.ts   # đọc/ghi config JSON
      health/route.ts
  lib/
    config/kitee.ts       # env → config
    eduskill/
      slashCommands.ts    # registry lệnh (autocomplete + validate)
      commands.ts         # dựng chuỗi lệnh
```

## Đóng gói / gửi cho người khác / deploy

Xem hướng dẫn chi tiết tại:

- [PACKAGING_AND_DEPLOY.md](./PACKAGING_AND_DEPLOY.md)

Tài liệu này giải thích:
- gửi repo thế nào cho người khác tự chạy
- khi nào nên gửi repo, khi nào nên host server chung
- cách tách web app / eduSkill / Hermes / 9router
- phần nào người nhận phải tự cấu hình riêng

## License

MIT — xem [LICENSE](./LICENSE).
