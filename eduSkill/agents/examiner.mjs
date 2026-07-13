import { chatJSON } from '../server/llm.mjs'

/** Ra ĐỀ THI: trắc nghiệm + điền đáp án + tự luận (điểm từng ý). */
export async function generateExam(o, model = 'gc/gemini-2.5-flash') {
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
