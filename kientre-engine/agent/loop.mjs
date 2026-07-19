// Mini-agent loop: LLM + tool-calling. Model decides which tools to call to
// accomplish the task, up to maxTurns. Emits step events via onStep so the UI
// can show the agent "thinking".
import { callChat } from '../server/llm.mjs'
import { routeIntent } from '../agents/intent_router.mjs'
import { getSchemas, run as runTool } from './tools/registry.mjs'
import './tools/builtins.mjs' // registers the built-in tools

function buildSystem(config) {
 const parts = []
 parts.push(config.persona || 'Bạn là trợ lý AI soạn tài liệu giáo dục tiểu học Việt Nam, cẩn thận và bám chương trình.')
 if (config.systemPrompt) parts.push(config.systemPrompt)
 for (const sk of config.skills || []) {
  if (sk.systemPrompt) parts.push(`## Kỹ năng: ${sk.name}\n${sk.systemPrompt}${sk.guidance ? '\n' + sk.guidance : ''}`)
 }
 parts.push('Khi module có skill/flow tương ứng, phải gọi run_skill để dùng pipeline cứng tạo Word đầy đủ; không tự viết tắt bằng finish. Chỉ dùng write_docx trực tiếp khi không có pipeline phù hợp. Khi đã hoàn thành, GỌI finish kèm tóm tắt. Không bịa nội dung ngoài nguồn khi đã có source. Trả lời bằng tiếng Việt.')
 if (config.grade || config.subject) parts.push(`Bối cảnh mặc định: ${config.subject || 'Toán'} · ${config.grade || 'Lớp 5'}.`)
 if (config.sessionContext?.fullText) {
  parts.push(`## Ghi nhớ phiên làm việc hiện tại\n${config.sessionContext.fullText}`)
 }
 if (config.sessionContext?.memory?.summary) {
  parts.push(`## Bộ nhớ session đã lưu\n${config.sessionContext.memory.summary}`)
 }
 parts.push(`## Cân bằng mức độ bài tập\n${config.difficultyBalancing || 'Dựa trên toàn bộ phiên, tạo bài dễ/vừa/khó cân bằng và điều chỉnh theo phản hồi người dùng.'}`)
 if (config.quizSpec) {
  parts.push(`## Module soạn quiz theo chuyên đề\nTạo ĐÚNG ${config.quizSpec.quizCount} quiz theo số lượng UI, không mặc định 5 quiz/cấp độ 1→5. Mỗi quiz có trắc nghiệm, điền đáp án, tự luận. Tổng điểm mỗi quiz: ${config.quizSpec.totalScore}. Thời gian cho phép: ${config.quizSpec.timeMinutes} phút; tự luận phải có lời giải chi tiết và điểm từng ý.`)
 }
 return parts.filter(Boolean).join('\n\n')
}

function requiredFlow(config) {
 const fromSkill = (config.skillFlows || []).find(s => Array.isArray(s.agentFlow) && s.agentFlow.length)?.agentFlow
 if (fromSkill?.length) return fromSkill
 const map = {
  topic: ['Intent', 'Architect', 'Source/NotebookLM', 'Judge', 'VisualCurator', 'Artist', 'Student', 'Reviewer', 'Word'],
  quiz: ['Intent', 'Architect', 'Source/NotebookLM', 'QuizPlanner', 'Examiner', 'Artist', 'Judge', 'Reviewer', 'Word'],
  test: ['Intent', 'Examiner', 'Judge', 'Reviewer', 'Word'],
  solve: ['Read/Extract', 'Solver', 'Judge', 'Reviewer', 'Word'],
  review: ['Read/Extract', 'Reviewer', 'Judge', 'Word'],
 }
 return map[config.moduleKey] || []
}

function requiredSkill(config) {
 if (config.moduleKey === 'topic') return 'topic'
 if (config.moduleKey === 'quiz') return 'quiz'
 if (config.moduleKey === 'test') return 'exam'
 if (config.moduleKey === 'solve') return 'solve'
 if (config.moduleKey === 'review') return 'review'
 return ''
}

function chooseSubAgents(task, config) {
 const forced = requiredFlow(config)
 if (forced.length) return forced
 const text = `${config.moduleKey || ''} ${task}`.toLowerCase()
 const agents = ['Intent']
 if (/quiz|trắc nghiệm|điền|tự luận|chuyên đề|soạn|bài học|topic/.test(text)) agents.push('Architect')
 if (/đề kiểm tra|exam|test|ma trận/.test(text)) agents.push('Examiner')
 if (/giải|solve|đáp án|lời giải/.test(text)) agents.push('Solver')
 if (/học sinh|thời gian|phút|độ khó|dễ|vừa|khó|quiz/.test(text)) agents.push('Student')
 if (/hình|ảnh|minh hoạ|tikz|biểu đồ|visual/.test(text)) agents.push('VisualCurator', 'Artist')
 if (/review|nhận xét|kiểm|đúng|sai|lỗi|thẩm định|judge/.test(text) || ['quiz', 'test', 'solve', 'review'].includes(config.moduleKey)) agents.push('Judge', 'Reviewer')
 if (agents.length === 1) agents.push(config.moduleKey === 'review' ? 'Reviewer' : config.moduleKey === 'solve' ? 'Solver' : 'Architect')
 return [...new Set(agents)]
}

// Compact a source list into a short catalog the model sees up-front.
function sourceCatalog(sources = []) {
 if (!sources.length) return ''
 const lines = sources.map(s => `- [${s.id}] ${s.title} (${(s.content || '').length} ký tự)`)
 return `Các tài liệu nguồn đã nạp (dùng read_source để đọc):\n${lines.join('\n')}`
}

export async function runAgent({ task, config = {}, sources = [], history = [], onStep = () => {} }) {
 const maxTurns = Math.max(1, Math.min(Number(config.maxTurns) || 12, 24))
 const subAgents = chooseSubAgents(task, config)
 const skill = requiredSkill(config)
 const enabledTools = config.enabledTools?.length ? config.enabledTools : ['read_source', 'web_search', 'analyze_document', 'write_docx', 'finish']
 const tools = getSchemas(enabledTools)
 const createdFiles = []
 const intent = await routeIntent({ task, moduleKey: config.moduleKey, grade: config.grade, subject: config.subject, sessionContext: config.sessionContext, runningJobs: config.runningJobs || [] })
 onStep({ type: 'assistant', text: `Intent: ${intent.runFlow ? 'chạy flow' : 'trả lời chat'} — ${intent.reason || ''}` })
 if (!intent.runFlow) {
  const reply = intent.reply || 'Anh muốn em hỗ trợ gì tiếp?'
  onStep({ type: 'final', text: reply, createdFiles })
  return { finalText: reply, createdFiles }
 }
 const ctx = {
  sources, createdFiles,
  outputDir: process.env.KIENTRE_OUTPUT_DIR,
  workspaceDir: process.env.HERMES_WORKSPACE_DIR,
  grade: config.grade, subject: config.subject, moduleKey: config.moduleKey,
  quizSpec: config.quizSpec || null,
  onStep,
  notebookIds: config.notebookIds || [], activeNotebookId: config.activeNotebookId || '',
 }

 const catalog = sourceCatalog(sources)
 onStep({ type: 'assistant', text: `Sub-agent tự chọn: ${subAgents.join(' → ')}` })
 const skillFlowText = (config.skillFlows || []).filter(s => s.agentFlow?.length).map(s => `- ${s.name}: ${s.agentFlow.join(' → ')}`).join('\n')
 const canWebSearch = enabledTools.includes('web_search')
 const nbNote = config.useNotebook
  ? `\n\n## Nguồn NotebookLM\nNgười dùng ĐÃ bật NotebookLM. Trước khi run_skill, gọi read_notebook để lấy nguồn và bám theo nội dung đó.`
  : config.moduleKey === 'quiz'
   ? `\n\n## Logic nguồn cho quiz\nQuizPlanner phải tự lập khung theo môn/lớp/chủ đề và nguồn người dùng, KHÔNG web_search ở bước lập khung. Chỉ sau khi đã có khung, Examiner mới được phép tìm dạng câu gần trên web/tài liệu để chế lại; nếu không có dạng phù hợp thì vẫn phải tự ra đề.`
   : canWebSearch
    ? `\n\n## Nguồn web\nKhông có NotebookLM/tài liệu riêng. Phải ưu tiên web_search để tìm nguồn tài liệu/bài tập thật rồi gọi run_skill. Nếu cần hình minh họa, Artist/ImageFetcher lấy ảnh thật từ nguồn web/Openverse/Wikimedia; chỉ dùng tạo ảnh 9Router khi biến KIENTRE_ALLOW_IMAGE_GENERATION được bật rõ.`
    : `\n\n## Không dùng nguồn ngoài\nNgười dùng KHÔNG bật NotebookLM và không nạp tài liệu riêng. TỰ soạn theo chuyên đề, KHÔNG gọi web_search/read_source/read_notebook. Đi thẳng vào run_skill.`
 const forceSkill = skill ? `\n\n## Bắt buộc dùng flow đã thiết lập\n${config.moduleKey === 'quiz' ? 'NGAY BƯỚC ĐẦU gọi tool run_skill' : (canWebSearch ? 'BƯỚC ĐẦU gọi web_search để lấy nguồn thật, rồi gọi run_skill' : 'NGAY BƯỚC ĐẦU gọi tool run_skill')} với skill="${skill}" để tạo file Word đầy đủ. ${config.moduleKey === 'quiz' ? `Đây là module quiz riêng, KHÔNG dùng skill topic, KHÔNG soạn lý thuyết/chuyên đề. QuizPlanner không web_search; chỉ Examiner mới được phép web-search sau khi có khung. Truyền ĐÚNG quizCount=${config.quizSpec?.quizCount || 1}, totalScore=${config.quizSpec?.totalScore || 10}, timeMinutes=${config.quizSpec?.timeMinutes || 35}; không tự đổi thành 5 quiz.` : ''} Không kết thúc nếu chưa có Word file. Không lan man giải thích.` : ''
 const messages = [
  { role: 'system', content: buildSystem(config) + `\n\n## Sub-agent cần dùng\n${subAgents.join(' → ')}. Tự phân vai theo chuỗi này; không hỏi người dùng chọn tool.` + (skillFlowText ? `\n\n## Flow lưu trong từng skill\n${skillFlowText}` : '') + nbNote + forceSkill + (catalog ? '\n\n' + catalog : '') },
  // prior turns of this session (already trimmed by caller)
  ...history,
  { role: 'user', content: task },
 ]

 let finalText = ''
 for (let turn = 1; turn <= maxTurns; turn++) {
  onStep({ type: 'turn', turn, maxTurns })
  let msg
  try {
   msg = await callChat({ model: config.model, messages, tools })
  } catch (e) {
   onStep({ type: 'error', message: e.message })
   finalText = `Lỗi gọi model: ${e.message}`
   break
  }
  // record assistant message (must include tool_calls so the API stays valid)
  messages.push({ role: 'assistant', content: msg.content || '', tool_calls: msg.tool_calls })
  if (msg.content) onStep({ type: 'assistant', text: msg.content })

  if (!msg.tool_calls || msg.tool_calls.length === 0) {
   finalText = msg.content || ''
   break
  }

  let finished = false
  for (const call of msg.tool_calls) {
   const name = call.function?.name
   let args = {}
   try { args = JSON.parse(call.function?.arguments || '{}') } catch {}
   if (name === 'run_skill' && skill) args = { ...args, skill }
   // Quiz: pipeline riêng; nhét cấu hình quiz nếu model chưa truyền.
   if (name === 'run_skill' && config.moduleKey === 'quiz') {
    const q = config.quizSpec || {}
    args = { ...args, skill: 'quiz', quizCount: Number(q.quizCount || 1), totalScore: Number(q.totalScore || 10), timeMinutes: Number(q.timeMinutes || 35) }
   }
   onStep({ type: 'tool_call', name, args })
   const out = await runTool(name, args, ctx)
   const brief = out.ok
    ? (out.result?.summary || out.result?.file || out.result?.title || JSON.stringify(out.result).slice(0, 200))
    : `❌ ${out.error}`
   onStep({ type: 'tool_result', name, ok: out.ok, brief })
   messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(out).slice(0, 8000) })
   if (name === 'finish' && out.ok) { finished = true; finalText = out.result?.summary || finalText }
  }
  if (finished) break
  if (turn === maxTurns) { finalText = finalText || 'Đã đạt giới hạn số bước. Dừng lại.'; onStep({ type: 'limit', maxTurns }) }
 }

 onStep({ type: 'final', text: finalText, createdFiles })
 return { finalText, createdFiles }
}
