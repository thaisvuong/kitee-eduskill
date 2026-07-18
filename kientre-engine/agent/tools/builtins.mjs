// Built-in tools for the mini-agent loop. Registered on import.
// ctx carries: { sources, outputDir, workspaceDir, grade, subject, moduleKey, onNote }
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { register, safeResolve } from './registry.mjs'
import { searchWeb } from '../../server/websearch.mjs'
import { notebookRefs } from '../../server/notebook.mjs'
import { extractText } from '../../server/extract.mjs'
import { buildWord, slugify } from '../../server/build.mjs'
import { composeDocument } from '../../orchestrator.mjs'
import { runExam, runSolve, runReview, runQuizSet } from '../../runners.mjs'

// ── read_source: read one of the pre-loaded reference documents ────────────
register('read_source',
 {
  name: 'read_source',
  description: 'Đọc nội dung một tài liệu nguồn đã được nạp làm căn cứ. Trả về text để bạn phân tích/trích dẫn. Nếu không truyền id thì trả danh sách source hiện có.',
  parameters: {
   type: 'object',
   properties: {
    id: { type: 'string', description: 'id hoặc tiêu đề source cần đọc; bỏ trống để liệt kê' },
   },
  },
 },
 async (args, ctx) => {
  const items = ctx.sources || []
  if (!args.id) {
   return { available: items.map(s => ({ id: s.id, title: s.title, chars: (s.content || '').length })) }
  }
  const s = items.find(x => x.id === args.id || (x.title || '').toLowerCase() === String(args.id).toLowerCase())
  if (!s) return { error: `không tìm thấy source "${args.id}"`, available: items.map(x => x.id) }
  return { id: s.id, title: s.title, content: String(s.content || '').slice(0, 16000) }
 })

// ── read_notebook: query a linked NotebookLM notebook ──────────────────────
register('read_notebook',
 {
  name: 'read_notebook',
  description: 'Đọc/tóm tắt nguồn từ NotebookLM đã liên kết với module. Nếu không truyền notebookId thì dùng sổ đang active trong module.',
  parameters: {
   type: 'object',
   properties: {
    notebookId: { type: 'string', description: 'ID sổ NotebookLM; bỏ trống để dùng các sổ đã chọn trong module' },
    query: { type: 'string', description: 'câu hỏi/yêu cầu lấy dữ liệu từ notebook' },
   },
   required: ['query'],
  },
 },
 async (args, ctx) => {
  const ids = args.notebookId || (ctx.notebookIds || []).join(',') || ctx.activeNotebookId
  if (!ids) return { error: 'module chưa liên kết NotebookLM' }
  const nb = await notebookRefs(ids, String(args.query || 'Tóm tắt nguồn học liệu chính trong notebook.'))
  if (!nb.ok) return { error: nb.error || 'không đọc được NotebookLM' }
  return { notebookId: ids, chars: (nb.text || '').length, content: String(nb.text || '').slice(0, 16000) }
 })

// ── web_search: fetch reference snippets from the web ──────────────────────
register('web_search',
 {
  name: 'web_search',
  description: 'Tìm tài liệu/bài tập tham khảo trên web theo từ khoá. Trả về danh sách tiêu đề + trích đoạn.',
  parameters: {
   type: 'object',
   properties: { query: { type: 'string' }, n: { type: 'number', description: 'số kết quả, mặc định 5' } },
   required: ['query'],
  },
 },
 async (args) => {
  const results = await searchWeb(String(args.query || ''), Number(args.n) || 5)
  return { results: (results || []).map(r => ({ title: r.title, snippet: (r.snippet || '').slice(0, 500), url: r.url, image_url: r.image_url || '', images: (r.images || []).slice(0, 3).map(img => ({ url: img.url, alt: img.alt || '', context: (img.context || '').slice(0, 220) })) })) }
 })

// ── analyze_document: extract text from an uploaded file (source material) ─
register('analyze_document',
 {
  name: 'analyze_document',
  description: 'Đọc và trích xuất text từ một file tài liệu đã tải lên (docx/pdf/txt/md) để phân tích. Truyền đường dẫn file.',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
 },
 async (args) => {
  const text = await extractText(String(args.path || ''))
  return { path: args.path, chars: text.length, content: text.slice(0, 16000) }
 })

// ── read_file: read a file inside workspace/output only ────────────────────
register('read_file',
 {
  name: 'read_file',
  description: 'Đọc một file text trong thư mục làm việc/kết quả.',
  parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
 },
 async (args, ctx) => {
  const bases = [ctx.outputDir, ctx.workspaceDir].filter(Boolean)
  let lastErr
  for (const base of bases) {
   try {
    const full = safeResolve(base, args.path)
    const text = await fs.readFile(full, 'utf8')
    return { path: full, content: text.slice(0, 16000) }
   } catch (e) { lastErr = e }
  }
  throw lastErr || new Error('không đọc được file')
 })

// ── write_docx: turn a doc model into a .docx via existing builder ─────────
register('write_docx',
 {
  name: 'write_docx',
  description: 'Xuất tài liệu ra file Word (.docx). Truyền docModel gồm title, subject, grade và sections[] (mỗi section: heading + blocks[]). Block dạng {type:"keypoint"|"example"|"exercise"|"list"|"solution"|"subheading", ...}. Gọi tool này khi đã soạn xong nội dung.',
  parameters: {
   type: 'object',
   properties: {
    title: { type: 'string' },
    sections: {
     type: 'array',
     items: {
      type: 'object',
      properties: {
       heading: { type: 'string' },
       blocks: { type: 'array', items: { type: 'object' } },
      },
      required: ['heading', 'blocks'],
     },
    },
   },
   required: ['title', 'sections'],
  },
 },
 async (args, ctx) => {
  const grade = ctx.grade || 'Lớp 5'
  const subject = ctx.subject || 'Toán'
  const g = (String(grade).match(/\d+/) || ['x'])[0]
  const date = new Date().toISOString().split('T')[0]
  const docModel = {
   title: args.title, subject, grade,
   topic: args.title, sections: args.sections || [],
  }
  const folder = `AGENT_G${g}_${date}_${slugify(args.title || 'tai-lieu')}`
  const wordPath = await buildWord(docModel, folder)
  ctx.createdFiles?.push(wordPath)
  return { ok: true, path: wordPath, file: path.basename(wordPath) }
 })

// ── run_skill: reuse the existing hard pipelines as a single tool ──────────
register('run_skill',
 {
  name: 'run_skill',
  description: 'Chạy một quy trình soạn thảo có sẵn (mạnh, ra file .docx hoàn chỉnh). skill: "topic" (soạn chuyên đề), "quiz" (bộ quiz), "exam" (đề kiểm tra), "solve" (giải file), "review" (nhận xét file).',
  parameters: {
   type: 'object',
   properties: {
    skill: { type: 'string', enum: ['topic', 'quiz', 'exam', 'solve', 'review'] },
    topic: { type: 'string' },
    filePath: { type: 'string', description: 'cho solve/review' },
    mc: { type: 'number' }, fill: { type: 'number' }, essay: { type: 'number' },
    quizCount: { type: 'number' }, totalScore: { type: 'number' }, timeMinutes: { type: 'number' },
    special: { type: 'string' },
   },
   required: ['skill'],
  },
 },
 async (args, ctx) => {
  const grade = ctx.grade || 'Lớp 5'
  const subject = ctx.subject || 'Toán'
  const sourceRefs = (ctx.sources || []).map(s => String(s.content || '').trim()).filter(Boolean).join('\n\n').slice(0, 12000)
  const notebook = (ctx.notebookIds || []).join(',') || ctx.activeNotebookId || ''
  const hasExternalSource = !!(sourceRefs || notebook)
  let wordPath
  if (args.skill === 'quiz') wordPath = await runQuizSet({ grade, subject, topic: args.topic || '', quizCount: args.quizCount ?? ctx.quizSpec?.quizCount ?? 3, totalScore: args.totalScore ?? ctx.quizSpec?.totalScore ?? 10, timeMinutes: args.timeMinutes ?? ctx.quizSpec?.timeMinutes ?? 14, reference: sourceRefs, notebook, useWeb: hasExternalSource, onProgress: ctx.onStep })
  else if (args.skill === 'topic') wordPath = await composeDocument(args.topic || '', grade, subject, { depth: 'detailed', special: args.special || '', refs: sourceRefs, notebook, useWeb: hasExternalSource })
  else if (args.skill === 'exam') wordPath = await runExam({ grade, subject, topic: args.topic || '', mc: args.mc || 10, fill: args.fill || 5, essay: args.essay || 3, special: args.special || '', reference: sourceRefs, notebook, useWeb: hasExternalSource })
  else if (args.skill === 'solve') {
   if (!args.filePath) throw new Error('run_skill solve cần filePath')
   wordPath = await runSolve(args.filePath, grade, subject)
  }
  else if (args.skill === 'review') {
   if (!args.filePath) throw new Error('run_skill review cần filePath')
   wordPath = await runReview(args.filePath, grade, subject)
  }
  else throw new Error(`skill không hợp lệ: ${args.skill}`)
  if (wordPath) ctx.createdFiles?.push(wordPath)
  return { ok: true, path: wordPath, file: wordPath ? path.basename(wordPath) : '' }
 })

// ── finish: signal completion ──────────────────────────────────────────────
register('finish',
 {
  name: 'finish',
  description: 'Kết thúc nhiệm vụ. Truyền summary tóm tắt kết quả cho người dùng.',
  parameters: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] },
 },
 async (args) => ({ done: true, summary: args.summary || 'Hoàn tất.' }))

export const ALL_TOOLS = ['read_source', 'read_notebook', 'web_search', 'analyze_document', 'read_file', 'write_docx', 'run_skill', 'finish']
