# Kitee eduSkill Web App Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build Kitee as a hostable web app that exposes eduSkill/Hermes-powered education workflows first, then adds UI, job history, Drive upload, and 9Router-connected AI configuration.

**Architecture:** Start by wrapping the existing eduSkill CLI/agent flows as a local service from the Kitee workspace. The web app submits jobs (`create`, `test`, `solve`, `review`) to a backend queue, stores all artifacts under `Kitee/Output`, optionally uploads to Kitee Drive, and can use 9Router/Hermes model configuration for agent/model routing. Keep eduSkill as the engine; Kitee owns product UI, API, auth, storage, and deployment.

**Tech Stack:** Next.js + TypeScript for the web app, Node.js API routes/server actions for backend orchestration, SQLite for job metadata, child-process wrapper around `/Users/nguyenthaivuong/Desktop/HermesWorkspace/eduSkill/slash.mjs`, local filesystem output under `/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee/Output`, Google Workspace script for Drive, 9Router-compatible OpenAI API config via environment variables.

---

## Current Context / Assumptions

- Active workspace: `/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee`.
- eduSkill engine repo: `/Users/nguyenthaivuong/Desktop/HermesWorkspace/eduSkill`.
- eduSkill slash commands already support `/es-create`, `/es-test`, `/es-solve`, `/es-review` in `slash.mjs`.
- eduSkill output root has been adjusted to default to `Kitee/Output` for this profile.
- Kitee Drive folder ID: `18fe276zrUdVAlFOFyKHPtc_8-GpEexKn`.
- Profile-local Google Workspace OAuth exists under `/Users/nguyenthaivuong/.hermes/profiles/cmkitee`.
- 9Router currently appears in profile config as an OpenAI-compatible endpoint at `http://localhost:20128/v1` with models such as `gc/gemini-2.5-flash`, `cx/gpt-5.5`, etc.
- The user is still building core functions first. Web UI and hosting should come after the function layer is stable.

## Product Scope

### Phase 1: Function-first local app

Build a local web app that can trigger and monitor:

- `create`: create lesson/chuyên đề/worksheet via eduSkill compose flow.
- `test`: generate exam + answer key via eduSkill examiner flow.
- `solve`: upload/select a document, run solver flow.
- `review`: upload/select a document, run reviewer flow.
- Output browsing: list files in `Kitee/Output`, download generated `.docx`, `.pdf`, `.md`, `.json`.
- Optional Drive upload: upload generated files to Kitee Drive when requested.

### Phase 2: 9Router + Hermes-aware controls

Add configuration panel for:

- Worker model, e.g. `gc/gemini-2.5-flash` or another 9Router model.
- Base URL: `http://localhost:20128/v1` locally.
- Output location and Drive upload toggle.
- Job defaults such as `--summary`, class minutes, max exercises.

### Phase 3: Hosting/deployment

Evaluate two deployment modes:

1. **Local-hosted web UI**: app runs on the Mac, can access eduSkill repo, Hermes profile files, local output, and local 9Router.
2. **Cloud-hosted control plane**: web UI hosted publicly, but it calls a local Kitee worker/agent via secure tunnel/webhook because cloud cannot directly access the Mac-local eduSkill/Hermes/9Router stack.

Prefer local-hosted first because eduSkill depends on local filesystem, Python libs, Google OAuth files, and 9Router local endpoint.

---

## Proposed Architecture

```text
Kitee Web App
├── app/ or src/app/                  # Next.js UI
├── src/lib/eduskill/                 # wrapper around eduSkill slash.mjs
│   ├── commands.ts                   # build safe /es-* commands
│   ├── runner.ts                     # spawn child process, stream logs
│   └── output.ts                     # locate output folders/files
├── src/lib/jobs/                     # job queue + job metadata
│   ├── db.ts                         # SQLite connection
│   ├── schema.ts                     # jobs/files tables
│   └── worker.ts                     # sequential runner, no parallel eduSkill
├── src/lib/drive/                    # optional Google Drive upload wrapper
├── src/lib/config/                   # Kitee/Hermes/9Router config
├── src/app/api/jobs/                 # REST endpoints for create/list/detail/cancel
├── src/app/api/files/                # download/list output files
├── src/app/api/drive/                # upload/share endpoints
└── Output/                           # generated artifacts, already exists
```

Key principle: the web app must not reimplement eduSkill logic. It builds commands and calls `node slash.mjs "..."` from the eduSkill repo with the right env.

---

# Implementation Tasks

## Task 1: Initialize the web app skeleton

**Objective:** Create a Next.js TypeScript app inside Kitee without disturbing existing `Output/` or `zalo-bridge/` files.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.mjs`
- Create: `src/app/page.tsx`
- Create: `src/app/layout.tsx`
- Create: `.gitignore` or update existing ignore rules if needed

**Steps:**

1. Create a minimal Next.js app structure under `/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee`.
2. Add scripts:

```json
{
  "scripts": {
    "dev": "next dev -p 3100",
    "build": "next build",
    "start": "next start -p 3100",
    "typecheck": "tsc --noEmit"
  }
}
```

3. Add a simple home page with navigation placeholders:
   - Create lesson
   - Create test
   - Solve document
   - Review document
   - Jobs
   - Output
   - Settings

**Verification:**

```bash
npm install
npm run typecheck
npm run build
npm run dev
```

Expected:
- Typecheck passes.
- Build passes.
- Local app opens at `http://localhost:3100`.

---

## Task 2: Add Kitee runtime config module

**Objective:** Centralize all paths, 9Router settings, Drive settings, and defaults in one config file.

**Files:**
- Create: `src/lib/config/kitee.ts`
- Create: `.env.example`

**Implementation notes:**

`src/lib/config/kitee.ts` should expose:

```ts
export const kiteeConfig = {
  workspaceDir: process.env.KITEE_WORKSPACE_DIR ?? "/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee",
  outputDir: process.env.HERMES_EDUSKILL_OUTPUT_DIR ?? "/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee/Output",
  eduSkillDir: process.env.EDUSKILL_DIR ?? "/Users/nguyenthaivuong/Desktop/HermesWorkspace/eduSkill",
  hermesHome: process.env.HERMES_HOME ?? "/Users/nguyenthaivuong/.hermes/profiles/cmkitee",
  driveParentId: process.env.HERMES_DRIVE_PARENT_ID ?? "18fe276zrUdVAlFOFyKHPtc_8-GpEexKn",
  routerBaseUrl: process.env.NINE_ROUTER_BASE_URL ?? "http://localhost:20128/v1",
  defaultWorkerModel: process.env.HERMES_WORKER_MODEL ?? "gc/gemini-2.5-flash",
  defaultSummary: process.env.KITEE_DEFAULT_SUMMARY !== "0"
}
```

`.env.example`:

```bash
KITEE_WORKSPACE_DIR=/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee
EDUSKILL_DIR=/Users/nguyenthaivuong/Desktop/HermesWorkspace/eduSkill
HERMES_HOME=/Users/nguyenthaivuong/.hermes/profiles/cmkitee
HERMES_EDUSKILL_OUTPUT_DIR=/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee/Output
HERMES_DRIVE_PARENT_ID=18fe276zrUdVAlFOFyKHPtc_8-GpEexKn
NINE_ROUTER_BASE_URL=http://localhost:20128/v1
HERMES_WORKER_MODEL=gc/gemini-2.5-flash
KITEE_DEFAULT_SUMMARY=1
```

**Verification:**

Add a temporary settings/debug page or unit test that imports `kiteeConfig` and verifies the default paths.

---

## Task 3: Implement safe eduSkill command builder

**Objective:** Convert structured form inputs into safe eduSkill slash commands.

**Files:**
- Create: `src/lib/eduskill/commands.ts`
- Create: `src/lib/eduskill/commands.test.ts` or equivalent test target

**Types:**

```ts
export type EduSkillMode = "create" | "test" | "solve" | "review";

export interface CreateInput {
  topic: string;
  grade?: string;
  subject?: string;
  summary?: boolean;
  special?: string;
  notebook?: string;
}

export interface TestInput {
  topic?: string;
  grade?: string;
  subject?: string;
  mc?: number;
  fill?: number;
  essay?: number;
  essayPoints?: number;
  special?: string;
}

export interface FileInput {
  filePath: string;
  grade?: string;
  subject?: string;
}
```

**Rules:**

- `create` produces `/es-create ...`.
- Default grade for create/solve/review: `lớp 4` if missing.
- Default grade for test: `lớp 5` if missing.
- Default subject: `toán`.
- For create, append `--summary` by default unless `summary === false`.
- Escape quotes in `--special "..."`.
- Validate that topic/file path is present.

**Verification examples:**

```ts
buildCreateCommand({ topic: "tỉ số phần trăm", grade: "5" })
// => /es-create tỉ số phần trăm lớp 5 toán --summary

buildTestCommand({ topic: "phân số", grade: "5", mc: 12, fill: 4, essay: 3 })
// => /es-test phân số lớp 5 toán mc=12 fill=4 essay=3
```

---

## Task 4: Implement eduSkill runner with sequential execution

**Objective:** Run eduSkill commands from the web app and stream logs while enforcing one eduSkill job at a time.

**Files:**
- Create: `src/lib/eduskill/runner.ts`

**Implementation notes:**

Use `child_process.spawn`:

```ts
spawn("node", ["slash.mjs", command], {
  cwd: kiteeConfig.eduSkillDir,
  env: {
    ...process.env,
    HERMES_HOME: kiteeConfig.hermesHome,
    HERMES_WORKSPACE_DIR: kiteeConfig.workspaceDir,
    HERMES_EDUSKILL_OUTPUT_DIR: kiteeConfig.outputDir,
    HERMES_DRIVE_PARENT_ID: kiteeConfig.driveParentId,
    HERMES_WORKER_MODEL: selectedModel ?? kiteeConfig.defaultWorkerModel,
    HERMES_UPLOAD_DRIVE: uploadDrive ? "1" : "0"
  }
})
```

Add a simple in-process queue first. Do not run eduSkill jobs in parallel because Gemini quota/rate limits are known issues.

**Verification:**

Run a small smoke job from a test/dev endpoint:

```bash
node slash.mjs "/es-test phép cộng lớp 2 toán mc=1 fill=1 essay=0"
```

Expected:
- Job completes.
- Output folder appears under `Kitee/Output`.
- No output is written to `eduSkill/output` unless explicitly configured.

---

## Task 5: Add SQLite job database

**Objective:** Track job state, logs, command, output folder, generated files, and optional Drive links.

**Files:**
- Create: `src/lib/jobs/db.ts`
- Create: `src/lib/jobs/schema.ts`
- Create: `data/kitee.sqlite` at runtime, not committed

**Schema:**

`jobs` table:

- `id TEXT PRIMARY KEY`
- `mode TEXT NOT NULL`
- `status TEXT NOT NULL` (`queued`, `running`, `succeeded`, `failed`, `cancelled`)
- `command TEXT NOT NULL`
- `input_json TEXT NOT NULL`
- `output_dir TEXT`
- `created_at TEXT NOT NULL`
- `started_at TEXT`
- `finished_at TEXT`
- `exit_code INTEGER`
- `error TEXT`

`job_logs` table:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `job_id TEXT NOT NULL`
- `stream TEXT NOT NULL` (`stdout`, `stderr`, `system`)
- `line TEXT NOT NULL`
- `created_at TEXT NOT NULL`

`job_files` table:

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `job_id TEXT NOT NULL`
- `path TEXT NOT NULL`
- `kind TEXT`
- `size INTEGER`
- `drive_url TEXT`

**Verification:**

- Create a dummy job.
- Append logs.
- Mark succeeded.
- Query job list and detail.

---

## Task 6: Detect generated output files

**Objective:** After a job completes, locate generated artifacts under `Kitee/Output`.

**Files:**
- Create: `src/lib/eduskill/output.ts`

**Detection strategy:**

1. Parse stdout lines like:
   - `📍 Word: /path/file.docx`
   - `📗 Đáp án: /path/file_LoiGiai.docx`
   - `📗 Đáp án riêng: /path/file_LoiGiai.docx`
2. If stdout parsing fails, scan `Kitee/Output` for the newest modified folder matching expected prefix:
   - `G5_...` for create
   - `EXAM_G5_...` for test
   - `SOLVE_G...` for solve
   - `REVIEW_G...` for review
3. Record `.docx`, `.pdf`, `.md`, `.json`, and image artifacts.

**Verification:**

Use existing smoke output:

```text
/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee/Output/_smoke_profile_output/_smoke_profile_output.docx
```

Expected: detector finds the `.docx` and marks it downloadable.

---

## Task 7: Build job API endpoints

**Objective:** Expose job creation, listing, detail, logs, cancellation, and file listing.

**Files:**
- Create: `src/app/api/jobs/route.ts`
- Create: `src/app/api/jobs/[id]/route.ts`
- Create: `src/app/api/jobs/[id]/logs/route.ts`
- Create: `src/app/api/jobs/[id]/files/route.ts`
- Create: `src/app/api/jobs/[id]/cancel/route.ts`

**API shape:**

`POST /api/jobs`:

```json
{
  "mode": "create",
  "input": {
    "topic": "tỉ số phần trăm",
    "grade": "5",
    "subject": "toán",
    "summary": true
  },
  "uploadDrive": false,
  "model": "gc/gemini-2.5-flash"
}
```

Returns:

```json
{
  "id": "job_...",
  "status": "queued"
}
```

**Verification:**

Use `curl` locally to create a small test job and poll logs.

---

## Task 8: Build core UI screens

**Objective:** Provide a usable web interface for the four eduSkill functions.

**Files:**
- Create: `src/app/create/page.tsx`
- Create: `src/app/test/page.tsx`
- Create: `src/app/solve/page.tsx`
- Create: `src/app/review/page.tsx`
- Create: `src/app/jobs/page.tsx`
- Create: `src/app/jobs/[id]/page.tsx`
- Create: `src/app/output/page.tsx`
- Create: `src/components/JobStatus.tsx`
- Create: `src/components/LogViewer.tsx`
- Create: `src/components/FileList.tsx`

**UI requirements:**

- Create page:
  - topic
  - grade
  - subject
  - summary toggle
  - special instruction
  - model selector
  - upload Drive toggle
- Test page:
  - topic
  - grade
  - subject
  - mc/fill/essay/points
  - special instruction
  - model selector
  - upload Drive toggle
- Solve/review pages:
  - local file path first
  - later: file upload into `Kitee/uploads`
- Job detail:
  - status
  - live-ish logs via polling
  - generated files
  - Drive links if uploaded

**Verification:**

Manual UI test:
- Submit a tiny `/es-test` job.
- Watch logs.
- Download generated files.

---

## Task 9: Add file download endpoint

**Objective:** Let users download generated files safely from the browser.

**Files:**
- Create: `src/app/api/files/route.ts`

**Rules:**

- Only serve files under `Kitee/Output` or `Kitee/uploads`.
- Reject path traversal.
- Set proper download headers.
- Do not expose OAuth/token files.

**Verification:**

- Download existing smoke DOCX.
- Try a path traversal attempt and verify it is rejected.

---

## Task 10: Add Drive upload action

**Objective:** Allow upload to Drive either during job execution or after a job completes.

**Files:**
- Create: `src/lib/drive/googleWorkspace.ts`
- Create: `src/app/api/jobs/[id]/upload-drive/route.ts`

**Implementation notes:**

Call profile-local script:

```bash
HERMES_HOME=/Users/nguyenthaivuong/.hermes/profiles/cmkitee \
python /Users/nguyenthaivuong/.hermes/profiles/cmkitee/skills/productivity/google-workspace/scripts/google_api.py \
  drive upload <file> --parent 18fe276zrUdVAlFOFyKHPtc_8-GpEexKn
```

Prefer creating a Drive folder per job first, then upload all generated `.docx`/`.pdf` files into it.

**Safety:**

Since Drive upload has an external side effect, the UI should show a clear button: “Upload to Drive”. For automated upload, require the user to toggle it before starting the job.

**Verification:**

- Upload one smoke DOCX.
- Record returned `webViewLink`.
- Confirm file appears in Drive response.

---

## Task 11: Add 9Router settings and model discovery

**Objective:** Make model selection explicit and ready for hosted deployment.

**Files:**
- Create: `src/lib/router9/client.ts`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/api/settings/router/route.ts`

**Local approach:**

- Default base URL: `http://localhost:20128/v1`.
- API key: `not-needed` locally, or read from env for hosted/remote.
- Model list can start static from profile config:
  - `gc/gemini-2.5-flash`
  - `gc/gemini-2.5-pro`
  - `cx/gpt-5.5`
  - etc.

**Optional discovery:**

Call OpenAI-compatible endpoint:

```bash
curl http://localhost:20128/v1/models
```

If unavailable, fall back to static list.

**Verification:**

- Settings page shows base URL status.
- Model selected on a job is passed as `HERMES_WORKER_MODEL`.

---

## Task 12: Add Hermes integration boundary

**Objective:** Decide how the web app uses “Hermes functions” beyond eduSkill.

**Recommended boundary:**

Start with controlled subprocess calls, not arbitrary full-agent access:

- For eduSkill: call `node slash.mjs` directly.
- For Google Workspace: call profile-local `google_api.py`.
- For future Hermes agent actions: call `hermes chat -q` only for curated workflows, or expose a local webhook route later.

**Avoid initially:**

- Letting arbitrary web users submit arbitrary shell/Hermes prompts.
- Exposing the full Hermes agent to the internet without auth.
- Sharing OAuth token contents.

**Files later:**
- `src/lib/hermes/client.ts`
- `src/app/api/hermes/route.ts`

**Verification:**

Document a whitelist of allowed Hermes-backed actions before adding any generic prompt endpoint.

---

## Task 13: Add authentication before hosting

**Objective:** Prevent public misuse of AI quota, Drive, local files, and Hermes tools.

**Options:**

1. Simple password auth for private deployment.
2. Google OAuth login restricted to the owner account.
3. Cloudflare Access in front of the app.

**Recommended first:** Cloudflare Tunnel + Cloudflare Access, because the app likely needs to run on the Mac to access eduSkill and 9Router.

**Verification:**

- Unauthenticated browser cannot access app.
- Authenticated account can create jobs.

---

## Task 14: Prepare hosting strategy

**Objective:** Choose a deployment path that preserves local eduSkill/Hermes access.

### Option A: Local Mac + Cloudflare Tunnel

Best fit for current architecture.

Pros:
- Can access local eduSkill repo.
- Can access local 9Router at `localhost:20128`.
- Can access profile OAuth files.
- Simple to iterate.

Cons:
- Requires Mac to stay on.
- Needs tunnel/security setup.

### Option B: VPS/cloud deploy

Only viable if:
- eduSkill repo and dependencies are installed on server.
- Google OAuth is authorized on server.
- 9Router endpoint is reachable remotely or replaced with cloud model provider.
- File output/Drive behavior is reconfigured.

### Option C: Cloud UI + local worker

Best long-term hybrid:
- Hosted UI stores jobs.
- Local Kitee worker polls for jobs and executes eduSkill locally.
- Worker uploads artifacts and reports back.

Recommended sequence:
1. Build local web app.
2. Add Cloudflare Tunnel/Access.
3. Later split into cloud UI + local worker only if needed.

---

## Task 15: Add tests and validation pipeline

**Objective:** Make the function layer reliable before adding more UI.

**Commands:**

```bash
npm run typecheck
npm run build
npm test
```

Add test cases for:

- command builder
- output path config
- output file detection
- path traversal rejection
- job state transitions
- Drive upload parser with mocked response
- 9Router model discovery fallback

**Manual smoke tests:**

1. `/es-test` tiny job:

```text
phép cộng trừ trong phạm vi 100 lớp 2 toán mc=2 fill=1 essay=1
```

2. `/es-create` summary job:

```text
tỉ số phần trăm lớp 5 toán --summary
```

3. Confirm output path:

```text
/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee/Output
```

4. Confirm generated files download via web UI.

---

## Risks / Tradeoffs

1. **eduSkill jobs are slow and quota-bound.** Must run sequentially and expose logs/status.
2. **9Router local endpoint may not be available from hosted environments.** Prefer local app or tunnel first.
3. **Drive upload is an external side effect.** Require explicit toggle/button and record links.
4. **Full Hermes access is powerful.** Do not expose arbitrary prompts publicly until auth and whitelisting are in place.
5. **Cloud hosting may not access local files.** If hosted outside the Mac, create a local worker architecture.
6. **Long-running jobs in serverless environments will timeout.** Avoid Vercel serverless for direct eduSkill execution; use local Node server, VPS worker, or queue/worker split.

---

## Suggested Milestones

### Milestone 1: Local function layer

- Config module
- Command builder
- Sequential runner
- Output detector
- SQLite jobs
- API endpoints

Exit criteria: can start `/es-test` and `/es-create` from API, monitor logs, download output.

### Milestone 2: Minimal UI

- Forms for create/test/solve/review
- Jobs dashboard
- Output browser

Exit criteria: non-technical user can generate and download files from browser.

### Milestone 3: Drive + 9Router settings

- Drive upload per job
- Model selector/settings
- 9Router status check

Exit criteria: user can choose model, run job, upload output to Drive.

### Milestone 4: Secure hosting

- Cloudflare Tunnel or equivalent
- Access control
- Deployment docs

Exit criteria: private hosted URL works and is protected.

---

## Open Questions

1. Should the first UI be Vietnamese-only or bilingual?
2. Should users upload files through the browser for solve/review, or only select local paths initially?
3. Should Drive upload be automatic by default or always manual?
4. Do we want public hosting for external users, or only private access for anh/team Kitee?
5. Should 9Router model selection be per-job or global default only?

---

## Immediate Next Step

Implement Milestone 1 only. Do not build a polished UI yet. The priority is making the function layer stable:

1. Initialize Next.js app.
2. Add config module.
3. Add eduSkill command builder.
4. Add sequential runner.
5. Add job DB/API.
6. Prove `/es-test` and `/es-create` generate files under `Kitee/Output` from the web app/API.
