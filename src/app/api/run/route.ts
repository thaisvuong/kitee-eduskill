import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { NextResponse } from 'next/server'
import { kientreConfig } from '@/lib/config/kientre'
import { findCommand } from '@/lib/kientreEngine/slashCommands'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ponytail: in-memory process registry. add DB/queue worker when jobs must survive server restart.
const RUNNING = (globalThis as any).__KIENTRE_RUNNING__ || new Map<string, ChildProcessWithoutNullStreams>()
;(globalThis as any).__KIENTRE_RUNNING__ = RUNNING

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
 try {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
 } catch {}
}

async function snapshotOutput(dir: string): Promise<Set<string>> {
 const root = path.resolve(dir)
 const out = new Set<string>()
 async function walk(p: string) {
  let entries: string[] = []
  try { entries = await fs.readdir(p) } catch { return }
  await Promise.all(entries.map(async name => {
   if (name.startsWith('.')) return
   const full = path.join(p, name)
   const st = await fs.stat(full).catch(() => null)
   if (!st) return
   if (st.isDirectory()) return walk(full)
   if (/\.(docx|pdf)$/i.test(name)) out.add(path.relative(root, full))
  }))
 }
 await walk(root)
 return out
}

async function collectResultFiles(root: string, created: string[]) {
 const out: string[] = []
 async function walk(p: string) {
  let st
  try { st = await fs.stat(p) } catch { return }
  if (st.isFile()) {
   if (/\.(docx|pdf)$/i.test(p)) out.push(p)
   return
  }
  if (!st.isDirectory()) return
  const entries = await fs.readdir(p)
  await Promise.all(entries.map(e => walk(path.join(p, e))))
 }
 await Promise.all(created.map(name => walk(path.join(root, name))))
 return out
}

function collectLoggedDocxPaths(lines: string[], outputDir: string) {
 const root = path.resolve(outputDir)
 const found = new Set<string>()
 for (const line of lines) {
  const m = String(line).match(/📍\s*Word:\s*(.+\.docx)\s*$/i)
  if (!m) continue
  const full = path.resolve(m[1].trim())
  if (full === root || full.startsWith(root + path.sep)) found.add(full)
 }
 return [...found]
}

function normalizeDriveFolderId(value: unknown) {
 const s = String(value || '').trim()
 return s.match(/folders\/([A-Za-z0-9_-]+)/)?.[1] || s.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1] || s
}

// Provider API keys live only in the server-side settings file (never sent by the client).
// Read them here and map to the env vars the engine's llm.mjs expects.
async function readProviderKeyEnv(hermesHome: string): Promise<Record<string, string>> {
 const settingsPath = path.join(hermesHome || kientreConfig.hermesHome, 'kientre-webapp-settings.json')
 const env: Record<string, string> = {}
 try {
  const raw = await fs.readFile(settingsPath, 'utf8')
  const keys = (JSON.parse(raw)?.apiKeys || {}) as Record<string, string>
  const map: Record<string, string> = {
   gemini: 'GEMINI_API_KEY',
   deepseek: 'DEEPSEEK_API_KEY',
   glm: 'GLM_API_KEY',
   openrouter: 'OPENROUTER_API_KEY',
   pexels: 'PEXELS_API_KEY',
   pixabay: 'PIXABAY_API_KEY',
   google: 'GOOGLE_API_KEY',
   googleCse: 'GOOGLE_CSE_ID',
  }
  for (const [prov, envName] of Object.entries(map)) {
   const v = String(keys[prov] || '').trim()
   if (v) env[envName] = v
  }
 } catch {}
 return env
}

async function resolveEngineDir(candidate: string) {
 const dirs = [candidate, kientreConfig.engineDir, path.join(process.cwd(), 'kientre-engine')]
 for (const dir of dirs) {
  if (!dir) continue
  try { await fs.access(path.join(dir, 'slash.mjs')); return dir } catch {}
 }
 return candidate || kientreConfig.engineDir
}

function eduAgentEnv(settings: Record<string, any>) {
 const models = settings.agentModels || {}
 const env: Record<string, string> = {}
 const set = (name: string, value: unknown) => { if (typeof value === 'string' && value.trim()) env[name] = value.trim() }
 set('HERMES_ARCHITECT_MODEL', models.architect)
 set('HERMES_INTENT_MODEL', models.intent)
 set('HERMES_QUIZ_PLANNER_MODEL', models.quizplanner)
 set('HERMES_EXAMINER_MODEL', models.examiner)
 set('HERMES_SOLVER_MODEL', models.solver)
 set('HERMES_JUDGE_MODEL', models.judge || models.intent)
 set('HERMES_STUDENT_MODEL', models.student)
 set('HERMES_REVIEWER_MODEL', models.reviewer)
 set('HERMES_VISUAL_MODEL', models.visualcurator)
 set('HERMES_ARTIST_MODEL', models.artist)
 return env
}

// Upload final .docx files to Drive as BOTH raw .docx and converted Google Docs.
async function uploadDocxToDrive(
  files: string[], folderId: string, tokenFile: string, engineDir: string, deleteLocal: boolean,
): Promise<{ ok: boolean; uploaded: any[]; skipped: any[]; error?: string }> {
 const script = path.join(engineDir, 'scripts', 'kientre_drive_upload.py')
 const args = [script, '--token', tokenFile, '--folder', folderId]
 if (deleteLocal) args.push('--delete-local')
 args.push(...files)
 const py = await pickPython()
 return await new Promise(resolve => {
  const child = spawn(py, args, { env: { ...process.env } })
  let stdout = '', stderr = ''
  child.stdout.on('data', d => { stdout += d.toString() })
  child.stderr.on('data', d => { stderr += d.toString() })
  child.on('error', e => resolve({ ok: false, uploaded: [], skipped: [], error: e.message }))
  child.on('close', code => {
   if (code !== 0) return resolve({ ok: false, uploaded: [], skipped: [], error: stderr.trim() || `exit ${code}` })
   try { const d = JSON.parse(stdout); resolve({ ok: true, uploaded: d.uploaded || [], skipped: d.skipped || [] }) }
   catch { resolve({ ok: false, uploaded: [], skipped: [], error: 'parse: ' + stdout.slice(0, 300) }) }
  })
 })
}

let _py: string | null = null
async function pickPython(): Promise<string> {
 if (_py) return _py
 const cands = [process.env.HERMES_PYTHON, '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3', '/opt/homebrew/bin/python3', 'python3'].filter(Boolean) as string[]
 for (const c of cands) {
  const ok = await new Promise<boolean>(res => {
   const ch = spawn(c, ['-c', 'import docx, certifi'])
   ch.on('error', () => res(false)); ch.on('close', code => res(code === 0))
  })
  if (ok) { _py = c; return c }
 }
 _py = 'python3'; return _py
}

export async function POST(req: Request) {
 const { jobId = '', command = '', settings = {} } = await req.json().catch(() => ({})) as {
  jobId?: string; command?: string; settings?: Record<string, any>
 }
 const line = command.trim()
 const token = (line.split(/\s+/)[0] || '').toLowerCase()
 const cmd = findCommand(token)
 const outputDir = settings.outputDir || kientreConfig.outputDir

 const stream = new ReadableStream({
  async start(controller) {
   const close = () => { try { controller.close() } catch {} }
   if (!jobId) { sse(controller, 'error', { message: 'Thiếu jobId' }); return close() }
   if (!line.startsWith('/')) { sse(controller, 'error', { message: 'Lệnh phải bắt đầu bằng "/". Gõ /help.' }); return close() }
   if (!cmd) { sse(controller, 'error', { message: `Không rõ lệnh "${token}". Gõ /help để xem danh sách.` }); return close() }
   if (token === '/help' || token === '/es' || token === '/es-help' || token === '/?') { sse(controller, 'done', { help: true, reply: 'help', code: 0 }); return close() }
   const engineDir = await resolveEngineDir(settings.engineDir || kientreConfig.engineDir)
   const slashPath = path.join(engineDir, 'slash.mjs')
   try { await fs.access(slashPath) } catch {
    sse(controller, 'error', { message: `Không tìm thấy Kientre tại ${slashPath}. Kiểm tra "Thư mục Kientre" trong Cài đặt.` })
    return close()
   }

   const before = await snapshotOutput(outputDir)
   sse(controller, 'start', { command: line, mode: cmd.mode, jobId })

   const routerBaseUrl = settings.routerBaseUrl || kientreConfig.routerBaseUrl
   const providerKeyEnv = await readProviderKeyEnv(settings.hermesHome || kientreConfig.hermesHome)
   const moduleDriveFolderId = normalizeDriveFolderId(settings.driveFolderId || settings.driveParentId || kientreConfig.driveParentId)
   const env = {
    ...process.env,
    ...providerKeyEnv,
     ...eduAgentEnv(settings),
     HERMES_WORKSPACE_DIR: settings.workspaceDir || kientreConfig.workspaceDir,
    KIENTRE_OUTPUT_DIR: outputDir,
    HERMES_HOME: settings.hermesHome || kientreConfig.hermesHome,
    GOOGLE_OAUTH_JSON: settings.googleCredentialFile || kientreConfig.googleCredentialFile,
    HERMES_DRIVE_PARENT_ID: moduleDriveFolderId,
    KIENTRE_DRIVE_FOLDER_ID: moduleDriveFolderId,
    // Quiz KHÔNG tạo Google Doc realtime nữa: Drive upload chỉ sau process xong + có .docx final.
    KIENTRE_QUIZ_STREAM_GDOC: '',
    NINE_ROUTER_BASE_URL: routerBaseUrl,
    NINEROUTER_URL: routerBaseUrl.replace(/\/v1\/?$/, ''),
    HERMES_ROUTER_URL: routerBaseUrl.replace(/\/v1\/?$/, ''),
    HERMES_WORKER_MODEL: settings.defaultWorkerModel || kientreConfig.defaultWorkerModel,
    HERMES_FALLBACK_MODELS: settings.fallbackModels || process.env.HERMES_FALLBACK_MODELS || 'gc/gemini-2.5-flash,gc/gemini-2.5-pro,gc/gemini-3.1-flash-lite-preview,cx/gpt-5.5,cx/gpt-5.4,cc/claude-opus-4-8,openrouter/openrouter/free',
    HERMES_MODEL_RETRIES: String(settings.modelRetries ?? process.env.HERMES_MODEL_RETRIES ?? '2'),
    HERMES_MODEL_RETRY_DELAY_MS: String(settings.retryDelayMs ?? process.env.HERMES_MODEL_RETRY_DELAY_MS ?? '1200'),
   }

   const child = spawn('node', [slashPath, line], { cwd: engineDir, env })
   RUNNING.set(jobId, child)
   let buf = ''
   let cancelled = false
   const allLines: string[] = []

   const onData = (chunk: Buffer) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const l of lines) if (l.trim()) { allLines.push(l); sse(controller, 'log', { line: l, jobId }) }
   }
   child.stdout.on('data', onData)
   child.stderr.on('data', onData)

   child.on('error', (e) => {
    RUNNING.delete(jobId)
    sse(controller, 'error', { message: e.message, jobId })
    close()
   })
   child.on('close', async (code, signal) => {
    RUNNING.delete(jobId)
    if (buf.trim()) sse(controller, 'log', { line: buf, jobId })
    const after = await snapshotOutput(outputDir)
    const created = [...after].filter(x => !before.has(x))
    const hermesHome = settings.hermesHome || kientreConfig.hermesHome
    const driveParentId = moduleDriveFolderId
    if (cancelled || signal === 'SIGTERM') {
     sse(controller, 'done', { code: 130, cancelled: true, created, outputDir, jobId })
    } else {
     const driveUploads: any[] = []
     const driveFolderId = driveParentId
     const tokenFile = settings.googleCredentialFile || kientreConfig.googleCredentialFile || path.join(hermesHome, 'google_oauth.json')
     if ((code ?? 1) === 0 && settings.uploadDrive && driveFolderId) {
      const createdFiles = await collectResultFiles(outputDir, created)
      const loggedFiles = collectLoggedDocxPaths(allLines, outputDir)
      const docxFiles = [...new Set([...createdFiles, ...loggedFiles])].filter(f => /\.docx$/i.test(f))
      if (docxFiles.length) {
       sse(controller, 'log', { line: `☁️ Đang tải ${docxFiles.length} file .docx lên Google Drive + chuyển Google Docs...`, jobId })
       const res = await uploadDocxToDrive(docxFiles, driveFolderId, tokenFile, engineDir, true)
       if (!res.ok) {
        sse(controller, 'log', { line: `⚠️ Lỗi upload Drive: ${res.error}`, jobId })
       } else {
        for (const u of res.uploaded) {
         driveUploads.push(u)
         sse(controller, 'log', { line: u.gdocLink ? `☁️ ${u.name} → Docs: ${u.gdocLink}` : `☁️ ${u.name} → Word: ${u.docxLink}. ⚠️ Convert Docs lỗi: ${u.gdocError || 'không rõ'}`, jobId })
         if (!u.gdocLink && u.docxViewLink) sse(controller, 'log', { line: `↗ Xem trên Drive: ${u.docxViewLink}`, jobId })
         if (!u.gdocLink && !u.localDeleted) sse(controller, 'log', { line: `📦 Giữ file local vì chưa convert được Google Docs.`, jobId })
        }
        if (res.skipped?.length) sse(controller, 'log', { line: `↷ Bỏ qua ${res.skipped.length} file không phải .docx`, jobId })
        if (res.uploaded?.some((u: any) => u.localDeleted)) sse(controller, 'log', { line: `🗑️ Đã xoá file local cho các file đã convert Google Docs thành công.`, jobId })
       }
      }
     }
     sse(controller, 'done', { code: code ?? 1, created, outputDir, jobId, driveUploads })
    }
    close()
   })

   req.signal.addEventListener('abort', () => {
    if (child.exitCode !== null || child.signalCode !== null || !RUNNING.has(jobId)) return
    cancelled = true
    child.kill('SIGTERM')
    RUNNING.delete(jobId)
    close()
   })
  },
 })

 return new Response(stream, {
  headers: {
   'Content-Type': 'text/event-stream; charset=utf-8',
   'Cache-Control': 'no-cache, no-transform',
   Connection: 'keep-alive',
  },
 })
}

export async function DELETE(req: Request) {
 const url = new URL(req.url)
 const jobId = url.searchParams.get('jobId') || ''
 if (!jobId) return NextResponse.json({ ok: false, error: 'Thiếu jobId' }, { status: 400 })
 const child = RUNNING.get(jobId)
 if (!child) return NextResponse.json({ ok: false, error: 'Job không còn chạy' }, { status: 404 })
 const ok = child.kill('SIGTERM')
 RUNNING.delete(jobId)
 return NextResponse.json({ ok, jobId, status: ok ? 'cancelled' : 'failed_to_cancel' })
}
