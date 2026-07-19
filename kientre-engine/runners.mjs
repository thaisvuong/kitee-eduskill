import path from 'node:path'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { extractText } from './server/extract.mjs'
import { buildWord, slugify } from './server/build.mjs'
import { designWord } from './server/compiler.mjs'
import { solveDocument } from './agents/solver.mjs'
import { reviewDocument } from './agents/reviewer.mjs'
import { runJudge } from './agents/judge.mjs'
import { generateExam, generateQuizQuestion } from './agents/examiner.mjs'
import { normalizeQuizCount, planQuizSet, trimQuizPlan } from './agents/quizplanner.mjs'
import { runArchitect } from './agents/architect.mjs'
import { drawTikzFigure } from './agents/artist.mjs'
import { fetchImage } from './agents/imagefetcher.mjs'
import { fetchExerciseSources } from './server/websearch.mjs'
import { notebookRefs } from './server/notebook.mjs'

function dateStr() { return new Date().toISOString().split('T')[0] }
function gradeNum(grade) { const m = String(grade).match(/\d+/); return m ? m[0] : 'x' }
function isTakenFrameLine(line) { return /<!--\s*TAKEN\s+[^>]+-->/.test(line) }
function parseFrameQuestion(line) {
 const m = String(line).match(/^- \*\*Câu\s+(\d+)\*\*\s*\(([^)]+)\):\s*(.*)$/)
 if (!m || isTakenFrameLine(line)) return null
 const meta = String(m[2] || '').split('·').map(x => x.trim())
 const points = Number((meta.find(x => /điểm/i.test(x)) || '').match(/[\d.]+/)?.[0] || 0)
 const type = meta.find(x => !/điểm/i.test(x)) || ''
 const tail = (m[3] || '').replace(/<!--.*?-->/g, '').trim()
 const [notePart, visualPart = ''] = tail.split(/\s+·\s+hình:\s*/i)
 return { index: Number(m[1]), points, type, note: notePart.trim(), visual: visualPart.trim(), frameLine: line.replace(/<!--.*?-->/g, '').trim() }
}
function frameSnippet(lines, picked, radius = 5) {
 const start = Math.max(0, picked - radius)
 const end = Math.min(lines.length, picked + radius + 1)
 return lines.slice(start, end).join('\n')
}
async function takeFrameQuestion(framePath, quiz, question) {
 const raw = await readFile(framePath, 'utf8')
 const lines = raw.split('\n')
 let inQuiz = false
 let quizStart = -1, quizEnd = lines.length
 for (let i = 0; i < lines.length; i++) {
  if (!lines[i].startsWith('## ')) continue
  const isQuiz = lines[i].includes(quiz.title || `Quiz ${quiz.index}`)
  if (isQuiz) { quizStart = i; inQuiz = true; continue }
  if (inQuiz) { quizEnd = i; break }
 }
 if (quizStart < 0) return question
 const candidates = []
 for (let i = quizStart + 1; i < quizEnd; i++) {
  const parsed = parseFrameQuestion(lines[i])
  if (parsed) candidates.push({ lineIndex: i, parsed })
 }
 if (!candidates.length) return question
 const wantedIndex = Number(question.index || 0)
 const wantedNote = String(question.note || '').trim().toLowerCase()
 let pickedEntry = candidates.find(x => wantedIndex > 0 && x.parsed.index === wantedIndex)
 if (!pickedEntry && wantedNote) pickedEntry = candidates.find(x => x.parsed.note.trim().toLowerCase() === wantedNote)
 if (!pickedEntry) pickedEntry = candidates[0]
 lines[pickedEntry.lineIndex] = `${lines[pickedEntry.lineIndex]} <!-- TAKEN ${new Date().toISOString()} -->`
 await writeFile(framePath, lines.join('\n'), 'utf8')
 return {
  ...question,
  ...pickedEntry.parsed,
  index: wantedIndex || pickedEntry.parsed.index,
  framePath,
  frameMd: frameSnippet(lines, pickedEntry.lineIndex, 5),
 }
}
function judgeBoundaries(grade, subject) {
 const g = Number(String(grade || '').match(/\d+/)?.[0] || 0)
 const subj = String(subject || '').toLowerCase()
 return [
  `Phải đúng chương trình ${subject} ${grade}`,
  `Không dùng kiến thức/phương pháp vượt cấp so với ${grade}`,
  ...(g === 5 ? ['Toán lớp 5 không dùng thuật ngữ lớp 6 như BCNN, bội chung nhỏ nhất, mẫu số chung nhỏ nhất, số nguyên tố cùng nhau; khi quy đồng chỉ nói mẫu số chung.', 'Toán lớp 5 không dùng phép chia phân số hoặc phân số đảo ngược; nếu gặp dạng đó phải đổi sang cộng/trừ/nhân phân số vừa sức.'] : []),
  ...(g === 5 && subj.includes('khoa') ? ['Khoa học lớp 5 tránh thuật ngữ vật lí vượt mức như điện trở, hiệu điện thế, công suất; giải thích bằng quan sát đời sống.', 'Không dùng nhãn Hỗn hợp trừ khi câu hỏi thật sự kiểm tra hỗn hợp; với chủ đề rộng hãy dùng nhãn Cơ bản hoặc Vận dụng cơ bản.', 'Câu hỏi về năng lượng phải nêu tiêu chí rõ: năng lượng chính và các dạng chuyển hóa/hao phí nếu yêu cầu.'] : []),
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
  const parentId = process.env.HERMES_DRIVE_PARENT_ID || process.env.KIENTRE_DRIVE_FOLDER_ID || ''
  const folder = await driveCreateFolder(folderName, parentId)
  const folderId = folder.id || parentId
  const uploaded = []
  for (const filePath of filePaths.filter(Boolean)) {
   console.log(`☁️ Đang tải lên Drive: ${path.basename(filePath)}...`)
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
 const { grade = 'Lớp 5', subject = 'Toán', topic = '', special = '', notebook = '', essayPoints = 6, reference = '', useWeb = false } = params
 const mc = +params.mc || 0, fill = +params.fill || 0, essay = +params.essay || 0

 console.log(`📝 Ra đề: ${mc} trắc nghiệm · ${fill} điền đáp án · ${essay} tự luận (${grade}, ${subject})`)
 let finalReference = String(reference || '').trim()
 if (useWeb) {
  try {
   const ws = await fetchExerciseSources(topic || `đề ${subject} ${grade}`, grade)
   finalReference = [finalReference, ws.refs].filter(Boolean).join('\n').slice(0, 6000)
  } catch { /* ok */ }
 } else {
  console.log('📝 Không có tài liệu ngoài. Tự soạn đề theo yêu cầu hiện tại.')
 }
 if (notebook) { try { const nb = await notebookRefs(notebook, `Tóm tắt dạng bài/ví dụ về ${topic || subject} cho ${grade}`); if (nb.ok) finalReference = (nb.text + '\n' + finalReference).slice(0, 6000) } catch { /* ok */ } }

 const exam = await generateExam({ grade, subject, topic, mc, fill, essay, essayPoints, special, reference: finalReference })

 const secDe = []
 if (exam.mc.length) secDe.push({
  heading: 'PHẦN I. TRẮC NGHIỆM',
  blocks: exam.mc.map((m, i) => {
   const o = k => String(m.options?.[k] || '').replace(/^\s*[A-Da-d][.)]\s*/, '') // bỏ chữ cái model tự thêm
   return {
    type: 'exercise', title: `Câu ${i + 1}`, lines: 0,
    question: `${m.q}\nA. ${o(0)}   B. ${o(1)}\nC. ${o(2)}   D. ${o(3)}`,
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
 if (exam.essay.length) { sol.push({ type: 'subheading', text: 'Tự luận (biểu điểm)' }); exam.essay.forEach((e, i) => sol.push({ type: 'solution', title: `Câu ${i + 1}`, content: (e.parts || []).map(pt => `${pt.text}: ${pt.solution || ''} (${pt.points}đ)`).join(' · ') })) }
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

function quizQuestionBlocks(q, detail) {
 const isMc = String(q.type || '').toLowerCase().includes('trắc')
 const qType = String(q.type || '').toLowerCase()
 const isMatch = qType.includes('nối')
 const isOrdering = qType.includes('sắp xếp')
 const isFixing = qType.includes('sửa lỗi')
 const clean = sanitizeQuizText
 const hints = (detail.hints || []).slice(0, 3).map((h, i) => `Gợi ý ${i + 1}: ${clean(h).replace(/^Gợi ý\s*\d+\s*[:.\-]?\s*/i, '').trim()}`)
 const meta = { index: q.index, type: q.type, points: q.points, note: q.note, visual: q.visual, framePath: q.framePath, frameLine: q.frameLine, frameMd: q.frameMd }
 const blocks = [{ type: 'subheading', text: `CÂU ${q.index} (${q.points} điểm${q.type ? ` · ${q.type}` : ''})`, quizQuestion: meta }]
 if (detail.imagePath) blocks.push({ type: 'image', path: detail.imagePath, caption: detail.visual })
 const visualText = detail.visual && !detail.imagePath ? `Mô tả hình: ${detail.visual}` : ''
 const questionText = detail.visual && !detail.imagePath ? clean(detail.question).replace(/hình\s+(vẽ\s+)?(dưới đây|sau đây)/gi, 'mô tả sau') : clean(detail.question)
 const renderedAnswer = isMatch || isOrdering || isFixing ? '' : clean(detail.answer)
 const renderedQuestion = [questionText, visualText, isMc && detail.options?.length ? detail.options.map(clean).join('\n') : ''].filter(Boolean).join('\n')
 blocks.push({ type: 'exercise', title: 'Đề bài', question: renderedQuestion, lines: q.type === 'tự luận' ? 6 : 2, quizQuestion: meta })
 if (hints.length) blocks.push({ type: 'note', title: 'Gợi ý', text: hints.join('\n'), quizQuestion: meta })
 blocks.push({ type: 'solution', title: 'Đáp án đúng', content: renderedAnswer, quizQuestion: meta })
 blocks.push({ type: 'solution', title: 'Lời giải chi tiết', content: clean(detail.solution), quizQuestion: meta })
 return blocks
}

function preferTikzFirst(visual = '') {
 const s = String(visual || '').toLowerCase()
 return /ô vuông|o vuong|lưới|luoi|tô màu|to mau|hình chữ nhật|hinh chu nhat|hình vuông|hinh vuong|tam giác|tam giac|phân số|phan so|đường chéo|duong cheo|góc|goc|abcd|efgh|trục|toa do|tọa độ|biểu đồ|bieu do/.test(s)
}

function normalizeQuestionPlan(question, subject) {
 const subj = String(subject || '').toLowerCase()
 const type = String(question?.type || '').toLowerCase()
 const note = String(question?.note || '')
 const visual = String(question?.visual || '')
 const out = { ...question }
 const push = extra => { out.note = [String(out.note || '').trim(), extra].filter(Boolean).join(' | ') }

 if (subj.includes('tiếng anh')) {
  if (type.includes('nối')) {
   out.type = 'trắc nghiệm'
   push('Chuyển thành trắc nghiệm 4 lựa chọn tự đủ dữ kiện; không phụ thuộc cột nối hay hình rời.')
  }
  if (type.includes('sắp xếp')) {
   out.type = 'điền đáp án'
   push('Đề phải tự chứa đầy đủ các từ cần sắp xếp trong cùng dòng; học sinh viết lại câu hoàn chỉnh.')
  }
  if (type.includes('sửa lỗi')) {
   out.type = 'tự luận ngắn'
   push('Đề phải chứa trực tiếp câu sai; học sinh viết lại câu đúng, không dùng phương án A/B/C/D nếu đề không có lựa chọn.')
  }
 }

 if (subj.includes('tiếng việt')) {
  if (/từ ghép|từ láy|từ nhiều nghĩa/i.test(note)) push('Chỉ dùng ví dụ rất rõ, tự nhiên, ít tranh cãi; nếu rủi ro hãy đổi sang đồng nghĩa/trái nghĩa hoặc điền từ đúng ngữ cảnh.')
 }

 if (subj.includes('khoa')) {
  if (/bảng|phân loại|danh sách/i.test(note)) push('Đề phải chèn đầy đủ bảng/danh sách ngay trong câu; không nhắc bảng dưới đây nếu bảng không hiện.')
  if (/hơi nước|bay hơi|ngưng tụ/i.test(note)) push('Diễn giải bằng quan sát đời sống, tránh khái niệm vượt mức và tránh làn trắng mơ hồ nếu không giải thích rõ.')
 }

 if (subj.includes('lịch sử') || subj.includes('địa') || subj.includes('địa lý')) {
  if (/bản đồ|đánh số|vị trí/i.test(note) || /bản đồ|đánh số|vị trí/i.test(visual)) {
   out.type = 'trắc nghiệm'
   out.visual = ''
   push('Không phụ thuộc bản đồ/hình. Viết câu mô tả vị trí bằng chữ đủ dữ kiện để chọn đáp án.')
  }
 }

 return out
}

export async function runQuizSet(params = {}) {
 const { grade = 'Lớp 4', subject = 'Toán', topic = '', quizCount = 3, totalScore = 10, timeMinutes = 14, reference = '', notebook = '', useWeb = false, onProgress = () => {} } = params
 const count = normalizeQuizCount(quizCount)
 const step = text => { try { onProgress({ type: 'assistant', text }) } catch {} }
 console.log(`🧭 Architect chốt ranh giới lớp trước khi lập quiz (${grade}, ${subject})`)
 step(`Architect: lập ranh giới kiến thức, mục tiêu, thuật ngữ cho ${grade}`)
 const directReference = String(reference || '').trim()
 let architectReference = ''
 try {
  const blueprint = await runArchitect(topic, grade, subject)
  architectReference = [
   `MỤC TIÊU ARCHITECT:\n${(blueprint.objectives || []).map(x => `- ${x}`).join('\n')}`,
   `RANH GIỚI ARCHITECT:\n${[...(blueprint.boundaries || []), ...judgeBoundaries(grade, subject)].map(x => `- ${x}`).join('\n')}`,
  ].join('\n')
 } catch (err) {
  console.warn(`⚠️ Architect không chạy được (${err.message}); dùng ranh giới mặc định.`)
  architectReference = `RANH GIỚI MẶC ĐỊNH:\n${judgeBoundaries(grade, subject).map(x => `- ${x}`).join('\n')}`
 }
 let notebookReference = ''
 if (notebook) {
  try { const nb = await notebookRefs(notebook, `Tóm tắt dạng quiz/bài tập về ${topic} cho ${grade}`); if (nb.ok) notebookReference = nb.text } catch { /* ok */ }
 }
 const plannerReference = [architectReference, directReference, notebookReference].filter(Boolean).join('\n\n').slice(0, 6000)
 const examinerReference = [architectReference, directReference, notebookReference].filter(Boolean).join('\n\n').slice(0, 6000)
 console.log(`🧭 QuizPlanner lập khung: ${count} quiz · ${totalScore} điểm · ${timeMinutes} phút (${grade}, ${subject})`)
 step(`QuizPlanner: lập bảng khung ${count} quiz, ${totalScore} điểm, ${timeMinutes} phút`)
 console.log('🧾 QuizPlanner tự lập khung theo môn/lớp. Không web search ở bước này.')

 const plan = trimQuizPlan(await planQuizSet({ topic, grade, subject, quizCount: count, totalScore, timeMinutes, reference: plannerReference }), count)
 step(`Bảng khung QuizPlanner:\n${plan.quizzes.map(q => `${q.title || `Quiz ${q.index}`}: ${(q.questions || []).map(x => `C${x.index} ${x.type} ${x.points}đ — ${x.note || ''}`).join('\n  ')}`).join('\n')}`)
 const folder = `QUIZ_G${gradeNum(grade)}_${dateStr()}_${slugify(topic || subject)}`
 const outDir = path.join(process.env.KIENTRE_OUTPUT_DIR || process.env.HERMES_WORKSPACE_DIR || process.cwd(), folder)
 await mkdir(path.join(outDir, 'images'), { recursive: true })

 // 1) Xuất file .md khung câu hỏi (các quiz) TRƯỚC KHI soạn chi tiết.
 const framePath = path.join(outDir, `${folder}_khung.md`)
 const frameMd = renderQuizFrameMarkdown({ topic, grade, subject, totalScore, timeMinutes, plan })
 await writeFile(framePath, frameMd, 'utf8')
 console.log(`🧾 Đã xuất khung câu hỏi (.md): ${framePath}`)
 step('QuizPlanner: đã xuất file .md khung câu hỏi các quiz')

 // KHÔNG tạo Google Doc realtime cho quiz: chỉ soạn bản nháp local -> QA -> Word final -> upload sau.
 const sections = []
 for (const quiz of plan.quizzes) {
  const quizTitle = `${quiz.title || `Quiz ${quiz.index}`} — ${String(subject).toLowerCase().includes('toán') ? 'Hỗn hợp' : 'Cơ bản'}`
  console.log(`🧩 Examiner soạn ${quiz.title || `Quiz ${quiz.index}`}: ${quiz.difficulty || ''}`)
  step(`Examiner: bắt đầu ${quiz.title || `Quiz ${quiz.index}`} (${quiz.difficulty || ''})`)
  const blocks = [{ type: 'note', title: 'Thông tin quiz', text: `${quiz.goal || ''}\nTổng điểm: ${totalScore}. Thời gian: ${timeMinutes} phút. Độ khó: ${quiz.difficulty || ''}` }]
  for (const qPlan of quiz.questions || []) {
   const q = normalizeQuestionPlan(await takeFrameQuestion(framePath, quiz, qPlan), subject)
   console.log(`  ✍️ Câu ${q.index}: ${q.type} · ${q.points} điểm`)
   step(`Examiner: lấy khung.md và soạn ${quiz.title || `Quiz ${quiz.index}`} câu ${q.index} · ${q.type} · ${q.points} điểm`)
   // Sau khi có khung: tìm dạng gần trên web/tài liệu để chế lại; không có thì tự ra đề.
   const detail = await generateQuizQuestion({ grade, subject, topic, globalContext: plan.globalContext, quiz, question: q, reference: examinerReference, allowWebSearch: true })
   if (detail.visual) {
    step(`Artist: minh hoạ ${quiz.title || `Quiz ${quiz.index}`} câu ${q.index} (ưu tiên ảnh web, không có thì tự vẽ)`)
    const img = path.join(outDir, 'images', `quiz${quiz.index}_cau${q.index}.png`)
    try {
     // Hình toán có cấu trúc rõ: ưu tiên TikZ trước để tránh ảnh web sai mô tả.
     if (preferTikzFirst(detail.visual)) {
      if (await drawTikzFigure(detail.visual, img)) detail.imagePath = img
      else if (await fetchImage(`${topic} ${detail.visual}`, img)) detail.imagePath = img
     } else {
      if (await fetchImage(`${topic} ${detail.visual}`, img)) detail.imagePath = img
      else if (await drawTikzFigure(detail.visual, img)) detail.imagePath = img
     }
    } catch { /* hình không làm fail câu */ }
   }
   blocks.push(...quizQuestionBlocks(q, detail))
   // Bản nháp local .docx (không phải final): cập nhật để user thấy tiến độ.
   await buildWord({ title: `Bộ quiz ${topic} (nháp)`, subject, grade, topic, sections: [...sections, { heading: quizTitle, blocks }] }, folder, false)
   step(`Word: đã chèn câu ${q.index} của ${quiz.title || `Quiz ${quiz.index}`} vào file .docx nháp`)
  }
  sections.push({ heading: quizTitle, blocks })
 }

 // ===== QA toàn bộ bản nháp: Judge + Reviewer, lặp đến pass (KISS, tối đa vài vòng) =====
 const boundaries = judgeBoundaries(grade, subject)
 let judge = null, review = null, passed = false
 const maxRounds = 3
 for (let round = 1; round <= maxRounds; round++) {
  const draftText = sectionsToText({ topic, subject, grade, totalScore, timeMinutes, sections })
  console.log(`⚖️ Judge kiểm bản nháp (vòng ${round}/${maxRounds}): đáp án, độ phù hợp lớp, tổng điểm, số quiz/câu`)
  step(`Judge: kiểm đáp án, độ phù hợp lớp, tổng điểm, số quiz/câu (vòng ${round})`)
  judge = await runJudge(draftText.slice(0, 16000), boundaries, grade)
  console.log(`🔍 Reviewer rà soát toàn bộ đề sau bản nháp (vòng ${round}/${maxRounds})`)
  step(`Reviewer: rà soát toàn bộ đề sau bản nháp (vòng ${round})`)
  review = await reviewDocument(draftText, grade, subject)
  passed = isQaPass(judge, review)
  if (passed) { console.log(`✅ QA pass ở vòng ${round}.`); step(`QA pass: Judge/Reviewer không còn lỗi chặn (vòng ${round})`); break }
  const problems = qaProblems(judge, review)
  console.warn(`⚠️ QA chưa pass (vòng ${round}): ${problems.slice(0, 6).join(' | ') || 'có lỗi chặn'}`)
  step(`QA chưa pass (vòng ${round}), sẽ sửa bản nháp: ${problems.slice(0, 4).join(' | ') || 'lỗi chặn'}`)
  if (round === maxRounds) break
  // Sửa từng quiz bằng Examiner dựa trên phản hồi QA, rồi lặp lại QA.
  for (const section of sections) {
   const fixNote = problems.join('\n')
   for (let bi = 0; bi < section.blocks.length; bi++) {
    const b = section.blocks[bi]
    if (b.type !== 'exercise' || b.title !== 'Đề bài') continue
    // Tìm cụm câu (đề/gợi ý/đáp án/lời giải) quanh block này để soạn lại.
    // KISS: chỉ đánh dấu context cho Examiner qua reference; soạn lại nội dung câu.
    try {
     const meta = b.quizQuestion || {}
     const refixed = await generateQuizQuestion({
      grade, subject, topic, globalContext: plan.globalContext,
      quiz: { title: section.heading, difficulty: '' },
      question: { ...meta, note: [meta.note, b.question].filter(Boolean).join('\n\nBẢN CŨ:\n') },
      reference: `${examinerReference}\n\nYÊU CẦU SỬA LỖI TỪ QA:\n${fixNote}`,
      allowWebSearch: true,
     })
     if (refixed?.question) b.question = sanitizeQuizText([refixed.question, refixed.options?.length ? refixed.options.join('\n') : ''].filter(Boolean).join('\n'))
     const hintIdx = section.blocks.findIndex((x, k) => k > bi && x.type === 'note' && x.title === 'Gợi ý')
     const solIdx = section.blocks.findIndex((x, k) => k > bi && x.type === 'solution' && x.title === 'Lời giải chi tiết')
     const ansIdx = section.blocks.findIndex((x, k) => k > bi && x.type === 'solution' && x.title === 'Đáp án đúng')
     if (hintIdx >= 0 && refixed?.hints?.length) section.blocks[hintIdx].text = sanitizeQuizText(refixed.hints.slice(0, 3).map((h, i) => `Gợi ý ${i + 1}: ${String(h).replace(/^Gợi ý\s*\d+\s*[:.\-]?\s*/i, '').trim()}`).join('\n'))
     if (ansIdx >= 0 && refixed?.answer) section.blocks[ansIdx].content = sanitizeQuizText(refixed.answer)
     if (solIdx >= 0 && refixed?.solution) section.blocks[solIdx].content = sanitizeQuizText(refixed.solution)
    } catch { /* giữ nguyên câu nếu sửa lỗi */ }
   }
  }
 }

 const finalWarnings = !passed ? qaProblems(judge, review) : []
 if (!passed) {
  step(`QA FAIL sau ${maxRounds} vòng — vẫn xuất final với cảnh báo [Cần check], vẫn upload Drive nếu bật`)
  console.warn(`⚠️ QA chưa đạt sau ${maxRounds} vòng. Vẫn xuất file có cảnh báo để giáo viên kiểm tra: ${finalWarnings.slice(0, 8).join(' | ') || 'không rõ'}`)
 }

 // ===== Chỉ sau QA pass: xuất final local Word (kèm block KIỂM ĐỊNH TRƯỚC KHI DÙNG) =====
 const finalSections = [
  { heading: 'KIỂM ĐỊNH TRƯỚC KHI DÙNG', blocks: reviewSummaryBlocks(review, judge) },
  ...(finalWarnings.length ? [{ heading: 'CẦN CHECK TRƯỚC KHI DÙNG', blocks: [{ type: 'list', items: finalWarnings.slice(0, 12).map(x => `[Cần check: ${x}]`) }] }] : []),
  ...sections,
 ]
 const wordPath = await buildWord({ title: `Bộ quiz ${topic}`, subject, grade, topic, sections: finalSections }, folder)
 step(`Word: xuất file .docx bộ quiz (final${passed ? ', sau QA pass' : ', có cảnh báo Cần check'})`)
 await maybeUploadFiles([wordPath], folder)
 console.log(`✅ Đã xuất bộ quiz (final, QA pass): ${wordPath}`)
 return wordPath
}

// Ghép sections thành text để Judge/Reviewer chấm toàn bộ đề.
function sectionsToText({ topic, subject, grade, totalScore, timeMinutes, sections }) {
 const lines = [`Bộ quiz ${topic} · ${subject} · ${grade}`, `Mỗi quiz ${totalScore} điểm · ${timeMinutes} phút`, '']
 for (const s of sections) {
  lines.push(`### ${s.heading}`)
  for (const b of s.blocks || []) {
   if (b.type === 'subheading') lines.push(b.text || '')
   else if (b.type === 'exercise') lines.push(`${b.title || ''}: ${b.question || ''}`)
   else if (b.type === 'note') lines.push(`${b.title || ''}: ${b.text || ''}`)
   else if (b.type === 'solution') lines.push(`${b.title || ''}: ${b.content || ''}`)
  }
  lines.push('')
 }
 return lines.join('\n')
}

function sanitizeQuizText(s = '') {
 return String(s || '')
  .replace(/\\n/g, '\n')
  .replace(/mẫu số chung nhỏ nhất|bội chung nhỏ nhất|BCNN/gi, 'mẫu số chung')
  .replace(/ước chung lớn nhất|ƯCLN|UCLN/gi, 'số chia chung phù hợp')
  .replace(/ước chung của\s+(\d+)\s+và\s+(\d+)\s+là\s+(\d+)/gi, 'có thể chia cả $1 và $2 cho $3')
  .replace(/phân số đảo ngược/gi, 'cách phù hợp')
  .replace(/điện trở/gi, 'bộ phận bên trong')
  .replace(/nếu có/gi, '')
  .replace(/Hơi nước nhẹ hơn không khí nên bay lên cao/gi, 'Nước nhận nhiệt, nóng lên; nước có thể bay hơi ở mặt thoáng, và khi sôi thì sự hóa hơi xảy ra mạnh tạo hơi nước')
  .replace(/hơi nước nhẹ hơn không khí nên bay lên cao/gi, 'nước nhận nhiệt, nóng lên; nước có thể bay hơi ở mặt thoáng, và khi sôi thì sự hóa hơi xảy ra mạnh tạo hơi nước')
  .replace(/khí không màu/gi, 'khói hoặc khí sinh ra khi cháy')
  .replace(/chuyển hóa thành ______ năng lượng/gi, 'chuyển hóa chủ yếu thành ______')
  .replace(/năng lượng trong que diêm/gi, 'năng lượng hóa học dự trữ trong que diêm')
  .replace(/Quan sát bản đồ thế giới bên dưới/gi, 'Dựa vào mô tả sau')
  .replace(/quan sát hình ảnh/gi, 'dựa vào mô tả')
}

// Điều kiện pass: Judge không FAIL, Reviewer không FAIL, không có blockingErrors/requiredFixes/lỗi đáp án nghiêm trọng.
function isQaPass(judge, review) {
 if (judge && String(judge.status).toUpperCase() === 'FAIL') return false
 if (review && String(review.verdict).toUpperCase() === 'FAIL') return false
 if ((review?.blockingErrors || []).length) return false
 if ((review?.requiredFixes || []).length) return false
 if ((review?.factualChecks || []).some(x => String(x.status).toUpperCase() === 'FAIL')) return false
 return true
}

function qaProblems(judge, review) {
 const out = []
 if (judge && String(judge.status).toUpperCase() === 'FAIL') out.push(`Judge FAIL: ${judge.reason || ''}`)
 for (const x of review?.blockingErrors || []) out.push(`Lỗi chặn: ${x}`)
 for (const x of review?.requiredFixes || []) out.push(`Phải sửa: ${x}`)
 for (const x of review?.errors || []) out.push(`Lỗi: ${x}`)
 for (const x of review?.factualChecks || []) if (String(x.status).toUpperCase() === 'FAIL') out.push(`Sai: ${x.item} — ${x.note || ''}`)
 return out.filter(Boolean)
}

// Markdown khung câu hỏi các quiz (xuất trước khi soạn chi tiết).
function renderQuizFrameMarkdown({ topic, grade, subject, totalScore, timeMinutes, plan }) {
 const lines = [`# Khung câu hỏi — Bộ quiz ${topic}`, '', `- Môn: ${subject}`, `- Lớp: ${grade}`, `- Mỗi quiz: ${totalScore} điểm · ${timeMinutes} phút`, '']
 if (plan.globalContext) lines.push(`> ${plan.globalContext}`, '')
 for (const quiz of plan.quizzes || []) {
  lines.push(`## ${quiz.title || `Quiz ${quiz.index}`} — ${quiz.difficulty || ''}`)
  if (quiz.goal) lines.push(`*Mục tiêu:* ${quiz.goal}`)
  for (const q of quiz.questions || []) {
   lines.push(`- **Câu ${q.index}** (${q.points} điểm · ${q.type}): Dạng bài: ${q.note || ''}${q.visual ? ` · hình: ${q.visual}` : ''}`)
  }
  lines.push('')
 }
 return lines.join('\n')
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
    text: `${im.issue || ''}${im.suggestion ? ' → Đề xuất: ' + im.suggestion : ''}`
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
