import { chatJSON } from '../server/llm.mjs'

/** PIPELINE 1 — Agent Giải bài: nhận tài liệu, giải CHI TIẾT từng câu, đúng khối lớp/chương trình. */
export async function solveDocument(text, grade, subject = 'Toán', model = process.env.HERMES_SOLVER_MODEL || process.env.HERMES_WORKER_MODEL || 'gc/gemini-2.5-flash') {
 const system = "Bạn là giáo viên giải bài mẫu mực. Bạn giải CHI TIẾT từng câu (từng bước, có đáp số), đúng khối lớp và chương trình, KHÔNG dùng cách vượt cấp. Công thức đặt trong $...$. LUÔN trả JSON hợp lệ."
 const prompt = `Lớp: ${grade}, Môn: ${subject}.
Dưới đây là tài liệu/đề bài. Hãy TÌM tất cả câu hỏi/bài tập trong đó và GIẢI CHI TIẾT từng câu theo đúng phương pháp của khối lớp ${grade} (không dùng kiến thức vượt cấp). Nếu đề không đánh số, tự đánh "Câu 1, Câu 2...". Ghi rõ đáp số cuối mỗi câu.

TÀI LIỆU:
"""${(text || '').slice(0, 12000)}"""

Trả về JSON: {"title":"Lời giải chi tiết - ...","solutions":[{"title":"Câu 1","question":"tóm tắt đề","solution":"lời giải chi tiết, dùng $...$ cho công thức"}]}`
 const res = await chatJSON({ model, system, user: prompt })
 return {
  title: res?.title || 'Lời giải chi tiết',
  solutions: Array.isArray(res?.solutions) ? res.solutions.filter(s => s && s.solution) : []
 }
}
