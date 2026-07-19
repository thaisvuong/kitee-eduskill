import { chatJSON } from '../server/llm.mjs'

function normalizeReview(res = {}) {
 const errors = Array.isArray(res?.errors) ? res.errors : []
 const improvements = Array.isArray(res?.improvements) ? res.improvements : []
 const blockingErrors = Array.isArray(res?.blockingErrors) ? res.blockingErrors : []
 const verdict = String(res?.verdict || (blockingErrors.length || errors.length ? 'FAIL' : 'PASS')).toUpperCase()
 return {
  verdict: verdict === 'PASS' ? 'PASS' : 'FAIL',
  overall: res?.overall || '',
  score: res?.score || '',
  strengths: Array.isArray(res?.strengths) ? res.strengths : [],
  improvements,
  errors,
  blockingErrors,
  requiredFixes: Array.isArray(res?.requiredFixes) ? res.requiredFixes : [],
  factualChecks: Array.isArray(res?.factualChecks) ? res.factualChecks : [],
  gradeBoundaryChecks: Array.isArray(res?.gradeBoundaryChecks) ? res.gradeBoundaryChecks : [],
 }
}

/**
 * PIPELINE 2 — Agent Thẩm định nghiêm khắc.
 * Nguyên tắc: mọi lỗi kiến thức, vượt cấp, đề/đáp án sai, hình minh họa gây hiểu nhầm,
 * hoặc trình bày có thể làm học sinh hiểu sai đều là blocking issue, không cho qua.
 */
export async function reviewDocument(text, grade, subject = 'Toán', model = process.env.HERMES_REVIEWER_MODEL || process.env.HERMES_WORKER_MODEL || 'cx/gpt-5.5') {
 const system = `Bạn là Reviewer kiểm định chất lượng tài liệu giáo dục cho học sinh.
Bạn cực kỳ nghiêm khắc: KHÔNG cho bất kỳ sai phạm nào vượt qua.
Nếu có lỗi kiến thức, sai đáp án, vượt chương trình khối lớp, đề mơ hồ, thiếu dữ kiện, hình minh họa sai/gây hiểu nhầm, hoặc trình bày khiến học sinh có thể hiểu sai, verdict phải là FAIL.
Không khen chung chung để che lỗi. Luôn trả JSON hợp lệ.`

 const prompt = `Lớp: ${grade}, Môn: ${subject}.

Hãy kiểm định tài liệu dưới đây theo chuẩn "zero tolerance".

Bắt buộc kiểm tra:
1. Chính xác kiến thức và thuật ngữ.
2. Đúng ranh giới chương trình/khối lớp; không vượt cấp.
3. Tất cả bài tập có đủ dữ kiện, không mơ hồ, không nhiều đáp án ngoài ý muốn.
4. Đáp án/lời giải/biểu điểm nếu xuất hiện phải đúng tuyệt đối.
5. Mức độ khó phù hợp, có phân hóa nhưng không đánh đố sai chuẩn.
6. Hình ảnh/biểu đồ/minh họa nếu có phải đúng nội dung, không gây hiểu nhầm.
7. Trình bày, ký hiệu, đơn vị, câu chữ phải rõ ràng cho học sinh ${grade}.

Quy tắc verdict:
- PASS chỉ khi KHÔNG có blocking issue.
- FAIL nếu có bất kỳ lỗi nào có thể làm học sinh học sai, làm sai, hoặc giáo viên không thể dùng ngay.
- Không được bỏ qua lỗi nhỏ nếu lỗi đó ảnh hưởng hiểu bài/chấm bài.

TÀI LIỆU:
"""${(text || '').slice(0, 18000)}"""

Trả về JSON:
{
 "verdict": "PASS" | "FAIL",
 "overall": "nhận xét chung 3-5 câu, nêu rõ có dùng ngay được không",
 "score": "x/10",
 "strengths": ["điểm mạnh cụ thể"],
 "blockingErrors": ["lỗi bắt buộc phải sửa trước khi dùng"],
 "errors": ["mọi lỗi kiến thức/vượt cấp/sai đáp án/hình sai/câu mơ hồ"],
 "requiredFixes": ["việc phải sửa cụ thể"],
 "improvements": [{"issue":"vấn đề cụ thể", "suggestion":"đề xuất sửa"}],
 "factualChecks": [{"item":"nội dung đã kiểm", "status":"PASS|FAIL", "note":"ghi chú"}],
 "gradeBoundaryChecks": [{"item":"nội dung/dạng bài", "status":"PASS|FAIL", "note":"vì sao phù hợp hoặc vượt cấp"}]
}`

 const res = await chatJSON({ model, system, user: prompt, temperature: 0.05 })
 return normalizeReview(res)
}
