# KientreAAA → Mini-Hermes cho soạn tài liệu — Implementation Plan

> **For Hermes:** Thực thi tuần tự từng Task. Sau mỗi Task: `npm run typecheck` phải sạch; các Task đụng runtime thì `curl` kiểm chứng. Local-first — KHÔNG commit/push GitHub trừ khi anh nói rõ.

**Goal:** Biến KientreAAA từ "4 module gọi skill cứng" thành mini-Hermes đơn giản hoá: (1) nạp **Source** (file/link/text) làm căn cứ soạn, (2) **Custom Skills** — tự tạo/sửa prompt-skill, (3) **Module Builder** — tự định nghĩa yêu cầu/persona/behaviour cho từng module.

**Architecture:** Không viết lại engine. 3 hệ con lưu dưới dạng **data JSON** trong `HERMES_HOME`, engine đọc qua **env vars** (giống cơ chế `HERMES_FALLBACK_MODELS` sẵn có) và **inject vào `system`/`user`** của mọi agent tại điểm hội tụ `callModel()`. Source được đọc/extract ở webapp, ghép thành 1 khối "REFERENCE" truyền xuống engine.

**Tech Stack:** Next.js 14 (App Router) + React 18 (webapp) · Node ESM engine (`kientre-engine/`) · JSON files trong `~/.hermes/profiles/cmkitee/`.

---

## Nguyên tắc thiết kế (đọc trước khi code)

- **Điểm inject duy nhất trong engine:** `kientre-engine/server/llm.mjs` → `callModel()`. Mọi agent đều đi qua đây. Thêm 2 khối env:
  - `KIENTRE_SYSTEM_EXTRA` — chèn cuối `system` (persona/behaviour/định nghĩa module + skill).
  - `KIENTRE_REFERENCE` — chèn đầu `user` dưới nhãn `【NGUỒN CĂN CỨ (ưu tiên bám sát)】…` (source library).
  - Cắt độ dài an toàn (ví dụ ref ≤ 24000 ký tự) để không vỡ context.
- **Nguồn chân lý cấu hình = JSON dưới `HERMES_HOME`**, KHÔNG hardcode. Webapp CRUD, `run` route đọc file → set env cho child process.
- **Bí mật không lộ:** giống `apiKeys` — nếu skill/source chứa nội dung nhạy cảm thì vẫn nằm server-side; source raw không cần mask nhưng KHÔNG log ra SSE.
- **YAGNI:** chưa làm versioning/multi-user. 1 file JSON/loại, ghi đè nguyên khối.
- **Tương thích ngược:** module cũ (topic/test/solve/review) vẫn chạy y hệt khi chưa cấu hình gì.

---

## Phần A — Source Library (nạp căn cứ)

### Task A1: File lưu source + API CRUD
**Objective:** Có nơi lưu danh sách source (text/link/file-extract) theo scope (global + theo module).

**Files:**
- Create: `src/app/api/sources/route.ts`
- Data file (runtime): `${HERMES_HOME}/kientre-sources.json`

**Cấu trúc JSON:**
```json
{
  "items": [
    { "id": "src_ab12", "title": "SGK Toán 5 - Phân số",
      "kind": "text|link|file", "scope": "global|topic|test|solve|review",
      "content": "…đã extract thành text…", "sourceRef": "url hoặc tên file gốc",
      "enabled": true, "createdAt": 1730000000000 }
  ]
}
```

**API:**
- `GET /api/sources` → `{ ok, items }`
- `POST /api/sources` body `{ item }` (không id → tạo mới; có id → update). Với `kind:"link"` server tự `fetch` URL, strip HTML → text (dùng lại `stripTags` pattern từ `server/websearch.mjs`). Với `kind:"file"` nhận `filePath` đã upload → gọi extract (xem A2).
- `DELETE /api/sources?id=…` → xoá.
- Cắt `content` ≤ 40000 ký tự khi lưu.

**Verify:** `curl -s localhost:3100/api/sources` → `{"ok":true,"items":[]}`; POST 1 text item → GET thấy item; DELETE → mất.

---

### Task A2: Extract file → text cho source
**Objective:** Upload file (docx/pdf/txt/md) rồi biến thành source text.

**Files:**
- Modify: `src/app/api/sources/route.ts` (nhánh `kind:"file"`)
- Reuse: engine `kientre-engine/server/extract.mjs` (đã có `extractText`) — gọi qua child `node -e` HOẶC re-implement bằng `mammoth` (đã có trong deps) cho docx + đọc thẳng txt/md.

**Cách gọn nhất (ponytail):** dùng `mammoth` sẵn có cho `.docx`, `fs.readFile` cho `.txt/.md`. PDF → để sau (đánh dấu `pdf: cần OCR`). Không thêm dependency mới.

**Verify:** upload 1 .docx qua `/api/upload` (đã có) → POST source `{kind:"file",filePath}` → item.content có chữ.

---

### Task A3: UI — Source Library view
**Objective:** Thêm mục sidebar "Nguồn (Source)" để CRUD, bật/tắt, gán scope.

**Files:**
- Modify: `src/app/page.tsx`
  - Thêm `'sources'` vào type `View`.
  - Thêm nav-item + icon (`Library`/`BookMarked`).
  - Component `SourcesView`: list card, form thêm (title, chọn kind text/link/file, textarea/url/upload, chọn scope), toggle enabled, nút xoá. Badge số ký tự.
- Modify: `src/app/globals.css` — style `.source-row`, `.source-kind-pill`.

**Verify (browser hoặc curl):** thêm/sửa/xoá phản ánh đúng qua `/api/sources`.

---

## Phần B — Module Definitions (định nghĩa module)

### Task B1: Mở rộng settings để chứa "định nghĩa module"
**Objective:** Mỗi module có thêm trường tự-định-nghĩa: `persona`, `instructions`, `skillId` (trỏ tới custom skill ở Phần C), `useSources` (bật căn cứ).

**Files:**
- Modify: `src/app/api/settings/route.ts`
  - `defaultModule()` thêm: `persona: ''`, `instructions: ''`, `skillId: ''`, `useSources: true`.
  - POST đã merge per-module → tự nhận field mới (whitelist theo key module, không cần đổi logic merge).
- Modify: `src/app/page.tsx` → `ModuleConfig` type thêm 4 field trên.

**Verify:** POST `{modules:{topic:{persona:"Giáo viên Toán tiểu học"}}}` → GET thấy `persona` trong module topic.

---

### Task B2: UI — Module Builder trong ModuleSettingsModal
**Objective:** Trong modal "Cài đặt module" (đã có) thêm section "Định nghĩa module".

**Files:**
- Modify: `src/app/page.tsx` → `ModuleSettingsModal`
  - Section mới: textarea `persona` ("Bạn là ai khi làm module này"), textarea `instructions` ("Yêu cầu/định nghĩa riêng — luôn tuân theo"), select `skillId` (từ `/api/skills`), checkbox `useSources`.
  - Lưu qua `setModuleField` (đã có, tự POST /api/settings).

**Verify:** đổi persona/instructions → reload → còn nguyên (đã persist).

---

## Phần C — Custom Skills (tạo/sửa skill)

### Task C1: File skill + API CRUD
**Objective:** Kho skill do người dùng tự tạo: mỗi skill = tên + mô tả + `systemPrompt` + `guidance` + `appliesTo` (module keys).

**Files:**
- Create: `src/app/api/skills/route.ts`
- Data file: `${HERMES_HOME}/kientre-skills.json`

**Cấu trúc:**
```json
{ "items": [
  { "id": "sk_x1", "name": "Phiếu học tập phân tầng",
    "description": "Soạn theo 3 mức NB/TH/VD",
    "systemPrompt": "Luôn chia bài tập thành 3 mức…",
    "guidance": "Mỗi mức tối thiểu 3 câu…",
    "appliesTo": ["topic","test"], "enabled": true }
]}
```

**API:** `GET` / `POST` (create/update) / `DELETE ?id=`. (Đây là "skill" nội bộ của webapp — KHÔNG đụng Hermes skills thật ở `~/.hermes/.../skills/`.)

**Verify:** CRUD qua curl như A1.

---

### Task C2: UI — Skills view
**Objective:** Sidebar "Kỹ năng (Skills)" để CRUD skill + preview prompt.

**Files:**
- Modify: `src/app/page.tsx` — `View` thêm `'skills'`; nav-item (icon `Wand2`/`Sparkles`); component `SkillsView` (list + form: name, description, systemPrompt, guidance, chọn appliesTo nhiều module, toggle).
- Modify: `src/app/globals.css` — `.skill-row`.

**Verify:** tạo skill → hiện trong select `skillId` ở Module Builder (B2).

---

## Phần D — Đấu nối engine (nơi tất cả gặp nhau)

### Task D1: Engine đọc SYSTEM_EXTRA + REFERENCE
**Objective:** `callModel()` chèn định nghĩa module + skill vào `system`, chèn source vào `user`.

**Files:**
- Modify: `kientre-engine/server/llm.mjs`
  - Đầu file: `const SYSTEM_EXTRA = process.env.KIENTRE_SYSTEM_EXTRA || ''`, `const REFERENCE = process.env.KIENTRE_REFERENCE || ''`.
  - Trong `callOnce`, trước khi build messages:
    - `const sys = SYSTEM_EXTRA ? system + '\n\n' + SYSTEM_EXTRA : system`
    - `const usr = REFERENCE ? '【NGUỒN CĂN CỨ — ưu tiên bám sát, không bịa ngoài nguồn khi có thể】\n' + REFERENCE.slice(0, 24000) + '\n\n———\n' + user : user`
  - Dùng `sys`/`usr` cho cả nhánh direct-provider lẫn 9router.

**Verify:** chạy engine trực tiếp với env giả:
```
KIENTRE_SYSTEM_EXTRA="Luôn thêm dòng [TEST-MARKER] cuối tiêu đề." \
node kientre-engine/slash.mjs "/es-create phân số lớp 5 toán --summary"
```
→ output/tài liệu có dấu hiệu tuân theo (marker hoặc phong cách). Nếu không dễ thấy, log `system.length` trước/sau để xác nhận inj.

---

### Task D2: `run` route lắp ráp REFERENCE + SYSTEM_EXTRA rồi truyền env
**Objective:** Khi bấm chạy 1 module, webapp gom: định nghĩa module (persona+instructions) + skill được chọn + source enabled (global + đúng scope module) → set env cho child.

**Files:**
- Modify: `src/app/api/run/route.ts`
  - Thêm helper `buildAgentContext(hermesHome, moduleKey, settings)`:
    - Đọc `kientre-webapp-settings.json` → module def (persona, instructions, skillId, useSources).
    - Đọc `kientre-skills.json` → skill theo `skillId` (nếu có & enabled) → lấy `systemPrompt` + `guidance`.
    - Ghép `KIENTRE_SYSTEM_EXTRA` = `[persona] + [instructions] + [skill.systemPrompt] + [skill.guidance]` (bỏ trống, nối `\n\n`).
    - Nếu `useSources`: đọc `kientre-sources.json` → lọc `enabled && (scope==='global' || scope===moduleKey)` → nối `title + content` thành `KIENTRE_REFERENCE`.
  - `moduleKey` lấy từ `settings.module` (client đã gửi trong `runSettings`, xem `page.tsx` `runCommand`: `settings = { ...settings, module, ...cfg }`).
  - Đưa 2 biến vào object `env` cạnh `providerKeyEnv`.

**Verify:** cấu hình 1 module có instructions rõ + 1 source đặc trưng → chạy → tài liệu bám source & tuân instructions. Kiểm SSE log KHÔNG in raw source (chỉ in tiến trình).

---

### Task D3: Chốt an toàn độ dài + thứ tự ưu tiên
**Objective:** Không vỡ context, ưu tiên hợp lý.

**Files:**
- Modify: `src/app/api/run/route.ts` (buildAgentContext) và/hoặc `llm.mjs`
  - Reference: cắt tổng ≤ 24000 ký tự; nếu nhiều source, chia đều hoặc ưu tiên source module-scope trước global.
  - SYSTEM_EXTRA ≤ 6000 ký tự.
  - Nếu trống thì KHÔNG set env (giữ hành vi cũ 100%).

**Verify:** nạp source rất dài → engine vẫn chạy, không lỗi context; env bị cắt đúng ngưỡng.

---

## Phần E — Hoàn thiện & kiểm thử

### Task E1: Dashboard phản ánh cấu hình mini-Hermes
**Files:** Modify `src/app/page.tsx` → `Dashboard`: thêm số Source enabled, số Skill, module nào đã có định nghĩa riêng.

### Task E2: Kiểm thử tổng
- `npm run typecheck` sạch.
- `npm run build` pass.
- Chạy thật 1 lượt mỗi: topic (có source+skill), solve (file + instructions).
- Xác nhận module chưa cấu hình vẫn chạy như cũ (regression).

---

## Files sẽ đụng (tổng hợp)
- `kientre-engine/server/llm.mjs` (inject điểm hội tụ)
- `src/app/api/settings/route.ts` (module def fields)
- `src/app/api/run/route.ts` (buildAgentContext + env)
- `src/app/api/sources/route.ts` (mới)
- `src/app/api/skills/route.ts` (mới)
- `src/app/page.tsx` (SourcesView, SkillsView, Module Builder, Dashboard, types, nav)
- `src/app/globals.css` (style các view mới)
- Data (runtime, tự tạo): `kientre-sources.json`, `kientre-skills.json` trong `HERMES_HOME`

## Rủi ro / đánh đổi / câu hỏi mở
- **PDF extract** cho source: bản đầu skip (chỉ docx/txt/md/link). Cần PDF thì thêm bước OCR sau.
- **Source quá dài**: cắt cứng — có thể mất thông tin cuối. Nâng cấp sau bằng RAG/chunk nếu cần.
- **"Skill" ở đây = prompt-pack nội bộ**, KHÁC skill Hermes thật. Có muốn đọc thẳng skill Hermes ở `~/.hermes/.../skills/` không? (mặc định: không, để tách bạch & an toàn).
- **NotebookLM** đã là 1 dạng source; có gộp chung vào Source Library không, hay giữ riêng như hiện tại? (đề xuất: giữ riêng, vì cơ chế lấy khác).
- Có cần **preview "prompt cuối cùng"** (system+reference) trước khi chạy để anh kiểm không? (đề xuất Task phụ nếu anh muốn minh bạch).
