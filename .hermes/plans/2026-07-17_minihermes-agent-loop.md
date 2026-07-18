# KientreAAA → Mini Hermes Agent (tool-calling, module-as-agent) — Implementation Plan

> **For Hermes:** Thực thi tuần tự. Sau mỗi Task: `npm run typecheck` sạch; Task đụng runtime phải `curl`/chạy thật kiểm chứng. Local-first — KHÔNG commit/push GitHub trừ khi anh nói rõ. Engine dùng ESM, không thêm dependency mới nếu tránh được.

**Goal:** Mỗi module KientreAAA trở thành **một agent thật**: một vòng lặp LLM + tool-calling, tự quyết đọc source / search web / viết file / gọi skill để hoàn thành yêu cầu — thay vì pipeline cứng. Mỗi module có persona, skill, **bộ tool được bật** và source riêng (module-as-agent).

**Architecture:**
- Thêm **agent loop** mới trong engine: `kientre-engine/agent/loop.mjs` — vòng lặp `while (chưa xong && turn < max)`: gọi model kèm `tools` (OpenAI function-calling), model trả `tool_calls` → engine chạy tool → nối kết quả → lặp; khi model trả text cuối → xong.
- **Tools** = các hàm nhỏ, mỗi hàm 1 file trong `kientre-engine/agent/tools/`: `read_source`, `web_search`, `read_file`, `write_docx`, `run_skill`, `finish`. Đăng ký trong 1 registry.
- **Module = AgentConfig (data JSON)**: persona, systemPrompt, skillIds, `enabledTools` (whitelist), sourceScope, model. Lưu trong `HERMES_HOME`. 4 module cũ có config mặc định tái tạo hành vi hiện tại (an toàn/di sản).
- **Giữ pipeline cũ** làm tool (`run_skill` gọi lại `composeDocument`/`runExam`/…): agent có thể "một phát ra tài liệu" bằng cách gọi skill cũ, HOẶC tự làm từng bước bằng tool lẻ. Không phá cái đang chạy.
- Webapp: SSE stream **agent trace** (mỗi turn: model nói gì, gọi tool nào, kết quả tóm tắt) để anh thấy agent "suy nghĩ".

**Tech Stack:** Next.js 14 App Router (SSE) · Node ESM engine · JSON config trong `~/.hermes/profiles/cmkitee/` · OpenAI-compatible function-calling (9router + direct providers đã hỗ trợ `tools`).

---

## Nguyên tắc thiết kế (đọc trước khi code)

1. **Function-calling phải được provider hỗ trợ.** 9router + Gemini/DeepSeek/GLM/OpenRouter đều OpenAI-compatible; gửi `tools:[…]` + `tool_choice:"auto"`. Task 0 kiểm chứng thật trước khi xây loop.
2. **Loop có giới hạn cứng:** `maxTurns` (mặc định 12), timeout tổng, và mỗi tool có timeout riêng. Không để agent chạy vô hạn / đốt quota.
3. **Tool an toàn:** `write_docx`/`read_file` chỉ trong `KIENTRE_OUTPUT_DIR` + `HERMES_WORKSPACE_DIR` (chống path traversal). `web_search` dùng lại `server/websearch.mjs`. KHÔNG có tool shell/exec tuỳ ý ở bản đầu (YAGNI + an toàn).
4. **Module quyết định tool nào bật.** Agent chỉ thấy tool trong `enabledTools` của module đó → "chức năng riêng cho từng module".
5. **Tái dùng engine cũ, không viết lại.** Skill cũ (topic/test/solve/review) thành tool `run_skill`. Agent loop là lớp bọc thêm, không thay orchestrator.
6. **Stream minh bạch.** Mỗi bước phát SSE event `agent_step` để UI hiển thị (model reasoning tóm tắt + tool + tham số + kết quả ngắn). KHÔNG in nội dung nhạy cảm/toàn bộ source ra stream.
7. **Config = nguồn chân lý JSON.** Webapp CRUD; `run` route đọc → truyền cho agent loop qua stdin JSON (tránh env quá dài).
8. **Tương thích ngược:** nếu module không bật agent-mode → chạy pipeline cũ y hệt. Cờ `mode: "pipeline" | "agent"` mỗi module.

---

## Phần 0 — Chứng minh khả thi (BẮT BUỘC trước khi xây)

### Task 0.1: Thử function-calling với 9router + 1 direct provider
**Objective:** Xác nhận provider trả `tool_calls` đúng chuẩn OpenAI.

**Files:** Create tạm `kientre-engine/agent/_probe.mjs` (xoá sau).

**Nội dung:** gọi `/v1/chat/completions` với `tools:[{type:"function",function:{name:"get_time",…}}]`, `tool_choice:"auto"`, prompt "mấy giờ rồi? dùng tool". In raw response.

**Verify (chạy thật):**
```
HERMES_ROUTER_URL=http://127.0.0.1:20128 node kientre-engine/agent/_probe.mjs
```
Kỳ vọng: response có `choices[0].message.tool_calls[0].function.name === "get_time"`.
- Nếu 9router KHÔNG hỗ trợ tools → ghi lại provider nào hỗ trợ (Gemini/OpenRouter thường có) và chốt: agent-mode chỉ bật cho model hỗ trợ tool; model không hỗ trợ → fallback pipeline. **Dừng, báo anh nếu không provider nào hỗ trợ.**

---

## Phần A — Engine: Agent loop + Tools

### Task A1: LLM layer hỗ trợ tools
**Objective:** `callModelRaw()` gửi `tools` + trả nguyên `message` (không chỉ `.content`).

**Files:** Modify `kientre-engine/server/llm.mjs`
- Thêm `export async function callChat({ model, messages, tools, temperature })` trả `data.choices[0].message` (giữ `callModel`/`chatJSON` cũ nguyên vẹn).
- Áp cùng cơ chế direct-provider + 9router + Authorization đã có.
- Gửi `tool_choice: tools?.length ? 'auto' : undefined`.

**Verify:** dùng lại `_probe` nhưng qua `callChat` → nhận `message.tool_calls`.

---

### Task A2: Tool registry + tool an toàn
**Objective:** Định nghĩa tool dưới dạng `{ schema, handler }`, whitelist theo module.

**Files:** Create
- `kientre-engine/agent/tools/registry.mjs` — `register(name, schema, handler)`, `getSchemas(names)`, `run(name, args, ctx)`.
- `kientre-engine/agent/tools/read_source.mjs` — đọc source từ `ctx.sources` (đã nạp), trả text theo id/title.
- `kientre-engine/agent/tools/web_search.mjs` — bọc `fetchExerciseSources`/`searchWeb` (đã có).
- `kientre-engine/agent/tools/read_file.mjs` — đọc file trong workspace/output (guard path).
- `kientre-engine/agent/tools/write_docx.mjs` — nhận docModel JSON → gọi `buildWord`/`designWord` (đã có) → trả đường dẫn.
- `kientre-engine/agent/tools/run_skill.mjs` — gọi lại `composeDocument`/`runExam`/`runSolve`/`runReview` theo tên skill cũ.
- `kientre-engine/agent/tools/finish.mjs` — đánh dấu xong, trả tóm tắt + danh sách file.

**Guard path (DRY):** 1 helper `safeResolve(base, p)` kiểm `path.resolve(base,p).startsWith(base)`.

**Verify:** unit self-check nhỏ (assert) — `node -e` gọi từng handler với input mẫu, in kết quả; path traversal bị chặn.

---

### Task A3: Agent loop
**Objective:** Vòng lặp tool-calling hoàn chỉnh.

**Files:** Create `kientre-engine/agent/loop.mjs`
- `export async function runAgent({ task, config, sources, onStep })`:
  - `messages = [{role:'system', content: buildSystem(config)}, {role:'user', content: task}]`
  - `tools = registry.getSchemas(config.enabledTools)`
  - loop tới `config.maxTurns || 12`:
    - `msg = await callChat({ model: config.model, messages, tools })`
    - `onStep({type:'assistant', text: msg.content})` (nếu có)
    - nếu `msg.tool_calls`: với mỗi call → `onStep({type:'tool_call', name, args})` → `result = registry.run(name,args,ctx)` → `onStep({type:'tool_result', name, brief})` → push `{role:'tool', tool_call_id, content: JSON.stringify(result).slice(0,8000)}`; nếu name==='finish' → break.
    - else (chỉ text) → break.
  - trả `{ finalText, createdFiles, steps }`.
- `buildSystem(config)` = persona + systemPrompt + skill prompts + "Bạn có các tool sau, dùng khi cần. Khi hoàn thành, gọi finish."

**Verify (chạy thật):**
```
node kientre-engine/agent/run.mjs --config test-config.json --task "Soạn chuyên đề phân số lớp 5, bám source đã cho, xuất .docx"
```
→ trace in ra: agent gọi read_source → (web_search) → write_docx → finish; file .docx tồn tại.

---

### Task A4: Entry `agent/run.mjs` (giống slash.mjs nhưng cho agent)
**Objective:** CLI để webapp spawn.

**Files:** Create `kientre-engine/agent/run.mjs`
- Đọc JSON config + task từ stdin (tránh env dài): `{ task, config, sources }`.
- Gọi `runAgent`, `onStep` → `console.log(JSON.stringify({event:'agent_step',...}))` (mỗi dòng 1 JSON) để `run` route parse.
- Cuối: `console.log(JSON.stringify({event:'agent_done', createdFiles, finalText}))`.

**Verify:** `echo '{"task":"…","config":{…}}' | node kientre-engine/agent/run.mjs` → dòng JSON hợp lệ.

---

## Phần B — Config: Module-as-Agent + Skills + Sources

### Task B1: Sources API + file (như plan trước, giữ nguyên)
**Files:** Create `src/app/api/sources/route.ts`; data `${HERMES_HOME}/kientre-sources.json`. CRUD text/link/file(docx,txt,md). (Chi tiết như plan mini-hermes cũ Phần A.)

### Task B2: Skills API + file
**Files:** Create `src/app/api/skills/route.ts`; data `${HERMES_HOME}/kientre-skills.json`. Skill = `{name,description,systemPrompt,guidance,appliesTo,enabled}`.

### Task B3: Module AgentConfig trong settings
**Files:** Modify `src/app/api/settings/route.ts`
- `defaultModule()` thêm: `mode:'pipeline'`, `persona:''`, `systemPrompt:''`, `skillIds:[]`, `enabledTools:['read_source','web_search','write_docx','finish']`, `maxTurns:12`, `useSources:true`.
- 4 module cũ: `mode` mặc định `'pipeline'` → chạy như cũ tới khi anh bật `'agent'`.

**Verify:** GET settings thấy field mới; POST cập nhật được.

---

## Phần C — Webapp: chạy agent + UI

### Task C1: `run` route rẽ nhánh agent vs pipeline
**Objective:** Nếu `module.mode==='agent'` → spawn `agent/run.mjs` (stdin JSON), stream `agent_step`; else giữ nhánh `slash.mjs` cũ.

**Files:** Modify `src/app/api/run/route.ts`
- `buildAgentPayload(hermesHome, moduleKey, settings)` → gom config module + skills (theo skillIds) + sources (enabled & scope) → object.
- `spawn('node',[agentRunPath])`, ghi payload vào `child.stdin`.
- Parse mỗi dòng stdout JSON → map sang SSE: `agent_step` → event `log`/`agent`; `agent_done` → event `done` với `created`.
- Giữ Drive-upload sau khi xong (như hiện tại) cho file agent tạo.

**Verify:** chạy 1 module ở `mode:'agent'` từ UI → thấy trace + file.

### Task C2: UI — Sources view + Skills view
**Files:** Modify `src/app/page.tsx` (`View` thêm `'sources'`,`'skills'`; components `SourcesView`,`SkillsView`), `globals.css`. (Như plan trước.)

### Task C3: UI — Module Builder (agent config)
**Files:** Modify `src/app/page.tsx` `ModuleSettingsModal`
- Toggle `mode` pipeline/agent.
- persona, systemPrompt textareas.
- Multi-select skillIds (từ `/api/skills`).
- **Tool checkboxes** (read_source, web_search, read_file, write_docx, run_skill, finish) → "chức năng riêng từng module".
- maxTurns số, useSources checkbox.

**Verify:** bật agent + chọn tool → chạy → agent chỉ dùng tool được bật.

### Task C4: UI — Agent trace đẹp trong chat
**Files:** Modify `src/app/page.tsx` (`run` message) — hiển thị các bước: 🧠 nghĩ / 🔧 gọi tool X / ✅ kết quả, dạng timeline; file cuối như hiện tại.

---

## Phần D — Hoàn thiện & kiểm thử

### Task D1: Guard chi phí & lỗi
- maxTurns, timeout tổng (vd 180s), mỗi tool timeout. Vượt → dừng, báo lỗi rõ trên trace.
- Tool lỗi → trả `{error}` cho model (model tự xoay), KHÔNG crash loop.

### Task D2: Regression + tổng kiểm
- Module `mode:'pipeline'` chạy y như trước (không đổi).
- 1 module `mode:'agent'` làm trọn: đọc source → search → write_docx → finish.
- `npm run typecheck` + `npm run build` pass.

---

## Files sẽ đụng (tổng hợp)
- Engine mới: `kientre-engine/agent/loop.mjs`, `agent/run.mjs`, `agent/tools/*.mjs`, `agent/tools/registry.mjs`
- Engine sửa: `kientre-engine/server/llm.mjs` (thêm `callChat`)
- API mới: `src/app/api/sources/route.ts`, `src/app/api/skills/route.ts`
- API sửa: `src/app/api/settings/route.ts`, `src/app/api/run/route.ts`
- UI: `src/app/page.tsx`, `src/app/globals.css`
- Data runtime: `kientre-sources.json`, `kientre-skills.json` (settings đã có file riêng)

## Rủi ro / đánh đổi / câu hỏi mở
- **RỦI RO LỚN NHẤT (Task 0):** nếu 9router không hỗ trợ function-calling, agent-mode chỉ chạy trên provider có tool (Gemini/OpenRouter…). Phải chốt ở Phần 0 trước khi xây tiếp.
- **Chi phí:** agent loop tốn nhiều lượt gọi model hơn pipeline. maxTurns + model rẻ (gemini-flash) cho vòng lặp, model mạnh cho bước cuối.
- **Tool shell/exec:** cố ý KHÔNG có ở bản đầu (an toàn). Cần chạy lệnh hệ thống thì thêm sau với allowlist + duyệt.
- **PDF source:** bản đầu skip (docx/txt/md/link).
- **NotebookLM:** giữ cơ chế riêng, đồng thời expose thành tool `read_notebook` (tuỳ chọn) — có muốn không?
- Có muốn **"preview system+tools"** của module trước khi chạy để anh kiểm không?
