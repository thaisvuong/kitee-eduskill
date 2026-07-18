import { chatJSON } from '../server/llm.mjs'

/** Ra ĐỀ THI: trắc nghiệm + điền đáp án + tự luận (điểm từng ý). */
export async function generateExam(o, model = process.env.HERMES_EXAMINER_MODEL || 'gc/gemini-2.5-flash') {
 const { grade, subject, topic, mc = 0, fill = 0, essay = 0, essayPoints = 6, special, reference } = o
 const sp = special ? `\nYÊU CẦU ĐẶC BIỆT (bắt buộc): ${special}` : ''
 const ref = reference ? `\nNGUỒN THAM KHẢO (ưu tiên bám theo đề/tài liệu thật):\n"""${String(reference).slice(0, 3800)}"""` : ''
 const system = "Bạn là giáo viên ra đề thi Việt Nam giàu kinh nghiệm. LUÔN trả JSON hợp lệ. Mọi công thức/phép tính đặt trong $...$, dùng dấu phẩy thập phân kiểu Việt Nam."
 const prompt = `Ra một ĐỀ ${topic ? 'về "' + topic + '"' : 'tổng hợp (chuyển cấp)'} cho ${grade}, môn ${subject}. Đúng trình độ ${grade}, KHÔNG vượt cấp.
Cấu trúc:
- ${mc} câu TRẮC NGHIỆM (mỗi câu 4 lựa chọn A/B/C/D, chỉ 1 đáp án đúng).
- ${fill} câu ĐIỀN ĐÁP ÁN (điền số/đáp án ngắn).
- ${essay} câu TỰ LUẬN, mỗi câu chia thành các Ý, GHI ĐIỂM từng ý; tổng điểm phần tự luận khoảng ${essayPoints} điểm.
Mỗi câu đều có lời giải/đáp án để làm đáp án riêng.${sp}${ref}

Trả JSON:
{
 "mc":[{"q":"đề","options":["A","B","C","D"],"answer":"A","solution":"giải ngắn"}],
 "fill":[{"q":"đề","answer":"đáp án","solution":"giải ngắn"}],
 "essay":[{"q":"đề chung (nếu có)","parts":[{"text":"ý a)","points":2,"solution":"lời giải ý a"}]}]
}`
 const res = await chatJSON({ model, system, user: prompt })
 return { mc: res?.mc || [], fill: res?.fill || [], essay: res?.essay || [] }
}

export async function generateQuizQuestion(o, model = process.env.HERMES_EXAMINER_MODEL || 'gc/gemini-2.5-flash') {
 const { grade, subject, topic, globalContext = '', quiz = {}, question = {}, reference = '' } = o
 const ref = reference ? `\nNGUỒN/TÀI LIỆU THAM CHIẾU:\n"""${String(reference).slice(0, 2600)}"""` : ''
 const system = 'Bạn là Examiner soạn từng câu quiz tiểu học Việt Nam. LUÔN trả JSON hợp lệ, không kèm markdown ngoài JSON.'
 const user = `Soạn ĐÚNG 1 câu cho quiz. Giữ đồng bộ với context chung, không tự đổi mục tiêu.

Môn/lớp/chủ đề: ${subject} ${grade}, ${topic}
Context chung: ${globalContext}
Quiz: ${quiz.title || `Quiz ${quiz.index}`} · độ khó ${quiz.difficulty || ''} · mục tiêu ${quiz.goal || ''}
Khung câu: Câu ${question.index}, loại ${question.type}, ${question.points} điểm, note: ${question.note || ''}
Yêu cầu hình: ${question.visual || 'không bắt buộc'}${ref}

Ưu tiên: nếu có NGUỒN/TÀI LIỆU tham chiếu ở trên, hãy BÁM theo bài tập/dạng câu trong nguồn và CHẾ LẠI về đúng loại "${question.type}" (trắc nghiệm 4 lựa chọn / điền đáp án / tự luận). Không bịa nếu nguồn đã có dạng phù hợp.
Trả về: question, options (nếu trắc nghiệm), answer, hints, solution, visual.
BẮT BUỘC: đúng 3 gợi ý (hints) theo hướng dẫn từng bước. Tự luận phải có lời giải chi tiết và điểm từng ý.

JSON: {"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"...","hints":["...","...","..."],"solution":"...","visual":"..."}`
 const res = await chatJSON({ model, system, user, temperature: 0.45 })
 let hints = Array.isArray(res?.hints) ? res.hints.filter(Boolean) : []
 if (hints.length > 3) hints = hints.slice(0, 3)
 return {
  question: res?.question || '',
  options: Array.isArray(res?.options) ? res.options : [],
  answer: res?.answer || '',
  hints,
  solution: res?.solution || '',
  visual: res?.visual || question.visual || '',
 }
}
