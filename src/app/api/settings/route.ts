import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { kientreConfig } from '@/lib/config/kientre'

// ponytail: config persisted to a single JSON file, no DB. add DB when multi-user.
const SETTINGS_PATH = path.join(kientreConfig.hermesHome, 'kientre-webapp-settings.json')

// The 4 modules. Each has its own subject/grade/model/Drive folder + skill hints.
const MODULES: Record<string, { label: string; command: string; needsFile: boolean }> = {
 topic: { label: 'Soạn chuyên đề', command: '/es-create', needsFile: false },
 quiz: { label: 'Soạn quiz theo chuyên đề', command: '/es-create', needsFile: false },
 test: { label: 'Soạn đề kiểm tra', command: '/es-test', needsFile: false },
 solve: { label: 'Giải chi tiết', command: '/es-solve', needsFile: true },
 review: { label: 'Nhận xét (review)', command: '/es-review', needsFile: true },
}

const EDU_AGENT_DEFAULT_MODELS = {
 intent: 'cx/gpt-5.5',
 architect: 'gc/gemini-2.5-flash',
 examiner: 'gc/gemini-2.5-flash',
 solver: 'gc/gemini-2.5-flash',
 judge: 'cx/gpt-5.5',
 student: 'gc/gemini-2.5-flash',
 reviewer: 'cx/gpt-5.5',
 visualcurator: 'gc/gemini-2.5-flash',
 artist: 'gc/gemini-2.5-flash',
}

// Direct AI providers the engine can call without 9router (see kientre-engine/server/llm.mjs).
const PROVIDER_KEYS = ['gemini', 'deepseek', 'glm', 'openrouter', 'pexels', 'pixabay', 'google', 'googleCse'] as const
type ProviderKey = typeof PROVIDER_KEYS[number]

function defaultModule() {
 return {
  subject: 'toán',
  grade: '5',
  model: kientreConfig.defaultWorkerModel,
  driveFolderId: kientreConfig.driveParentId,
  driveFolderUrl: kientreConfig.driveParentId ? 'https://drive.google.com/drive/folders/' + kientreConfig.driveParentId : '',
  driveFolderName: '',
  useSummary: kientreConfig.defaultSummary,
  uploadDrive: false,
  mode: 'detail',
  notebookIds: [] as string[],
  activeNotebookId: '',
  selectedNotebookIds: [] as string[],
  notebookPrompt: 'Tóm tắt nguồn học liệu liên quan, trích ý chính, ví dụ, lỗi thường gặp và đề xuất bài tập phù hợp.',
  // ── Mini-agent (module-as-agent) ──
  agentMode: false as boolean,               // false → pipeline cũ; true → agent loop
  persona: '',                               // vai trò khi làm module này
  systemPrompt: '',                          // yêu cầu/định nghĩa riêng
  skillIds: [] as string[],                  // custom skills áp dụng
  enabledTools: ['read_source', 'read_notebook', 'analyze_document', 'web_search', 'write_docx', 'run_skill', 'finish'] as string[],
  maxTurns: 12,
  useSources: true as boolean,
  // ── Button chức năng theo module ──
  questionTypes: ['mc', 'fill', 'essay'] as string[], // loại câu hỏi bật
  // ── Quyền truy cập & định nghĩa module ──
  access: 'public' as 'public' | 'restricted' | 'private', // ai dùng được module
  definition: '',                             // mô tả định nghĩa module cho người dùng
  icon: '',                                    // icon module (tên lucide)
  color: '',                                   // màu module
  customAgents: [] as string[],                // các agent/sub-agent gắn với module này
  agentModels: EDU_AGENT_DEFAULT_MODELS,
  quizCount: 5,
  quizTotalScore: 10,
  quizTimeMinutes: 35,
  customSubjects: [] as string[],
}
}

const DEFAULTS = {
 outputDir: kientreConfig.outputDir,
 workspaceDir: kientreConfig.workspaceDir,
 engineDir: kientreConfig.engineDir,
 hermesHome: kientreConfig.hermesHome,
 googleCredentialFile: kientreConfig.googleCredentialFile,
 routerBaseUrl: kientreConfig.routerBaseUrl,
 fallbackModels: kientreConfig.fallbackModels,
 modelRetries: kientreConfig.modelRetries,
 retryDelayMs: kientreConfig.retryDelayMs,
 // Secret provider API keys (stored server-side only, never returned raw to client).
 apiKeys: Object.fromEntries(PROVIDER_KEYS.map(p => [p, ''])) as Record<ProviderKey, string>,
 // per-module config
 modules: Object.fromEntries(Object.keys(MODULES).map(k => [k, defaultModule()])) as Record<string, ReturnType<typeof defaultModule>>,
}

async function readSettings() {
 const normalize = async (s: Record<string, any>) => {
  const hasSlash = async (dir: string) => {
   try { await fs.access(path.join(dir, 'slash.mjs')); return true } catch { return false }
  }
  if (!(await hasSlash(String(s.engineDir || '')))) s.engineDir = kientreConfig.engineDir
  // ensure api keys object always present
  s.apiKeys = { ...DEFAULTS.apiKeys, ...(s.apiKeys || {}) }
  // ensure every module exists with defaults merged
  s.modules = s.modules || {}
  for (const k of Object.keys(MODULES)) {
   s.modules[k] = { ...defaultModule(), ...(s.modules[k] || {}) }
   if (k === 'quiz') {
    s.modules[k] = {
     ...s.modules[k],
     agentMode: s.modules[k].agentMode ?? true,
     persona: s.modules[k].persona || 'Bạn là giáo viên tiểu học chuyên thiết kế quiz theo chuyên đề, phân tầng độ khó rõ ràng.',
     systemPrompt: s.modules[k].systemPrompt || 'Soạn quiz theo chuyên đề: số quiz lấy đúng từ UI, không mặc định 5. Mỗi quiz khó dần nếu có nhiều quiz; nếu chỉ 1 quiz thì chỉ tạo Quiz 1. Mỗi quiz gồm trắc nghiệm, điền đáp án và tự luận. Có tổng điểm, thời gian làm bài, lời giải chi tiết cho tự luận và điểm từng ý.',
    }
   }
  }
  return s
 }
 try {
  const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
  return normalize({ ...DEFAULTS, ...JSON.parse(raw) })
 } catch {
  return normalize({ ...DEFAULTS })
 }
}

// Replace raw secrets with a safe presence descriptor before sending to the client.
function maskSettings(s: Record<string, any>) {
 const clone = { ...s }
 const raw = (s.apiKeys || {}) as Record<string, string>
 clone.apiKeys = Object.fromEntries(PROVIDER_KEYS.map(p => {
  const v = String(raw[p] || '')
  return [p, v ? { present: true, hint: '••••' + v.slice(-4) } : { present: false, hint: '' }]
 }))
 return clone
}

export async function GET() {
 const settings = await readSettings()
 return NextResponse.json({ ok: true, settings: maskSettings(settings), modules: MODULES, path: SETTINGS_PATH })
}

export async function POST(req: Request) {
 const body = await req.json().catch(() => ({}))
 const current = await readSettings()
 const next: Record<string, any> = { ...current }
 // top-level whitelist
 for (const k of ['outputDir', 'workspaceDir', 'engineDir', 'hermesHome', 'googleCredentialFile', 'routerBaseUrl', 'fallbackModels', 'modelRetries', 'retryDelayMs']) {
  if (k in body) next[k] = body[k]
 }
 // API keys: only overwrite when a non-empty string is provided; empty string = clear.
 if (body.apiKeys && typeof body.apiKeys === 'object') {
  next.apiKeys = { ...current.apiKeys }
  for (const p of PROVIDER_KEYS) {
   const v = body.apiKeys[p]
   if (typeof v === 'string') next.apiKeys[p] = v.trim()      // set or clear
   // a masked object ({present,hint}) or undefined → keep existing key untouched
  }
 }
 // per-module merge
 if (body.modules && typeof body.modules === 'object') {
  next.modules = { ...current.modules }
  for (const k of Object.keys(MODULES)) {
   if (body.modules[k]) next.modules[k] = { ...next.modules[k], ...body.modules[k] }
  }
 }
 await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true })
 await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8')
 return NextResponse.json({ ok: true, settings: maskSettings(next) })
}
