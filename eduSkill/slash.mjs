#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────
// Sub-Hermes Slash Commands — một cửa ngõ duy nhất cho mọi pipeline.
//
//   /topic     <chủ đề> [lớp N] [môn] [--summary] [--special "…"] [--nb <id>]
//   /test      [chủ đề] [lớp N] [môn] [mc=10] [fill=5] [essay=3] [diem=6]
//   /solve     <đường dẫn tài liệu> [lớp N] [môn]
//   /review    <đường dẫn tài liệu> [lớp N] [môn]
//   /es-create <chủ đề> [lớp N] [môn] [--summary] [--special "…"] [--nb <id>]
//   /es-test   [chủ đề] [lớp N] [môn] [mc=10] [fill=5] [essay=3] [diem=6]
//   /es-solve  <đường dẫn tài liệu> [lớp N] [môn]
//   /es-review <đường dẫn tài liệu> [lớp N] [môn]
//   /help
//
// Cách dùng:
//   node Sub-Hermes/slash.mjs "/topic Phép chia hai chữ số lớp 4 toán"
//   node Sub-Hermes/slash.mjs "/test lớp 5 toán mc=10 fill=5 essay=3"
//   node Sub-Hermes/slash.mjs "/solve ~/Desktop/de.docx lớp 4 toán"
//   node Sub-Hermes/slash.mjs "/review ~/Desktop/bai.docx lớp 4"
//   node Sub-Hermes/slash.mjs        (không tham số -> chế độ tương tác REPL)
// ─────────────────────────────────────────────────────────────────────────
import readline from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const KITEE_WORKSPACE = '/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee'
process.env.HERMES_WORKSPACE_DIR ||= KITEE_WORKSPACE
process.env.HERMES_EDUSKILL_OUTPUT_DIR ||= path.join(process.env.HERMES_WORKSPACE_DIR, 'Output')
process.env.HERMES_HOME ||= '/Users/nguyenthaivuong/.hermes/profiles/cmkitee'
process.env.HERMES_DRIVE_PARENT_ID ||= '18fe276zrUdVAlFOFyKHPtc_8-GpEexKn'
import { composeDocument } from './orchestrator.mjs'
import { runSolve, runReview, runExam } from './runners.mjs'

// Luôn chạy ở thư mục gốc Hermes (cha của Sub-Hermes) để đường dẫn script Python đúng.
const here = path.dirname(fileURLToPath(import.meta.url))   // .../Hermes/Sub-Hermes
process.chdir(path.resolve(here, '..'))                     // .../Hermes

const MON = [
  ['tiếng việt', 'Tiếng Việt'], ['ngữ văn', 'Ngữ văn'], ['văn', 'Ngữ văn'], ['toán', 'Toán'],
  ['tiếng anh', 'Tiếng Anh'], ['anh văn', 'Tiếng Anh'], ['english', 'Tiếng Anh'], ['khoa học', 'Khoa học'],
  ['lịch sử', 'Lịch sử'], ['địa lí', 'Địa lí'], ['địa lý', 'Địa lí'],
  ['tự nhiên', 'Tự nhiên và Xã hội'], ['tin học', 'Tin học'], ['đạo đức', 'Đạo đức'],
]

const ALIASES = {
  '/topic': 'topic', '/chuyende': 'topic', '/soan': 'topic',
  '/test': 'test', '/de': 'test', '/kiemtra': 'test',
  '/solve': 'solve', '/giai': 'solve',
  '/review': 'review', '/nhanxet': 'review',

  // Gói lệnh nhanh eduSkill (/es = education skill): chạy đủ pipeline tương ứng.
  '/es': 'es-help', '/edu-skill': 'es-help', '/eduskill': 'es-help',
  '/es-create': 'topic', '/es-compose': 'topic', '/es-topic': 'topic', '/es-soan': 'topic',
  '/es-test': 'test', '/es-exam': 'test', '/es-de': 'test',
  '/es-solve': 'solve', '/es-giai': 'solve',
  '/es-review': 'review', '/es-nhanxet': 'review',
  '/es-help': 'help', '/help': 'help', '/?': 'help',
}

/** Bóc key=value (mc=10, fill=5, essay=3, diem=6) ra khỏi câu, trả về {opts, rest}. */
function extractKV(text) {
  const opts = {}
  const rest = text.replace(/(\w+)\s*=\s*(\d+)/g, (_, k, v) => { opts[k.toLowerCase()] = +v; return ' ' })
  return { opts, rest }
}

/** Bóc cờ --summary / --special "…" / --nb <id> ra khỏi câu. */
function extractFlags(text) {
  const flags = {}
  let rest = text
  rest = rest.replace(/--summary\b/i, () => { flags.depth = 'summary'; return ' ' })
  rest = rest.replace(/--special\s+"([^"]+)"/i, (_, s) => { flags.special = s; return ' ' })
  rest = rest.replace(/--nb\s+(\S+)/i, (_, s) => { flags.notebook = s; return ' ' })
  return { flags, rest }
}

/** Tách lớp + môn ra khỏi câu, trả về {grade, subject, rest}. */
function extractGradeSubject(text) {
  let rest = text, grade = '', subject = ''
  const g = rest.match(/l[ớo]p\s*(\d+)/i)
  if (g) { grade = `Lớp ${g[1]}`; rest = rest.replace(g[0], ' ') }
  for (const [k, v] of MON) {
    const re = new RegExp(`(môn\\s+)?${k}`, 'i')
    if (re.test(rest)) { subject = v; rest = rest.replace(re, ' '); break }
  }
  return { grade, subject, rest: rest.replace(/\s{2,}/g, ' ').trim() }
}

/**
 * Chuẩn hóa notebook: chấp nhận cả ID thô lẫn full link NotebookLM.
 *   d06809a7-…                 → d06809a7-…
 *   https://notebooklm.google.com/notebook/d06809a7-…  → d06809a7-…
 */
function normalizeNotebook(s) {
  if (!s) return ''
  const m = String(s).match(/notebooklm\.google\.com\/notebook\/([\w-]{8,})/i)
    || String(s).match(/^([\w-]{8,})$/)
  return m ? m[1] : ''
}

/**
 * Tự động "đọc hiểu" câu lệnh người dùng:
 *  - phát hiện link NotebookLM → trả về { notebook }
 *  - phát hiện ý định hình ảnh minh họa → trả về { visuals: true }
 * Dùng trên toàn bộ câu gốc (body) trước khi tách lớp/môn/chủ đề.
 */
function enrichFromText(text) {
  const out = {}
  const nb = String(text).match(/notebooklm\.google\.com\/notebook\/([\w-]{8,})/i)
  if (nb) out.notebook = nb[1]
  if (/\b(hình ảnh|minh họa|có hình|có ảnh|vẽ hình)\b/i.test(text)) out.visuals = true
  return out
}

/** Loại bỏ ghi chú phụ (trong ngoặc) và cụm ý định hình khỏi chủ đề. */
function stripDecorations(t) {
  return String(t || '')
    .replace(/\([^)]*\)/g, ' ')                                  // bỏ toàn bộ ngoặc đơn
    .replace(/\b(có hình ảnh minh họa nhé|có hình ảnh minh họa|có hình ảnh|có ảnh|minh họa|vẽ hình)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ').trim()
}

function cleanTopic(t) {
  t = String(t || '').replace(/^\s*(soạn( bài)?|bài|chủ đề|đề|về)\s*[:\-]?\s*/i, '')
    .replace(/\s{2,}/g, ' ').replace(/^[\s:\-]+|[\s:\-]+$/g, '').trim()
  return t ? t[0].toUpperCase() + t.slice(1) : t
}

function cleanPath(p) {
  return String(p || '').trim().replace(/^['"]|['"]$/g, '').replace(/\\ /g, ' ').trim()
}

/**
 * Bóc lớp + môn cho lệnh /solve, /review nhưng GIỮ NGUYÊN khoảng trắng trong path.
 * Lý do: tên file upload có thể chứa 2 dấu cách liên tiếp; nếu normalize \s{2,}
 * thì path bị đổi và PDF/DOCX không còn tìm thấy trên disk.
 */
function extractGradeSubjectPreservePath(text) {
  let rest = String(text || '')
  let grade = '', subject = ''
  const g = rest.match(/l[ớo]p\s*(\d+)/i)
  if (g) { grade = `Lớp ${g[1]}`; rest = rest.slice(0, g.index) + ' ' + rest.slice((g.index || 0) + g[0].length) }
  for (const [k, v] of MON) {
    const re = new RegExp(`(môn\\s+)?${k}`, 'i')
    const m = rest.match(re)
    if (m) { subject = v; rest = rest.slice(0, m.index) + ' ' + rest.slice((m.index || 0) + m[0].length); break }
  }
  return { grade, subject, rest: rest.trim() }
}

const HELP = `
════════════════════════════════════════════════════
   SUB-HERMES / eduSkill — Lệnh nhanh (slash commands)
════════════════════════════════════════════════════
  /topic  <chủ đề> [lớp N] [môn] [--summary] [--special "…"] [--nb <id>]
          → Soạn CHUYÊN ĐỀ đầy đủ (lý thuyết + ví dụ + bài tập + đáp án)
          vd:  /topic Phép chia hai chữ số lớp 4 toán

  /es-create <chủ đề> [lớp N] [môn] [--summary] [--special "…"] [--nb <id>]
          → Alias nhanh cho /topic; chạy đủ flow Architect → nguồn → Judge → bài tập → Word
          vd:  /es-create Phân số lớp 5 toán --summary

  /test   [chủ đề] [lớp N] [môn] [mc=10] [fill=5] [essay=3] [diem=6]
          → Soạn ĐỀ KIỂM TRA (trắc nghiệm + điền + tự luận) kèm biểu điểm
          vd:  /test phân số lớp 5 toán mc=12 fill=4 essay=3

  /es-test [chủ đề] [lớp N] [môn] [mc=10] [fill=5] [essay=3] [diem=6]
          → Alias nhanh cho /test; chạy đủ flow Examiner → đề Word + lời giải/biểu điểm
          vd:  /es-test hình học lớp 4 toán mc=8 fill=4 essay=2

  /solve  <đường dẫn tài liệu> [lớp N] [môn]
          → GIẢI chi tiết mọi câu trong tài liệu
          vd:  /solve ~/Desktop/de.docx lớp 4 toán

  /es-solve <đường dẫn tài liệu> [lớp N] [môn]
          → Alias nhanh cho /solve; chạy đủ flow extract → Solver → Word lời giải
          vd:  /es-solve ~/Desktop/de.docx lớp 4 toán

  /review <đường dẫn tài liệu> [lớp N] [môn]
          → NHẬN XÉT / thẩm định tài liệu (điểm mạnh, cần cải thiện, lỗi)
          vd:  /review ~/Desktop/bai.docx lớp 4

  /es-review <đường dẫn tài liệu> [lớp N] [môn]
          → Alias nhanh cho /review; chạy đủ flow extract → Reviewer → Word nhận xét
          vd:  /es-review ~/Desktop/bai.docx lớp 4 toán

  /es, /es-help, /help   → hiện bảng này
════════════════════════════════════════════════════
`

/** Điều phối một dòng lệnh slash. Trả về đường dẫn kết quả (nếu có). */
export async function runSlash(line) {
  const raw = String(line || '').trim()
  if (!raw) { console.log(HELP); return }

  const m = raw.match(/^(\/\S+)\s*([\s\S]*)$/)
  if (!m) { console.log('⚠️  Lệnh phải bắt đầu bằng "/". Gõ /help để xem hướng dẫn.'); return }

  const cmd = ALIASES[m[1].toLowerCase()]
  let body = m[2].trim()

  if (!cmd) { console.log(`⚠️  Không rõ lệnh "${m[1]}". Gõ /help.`); return }
  if (cmd === 'help' || cmd === 'es-help') { console.log(HELP); return }

  // ── /solve, /review: đối số đầu tiên là ĐƯỜNG DẪN FILE ──
  if (cmd === 'solve' || cmd === 'review') {
    const { grade: g0, subject: s0, rest } = extractGradeSubjectPreservePath(body)
    const file = cleanPath(rest)
    if (!file) { console.log(`⚠️  Thiếu đường dẫn tài liệu.  vd: /${cmd} ~/Desktop/bai.docx lớp 4 toán`); return }
    const grade = g0 || 'Lớp 4'
    const subject = s0 || 'Toán'
    console.log(`\n▶  ${cmd === 'solve' ? 'GIẢI' : 'NHẬN XÉT'}: ${file}  |  ${grade}  |  ${subject}`)
    return cmd === 'solve' ? runSolve(file, grade, subject) : runReview(file, grade, subject)
  }

  // ── /test: đề kiểm tra ──
  if (cmd === 'test') {
    const { opts, rest: r1 } = extractKV(body)
    const { flags, rest: r2 } = extractFlags(r1)
    const { grade: g0, subject: s0, rest } = extractGradeSubject(r2)
    const extraT = enrichFromText(body)
    const topic = cleanTopic(stripDecorations(rest))
    const params = {
      grade: g0 || 'Lớp 5', subject: s0 || 'Toán', topic,
      mc: opts.mc || 0, fill: opts.fill || 0, essay: opts.essay || 0,
      essayPoints: opts.diem || opts.essaypoints || 6,
      special: flags.special || '', notebook: normalizeNotebook(flags.notebook || extraT.notebook),
    }
    if (!params.mc && !params.fill && !params.essay) { params.mc = 10; params.fill = 5; params.essay = 3 }  // mặc định hợp lý
    console.log(`\n▶  ĐỀ KIỂM TRA: "${topic || '(tổng hợp)'}"  |  ${params.grade}  |  ${params.subject}  |  ${params.mc}TN·${params.fill}ĐĐ·${params.essay}TL`)
    return runExam(params)
  }

  // ── /topic: chuyên đề đầy đủ ──
  if (cmd === 'topic') {
    const { flags, rest: r1 } = extractFlags(body)
    const { grade: g0, subject: s0, rest: r2 } = extractGradeSubject(r1)
    const extra = enrichFromText(body)            // tự phát hiện link NotebookLM & ý định hình ảnh
    const topic = cleanTopic(stripDecorations(r2))
    if (!topic) { console.log('⚠️  Thiếu chủ đề.  vd: /topic Phép chia hai chữ số lớp 4 toán'); return }
    const notebook = normalizeNotebook(flags.notebook || extra.notebook)
    const specialParts = [flags.special]
    if (extra.visuals) {                            // tự hiểu "có hình ảnh minh họa" → bật hình
      process.env.HERMES_VISUALS = 'force'
      specialParts.push('Ưu tiên thêm hình ảnh minh họa sư phạm (ảnh thật hoặc vẽ hình) cho chủ đề này')
    }
    const grade = g0 || 'Lớp 4'
    const subject = s0 || 'Toán'
    console.log(`\n▶  CHUYÊN ĐỀ: "${topic}"  |  ${grade}  |  ${subject}${flags.depth === 'summary' ? '  |  TÓM TẮT' : ''}${notebook ? '  |  📓 NB' : ''}${extra.visuals ? '  |  🖼 ẢNH' : ''}`)
    return composeDocument(topic, grade, subject, { depth: flags.depth || 'detailed', special: specialParts.filter(Boolean).join('. '), notebook })
  }
}

/** REPL: gõ lệnh /… liên tục cho tới khi /quit hoặc Ctrl-C. */
async function repl() {
  const rl = readline.createInterface({ input: stdin, output: stdout })
  console.log(HELP)
  console.log('Gõ lệnh (hoặc /quit để thoát):')
  while (true) {
    const line = (await rl.question('\nsub-hermes ▸ ')).trim()
    if (!line) continue
    if (/^\/(quit|exit|q)\b/i.test(line)) break
    try { await runSlash(line) }
    catch (err) { console.error('\n❌ Lỗi:', err.message) }
  }
  rl.close()
  console.log('\n👋 Tạm biệt!')
}

// ── Điểm vào ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.slice(2).join(' ').trim()
  if (arg) {
    runSlash(arg).catch(err => { console.error('\n❌ Lỗi:', err.message); process.exitCode = 1 })
  } else {
    repl()
  }
}
