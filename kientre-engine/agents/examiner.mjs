import { chatJSON } from '../server/llm.mjs'
import { searchWeb } from '../server/websearch.mjs'

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
 const webQuery = `${topic} ${grade} ${subject} ${question.type || ''} ${question.note || ''}`.trim()
 let webRef = ''
 if (reference) try {
  const web = await searchWeb(webQuery, 3)
  webRef = web.map((r, i) => `Nguồn ${i + 1}: ${r.title}\n${r.snippet || ''}\n${r.url || ''}`).join('\n\n').slice(0, 1800)
 } catch { /* ignore web failure */ }
 const mergedRef = [reference, webRef].filter(Boolean).join('\n\n')
 const ref = mergedRef ? `\nNGUỒN/TÀI LIỆU THAM CHIẾU:\n"""${String(mergedRef).slice(0, 2600)}"""` : ''
 const system = 'Bạn là Examiner soạn từng câu quiz tiểu học Việt Nam. LUÔN trả JSON hợp lệ, không kèm markdown ngoài JSON.'
 const user = `Soạn ĐÚNG 1 câu cho quiz. Giữ đồng bộ với context chung, không tự đổi mục tiêu.

Môn/lớp/chủ đề: ${subject} ${grade}, ${topic}
Context chung: ${globalContext}
Quiz: ${quiz.title || `Quiz ${quiz.index}`} · độ khó ${quiz.difficulty || ''} · mục tiêu ${quiz.goal || ''}
File khung.md: ${question.framePath || ''}
Dòng khung.md ĐÃ ĐÁNH DẤU TAKEN: ${question.frameLine || `Câu ${question.index}, loại ${question.type}, ${question.points} điểm, note: ${question.note || ''}`}
Nội dung khung.md liên quan:
"""${String(question.frameMd || '').slice(0, 3000)}"""
Yêu cầu hình: ${question.visual || 'không bắt buộc'}${ref}

Không được tự chọn câu khác. Phải triển khai đúng dòng khung.md đã lấy ở trên.
ĐẦU VÀO là DẠNG BÀI trong khung.md (chỉ mô tả loại bài + dữ kiện dự kiến + bẫy + năng lực), CHƯA phải đề hoàn chỉnh. Nhiệm vụ của bạn: BIẾN DẠNG BÀI THÀNH CÂU HỎI HOÀN CHỈNH. Tự chọn số liệu cụ thể hợp lý, công bằng, đúng lớp ${grade}, đúng số điểm ${question.points || ''}. Tự viết đề đầy đủ, tạo đáp án, hints, lời giải. QuizPlanner chỉ giao dạng bài; việc soạn câu hoàn chỉnh là của bạn.
Ưu tiên: nếu có NGUỒN/TÀI LIỆU tham chiếu ở trên, hãy BÁM theo bài tập/dạng câu trong nguồn và CHẾ LẠI về đúng loại "${question.type}" (trắc nghiệm 4 lựa chọn / điền đáp án / tự luận). Không bịa nếu nguồn đã có dạng phù hợp.
Câu hỏi phải khó hơn mức cơ bản, có bẫy hợp lệ theo note/độ khó QuizPlanner giao. Ưu tiên bẫy: dữ kiện thừa, phương án nhiễu rất gần đúng, nhầm đơn vị, nhầm thứ tự phép tính, nhầm điều kiện, nhầm khái niệm, nhầm đọc hình. Bẫy phải công bằng, không mơ hồ.
Trả về: question, options (nếu trắc nghiệm), answer, hints, solution, visual.
BẮT BUỘC: đúng 3 gợi ý (hints) theo hướng dẫn từng bước. Mỗi hint tự nhiên như "Gợi ý 1: ...", "Gợi ý 2: ...", "Gợi ý 3: ..." (không viết đáp án trong gợi ý). Tự luận phải có lời giải chi tiết và điểm từng ý.
Với trắc nghiệm: 4 phương án A/B/C/D phải đều có vẻ hợp lý; ít nhất 2 phương án sai phải là lỗi học sinh thường mắc.
visual phải là mô tả hình toán học cụ thể để tìm đúng ảnh nguồn hoặc tự vẽ: nêu đối tượng, nhãn điểm, quan hệ hình học; không mô tả ảnh người/ảnh trang trí.

JSON: {"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"...","hints":["...","...","..."],"solution":"...","visual":"..."}`
 const res = await chatJSON({ model, system, user, temperature: 0.45 })
 let hints = Array.isArray(res?.hints) ? res.hints.filter(Boolean) : []
 if (hints.length > 3) hints = hints.slice(0, 3)
 const isMc = String(question.type || '').toLowerCase().includes('trắc')
 const isFill = String(question.type || '').toLowerCase().includes('điền')
 const options = isMc ? (Array.isArray(res?.options) ? res.options.slice(0, 4).map(String) : []) : []
 const solution = Array.isArray(res?.solution) ? res.solution.join('\n') : String(res?.solution || '')
  return {
   question: res?.question || '',
  options,
   answer: res?.answer || '',
  hints: hints.map((h, i) => `Gợi ý ${i + 1}: ${String(h).replace(/^Gợi ý\s*\d+\s*[:.\-]?\s*/i, '').trim()}`),
  solution,
  visual: String(res?.visual || question.visual || ''),
  // ponytail: lightweight frame check. add full semantic validator when wrong type slips through often.
  frameOk: isMc ? options.length === 4 : isFill ? options.length === 0 : true,
 }
}
