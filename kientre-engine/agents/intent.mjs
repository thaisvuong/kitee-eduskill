import { chatJSON } from '../server/llm.mjs'

/** Bộ điều phối hội thoại: đọc lịch sử chat -> xác định ý định + tham số, hỏi lại nếu thiếu. */
export async function parseIntent(history, hasFile = false, model = process.env.HERMES_JUDGE_MODEL || 'cx/gpt-5.5') {
 const convo = history.map(m => `${m.role === 'user' ? 'NGƯỜI DÙNG' : 'TRỢ LÝ'}: ${m.text}`).join('\n')
 const system = "Bạn là BỘ ĐIỀU PHỐI của trợ lý soạn tài liệu giáo dục Việt Nam. Đọc hội thoại, xác định Ý ĐỊNH và THAM SỐ, và HỎI LẠI (kèm lựa chọn) cho những thông tin BẮT BUỘC còn thiếu. LUÔN trả JSON hợp lệ, không kèm gì ngoài JSON."
 const prompt = `Hội thoại (đã có tệp tải lên: ${hasFile ? 'CÓ' : 'KHÔNG'}):
${convo}

Xác định:
- "intent": một trong:
 • "exam"  = đề thi / đề kiểm tra / đề chuyển cấp (có trắc nghiệm/điền đáp án/tự luận).
 • "compose" = soạn chuyên đề / bài học (lý thuyết + ví dụ + bài tập).
 • "solve"  = giải chi tiết một TÀI LIỆU đã tải lên.
 • "review" = kiểm tra & nhận xét một TÀI LIỆU đã tải lên.
- "params": {grade, subject, topic, mc, fill, essay, essayPoints, depth ("summary"|"detailed"), solveMode, special}. CHỈ điền cái SUY RA được từ hội thoại (mc/fill/essay là SỐ câu mỗi loại; essayPoints là điểm phần tự luận).
- "missing": các câu hỏi cần hỏi lại cho thông tin BẮT BUỘC còn thiếu, mỗi câu {field, question, options (2-5 lựa chọn gợi ý)}. Quy tắc:
 • Luôn cần: grade, subject.
 • exam: cần mc, fill, essay (nếu người dùng CHƯA nêu số câu).
 • compose: cần topic; và hỏi "depth" (Tóm tắt/Chi tiết) nếu chưa nêu.
 • solve/review: nếu CHƯA có tệp -> hỏi người dùng tải tệp (field "file").
 • KHÔNG hỏi lại thứ đã biết. Ưu tiên đưa options cụ thể (vd Lớp: ["Lớp 5","Lớp 6","Lớp 9"]; Môn: ["Toán","Tiếng Việt","Tiếng Anh"]).
- "ready": true nếu KHÔNG còn "missing".
- "reply": 1 câu ngắn, thân thiện (xác nhận điều đã hiểu, hoặc dẫn vào câu hỏi).

Trả JSON: {"intent":"","params":{},"missing":[{"field":"","question":"","options":[]}],"ready":false,"reply":""}`
 const res = await chatJSON({ model, system, user: prompt })
 return {
  intent: res?.intent || 'compose',
  params: res?.params || {},
  missing: Array.isArray(res?.missing) ? res.missing : [],
  ready: !!res?.ready && (!res?.missing || res.missing.length === 0),
  reply: res?.reply || '',
 }
}
