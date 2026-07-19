import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeQuizCount, trimQuizPlan } from '../kientre-engine/agents/quizplanner.mjs'

assert.equal(normalizeQuizCount(1), 1)
assert.equal(normalizeQuizCount(5), 5)
assert.equal(normalizeQuizCount(99), 20)

const plan = { globalContext: 'ctx', quizzes: Array.from({ length: 6 }, (_, i) => ({ title: `Quiz ${i + 1}`, index: i + 1, questions: [] })) }
assert.equal(trimQuizPlan(plan, 1).quizzes.length, 1)
assert.equal(trimQuizPlan(plan, 3).quizzes.length, 3)
assert.equal(trimQuizPlan(plan, 0).quizzes.length, 1)

const runners = await readFile(new URL('../kientre-engine/runners.mjs', import.meta.url), 'utf8')
assert.match(runners, /trimQuizPlan\(await planQuizSet\([^\n]+quizCount: count/)
assert.match(runners, /pickedEntry = candidates\.find\(x => wantedIndex > 0 && x\.parsed\.index === wantedIndex\)/)
assert.match(runners, /frameMd: frameSnippet\(lines, pickedEntry\.lineIndex, 5\)/)
assert.match(runners, /const frameMd = renderQuizFrameMarkdown\(\{ topic, grade, subject, totalScore, timeMinutes, plan \}\)/)
assert.match(runners, /split\('·'\)/)

const examiner = await readFile(new URL('../kientre-engine/agents/examiner.mjs', import.meta.url), 'utf8')
assert.match(examiner, /Nội dung khung\.md liên quan/)
assert.match(examiner, /Phải triển khai đúng dòng khung\.md/)
assert.match(examiner, /if \(reference\) try/)
assert.match(examiner, /BIẾN DẠNG BÀI THÀNH CÂU HỎI HOÀN CHỈNH/)
assert.match(examiner, /Không dùng thuật ngữ lớp 6/)
assert.match(examiner, /Không dùng phép chia phân số/)
assert.match(examiner, /Điền đáp án: options phải là \[\]/)
assert.match(examiner, /Tự luận: options phải là \[\]/)

const llm = await readFile(new URL('../kientre-engine/server/llm.mjs', import.meta.url), 'utf8')
assert.match(llm, /function isFallbackable/)
assert.match(llm, /missing api key/)
assert.match(llm, /no active credentials/)
assert.match(llm, /if \(!isFallbackable\(err\)\) throw err/)

// QuizPlanner phải yêu cầu note là DẠNG BÀI, cấm đáp án/lời giải/hints trong plan.
const planner = await readFile(new URL('../kientre-engine/agents/quizplanner.mjs', import.meta.url), 'utf8')
assert.match(planner, /DẠNG BÀI/)
assert.match(planner, /KHÔNG tạo đáp án|không tạo đáp án|KHÔNG có đáp án/)
assert.match(planner, /không lập dạng chia phân số/)

// khung.md phải gắn nhãn "Dạng bài:" cho mỗi câu.
assert.match(runners, /Dạng bài: \$\{q\.note/)

// Flow quiz không còn Student mặc định, nhưng có Architect trước QuizPlanner để chốt ranh giới lớp.
const skills = await readFile(new URL('../src/lib/defaultSkills.ts', import.meta.url), 'utf8')
const quizFlow = skills.match(/quiz:\s*\[([^\]]+)\]/)?.[1] || ''
assert.ok(!/Student/.test(quizFlow), 'quiz flow không được có Student mặc định')
assert.match(quizFlow, /Architect/)
assert.match(quizFlow, /Judge/)
assert.match(quizFlow, /Reviewer/)
assert.match(quizFlow, /QuizPlanner/)
assert.match(quizFlow, /Examiner/)
assert.match(skills, /HERMES_ARCHITECT_MODEL/)

const page = await readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8')
const uiQuizFlow = page.match(/const AGENT_FLOWS[\s\S]*?quiz:\s*\[([^\]]+)\]/)?.[1] || ''
assert.match(uiQuizFlow, /Architect/)
assert.match(uiQuizFlow, /QuizPlanner/)
assert.ok(!/Student/.test(uiQuizFlow), 'UI quiz flow không được có Student mặc định')

const agentLoop = await readFile(new URL('../kientre-engine/agent/loop.mjs', import.meta.url), 'utf8')
const loopQuizFlow = agentLoop.match(/const map = \{[\s\S]*?quiz:\s*\[([^\]]+)\]/)?.[1] || ''
assert.match(loopQuizFlow, /Architect/)
assert.match(loopQuizFlow, /QuizPlanner/)
assert.ok(!/Student/.test(loopQuizFlow), 'agent fallback quiz flow không được có Student mặc định')

// Quiz KHÔNG còn tạo Google Doc realtime.
assert.ok(!/createQuizDoc/.test(runners), 'runQuizSet không được còn createQuizDoc')
assert.ok(!/appendQuizQuestion/.test(runners), 'runQuizSet không được còn appendQuizQuestion')
// Quiz path phải có Judge + Reviewer QA.
assert.match(runners, /runJudge\(/)
assert.match(runners, /reviewDocument\(/)
// QA (runJudge/reviewDocument) phải nằm TRƯỚC final buildWord (block KIỂM ĐỊNH TRƯỚC KHI DÙNG).
const qaIdx = runners.indexOf('reviewDocument(draftText')
const finalBuildIdx = runners.indexOf('sections: finalSections')
assert.ok(qaIdx > 0 && finalBuildIdx > qaIdx, 'QA phải chạy trước final buildWord')
assert.match(runners, /KIỂM ĐỊNH TRƯỚC KHI DÙNG/)
assert.match(runners, /CẦN CHECK TRƯỚC KHI DÙNG/)
assert.match(runners, /\[Cần check:/)
assert.ok(!/QA FAIL sau \$\{maxRounds\} vòng — KHÔNG xuất final/.test(runners), 'QA fail sau 3 vòng vẫn phải xuất final có cảnh báo')
assert.ok(!/question:\s*\{\s*index:\s*0,\s*type:\s*'',\s*points:\s*0/.test(runners), 'QA repair không được mất metadata câu')
assert.match(runners, /const meta = b\.quizQuestion \|\| \{\}/)
assert.match(runners, /Mô tả hình:/)
assert.match(runners, /hintIdx/)
assert.match(runners, /phân số đảo ngược/)
assert.match(runners, /sanitizeQuizText/)
assert.match(runners, /ước chung lớn nhất\|ƯCLN/)
assert.match(runners, /Hỗn hợp/)
assert.match(runners, /Cơ bản/)
assert.match(runners, /điện trở/)
assert.match(runners, /Hơi nước nhẹ hơn không khí nên bay lên cao/)
assert.match(runners, /hình\\s\+\(vẽ\\s\+\)\?\(dưới đây\|sau đây\)/)
assert.match(examiner, /Khoa học Lớp 5/)
assert.match(examiner, /bảng\/phân loại\/danh sách/)
assert.match(examiner, /đốt\/cháy/)
assert.match(examiner, /Tiếng Việt Lớp 5/)
assert.match(examiner, /Tiếng Anh Lớp 5/)
assert.match(examiner, /Lịch sử và Địa lý Lớp 5/)
assert.match(runners, /khí không màu/)
assert.match(runners, /chuyển hóa thành ______ năng lượng/)
assert.match(runners, /isMatch/)
assert.match(runners, /Quan sát bản đồ thế giới bên dưới/)
assert.match(runners, /function normalizeQuestionPlan/)
assert.match(runners, /Chuyển thành trắc nghiệm 4 lựa chọn tự đủ dữ kiện/)
assert.match(runners, /Đề phải chèn đầy đủ bảng\/danh sách ngay trong câu/)
assert.match(planner, /Khoa học Lớp 5/)
assert.match(planner, /Tiếng Việt Lớp 5/)
assert.match(planner, /Tiếng Anh Lớp 5/)
assert.match(planner, /Lịch sử và Địa lý Lớp 5/)

const agentRoute = await readFile(new URL('../src/app/api/agent/route.ts', import.meta.url), 'utf8')
assert.ok(!/KIENTRE_QUIZ_STREAM_GDOC: settings\.uploadDrive/.test(agentRoute), 'agent route không được bật realtime GDoc cho quiz')
assert.match(agentRoute, /KIENTRE_QUIZ_STREAM_GDOC: ''/)
assert.match(agentRoute, /normalizeDriveFolderId/)
assert.match(agentRoute, /HERMES_MODEL_RETRIES/)
assert.match(agentRoute, /HERMES_MODEL_RETRY_DELAY_MS/)

const runRoute = await readFile(new URL('../src/app/api/run/route.ts', import.meta.url), 'utf8')
assert.ok(!/KIENTRE_QUIZ_STREAM_GDOC: settings\.uploadDrive/.test(runRoute), 'run route không được bật realtime GDoc cho quiz')
assert.match(runRoute, /KIENTRE_QUIZ_STREAM_GDOC: ''/)

const slash = await readFile(new URL('../kientre-engine/slash.mjs', import.meta.url), 'utf8')
assert.match(slash, /HermesWorkSpace\/Kitee/)
assert.ok(!/HermesWorkSpace\/Kientre'/.test(slash), 'slash workspace không được trỏ nhầm Kientre')

const paths = await readFile(new URL('../kientre-engine/server/paths.mjs', import.meta.url), 'utf8')
assert.match(paths, /HermesWorkSpace\/Kitee/)
assert.ok(!/HermesWorkSpace\/Kientre'/.test(paths), 'paths fallback không được trỏ nhầm Kientre')

const orchestrator = await readFile(new URL('../kientre-engine/orchestrator.mjs', import.meta.url), 'utf8')
assert.match(orchestrator, /for \(const \[idx, chunk\] of chunks\.entries\(\)\)/)
assert.ok(!/Promise\.all\(workerTasks\)/.test(orchestrator), 'topic compose không được chạy chunks song song vì dễ 429')
assert.match(orchestrator, /visualsOff/)
assert.match(orchestrator, /if \(b\.type === 'figure' && visualsOff\)/)

const compiler = await readFile(new URL('../kientre-engine/server/compiler.mjs', import.meta.url), 'utf8')
assert.match(compiler, /KIENTRE_OFFICECLI_WORD !== '1'/)

const uploader = await readFile(new URL('../kientre-engine/scripts/kientre_drive_upload.py', import.meta.url), 'utf8')
assert.match(uploader, /force_slim=False/)
assert.match(uploader, /if args\.delete_local and gdoc/)
// Uploader giữ hợp đồng docxLink + gdocLink/gdocError.
assert.match(uploader, /'docxLink':/)
assert.match(uploader, /'gdocLink':/)
assert.match(uploader, /'gdocError':/)
// 401 force-refresh retry path cho raw .docx.
assert.match(uploader, /def is_auth_error/)
assert.match(uploader, /refresh_if_needed\(args\.token, tdata, force=True\)/)

console.log('quiz-count probe ok')
