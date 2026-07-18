import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { NextResponse } from 'next/server'
import { kientreConfig } from '@/lib/config/kientre'
import { readStore, writeStore } from '@/lib/store'
import { withDefaultSkills } from '@/lib/defaultSkills'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RUNNING = (globalThis as any).__KIENTRE_AGENT_RUNNING__ || new Map<string, ChildProcessWithoutNullStreams>()
;(globalThis as any).__KIENTRE_AGENT_RUNNING__ = RUNNING

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
 try { controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)) } catch {}
}

type SessionMemory = {
 id: string
 module: string
 summary: string
 updatedAt: number
 turns: number
 lastUserText: string
 lastAssistantText: string
 difficultySignals: string[]
}

async function saveSessionMemory(sessionId: string, moduleKey: string, payload: any, finalText: string) {
 if (!sessionId) return
 const history = Array.isArray(payload?.history) ? payload.history : []
 const msgs = history.filter((m: any) => m && typeof m.content === 'string')
 const lastUserText = [...msgs].reverse().find((m: any) => m.role === 'user')?.content || payload?.task || ''
 const lastAssistantText = finalText || [...msgs].reverse().find((m: any) => m.role === 'assistant')?.content || ''
 const summary = [
  payload?.config?.sessionContext?.fullText || '',
  finalText ? `Kết quả mới nhất: ${finalText}` : '',
 ].filter(Boolean).join('\n')
 const difficultySignals: string[] = Array.from(new Set((payload?.config?.sessionContext?.difficultySignals || []).slice(-20).map((x: any) => String(x)))) as string[]
 const store = await readStore<{ items: SessionMemory[] }>('session-memory', { items: [] })
 const next: SessionMemory = {
  id: sessionId,
  module: moduleKey,
  summary: summary.slice(-30000),
  updatedAt: Date.now(),
  turns: Number(payload?.config?.sessionContext?.turns || history.length || 0),
  lastUserText: String(lastUserText).slice(-2000),
  lastAssistantText: String(lastAssistantText).slice(-4000),
  difficultySignals,
 }
 const idx = store.items.findIndex(x => x.id === sessionId)
 if (idx >= 0) store.items[idx] = next
 else store.items.unshift(next)
 store.items = store.items.slice(0, 100)
 await writeStore('session-memory', store)
}

async function loadSessionMemory(sessionId: string) {
 if (!sessionId) return null
 const store = await readStore<{ items: SessionMemory[] }>('session-memory', { items: [] })
 return store.items.find(x => x.id === sessionId) || null
}

async function resolveEngineDir(candidate: string) {
 const dirs = [candidate, kientreConfig.engineDir, path.join(process.cwd(), 'kientre-engine')]
 for (const dir of dirs) {
  if (!dir) continue
  try { await fs.access(path.join(dir, 'agent', 'run.mjs')); return dir } catch {}
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

async function readProviderKeyEnv(hermesHome: string): Promise<Record<string, string>> {
 const settingsPath = path.join(hermesHome || kientreConfig.hermesHome, 'kientre-webapp-settings.json')
 const env: Record<string, string> = {}
 try {
  const raw = await fs.readFile(settingsPath, 'utf8')
  const keys = (JSON.parse(raw)?.apiKeys || {}) as Record<string, string>
  const map: Record<string, string> = { gemini: 'GEMINI_API_KEY', deepseek: 'DEEPSEEK_API_KEY', glm: 'GLM_API_KEY', openrouter: 'OPENROUTER_API_KEY' }
  for (const [prov, envName] of Object.entries(map)) { const v = String(keys[prov] || '').trim(); if (v) env[envName] = v }
 } catch {}
 return env
}

let _py: string | null = null
async function pickPython(): Promise<string> {
 if (_py) return _py
 const cands = [process.env.HERMES_PYTHON, '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3', '/opt/homebrew/bin/python3', 'python3'].filter(Boolean) as string[]
 for (const c of cands) {
  const ok = await new Promise<boolean>(res => {
   const ch = spawn(c, ['-c', 'import certifi'])
   ch.on('error', () => res(false)); ch.on('close', code => res(code === 0))
  })
  if (ok) { _py = c; return c }
 }
 _py = 'python3'; return _py
}

async function uploadDocxToDrive(files: string[], folderId: string, tokenFile: string, engineDir: string, deleteLocal: boolean): Promise<{ ok: boolean; uploaded: any[]; skipped: any[]; error?: string }> {
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

function normalizeDriveFolderId(value: unknown) {
 const s = String(value || '').trim()
 return s.match(/folders\/([A-Za-z0-9_-]+)/)?.[1] || s.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1] || s
}

// Assemble the agent payload from stored config + skills + sources.
async function buildPayload(moduleKey: string, task: string, history: any[], settings: Record<string, any>, memory: SessionMemory | null = null) {
 const mod = { ...(settings?.modules?.[moduleKey] || {}), ...settings }
 const skillsStore = await readStore<{ items: any[] }>('skills', { items: [] })
 const sourcesStore = await readStore<{ items: any[] }>('sources', { items: [] })
 const allSkills = withDefaultSkills(skillsStore.items as any)

 const skills = allSkills.filter((s: any) =>
  s?.enabled !== false && (!Array.isArray(s.appliesTo) || !s.appliesTo.length || s.appliesTo.includes(moduleKey) || (mod.skillIds || []).includes(s.id)),
 )

 const sources = mod.useSources === false ? [] : sourcesStore.items.filter(
  (s: any) => s.enabled && (s.scope === 'global' || s.scope === moduleKey),
 )

 const selectedNotebookIds = Array.isArray(mod.selectedNotebookIds) && mod.selectedNotebookIds.length ? mod.selectedNotebookIds : (mod.notebookIds || [])
 const useNotebook = mod.mode === 'notebook' && selectedNotebookIds.length > 0
 const wantsWeb = /\b(web|mạng|internet|nguồn|tài liệu tham khảo|bài tập mẫu|hình minh họa|hình minh hoạ|ảnh minh họa|ảnh minh hoạ)\b/i.test(task)
 // Khi module có pipeline cứng (forced skill) thì thu hẹp tool để agent đi thẳng vào run_skill,
 // tránh lạc sang web_search/read_source id sai. Chỉ thêm nguồn khi thực sự bật NotebookLM/sources.
 const forcedSkillModules = ['topic', 'quiz', 'test', 'solve', 'review']
 let enabledTools: string[]
 if (forcedSkillModules.includes(moduleKey)) {
  enabledTools = ['run_skill', 'finish']
  if (['solve', 'review'].includes(moduleKey)) enabledTools.unshift('analyze_document')
  if (useNotebook) enabledTools.unshift('read_notebook')
  if (sources.length) enabledTools.unshift('read_source')
  if (wantsWeb || (!useNotebook && !sources.length && ['topic', 'quiz', 'test'].includes(moduleKey))) enabledTools.unshift('web_search')
 } else {
  enabledTools = mod.enabledTools || ['read_source', 'analyze_document', 'web_search', 'write_docx', 'run_skill', 'finish']
 }
 const config = {
  model: mod.model || kientreConfig.defaultWorkerModel,
  persona: mod.persona || '',
  systemPrompt: mod.systemPrompt || '',
  skills,
  skillFlows: skills.map((s: any) => ({ id: s.id, name: s.name, agentFlow: s.agentFlow || [], appliesTo: s.appliesTo || [] })),
  enabledTools,
  useNotebook,
  maxTurns: mod.maxTurns || 12,
  grade: mod.grade ? `Lớp ${mod.grade}` : 'Lớp 5',
  subject: mod.subject || 'Toán',
  moduleKey,
  difficulty: mod.difficulty || 'balanced',
  questionTypes: mod.questionTypes || [],
  sessionContext: { ...(memory ? { memory } : {}), ...(mod.sessionContext || {}) },
  runningJobs: Array.isArray(mod.runningJobs) ? mod.runningJobs.slice(0, 20) : [],
  difficultyBalancing: (mod.sessionContext?.balancingRule || (memory?.difficultySignals?.length ? `Dựa trên bộ nhớ phiên và tín hiệu độ khó: ${memory.difficultySignals.join(', ')}` : 'Cân bằng mức độ khó theo lịch sử phiên làm việc.')),
  quizSpec: moduleKey === 'quiz' ? {
   quizCount: Number(mod.quizCount || 5),
   totalScore: Number(mod.quizTotalScore || 10),
   timeMinutes: Number(mod.quizTimeMinutes || 35),
   levels: [1, 2, 3, 4, 5],
   types: ['trắc nghiệm', 'điền đáp án', 'tự luận'],
   essayRule: 'Bài tự luận phải có lời giải chi tiết và điểm cho từng ý giải.',
   timeRule: 'Dùng agent Student để ước lượng thời gian học sinh làm bài trong khoảng cho phép.',
  } : null,
  notebookIds: selectedNotebookIds,
  activeNotebookId: mod.activeNotebookId || selectedNotebookIds[0] || '',
 }
 return { task, config, sources, history }
}

export async function POST(req: Request) {
 const { jobId = '', task = '', moduleKey = 'topic', history = [], settings = {}, sessionId = '' } = await req.json().catch(() => ({})) as {
  jobId?: string; task?: string; moduleKey?: string; history?: any[]; settings?: Record<string, any>; sessionId?: string
 }
 const outputDir = settings.outputDir || kientreConfig.outputDir

 const stream = new ReadableStream({
  async start(controller) {
   const close = () => { try { controller.close() } catch {} }
   if (!jobId) { sse(controller, 'error', { message: 'Thiếu jobId' }); return close() }
   if (!task.trim()) { sse(controller, 'error', { message: 'Thiếu nội dung yêu cầu' }); return close() }

   const engineDir = await resolveEngineDir(settings.engineDir || kientreConfig.engineDir)
   const agentPath = path.join(engineDir, 'agent', 'run.mjs')
   try { await fs.access(agentPath) } catch {
    sse(controller, 'error', { message: `Không tìm thấy agent tại ${agentPath}.` }); return close()
   }

   const memory = await loadSessionMemory(sessionId)
   const payload = await buildPayload(moduleKey, task, history, settings, memory)
   sse(controller, 'start', { jobId, moduleKey, sources: payload.sources.length, tools: payload.config.enabledTools })

   const providerKeyEnv = await readProviderKeyEnv(settings.hermesHome || kientreConfig.hermesHome)
   const routerBaseUrl = settings.routerBaseUrl || kientreConfig.routerBaseUrl
   const moduleDriveFolderId = normalizeDriveFolderId(settings.driveFolderId || settings.driveParentId || kientreConfig.driveParentId)
   const env = {
    ...process.env, ...providerKeyEnv, ...eduAgentEnv(settings),
    HERMES_WORKSPACE_DIR: settings.workspaceDir || kientreConfig.workspaceDir,
    KIENTRE_OUTPUT_DIR: outputDir,
    HERMES_HOME: settings.hermesHome || kientreConfig.hermesHome,
    GOOGLE_OAUTH_JSON: settings.googleCredentialFile || kientreConfig.googleCredentialFile,
    HERMES_DRIVE_PARENT_ID: moduleDriveFolderId,
    KIENTRE_DRIVE_FOLDER_ID: moduleDriveFolderId,
    KIENTRE_QUIZ_STREAM_GDOC: settings.uploadDrive ? '1' : (process.env.KIENTRE_QUIZ_STREAM_GDOC || ''),
    NINE_ROUTER_BASE_URL: routerBaseUrl,
    NINEROUTER_URL: routerBaseUrl.replace(/\/v1\/?$/, ''),
    HERMES_ROUTER_URL: routerBaseUrl.replace(/\/v1\/?$/, ''),
    HERMES_WORKER_MODEL: payload.config.model,
    HERMES_FALLBACK_MODELS: settings.fallbackModels || process.env.HERMES_FALLBACK_MODELS || 'gc/gemini-2.5-flash,gc/gemini-2.5-pro,cc/claude-opus-4-8,openrouter/openrouter/free',
   }

   const child = spawn('node', [agentPath], { cwd: engineDir, env })
   RUNNING.set(jobId, child)
   child.stdin.write(JSON.stringify(payload))
   child.stdin.end()

   let buf = ''
   let cancelled = false
   const createdFiles: string[] = []

   const onData = (chunk: Buffer) => {
    buf += chunk.toString()
    const lines = buf.split('\n'); buf = lines.pop() ?? ''
    for (const l of lines) {
     const s = l.trim(); if (!s) continue
     let obj: any
     try { obj = JSON.parse(s) } catch { sse(controller, 'log', { line: s }); continue }
     if (obj.event === 'agent_step') sse(controller, 'agent_step', obj)
     else if (obj.event === 'agent_done') { for (const f of obj.createdFiles || []) createdFiles.push(f); sse(controller, 'agent_final', { finalText: obj.finalText, createdFiles }); void saveSessionMemory(sessionId, moduleKey, payload, obj.finalText || '') }
     else if (obj.event === 'agent_error') sse(controller, 'error', { message: obj.message })
    }
   }
   child.stdout.on('data', onData)
   child.stderr.on('data', (c: Buffer) => { const s = c.toString().trim(); if (s) sse(controller, 'log', { line: s }) })

   child.on('error', e => { RUNNING.delete(jobId); sse(controller, 'error', { message: e.message }); close() })
   child.on('close', async code => {
    RUNNING.delete(jobId)
    if (buf.trim()) { try { const o = JSON.parse(buf); if (o.event === 'agent_final') createdFiles.push(...(o.createdFiles || [])) } catch {} }
    const driveUploads: any[] = []
    if ((code ?? 1) === 0 && settings.uploadDrive && moduleDriveFolderId && createdFiles.length) {
     const docxFiles = [...new Set(createdFiles)].filter(f => /\.docx$/i.test(f))
     if (docxFiles.length) {
      sse(controller, 'agent_step', { type: 'assistant', text: `☁️ Đang tải ${docxFiles.length} file .docx lên Google Drive + chuyển Google Docs...` })
      const tokenFile = settings.googleCredentialFile || kientreConfig.googleCredentialFile || path.join(settings.hermesHome || kientreConfig.hermesHome, 'google_oauth.json')
      const res = await uploadDocxToDrive(docxFiles, moduleDriveFolderId, tokenFile, engineDir, true)
      if (!res.ok) sse(controller, 'agent_step', { type: 'assistant', text: `⚠️ Lỗi upload Drive: ${res.error}` })
      else {
       for (const u of res.uploaded) {
        driveUploads.push(u)
        sse(controller, 'agent_step', { type: 'assistant', text: `☁️ ${u.name} → Docs: ${u.gdocLink}` })
       }
      }
     }
    }
    sse(controller, 'done', { code: code ?? 1, cancelled, created: createdFiles.map(f => path.basename(f)), outputDir, createdFiles, driveUploads })
    close()
   })

   req.signal.addEventListener('abort', () => {
    if (!RUNNING.has(jobId)) return
    cancelled = true; child.kill('SIGTERM'); RUNNING.delete(jobId); close()
   })
  },
 })

 return new Response(stream, {
  headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
 })
}

export async function DELETE(req: Request) {
 const jobId = new URL(req.url).searchParams.get('jobId') || ''
 const child = RUNNING.get(jobId)
 if (!child) return NextResponse.json({ ok: false, error: 'Job không còn chạy' }, { status: 404 })
 const ok = child.kill('SIGTERM'); RUNNING.delete(jobId)
 return NextResponse.json({ ok, jobId })
}
