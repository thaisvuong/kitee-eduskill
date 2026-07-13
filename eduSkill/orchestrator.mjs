import { runArchitect } from './agents/architect.mjs'
import { draftAtomicPart, draftExercisePack, blocksToText } from './server/pipeline.mjs'
import { runJudge } from './agents/judge.mjs'
import { estimateSolveTime } from './agents/student.mjs'
import { drawTikzFigure } from './agents/artist.mjs'
import { fetchImage } from './agents/imagefetcher.mjs'
import { curateVisual } from './agents/visualcurator.mjs'
import { fetchExerciseSources } from './server/websearch.mjs'
import { notebookRefs } from './server/notebook.mjs'
import { renderMarkdown } from './server/render.mjs'
import { designWord, generatePieChart } from './server/compiler.mjs'
import { outDirFor } from './server/paths.mjs'
import { writeFile, mkdir, appendFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

function hermesHome() {
  return process.env.HERMES_HOME || path.join(process.env.HOME, '.hermes')
}

function googleApiPath() {
  return path.join(hermesHome(), 'skills/productivity/google-workspace/scripts/google_api.py')
}

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

/** Tự động tải tệp lên Google Drive; parent tùy profile qua HERMES_DRIVE_PARENT_ID. */
async function uploadFilesToDrive(filePaths, folderName) {
  const parentId = process.env.HERMES_DRIVE_PARENT_ID || process.env.KITEE_DRIVE_FOLDER_ID || ''
  const folder = await driveCreateFolder(folderName, parentId)
  const folderId = folder.id || parentId
  const uploaded = []
  for (const filePath of filePaths.filter(Boolean)) {
    console.log(`☁️  Đang tải lên Drive: ${path.basename(filePath)}...`)
    uploaded.push(await driveUpload(filePath, folderId))
  }
  return { folder, uploaded }
}

export async function composeDocument(topic, grade, subject = 'Toán', opts = {}) {
  try {
    const drafter = process.env.HERMES_WORKER_MODEL || 'gc/gemini-2.5-flash'
    if (opts.depth) console.log(`   ⚙️ Chế độ lý thuyết: ${opts.depth === 'summary' ? 'TÓM TẮT' : 'CHI TIẾT'}`)
    if (opts.special) console.log(`   ⚙️ Yêu cầu đặc biệt: ${opts.special}`)
    const CLASS_BUDGET_MIN = Number(process.env.HERMES_CLASS_MINUTES) || 120  // phiếu học tập tại lớp: 2 giờ
    
    console.log(`\n🚀 BẮT ĐẦU QUY TRÌNH SOẠN THẢO CHUYÊN NGHIỆP: ${topic}\n`)

    const blueprint = await runArchitect(topic, grade, subject)
    const { boundaries } = blueprint
    let chunks = blueprint.chunks

    // ── Thu thập NGUỒN THAM KHẢO: web (bài tập thật) + NotebookLM (nếu chọn sổ) ──
    let webReference = '', notebookReference = ''
    try {
      console.log(`🌐 Tìm nguồn bài tập trên web...`)
      const ws = await fetchExerciseSources(topic, grade)
      webReference = ws.refs
      if (ws.sources.length) console.log(`   🔗 Nguồn: ${ws.sources.join(' , ')}`)
    } catch { /* bỏ qua nếu web lỗi */ }
    if (opts.notebook) {
      try {
        console.log(`📓 Lấy nguồn từ sổ NotebookLM...`)
        const nb = await notebookRefs(opts.notebook, `Tóm tắt kiến thức cốt lõi và các dạng/ví dụ/bài tập chính về "${topic}" cho ${grade}`)
        if (nb.ok) { notebookReference = nb.text; console.log(`   📓 Đã lấy ${nb.text.length} ký tự từ sổ.`) }
        else console.warn(`   ⚠️ NotebookLM: ${nb.error}`)
      } catch (e) { console.warn(`   ⚠️ NotebookLM lỗi: ${e.message}`) }
    }
    const draftRefs = [notebookReference, webReference].filter(Boolean).join('\n\n')
    const exerciseRef = [notebookReference, webReference].filter(Boolean).join('\n\n')
    const draftOpts = { ...opts, refs: draftRefs }

    // Chế độ TÓM TẮT: giảm số phần lý thuyết (chỉ vài box), dồn sức cho ví dụ & bài tập.
    if (opts.depth === 'summary') chunks = chunks.slice(0, 3)
    
    const gradeNum = grade.match(/\d+/) ? grade.match(/\d+/)[0] : grade
    const dateStr = new Date().toISOString().split('T')[0]
    const safeTopic = topic.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    const folderName = `G${gradeNum}_${dateStr}_${safeTopic}`
    const outDir = outDirFor(folderName)
    await mkdir(path.join(outDir, 'images'), { recursive: true })

    // Khởi tạo file nháp để ghi nội dung liên tục
    const draftPath = path.join(outDir, 'draft_incremental.md')
    await writeFile(draftPath, `# BẢN NHÁP NỘI DUNG: ${topic}\n\n`, 'utf8')

    console.log(`🚀 Đã lập blueprint. Bắt đầu soạn song song và lưu trữ liên tục...`)

    const workerTasks = chunks.map(async (chunk, idx) => {
      // Soạn thảo -> Kiểm định (Judge). Soạn lại nếu vượt cấp/sai kiến thức.
      let draft, judgeResult, attempts = 0
      do {
        draft = await draftAtomicPart(chunk, topic, blueprint, drafter, draftOpts)
        judgeResult = await runJudge(blocksToText(draft.blocks), boundaries, grade)
        attempts++
        if (judgeResult.status === "FAIL" && attempts < 2) {
          console.log(`   [!] Judge bác bỏ "${chunk}": ${judgeResult.reason}. Soạn lại...`)
        }
      } while (judgeResult.status === "FAIL" && attempts < 2)

      // VisualCurator: tự quyết định có cần thêm hình minh họa sư phạm hay không.
      // Agent này chỉ ĐỀ XUẤT hình; lỗi hình không được làm fail pipeline.
      const visualMode = String(process.env.HERMES_VISUALS || 'auto').toLowerCase()
      const visualCandidates = [...(draft.blocks || [])]
      if (!['off', '0', 'false'].includes(visualMode)) {
        try {
          const decision = await curateVisual({
            topic, grade, subject, chunk,
            content: blocksToText(draft.blocks),
            boundaries,
          }, drafter)
          if (decision.shouldAdd) {
            console.log(`   🖼 VisualCurator đề xuất ${decision.kind}: ${decision.caption || decision.desc} — ${decision.reason}`)
            if (decision.kind === 'photo') {
              visualCandidates.unshift({ type: 'figure', kind: 'photo', desc: decision.desc || decision.caption, query: decision.query, caption: decision.caption })
            } else if (decision.kind === 'tikz') {
              visualCandidates.unshift({ type: 'figure', kind: 'tikz', desc: decision.desc || decision.caption, caption: decision.caption })
            } else if (decision.kind === 'chart' && decision.chart) {
              visualCandidates.unshift({ type: 'figure', kind: 'pie', desc: decision.desc || decision.caption, chart: decision.chart })
            }
          } else if (decision.reason) {
            console.log(`   🖼 VisualCurator bỏ qua hình: ${decision.reason}`)
          }
        } catch (visErr) {
          console.warn(`   ⚠️ VisualCurator lỗi, bỏ qua minh họa tự động: ${visErr.message}`)
        }
      }

      // Giai đoạn Artist/ImageFetcher: mỗi block "figure" -> tạo ảnh rồi thay bằng block "image".
      // Các block khác (paragraph/list/keypoint/example/exercise) giữ nguyên cho renderer.
      const blocks = []
      let figCount = 0, pieCount = 0
      const MAX_PIE = Number(process.env.HERMES_MAX_PIE || 2)
      const MAX_WEB_IMAGES = Number(process.env.HERMES_MAX_WEB_IMAGES || 2)
      let webImageCount = 0
      for (const b of visualCandidates) {
        if (b.type === 'exercise') continue   // bài tập được chuẩn hóa ở khâu riêng
        if (b.type !== 'figure') { blocks.push(b); continue }
        const figId = `${idx}_${figCount++}`
        try {
          if (b.kind === 'pie' && b.chart?.data?.length && pieCount < MAX_PIE) {
            const chartPath = path.join(outDir, 'images', `chart_${figId}.png`)
            console.log(`   📊 Vẽ biểu đồ tròn: ${b.chart.title || b.desc}`)
            await generatePieChart(b.chart, chartPath)
            blocks.push({ type: 'image', path: path.resolve(chartPath), caption: b.chart.title || b.desc })
            pieCount++
          } else if (b.kind === 'pie') {
            // Bỏ qua pie chart bị giới hạn hoặc không có dữ liệu
            console.log(`   ⏭ Bỏ qua pie chart (giới hạn tối đa ${MAX_PIE}): ${b.desc}`)
          } else if (b.kind === 'tikz') {
            const figPath = path.join(outDir, 'images', `fig_${figId}.png`)
            console.log(`   🎨 Artist vẽ hình (TikZ): ${b.desc}`)
            const ok = await drawTikzFigure(b.desc, figPath)
            if (ok) blocks.push({ type: 'image', path: path.resolve(figPath), caption: b.desc })
            else {
              console.warn(`   ⚠️ Không vẽ được hình sau 3 lần thử: ${b.desc}`)
              blocks.push({ type: 'image', path: null, caption: b.desc })
            }
          } else {
            // "photo": tải ảnh thật từ Internet (Openverse) theo từ khóa tiếng Anh.
            if (webImageCount >= MAX_WEB_IMAGES) {
              console.log(`   ⏭ Bỏ qua ảnh web (giới hạn tối đa ${MAX_WEB_IMAGES}): ${b.desc}`)
              continue
            }
            const photoPath = path.join(outDir, 'images', `photo_${figId}.jpg`)
            console.log(`   🌐 Tải ảnh minh họa: ${b.query || b.desc}`)
            const ok = await fetchImage(b.query || b.desc, photoPath)
            if (ok) { blocks.push({ type: 'image', path: path.resolve(photoPath), caption: b.caption || b.desc }); webImageCount++ }
            else { console.warn(`   ⚠️ Không tải được ảnh: ${b.desc}`); blocks.push({ type: 'image', path: null, caption: b.caption || b.desc }) }
          }
        } catch (figErr) {
          console.warn(`   ⚠️ Bỏ qua hình (${b.kind}) tại "${chunk}": ${figErr.message}`)
          blocks.push({ type: 'image', path: null, caption: b.desc })
        }
      }

      // Lưu trữ liên tục vào bản nháp ngay khi xong một phần.
      await appendFile(draftPath, `\n## ${chunk}\n${blocksToText(draft.blocks)}\n\n---\n`, 'utf8')

      console.log(`   ✅ Hoàn thành & Đã lưu: ${chunk}`)
      return { heading: chunk, blocks }
    })

    const sections = await Promise.all(workerTasks)

    // ── PHẦN BÀI TẬP CHUẨN HÓA ──
    // Ví dụ (có đáp án ngay) đã nằm trong phần dạy ở trên.
    // Tiếp theo: Bài tập vận dụng → Bài tập về nhà (≥5) → Bài giải chi tiết.
    const runPack = async (kind, count) => {
      let pack, judge, attempts = 0
      do {
        pack = await draftExercisePack(topic, blueprint, kind, count, drafter, { ...opts, reference: exerciseRef })
        const txt = pack.exercises.map(e => `${e.question || e.problem}\n${e.solution || ''}`).join('\n')
        judge = await runJudge(txt, boundaries, grade)
        attempts++
        if (judge.status === "FAIL" && attempts < 2) {
          console.log(`   [!] Judge bác bỏ bài tập ${kind}: ${judge.reason}. Soạn lại...`)
        }
      } while (judge.status === "FAIL" && attempts < 2)
      return pack.exercises
    }

    // ── PHIẾU HỌC TẬP TẠI LỚP: soạn thêm bài đến khi lấp đầy ~2 giờ ──
    // Quy tắc: nếu thời lượng ước lượng CHƯA lớn hơn TARGET (100 phút) thì soạn thêm bài,
    // nhưng không vượt CLASS_BUDGET (120 phút) và không quá MAX_VANDUNG bài.
    const TARGET_MIN = Number(process.env.HERMES_MIN_MINUTES) || 100
    const MAX_VANDUNG = Number(process.env.HERMES_MAX_VANDUNG) || 26
    const vandung = []
    let readingMinutes = 20
    let usedMin = 0
    let done = false
    console.log(`📝 Soạn Bài tập vận dụng (lấp đầy ~2 giờ tại lớp)...`)
    for (let round = 0; round < 6 && !done; round++) {
      const batch = await runPack('vận dụng', 6)
      let est
      try { est = await estimateSolveTime(batch, grade, blueprint, drafter) } catch { est = { readingMinutes: 20, times: [] } }
      if (round === 0) readingMinutes = Math.max(18, Math.round(est.readingMinutes || 20))
      const minOf = title => {
        const t = (est.times || []).find(x => (x.title || '').trim() === (title || '').trim())
        return Math.max(3, Math.round(Number(t?.minutes) || 5))   // sàn 3', mặc định 5' (gồm cả trình bày)
      }
      for (const e of batch) {
        const m = minOf(e.title)
        if (readingMinutes + usedMin + m > CLASS_BUDGET_MIN && vandung.length >= 2) { done = true; break }
        e._min = m; vandung.push(e); usedMin += m
        if (vandung.length >= MAX_VANDUNG) { done = true; break }
      }
      const now = readingMinutes + usedMin
      if (now > TARGET_MIN) { console.log(`   👦 Ước lượng ~${now} phút (> ${TARGET_MIN}) — đã đủ.`); break }
      if (!done) console.log(`   ↻ Mới ~${now} phút (≤ ${TARGET_MIN}), Agent Học sinh yêu cầu soạn thêm bài...`)
    }
    vandung.forEach((e, i) => { e.title = `Bài ${i + 1}` })

    console.log(`🏠 Soạn Bài tập về nhà (≥5 bài)...`)
    const venha = await runPack('về nhà', 5)
    venha.forEach((e, i) => { e.title = `Bài ${i + 1}` })

    const totalMin = readingMinutes + usedMin
    const durationNote = `Thời lượng dự kiến tại lớp: ~${totalMin} phút (đọc lý thuyết & ví dụ ~${readingMinutes} phút, làm ${vandung.length} bài vận dụng ~${usedMin} phút) — trong khung 2 giờ.`
    console.log(`   👦 ${durationNote}`)

    const vandungBlocks = []
    if (durationNote) vandungBlocks.push({ type: 'keypoint', title: '⏱️ Thời lượng', text: durationNote })
    vandung.forEach(e => vandungBlocks.push({
      type: 'exercise',
      title: e._min ? `${e.title}  (~${e._min} phút)` : e.title,
      question: e.question || e.problem, lines: e.lines || 3
    }))
    sections.push({ heading: 'BÀI TẬP VẬN DỤNG', blocks: vandungBlocks })
    sections.push({
      heading: 'BÀI TẬP VỀ NHÀ',
      blocks: venha.map(e => ({ type: 'exercise', title: e.title, question: e.question || e.problem, lines: e.lines || 4 }))
    })

    // Lời giải chi tiết -> để RIÊNG thành file đáp án (không nằm trong phiếu học tập).
    const solBlocks = [{ type: 'subheading', text: 'Bài tập vận dụng' }]
    vandung.forEach(e => solBlocks.push({ type: 'solution', title: e.title, content: e.solution || '' }))
    solBlocks.push({ type: 'subheading', text: 'Bài tập về nhà' })
    venha.forEach(e => solBlocks.push({ type: 'solution', title: e.title, content: e.solution || '' }))

    // Đảm bảo thư mục còn tồn tại (phòng khi worker async lỗi giữa chừng do quota).
    await mkdir(outDir, { recursive: true })
    await appendFile(draftPath,
      `\n## BÀI TẬP VẬN DỤNG\n${vandung.map(e => `${e.title}: ${e.question}`).join('\n')}\n` +
      `\n## BÀI TẬP VỀ NHÀ\n${venha.map(e => `${e.title}: ${e.question}`).join('\n')}\n`, 'utf8')

    // Đánh số VÍ DỤ liên tiếp trên toàn tài liệu (Ví dụ 1, 2, 3, ...).
    let exNo = 0
    for (const s of sections) for (const b of s.blocks) if (b.type === 'example') b.title = `Ví dụ ${++exNo}`

    const docModel = { title: `Tài liệu: ${topic}`, subject, topic, grade, sections }
    
    const modelPath = path.join(outDir, 'model.json')
    await writeFile(modelPath, JSON.stringify(docModel, null, 2))

    const md = renderMarkdown(docModel)
    await writeFile(path.join(outDir, 'final.md'), md)
    
    console.log(`🎨 Đang thiết kế Word chuyên nghiệp tại ${folderName}...`)
    // FILE 1 — Phiếu học tập: lý thuyết + ví dụ + bài tập (KHÔNG có lời giải).
    const wordPath = path.join(outDir, `${folderName}.docx`)   // tên file docx = tên folder
    await designWord(modelPath, wordPath)

    // FILE 2 — Đáp án: lời giải chi tiết bài vận dụng + về nhà (file riêng).
    const solutionModel = {
      title: `Đáp án: ${topic}`, subject, topic, grade,
      sections: [{ heading: 'BÀI GIẢI CHI TIẾT', blocks: solBlocks }],
    }
    const solModelPath = path.join(outDir, 'model_solution.json')
    await writeFile(solModelPath, JSON.stringify(solutionModel, null, 2))
    const solWordPath = path.join(outDir, `${folderName}_LoiGiai.docx`)
    await designWord(solModelPath, solWordPath)
    console.log(`   📗 Đáp án riêng: ${solWordPath}`)

    // Tải lên Google Drive: CHỈ khi bật HERMES_UPLOAD_DRIVE=1 (mặc định tắt để không "gọi" gì thêm).
    if (process.env.HERMES_UPLOAD_DRIVE === '1') {
      try {
        const drive = await uploadFilesToDrive([wordPath, solWordPath], folderName)
        const links = (drive.uploaded || []).map(f => f.webViewLink).filter(Boolean)
        console.log(`✅ Đã tải ${drive.uploaded.length} file lên Google Drive trong thư mục: ${drive.folder.name || folderName}`)
        if (links.length) console.log(`🔗 Drive links:\n${links.join('\n')}`)
      } catch (driveErr) {
        console.warn(`⚠️ Không thể tải lên Drive (${driveErr.message}). File vẫn được lưu cục bộ.`)
      }
    }

    console.log("\n✨ TẤT CẢ HOÀN TẤT!")
    console.log(`📍 Word: ${wordPath}`)
    return wordPath

  } catch (err) {
    console.error("\n❌ LỖI HỆ THỐNG:", err.message)
    throw err
  }
}

// Cho phép chạy trực tiếp: node orchestrator.mjs "Chủ đề" "Lớp 4" "Toán"
if (import.meta.url === `file://${process.argv[1]}`) {
  composeDocument(process.argv[2], process.argv[3], process.argv[4])
}
