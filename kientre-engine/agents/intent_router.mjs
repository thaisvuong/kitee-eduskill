import { chatJSON } from '../server/llm.mjs'

function localIntent(task, moduleKey) {
 const text = String(task || '').trim().toLowerCase()
 if (!text) return null
 if (/^(chào|hello|hi|hey|cảm ơn|thanks|thank you|test chat)\b/i.test(text)) {
  return { runFlow: false, reply: 'Anh muốn em hỗ trợ gì tiếp?', reason: 'chat thường' }
 }
 if (/\b(đang làm|dang lam|task|việc gì|viec gi|đang thực hiện|dang thuc hien|tiến độ|tien do|trạng thái|trang thai)\b/i.test(text)) {
  return { runFlow: false, reply: '', reason: 'hỏi trạng thái task/session' }
 }
 if (/\b(app|dự án|project|web app)\b.*\b(làm gì|thực hiện gì|dùng để làm gì)\b/i.test(text)) {
  return { runFlow: false, reply: 'KientreAAA dùng để soạn chuyên đề, quiz, đề kiểm tra, giải và review tài liệu giáo dục bằng AI.', reason: 'hỏi thông tin app' }
 }
 if (/\b(tạo|soạn|lập|xuất|word|docx|pdf|quiz|chuyên đề|đề kiểm tra|giải|review|nhận xét|xử lý file|xu ly file|tài liệu vừa tải|tai lieu vua tai)\b/i.test(text)) {
  return { runFlow: true, reply: '', reason: 'yêu cầu tạo/xử lý tài liệu' }
 }
 return null
}

export async function routeIntent({ task, moduleKey, grade, subject, sessionContext = {}, runningJobs = [] }, model = process.env.HERMES_INTENT_MODEL || process.env.HERMES_JUDGE_MODEL || 'cx/gpt-5.5') {
 const local = localIntent(task, moduleKey)
 if (local) return local
 const system = 'Bạn là Intent agent cho webapp giáo dục. Chỉ quyết định có cần chạy pipeline tạo tài liệu hay trả lời chat thường. LUÔN trả JSON hợp lệ.'
 const user = `Module hiện tại: ${moduleKey}. Môn/lớp: ${subject || 'Toán'} ${grade || 'Lớp 5'}.
Job đang chạy: ${JSON.stringify(runningJobs).slice(0, 2000)}
Bộ nhớ session đã lưu:
"""
${String(sessionContext?.memory?.summary || sessionContext?.fullText || '').slice(0, 6000)}
"""
Tin nhắn người dùng: """${task}"""

Quy tắc:
- runFlow=true chỉ khi người dùng dùng động từ hành động rõ: soạn/tạo/lập/xuất/viết file Word/Docx/PDF/tạo quiz/tạo đề kiểm tra/giải file/review file/xử lý file, hoặc có output tài liệu rõ.
- runFlow=false nếu người dùng chỉ hỏi đáp nhanh, hỏi kiến thức, hỏi danh sách, hỏi "là gì", "gồm những gì", "có những", "kể tên", "liệt kê", "chủ điểm/chủ đề nào", chào hỏi, hỏi help, hỏi app làm gì, hỏi đang làm task nào, hỏi nhớ gì trong phiên, cảm ơn, test chat, hoặc chỉ muốn trả lời ngắn.
- Ví dụ runFlow=false: "Các chủ điểm khoa học trong lớp 5", "Khoa học lớp 5 gồm những chủ đề nào?", "Liệt kê các dạng toán phân số lớp 5".
- Ví dụ runFlow=true: "Soạn quiz phân số lớp 5", "Tạo đề kiểm tra khoa học lớp 5", "Xuất Word chuyên đề phân số".
- Khi runFlow=false, reply phải dùng bộ nhớ/job đang chạy nếu liên quan; trả lời như người đang nhớ cuộc trò chuyện, không nói chung chung.
- reply: câu trả lời chatbot bình thường khi runFlow=false.
- reason: giải thích ngắn quyết định.

JSON: {"runFlow": true, "reply":"", "reason":"..."}`
 return chatJSON({ model, system, user, temperature: 0.1 })
}
