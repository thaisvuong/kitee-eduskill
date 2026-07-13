import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { extractText } from './server/extract.mjs'
import { buildWord, slugify } from './server/build.mjs'
import { designWord } from './server/compiler.mjs'
import { solveDocument } from './agents/solver.mjs'
import { reviewDocument } from './agents/reviewer.mjs'
import { runJudge } from './agents/judge.mjs'
import { generateExam } from './agents/examiner.mjs'
import { fetchExerciseSources } from './server/websearch.mjs'
import { notebookRefs } from './server/notebook.mjs'

function dateStr() { return new Date().toISOString().split('T')[0] }
function gradeNum(grade) { const m = String(grade).match(/\d+/); return m ? m[0] : 'x' }
function judgeBoundaries(grade, subject) {
  return [
    `Phải đúng chương trình ${subject} ${grade}`,
    `Không dùng kiến thức/phương pháp vượt cấp so với ${grade}`,
    'Không được sai đáp án, sai đơn vị, thiếu dữ kiện hoặc lập luận mơ hồ',
    'Cách trình bày phải đủ rõ để giáo viên kiểm tra lại trước khi dùng',
  ]
}
function reviewSummaryBlocks(review, judge) {
  const items = []
  if (judge) items.push(`Judge: ${judge.status || 'UNKNOWN'} — ${judge.reason || ''}`)
  if (review) {
    items.push(`Reviewer: ${review.verdict || 'UNKNOWN'}${review.score ? ` (${review.score})` : ''} — ${review.overall || ''}`)
    for (const x of [...(review.blockingErrors || []), ...(review.errors || []), ...(review.requiredFixes || [])].slice(0, 8)) items.push(x)
  }
  return [{ type: 'keypoint', title: 'KIỂM ĐỊNH TRƯỚC KHI DÙNG', text: items.join('\n') || 'Đã kiểm tra.' }]
}

const execFileAsync = promisify(execFile)
function hermesHome() { return process.env.HERMES_HOME || path.join(process.env.HOME, '.hermes') }
function googleApiPath() { return path.join(hermesHome(), 'skills/productivity/google-workspace/scripts/google_api.py') }
async function driveCreateFolder(name, parentId = '') {
  const args = [googleApiPath(), 'drive', 'create-folder', name]
  if (parentId) args.push('--parent', parentId)
  const { stdout } = await execFileAsync('python3', args, { env: { ...process.env, HERMES_HOME: hermesHome() } })
  return JSON.parse(stdout || '{}')
}
async function driveUpload(filePath, parentId = '') {
  const args = [googleApiPath(), 'drive', 'upload', filePath, '--name', path.basename(filePath)]
  if (parentId) args.push('--parent', parentId)
  const { stdout } = await execFileAsync('python3', args, { env: { ...process.env, HERMES_HOME: hermesHome() } })
  return JSON.parse(stdout || '{}')
}
async function maybeUploadFiles(filePaths, folderName) {
  if (process.env.HERMES_UPLOAD_DRIVE !== '1') return
  try {
    const parentId = process.env.HERMES_DRIVE_PARENT_ID || process.env.KITEE_DRIVE_FOLDER_ID || ''
    const folder = await driveCreateFolder(folderName, parentId)
    const folderId = folder.id || parentId
    const uploaded = []
    for (const filePath of filePaths.filter(Boolean)) {
      console.log(`☁️  Đang tải lên Drive: ${path.basename(filePath)}...`)
      uploaded.push(await driveUpload(filePath, folderId))
    }
    const links = uploaded.map(f => f.webViewLink).filter(Boolean)
    console.log(`✅ Đã tải ${uploaded.length} file lên Google Drive trong thư mục: ${folder.name || folderName}`)
    if (links.length) console.log(`🔗 Drive links:\n${links.join('\n')}`)
  } catch (driveErr) {
    console.warn(`⚠️ Không thể tải lên Drive (${driveErr.message}). File vẫn được lưu cục bộ.`)
  }
}

/** PIPELINE 1: tài liệu -> lời giải chi tiết -> Word. */
export async function runSolve(filePath, grade, subject = 'Toán') {
  console.log(`\n📖 Đọc tài liệu: ${filePath}`)
  const text = await extractText(filePath)
  if (!text.trim()) throw new Error('Tệp rỗng hoặc không đọc được nội dung.')
  console.log(`🧮 Agent Giải bài đang giải chi tiết (đúng ${grade})...`)
  const { title, solutions } = await solveDocument(text, grade, subject)
  if (!solutions.length) throw new Error('Không tìm thấy câu hỏi nào để giải trong tài liệu.')

  const solvedText = solutions.map(s => `${s.title || 'Câu'}\nĐề: ${s.question || ''}\nLời giải: ${s.solution || ''}`).join('\n\n')
  console.log(`⚖️ Agent Judge đang kiểm tra lời giải & ranh giới lớp học (${grade})...`)
  const judge = await runJudge(solvedText.slice(0, 16000), judgeBoundaries(grade, subject), grade)
  console.log(`🔍 Agent Reviewer đang kiểm tra lại đáp án, đơn vị, độ phù hợp lớp...`)
  const qa = await reviewDocument(solvedText, grade, subject)

  const blocks = solutions.map(s => ({
    type: 'example', title: s.title || 'Câu',
    problem: s.question || '', solution: s.solution || ''
  }))
  const base = path.basename(filePath).replace(/\.[^.]+$/, '')
  const docModel = {
    title, subject, topic: base, grade,
    sections: [
      { heading: 'KIỂM ĐỊNH CHẤT LƯỢNG', blocks: reviewSummaryBlocks(qa, judge) },
      { heading: 'LỜI GIẢI CHI TIẾT', blocks }
    ]
  }
  const folder = `SOLVE_G${gradeNum(grade)}_${dateStr()}_${slugify(base)}`
  const wordPath = await buildWord(docModel, folder)
  await maybeUploadFiles([wordPath], folder)
  console.log(`\n✨ HOÀN TẤT! Đã giải ${solutions.length} câu.`)
  console.log(`📍 Word: ${wordPath}`)
  return wordPath
}

/** PIPELINE 3: ĐỀ THI -> phiếu đề (trắc nghiệm + điền + tự luận) + đáp án & biểu điểm. */
export async function runExam(params = {}) {
  const { grade = 'Lớp 5', subject = 'Toán', topic = '', special = '', notebook = '', essayPoints = 6 } = params
  const mc = +params.mc || 0, fill = +params.fill || 0, essay = +params.essay || 0

  console.log(`📝 Ra đề: ${mc} trắc nghiệm · ${fill} điền đáp án · ${essay} tự luận (${grade}, ${subject})`)
  let reference = ''
  try { const ws = await fetchExerciseSources(topic || `đề ${subject} ${grade}`, grade); reference = ws.refs } catch { /* ok */ }
  if (notebook) { try { const nb = await notebookRefs(notebook, `Tóm tắt dạng bài/ví dụ về ${topic || subject} cho ${grade}`); if (nb.ok) reference = (nb.text + '\n' + reference).slice(0, 6000) } catch { /* ok */ } }

  const exam = await generateExam({ grade, subject, topic, mc, fill, essay, essayPoints, special, reference })

  const secDe = []
  if (exam.mc.length) secDe.push({
    heading: 'PHẦN I. TRẮC NGHIỆM',
    blocks: exam.mc.map((m, i) => {
      const o = k => String(m.options?.[k] || '').replace(/^\s*[A-Da-d][.)]\s*/, '')  // bỏ chữ cái model tự thêm
      return {
        type: 'exercise', title: `Câu ${i + 1}`, lines: 0,
        question: `${m.q}\nA. ${o(0)}     B. ${o(1)}\nC. ${o(2)}     D. ${o(3)}`,
      }
    }),
  })
  if (exam.fill.length) secDe.push({
    heading: 'PHẦN II. ĐIỀN ĐÁP ÁN',
    blocks: exam.fill.map((m, i) => ({ type: 'exercise', title: `Câu ${i + 1}`, question: m.q, lines: 1 })),
  })
  if (exam.essay.length) secDe.push({
    heading: 'PHẦN III. TỰ LUẬN',
    blocks: exam.essay.map((e, i) => ({
      type: 'exercise', title: `Câu ${i + 1}`, lines: 4,
      question: (e.q ? e.q + '\n' : '') + (e.parts || []).map(pt => `${pt.text} (${pt.points} điểm)`).join('\n'),
    })),
  })
  const examModel = { title: `Đề ${topic || 'kiểm tra'} · ${subject}`, subject, topic: topic || 'de-thi', grade, sections: secDe }

  const sol = []
  if (exam.mc.length) { sol.push({ type: 'subheading', text: 'Trắc nghiệm' }); exam.mc.forEach((m, i) => sol.push({ type: 'solution', title: `Câu ${i + 1}`, content: `Đáp án: ${m.answer}. ${m.solution || ''}` })) }
  if (exam.fill.length) { sol.push({ type: 'subheading', text: 'Điền đáp án' }); exam.fill.forEach((m, i) => sol.push({ type: 'solution', title: `Câu ${i + 1}`, content: `Đáp án: ${m.answer}. ${m.solution || ''}` })) }
  if (exam.essay.length) { sol.push({ type: 'subheading', text: 'Tự luận (biểu điểm)' }); exam.essay.forEach((e, i) => sol.push({ type: 'solution', title: `Câu ${i + 1}`, content: (e.parts || []).map(pt => `${pt.text}: ${pt.solution || ''} (${pt.points}đ)`).join('  ·  ') })) }
  const solModel = { title: `Đáp án & biểu điểm: ${topic || subject}`, subject, topic: topic || 'de-thi', grade, sections: [{ heading: 'ĐÁP ÁN & BIỂU ĐIỂM', blocks: sol }] }

  const folder = `EXAM_G${gradeNum(grade)}_${dateStr()}_${slugify(topic || subject)}`
  const wordPath = await buildWord(examModel, folder)
  const outDir = path.dirname(wordPath)
  await writeFile(path.join(outDir, 'model_solution.json'), JSON.stringify(solModel, null, 2))
  const solPath = path.join(outDir, `${folder}_LoiGiai.docx`)
  await designWord(path.join(outDir, 'model_solution.json'), solPath)
  await maybeUploadFiles([wordPath, solPath], folder)

  console.log(`\n✨ HOÀN TẤT! ${exam.mc.length} trắc nghiệm · ${exam.fill.length} điền · ${exam.essay.length} tự luận.`)
  console.log(`📍 Word: ${wordPath}`)
  console.log(`📗 Đáp án: ${solPath}`)
  return wordPath
}

/** PIPELINE 2: tài liệu -> kiểm tra & nhận xét -> Word. */
export async function runReview(filePath, grade, subject = 'Toán') {
  console.log(`\n📖 Đọc tài liệu: ${filePath}`)
  const text = await extractText(filePath)
  if (!text.trim()) throw new Error('Tệp rỗng hoặc không đọc được nội dung.')
  console.log(`🔍 Agent Thẩm định đang kiểm tra & nhận xét (chuẩn ${grade})...`)
  const r = await reviewDocument(text, grade, subject)
  console.log(`⚖️ Agent Judge đang đối chiếu ranh giới lớp học (${grade})...`)
  const judge = await runJudge(text.slice(0, 16000), judgeBoundaries(grade, subject), grade)

  const sections = []
  sections.push({
    heading: 'KIỂM ĐỊNH NHANH',
    blocks: reviewSummaryBlocks(null, judge)
  })
  sections.push({
    heading: 'NHẬN XÉT CHUNG',
    blocks: [{ type: 'keypoint', title: `${r.verdict === 'FAIL' ? 'KHÔNG ĐẠT' : 'ĐẠT'}${r.score ? ` (${r.score})` : ''}`, text: r.overall || '(không có)' }]
  })
  if (r.blockingErrors?.length)
    sections.push({ heading: 'LỖI CHẶN — BẮT BUỘC SỬA', blocks: [{ type: 'list', items: r.blockingErrors }] })
  if (r.requiredFixes?.length)
    sections.push({ heading: 'VIỆC BẮT BUỘC PHẢI SỬA', blocks: [{ type: 'list', items: r.requiredFixes }] })
  if (r.strengths.length)
    sections.push({ heading: 'ĐIỂM MẠNH', blocks: [{ type: 'list', items: r.strengths }] })
  if (r.improvements.length)
    sections.push({
      heading: 'ĐIỂM CẦN CẢI THIỆN',
      blocks: r.improvements.map((im, i) => ({
        type: 'keypoint',
        title: `Cần cải thiện ${i + 1}`,
        text: `${im.issue || ''}${im.suggestion ? '  →  Đề xuất: ' + im.suggestion : ''}`
      }))
    })
  if (r.errors.length)
    sections.push({ heading: 'LỖI KIẾN THỨC / VƯỢT CẤP / GÂY HIỂU NHẦM', blocks: [{ type: 'list', items: r.errors }] })
  if (r.factualChecks?.length)
    sections.push({ heading: 'KIỂM TRA SỰ THẬT / ĐÁP ÁN', blocks: [{ type: 'list', items: r.factualChecks.map(x => `${x.status}: ${x.item} — ${x.note || ''}`) }] })
  if (r.gradeBoundaryChecks?.length)
    sections.push({ heading: 'KIỂM TRA RANH GIỚI LỚP HỌC', blocks: [{ type: 'list', items: r.gradeBoundaryChecks.map(x => `${x.status}: ${x.item} — ${x.note || ''}`) }] })

  const base = path.basename(filePath).replace(/\.[^.]+$/, '')
  const docModel = { title: `Nhận xét tài liệu: ${base}`, subject, topic: base, grade, sections }
  const folder = `REVIEW_G${gradeNum(grade)}_${dateStr()}_${slugify(base)}`
  const wordPath = await buildWord(docModel, folder)
  await maybeUploadFiles([wordPath], folder)
  console.log(`\n✨ HOÀN TẤT! ${r.improvements.length} điểm cần cải thiện, ${r.errors.length} lỗi.`)
  console.log(`📍 Word: ${wordPath}`)
  return wordPath
}
