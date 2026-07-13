'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bot, Cloud, Download, Eye, FileStack, FileText, KeyRound, LayoutDashboard, MessageSquare,
  Paperclip, Pencil, RefreshCw, Save, Send, Settings, ShieldCheck, Sparkles, Terminal, Trash2, User, X,
} from 'lucide-react'
import { SLASH_COMMANDS, suggestCommands, findCommand, type SlashCommand } from '@/lib/eduskill/slashCommands'

type View = 'chat' | 'queue' | 'files' | 'settings' | 'dashboard'
type Created = string
type RunStatus = 'running' | 'done' | 'error'
type Msg =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'bot'; text: string }
  | { id: string; role: 'upload'; name: string; filePath: string; grade?: string }
  | { id: string; role: 'run'; command: string; logs: string[]; status: RunStatus; created: Created[]; outputDir: string; startedAt: number; agent?: string }
type SettingsShape = {
  outputDir: string; workspaceDir: string; eduSkillDir: string
  driveParentId: string; driveFolderUrl: string; routerBaseUrl: string
  defaultWorkerModel: string; useSummary: boolean; uploadDrive: boolean
  fallbackModels: string; modelRetries: number; retryDelayMs: number
}
type ComposeMode = 'detailed' | 'summary' | 'concise'

const LS = { authed: 'kitee.authed', view: 'kitee.view', msgs: 'kitee.msgs', input: 'kitee.input', composeMode: 'kitee.composeMode' }
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
const fileUrl = (root: string, param: 'preview' | 'download', rel: string) =>
  `/api/files?root=${encodeURIComponent(root)}&${param}=${encodeURIComponent(rel)}`
const COMPOSE_MODES: { value: ComposeMode; label: string; hint: string }[] = [
  { value: 'detailed', label: 'Lý thuyết chi tiết', hint: 'Đầy đủ lý thuyết, ví dụ, bài tập, đáp án' },
  { value: 'summary', label: 'Tóm tắt', hint: 'Bản gọn hơn, vẫn đủ ý chính' },
  { value: 'concise', label: 'Ngắn gọn/cô đọng', hint: 'Ưu tiên nội dung chính, giảm diễn giải lặp' },
]
const CREATE_TOKENS = new Set(['/es-create', '/topic', '/chuyende', '/soan', '/es-compose', '/es-topic', '/es-soan'])

function applyComposeMode(command: string, mode: ComposeMode) {
  const token = (command.trim().split(/\s+/)[0] || '').toLowerCase()
  if (!CREATE_TOKENS.has(token) || mode === 'detailed') return command
  let out = command.trim()
  if (!/--summary\b/i.test(out)) out += ' --summary'
  if (mode === 'concise' && !/--special\s+"[^"]+"/i.test(out)) {
    out += ' --special "Viết ngắn gọn, cô đọng, tập trung nội dung chính; giảm diễn giải lặp lại nhưng vẫn giữ cấu trúc sư phạm rõ ràng."'
  }
  return out
}

// Các bước agent trong pipeline eduSkill (theo từng loại lệnh).
const AGENT_FLOWS: Record<string, string[]> = {
  create: ['Intent', 'Architect', 'Source', 'Judge', 'VisualCurator', 'Artist', 'Student', 'Reviewer', 'Word'],
  test: ['Intent', 'Examiner', 'Reviewer', 'Word'],
  solve: ['Read', 'Solver', 'Judge', 'Reviewer', 'Word'],
  review: ['Read', 'Reviewer', 'Judge', 'Word'],
  default: ['Intent', 'Architect', 'Source', 'Judge', 'Solver', 'Examiner', 'VisualCurator', 'Artist', 'Student', 'Reviewer', 'Word'],
}
function flowForCommand(command: string) {
  const t = (command.split(/\s+/)[0] || '').toLowerCase()
  if (['/es-solve', '/solve', '/es-giai', '/giai'].includes(t)) return AGENT_FLOWS.solve
  if (['/es-review', '/review', '/es-nhanxet', '/nhanxet'].includes(t)) return AGENT_FLOWS.review
  if (['/es-test', '/test', '/es-exam', '/es-de', '/de', '/kiemtra'].includes(t)) return AGENT_FLOWS.test
  if (['/es-create', '/topic', '/chuyende', '/soan', '/es-compose', '/es-topic', '/es-soan'].includes(t)) return AGENT_FLOWS.create
  return AGENT_FLOWS.default
}
// map từ dấu hiệu trong log -> tên bước
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
function detectAgent(line: string): string | undefined {
  for (const [re, name] of AGENT_HINTS) if (re.test(line)) return name
  return undefined
}

export default function Home() {
  const [authed, setAuthed] = useState(false)
  const [view, setView] = useState<View>('chat')
  const [settings, setSettings] = useState<SettingsShape | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      setAuthed(localStorage.getItem(LS.authed) === '1')
      setView((localStorage.getItem(LS.view) as View) || 'chat')
      setMsgs(JSON.parse(localStorage.getItem(LS.msgs) || '[]'))
      setInput(localStorage.getItem(LS.input) || '')
    } catch {}
    fetch('/api/settings').then(r => r.json()).then(d => setSettings(d.settings)).catch(() => {})
    setHydrated(true)
  }, [])

  useEffect(() => { if (hydrated) localStorage.setItem(LS.authed, authed ? '1' : '0') }, [authed, hydrated])
  useEffect(() => { if (hydrated) localStorage.setItem(LS.view, view) }, [view, hydrated])
  useEffect(() => { if (hydrated) localStorage.setItem(LS.msgs, JSON.stringify(msgs)) }, [msgs, hydrated])
  useEffect(() => { if (hydrated) localStorage.setItem(LS.input, input) }, [input, hydrated])

  const queue = useMemo(() => msgs.filter((m): m is Extract<Msg, { role: 'run' }> => m.role === 'run').slice().reverse(), [msgs])
  const runningCount = queue.filter(q => q.status === 'running').length

  if (!authed) return <Login onDone={() => setAuthed(true)} />

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">K</div>
          <div><h1>Kitee eduSkill</h1><p>Trợ lý giáo dục · Hermes</p></div>
        </div>
        <div className="nav-title">Menu</div>
        <button className={`nav-item ${view === 'chat' ? 'active' : ''}`} onClick={() => setView('chat')}><MessageSquare size={17} /> Trợ lý chat</button>
        <button className={`nav-item ${view === 'queue' ? 'active' : ''}`} onClick={() => setView('queue')}><FileStack size={17} /> Queue {runningCount > 0 ? `(${runningCount})` : ''}</button>
        <button className={`nav-item ${view === 'files' ? 'active' : ''}`} onClick={() => setView('files')}><FileText size={17} /> Kết quả (Output)</button>
        <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')}><LayoutDashboard size={17} /> Bảng điều khiển</button>
        <button className={`nav-item ${view === 'settings' ? 'active' : ''}`} onClick={() => setView('settings')}><Settings size={17} /> Cài đặt</button>
        <div className="nav-title">Hệ thống</div>
        <div className="nav-item" style={{ cursor: 'default' }}><Sparkles size={17} /> VisualCurator</div>
        <div className="nav-item" style={{ cursor: 'default' }}><ShieldCheck size={17} /> Reviewer strict</div>
        <div className="sidebar-foot"><span className="dot" />eduSkill engine</div>
      </aside>

      <main className="main">
        {view === 'chat' && <Chat settings={settings} msgs={msgs} setMsgs={setMsgs} input={input} setInput={setInput} />}
        {view === 'queue' && <QueueView items={queue} setMsgs={setMsgs} />}
        {view === 'files' && <Files settings={settings} />}
        {view === 'dashboard' && <Dashboard settings={settings} queue={queue} />}
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
        <h3>Kitee eduSkill</h3>
        <p>Trợ lý soạn tài liệu giáo dục — chạy trực tiếp flow eduSkill</p>
        <form className="form" onSubmit={e => { e.preventDefault(); onDone() }}>
          <div className="field"><label>Email</label><input placeholder="email@kitee.vn" defaultValue="anh@kitee.vn" /></div>
          <div className="field"><label>Mật khẩu</label><input type="password" placeholder="••••••••" defaultValue="demo" /></div>
          <button type="submit" className="btn primary" style={{ width: '100%' }}><KeyRound size={16} /> Vào hệ thống</button>
        </form>
        <div className="divider">HOẶC</div>
        <button className="btn secondary" style={{ width: '100%' }} onClick={onDone}>Dùng thử không cần đăng nhập</button>
      </div>
    </div>
  )
}

function renderText(text: string) {
  return text.split(/(`[^`]+`)/g).map((p, i) =>
    p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : <span key={i}>{p}</span>)
}

function AgentFlow({ current, status, command }: { current?: string; status: RunStatus; command: string }) {
  const flow = flowForCommand(command)
  const curIdx = current ? flow.indexOf(current) : -1
  return (
    <div className="agent-flow">
      {flow.map((a, i) => {
        const state = status === 'done' ? 'done'
          : i < curIdx ? 'done'
          : i === curIdx ? (status === 'error' ? 'err' : 'active')
          : 'pending'
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

function Chat({ settings, msgs, setMsgs, input, setInput }: {
  settings: SettingsShape | null
  msgs: Msg[]
  setMsgs: React.Dispatch<React.SetStateAction<Msg[]>>
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
}) {
  const [sugs, setSugs] = useState<SlashCommand[]>([])
  const [sugIdx, setSugIdx] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [composeMode, setComposeMode] = useState<ComposeMode>('detailed')
  const scrollRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const runningCount = msgs.filter(m => m.role === 'run' && m.status === 'running').length

  useEffect(() => { scrollRef.current?.scrollTo({ top: 1e9, behavior: 'smooth' }) }, [msgs.length])
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS.composeMode) as ComposeMode | null
      if (saved && ['detailed', 'summary', 'concise'].includes(saved)) setComposeMode(saved)
    } catch {}
  }, [])
  useEffect(() => { try { localStorage.setItem(LS.composeMode, composeMode) } catch {} }, [composeMode])

  function updateInput(v: string) {
    setInput(v)
    const firstTok = v.split(/\s+/)[0]
    if (v.startsWith('/') && !v.includes(' ')) { setSugs(suggestCommands(firstTok)); setSugIdx(0) }
    else setSugs([])
  }

  function pickSuggestion(c: SlashCommand) { setInput(c.name + ' '); setSugs([]); taRef.current?.focus() }

  async function runCommand(jobId: string, t: string) {
    try {
      const res = await fetch('/api/run', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jobId, command: t, settings }),
      })
      if (!res.body) throw new Error('no stream')
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      const patchRun = (fn: (r: Extract<Msg, { role: 'run' }>) => void) => {
        setMsgs(m => m.map(x => {
          if (x.role !== 'run' || x.id !== jobId) return x
          const y = { ...x }; fn(y as any); return y
        }))
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
            if (payload.cancelled) r.logs = [...r.logs, '⏹ Đã hủy job']
          })
        }
      }
    } catch (e: any) {
      setMsgs(m => m.map(x => x.role === 'run' && x.id === jobId ? { ...x, status: 'error', logs: [...x.logs, '❌ ' + (e?.message || 'lỗi')] } : x))
    }
  }

  async function send(text: string) {
    const t = text.trim()
    if (!t) return
    setInput(''); setSugs([])
    const firstToken = t.split(/\s+/)[0].toLowerCase()

    // /clear /reset — làm mới hội thoại
    if (['/clear', '/reset', '/new'].includes(firstToken)) {
      setMsgs([{ id: uid(), role: 'bot', text: 'Đã làm mới cuộc trò chuyện. Gõ `/` để xem lệnh.' }])
      return
    }
    if (['/help', '/es', '/es-help', '/?'].includes(firstToken)) {
      setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: helpText() }])
      return
    }
    if (!t.startsWith('/')) {
      setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: 'Gõ lệnh bắt đầu bằng `/`. Ví dụ `/es-create Phân số lớp 5 toán`, hoặc `/clear` để làm mới.' }])
      return
    }
    const cmd = findCommand(firstToken)
    if (!cmd) {
      setMsgs(m => [...m, { id: uid(), role: 'user', text: t }, { id: uid(), role: 'bot', text: `Không rõ lệnh \`${firstToken}\`. Gõ \`/help\`.` }])
      return
    }

    const finalCommand = applyComposeMode(t, composeMode)
    const jobId = uid()
    setMsgs(m => [...m,
      { id: uid(), role: 'user', text: finalCommand },
      { id: jobId, role: 'run', command: finalCommand, logs: [], status: 'running', created: [], outputDir: settings?.outputDir || '', startedAt: Date.now() },
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
      if (d.ok) {
        setMsgs(m => [...m, { id: uid(), role: 'upload', name: d.name, filePath: d.path, grade: detectGradeFromUpload(d.name, d.path) }])
      } else {
        setMsgs(m => [...m, { id: uid(), role: 'bot', text: `❌ Upload lỗi: ${d.error || 'không rõ'}` }])
      }
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

  return (
    <>
      <div className="topbar">
        <div><h2>Trợ lý chat</h2><div className="sub">Gõ <code>/</code> để xem lệnh · <code>/clear</code> làm mới · 📎 tải file để review/giải</div></div>
        <div className="top-actions">
          <span className="pill"><Cloud size={14} /> {settings?.outputDir?.split('/').slice(-2).join('/') || 'Output'}</span>
          <span className="pill"><Bot size={14} /> {settings?.defaultWorkerModel || 'model'}</span>
          <span className="pill"><Terminal size={14} /> {runningCount} running</span>
          <button className="btn ghost mini" onClick={() => setMsgs([])}><Trash2 size={14} /> Xóa chat</button>
        </div>
      </div>

      <div className="chat">
        <div className="chat-scroll" ref={scrollRef}>
          <div className="chat-inner">
            {msgs.length === 0 && (
              <div className="chat-empty">
                <h3>Chào anh 👋</h3>
                <p>Gõ <code>/</code> để hiện gợi ý lệnh, bấm 📎 để tải file, hoặc chọn nhanh bên dưới.</p>
                <div className="suggests">
                  {SLASH_COMMANDS.filter(c => c.name !== '/help').map(c => (
                    <button key={c.name} className="suggest" onClick={() => setInput(c.example)}>{c.example}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map(m => <MsgView key={m.id} msg={m} onRun={send} />)}
          </div>
        </div>

        <div className="composer">
          <div className="compose-options">
            <span className="compose-label">Kiểu soạn</span>
            {COMPOSE_MODES.map(m => (
              <button
                key={m.value}
                type="button"
                className={`compose-chip ${composeMode === m.value ? 'active' : ''}`}
                title={m.hint}
                onClick={() => setComposeMode(m.value)}
              >
                {m.label}
              </button>
            ))}
            <span className="compose-hint">Áp dụng cho /es-create, /topic, /soan</span>
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
              placeholder="Gõ lệnh (mỗi Enter = 1 job). /clear để làm mới. 📎 tải file để review/giải."
              onChange={e => updateInput(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <button className="send-btn" disabled={!input.trim()} onClick={() => send(input)}><Send size={19} /></button>
          </div>
        </div>
      </div>
    </>
  )
}

function MsgView({ msg, onRun }: { msg: Msg; onRun: (t: string) => void }) {
  if (msg.role === 'upload') return <UploadMsg msg={msg} onRun={onRun} />
  if (msg.role === 'run') {
    return (
      <div className="msg bot">
        <div className="avatar bot"><Terminal size={17} /></div>
        <div className="bubble run-bubble">
          <div className="run-head redesigned">
            <div className="run-command" title={msg.command}>{msg.command}</div>
            <span className={`status ${msg.status === 'done' ? 'ok' : msg.status === 'error' ? 'err' : 'run'}`}>{msg.status === 'done' ? 'Hoàn tất' : msg.status === 'error' ? 'Lỗi' : 'Đang chạy…'}</span>
          </div>
          <AgentFlow current={msg.agent} status={msg.status} command={msg.command} />
          {msg.status === 'error' && (
            <div className="error-card">
              <div className="error-title">Không chạy được job</div>
              <div className="error-line" title={lastErrorLine(msg.logs)}>{lastErrorLine(msg.logs)}</div>
              <button className="btn ghost mini" onClick={() => onRun(msg.command)}><RefreshCw size={13} /> Thử lại</button>
            </div>
          )}
          {msg.logs.length > 0 && <pre className="run-log compact">{msg.logs.slice(-40).join('\n')}</pre>}
          {msg.status !== 'running' && (
            msg.created.length > 0 ? (
              <div className="created">
                <div className="created-title">📄 File kết quả:</div>
                {msg.created.map(name => (
                  <a key={name} className="file-link" href={fileUrl(msg.outputDir, 'preview', name)} target="_blank" rel="noreferrer">
                    <Eye size={14} /> {name}
                  </a>
                ))}
              </div>
            ) : msg.status === 'done' ? <div className="created-empty">Xong. Chưa phát hiện file mới trong Output (có thể engine ghi vào thư mục con).</div> : null
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
  const gradeText = normalizeGrade(grade)
  const gradeListId = `grade-options-${msg.id}`
  return (
    <div className="msg bot">
      <div className="avatar bot"><Paperclip size={17} /></div>
      <div className="bubble upload-bubble">
        <div className="upload-name">📎 Đã tải lên: <b>{msg.name}</b></div>
        <div className="upload-path" title={msg.filePath}>{shortPath(msg.filePath)}</div>
        <div className="upload-grade-row">
          <label>Lớp</label>
          <input
            value={grade}
            list={gradeListId}
            placeholder="VD: lớp 5 hoặc G5"
            onChange={e => setGrade(e.target.value)}
          />
          <datalist id={gradeListId}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <option key={n} value={`lớp ${n}`} />)}
          </datalist>
          <span className="hint">Dùng cho review/giải chính xác hơn</span>
        </div>
        <div className="upload-actions">
          <button className="btn primary mini" onClick={() => onRun(`/es-review ${msg.filePath} ${gradeText} toán`)}>Nhận xét (review)</button>
          <button className="btn secondary mini" onClick={() => onRun(`/es-solve ${msg.filePath} ${gradeText} toán`)}>Giải chi tiết</button>
        </div>
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
  const m = s.match(/(?:^|[^a-z0-9])G\s*([1-9])(?:[^0-9]|$)/i)
    || s.match(/l[ớo]p\s*([1-9])/i)
    || s.match(/(?:^|[^a-z0-9])grade\s*([1-9])(?:[^0-9]|$)/i)
  return m ? `lớp ${m[1]}` : 'lớp 4'
}

function normalizeGrade(value: string) {
  const v = value.trim()
  const m = v.match(/(?:^|[^0-9])([1-9])(?:[^0-9]|$)/)
  if (m) return `lớp ${m[1]}`
  return v || 'lớp 4'
}

function lastErrorLine(logs: string[]) {
  const line = [...logs].reverse().find(x => /failed|fetch|error|lỗi|quota|rate|429/i.test(x)) || logs[logs.length - 1] || 'Có lỗi khi chạy job.'
  return line.replace(/^❌\s*/, '').trim()
}

function helpText() {
  const base = SLASH_COMMANDS.filter(c => c.name !== '/help').map(c => `\`${c.name}\` — ${c.label}\n   ${c.usage}`).join('\n\n')
  return base + '\n\n`/clear` hoặc `/reset` — làm mới cuộc trò chuyện'
}

function QueueView({ items, setMsgs }: { items: Extract<Msg, { role: 'run' }>[]; setMsgs: React.Dispatch<React.SetStateAction<Msg[]>> }) {
  async function cancelJob(jobId: string) {
    await fetch(`/api/run?jobId=${encodeURIComponent(jobId)}`, { method: 'DELETE' }).catch(() => null)
    setMsgs(m => m.map(x => x.role === 'run' && x.id === jobId ? { ...x, status: 'error', logs: [...x.logs, '⏹ Đã gửi lệnh hủy'] } : x))
  }
  function removeJob(jobId: string) { setMsgs(m => m.filter(x => x.id !== jobId)) }
  function clearFinished() { setMsgs(m => m.filter(x => x.role !== 'run' || x.status === 'running')) }

  return (
    <>
      <div className="topbar">
        <div><h2>Queue</h2><div className="sub">Hàng đợi xử lý · flow agent từ trái sang phải</div></div>
        <div className="top-actions"><button className="btn ghost" onClick={clearFinished}>Xóa job đã xong/lỗi</button></div>
      </div>
      <div className="content">
        <div className="card">
          {items.length === 0 ? <p className="desc">Chưa có job nào.</p> : (
            <table className="table">
              <thead><tr><th>Lệnh</th><th>Trạng thái</th><th>Agent</th><th>Bắt đầu</th><th>Logs</th><th></th></tr></thead>
              <tbody>
                {items.map(job => (
                  <tr key={job.id}>
                    <td className="wrap-cell">{job.command}</td>
                    <td><span className={`status ${job.status === 'done' ? 'ok' : job.status === 'error' ? 'err' : 'run'}`}>{job.status}</span></td>
                    <td>{job.status === 'running' ? (job.agent || '—') : job.status === 'done' ? 'Word' : '—'}</td>
                    <td>{new Date(job.startedAt).toLocaleString('vi-VN')}</td>
                    <td>{job.logs.length}</td>
                    <td>
                      <div className="inline-actions">
                        {job.status === 'running' && <button className="btn ghost mini" onClick={() => cancelJob(job.id)}>Hủy</button>}
                        <button className="btn ghost mini" onClick={() => removeJob(job.id)}>Xóa</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {items.slice(0, 4).map(job => (
          <div className="card" key={`detail_${job.id}`}>
            <div className="split-head">
              <div>
                <h3>{job.command}</h3>
                <p className="desc">{job.status === 'running' ? `Đang chạy — bước: ${job.agent || '...'}` : job.status === 'done' ? 'Đã xong' : 'Có lỗi'}</p>
              </div>
              <div className="inline-actions">
                {job.status === 'running' && <button className="btn ghost mini" onClick={() => cancelJob(job.id)}>Hủy job</button>}
                <button className="btn ghost mini" onClick={() => removeJob(job.id)}>Xóa khỏi queue</button>
              </div>
            </div>
            <AgentFlow current={job.agent} status={job.status} command={job.command} />
            {job.logs.length > 0 && <pre className="run-log">{job.logs.slice(-60).join('\n')}</pre>}
            {job.created.length > 0 && <div className="created">{job.created.map(name => <a key={name} className="file-link" href={fileUrl(job.outputDir, 'preview', name)} target="_blank" rel="noreferrer"><Eye size={14} /> {name}</a>)}</div>}
          </div>
        ))}
      </div>
    </>
  )
}

function Files({ settings }: { settings: SettingsShape | null }) {
  const [files, setFiles] = useState<any[]>([])
  const [folders, setFolders] = useState<any[]>([])
  const [root, setRoot] = useState('')
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    const q = settings?.outputDir ? `?root=${encodeURIComponent(settings.outputDir)}` : ''
    fetch('/api/files' + q).then(r => r.json()).then(d => { setFiles(d.files || []); setFolders(d.folders || []); setRoot(d.root || '') }).finally(() => setLoading(false))
  }
  useEffect(load, [settings])
  const fmt = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`

  return (
    <>
      <div className="topbar">
        <div><h2>Kết quả (Output)</h2><div className="sub">{root}</div></div>
        <div className="top-actions"><button className="btn ghost" onClick={load}><RefreshCw size={15} /> Làm mới</button></div>
      </div>
      <div className="content">
        <div className="card">
          <h3>Thư mục</h3>
          <p className="desc">Hiện các folder trong Output.</p>
          {loading ? <p>Đang tải…</p> : folders.length === 0 ? <p className="desc">Chưa có folder nào.</p> : (
            <table className="table">
              <thead><tr><th>Folder</th><th>Sửa lúc</th></tr></thead>
              <tbody>{folders.map(f => (<tr key={f.rel}><td className="wrap-cell">{f.rel}</td><td>{new Date(f.mtime).toLocaleString('vi-VN')}</td></tr>))}</tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>File .docx / .pdf</h3>
          <p className="desc">Chỉ hiện file tài liệu đầu ra.</p>
          {loading ? <p>Đang tải…</p> : files.length === 0 ? <p className="desc">Chưa có file .docx hoặc .pdf nào.</p> : (
            <table className="table">
              <thead><tr><th>File</th><th>Loại</th><th>Kích thước</th><th>Sửa lúc</th><th></th></tr></thead>
              <tbody>
                {files.map(f => (
                  <tr key={f.rel}>
                    <td className="wrap-cell">
                      <a className="file-name-link" href={fileUrl(root, 'preview', f.rel)} target="_blank" rel="noreferrer">
                        <FileText size={14} /> {f.rel}
                      </a>
                    </td><td>{f.ext}</td><td>{fmt(f.size)}</td>
                    <td>{new Date(f.mtime).toLocaleString('vi-VN')}</td>
                    <td><a className="file-link" href={fileUrl(root, 'download', f.rel)}><Download size={14} /> Tải</a></td>
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

function Dashboard({ settings, queue }: { settings: SettingsShape | null; queue: Extract<Msg, { role: 'run' }>[] }) {
  const done = queue.filter(q => q.status === 'done').length
  const running = queue.filter(q => q.status === 'running').length
  const failed = queue.filter(q => q.status === 'error').length
  return (
    <>
      <div className="topbar"><div><h2>Bảng điều khiển</h2><div className="sub">Cấu hình hệ thống và thống kê queue</div></div></div>
      <div className="content">
        <div className="stats-grid">
          <div className="card stat-card"><h3>{running}</h3><p className="desc">Job đang chạy</p></div>
          <div className="card stat-card"><h3>{done}</h3><p className="desc">Job hoàn tất</p></div>
          <div className="card stat-card"><h3>{failed}</h3><p className="desc">Job lỗi</p></div>
        </div>
        <div className="card">
          <h3>Cấu hình</h3>
          <p className="desc">Đọc từ máy chủ. Chỉnh trong tab Cài đặt.</p>
          <table className="table"><tbody>
            <tr><td><b>Nơi lưu (Output)</b></td><td>{settings?.outputDir || '—'}</td></tr>
            <tr><td><b>Workspace</b></td><td>{settings?.workspaceDir || '—'}</td></tr>
            <tr><td><b>Engine eduSkill</b></td><td>{settings?.eduSkillDir || '—'}</td></tr>
            <tr><td><b>Model router</b></td><td>{settings?.routerBaseUrl || '—'}</td></tr>
            <tr><td><b>Model mặc định</b></td><td>{settings?.defaultWorkerModel || '—'}</td></tr>
            <tr><td><b>Fallback models</b></td><td className="wrap-cell">{settings?.fallbackModels || '—'}</td></tr>
          </tbody></table>
        </div>
      </div>
    </>
  )
}

function SettingsView({ settings, onSaved }: { settings: SettingsShape | null; onSaved: (s: SettingsShape) => void }) {
  const [form, setForm] = useState<SettingsShape | null>(settings)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [info, setInfo] = useState<any>(null)
  const [loadingInfo, setLoadingInfo] = useState(false)
  const [editPath, setEditPath] = useState<string | null>(null)

  useEffect(() => { setForm(settings) }, [settings])

  const loadInfo = () => {
    if (!form) return
    setLoadingInfo(true)
    const q = `?eduSkillDir=${encodeURIComponent(form.eduSkillDir)}&hermesHome=${encodeURIComponent((settings as any)?.hermesHome || '')}`
    fetch('/api/eduskill-info' + q).then(r => r.json()).then(setInfo).finally(() => setLoadingInfo(false))
  }
  useEffect(() => { if (form) loadInfo() }, [form?.eduSkillDir])

  if (!form) return <><div className="topbar"><h2>Cài đặt</h2></div><div className="content">Đang tải…</div></>
  const set = (k: keyof SettingsShape, v: any) => setForm(f => ({ ...(f as SettingsShape), [k]: v }))

  async function save() {
    setSaving(true); setSaved(false)
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const d = await r.json()
      if (d.ok) { onSaved(d.settings); setSaved(true); setTimeout(() => setSaved(false), 2500) }
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="topbar"><div><h2>Cài đặt</h2><div className="sub">Nơi lưu, engine, model, fallback, Drive — chỉnh ngay trên web</div></div></div>
      <div className="content">
        <div className="card">
          <h3>Nơi lưu & thư mục</h3>
          <p className="desc">Đường dẫn hệ thống nơi eduSkill đọc/ghi file.</p>
          <div className="form">
            <div className="field"><label>Nơi lưu kết quả (Output)</label><input value={form.outputDir} onChange={e => set('outputDir', e.target.value)} /><span className="hint">File .docx/.pdf sinh ra lưu ở đây.</span></div>
            <div className="field"><label>Thư mục Workspace</label><input value={form.workspaceDir} onChange={e => set('workspaceDir', e.target.value)} /></div>
            <div className="field"><label>Thư mục eduSkill (engine)</label><input value={form.eduSkillDir} onChange={e => set('eduSkillDir', e.target.value)} /><span className="hint">Chứa slash.mjs — nơi web app gọi chạy thật.</span></div>
          </div>
        </div>

        <div className="card">
          <h3>Model, Router & Fallback</h3>
          <p className="desc">Cấu hình 9Router, model mặc định và tự động chuyển model khi hết quota.</p>
          <div className="form">
            <div className="row2">
              <div className="field"><label>Router base URL</label><input value={form.routerBaseUrl} onChange={e => set('routerBaseUrl', e.target.value)} /></div>
              <div className="field"><label>Model mặc định</label><input value={form.defaultWorkerModel} onChange={e => set('defaultWorkerModel', e.target.value)} /></div>
            </div>
            <div className="field">
              <label>Chuỗi fallback models (khi hết quota → tự chuyển)</label>
              <textarea value={form.fallbackModels} onChange={e => set('fallbackModels', e.target.value)} />
              <span className="hint">Danh sách cách nhau bằng dấu phẩy. Model chính lỗi/hết quota sẽ nhảy sang model kế.</span>
            </div>
            <div className="row2">
              <div className="field"><label>Số lần retry mỗi model</label><input type="number" min={1} value={form.modelRetries} onChange={e => set('modelRetries', Number(e.target.value))} /></div>
              <div className="field"><label>Delay giữa các retry (ms)</label><input type="number" min={0} value={form.retryDelayMs} onChange={e => set('retryDelayMs', Number(e.target.value))} /></div>
            </div>
            <label className="check-row"><input type="checkbox" checked={form.useSummary} onChange={e => set('useSummary', e.target.checked)} /> Dùng --summary khi tạo chuyên đề</label>
          </div>
        </div>

        <div className="card">
          <h3>Google Drive</h3>
          <p className="desc">Thư mục Kitee dùng để upload/chia sẻ.</p>
          <div className="form">
            <div className="field"><label>Drive Folder ID</label><input value={form.driveParentId} onChange={e => set('driveParentId', e.target.value)} /></div>
            <div className="field"><label>Drive Folder URL</label><input value={form.driveFolderUrl} onChange={e => set('driveFolderUrl', e.target.value)} /></div>
            <label className="check-row"><input type="checkbox" checked={form.uploadDrive} onChange={e => set('uploadDrive', e.target.checked)} /> Tự động upload lên Drive sau khi tạo</label>
          </div>
        </div>

        <div className="card">
          <div className="split-head">
            <div><h3>Agents & Skills (eduSkill)</h3><p className="desc">Bấm vào một mục để sửa nội dung ngay trên web. Chỉ hiện skill phục vụ eduSkill.</p></div>
            <button className="btn ghost mini" onClick={loadInfo}><RefreshCw size={14} /> Làm mới</button>
          </div>
          {loadingInfo ? <p className="desc">Đang tải…</p> : info?.ok ? (
            <div className="info-grid">
              <div>
                <div className="info-title">Agents ({info.agents?.length || 0})</div>
                <div className="chip-row">{(info.agents || []).map((a: any) => (
                  <button className="chip chip-btn" key={a.path} onClick={() => setEditPath(a.path)}><Pencil size={12} /> {a.name}</button>
                ))}</div>
              </div>
              <div>
                <div className="info-title">Server modules ({info.serverModules?.length || 0})</div>
                <div className="chip-row">{(info.serverModules || []).map((a: any) => (
                  <button className="chip chip-btn" key={a.path} onClick={() => setEditPath(a.path)}><Pencil size={12} /> {a.name}</button>
                ))}</div>
              </div>
              <div>
                <div className="info-title">Skills eduSkill ({info.skills?.length || 0})</div>
                <div className="skill-list">{(info.skills || []).map((a: any) => (
                  <button className="skill-item" key={a.path} onClick={() => setEditPath(a.path)}>
                    <div className="skill-name"><Pencil size={12} /> {a.name}</div>
                    {a.description && <div className="skill-desc">{a.description}</div>}
                  </button>
                ))}</div>
                {(!info.skills || info.skills.length === 0) && <p className="desc">Không tìm thấy skill eduSkill trong Hermes home.</p>}
              </div>
            </div>
          ) : <p className="desc">Không đọc được thông tin engine. Kiểm tra đường dẫn eduSkill.</p>}
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
    fetch('/api/file?path=' + encodeURIComponent(path))
      .then(r => r.json())
      .then(d => { if (d.ok) setContent(d.content); else setErr(d.error || 'Không đọc được') })
      .catch(() => setErr('Lỗi kết nối'))
      .finally(() => setLoading(false))
  }, [path])

  async function save() {
    setSaving(true); setErr(''); setMsg('')
    try {
      const r = await fetch('/api/file', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, content }) })
      const d = await r.json()
      if (d.ok) { setMsg('✓ Đã lưu (đã backup .bak)'); setTimeout(() => setMsg(''), 2500) }
      else setErr(d.error || 'Không lưu được')
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
