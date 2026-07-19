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

function stripChoicePrefix(text = '') { return String(text || '').replace(/^\s*[A-D]\s*[.)]\s*/i, '').trim() }
function gradeBoundaryText(grade) {
 const g = Number(String(grade || '').match(/\d+/)?.[0] || 0)
 if (g === 5) return 'RANH GIỚI LỚP 5: Không dùng thuật ngữ lớp 6 như BCNN, bội chung nhỏ nhất, mẫu số chung nhỏ nhất, số nguyên tố cùng nhau. Khi quy đồng chỉ nói tìm mẫu số chung hoặc chọn mẫu số chung phù hợp. Không dùng phép chia phân số hoặc phân số đảo ngược; chỉ dùng cộng, trừ, nhân phân số, so sánh, rút gọn, tìm phân số của một số và bài toán lời văn vừa sức.'
 return `RANH GIỚI ${grade}: không dùng thuật ngữ/phương pháp vượt chương trình ${grade}.`
}

export async function generateQuizQuestion(o, model = process.env.HERMES_EXAMINER_MODEL || 'gc/gemini-2.5-flash') {
 const { grade, subject, topic, globalContext = '', quiz = {}, question = {}, reference = '' } = o
 const boundary = gradeBoundaryText(grade)
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
${boundary}
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
Nếu là Toán Lớp 5: tuyệt đối không dùng phép chia phân số, phân số đảo ngược, BCNN, bội chung nhỏ nhất, mẫu số chung nhỏ nhất. Nếu khung gợi ý vượt lớp, hãy thay bằng dạng cùng mục tiêu nhưng chỉ dùng cộng/trừ/nhân phân số hoặc mẫu số chung.
Nếu là Khoa học Lớp 5: dùng ngôn ngữ quan sát đời sống, không dùng thuật ngữ vượt mức như điện trở/hiệu điện thế/công suất. Ví dụ khí phải rõ, tránh "hơi nước" mơ hồ; dùng "không khí trong bóng bay" hoặc nêu "hơi nước không nhìn thấy".
Nếu câu yêu cầu điền bảng/phân loại/danh sách, đề bài phải tự chứa đầy đủ bảng hoặc danh sách đối tượng; không được chỉ nhắc "bảng dưới đây" nếu không xuất bảng. Với bay hơi/sôi: nói nước nhận nhiệt, nóng lên; nước có thể bay hơi ở mặt thoáng ở nhiều nhiệt độ; khi sôi thì hóa hơi mạnh trong toàn bộ khối nước. Không nói "hơi nước nhẹ hơn không khí nên bay lên cao".
Với đốt/cháy ở Khoa học Lớp 5: hỏi theo quan sát an toàn, đáp án chấp nhận phải rõ (ví dụ tro và khói/khí); tránh bắt học sinh nêu khí không nhìn thấy nếu đề không cung cấp dữ kiện. Biểu điểm phải nêu các đáp án chấp nhận được.
Tránh dạng điền đáp án tạo câu sai ngữ pháp sau khi điền. Nếu đáp án là cụm có chữ "năng lượng", câu hỏi không được có thêm chữ "năng lượng" ngay sau chỗ trống.
Nếu là Tiếng Việt Lớp 5: tránh dùng ví dụ gây tranh cãi về từ ghép/từ láy/từ nhiều nghĩa; nếu câu hỏi về từ loại/nghĩa từ, chỉ dùng ví dụ rất rõ, tự nhiên, không gượng ép. Không dùng đáp án phụ thuộc phân tích học thuật mơ hồ.
Nếu là Tiếng Anh Lớp 5: không dùng loại câu "Nối", "Sắp xếp từ", "Tìm và sửa lỗi" theo kiểu đáp án A/B/C/D trừ khi đề hiển thị đầy đủ các phương án hoặc danh sách từ. Với điền từ, đáp án phải là chính chuỗi cần điền; với sửa lỗi, đề phải chứa câu sai và học sinh viết lại câu đúng trực tiếp.
Nếu là Lịch sử và Địa lý Lớp 5: nếu không có bản đồ/hình thật thì không được viết "quan sát bản đồ/hình bên dưới". Đổi sang câu chữ mô tả đủ dữ kiện. Tránh nêu số liệu hoặc phân loại dễ lệch SGK nếu không thật sự cần.
Trả về: question, options, answer, hints, solution, visual.
BẮT BUỘC: đúng 3 gợi ý (hints) theo hướng dẫn từng bước. Mỗi hint tự nhiên như "Gợi ý 1: ...", "Gợi ý 2: ...", "Gợi ý 3: ..." (không viết đáp án trong gợi ý). Tự luận phải có lời giải chi tiết và điểm từng ý.
Định dạng theo loại câu:
- Trắc nghiệm: options phải có đúng 4 phương án A/B/C/D; answer là chữ cái đúng hoặc nội dung đúng.
- Điền đáp án: options phải là []; answer chỉ là giá trị/cụm từ cần điền, không có tiền tố A/B/C/D.
- Tự luận: options phải là []; answer là đáp số/kết luận ngắn, không có tiền tố A/B/C/D; solution trình bày chi tiết.
Với trắc nghiệm: 4 phương án A/B/C/D phải đều có vẻ hợp lý; ít nhất 2 phương án sai phải là lỗi học sinh thường mắc.
Trắc nghiệm phải có đúng 1 đáp án đúng tuyệt đối; phương án nhiễu không được đúng một phần hoặc mơ hồ.
Không đưa dữ kiện thừa nếu không dùng trong câu hỏi/lời giải. Không để lộ ký tự "\\n" trong nội dung.
visual phải là mô tả hình toán học cụ thể để tìm đúng ảnh nguồn hoặc tự vẽ: nêu đối tượng, nhãn điểm, quan hệ hình học; không mô tả ảnh người/ảnh trang trí.

JSON: {"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"...","hints":["...","...","..."],"solution":"...","visual":"..."}`
 const res = await chatJSON({ model, system, user, temperature: 0.45 })
 let hints = Array.isArray(res?.hints) ? res.hints.filter(Boolean) : []
 if (hints.length > 3) hints = hints.slice(0, 3)
 const isMc = String(question.type || '').toLowerCase().includes('trắc')
 const isFill = String(question.type || '').toLowerCase().includes('điền')
 const isMatch = String(question.type || '').toLowerCase().includes('nối')
 const isOrdering = String(question.type || '').toLowerCase().includes('sắp xếp')
 const isFixing = String(question.type || '').toLowerCase().includes('sửa lỗi')
 const options = isMc ? (Array.isArray(res?.options) ? res.options.slice(0, 4).map(String) : []) : []
 const solution = Array.isArray(res?.solution) ? res.solution.join('\n') : String(res?.solution || '')
 const answer = (isMc || isMatch || isOrdering || isFixing) ? String(res?.answer || '') : stripChoicePrefix(res?.answer || '')
  return {
   question: res?.question || '',
  options,
   answer,
  hints: hints.map((h, i) => `Gợi ý ${i + 1}: ${String(h).replace(/^Gợi ý\s*\d+\s*[:.\-]?\s*/i, '').trim()}`),
  solution,
  visual: String(res?.visual || question.visual || ''),
  // ponytail: lightweight frame check. add full semantic validator when wrong type slips through often.
  frameOk: isMc ? options.length === 4 : isFill ? options.length === 0 : true,
 }
}
