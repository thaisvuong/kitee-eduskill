'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot, Cloud, Download, Eye, FileStack, FileText, KeyRound, LayoutDashboard, MessageSquare,
  Paperclip, Pencil, Plug, RefreshCw, Save, Send, Settings, Terminal, Trash2, User, X, ArrowLeft,
  BookOpen, ClipboardList, Wand2, CheckCircle2, Database, Sparkles, SlidersHorizontal, Layers, BookMarked, Link2, NotebookTabs,
  Cpu, ShieldCheck, Eye as EyeIcon, EyeOff, Shield,
} from 'lucide-react'
import { quickChatReply } from '@/lib/quickChat'
import { SLASH_COMMANDS, suggestCommands, findCommand, type SlashCommand } from '@/lib/kientreEngine/slashCommands'

// ---- Modules -------------------------------------------------------------
type ModuleKey = 'topic' | 'quiz' | 'test' | 'solve' | 'review'
const MODULES: { key: ModuleKey; label: string; desc: string; command: string; needsFile: boolean; icon: any }[] = [
  { key: 'topic', label: 'Soạn chuyên đề', desc: 'Lý thuyết + ví dụ + bài tập + đáp án', command: '/es-create', needsFile: false, icon: BookOpen },
  { key: 'quiz', label: 'Soạn quiz theo chuyên đề', desc: 'Số quiz theo UI · tự soạn hoặc bám tài liệu/NotebookLM', command: '/es-create', needsFile: false, icon: ClipboardList },
  { key: 'test', label: 'Soạn đề kiểm tra', desc: 'Trắc nghiệm + điền + tự luận kèm biểu điểm', command: '/es-test', needsFile: false, icon: ClipboardList },
  { key: 'solve', label: 'Giải chi tiết', desc: 'Giải từng câu trong tài liệu đã tải lên', command: '/es-solve', needsFile: true, icon: Wand2 },
  { key: 'review', label: 'Nhận xét (review)', desc: 'Thẩm định điểm mạnh, lỗi, cải thiện', command: '/es-review', needsFile: true, icon: CheckCircle2 },
]
const isModuleKey = (v: unknown): v is ModuleKey => MODULES.some(m => m.key === v)
const moduleOf = (k: ModuleKey | string) => MODULES.find(m => m.key === k) || MODULES[0]

type EduAgentKey = 'intent' | 'quizplanner' | 'architect' | 'examiner' | 'solver' | 'judge' | 'student' | 'reviewer' | 'visualcurator' | 'artist'
const EDU_AGENTS: { key: EduAgentKey; label: string; desc: string; env: string; fallback: string }[] = [
  { key: 'intent', label: 'Intent', desc: 'Đọc yêu cầu, xác định ý định và thông tin còn thiếu', env: 'HERMES_INTENT_MODEL', fallback: 'cx/gpt-5.5' },
  { key: 'quizplanner', label: 'QuizPlanner', desc: 'Lập bảng khung quiz/câu/điểm/loại câu/note/hình bằng model mạnh', env: 'HERMES_QUIZ_PLANNER_MODEL', fallback: 'cx/gpt-5.5' },
  { key: 'architect', label: 'Architect', desc: 'Lập khung chuyên đề, ranh giới kiến thức, mục tiêu', env: 'HERMES_ARCHITECT_MODEL', fallback: 'gc/gemini-2.5-flash' },
  { key: 'examiner', label: 'Examiner', desc: 'Ra đề kiểm tra, trắc nghiệm, điền, tự luận, biểu điểm', env: 'HERMES_EXAMINER_MODEL', fallback: 'gc/gemini-2.5-flash' },
  { key: 'solver', label: 'Solver', desc: 'Giải chi tiết từng câu trong tài liệu', env: 'HERMES_SOLVER_MODEL', fallback: 'gc/gemini-2.5-flash' },
  { key: 'judge', label: 'Judge', desc: 'Đánh giá sai kiến thức, vượt lớp, không thực tế', env: 'HERMES_JUDGE_MODEL', fallback: 'cx/gpt-5.5' },
  { key: 'student', label: 'Student', desc: 'Ước lượng thời gian học sinh làm bài/đọc hiểu', env: 'HERMES_STUDENT_MODEL', fallback: 'gc/gemini-2.5-flash' },
  { key: 'reviewer', label: 'Reviewer', desc: 'Thẩm định chất lượng tài liệu, lỗi bắt buộc sửa', env: 'HERMES_REVIEWER_MODEL', fallback: 'cx/gpt-5.5' },
  { key: 'visualcurator', label: 'VisualCurator', desc: 'Quyết định khi nào cần hình, loại hình phù hợp', env: 'HERMES_VISUAL_MODEL', fallback: 'gc/gemini-2.5-flash' },
  { key: 'artist', label: 'Artist', desc: 'Vẽ TikZ/hình minh hoạ và tự sửa lỗi vẽ', env: 'HERMES_ARTIST_MODEL', fallback: 'gc/gemini-2.5-flash' },
]

const SUBJECTS = ['toán', 'tiếng việt', 'khoa học', 'tiếng anh']

const MODULE_SKILLS: Record<ModuleKey, { key: string; label: string; desc: string; patch: Partial<ModuleConfig> }[]> = {
  topic: [
    { key: 'detail', label: 'Soạn chi tiết', desc: 'Lý thuyết, ví dụ, bài tập phân tầng', patch: { mode: 'detail', agentMode: false } },
    { key: 'summary', label: 'Tóm tắt', desc: 'Ngắn, dễ dạy, dễ đọc', patch: { mode: 'summary', agentMode: false } },
    { key: 'notebook', label: 'Dùng NotebookLM', desc: 'Ưu tiên sổ tay đã chọn', patch: { mode: 'notebook', agentMode: true } },
  ],
  quiz: [
    { key: 'quiz-ui', label: 'Quiz theo UI', desc: 'Số lượng lấy từ ô Số quiz', patch: { agentMode: true, difficulty: 'mixed' } },
    { key: 'quick', label: 'Quiz nhanh', desc: 'Ít câu, kiểm tra nhanh', patch: { agentMode: true, difficulty: 'easy', quizCount: 3 } },
    { key: 'hard', label: 'Quiz nâng cao', desc: 'Tăng phân hoá', patch: { agentMode: true, difficulty: 'hard' } },
  ],
  test: [
    { key: 'balanced', label: 'Đề cân bằng', desc: 'TN + điền + tự luận', patch: { mode: 'exam', questionTypes: ['mc', 'fill', 'essay'] } },
    { key: 'objective', label: 'Nhiều trắc nghiệm', desc: 'Ưu tiên TN/điền', patch: { mode: 'exam', questionTypes: ['mc', 'fill'] } },
    { key: 'essay', label: 'Tự luận sâu', desc: 'Ưu tiên lời giải, biểu điểm', patch: { mode: 'exam', questionTypes: ['essay'] } },
  ],
  solve: [
    { key: 'solve-detail', label: 'Giải chi tiết', desc: 'Từng bước, đúng lớp', patch: { agentMode: false } },
    { key: 'solve-check', label: 'Giải + kiểm lỗi', desc: 'Solver + Judge + Reviewer', patch: { agentMode: true } },
  ],
  review: [
    { key: 'review-fast', label: 'Review nhanh', desc: 'Lỗi chính, sửa ngay', patch: { agentMode: false } },
    { key: 'review-deep', label: 'Review sâu', desc: 'Reviewer + Judge', patch: { agentMode: true } },
  ],
}

// Nhãn tiếng Việt dễ hiểu cho các "khả năng" (tool) của trợ lý — hiện thay cho tên kỹ thuật.
const TOOL_LABELS: Record<string, { label: string; desc: string }> = {
  read_source: { label: 'Đọc tài liệu Nguồn', desc: 'Đọc các tài liệu anh đã nạp vào mục Nguồn' },
  read_notebook: { label: 'Đọc NotebookLM', desc: 'Lấy nội dung từ sổ NotebookLM đã liên kết' },
  analyze_document: { label: 'Phân tích file tải lên', desc: 'Đọc & hiểu file .docx/.pdf anh vừa tải lên' },
  web_search: { label: 'Tìm trên web', desc: 'Tìm thêm bài tập / thông tin trên Internet' },
  write_docx: { label: 'Xuất file Word', desc: 'Tạo file .docx kết quả để tải về' },
  run_skill: { label: 'Chạy quy trình soạn sẵn', desc: 'Dùng quy trình soạn chuyên đề / đề kiểm tra có sẵn' },
  finish: { label: 'Kết thúc & trả lời', desc: 'Chốt kết quả và trả lời cho anh (nên luôn bật)' },
}

function extractNotebookIds(text: string) {
  const ids = [...String(text || '').matchAll(/notebooklm\.google\.com\/notebook\/([A-Za-z0-9_-]{8,})/gi)].map(m => m[1])
  return Array.from(new Set(ids))
}
function stripNotebookLinks(text: string) {
  return String(text || '').replace(/https?:\/\/notebooklm\.google\.com\/notebook\/[A-Za-z0-9_-]+\S*/gi, ' ').replace(/\s{2,}/g, ' ').trim()
}
function moduleCommand(module: ModuleKey) {
  return moduleOf(module).command
}
// Nhãn nút bấm dễ hiểu thay cho tên lệnh "/..." cho người không rành lệnh.
function skillButtonLabel(name: string, fallback: string) {
  const map: Record<string, string> = {
    '/es-create': 'Soạn chuyên đề', '/es-quiz': 'Tạo bộ quiz', '/es-test': 'Soạn đề kiểm tra',
    '/es-solve': 'Giải chi tiết', '/es-review': 'Nhận xét tài liệu',
  }
  return map[name] || fallback
}
function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

const MODE_OPTIONS: { key: NonNullable<ModuleConfig['mode']>; label: string; desc: string; suffix: string }[] = [
  { key: 'detail', label: 'Soạn chi tiết', desc: 'Đầy đủ lý thuyết, ví dụ, đáp án', suffix: 'Yêu cầu: soạn chi tiết, có ví dụ, bài tập phân tầng và đáp án.' },
  { key: 'summary', label: 'Tóm tắt', desc: 'Ngắn gọn, dễ dạy, dễ đọc', suffix: 'Yêu cầu: viết dạng tóm tắt, cô đọng, ưu tiên ý chính.' },
  { key: 'exam', label: 'Chuẩn kiểm tra', desc: 'Đúng ma trận, biểu điểm', suffix: 'Yêu cầu: theo cấu trúc kiểm tra, có mức độ nhận biết/thông hiểu/vận dụng và biểu điểm rõ.' },
  { key: 'notebook', label: 'Dùng NotebookLM', desc: 'Lấy dữ liệu từ notebook đã liên kết', suffix: 'Yêu cầu: ưu tiên dữ liệu NotebookLM đã nhập bên dưới.' },
]

type View = 'chat' | 'queue' | 'files' | 'settings' | 'skills' | 'notebooklm' | 'agent'
type RunStatus = 'running' | 'done' | 'error'
type DriveUp = { name: string; docxLink?: string; docxViewLink?: string; docxDownloadLink?: string; gdocLink?: string; gdocError?: string }
type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'bot'; text: string }
  | { id: string; role: 'upload'; name: string; filePath: string; grade?: string; sourceId?: string }
  | { id: string; role: 'run'; command: string; module: ModuleKey; logs: string[]; status: RunStatus; created: string[]; outputDir: string; startedAt: number; agent?: string; drive?: DriveUp[] }
  | { id: string; role: 'agent'; task: string; module: ModuleKey; steps: AgentStep[]; status: RunStatus; created: string[]; outputDir: string; startedAt: number; finalText?: string; drive?: DriveUp[]; intentOnly?: boolean }

type ModuleConfig = {
  subject: string; grade: string; model: string
  driveFolderId: string; driveFolderUrl: string; driveFolderName?: string; useSummary: boolean; uploadDrive: boolean
  mode?: 'detail' | 'summary' | 'exam' | 'notebook'
  notebookIds?: string[]
  activeNotebookId?: string
  selectedNotebookIds?: string[]
  notebookPrompt?: string
  // mini-agent
  agentMode?: boolean
  persona?: string
  systemPrompt?: string
  skillIds?: string[]
  enabledTools?: string[]
  maxTurns?: number
  useSources?: boolean
  // button chức năng theo module
  difficulty?: 'easy' | 'medium' | 'hard' | 'mixed'
  questionTypes?: string[]
  // quyền truy cập & định nghĩa module (Đợt 2)
  access?: 'public' | 'restricted' | 'private'
  definition?: string
  icon?: string
  color?: string
  customAgents?: string[]
  agentModels?: Partial<Record<EduAgentKey, string>>
  quizCount?: number
  quizTotalScore?: number
  quizTimeMinutes?: number
  customSubjects?: string[]
}
type SkillDef = { id: string; name: string; description: string; systemPrompt: string; guidance: string; appliesTo: string[]; enabled: boolean; agentFlow?: string[] }
type NotebookJob = { id: string; type: string; notebookIds: string[]; status: RunStatus; message: string; startedAt: number }
type SourceDef = { id: string; title: string; kind: 'text' | 'link' | 'file'; content: string; sourceRef: string; scope: string; enabled: boolean; createdAt: number }
type AgentStep =
  | { type: 'turn'; turn: number; maxTurns: number }
  | { type: 'assistant'; text: string }
  | { type: 'tool_call'; name: string; args: any }
  | { type: 'tool_result'; name: string; ok: boolean; brief: string }
  | { type: 'model_request'; requested: string; sent?: string; route?: string; mode?: string; tools?: string[] }
  | { type: 'model_response'; requested: string; sent?: string; responded?: string; route?: string; mode?: string; finishReason?: string }
  | { type: 'model_fallback'; primary: string; fallbackTo: string; reason?: string; mode?: string }
  | { type: 'final'; text: string; createdFiles: string[] }
  | { type: 'limit'; maxTurns: number }
  | { type: 'error'; message: string }
type JobMsg = Extract<Msg, { role: 'run' }> | Extract<Msg, { role: 'agent' }>
type QueueItem = JobMsg & { sessionId?: string; sessionTitle?: string }
type SessionMeta = { id: string; title: string; module: string; count: number; updatedAt: number; contextChars: number; contextLimit: number; contextPct: number }
type MaskedKey = { present: boolean; hint: string }
type ProviderKey = 'gemini' | 'deepseek' | 'glm' | 'openrouter'
type SettingsShape = {
  outputDir: string; workspaceDir: string; engineDir: string; hermesHome: string; googleCredentialFile: string
  routerBaseUrl: string; fallbackModels: string; modelRetries: number; retryDelayMs: number
  apiKeys: Record<ProviderKey, MaskedKey>
  modules: Record<ModuleKey, ModuleConfig>
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

const LS = { authed: 'kientre.authed', view: 'kientre.view', msgs: 'kientre.msgs', input: 'kientre.input', module: 'kientre.module' }
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const fileUrl = (root: string, param: 'preview' | 'download', rel: string) =>
  `/api/files?root=${encodeURIComponent(root)}&${param}=${encodeURIComponent(rel)}`

function isQuickChat(text: string) {
  const t = text.trim().toLowerCase()
  if (!t) return false
  if (/^(soạn|tạo|tao|lập|lap|xuất|xuat|viết|viet|làm|lam)\b/.test(t)) return false
  if (/\b(word|docx|pdf|quiz|đề kiểm tra|de kiem tra|giải file|giai file|review file|xử lý file|xu ly file|tài liệu vừa tải|tai lieu vua tai)\b/.test(t)) return false
  return /\b(là gì|la gi|gồm những|gom nhung|có những|co nhung|kể tên|ke ten|liệt kê|liet ke|danh sách|danh sach|chủ điểm|chu diem|chủ đề|chu de|nào|nao)\b/.test(t)
}

// ---- Agent flow ----------------------------------------------------------
const AGENT_FLOWS: Record<string, string[]> = {
  topic: ['Intent', 'Architect', 'Source/NotebookLM', 'Judge', 'VisualCurator', 'Artist', 'Student', 'Reviewer', 'Word'],
  quiz: ['Intent', 'Architect', 'Source/NotebookLM', 'QuizPlanner', 'Examiner', 'Artist', 'Judge', 'Reviewer', 'Word'],
  test: ['Intent', 'Examiner', 'Judge', 'Reviewer', 'Word'],
  solve: ['Read', 'Solver', 'Judge', 'Reviewer', 'Word'],
  review: ['Read', 'Reviewer', 'Judge', 'Word'],
}
const AGENT_HINTS: [RegExp, string][] = [
  [/intent|đọc hiểu|phân tích yêu cầu/i, 'Intent'],
  [/đọc tài liệu|read document|extract/i, 'Read'],
  [/architect|kiến trúc|dàn ý|khung/i, 'Architect'],
  [/nguồn|source|web|search|tải ảnh|imagefetch/i, 'Source'],
  [/judge|bác bỏ|thẩm định nội dung|ranh giới/i, 'Judge'],
  [/solve|giải/i, 'Solver'],
  [/exam|đề kiểm tra|examiner/i, 'Examiner'],
  [/visualcurator|đề xuất.*hình|curator/i, 'VisualCurator'],
  [/artist|tikz|vẽ hình|biểu đồ/i, 'Artist'],
  [/student|học sinh|ước lượng|thời lượng/i, 'Student'],
  [/review|nhận xét|reviewer/i, 'Reviewer'],
  [/word|thiết kế word|đã lưu|hoàn tất|📍/i, 'Word'],
]
const detectAgent = (line: string) => { for (const [re, n] of AGENT_HINTS) if (re.test(line)) return n; return undefined }

export default function Home() {
  const [authed, setAuthed] = useState(false)
  const [module, setModule] = useState<ModuleKey | null>(null)
  const [view, setView] = useState<View>('chat')
  const [settings, setSettings] = useState<SettingsShape | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [hydrated, setHydrated] = useState(false)
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeSessionId, setActiveSessionId] = useState('')
  const [moduleQueue, setModuleQueue] = useState<QueueItem[]>([])

  useEffect(() => {
    try {
      setAuthed(localStorage.getItem(LS.authed) === '1')
      const savedModule = localStorage.getItem(LS.module)
      setModule(isModuleKey(savedModule) ? savedModule : null)
      setView((localStorage.getItem(LS.view) as View) || 'chat')
      setMsgs(JSON.parse(localStorage.getItem(LS.msgs) || '[]'))
      setInput(localStorage.getItem(LS.input) || '')
    } catch {}
    fetch('/api/settings').then(r => r.json()).then(d => setSettings(d.settings)).catch(() => {})
    fetch('/api/sessions').then(r => r.json()).then(async d => {
      if (d.ok && d.items?.length) {
        setSessions(d.items); setActiveSessionId(d.items[0].id)
        const mk = isModuleKey(d.items[0].module) ? d.items[0].module : 'topic'
        await clearModuleNotebooks(mk)
      }
      else {
        const cr = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Phiên mới', module: 'topic', messages: [] }) }).then(r => r.json()).catch(() => null)
        if (cr?.ok) { setSessions([{ id: cr.session.id, title: cr.session.title, module: cr.session.module, count: 0, updatedAt: cr.session.updatedAt, contextChars: 0, contextLimit: 20000, contextPct: 0 }]); setActiveSessionId(cr.session.id) }
      }
    }).catch(() => {})
    setHydrated(true)
  }, [])
  // NotebookLM notebooks are persistent per module and reused across sessions.
  async function clearModuleNotebooks(_mk: ModuleKey) { /* no-op: user can remove notebooks manually */ }
  async function openSession(id: string) {
    const d = await fetch('/api/sessions?id=' + encodeURIComponent(id)).then(r => r.json()).catch(() => null)
    if (d?.ok && d.session) {
      const mk = (d.session.module as ModuleKey) || module || 'topic'
      await clearModuleNotebooks(mk)
      setActiveSessionId(id); setMsgs(d.session.messages || []); setModule(mk)
      try { localStorage.setItem(LS.msgs, JSON.stringify(d.session.messages || [])) } catch {}
    }
  }
  async function newSession() {
    const mk = module || 'topic'
    const d = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `${moduleOf(mk).label} mới`, module: mk, messages: [] }) }).then(r => r.json()).catch(() => null)
    if (d?.ok) { await clearModuleNotebooks(mk); setSessions(s => [{ id: d.session.id, title: d.session.title, module: d.session.module, count: 0, updatedAt: d.session.updatedAt, contextChars: 0, contextLimit: 20000, contextPct: 0 }, ...s]); setActiveSessionId(d.session.id); setMsgs([]) }
  }
  async function deleteSession(id: string) {
    await fetch('/api/sessions?id=' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => null)
    setSessions(s => s.filter(x => x.id !== id))
    if (activeSessionId === id) { setActiveSessionId(''); setMsgs([]) }
  }
  async function pickModule(mk: ModuleKey) {
    setModule(mk)
    const found = sessions.filter(s => s.module === mk).sort((a, b) => b.updatedAt - a.updatedAt)[0]
    if (found) { await openSession(found.id); return }
    const d = await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: `${moduleOf(mk).label} mới`, module: mk, messages: [] }) }).then(r => r.json()).catch(() => null)
    if (d?.ok) { setSessions(s => [{ id: d.session.id, title: d.session.title, module: d.session.module, count: 0, updatedAt: d.session.updatedAt, contextChars: 0, contextLimit: 20000, contextPct: 0 }, ...s]); setActiveSessionId(d.session.id); setMsgs([]) }
  }
  useEffect(() => {
    if (!module) return
    fetch('/api/sessions?module=' + encodeURIComponent(module) + '&includeJobs=1').then(r => r.json()).then(d => {
      if (d?.ok) {
        setSessions(prev => {
          const others = prev.filter(s => s.module !== module)
          return [...(d.items || []), ...others].sort((a, b) => b.updatedAt - a.updatedAt)
        })
        setModuleQueue((d.jobs || []).filter((j: QueueItem) => j.module === module))
      }
    }).catch(() => {})
  }, [module, msgs.length, activeSessionId])
  useEffect(() => {
    if (!hydrated || !activeSessionId || !module) return
    const t = setTimeout(() => {
      fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: activeSessionId, module, messages: msgs, title: msgs.find(m => m.role === 'user') && (msgs.find(m => m.role === 'user') as any).text?.slice(0, 50) || moduleOf(module).label }) }).catch(() => null)
      const chars = summarizeSessionForAgent(msgs).fullText.length
      setSessions(s => s.map(x => x.id === activeSessionId ? { ...x, module, count: msgs.length, updatedAt: Date.now(), contextChars: chars, contextLimit: 20000, contextPct: Math.min(100, Math.round((chars / 20000) * 100)) } : x))
    }, 800)
    return () => clearTimeout(t)
  }, [msgs, module, activeSessionId, hydrated])
  useEffect(() => { if (hydrated) localStorage.setItem(LS.authed, authed ? '1' : '0') }, [authed, hydrated])
  useEffect(() => { if (hydrated) localStorage.setItem(LS.module, module || '') }, [module, hydrated])
  useEffect(() => { if (hydrated) localStorage.setItem(LS.view, view) }, [view, hydrated])
  useEffect(() => { if (hydrated) localStorage.setItem(LS.msgs, JSON.stringify(msgs)) }, [msgs, hydrated])
  useEffect(() => { if (hydrated) localStorage.setItem(LS.input, input) }, [input, hydrated])

  const queue = useMemo(() => moduleQueue.slice(), [moduleQueue])
  const runningCount = queue.filter(q => q.status === 'running').length
  const moduleMsgs = useMemo(() => (module ? msgs.filter(m => !('module' in m) || m.module === module) : msgs), [msgs, module])
  const moduleSessions = useMemo(() => module ? sessions.filter(s => s.module === module) : sessions, [sessions, module])
  const currentSessionMeta = useMemo(() => sessions.find(s => s.id === activeSessionId) || null, [sessions, activeSessionId])

  if (!authed) return <Login onDone={() => setAuthed(true)} />
  if (!module) return <ModulePicker settings={settings} onPick={pickModule} onSettings={() => { void pickModule('topic'); setView('settings') }} />

  const cur = moduleOf(module)
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">K</div>
          <div><h1>KientreAAA</h1><p>{cur.label}</p></div>
        </div>
        <button className="nav-item switch" onClick={() => setModule(null)}><ArrowLeft size={16} /> Đổi Module</button>
        <div className="nav-title">Menu</div>
        <button className={`nav-item ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}><MessageSquare size={17} /> Trợ lý chat</button>
        <button className={`nav-item ${view === 'queue' ? 'active' : ''}`} onClick={() => setView('queue')}><FileStack size={17} /> Queue module {runningCount > 0 ? `(${runningCount})` : ''}</button>
        <button className={`nav-item ${view === 'files' ? 'active' : ''}`} onClick={() => setView('files')}><FileText size={17} /> Kết quả</button>
        <button className={`nav-item ${view === 'notebooklm' ? 'active' : ''}`} onClick={() => setView('notebooklm')}><NotebookTabs size={17} /> NotebookLM</button>
        <button className={`nav-item ${view === 'skills' ? 'active' : ''}`} onClick={() => setView('skills')}><Sparkles size={17} /> Skills</button>
        <button className={`nav-item ${view === 'agent' ? 'active' : ''}`} onClick={() => setView('agent')}><Bot size={17} /> Agent</button>
        <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}><Settings size={17} /> Cài đặt</button>
        <div className="session-block">
          <div className="nav-title">Phiên chat <button className="session-new" onClick={newSession}>+ Mới</button></div>
          {moduleSessions.slice(0, 6).map(s => (
            <button key={s.id} className={`session-item ${activeSessionId === s.id ? 'active' : ''}`} onClick={() => openSession(s.id)}>
              <span className="s-title">{s.title || 'Phiên mới'}</span><span className="s-mod">{moduleOf((s.module as ModuleKey) || 'topic').label}</span>
              <span className="s-mod">ctx {s.contextChars}/{s.contextLimit} · {s.contextPct}%</span>
              <span className="s-del" onClick={e => { e.stopPropagation(); deleteSession(s.id) }}>×</span>
            </button>
          ))}
        </div>
        <div className="sidebar-foot"><span className="dot" />Kientre · Hermes</div>
      </aside>
      <main className="main">
        {view === 'chat' && <Chat module={module} activeSessionId={activeSessionId} sessionMeta={currentSessionMeta} moduleRunningCount={runningCount} settings={settings} setSettings={setSettings} msgs={moduleMsgs} setMsgs={setMsgs} input={input} setInput={setInput} />}
        {view === 'queue' && <QueueView items={queue} setMsgs={setMsgs} module={module} />}
        {view === 'files' && <Files module={module} settings={settings} queue={queue} />}
        {view === 'notebooklm' && <NotebookLMView module={module} settings={settings} setSettings={setSettings} />}
        {view === 'skills' && <SkillsView module={module} />}
        {view === 'agent' && <AgentView module={module} settings={settings} setSettings={setSettings} />}

        {view === 'settings' && <SettingsView settings={settings} onSaved={setSettings} />}
      </main>
    </div>
  )
}

function Login({ onDone }: { onDone: () => void }) {
  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="logo">K</div>
        <h3>KientreAAA</h3>
        <p>Trợ lý soạn tài liệu giáo dục</p>
        <form className="form" onSubmit={e => { e.preventDefault(); onDone() }}>
          <div className="field"><label>Email</label><input placeholder="email@kientre.vn" defaultValue="anh@kientre.vn" /></div>
          <div className="field"><label>Mật khẩu</label><input type="password" placeholder="••••••••" defaultValue="demo" /></div>
          <button type="submit" className="btn primary" style={{ width: '100%' }}><KeyRound size={16} /> Vào hệ thống</button>
        </form>
        <div className="divider">HOẶC</div>
        <button className="btn secondary" style={{ width: '100%' }} onClick={onDone}>Dùng thử không cần đăng nhập</button>
      </div>
    </div>
  )
}

function ModulePicker({ settings, onPick, onSettings }: { settings: SettingsShape | null; onPick: (k: ModuleKey) => void; onSettings: () => void }) {
  return (
    <div className="picker-wrap">
      <div className="picker-head">
        <div className="brand center"><div className="logo big">K</div></div>
        <h2>Chọn Module</h2>
        <p>Chọn đúng workflow. Cài đặt chung nằm trong Settings; cấu hình riêng nằm ngay trong từng module.</p>
      </div>
      <div className="module-grid">
        {MODULES.map(m => {
          const Icon = m.icon
          return (
            <button key={m.key} className="module-card" onClick={() => onPick(m.key)}>
              <div className="module-icon"><Icon size={26} /></div>
              <div className="module-title">{m.label}</div>
              <div className="module-desc">{m.desc}</div>
              <div className="module-cmd">Skill tự động · {settings?.modules?.[m.key]?.model || 'model mặc định'}</div>
            </button>
          )
        })}
      </div>
      <button className="btn ghost" onClick={onSettings}><Settings size={15} /> Mở cài đặt chung / Google Auth / 9router</button>
    </div>
  )
}

function renderText(text: string) {
  return text.split(/(`[^`]+`)/g).map((p, i) =>
    p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>)
}

function AgentFlow({ current, status, module }: { current?: string; status: RunStatus; module: ModuleKey }) {
  const flow = AGENT_FLOWS[module] || AGENT_FLOWS.topic
  const curIdx = current ? flow.indexOf(current) : -1
  return (
    <div className="agent-flow">
      {flow.map((a, i) => {
        const state = status === 'done' ? 'done' : i < curIdx ? 'done' : i === curIdx ? (status === 'error' ? 'err' : 'active') : 'pending'
        return (
          <div key={a} className="flow-node-wrap">
            <span className={`flow-node ${state}`}>{a}</span>
            {i < flow.length - 1 && <span className={`flow-arrow ${i < curIdx || status === 'done' ? 'passed' : ''}`}>→</span>}
          </div>
        )
      })}
    </div>
  )
}

function Chat({ module, activeSessionId, sessionMeta, moduleRunningCount, settings, setSettings, msgs, setMsgs, input, setInput }: {
  module: ModuleKey
  activeSessionId: string
  sessionMeta: SessionMeta | null
  moduleRunningCount: number
  settings: SettingsShape | null
  setSettings: (s: SettingsShape) => void
  msgs: Msg[]
  setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
}) {
  const cfg = settings?.modules?.[module]
  const [sugs, setSugs] = useState<SlashCommand[]>([])
  const [sugIdx, setSugIdx] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [notebooks, setNotebooks] = useState<any[]>([])
  const [skills, setSkills] = useState<SkillDef[]>([])
  const [notebookStatus, setNotebookStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const [showModuleSettings, setShowModuleSettings] = useState(false)
  const [showNotebookPopup, setShowNotebookPopup] = useState(false)
  const [sessionMemory, setSessionMemory] = useState<SessionMemory | null>(null)
  const [driveInput, setDriveInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const runningCount = moduleRunningCount
  const mod = moduleOf(module)
  const ModuleIcon = mod.icon

  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }) }, [msgs.length])
  useEffect(() => {
    const router = settings?.routerBaseUrl ? `?router=${encodeURIComponent(settings.routerBaseUrl)}` : ''
    fetch('/api/models' + router).then(r => r.json()).then(d => { if (d.ok) setModels(d.models || []) }).catch(() => {})
  }, [settings?.routerBaseUrl])
  useEffect(() => {
    setNotebookStatus('loading')
    fetch('/api/notebooklm?action=list')
      .then(r => r.json())
      .then(d => { if (d.ok) { setNotebooks(d.notebooks || []); setNotebookStatus('ok') } else setNotebookStatus('error') })
      .catch(() => setNotebookStatus('error'))
  }, [])
  useEffect(() => { fetch('/api/skills').then(r => r.json()).then(d => setSkills(d.items || [])).catch(() => {}) }, [])
  useEffect(() => {
    if (!activeSessionId) { setSessionMemory(null); return }
    fetch('/api/session-memory?id=' + encodeURIComponent(activeSessionId))
      .then(r => r.json())
      .then(d => setSessionMemory(d?.ok ? (d.item || null) : null))
      .catch(() => setSessionMemory(null))
  }, [activeSessionId])
  const canonicalDriveFolderUrl = cfg?.driveFolderId ? `https://drive.google.com/drive/folders/${cfg.driveFolderId}` : (cfg?.driveFolderUrl || '')
  useEffect(() => { setDriveInput(canonicalDriveFolderUrl) }, [canonicalDriveFolderUrl])
  useEffect(() => {
    if (!cfg?.driveFolderId || cfg?.driveFolderName) return
    fetch('/api/drive-folder?id=' + encodeURIComponent(cfg.driveFolderId)).then(r => r.json()).then(d => { if (d?.ok && d.name) setModuleField('driveFolderName', d.name as any) }).catch(() => {})
  }, [cfg?.driveFolderId, cfg?.driveFolderName])

  // Update one module config field and persist.
  async function setModuleField<K extends keyof ModuleConfig>(k: K, v: ModuleConfig[K]) {
    if (!settings || !cfg) return
    const next = { ...settings, modules: { ...settings.modules, [module]: { ...cfg, [k]: v } } }
    setSettings(next)
    await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modules: { [module]: { [k]: v } } }) }).catch(() => {})
  }

  async function patchModuleFields(patch: Partial<ModuleConfig>) {
    if (!settings || !cfg) return
    const next = { ...settings, modules: { ...settings.modules, [module]: { ...cfg, ...patch } } }
    setSettings(next)
    await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modules: { [module]: patch } }) }).catch(() => {})
  }

  function updateInput(v: string) {
    setInput(v)
    const firstTok = v.split(/\s+/)[0]
    if (v.startsWith('/') && !v.includes(' ')) { setSugs(suggestCommands(firstTok)); setSugIdx(0) }
    else setSugs([])
  }
  function pickSuggestion(c: SlashCommand) { setInput(c.name + ' '); setSugs([]); taRef.current?.focus() }

  async function runCommand(jobId: string, t: string) {
    const runSettings = { ...settings, module, ...cfg, defaultWorkerModel: cfg?.model, driveFolderId: cfg?.driveFolderId, uploadDrive: cfg?.uploadDrive }
    try {
      const res = await fetch('/api/run', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId, command: t, settings: runSettings }),
      })
      if (!res.body) throw new Error('no stream')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      const patchRun = (fn: (r: Extract<Msg, { role: 'run' }>) => void) => {
        setMsgs(m => m.map(x => { if (x.role !== 'run' || x.id !== jobId) return x; const y = { ...x }; fn(y as any); return y }))
      }
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const events = buf.split('\n\n'); buf = events.pop() ?? ''
        for (const ev of events) {
          const type = ev.match(/^event: (.+)$/m)?.[1]
          const data = ev.match(/^data: (.+)$/m)?.[1]
          if (!type || !data) continue
          const payload = JSON.parse(data)
          if (type === 'log') patchRun(r => { r.logs = [...r.logs, payload.line]; const a = detectAgent(payload.line); if (a) r.agent = a })
          else if (type === 'error') patchRun(r => { r.status = 'error'; r.logs = [...r.logs, '❌ ' + payload.message] })
          else if (type === 'done') patchRun(r => {
            r.status = payload.cancelled ? 'error' : payload.code === 0 ? 'done' : 'error'
            r.created = payload.created || []
            r.outputDir = payload.outputDir || r.outputDir
            r.drive = payload.driveUploads || []
            if (payload.cancelled) r.logs = [...r.logs, '⏹ Đã hủy job']
          })
        }
      }
    } catch (e: any) {
      setMsgs(m => m.map(x => x.role === 'run' && x.id === jobId ? { ...x, status: 'error', logs: [...x.logs, '❌ ' + (e?.message || 'lỗi')] } : x))
    }
  }

  async function runAgentJob(jobId: string, task: string, history: any[], overrideCfg?: ModuleConfig, pendingBotId?: string) {
    const c = overrideCfg || cfg
    const sessionContext = summarizeSessionForAgent(msgs)
    const runningJobs = msgs.filter((m): m is JobMsg => (m.role === 'run' || m.role === 'agent') && m.status === 'running').map(m => ({ id: m.id, module: m.module, task: m.role === 'run' ? m.command : m.task, kind: m.role }))
    const runSettings = { ...settings, module, ...c, sessionContext, runningJobs, defaultWorkerModel: c?.model, driveFolderId: c?.driveFolderId, uploadDrive: c?.uploadDrive }
    const patchAgent = (fn: (r: Extract<Msg, { role: 'agent' }>) => void) => {
      setMsgs(m => m.map(x => { if (x.role !== 'agent' || x.id !== jobId) return x; const y = { ...x, steps: [...x.steps], created: [...x.created] }; fn(y as any); return y }))
    }
    const showAgent = (firstStep?: AgentStep) => {
      setMsgs(m => m.map(x => x.id === pendingBotId ? { id: jobId, role: 'agent', task, module, steps: firstStep ? [firstStep] : [], status: 'running', created: [], outputDir: settings?.outputDir || '', startedAt: Date.now() } as Msg : x))
    }
    try {
      const res = await fetch('/api/agent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jobId, task, moduleKey: module, history, settings: runSettings, sessionId: activeSessionId }) })
      if (!res.body) throw new Error('no stream')
      const reader = res.body.getReader(), dec = new TextDecoder()
      let buf = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += dec.decode(value, { stream: true })
        const events = buf.split('\n\n'); buf = events.pop() ?? ''
        for (const ev of events) {
          const type = ev.match(/^event: (.+)$/m)?.[1]
          const data = ev.match(/^data: (.+)$/m)?.[1]
          if (!type || !data) continue
          const payload = JSON.parse(data)
          if (type === 'agent_step') {
            const step = payload as AgentStep
            if (step.type === 'assistant' && /Intent:\s*chạy flow/i.test(step.text || '')) showAgent(step)
            else if (step.type === 'final' && pendingBotId) {
              setMsgs(m => m.map(x => x.id === pendingBotId ? { id: pendingBotId, role: 'bot', text: step.text || 'Anh muốn em hỗ trợ gì tiếp?' } : x))
            }
            else patchAgent(r => { r.steps = [...r.steps, step]; if (step.type === 'assistant' && /Intent:\s*trả lời chat/i.test(step.text || '')) r.intentOnly = true })
          }
          else if (type === 'log') {
            const line = String(payload.line || '')
            const m = line.match(/^\[model:(request|response|fallback)\]\s+(.*)$/)
            if (!m) continue
            const kind = m[1]
            const data: Record<string, any> = {}
            for (const [, key, raw] of line.matchAll(/(\w+)=((?:"(?:\\.|[^"])*")|\[(?:[^\]]*)\]|\S+)/g)) {
              try { data[key] = JSON.parse(raw) } catch { data[key] = raw }
            }
            const step = kind === 'request'
              ? { type: 'model_request', requested: String(data.requested || ''), sent: data.sent, route: data.route, mode: data.mode, tools: Array.isArray(data.tools) ? data.tools.map(String) : [] } as AgentStep
              : kind === 'response'
                ? { type: 'model_response', requested: String(data.requested || ''), sent: data.sent, responded: data.responded, route: data.route, mode: data.mode, finishReason: data.finishReason } as AgentStep
                : { type: 'model_fallback', primary: String(data.primary || ''), fallbackTo: String(data.fallbackTo || ''), reason: data.reason, mode: data.mode } as AgentStep
            patchAgent(r => { r.steps = [...r.steps, step] })
          }
          else if (type === 'agent_final') {
            let updated = false
            setMsgs(m => m.map(x => { if (x.role === 'agent' && x.id === jobId) { updated = true; return { ...x, finalText: payload.finalText, created: (payload.createdFiles || []).map((p: string) => p.split('/').pop() || p) } } return x.id === pendingBotId ? { id: pendingBotId, role: 'bot', text: payload.finalText || 'Anh muốn em hỗ trợ gì tiếp?' } : x }))
            if (!updated && !pendingBotId) patchAgent(r => { r.finalText = payload.finalText; r.created = (payload.createdFiles || []).map((p: string) => p.split('/').pop() || p) })
            if (activeSessionId) {
              fetch('/api/session-memory?id=' + encodeURIComponent(activeSessionId))
                .then(r => r.json())
                .then(d => setSessionMemory(d?.ok ? (d.item || null) : null))
                .catch(() => {})
            }
          }
          else if (type === 'error') patchAgent(r => { r.status = 'error'; r.steps = [...r.steps, { type: 'error', message: payload.message || 'lỗi agent' }] })
          else if (type === 'done') patchAgent(r => { r.status = payload.code === 0 ? 'done' : 'error'; r.created = payload.created || r.created; r.outputDir = payload.outputDir || r.outputDir; r.drive = payload.driveUploads || r.drive })
        }
      }
    } catch (e: any) {
      patchAgent(r => { r.status = 'error'; r.steps = [...r.steps, { type: 'error', message: e?.message || 'lỗi agent' }] })
    }
  }

  async function send(text: string) {
    const t = text.trim()
    if (!t) return
    setInput(''); setSugs([])
    const linkedNotebookIds = extractNotebookIds(t)
    const visibleRequest = stripNotebookLinks(t)
    const firstRawToken = (visibleRequest || t).trim().split(/\s+/)[0]?.toLowerCase()
    if (['/help', '/es', '/es-help', '/?', '/clear', '/reset', '/new'].includes(firstRawToken)) {
      if (['/clear', '/reset', '/new'].includes(firstRawToken)) { setMsgs([{ id: uid(), role: 'bot', text: 'Đã xoá ngữ cảnh chat.' }]); return }
      setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: helpText() }])
      return
    }
    const memoryChat = /\b(nhớ|nho|đang làm|dang lam|task|việc gì|viec gi|đang thực hiện|dang thuc hien|tiến độ|tien do|trạng thái|trang thai|lúc nãy|luc nay|tiếp tục|tiep tuc|trước đó|truoc do)\b/i.test(t)
    const quickChat = isQuickChat(t)
    const shouldUseAgent = !quickChat && (module === 'quiz' || !!cfg?.agentMode || (/tóm tắt|tom tat|tổng hợp|tong hop/i.test(t) && /notebook|notebooklm|tài liệu|tai lieu|nguồn|nguon/i.test(t)))
    const existingNotebookIds = cfg ? (cfg.selectedNotebookIds?.length ? cfg.selectedNotebookIds : cfg.notebookIds || []) : []
    const mergedNotebookIds = cfg ? Array.from(new Set([...existingNotebookIds, ...linkedNotebookIds])) : linkedNotebookIds
    const agentCfg: ModuleConfig | undefined = cfg ? {
      ...cfg,
      notebookIds: mergedNotebookIds,
      activeNotebookId: cfg.activeNotebookId || linkedNotebookIds[0] || mergedNotebookIds[0],
      enabledTools: Array.from(new Set([...(cfg.enabledTools || []), 'read_notebook', 'read_source', 'finish'])),
      agentMode: true,
    } : cfg
    if (memoryChat) {
      const runningJobs = msgs.filter((m): m is JobMsg => (m.role === 'run' || m.role === 'agent') && m.status === 'running').map(m => ({ id: m.id, module: m.module, task: m.role === 'run' ? m.command : m.task, kind: m.role, status: m.status }))
      const d = await fetch('/api/memory-chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: t, sessionId: activeSessionId, moduleKey: module, runningJobs }) }).then(r => r.json()).catch(() => null)
      setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: d?.reply || 'Em chưa nhớ được gì rõ trong phiên này.' }])
      return
    }
    if (shouldUseAgent) {
      if (linkedNotebookIds.length > 0) {
        const merged = Array.from(new Set([...(cfg?.notebookIds || []), ...linkedNotebookIds]))
        await setModuleField('notebookIds', merged as any)
        await setModuleField('selectedNotebookIds', Array.from(new Set([...(cfg?.selectedNotebookIds || []), ...linkedNotebookIds])) as any)
        if (!cfg?.activeNotebookId) await setModuleField('activeNotebookId', merged[0] as any)
      }
      const task = visibleRequest || t
      const jobId = uid()
      const history = msgs.slice(-10).flatMap(m => {
        if (m.role === 'user') return [{ role: 'user', content: m.text }]
        if (m.role === 'bot') return [{ role: 'assistant', content: m.text }]
        if (m.role === 'agent' && m.finalText) return [{ role: 'assistant', content: m.finalText }]
        return []
      })
      const pendingId = uid()
      setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: pendingId, role: 'bot', text: 'Đang hiểu yêu cầu…' }])
      void runAgentJob(jobId, task, history, agentCfg, pendingId)
      return
    }
    // NotebookLM: link ĐÃ có (cũ) chỉ nạp lại; chỉ link MỚI mới thực sự trích xuất.
    if (linkedNotebookIds.length > 0) {
      const existing = new Set(cfg?.notebookIds || [])
      const newIds = linkedNotebookIds.filter(id => !existing.has(id))
      const oldIds = linkedNotebookIds.filter(id => existing.has(id))
      const merged = Array.from(new Set([...(cfg?.notebookIds || []), ...linkedNotebookIds]))
      await setModuleField('notebookIds', merged as any)
      await setModuleField('selectedNotebookIds', Array.from(new Set([...(cfg?.selectedNotebookIds || []), ...linkedNotebookIds])) as any)
      if (!cfg?.activeNotebookId) await setModuleField('activeNotebookId', (newIds[0] || linkedNotebookIds[0]) as any)
      if ((cfg?.mode || 'detail') !== 'notebook') await setModuleField('mode', 'notebook' as any)
      if (!visibleRequest) {
        const parts: string[] = []
        if (newIds.length) parts.push(`🆕 Đã liên kết & bắt đầu trích xuất ${newIds.length} sổ NotebookLM mới.`)
        if (oldIds.length) parts.push(`♻️ ${oldIds.length} sổ đã có sẵn — chỉ nạp lại, không trích xuất lại.`)
        parts.push('Khi anh nhập yêu cầu, AI sẽ tự lấy nguồn từ NotebookLM; nội dung nguồn không hiện ra chat.')
        setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: parts.join('\n') }])
        return
      }
    }
    const effectiveCfg: ModuleConfig | undefined = cfg ? {
      ...cfg,
      notebookIds: linkedNotebookIds.length ? mergedNotebookIds : existingNotebookIds,
      activeNotebookId: cfg.activeNotebookId || linkedNotebookIds[0] || mergedNotebookIds[0],
      mode: linkedNotebookIds.length ? 'notebook' : cfg.mode,
    } : cfg
    const sourceText = visibleRequest || t
    const finalCommand = sourceText.startsWith('/') ? applyModuleContext(sourceText, effectiveCfg, module) : naturalToCommand(sourceText, module, effectiveCfg, [...msgs].reverse().find((m): m is Extract<Msg, { role: 'upload' }> => m.role === 'upload'))
    if (!finalCommand) {
      const quick = quickChatReply(sourceText, effectiveCfg)
      setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: quick || (moduleOf(module).needsFile ? 'Module này cần tài liệu. Anh tải file lên trước, hoặc dán đường dẫn file rồi nhập yêu cầu tự nhiên.' : 'Em chưa hiểu yêu cầu. Anh mô tả chủ đề muốn soạn/kiểm tra nhé.') }])
      return
    }
    const firstToken = finalCommand.split(/\s+/)[0].toLowerCase()
    if (['/clear', '/reset', '/new'].includes(firstToken)) {
      setMsgs(m => m.filter(x => x.role === 'run' && x.module !== module ? true : x.role === 'run' ? false : false).concat({ id: uid(), role: 'bot', text: 'Đã làm mới. Anh có thể nhập yêu cầu tự nhiên, không cần gõ dấu /.' }))
      return
    }
    if (['/help', '/es', '/es-help', '/?'].includes(firstToken)) {
      setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: helpText() }]); return
    }
    const cmd = findCommand(firstToken)
    if (!cmd) { setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: `Không rõ lệnh \`${firstToken}\`. Gõ \`/help\`.` }]); return }
    const jobId = uid()
    const notebookNote = /--nb\s+\S+/i.test(finalCommand) ? ['📓 NotebookLM đã được gắn vào pipeline. AI sẽ tự lấy và xử lý nguồn; chat chỉ hiển thị tiến trình.'] : []
    setMsgs(m => [...m,
      { id: uid(), role: 'user', text: t },
      { id: jobId, role: 'run', command: finalCommand, module, logs: notebookNote, status: 'running', created: [], outputDir: settings?.outputDir || '', startedAt: Date.now() },
    ])
    void runCommand(jobId, finalCommand)
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('outputDir', settings?.outputDir || '')
      const r = await fetch('/api/upload', { method: 'POST', body: fd })
      const d = await r.json()
      if (d.ok) setMsgs(m => [...m, { id: uid(), role: 'upload', name: d.name, filePath: d.path, grade: cfg?.grade ? `lớp ${cfg.grade}` : detectGradeFromUpload(d.name, d.path) }])
      else setMsgs(m => [...m, { id: uid(), role: 'bot', text: `❌ Upload lỗi: ${d.error || 'không rõ'}` }])
    } catch {
      setMsgs(m => [...m, { id: uid(), role: 'bot', text: '❌ Upload lỗi kết nối.' }])
    } finally { setUploading(false) }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (sugs.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSugIdx(i => (i + 1) % sugs.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSugIdx(i => (i - 1 + sugs.length) % sugs.length); return }
      if (e.key === 'Tab') { e.preventDefault(); pickSuggestion(sugs[sugIdx]); return }
      if (e.key === 'Escape') { setSugs([]); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  const quickExample = () => {
    const g = cfg?.grade || '5', s = cfg?.subject || 'toán'
    if (module === 'topic') return `Soạn chuyên đề phân số lớp ${g} môn ${s}, có ví dụ và bài tập phân tầng`
    if (module === 'quiz') return `Soạn quiz phân số lớp ${g} môn ${s}, ${cfg?.quizCount || 5} quiz, mỗi quiz ${cfg?.quizTotalScore || 10} điểm, ${cfg?.quizTimeMinutes || 35} phút`
    if (module === 'test') return `Soạn đề kiểm tra phân số lớp ${g} môn ${s}, 12 trắc nghiệm, 4 điền đáp án, 3 tự luận`
    if (module === 'solve') return `Giải chi tiết tài liệu vừa tải lên cho lớp ${g} môn ${s}`
    return `Nhận xét tài liệu vừa tải lên cho lớp ${g} môn ${s}, chỉ ra lỗi và cách cải thiện`
  }
  function toggleQuestionType(q: string) {
    const cur = cfg?.questionTypes || ['mc', 'fill', 'essay']
    const next = cur.includes(q) ? cur.filter(x => x !== q) : [...cur, q]
    setModuleField('questionTypes', next as any)
  }
  const moduleSkills = module === 'quiz' ? [] : (MODULE_SKILLS[module] || [])
  const useNotebook = (cfg?.mode || 'detail') === 'notebook'
  const selectedNb = cfg?.selectedNotebookIds?.length ? cfg!.selectedNotebookIds! : (cfg?.notebookIds || [])
  const driveFolderLabel = cfg?.driveFolderName || (cfg?.driveFolderId ? 'Đang nhận diện folder…' : 'Chưa cấu hình Drive')
  const driveCanSave = Boolean(driveInput.trim()) // vẫn cho lưu khi đang lỗi để user sửa link sai như drive.google.cc
  async function saveDriveFolder() {
    const v = driveInput.trim()
    // Normalize: raw ID | /folders/<id> | ?id=<id>. Bắt domain sai (vd drive.google.cc).
    let id = ''
    const m = v.match(/folders\/([A-Za-z0-9_-]+)/) || v.match(/[?&]id=([A-Za-z0-9_-]+)/)
    if (m) {
      if (/^https?:\/\//i.test(v) && !/(^|\.)drive\.google\.com/i.test(v)) {
        await setModuleField('driveFolderName', 'Lỗi: link Drive không hợp lệ (phải là drive.google.com)' as any); return
      }
      id = m[1]
    } else if (/^[A-Za-z0-9_-]{10,}$/.test(v)) {
      id = v // raw folder ID
    } else {
      await setModuleField('driveFolderName', 'Lỗi: cần link https://drive.google.com/drive/folders/<id> hoặc folder ID' as any); return
    }
    const d = await fetch('/api/drive-folder?id=' + encodeURIComponent(id)).then(r => r.json()).catch(() => null)
    if (!d?.ok || !d.name) { await setModuleField('driveFolderName', `Lỗi: không đọc được folder${d?.error ? ' — ' + String(d.error).slice(0, 200) : ''}` as any); return }
    const url = d.webViewLink || `https://drive.google.com/drive/folders/${id}`
    await patchModuleFields({ driveFolderUrl: url, driveFolderId: id, driveFolderName: d.name, uploadDrive: true } as any)
    setDriveInput(url)
  }
  async function toggleUseNotebook() {
    if (useNotebook) await setModuleField('mode', 'detail' as any)
    else { await setModuleField('mode', 'notebook' as any); if (!(cfg?.notebookIds || []).length) setShowNotebookPopup(true) }
  }

  return (
    <>
      <div className="module-hero">
        <div className="module-hero-main">
          <div className="module-hero-icon"><ModuleIcon size={24} /></div>
          <div>
            <div className="eyebrow">Module workspace</div>
            <h2>{mod.label}</h2>
            <div className="sub">{mod.desc} · {cfg?.subject || 'toán'} · lớp {cfg?.grade || '5'} · {MODE_OPTIONS.find(x => x.key === (cfg?.mode || 'detail'))?.label}</div>
            {sessionMeta && <div className="sub">Phiên hiện tại: ctx {sessionMeta.contextChars}/{sessionMeta.contextLimit} · {sessionMeta.contextPct}% · {sessionMeta.count} tin</div>}
          </div>
        </div>
        <div className="module-hero-actions">
          <span className="pill mini"><Terminal size={13} /> {runningCount}</span>
          <div className={`drive-topbar ${driveFolderLabel.startsWith('Lỗi:') ? 'error' : ''}`} title={cfg?.driveFolderId || 'Chưa cấu hình folder Drive'}>
            <div className="drive-topbar-main">
              <Cloud size={15} />
              <div>
                <div className="drive-topbar-label">Drive output</div>
                <div className="drive-topbar-name" title={driveFolderLabel}>{driveFolderLabel}</div>
              </div>
            </div>
            <div className="inline-input-action drive-topbar-input">
              <input value={driveInput} placeholder="Dán link/ID folder" onChange={e => setDriveInput(e.target.value)} />
              <button className="btn primary mini" onClick={saveDriveFolder} disabled={!driveCanSave}>Lưu</button>
            </div>
            <label className="drive-upload-toggle"><input type="checkbox" checked={!!cfg?.uploadDrive} onChange={e => setModuleField('uploadDrive', e.target.checked as any)} /> Upload + Convert Docs</label>
          </div>
          <button className={`btn ${useNotebook ? 'secondary' : 'ghost'}`} onClick={() => setShowNotebookPopup(true)}><NotebookTabs size={16} /> NotebookLM</button>
          <button className="btn ghost" onClick={() => setShowModuleSettings(true)}><SlidersHorizontal size={16} /> Cài đặt module</button>
          <button className="btn ghost mini" onClick={() => setMsgs(m => m.filter(x => !(x.role === 'run' && x.module === module) && x.role !== 'user' && x.role !== 'bot' && x.role !== 'upload'))} title="Xoá chat module này"><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="chat">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {msgs.filter(m => m.role !== 'run' || m.module === module).length === 0 && (
              <div className="chat-empty">
                <h3>{mod.label} 👋</h3>
                <p>{mod.desc}. Nhập yêu cầu tự nhiên, AI sẽ tự chọn đúng skill của module{mod.needsFile ? ', hoặc bấm 📎 để tải tài liệu.' : '.'}</p>
                <div className="suggests">
                  <button className="suggest" onClick={() => setInput(quickExample())}>{quickExample()}</button>
                </div>
              </div>
            )}
            {msgs.filter(m => m.role !== 'run' || m.module === module).map(m => <MsgView key={m.id} msg={m} onRun={send} sessionMemory={sessionMemory} />)}
          </div>
        </div>

        <div className="composer pro-composer">
          {useNotebook && (
            <div className="notebook-bar">
              <label className="nb-toggle"><input type="checkbox" checked={useNotebook} onChange={toggleUseNotebook} /> <NotebookTabs size={14} /> Dùng NotebookLM</label>
              <div className="nb-bar-list">
                {selectedNb.length === 0 ? <span className="nb-empty">Chưa chọn sổ tay — bấm để thêm</span> :
                  selectedNb.map(id => { const nb = notebooks.find(n => n.id === id); return <span key={id} className="nb-bar-chip">{nb?.title || id.slice(0, 8)}</span> })}
              </div>
              <button className="btn ghost mini" onClick={() => setShowNotebookPopup(true)}>Quản lý sổ tay</button>
            </div>
          )}
          <div className="mode-rail grouped-actions composer-actions">
            {moduleSkills.length > 0 && <div className="action-group">
              <span className="group-label">Chức năng {mod.label}</span>
              {moduleSkills.map(m => (
                <button key={m.key} className={`mode-chip ${isSkillActive(cfg, m.patch) ? 'active' : ''}`} onClick={() => patchModuleFields(m.patch)} title={m.desc}>
                  <Sparkles size={13} /> {m.label}
                </button>
              ))}
            </div>}
            {module === 'quiz' && <div className="action-group quick-quiz-settings">
              <span className="group-label">Thiết lập quiz</span>
              <label className="mini-num">Số quiz <input type="number" min={1} max={20} value={cfg?.quizCount || 5} onChange={e => setModuleField('quizCount', Number(e.target.value) as any)} /></label>
              <label className="mini-num">Tổng điểm <input type="number" min={1} max={100} value={cfg?.quizTotalScore || 10} onChange={e => setModuleField('quizTotalScore', Number(e.target.value) as any)} /></label>
              <label className="mini-num">Phút <input type="number" min={5} max={180} value={cfg?.quizTimeMinutes || 35} onChange={e => setModuleField('quizTimeMinutes', Number(e.target.value) as any)} /></label>
            </div>}
            {module === 'test' && <div className="action-group">
              <span className="group-label">Câu hỏi</span>{[
                ['mc','Trắc nghiệm'], ['fill','Điền'], ['essay','Tự luận']
              ].map(([k,label]) => <button key={k} className={`qc-chip ${(cfg?.questionTypes || ['mc','fill','essay']).includes(k) ? 'active' : ''}`} onClick={() => toggleQuestionType(k)} title="Bật/tắt loại câu hỏi này trong đề">{label}</button>)}
            </div>}
          </div>
          <div className="composer-inner" style={{ position: 'relative' }}>
            {sugs.length > 0 && (
              <div className="autocomplete">
                {sugs.map((c, i) => (
                  <button key={c.name} className={`ac-item ${i === sugIdx ? 'active' : ''}`} onMouseDown={e => { e.preventDefault(); pickSuggestion(c) }}>
                    <span className="ac-name">{c.name}</span>
                    <span className="ac-label">{c.label}</span>
                    <span className="ac-usage">{c.usage}</span>
                  </button>
                ))}
              </div>
            )}
            <input ref={fileRef} type="file" accept=".docx,.pdf,.png,.jpg,.jpeg,.txt,.md" style={{ display: 'none' }} onChange={onPickFile} />
            <button className="attach-btn" title="Tải file lên" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <RefreshCw size={18} className="spin" /> : <Paperclip size={18} />}
            </button>
            <textarea
              ref={taRef} value={input} rows={1}
              placeholder={`Nhập yêu cầu tự nhiên… VD: ${quickExample()}`}
              onChange={e => updateInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button className="send-btn" disabled={!input.trim()} onClick={() => send(input)}><Send size={19} /></button>
          </div>
        </div>
      </div>
      {showModuleSettings && cfg && <ModuleSettingsModal module={module} cfg={cfg} setModuleField={setModuleField} models={models} notebooks={notebooks} notebookStatus={notebookStatus} onClose={() => setShowModuleSettings(false)} />}
      {showNotebookPopup && settings && <div className="modal-backdrop" onMouseDown={() => setShowNotebookPopup(false)}><div className="modal notebook-popup" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><h3>NotebookLM Brain</h3><div className="modal-path">Nguồn, sổ tay, tạo quiz/artifact</div></div><button className="icon-btn" onClick={() => setShowNotebookPopup(false)}><X size={18}/></button></div><NotebookLMView module={module} settings={settings} setSettings={setSettings} /></div></div>}
    </>
  )
}

function naturalToCommand(text: string, module: ModuleKey, cfg?: ModuleConfig, lastUpload?: Extract<Msg, { role: 'upload' }>) {
  const cleaned = stripNotebookLinks(text).trim()
  if (!cleaned) return ''
  if (cleaned.startsWith('/')) return applyModuleContext(cleaned, cfg, module)
  const grade = cfg?.grade ? ` lớp ${cfg.grade}` : ''
  const subject = cfg?.subject ? ` ${cfg.subject}` : ''
  if (module === 'topic') return applyModuleContext(`/es-create ${cleaned}${grade}${subject}`, cfg, module)
  if (module === 'test') return applyModuleContext(`/es-test ${cleaned}${grade}${subject}`, cfg, module)
  const fileLike = cleaned.match(/(?:^|\s)((?:\/?[^\s]+|~\/[^\s]+)\.(?:docx|pdf|txt|md|png|jpe?g))(?:\s|$)/i)?.[1]
  const filePath = fileLike || lastUpload?.filePath || ''
  if (!filePath) return ''
  const cmd = module === 'solve' ? '/es-solve' : '/es-review'
  return applyModuleContext(`${cmd} ${quoteArg(filePath)}${grade}${subject}`.replace(/\s{2,}/g, ' ').trim(), cfg, module)
}

// Inject subject/grade/mode and NotebookLM ID from the module config.
function applyModuleContext(command: string, cfg?: ModuleConfig, module?: ModuleKey) {
  if (!cfg) return command
  let out = command.trim()
  const token = (out.split(/\s+/)[0] || '').toLowerCase()
  const isCreate = ['/es-create', '/topic', '/chuyende', '/soan', '/es-compose', '/es-topic'].includes(token)
  const isTest = ['/es-test', '/test', '/es-de', '/de', '/kiemtra'].includes(token)
  const isSolve = ['/es-solve', '/solve', '/es-giai', '/giai'].includes(token)
  const isReview = ['/es-review', '/review', '/es-nhanxet', '/nhanxet'].includes(token)
  if ((isCreate || isTest)) {
    if (cfg.grade && !/l[ớo]p\s*\d/i.test(out)) out += ` lớp ${cfg.grade}`
    if (cfg.subject && !(new RegExp(escapeRe(cfg.subject), 'i')).test(out)) out += ` ${cfg.subject}`
  }
  if ((isSolve || isReview) && cfg.grade && !/l[ớo]p\s*\d/i.test(out)) out += ` lớp ${cfg.grade}`
  if ((isSolve || isReview) && cfg.subject && !(new RegExp(escapeRe(cfg.subject), 'i')).test(out)) out += ` ${cfg.subject}`
  if (isCreate && (cfg.mode === 'summary' || cfg.useSummary) && !/--summary\b/i.test(out)) out += ' --summary'
  const mode = MODE_OPTIONS.find(x => x.key === (cfg.mode || 'detail'))
  const notebookIds = cfg.selectedNotebookIds?.length ? cfg.selectedNotebookIds : cfg.notebookIds || []
  const notebookId = cfg.activeNotebookId || notebookIds[0] || ''
  const special = [mode?.suffix].filter(Boolean).join('\n\n')
  if ((isCreate || isTest) && special && !/--special\b/i.test(out)) out += ' --special ' + quoteArg(special)
  if ((isCreate || isTest) && notebookId && !/--nb\b/i.test(out)) out += ` --nb ${notebookIds.join(',')}`
  return out
}
function quoteArg(value: string) {
  if (!value) return '""'
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
}

function isSkillActive(cfg: ModuleConfig | undefined, patch: Partial<ModuleConfig>) {
  if (!cfg) return false
  return Object.entries(patch).every(([k, v]) => JSON.stringify((cfg as any)[k]) === JSON.stringify(v))
}

function summarizeSessionForAgent(messages: Msg[]) {
  const text = messages.map(m => {
    if (m.role === 'user') return `Người dùng: ${m.text}`
    if (m.role === 'bot') return `Trợ lý: ${m.text}`
    if (m.role === 'agent') return `Agent: ${m.task}${m.finalText ? `\nKết quả: ${m.finalText}` : ''}`
    if (m.role === 'upload') return `File đã nạp: ${m.name}${m.grade ? ` (lớp ${m.grade})` : ''}`
    return ''
  }).filter(Boolean).join('\n')
  const difficultyHits = (text.match(/dễ|vừa|khó|nâng cao|cơ bản|phân hoá|phan hoa|easy|medium|hard/gi) || []).slice(-20)
  return {
    fullText: text.slice(-20000),
    turns: messages.length,
    difficultySignals: difficultyHits,
    balancingRule: 'Dựa trên toàn bộ phiên: nếu người dùng hay sửa vì quá khó thì giảm; nếu yêu cầu nâng cao thì tăng; mặc định cân bằng 30% dễ, 50% vừa, 20% khó và ghi rõ phân tầng.',
  }
}

function NotebookLMView({ module, settings, setSettings }: {
  module: ModuleKey
  settings: SettingsShape | null
  setSettings: (s: SettingsShape) => void
}) {
  const [link, setLink] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [genType, setGenType] = useState('quiz')
  const [genFormat, setGenFormat] = useState('')
  const [genQuantity, setGenQuantity] = useState('standard')
  const [genDifficulty, setGenDifficulty] = useState('medium')
  const [genLength, setGenLength] = useState('default')
  const [genStyle, setGenStyle] = useState('auto')
  const [genOrientation, setGenOrientation] = useState('landscape')
  const [genDetail, setGenDetail] = useState('standard')
  const [jobs, setJobs] = useState<NotebookJob[]>([])
  const [notebooks, setNotebooks] = useState<any[]>([])
  const [notebookStatus, setNotebookStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle')
  const cfg = settings?.modules?.[module] || ({} as ModuleConfig)
  const ids = cfg.notebookIds || []
  const selectedIds = cfg.selectedNotebookIds?.length ? cfg.selectedNotebookIds : ids
  const active = cfg.activeNotebookId || ids[0] || ''
  const jobKey = `kientre.notebookJobs.${module}`
  useEffect(() => {
    setNotebookStatus('loading')
    fetch('/api/notebooklm?action=list').then(r => r.json()).then(d => { if (d.ok) { setNotebooks(d.notebooks || []); setNotebookStatus('ok') } else setNotebookStatus('error') }).catch(() => setNotebookStatus('error'))
  }, [])
  useEffect(() => { try { setJobs(JSON.parse(localStorage.getItem(jobKey) || '[]')) } catch {} }, [jobKey])
  useEffect(() => { try { localStorage.setItem(jobKey, JSON.stringify(jobs.slice(0, 20))) } catch {} }, [jobs, jobKey])
  async function setModuleField<K extends keyof ModuleConfig>(k: K, v: ModuleConfig[K]) {
    if (!settings) return
    const next = { ...settings, modules: { ...settings.modules, [module]: { ...cfg, [k]: v } } }
    setSettings(next)
    await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modules: { [module]: { [k]: v } } }) }).catch(() => null)
  }
  async function addNotebook() {
    const found = extractNotebookIds(link)
    if (!found.length) { setMsg('Link NotebookLM chưa đúng dạng /notebook/<id>'); return }
    const fresh = found.filter(id => !ids.includes(id))
    const next = Array.from(new Set([...ids, ...found]))
    await setModuleField('notebookIds', next as any)
    await setModuleField('selectedNotebookIds', Array.from(new Set([...selectedIds, ...found])) as any)
    await setModuleField('activeNotebookId', (active || next[0]) as any)
    await setModuleField('mode', 'notebook' as any)
    setLink(''); setMsg(fresh.length ? `Đã thêm ${fresh.length} sổ tay mới. Tổng: ${next.length}` : 'Sổ tay này đã có, chỉ chọn lại để dùng.')
  }
  async function removeNotebook(id: string) {
    const next = ids.filter(x => x !== id)
    await setModuleField('notebookIds', next as any)
    await setModuleField('selectedNotebookIds', selectedIds.filter(x => x !== id) as any)
    if (active === id) await setModuleField('activeNotebookId', (next[0] || '') as any)
  }
  async function toggleSelectedNotebook(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]
    await setModuleField('selectedNotebookIds', next as any)
    if (!active && next[0]) await setModuleField('activeNotebookId', next[0] as any)
  }
  async function generate() {
    const chosen = selectedIds.length ? selectedIds : active ? [active] : []
    if (!chosen.length) { setMsg('Chưa chọn sổ tay NotebookLM'); return }
    const job: NotebookJob = { id: uid(), type: genType, notebookIds: chosen, status: 'running', message: `Đang tạo ${genType}…`, startedAt: Date.now() }
    setJobs(x => [job, ...x])
    const payload: any = { action: `generate-${genType}`, notebookId: chosen[0], notebookIds: chosen, sources: chosen, wait: true, description: 'Tạo nội dung giáo dục phù hợp với session hiện tại', language: 'vi' }
    if (genFormat) payload.format = genFormat
    if (['quiz','flashcards'].includes(genType)) { payload.quantity = genQuantity; payload.difficulty = genDifficulty }
    if (['audio','video','slide-deck'].includes(genType)) payload.length = genLength
    if (genType === 'video') payload.style = genStyle
    if (genType === 'infographic') { payload.orientation = genOrientation; payload.detail = genDetail; payload.style = genStyle }
    if (genType === 'mind-map') payload.kind = genFormat || 'interactive'
    setBusy(true); setMsg(job.message)
    const d = await fetch('/api/notebooklm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json()).catch(e => ({ ok:false, error:e.message }))
    const message = d.ok ? `${genType} tạo xong` : `${genType} lỗi: ${d.error || JSON.stringify(d)}`
    setJobs(x => x.map(j => j.id === job.id ? { ...j, status: d.ok ? 'done' : 'error', message } : j))
    setMsg(message)
    setBusy(false)
  }
  return <section className="panel notebook-tab">
    <div className="panel-head"><h3><NotebookTabs size={20}/> NotebookLM Brain</h3><p>NotebookLM là bộ não của module. Sổ tay được lưu tích luỹ, dùng xuyên các session; có thể xoá bớt khi không cần.</p></div>
    <div className="module-section">
      <div className="section-title"><Link2 size={15}/> Thêm sổ tay NotebookLM</div>
      <div className="link-notebook-row"><input value={link} onChange={e=>setLink(e.target.value)} placeholder="https://notebooklm.google.com/notebook/d06809a7-8233-4231-babe-4f39584319d7"/><button className="btn secondary mini" onClick={addNotebook} disabled={!link.trim()}>Thêm sổ tay</button></div>
      {notebookStatus === 'error' && <p className="err-text">Chưa kết nối NotebookLM hoặc cookie hết hạn.</p>}
      <div className="notebook-list">
        {ids.map(id => { const nb = notebooks.find(n => n.id === id) || { id, title: id }; return <div key={id} className="notebook-row selectable">
          <label className="notebook-check"><input type="checkbox" checked={selectedIds.includes(id)} onChange={() => toggleSelectedNotebook(id)} /> <span><b>{nb.title}</b><small>{id}</small></span></label>
          <button className={`mini-select ${active===id?'active':''}`} onClick={()=>setModuleField('activeNotebookId', id as any)}>Dùng</button>
          <button className="mini-select danger" onClick={()=>removeNotebook(id)}>Xoá</button>
        </div> })}
      </div>
    </div>
    <div className="module-section">
      <div className="section-title"><Sparkles size={15}/> Artifact đầy đủ</div>
      <div className="nb-gen-grid">
        <div className="field"><label>Loại nội dung</label><select value={genType} onChange={e=>{setGenType(e.target.value); setGenFormat('')}}><option value="audio">Audio Overview (MP3)</option><option value="video">Video Overview (MP4)</option><option value="cinematic-video">Cinematic Video (MP4)</option><option value="slide-deck">Slide Deck (PDF/PPTX)</option><option value="infographic">Infographic (PNG)</option><option value="quiz">Quiz (JSON/MD/HTML)</option><option value="flashcards">Flashcards (JSON/MD/HTML)</option><option value="report">Report (Markdown)</option><option value="data-table">Data Table (CSV)</option><option value="mind-map">Mind Map (JSON)</option></select></div>
        <div className="field"><label>Format</label><select value={genFormat} onChange={e=>setGenFormat(e.target.value)}><option value="">Mặc định</option>{genType==='audio'&&<><option value="deep-dive">deep-dive</option><option value="brief">brief</option><option value="critique">critique</option><option value="debate">debate</option></>}{genType==='video'&&<><option value="explainer">explainer</option><option value="brief">brief</option><option value="cinematic">cinematic</option></>}{genType==='slide-deck'&&<><option value="detailed">detailed</option><option value="presenter">presenter</option></>}{genType==='report'&&<><option value="briefing-doc">briefing-doc</option><option value="study-guide">study-guide</option><option value="blog-post">blog-post</option><option value="custom">custom</option></>}{genType==='mind-map'&&<><option value="interactive">interactive</option><option value="note-backed">note-backed</option></>}</select></div>
        <div className="field"><label>Số lượng</label><select value={genQuantity} onChange={e=>setGenQuantity(e.target.value)}><option value="fewer">Ít</option><option value="standard">Chuẩn</option><option value="more">Nhiều</option></select></div>
        <div className="field"><label>Độ khó cân bằng</label><select value={genDifficulty} onChange={e=>setGenDifficulty(e.target.value)}><option value="easy">Dễ</option><option value="medium">Vừa</option><option value="hard">Khó</option></select></div>
        <div className="field"><label>Độ dài</label><select value={genLength} onChange={e=>setGenLength(e.target.value)}><option value="short">Ngắn</option><option value="default">Chuẩn</option><option value="long">Dài</option></select></div>
        <div className="field"><label>Style</label><select value={genStyle} onChange={e=>setGenStyle(e.target.value)}><option value="auto">auto</option><option value="classic">classic</option><option value="whiteboard">whiteboard</option><option value="kawaii">kawaii</option><option value="anime">anime</option><option value="watercolor">watercolor</option><option value="professional">professional</option><option value="bento-grid">bento-grid</option></select></div>
        <div className="field"><label>Infographic</label><select value={genOrientation} onChange={e=>setGenOrientation(e.target.value)}><option value="landscape">landscape</option><option value="portrait">portrait</option><option value="square">square</option></select></div>
        <div className="field"><label>Chi tiết</label><select value={genDetail} onChange={e=>setGenDetail(e.target.value)}><option value="concise">concise</option><option value="standard">standard</option><option value="detailed">detailed</option></select></div>
      </div>
      <button className="btn secondary mini" disabled={!selectedIds.length || busy} onClick={generate}>Tạo bằng NotebookLM ({selectedIds.length} sổ)</button>
    </div>
    <div className="module-section">
      <div className="section-title"><FileStack size={15}/> Hàng đợi NotebookLM</div>
      {jobs.length === 0 ? <p className="desc">Chưa có job NotebookLM.</p> : jobs.map(j => <div key={j.id} className="job-row"><span className={`status ${j.status === 'done' ? 'ok' : j.status === 'error' ? 'err' : 'run'}`}>{j.status === 'running' ? 'Đang chạy' : j.status === 'done' ? 'Xong' : 'Lỗi'}</span><b>{j.type}</b><small>{j.notebookIds.length} sổ · {new Date(j.startedAt).toLocaleString('vi-VN')}</small><span>{j.message}</span></div>)}
    </div>
    {msg && <div className="saved-note">{msg}</div>}
  </section>
}

function ModuleSettingsModal({ module, cfg, setModuleField, models, notebooks, notebookStatus, onClose }: {
  module: ModuleKey
  cfg: ModuleConfig
  setModuleField: <K extends keyof ModuleConfig>(k: K, v: ModuleConfig[K]) => Promise<void>
  models: string[]
  notebooks: any[]
  notebookStatus: 'idle' | 'loading' | 'ok' | 'error'
  onClose: () => void
}) {
  const mod = moduleOf(module)
  const subjects = Array.from(new Set([...SUBJECTS, ...(cfg.customSubjects || []), cfg.subject || 'toán']))
  const [newSubject, setNewSubject] = useState('')
  const [notebookLink, setNotebookLink] = useState('')
  const [url, setUrl] = useState('')
  const [textTitle, setTextTitle] = useState('')
  const [textBody, setTextBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [genType, setGenType] = useState('quiz')
  const [genFormat, setGenFormat] = useState('')
  const [genQuantity, setGenQuantity] = useState('standard')
  const [genDifficulty, setGenDifficulty] = useState('medium')
  const [genLength, setGenLength] = useState('default')
  const [genStyle, setGenStyle] = useState('auto')
  const [genOrientation, setGenOrientation] = useState('landscape')
  const [genDetail, setGenDetail] = useState('standard')
  const activeNotebook = cfg.activeNotebookId || cfg.notebookIds?.[0] || ''
  const selected = new Set(cfg.notebookIds || [])
  const allTools = ['read_source', 'read_notebook', 'analyze_document', 'web_search', 'write_docx', 'run_skill', 'finish']
  function toggleTool(name: string) {
    const cur = cfg.enabledTools || allTools
    const next = cur.includes(name) ? cur.filter(x => x !== name) : [...cur, name]
    setModuleField('enabledTools', next as any)
  }
  async function addSubject() {
    const v = newSubject.trim().toLowerCase()
    if (!v) return
    await setModuleField('customSubjects', Array.from(new Set([...(cfg.customSubjects || []), v])) as any)
    await setModuleField('subject', v as any)
    setNewSubject('')
  }
  async function toggleNotebook(id: string, checked: boolean) {
    const next = checked ? Array.from(new Set([...(cfg.notebookIds || []), id])) : (cfg.notebookIds || []).filter(x => x !== id)
    await setModuleField('notebookIds', next as any)
    if (!cfg.activeNotebookId && next[0]) await setModuleField('activeNotebookId', next[0] as any)
  }
  async function linkNotebookFromUrl() {
    const ids = extractNotebookIds(notebookLink)
    if (!ids.length) { setMsg('Lỗi: link NotebookLM chưa đúng dạng /notebook/<id>'); return }
    const next = Array.from(new Set([...(cfg.notebookIds || []), ...ids]))
    await setModuleField('notebookIds', next as any)
    await setModuleField('activeNotebookId', (cfg.activeNotebookId || next[0]) as any)
    await setModuleField('mode', 'notebook' as any)
    setNotebookLink('')
    setMsg(`✓ Đã liên kết ${ids.length} sổ tay NotebookLM cho module này`)
  }
  async function importUrl() {
    if (!activeNotebook || !url.trim()) return
    setBusy(true); setMsg('Đang import URL vào NotebookLM…')
    const d = await fetch('/api/notebooklm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add-url', notebookId: activeNotebook, url: url.trim() }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
    setMsg(d.ok ? '✓ Đã import URL vào NotebookLM' : `Lỗi: ${d.error || 'không import được'}`)
    if (d.ok) setUrl('')
    setBusy(false)
  }
  async function importText() {
    if (!activeNotebook || !textTitle.trim() || !textBody.trim()) return
    setBusy(true); setMsg('Đang import text vào NotebookLM…')
    const d = await fetch('/api/notebooklm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add-text', notebookId: activeNotebook, title: textTitle.trim(), text: textBody }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
    setMsg(d.ok ? '✓ Đã import text vào NotebookLM' : `Lỗi: ${d.error || 'không import được'}`)
    if (d.ok) { setTextTitle(''); setTextBody('') }
    setBusy(false)
  }

  function promptFor(kind: string): string {
    const prompts: Record<string, string> = {
      quiz:       'Tạo 10 câu trắc nghiệm, 5 câu điền, 3 câu tự luận dựa trên nguồn',
      flashcards: 'Tạo 20 lá flashcard từ định nghĩa và ví dụ',
      audio:      'Tạo podcast tóm tắt nội dung chính, phong cách giải thích',
      report:     'Viết báo cáo tóm tắt kiến thức cần biết',
      slideDeck:  'Tạo 10 slide bài giảng minh hoạ nội dung',
      mindMap:    'Tạo mind-map chi tiết (cấu trúc, nhãn, quan hệ)',
    }
    return prompts[kind] || 'Tạo nội dung mới'
  }

  async function quickGenerate(kind = genType) {
    if (!activeNotebook) { setMsg('Chưa có NotebookLM active'); return }
    const desc = promptFor(kind)
    const payload: any = { action: `generate-${kind}`, notebookId: activeNotebook, description: desc, wait: true, language: 'vi' }
    if (genFormat) payload.format = genFormat
    if (['quiz', 'flashcards'].includes(kind)) { payload.quantity = genQuantity; payload.difficulty = genDifficulty }
    if (['audio', 'video', 'slide-deck'].includes(kind)) payload.length = genLength
    if (kind === 'video') payload.style = genStyle
    if (kind === 'infographic') { payload.orientation = genOrientation; payload.detail = genDetail; payload.style = genStyle }
    if (kind === 'mind-map') payload.kind = genFormat || 'interactive'
    setBusy(true); setMsg(`Đang tạo ${kind}…`)
    const d = await fetch('/api/notebooklm', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
    setMsg(d.ok ? `✓ ${kind} tạo xong. Vào "Artifact" để tải/xuất.` : `❌ ${kind} lỗi: ${d.error || 'không xác định'}`)
    setBusy(false)
  }
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal module-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>Cài đặt module: {mod.label}</h3><div className="modal-path">Chỉ áp dụng cho module này</div></div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="module-modal-body">
          <div className="module-config-grid">
            <div className="field"><label>Môn</label><select value={cfg.subject || 'toán'} onChange={e => setModuleField('subject', e.target.value as any)}>{subjects.map(s => <option key={s} value={s}>{s[0]?.toUpperCase() + s.slice(1)}</option>)}</select></div>
            <div className="field add-subject"><label>Thêm môn</label><div className="inline-input-action"><input value={newSubject} placeholder="VD: lịch sử" onChange={e => setNewSubject(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSubject() }} /><button className="btn ghost mini" onClick={addSubject} disabled={!newSubject.trim()}>Thêm</button></div></div>
            <div className="field"><label>Lớp</label><select value={cfg.grade || '5'} onChange={e => setModuleField('grade', e.target.value as any)}>{['1','2','3','4','5','6','7','8','9'].map(g => <option key={g} value={g}>Lớp {g}</option>)}</select></div>
            <div className="field wide"><label>Model</label><select value={cfg.model || ''} onChange={e => setModuleField('model', e.target.value as any)}>{cfg.model && !models.includes(cfg.model) && <option value={cfg.model}>{cfg.model}</option>}{models.map(m => <option key={m} value={m}>{m}</option>)}</select></div>
            <div className="field wide"><label>Folder Drive output</label><input value={cfg.driveFolderUrl || cfg.driveFolderId || ''} placeholder="https://drive.google.com/drive/folders/..." onChange={e => { const v = e.target.value; const id = v.match(/folders\/([A-Za-z0-9_-]+)/)?.[1] || v.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1] || v.trim(); setModuleField('driveFolderUrl', v as any); setModuleField('driveFolderId', id as any); setModuleField('driveFolderName', '' as any) }} /></div>
            <label className="check-row inline"><input type="checkbox" checked={!!cfg.uploadDrive} onChange={e => setModuleField('uploadDrive', e.target.checked as any)} /> Upload .docx lên Drive + convert Google Docs</label>
          </div>

          <div className="module-section">
            <div className="section-title"><Bot size={15} /> Chế độ trợ lý (agent) của module</div>
            <p className="desc">Agent mode tự chọn sub-agent phù hợp theo task: Intent, Architect, Examiner, Solver, Judge, Student, Reviewer, VisualCurator, Artist. Anh chỉ cần set model trong tab Agent.</p>
            <label className="check-row inline"><input type="checkbox" checked={!!cfg.agentMode} onChange={e => setModuleField('agentMode', e.target.checked as any)} /> Bật chế độ trợ lý tự làm (agent) cho module này</label>
            <div className="row2">
              <div className="field"><label>Số bước tối đa <span className="hint-inline">(giới hạn để không chạy quá lâu)</span></label><input type="number" min={1} max={24} value={cfg.maxTurns || 12} onChange={e => setModuleField('maxTurns', Number(e.target.value) as any)} /></div>
              <label className="check-row inline"><input type="checkbox" checked={cfg.useSources !== false} onChange={e => setModuleField('useSources', e.target.checked as any)} /> Cho phép dùng tài liệu Nguồn đã nạp</label>
            </div>
            <div className="field"><label>Vai trò của trợ lý <span className="hint-inline">(trợ lý sẽ đóng vai này)</span></label><textarea value={cfg.persona || ''} placeholder="VD: Bạn là giáo viên Toán tiểu học, soạn tài liệu rõ ràng, kiểm tra kỹ đáp án." onChange={e => setModuleField('persona', e.target.value as any)} /></div>
            <div className="field"><label>Quy tắc riêng <span className="hint-inline">(điều module này luôn phải làm)</span></label><textarea value={cfg.systemPrompt || ''} placeholder="VD: Luôn có đáp án chi tiết; luôn bám sát chương trình lớp đã chọn; không dùng từ khó." onChange={e => setModuleField('systemPrompt', e.target.value as any)} /></div>
            <div className="tool-summary">Tool chọn tự động theo task: đọc nguồn, NotebookLM, phân tích file, tìm web, xuất Word, chạy quy trình có sẵn.</div>
          </div>

          <div className="module-section compact-note">
            <div className="section-title"><NotebookTabs size={15} /> NotebookLM Brain</div>
            <p className="desc">Nhập link, quản lý sổ tay và tạo quiz/artifact ở popup NotebookLM cạnh thanh nhập liệu.</p>
          </div>

          <div className="module-section">
            <div className="section-title"><Shield size={15} /> Quyền truy cập &amp; định nghĩa module</div>
            <p className="desc">Quyền dùng module: <b>public</b> (ai cũng dùng), <b>restricted</b> (chỉ user đăng nhập), <b>private</b> (chỉ admin).</p>
            <div className="field"><label>Quyền truy cập</label>
              <select value={cfg.access || 'public'} onChange={e => setModuleField('access', e.target.value as any)}>
                <option value="public">Public – Mọi người dùng</option>
                <option value="restricted">Restricted – Cần đăng nhập</option>
                <option value="private">Private – Chỉ admin</option>
              </select>
            </div>
            <div className="field"><label>Định nghĩa module (mô tả cho người dùng)</label>
              <textarea value={cfg.definition || ''} placeholder="VD: Soạn đề kiểm tra trắc nghiệm, điền đáp án, tự luận; có thể dùng NotebookLM làm nguồn." onChange={e => setModuleField('definition', e.target.value as any)} />
            </div>
          </div>

          {msg && <div className="saved-note">{msg}</div>}
        </div>
      </div>
    </div>
  )
}

// Map một tool/assistant text sang tên sub-agent để tô sáng trên thanh process.
const AGENT_TOOL_HINT: [RegExp, string][] = [
  [/web_search|source|nguồn/i, 'Source/NotebookLM'],
  [/read_notebook|notebook/i, 'Source/NotebookLM'],
  [/analyze_document|read_source|đọc|extract/i, 'Read/Extract'],
  [/quizplanner|khung|bảng khung/i, 'QuizPlanner'],
  [/exam|examiner|câu \d+|soạn từng câu|đề kiểm tra/i, 'Examiner'],
  [/solve|giải/i, 'Solver'],
  [/student|thời gian|học sinh/i, 'Student'],
  [/judge|kiểm|thẩm định/i, 'Judge'],
  [/visual|hình/i, 'VisualCurator'],
  [/artist|tikz|vẽ/i, 'Artist'],
  [/review|nhận xét/i, 'Reviewer'],
  [/write_docx|word|xuất file/i, 'Word'],
  [/architect|khung|dàn ý/i, 'Architect'],
  [/intent|ý định/i, 'Intent'],
]
// Suy ra agent hiện tại từ danh sách step (lấy hint gần nhất).
function currentAgentFromSteps(steps: AgentStep[]): string {
  const sawRunSkill = steps.some(s => s.type === 'tool_call' && s.name === 'run_skill')
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]
    const txt = s.type === 'tool_call' ? s.name : s.type === 'assistant' ? s.text : s.type === 'tool_result' ? s.brief : ''
    if (!txt) continue
    if (sawRunSkill && /^Intent:/i.test(txt)) continue
    for (const [re, a] of AGENT_TOOL_HINT) if (re.test(txt)) return a
  }
  return 'Intent'
}
function currentAgentText(steps: AgentStep[]): string {
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]
    if (s.type === 'assistant' && s.text && !/^Intent:/i.test(s.text)) return s.text
    if (s.type === 'final' && s.text) return s.text
  }
  return ''
}
function modelLabel(step: Extract<AgentStep, { type: 'model_request' | 'model_response' | 'model_fallback' }>) {
  if (step.type === 'model_request') return `REQ ${step.requested}${step.sent && step.sent !== step.requested ? ` → ${step.sent}` : ''}${step.route ? ` @ ${step.route}` : ''}`
  if (step.type === 'model_response') return `RES ${step.responded || step.sent || step.requested}${step.requested && step.responded && step.requested !== step.responded ? ` (req ${step.requested})` : ''}`
  return `FB ${step.primary} → ${step.fallbackTo}${step.reason ? ` · ${step.reason}` : ''}`
}
function latestModelSummary(steps: AgentStep[]) {
  let requested = ''
  let responded = ''
  let fallback = ''
  for (let i = steps.length - 1; i >= 0; i--) {
    const s = steps[i]
    if (!responded && s.type === 'model_response') responded = s.responded || s.sent || s.requested
    if (!requested && s.type === 'model_request') requested = s.requested
    if (!fallback && s.type === 'model_fallback') fallback = `${s.primary} → ${s.fallbackTo}`
    if (requested && responded && fallback) break
  }
  return { requested, responded, fallback }
}
function agentTerminalLines(msg: Extract<Msg, { role: 'agent' }>): string[] {
  return msg.steps.map(s => {
    if (s.type === 'assistant') return s.text
    if (s.type === 'turn') return `turn ${s.turn}/${s.maxTurns}`
    if (s.type === 'tool_call') return `▶ ${s.name} ${JSON.stringify(s.args || {})}`
    if (s.type === 'tool_result') return `${s.ok ? '✓' : '✗'} ${s.name}: ${s.brief}`
    if (s.type === 'model_request' || s.type === 'model_response' || s.type === 'model_fallback') return modelLabel(s)
    if (s.type === 'error') return `ERR ${s.message}`
    if (s.type === 'final') return `FINAL ${s.text}`
    return ''
  }).filter(Boolean)
}
// Thanh process ngang: hiển thị chuỗi sub-agent, tô sáng agent đang chạy.
function AgentProgressBar({ steps, status, flow }: { steps: AgentStep[]; status: RunStatus; flow: string[] }) {
  const cur = status === 'done' ? flow[flow.length - 1] : currentAgentFromSteps(steps)
  const curIdx = flow.indexOf(cur)
  return (
    <div className="proc-bar">
      {flow.map((a, i) => {
        const state = status === 'done' ? 'done' : status === 'error' && i === curIdx ? 'err' : i < curIdx ? 'done' : i === curIdx ? 'active' : 'pending'
        return (
          <div key={a} className="proc-node-wrap">
            <span className={`proc-node ${state}`}>{a}</span>
            {i < flow.length - 1 && <span className={`proc-line ${i < curIdx || status === 'done' ? 'passed' : ''}`} />}
          </div>
        )
      })}
    </div>
  )
}
function MsgView({ msg, onRun, sessionMemory }: { msg: Msg; onRun: (t: string) => void; sessionMemory?: SessionMemory | null }) {
  if (msg.role === 'upload') return <UploadMsg msg={msg} onRun={onRun} />
  if (msg.role === 'agent') {
    const flow = AGENT_FLOWS[msg.module] || AGENT_FLOWS.topic
    const modelInfo = latestModelSummary(msg.steps)
    if (msg.intentOnly) return (
      <div className="msg bot">
        <div className="avatar bot"><Bot size={17} /></div>
        <div className="bubble">{renderText(msg.finalText || currentAgentText(msg.steps) || 'Anh muốn em hỗ trợ gì tiếp?')}</div>
      </div>
    )
    return (
      <div className="msg bot">
        <div className="avatar bot"><Bot size={17} /></div>
        <div className="bubble run-bubble">
          <div className="run-head redesigned">
            <div className="run-command" title={msg.task}>{msg.task}</div>
            <span className={`status ${msg.status === 'done' ? 'ok' : msg.status === 'error' ? 'err' : 'run'}`}>{msg.status === 'done' ? 'Hoàn tất' : msg.status === 'error' ? 'Lỗi' : 'Đang xử lý…'}</span>
          </div>
          {(modelInfo.requested || modelInfo.responded || modelInfo.fallback) && <div className="agent-model-strip">{modelInfo.requested ? `Yêu cầu: ${modelInfo.requested}` : ''}{modelInfo.responded ? ` · Phản hồi: ${modelInfo.responded}` : ''}{modelInfo.fallback ? ` · Fallback: ${modelInfo.fallback}` : ''}</div>}
          {sessionMemory?.summary && <div className="agent-session-strip">Nhớ phiên: {sessionMemory.summary.slice(0, 220)}{sessionMemory.summary.length > 220 ? '…' : ''}</div>}
          <AgentProgressBar steps={msg.steps} status={msg.status} flow={flow} />
          <pre className="run-log agent-inline-log">{agentTerminalLines(msg).slice(-160).join('\n')}</pre>
          {msg.status === 'error' && (() => { const err = msg.steps.filter(s => s.type === 'error') as Extract<AgentStep, { type: 'error' }>[]; return <div className="proc-err">{err.length ? err[err.length - 1].message : 'Có lỗi khi chạy.'} <button className="btn ghost mini" onClick={() => onRun(msg.task)}><RefreshCw size={13} /> Thử lại</button></div> })()}
          {msg.finalText && msg.status !== 'error' && <div className="agent-final"><div className="agent-final-title">Kết luận</div>{renderText(msg.finalText)}</div>}
          {msg.status !== 'running' && msg.drive && msg.drive.length > 0 && (
            <div className="drive-links">
              <div className="created-title">☁️ Trên Google Drive:</div>
              {msg.drive.map((u, i) => (
                <div key={i} className="drive-item">
                  <span className="drive-name">{u.name}</span>
                  {u.gdocLink && <a className="file-link" href={u.gdocLink} target="_blank" rel="noreferrer"><FileText size={13} /> Google Docs</a>}
                  {!u.gdocLink && u.gdocError && <span className="warn-inline">⚠️ Chưa convert được Google Docs</span>}
                  {(u.docxDownloadLink || u.docxLink) && <a className="file-link" href={u.docxDownloadLink || u.docxLink} target="_blank" rel="noreferrer"><Download size={13} /> .docx</a>}
                  {!u.gdocLink && u.docxViewLink && <a className="file-link" href={u.docxViewLink} target="_blank" rel="noreferrer"><FileText size={13} /> Xem trên Drive</a>}
                </div>
              ))}
            </div>
          )}
          {msg.status !== 'running' && msg.created.length > 0 && (
            <div className="created"><div className="created-title">📄 File kết quả:</div>{msg.created.map(name => <a key={name} className="file-link" href={fileUrl(msg.outputDir, 'download', name)}><Download size={14} /> {name}</a>)}</div>
          )}
        </div>
      </div>
    )
  }
  if (msg.role === 'run') {
    return (
      <div className="msg bot">
        <div className="avatar bot"><Terminal size={17} /></div>
        <div className="bubble run-bubble">
          <div className="run-head redesigned">
            <div className="run-command" title={msg.command}>{msg.command}</div>
            <span className={`status ${msg.status === 'done' ? 'ok' : msg.status === 'error' ? 'err' : 'run'}`}>{msg.status === 'done' ? 'Hoàn tất' : msg.status === 'error' ? 'Lỗi' : 'Đang chạy…'}</span>
          </div>
          <AgentFlow current={msg.agent} status={msg.status} module={msg.module} />
          {msg.status === 'error' && (
            <div className="error-card">
              <div className="error-title">Không chạy được job</div>
              <div className="error-line" title={lastErrorLine(msg.logs)}>{lastErrorLine(msg.logs)}</div>
              <button className="btn ghost mini" onClick={() => onRun(msg.command)}><RefreshCw size={13} /> Thử lại</button>
            </div>
          )}
          {msg.logs.length > 0 && <pre className="run-log compact">{msg.logs.slice(-40).join('\n')}</pre>}
          {msg.status !== 'running' && msg.drive && msg.drive.length > 0 && (
            <div className="drive-links">
              <div className="created-title">☁️ Trên Google Drive:</div>
              {msg.drive.map((u, i) => (
                <div key={i} className="drive-item">
                  <span className="drive-name">{u.name}</span>
                  {u.gdocLink && <a className="file-link" href={u.gdocLink} target="_blank" rel="noreferrer"><FileText size={13} /> Google Docs</a>}
                  {!u.gdocLink && u.gdocError && <span className="warn-inline">⚠️ Chưa convert được Google Docs</span>}
                  {(u.docxDownloadLink || u.docxLink) && <a className="file-link" href={u.docxDownloadLink || u.docxLink} target="_blank" rel="noreferrer"><Download size={13} /> .docx</a>}
                  {!u.gdocLink && u.docxViewLink && <a className="file-link" href={u.docxViewLink} target="_blank" rel="noreferrer"><FileText size={13} /> Xem trên Drive</a>}
                </div>
              ))}
            </div>
          )}
          {msg.status !== 'running' && (!msg.drive || msg.drive.length === 0) && (
            msg.created.length > 0 ? (
              <div className="created">
                <div className="created-title">📄 File kết quả (local):</div>
                {msg.created.map(name => (
                  <a key={name} className="file-link" href={fileUrl(msg.outputDir, 'download', name)}><Download size={14} /> {name}</a>
                ))}
              </div>
            ) : msg.status === 'done' ? <div className="created-empty">Xong. Chưa phát hiện file mới (có thể engine ghi vào thư mục con), hoặc đã bật Drive nhưng chưa có .docx.</div> : null
          )}
        </div>
      </div>
    )
  }
  return (
    <div className={`msg ${msg.role}`}>
      <div className={`avatar ${msg.role === 'bot' ? 'bot' : 'user'}`}>{msg.role === 'bot' ? <Bot size={17} /> : <User size={17} />}</div>
      <div className="bubble">{renderText(msg.text)}</div>
    </div>
  )
}

function UploadMsg({ msg, onRun }: { msg: Extract<Msg, { role: 'upload' }>; onRun: (t: string) => void }) {
  const [grade, setGrade] = useState(msg.grade || detectGradeFromUpload(msg.name, msg.filePath))
  const [sourceMsg, setSourceMsg] = useState('')
  const gradeText = normalizeGrade(grade)
  const gradeListId = `grade-options-${msg.id}`
  async function addAsSource() {
    setSourceMsg('Đang lưu làm nguồn…')
    const d = await fetch('/api/sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: { title: msg.name, kind: 'text', content: `(file: ${msg.filePath})`, sourceRef: msg.filePath, scope: 'global', enabled: true } }) }).then(r => r.json()).catch(e => ({ ok: false, error: e.message }))
    setSourceMsg(d.ok ? '✓ Đã thêm vào nguồn. Agent có thể dùng analyze_document để đọc file này.' : 'Lỗi: ' + (d.error || 'không lưu được'))
  }
  return (
    <div className="msg bot">
      <div className="avatar bot"><Paperclip size={17} /></div>
      <div className="bubble upload-bubble">
        <div className="upload-name">📎 Đã tải lên: <b>{msg.name}</b></div>
        <div className="upload-path" title={msg.filePath}>{shortPath(msg.filePath)}</div>
        <div className="upload-grade-row">
          <label>Lớp</label>
          <input value={grade} list={gradeListId} placeholder="VD: lớp 5 hoặc G5" onChange={e => setGrade(e.target.value)} />
          <datalist id={gradeListId}>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={`lớp ${n}`} />)}</datalist>
        </div>
        <p className="desc">Tài liệu này có thể dùng làm nguồn để AI đọc & phân tích, hoặc chạy review/giải như trước.</p>
        <div className="upload-actions">
          <button className="btn secondary mini" onClick={addAsSource}>➕ Dùng làm nguồn</button>
          <button className="btn primary mini" onClick={() => onRun(`/es-review ${quoteArg(msg.filePath)} ${gradeText} toán`)}>Nhận xét (review)</button>
          <button className="btn secondary mini" onClick={() => onRun(`/es-solve ${quoteArg(msg.filePath)} ${gradeText} toán`)}>Giải chi tiết</button>
        </div>
        {sourceMsg && <div className="saved-note">{sourceMsg}</div>}
      </div>
    </div>
  )
}

function shortPath(p: string) {
  const parts = p.split('/').filter(Boolean)
  if (parts.length <= 4) return p
  return `…/${parts.slice(-3).join('/')}`
}
function detectGradeFromUpload(name: string, filePath: string) {
  const s = `${name} ${filePath}`
  const m = s.match(/(?:^|[^a-z0-9])G\s*([1-9])(?:[^0-9]|$)/i) || s.match(/l[ớo]p\s*([1-9])/i) || s.match(/(?:^|[^a-z0-9])grade\s*([1-9])(?:[^0-9]|$)/i)
  return m ? `lớp ${m[1]}` : 'lớp 4'
}
function normalizeGrade(value: string) {
  const v = value.trim()
  const m = v.match(/(?:^|[^0-9])([1-9])(?:[^0-9]|$)/)
  return m ? `lớp ${m[1]}` : (v || 'lớp 4')
}
function lastErrorLine(logs: string[]) {
  const line = [...logs].reverse().find(x => /failed|fetch|error|lỗi|quota|rate|429/i.test(x)) || logs[logs.length - 1] || 'Có lỗi khi chạy job.'
  return line.replace(/^❌\s*/, '').trim()
}
function helpText() {
  const base = SLASH_COMMANDS.filter(c => c.name !== '/help').map(c => `\`${c.name}\` — ${c.label}\n  ${c.usage}`).join('\n\n')
  return base + '\n\n`/clear` hoặc `/reset` — làm mới cuộc trò chuyện'
}

function QueueView({ items, setMsgs, module }: { items: QueueItem[]; setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>; module: ModuleKey }) {
  async function cancelJob(jobId: string) {
    await fetch(`/api/run?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' }).catch(() => null)
    await fetch(`/api/agent?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' }).catch(() => null)
    setMsgs(m => m.map(x => x.role === 'run' && x.id === jobId ? { ...x, status: 'error', logs: [...x.logs, '⏹ Đã gửi lệnh hủy'] } : x.role === 'agent' && x.id === jobId ? { ...x, status: 'error', steps: [...x.steps, { type: 'error', message: '⏹ Đã gửi lệnh hủy' }] } : x))
  }
  async function removeJob(job: QueueItem) {
    await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'remove_job', sessionId: job.sessionId, jobId: job.id }) }).catch(() => null)
    setMsgs(m => m.filter(x => x.id !== job.id))
    window.location.reload()
  }
  async function clearFinished() {
    await fetch('/api/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clear_jobs', module }) }).catch(() => null)
    setMsgs(m => m.filter(x => !(x.role === 'run' || x.role === 'agent') || x.status === 'running'))
    window.location.reload()
  }
  const titleOf = (job: JobMsg) => job.role === 'run' ? job.command : job.task
  const agentOf = (job: JobMsg) => job.role === 'run' ? job.agent : currentAgentFromSteps(job.steps)
  const logOf = (job: JobMsg) => job.role === 'run' ? job.logs : agentTerminalLines(job)
  return (
    <>
      <div className="topbar">
        <div><h2>Queue</h2><div className="sub">Hàng đợi tổng hợp của mọi phiên chat trong module {moduleOf(module).label}</div></div>
        <div className="top-actions"><button className="btn ghost" onClick={clearFinished}>Xóa job đã xong/lỗi</button></div>
      </div>
      <div className="content">
        <div className="card">
          {items.length === 0 ? <p className="desc">Chưa có job nào.</p> : (
            <table className="table">
              <thead><tr><th>Phiên</th><th>Lệnh</th><th>Trạng thái</th><th>Agent</th><th>Bắt đầu</th><th></th></tr></thead>
              <tbody>
                {items.map(job => (
                  <tr key={job.id}>
                    <td>{job.sessionTitle || moduleOf(job.module).label}</td>
                    <td className="wrap-cell">{titleOf(job)}</td>
                    <td><span className={`status ${job.status === 'done' ? 'ok' : job.status === 'error' ? 'err' : 'run'}`}>{job.status}</span></td>
                    <td>{job.status === 'running' ? (agentOf(job) || '—') : job.status === 'done' ? 'Word' : '—'}</td>
                    <td>{new Date(job.startedAt).toLocaleString('vi-VN')}</td>
                    <td><div className="inline-actions">
                      {job.status === 'running' && <button className="btn ghost mini" onClick={() => cancelJob(job.id)}>Hủy</button>}
                      <button className="btn ghost mini" onClick={() => removeJob(job)}>Xóa</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {items.slice(0, 4).map(job => (
          <div className="card" key={`detail_${job.id}`}>
            <div className="split-head">
              <div><h3>{titleOf(job)}</h3><p className="desc">{job.status === 'running' ? `Đang chạy — bước: ${agentOf(job) || '...'}` : job.status === 'done' ? 'Đã xong' : 'Có lỗi'}</p></div>
              <div className="inline-actions">
                {job.status === 'running' && <button className="btn ghost mini" onClick={() => cancelJob(job.id)}>Hủy job</button>}
                <button className="btn ghost mini" onClick={() => removeJob(job)}>Xóa khỏi queue</button>
              </div>
            </div>
            {job.role === 'agent' ? <AgentProgressBar steps={job.steps} status={job.status} flow={AGENT_FLOWS[job.module] || AGENT_FLOWS.topic} /> : <AgentFlow current={job.agent} status={job.status} module={job.module} />}
            {logOf(job).length > 0 && <pre className="run-log">{logOf(job).slice(-120).join('\n')}</pre>}
          </div>
        ))}
      </div>
    </>
  )
}

// Output shows Drive/Docs links from finished runs (Drive-first).
function Files({ module, settings, queue }: { module: ModuleKey; settings: SettingsShape | null; queue: JobMsg[] }) {
  const titleOf = (job: JobMsg) => job.role === 'run' ? job.command : job.task
  const cfg = settings?.modules?.[module]
  const withDrive = queue.filter(q => q.drive && q.drive.length > 0)
  const [localFiles, setLocalFiles] = useState<any[]>([])
  useEffect(() => {
    const root = settings?.outputDir || ''
    if (!root) return
    fetch('/api/files?root=' + encodeURIComponent(root)).then(r => r.json()).then(d => setLocalFiles(d.files || [])).catch(() => setLocalFiles([]))
  }, [settings?.outputDir, queue.length])
  async function deleteLocalFile(rel: string) {
    const root = settings?.outputDir || ''
    if (!root) return
    await fetch(`/api/files?root=${encodeURIComponent(root)}&rel=${encodeURIComponent(rel)}`, { method: 'DELETE' }).catch(() => null)
    setLocalFiles(x => x.filter(f => f.rel !== rel))
  }
  return (
    <>
      <div className="topbar">
        <div><h2>Kết quả</h2><div className="sub">File đã tạo được lưu trên Google Drive</div></div>
        <div className="top-actions">
          {cfg?.driveFolderUrl && <a className="btn ghost" href={cfg.driveFolderUrl} target="_blank" rel="noreferrer"><Cloud size={15} /> Mở folder Drive</a>}
        </div>
      </div>
      <div className="content">
        <div className="card">
          <h3>Tài liệu trên Drive</h3>
          <p className="desc">Mỗi file .docx được giữ cả bản .docx và bản Google Docs.</p>
          {withDrive.length === 0 ? (
            <p className="desc">Chưa có file nào upload lên Drive. Bật công tắc <b>Drive</b> trên thanh bar chat rồi chạy lại một lệnh.</p>
          ) : (
            <table className="table">
              <thead><tr><th>File</th><th>Google Docs</th><th>.docx</th><th>Lệnh</th></tr></thead>
              <tbody>
                {withDrive.flatMap(job => (job.drive || []).map((u, i) => (
                  <tr key={job.id + '_' + i}>
                    <td className="wrap-cell">{u.name}</td>
                    <td>{u.gdocLink ? <a className="file-link" href={u.gdocLink} target="_blank" rel="noreferrer"><FileText size={13} /> Mở</a> : (u.gdocError ? <span className="warn-inline">⚠️ Lỗi convert</span> : '—')}</td>
                    <td>{(u.docxDownloadLink || u.docxLink) ? <a className="file-link" href={u.docxDownloadLink || u.docxLink} target="_blank" rel="noreferrer"><Download size={13} /> Tải</a> : '—'}</td>
                    <td className="wrap-cell">{titleOf(job)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>File local</h3>
          {localFiles.length === 0 ? <p className="desc">Chưa có file local.</p> : (
            <table className="table">
              <thead><tr><th>File</th><th>Xem</th><th>Tải</th><th></th></tr></thead>
              <tbody>
                {localFiles.slice(0, 80).map(f => (
                  <tr key={f.rel}>
                    <td className="wrap-cell">{f.rel}</td>
                    <td>{f.ext === '.pdf' || f.ext === '.docx' ? <a className="file-link" href={fileUrl(settings?.outputDir || '', 'preview', f.rel)} target="_blank" rel="noreferrer"><Eye size={13} /> Mở</a> : '—'}</td>
                    <td><a className="file-link" href={fileUrl(settings?.outputDir || '', 'download', f.rel)}><Download size={13} /> Tải</a></td>
                    <td><button className="btn ghost mini" onClick={() => deleteLocalFile(f.rel)}>Xóa local</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}

function SourcesView({ module }: { module: ModuleKey }) {
  const [items, setItems] = useState<SourceDef[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const load = () => fetch('/api/sources').then(r => r.json()).then(d => setItems(d.items || [])).catch(() => {})
  useEffect(() => { void load() }, [])
  async function add() {
    if (!title.trim() || !content.trim()) return
    const d = await fetch('/api/sources', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item: { title, kind: 'text', content, scope: module, enabled: true } }) }).then(r => r.json()).catch(() => null)
    if (d?.ok) { setItems(d.items || []); setTitle(''); setContent('') }
  }
  async function del(id: string) { await fetch('/api/sources?id=' + encodeURIComponent(id), { method: 'DELETE' }); load() }
  return <><div className="topbar"><div><h2>Nguồn</h2><div className="sub">Tài liệu để agent đọc, phân tích và bám theo khi soạn.</div></div></div><div className="content"><div className="card"><h3>Thêm nguồn text</h3><div className="field"><label>Tên nguồn</label><input value={title} onChange={e => setTitle(e.target.value)} /></div><div className="field"><label>Nội dung</label><textarea value={content} onChange={e => setContent(e.target.value)} /></div><button className="btn primary mini" onClick={add}>Lưu nguồn</button></div>{items.map(s => <div key={s.id} className={`lib-row ${s.enabled ? '' : 'off'}`}><div className="lib-head"><div><div className="lib-title">{s.title}<span className="lib-kind">{s.scope}</span></div><div className="lib-meta">{s.kind} · {(s.content || '').length} ký tự · {s.sourceRef || 'text'}</div></div><div className="lib-actions"><button className="btn ghost mini" onClick={() => del(s.id)}>Xoá</button></div></div></div>)}</div></>
}

function SkillsView({ module }: { module: ModuleKey }) {
  const [items, setItems] = useState<SkillDef[]>([])
  const [editing, setEditing] = useState<SkillDef | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [guidance, setGuidance] = useState('')
  const [appliesTo, setAppliesTo] = useState<ModuleKey[]>([module])
  const [agentFlow, setAgentFlow] = useState<string[]>([])
  const [enabled, setEnabled] = useState(true)
  const load = () => fetch('/api/skills').then(r => r.json()).then(d => setItems(d.items || [])).catch(() => {})
  useEffect(() => { void load() }, [])
  const shown = items.filter(s => !s.appliesTo?.length || s.appliesTo.includes(module))
  function edit(s: SkillDef) {
    setEditing(s); setName(s.name); setDescription(s.description || ''); setSystemPrompt(s.systemPrompt || ''); setGuidance(s.guidance || ''); setAppliesTo((s.appliesTo?.length ? s.appliesTo : [module]) as ModuleKey[]); setAgentFlow(s.agentFlow || []); setEnabled(s.enabled !== false)
  }
  function resetForm() { setEditing(null); setName(''); setDescription(''); setSystemPrompt(''); setGuidance(''); setAppliesTo([module]); setAgentFlow([]); setEnabled(true) }
  function toggleModule(m: ModuleKey) { setAppliesTo(x => x.includes(m) ? x.filter(v => v !== m) : [...x, m]) }
  function toggleAgent(a: string) { setAgentFlow(x => x.includes(a) ? x.filter(v => v !== a) : [...x, a]) }
  function moveAgent(i: number, d: number) {
    setAgentFlow(x => { const y = [...x], j = i + d; if (j < 0 || j >= y.length) return x; [y[i], y[j]] = [y[j], y[i]]; return y })
  }
  async function save() {
    if (!name.trim() || !systemPrompt.trim()) return
    const item = { id: editing?.id, name, description, systemPrompt, guidance, appliesTo: appliesTo.length ? appliesTo : [module], agentFlow, enabled }
    const d = await fetch('/api/skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item }) }).then(r => r.json()).catch(() => null)
    if (d?.ok) { setItems(d.items || []); resetForm() }
  }
  async function del(id: string) { await fetch('/api/skills?id=' + encodeURIComponent(id), { method: 'DELETE' }); load() }
  return <><div className="topbar"><div><h2>Skills</h2><div className="sub">Cấu hình prompt dài + module áp dụng + thứ tự sub-agent cho từng skill.</div></div><button className="btn secondary mini" onClick={resetForm}><Sparkles size={14}/> Skill mới</button></div><div className="content skills-redesign"><div className="card skill-editor pro"><div className="split-head"><div><h3>{editing ? `Sửa ${editing.name}` : 'Thêm skill'}</h3><p className="desc">Skill là prompt-pack thật. Agent sẽ dùng flow này khi module gọi skill.</p></div><label className="switch-line"><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} /> Bật</label></div><div className="field"><label>Tên skill</label><input value={name} placeholder="/es-custom" onChange={e => setName(e.target.value)} /></div><div className="field"><label>Mô tả ngắn</label><input value={description} onChange={e => setDescription(e.target.value)} /></div><div className="field"><label>Dùng cho module</label><div className="module-toggle-row">{MODULES.map(m => <button key={m.key} type="button" className={`qc-chip ${appliesTo.includes(m.key) ? 'active' : ''}`} onClick={() => toggleModule(m.key)}>{m.label}</button>)}</div></div><div className="field"><label>Sub-agent flow</label><div className="agent-palette">{['Intent','Architect','Source/NotebookLM','Examiner','Read/Extract','Solver','Student','Judge','VisualCurator','Artist','Reviewer','Word'].map(a => <button key={a} type="button" className={`agent-pill ${agentFlow.includes(a) ? 'active' : ''}`} onClick={() => toggleAgent(a)}>{a}</button>)}</div><div className="flow-editor">{agentFlow.length === 0 ? <span className="desc">Chưa chọn agent. Mặc định theo module.</span> : agentFlow.map((a, i) => <div key={a} className="flow-token"><span>{i + 1}. {a}</span><button onClick={() => moveAgent(i, -1)} disabled={i === 0}>↑</button><button onClick={() => moveAgent(i, 1)} disabled={i === agentFlow.length - 1}>↓</button><button onClick={() => toggleAgent(a)}>×</button></div>)}</div></div><div className="field"><label>System prompt đầy đủ</label><textarea className="long-prompt" value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} /></div><div className="field"><label>Guidance / cú pháp</label><textarea value={guidance} onChange={e => setGuidance(e.target.value)} /></div><div className="inline-actions"><button className="btn primary" onClick={save}>{editing ? 'Lưu skill' : 'Tạo skill'}</button>{editing && <button className="btn ghost" onClick={resetForm}>Huỷ</button>}</div></div><div className="skills-side"><div className="skill-filter-note"><b>Module hiện tại:</b> {moduleOf(module).label}<span>{shown.length}/{items.length} skill áp dụng</span></div>{shown.map(s => <button key={s.id} className={`skill-item pro ${editing?.id === s.id ? 'active' : ''} ${s.enabled ? '' : 'off'}`} onClick={() => edit(s)}><div className="skill-name"><Sparkles size={14}/>{s.name}<span className="lib-kind">{(s.appliesTo || []).join(',') || 'all'}</span></div><div className="skill-desc">{s.description || s.systemPrompt.slice(0, 180)}</div><div className="flow-preview">{(s.agentFlow || []).length ? s.agentFlow!.join(' → ') : 'Flow mặc định theo module'}</div><div className="lib-actions"><span className={`status ${s.enabled ? 'ok' : 'err'}`}>{s.enabled ? 'Bật' : 'Tắt'}</span><span role="button" className="btn ghost mini" onClick={e => { e.stopPropagation(); del(s.id) }}>Xoá</span></div></button>)}</div></div></>
}

function AgentView({ module, settings, setSettings }: { module: ModuleKey; settings: SettingsShape | null; setSettings: (s: SettingsShape) => void }) {
  const [models, setModels] = useState<string[]>([])
  const cfg = settings?.modules?.[module]
  useEffect(() => { const router = settings?.routerBaseUrl ? `?router=${encodeURIComponent(settings.routerBaseUrl)}` : ''; fetch('/api/models' + router).then(r => r.json()).then(d => { if (d.ok) setModels(d.models || []) }).catch(() => {}) }, [settings?.routerBaseUrl])
  if (!settings || !cfg) return <><div className="topbar"><h2>Agent</h2></div><div className="content">Đang tải…</div></>
  const currentSettings = settings
  const currentCfg = cfg
  async function setModuleField<K extends keyof ModuleConfig>(k: K, v: ModuleConfig[K]) {
    const next: SettingsShape = { ...currentSettings, modules: { ...currentSettings.modules, [module]: { ...currentCfg, [k]: v } } }
    setSettings(next)
    await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modules: { [module]: { [k]: v } } }) }).catch(() => {})
  }
  function setAgentModel(agent: EduAgentKey, model: string) {
    setModuleField('agentModels', { ...(currentCfg.agentModels || {}), [agent]: model } as any)
  }
  return <><div className="topbar"><div><h2>Kientre Agents</h2><div className="sub">Set model cho từng sub-agent thật trong engine, không phải module.</div></div></div><div className="content"><div className="agent-model-list">{EDU_AGENTS.map(a => <div key={a.key} className="agent-model-row"><div className="agent-model-main"><div className="agent-model-title"><Bot size={15}/>{a.label}<span className="lib-kind">{a.env}</span></div><div className="agent-model-desc">{a.desc}</div></div><div className="field agent-model-select"><label>Model</label><select value={currentCfg.agentModels?.[a.key] || a.fallback} onChange={e => setAgentModel(a.key, e.target.value)}>{!models.includes(currentCfg.agentModels?.[a.key] || a.fallback) && <option value={currentCfg.agentModels?.[a.key] || a.fallback}>{currentCfg.agentModels?.[a.key] || a.fallback}</option>}{models.map(m => <option key={m} value={m}>{m}</option>)}</select></div></div>)}</div><div className="card compact-note"><h3><SlidersHorizontal size={16}/> Ghi chú</h3><p className="desc">Các model này được truyền vào engine bằng env khi chạy job. Ví dụ Student dùng <code>HERMES_STUDENT_MODEL</code>, Judge dùng <code>HERMES_JUDGE_MODEL</code>, Reviewer dùng <code>HERMES_REVIEWER_MODEL</code>.</p></div></div></>
}

function Dashboard({ settings, queue }: { settings: SettingsShape | null; queue: Extract<Msg, { role: 'run' }>[] }) {
  const done = queue.filter(q => q.status === 'done').length
  const running = queue.filter(q => q.status === 'running').length
  const failed = queue.filter(q => q.status === 'error').length
  return (
    <>
      <div className="topbar"><div><h2>Bảng điều khiển</h2><div className="sub">Thống kê queue và cấu hình</div></div></div>
      <div className="content">
        <div className="stats-grid">
          <div className="card stat-card"><h3>{running}</h3><p className="desc">Job đang chạy</p></div>
          <div className="card stat-card"><h3>{done}</h3><p className="desc">Job hoàn tất</p></div>
          <div className="card stat-card"><h3>{failed}</h3><p className="desc">Job lỗi</p></div>
        </div>
        <div className="card">
          <h3>Cấu hình chung</h3>
          <table className="table"><tbody>
            <tr><td><b>Workspace</b></td><td>{settings?.workspaceDir || '—'}</td></tr>
            <tr><td><b>Kientre engine</b></td><td>{settings?.engineDir || '—'}</td></tr>
            <tr><td><b>Model router</b></td><td>{settings?.routerBaseUrl || '—'}</td></tr>
          </tbody></table>
        </div>
      </div>
    </>
  )
}

const ROUTER_SKILLS: { name: string; route: string; desc: string; url: string }[] = [
  { name: '9Router (Entry)', route: 'START HERE', desc: 'Setup + index of all capabilities: base URL, auth, model discovery, links đến từng skill.', url: 'https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/9router/SKILL.md' },
  { name: 'Chat', route: '/v1/chat/completions', desc: 'Chat / code-gen qua 9Router với streaming + auto fallback.', url: 'https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/9router-chat/SKILL.md' },
  { name: 'Image Generation', route: '/v1/images/generations', desc: 'Text-to-image qua DALL-E / Imagen / FLUX / MiniMax / SDWebUI.', url: 'https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/9router-image/SKILL.md' },
  { name: 'Web Search', route: '/v1/search', desc: 'Tìm web qua Tavily / Exa / Brave / Serper / SearXNG / Google PSE.', url: 'https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/9router-web-search/SKILL.md' },
  { name: 'Web Fetch', route: '/v1/web/fetch', desc: 'Đọc URL thành markdown / text / HTML.', url: 'https://raw.githubusercontent.com/decolua/9router/refs/heads/master/skills/9router-web-fetch/SKILL.md' },
]

const PROVIDERS: { key: ProviderKey; label: string; hint: string; prefix: string; examples: string; placeholder: string; docs: string }[] = [
  { key: 'gemini', label: 'Google Gemini', hint: 'Gọi thẳng Google, không qua 9router.', prefix: 'gemini/', examples: 'gemini/gemini-2.5-flash, gemini/gemini-2.5-pro', placeholder: 'AIza…', docs: 'https://aistudio.google.com/apikey' },
  { key: 'deepseek', label: 'DeepSeek', hint: 'Gọi thẳng DeepSeek.', prefix: 'deepseek/', examples: 'deepseek/deepseek-chat, deepseek/deepseek-reasoner', placeholder: 'sk-…', docs: 'https://platform.deepseek.com/api_keys' },
  { key: 'glm', label: 'Zhipu GLM', hint: 'Gọi thẳng BigModel GLM.', prefix: 'glm/', examples: 'glm/glm-4.6, glm/glm-4.5, glm/glm-4-flash', placeholder: '••••.••••', docs: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { key: 'openrouter', label: 'OpenRouter', hint: 'Cổng gộp nhiều model.', prefix: 'openrouter/', examples: 'openrouter/openai/gpt-4o-mini, openrouter/anthropic/claude-3.5-sonnet', placeholder: 'sk-or-…', docs: 'https://openrouter.ai/keys' },
]

// Provider API keys. Keys are write-only from the client: server returns only a
// masked presence descriptor, so the raw secret never comes back down the wire.
function ApiKeysCard({ apiKeys, onSaved }: { apiKeys: Record<ProviderKey, MaskedKey>; onSaved: (s: SettingsShape) => void }) {
  const [drafts, setDrafts] = useState<Record<ProviderKey, string>>({ gemini: '', deepseek: '', glm: '', openrouter: '' })
  const [reveal, setReveal] = useState<Record<ProviderKey, boolean>>({ gemini: false, deepseek: false, glm: false, openrouter: false })
  const [busy, setBusy] = useState<ProviderKey | null>(null)
  const [note, setNote] = useState('')

  async function persist(patch: Partial<Record<ProviderKey, string>>, p: ProviderKey, verb: string) {
    setBusy(p); setNote('')
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apiKeys: patch }) })
      const d = await r.json()
      if (d.ok) { onSaved(d.settings); setDrafts(x => ({ ...x, [p]: '' })); setNote(`✓ ${verb} khoá ${PROVIDERS.find(x => x.key === p)?.label}`) }
      else setNote('Lỗi: ' + (d.error || 'không lưu được'))
    } catch { setNote('Lỗi kết nối') }
    finally { setBusy(null); setTimeout(() => setNote(''), 3500) }
  }
  const saveKey = (p: ProviderKey) => { const v = drafts[p].trim(); if (v) persist({ [p]: v }, p, 'Đã lưu') }
  const clearKey = (p: ProviderKey) => persist({ [p]: '' }, p, 'Đã xoá')

  return (
    <div className="card">
      <div className="split-head">
        <div>
          <h3><Cpu size={16} /> Nhà cung cấp AI (API key riêng)</h3>
          <p className="desc">Nhập API key để chạy thẳng Gemini / DeepSeek / GLM / OpenRouter, không cần 9router. Chọn model có tiền tố tương ứng trong Cài đặt module. Khoá được lưu ở máy chủ và không hiển thị lại.</p>
        </div>
        <span className="pill mini secure"><ShieldCheck size={13} /> Write-only</span>
      </div>
      <div className="provider-grid">
        {PROVIDERS.map(p => {
          const status = apiKeys?.[p.key]
          const configured = !!status?.present
          return (
            <div key={p.key} className={`provider-row ${configured ? 'on' : ''}`}>
              <div className="provider-head">
                <div className="provider-name">{p.label}
                  {configured
                    ? <span className="key-badge ok"><CheckCircle2 size={12} /> Đã cấu hình · {status.hint}</span>
                    : <span className="key-badge off">Chưa có khoá</span>}
                </div>
                <a className="provider-doc" href={p.docs} target="_blank" rel="noreferrer">Lấy khoá ↗</a>
              </div>
              <p className="provider-hint">{p.hint}</p>
              <div className="prefix-help"><b>Chọn model prefix:</b> <code>{p.prefix}</code><small>Ví dụ: {p.examples}</small></div>
              <div className="key-input-row">
                <div className="key-input-wrap">
                  <KeyRound size={15} className="key-lead" />
                  <input
                    className="secret-input flat"
                    type={reveal[p.key] ? 'text' : 'password'}
                    value={drafts[p.key]}
                    placeholder={configured ? 'Dán khoá mới để thay…' : p.placeholder}
                    onChange={e => setDrafts(x => ({ ...x, [p.key]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveKey(p.key) }}
                    autoComplete="off" spellCheck={false}
                  />
                  <button type="button" className="key-eye" title={reveal[p.key] ? 'Ẩn' : 'Hiện'} onClick={() => setReveal(x => ({ ...x, [p.key]: !x[p.key] }))}>
                    {reveal[p.key] ? <EyeOff size={15} /> : <EyeIcon size={15} />}
                  </button>
                </div>
                <button className="btn primary mini" disabled={!drafts[p.key].trim() || busy === p.key} onClick={() => saveKey(p.key)}>
                  {busy === p.key ? <RefreshCw size={13} className="spin" /> : <Save size={13} />} Lưu
                </button>
                {configured && <button className="btn ghost mini" disabled={busy === p.key} onClick={() => clearKey(p.key)}><Trash2 size={13} /></button>}
              </div>
            </div>
          )
        })}
      </div>
      {note && <div className="saved-note">{note}</div>}
    </div>
  )
}

function SettingsView({ settings, onSaved }: { settings: SettingsShape | null; onSaved: (s: SettingsShape) => void }) {
  const [form, setForm] = useState<SettingsShape | null>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [gauth, setGauth] = useState<any>(null)
  const [tokenInput, setTokenInput] = useState('')
  const [authUrl, setAuthUrl] = useState('')
  const [redirectInput, setRedirectInput] = useState('')
  const [gauthMsg, setGauthMsg] = useState('')
  const [showRouter, setShowRouter] = useState(false)
  const [editPath, setEditPath] = useState<string | null>(null)
  const [info, setInfo] = useState<any>(null)

  useEffect(() => { setForm(settings) }, [settings])
  useEffect(() => { fetch('/api/google-auth').then(r => r.json()).then(setGauth).catch(() => {}) }, [])
  useEffect(() => {
    if (!form) return
    const q = `?engineDir=${encodeURIComponent(form.engineDir)}&hermesHome=${encodeURIComponent(form.hermesHome || '')}`
    fetch('/api/kientre-info' + q).then(r => r.json()).then(setInfo).catch(() => {})
  }, [form?.engineDir])

  if (!form) return <><div className="topbar"><h2>Cài đặt</h2></div><div className="content">Đang tải…</div></>
  const set = (k: keyof SettingsShape, v: any) => setForm(f => ({ ...(f as SettingsShape), [k]: v }))
  const setMod = (mk: ModuleKey, k: keyof ModuleConfig, v: any) =>
    setForm(f => f ? { ...f, modules: { ...f.modules, [mk]: { ...f.modules[mk], [k]: v } } } : f)

  async function save() {
    setSaving(true); setSaved(false)
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (d.ok) { onSaved(d.settings); setSaved(true); setTimeout(() => setSaved(false), 2500) }
    } finally { setSaving(false) }
  }
  async function saveToken() {
    setGauthMsg('Đang lưu…')
    const r = await fetch('/api/google-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tokenInput }) })
    const d = await r.json()
    if (d.ok) { setGauth(d); setTokenInput(''); setGauthMsg('✓ Đã lưu và làm mờ credential.') }
    else setGauthMsg('Lỗi: ' + (d.error || 'không lưu được'))
    setTimeout(() => setGauthMsg(''), 4000)
  }
  async function uploadOauthFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) { setGauthMsg('Lỗi: chỉ nhận file .json'); return }
    setTokenInput(await file.text())
  }
  async function verifyToken() {
    setGauthMsg('Đang kiểm tra Drive…')
    const r = await fetch('/api/google-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'verify' }) })
    const d = await r.json()
    setGauthMsg(d.ok ? `✓ Drive OK (${d.account})` : 'Lỗi: ' + (d.error || 'không truy cập Drive'))
    setTimeout(() => setGauthMsg(''), 5000)
  }
  async function createAuthUrl() {
    setGauthMsg('Đang tạo link cấp quyền…')
    const r = await fetch('/api/google-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'auth-url' }) })
    const d = await r.json()
    if (d.ok) { setAuthUrl(d.authUrl); setGauthMsg('Mở link, đồng ý quyền. Trang cuối lỗi localhost:1 là đúng; copy toàn bộ URL dán vào ô dưới.') }
    else setGauthMsg('Lỗi: ' + (d.error || 'không tạo được link'))
  }
  async function exchangeAuthCode() {
    setGauthMsg('Đang đổi mã OAuth…')
    const r = await fetch('/api/google-auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'auth-code', code: redirectInput }) })
    const d = await r.json()
    if (d.ok) { setGauth(d); setRedirectInput(''); setGauthMsg('✓ Đã cấp quyền Drive. Bấm Kiểm tra Drive để xác nhận.') }
    else setGauthMsg('Lỗi: ' + (d.error || 'không đổi được mã'))
  }

  const routerUi = form.routerBaseUrl.replace(/\/v1\/?$/, '')

  return (
    <>
      <div className="topbar"><div><h2>Cài đặt</h2><div className="sub">Google OAuth JSON mới · Nhà cung cấp AI (API key) · 9router · thư mục engine. Fallback model tự động khi một model lỗi/hết quota.</div></div></div>
      <div className="content">

        <ApiKeysCard apiKeys={form.apiKeys} onSaved={onSaved} />

        <div className="card">
          <h3><KeyRound size={16} /> Google OAuth JSON</h3>
          <p className="desc">Dán nội dung file JSON mới để cấp quyền upload Drive. App lưu server-side tại <code>{form.googleCredentialFile}</code>, không dùng Auth cũ và không hiển thị lại.</p>
          {gauth?.present ? (
            <div className="auth-status ok">
              <CheckCircle2 size={15} /> Đã cấu hình · Tài khoản <b>{gauth.account || '••••'}</b>{gauth.hasRefresh ? ' · có refresh_token' : ''}
            </div>
          ) : <div className="auth-status warn">Chưa có credential. Dán JSON mới bên dưới.</div>}
          <div className="form">
            <div className="field">
              <label>OAuth JSON {gauth?.present ? '(dán để thay credential mới)' : ''}</label>
              <input type="file" accept=".json,application/json" onChange={uploadOauthFile} />
              <textarea className="secret-input" value={tokenInput} placeholder='{"installed":{"client_id":"…","client_secret":"…"},"refresh_token":"…"}' onChange={e => setTokenInput(e.target.value)} />
            </div>
            <div className="inline-actions">
              <button className="btn primary mini" onClick={saveToken} disabled={!tokenInput.trim()}><Save size={14} /> Lưu & làm mờ</button>
              <button className="btn ghost mini" onClick={createAuthUrl} disabled={!gauth?.present}><Link2 size={14} /> Tạo link cấp quyền</button>
              <button className="btn ghost mini" onClick={verifyToken}><CheckCircle2 size={14} /> Kiểm tra Drive</button>
              {gauthMsg && <span className="saved-note">{gauthMsg}</span>}
            </div>
            {authUrl && <div className="field"><label>Link cấp quyền</label><a className="file-link" href={authUrl} target="_blank" rel="noreferrer"><Link2 size={14} /> Mở Google consent</a></div>}
            <div className="field">
              <label>URL redirect sau khi Google báo lỗi localhost:1</label>
              <textarea className="secret-input" value={redirectInput} placeholder="http://localhost:1/?code=...&scope=..." onChange={e => setRedirectInput(e.target.value)} />
              <button className="btn primary mini" onClick={exchangeAuthCode} disabled={!redirectInput.trim()}><Save size={14} /> Lưu quyền Drive</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="split-head">
            <div><h3><Plug size={16} /> 9router (LLM gateway)</h3><p className="desc">Nhúng giao diện 9router để nhập API key ngay trong app. Đồng thời hiện skill đúng vị trí để anh biết endpoint nào phục vụ tính năng nào.</p></div>
            <div className="inline-actions">
              <button className="btn ghost mini" onClick={() => setShowRouter(s => !s)}>{showRouter ? 'Ẩn' : 'Hiện'} 9router</button>
              <a className="btn ghost mini" href={routerUi} target="_blank" rel="noreferrer">Mở tab riêng</a>
            </div>
          </div>
          <div className="field"><label>Router base URL</label><input value={form.routerBaseUrl} onChange={e => set('routerBaseUrl', e.target.value)} /></div>
          {showRouter && (
            <div className="router-frame">
              <iframe src={routerUi} title="9router" onError={() => {}} />
              <p className="desc frame-note">Nếu khung trống, 9router chặn nhúng — bấm “Mở tab riêng”.</p>
            </div>
          )}
          <div className="router-skill-grid">
            {ROUTER_SKILLS.map(s => (
              <div key={s.url} className={`router-skill-card ${s.route === 'START HERE' ? 'featured' : ''}`}>
                <div className="router-skill-head">
                  <div className="router-skill-title">{s.name}</div>
                  <span className="router-route">{s.route}</span>
                </div>
                <div className="desc">{s.desc}</div>
                <div className="router-skill-url"><a className="file-link" href={s.url} target="_blank" rel="noreferrer"><Link2 size={13} /> {s.url}</a></div>
                <div className="router-skill-where">Dùng trong app: {s.name === 'Chat' ? 'Agent + chat loop' : s.name === 'Image Generation' ? 'Artist/ImageFetcher khi cần vẽ hoặc sinh ảnh' : s.name === 'Web Search' ? 'Source/NotebookLM + Examiner + WebSearch tool' : s.name === 'Web Fetch' ? 'bước đọc URL chi tiết / nguồn web' : 'thiết lập và tra cứu router'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3><Settings size={16} /> Engine</h3>
          <div className="form">
            <div className="field"><label>Thư mục Kientre (engine, chứa slash.mjs)</label><input value={form.engineDir} onChange={e => set('engineDir', e.target.value)} /></div>
            <div className="field"><label>File Google OAuth JSON mới</label><input value={form.googleCredentialFile} onChange={e => set('googleCredentialFile', e.target.value)} /></div>
            <div className="field"><label>Nơi lưu tạm (Output local trước khi lên Drive)</label><input value={form.outputDir} onChange={e => set('outputDir', e.target.value)} /></div>
            <div className="row2">
              <div className="field"><label>Retry mỗi model</label><input type="number" min={1} value={form.modelRetries} onChange={e => set('modelRetries', Number(e.target.value))} /></div>
              <div className="field"><label>Delay retry (ms)</label><input type="number" min={0} value={form.retryDelayMs} onChange={e => set('retryDelayMs', Number(e.target.value))} /></div>
            </div>
          </div>
        </div>

        <div className="settings-actions">
          <button className="btn primary" onClick={save} disabled={saving}><Save size={16} /> {saving ? 'Đang lưu…' : 'Lưu cài đặt'}</button>
          {saved && <span className="saved-note">✓ Đã lưu</span>}
        </div>
      </div>
      {editPath && <FileEditor path={editPath} onClose={() => setEditPath(null)} />}
    </>
  )
}

function FileEditor({ path, onClose }: { path: string; onClose: () => void }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  useEffect(() => {
    setLoading(true); setErr(''); setMsg('')
    fetch('/api/file?path=' + encodeURIComponent(path)).then(r => r.json())
      .then(d => { if (d.ok) setContent(d.content); else setErr(d.error || 'Không đọc được') })
      .catch(() => setErr('Lỗi kết nối')).finally(() => setLoading(false))
  }, [path])
  async function save() {
    setSaving(true); setErr(''); setMsg('')
    try {
      const r = await fetch('/api/file', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, content }) })
      const d = await r.json()
      if (d.ok) { setMsg('✓ Đã lưu (đã backup .bak)'); setTimeout(() => setMsg(''), 2500) } else setErr(d.error || 'Không lưu được')
    } catch { setErr('Lỗi kết nối') } finally { setSaving(false) }
  }
  const fileName = path.split('/').slice(-2).join('/')
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={e => e.stopPropagation()}>
        <div className="modal-head">
          <div><h3>Sửa file</h3><div className="modal-path">{fileName}</div></div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        {loading ? <p className="desc" style={{ padding: 20 }}>Đang tải…</p> : (
          <>
            <textarea className="code-editor" value={content} onChange={e => setContent(e.target.value)} spellCheck={false} />
            <div className="modal-foot">
              <div className="modal-msg">{err ? <span className="err-text">{err}</span> : msg ? <span className="ok-text">{msg}</span> : <span className="desc">{content.length} ký tự</span>}</div>
              <div className="inline-actions">
                <button className="btn ghost" onClick={onClose}>Đóng</button>
                <button className="btn primary" onClick={save} disabled={saving}><Save size={15} /> {saving ? 'Đang lưu…' : 'Lưu file'}</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
