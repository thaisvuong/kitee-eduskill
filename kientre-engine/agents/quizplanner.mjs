import { chatJSON } from '../server/llm.mjs'

export function normalizeQuizCount(quizCount) {
 return Math.max(1, Math.min(20, Math.floor(Number(quizCount) || 1)))
}

export function trimQuizPlan(plan = {}, quizCount = 1) {
 const count = normalizeQuizCount(quizCount)
 const quizzes = (Array.isArray(plan?.quizzes) ? plan.quizzes : []).slice(0, count).map((q, i) => ({ ...q, index: i + 1, title: q?.title || `Quiz ${i + 1}` }))
 return { globalContext: plan?.globalContext || '', quizzes }
}

export async function planQuizSet({ topic, grade, subject, quizCount = 3, totalScore = 10, timeMinutes = 14, reference = '' }, model = process.env.HERMES_QUIZ_PLANNER_MODEL || process.env.HERMES_ARCHITECT_MODEL || 'cc/claude-opus-4-8') {
 const count = normalizeQuizCount(quizCount)
 const ref = reference ? `\nNGUỒN/TÀI LIỆU PHẢI BÁM THEO:\n"""${String(reference).slice(0, 6000)}"""` : '\nKhông có tài liệu riêng: tự soạn theo chương trình, không tạo lý thuyết/ví dụ chuyên đề.'
 const system = 'Bạn là QuizPlanner mạnh. Chỉ lập khung dữ liệu quiz, không viết lời giải dài. LUÔN trả JSON hợp lệ.'
 const user = `Lập KHUNG cho ĐÚNG ${count} quiz môn ${subject} ${grade}, chủ đề "${topic}". Mỗi quiz ${totalScore} điểm, ${timeMinutes} phút.${ref}

BẮT BUỘC:
- Không soạn lý thuyết, không soạn chuyên đề, không tạo 50 ví dụ.
- Số quiz trong JSON phải đúng bằng ${count}. Nếu ${count}=1 thì chỉ có Quiz 1; tuyệt đối không tạo Quiz 2/3/4/5/6.
- Không tự mặc định 5 quiz/cấp độ 1→5. Số quiz luôn lấy từ UI.
- Mỗi quiz là một đề riêng hoàn chỉnh.
- Không dừng ở mức cơ bản. Quiz đầu đã phải có ít nhất 1 câu dễ nhầm. Nếu có nhiều quiz, quiz sau tăng bẫy, tăng suy luận, tăng số bước.
- Quiz cuối khó nhất trong ${count} quiz nhưng vẫn trong ranh giới ${grade}.
- Mỗi câu có: số điểm, loại câu, và note là DẠNG BÀI (chỉ mô tả loại bài + dữ kiện dự kiến + bẫy + năng lực), KHÔNG phải đề bài hoàn chỉnh.
- note CHỈ mô tả dạng bài để Examiner triển khai sau. TUYỆT ĐỐI KHÔNG viết đề hoàn chỉnh với số liệu cụ thể, KHÔNG tạo đáp án, KHÔNG tạo lời giải, KHÔNG tạo hints/gợi ý trong plan.
- note phải nêu: loại câu (vd cộng hai phân số khác mẫu, rút gọn phân số, so sánh 2 phân số, tính diện tích xung quanh hình hộp chữ nhật), dữ kiện dự kiến (vd dài/rộng/cao là số tự nhiên), bẫy sai thường gặp, năng lực kiểm tra, mức khó, và yêu cầu hình nếu hợp lý.
- VÍ DỤ ĐÚNG cho note: "Dạng: tính diện tích xung quanh hình hộp chữ nhật khi biết ba kích thước; dữ kiện dự kiến: dài/rộng/cao là số tự nhiên; bẫy: nhầm với thể tích hoặc diện tích toàn phần; năng lực: nhận đúng công thức."
- VÍ DỤ ĐÚNG khác: "Dạng: bài toán ngược tìm chiều cao từ thể tích và diện tích đáy; bẫy: đổi đơn vị; năng lực: suy luận ngược."
- VÍ DỤ SAI (TUYỆT ĐỐI KHÔNG được như vậy): "Một hình hộp chữ nhật có chiều dài 8 cm, chiều rộng 5 cm, cao 6 cm. Hỏi diện tích xung quanh..." — đây là đề hoàn chỉnh, thuộc việc của Examiner, KHÔNG được để trong note.
- VÍ DỤ SAI khác: note chứa "Đáp án: 156 cm²" hoặc "Gợi ý 1: ..." — cấm tuyệt đối.
- Việc chọn số liệu cụ thể, viết đề hoàn chỉnh, tạo đáp án/hints/lời giải là của Examiner ở bước sau, không phải QuizPlanner.
- Ưu tiên bẫy hợp lệ: dữ kiện thừa/thiếu có chủ đích, phương án nhiễu gần đúng, nhầm đơn vị, nhầm thứ tự phép tính, nhầm khái niệm, nhầm điều kiện, nhầm mẫu số/tử số, nhầm dấu, nhầm đọc hình.
- Tổng điểm mỗi quiz đúng ${totalScore}.
- Phối hợp trắc nghiệm, điền đáp án, tự luận. Tự luận cần lời giải chi tiết và điểm từng ý ở bước sau.
- Các quiz tăng dần độ khó; trong cùng một quiz, câu sau khó hơn câu trước.

Trả JSON đúng schema:
{
 "globalContext":"nguyên tắc chung để các agent sau giữ đồng bộ",
 "quizzes":[
  {"index":1,"title":"Quiz 1","difficulty":"Nhận biết","goal":"...","questions":[
   {"index":1,"type":"trắc nghiệm","points":2,"note":"DẠNG BÀI: mô tả loại bài + dữ kiện dự kiến + bẫy + năng lực, KHÔNG viết đề đầy đủ, KHÔNG có đáp án/lời giải/hints","visual":"mô tả hình cần vẽ hoặc rỗng","sourceHint":"nguồn cần bám hoặc rỗng"}
  ]}
 ]
}`
 const res = await chatJSON({ model, system, user, temperature: 0.35 })
 return trimQuizPlan(res, count)
}
