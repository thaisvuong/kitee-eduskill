import { chatJSON } from './llm.mjs'

/** 1. Tóm tắt và xác định ranh giới kiến thức */
export async function generateBrief(topic, grade, subject, model) {
  const prompt = `Tôi muốn soạn tài liệu môn ${subject} cho ${grade} về chủ đề "${topic}". 
  Hãy tóm tắt:
  1. Các chủ điểm chính cần dạy.
  2. Những nội dung tuyệt đối KHÔNG ĐƯỢC có (vượt cấp/vượt lớp).
  Trả về định dạng JSON: {"points": string[], "boundaries": string[]}`
  return chatJSON({ model, system: "Bạn là chuyên gia thẩm định chương trình giáo dục.", user: prompt })
}

/** Phân rã nội dung thành các BLOCK có cấu trúc (Atomic drafting).
 *
 * Trả về mảng "blocks" thay vì một chuỗi markdown lớn. Nhờ đó:
 *  - Văn giải thích/dẫn dắt -> block "paragraph" (đổ thành đoạn văn thường, KHÔNG box).
 *  - CHỈ nội dung cốt lõi mới vào box: "keypoint" (ghi nhớ/định nghĩa), "example", "exercise".
 *  - Hình vẽ là block "figure" (pie/tikz/photo) -> Artist/Compiler xử lý riêng.
 */
export async function draftAtomicPart(type, topic, context, model, opts = {}) {
  const system = "Bạn là giáo viên biên soạn tài liệu giáo dục. Bạn LUÔN trả về JSON hợp lệ, không kèm giải thích ngoài JSON."
  const depthRule = opts.depth === 'summary'
    ? `CHẾ ĐỘ TÓM TẮT (RẤT NGẮN): CHỈ nêu định nghĩa/công thức cốt lõi bằng 1-2 block "keypoint" NGẮN. KHÔNG viết "paragraph" phân tích (tối đa 1 câu dẫn). Toàn bộ lý thuyết gói trong vài dòng. Ưu tiên dành chỗ cho VÍ DỤ.`
    : `CHẾ ĐỘ CHI TIẾT: phân tích lý thuyết đầy đủ, giải thích cặn kẽ, nhiều đoạn văn dẫn dắt.`
  const special = opts.special
    ? `\nYÊU CẦU ĐẶC BIỆT (BẮT BUỘC tuân theo tuyệt đối): ${opts.special}\n`
    : ''
  const refs = opts.refs
    ? `\nNGUỒN THAM KHẢO (bám sát nội dung này khi soạn ví dụ, đúng chương trình):\n"""${String(opts.refs).slice(0, 3500)}"""\n`
    : ''
  const prompt = `Bối cảnh (mục tiêu, ranh giới, chủ đề): ${JSON.stringify(context)}.
Chủ đề tài liệu: "${topic}". Hãy soạn nội dung cho phần: "${type}".
${depthRule}${special}${refs}
Phân rã nội dung thành các BLOCK. Quy tắc phân loại RẤT QUAN TRỌNG:
- "paragraph": văn giải thích, dẫn dắt, mô tả (PHẦN LỚN nội dung nằm ở đây — mỗi ý một block, KHÔNG dồn dài).
- "list": khi liệt kê nhiều mục ngang hàng -> đặt vào "items" (mảng chuỗi).
- "keypoint": CHỈ dùng cho định nghĩa/công thức/điều cần ghi nhớ cốt lõi, NGẮN GỌN (1-3 câu).
- "example": ví dụ mẫu PHẢI có lời giải NGAY ("problem" + "solution" trình bày đầy đủ các bước).
- "figure": khi cần hình minh họa. "kind" = "pie" (biểu đồ tròn, kèm "chart"), "tikz" (sơ đồ hình học vẽ bằng LaTeX), hoặc "photo" (ảnh thực tế). Luôn kèm "desc"; NẾU là "photo" thì kèm THÊM "query" = từ khóa TÌM ẢNH bằng TIẾNG ANH, CỤ THỂ đúng đối tượng thực tế (danh từ cụ thể, tránh chung chung), vd "cardboard box package", "water boiling steam pot", "honeycomb hexagon". Chỉ dùng "photo" cho vật thể/cảnh THỰC; hình học/sơ đồ phải dùng "tikz".

QUAN TRỌNG: phần này CHỈ soạn LÝ THUYẾT + VÍ DỤ minh họa (có đáp án ngay). KHÔNG tạo block "exercise" — bài tập luyện tập được soạn ở khâu riêng.

CÔNG THỨC TOÁN: viết MỌI biểu thức/phép tính/công thức bằng LaTeX đặt giữa hai dấu $...$ để render bằng chế độ Công thức của Word.
Ví dụ: phân số $\\dfrac{24}{40}$, công thức $S_{xq} = (a+b) \\times 2 \\times h$, phép tính $24 : 40 = 0{,}6 = 60\\%$, thể tích $V = a \\times b \\times c$. Dùng dấu phẩy thập phân kiểu Việt Nam ($0{,}6$). KHÔNG viết công thức dưới dạng chữ thường ngoài $...$.

TUYỆT ĐỐI KHÔNG nhồi cả phần lý thuyết dài vào một block. Không dùng ký tự Markdown (**, ##) bên trong giá trị chuỗi.

Trả về JSON đúng cấu trúc:
{
  "blocks": [
    {"type":"paragraph","text":"..."},
    {"type":"list","items":["...","..."]},
    {"type":"keypoint","title":"Ghi nhớ","text":"..."},
    {"type":"example","title":"Ví dụ 1","problem":"...","solution":"..."},
    {"type":"figure","kind":"photo","desc":"...","query":"english search keywords"},
    {"type":"figure","kind":"pie","desc":"...","chart":{"data":[40,35,25],"labels":["A","B","C"],"title":"..."}}
  ]
}`
  const res = await chatJSON({ model, system, user: prompt })
  // Chuẩn hoá: chấp nhận cả khi model lỡ trả về {content:...} kiểu cũ.
  if (Array.isArray(res?.blocks)) return { blocks: res.blocks }
  if (Array.isArray(res)) return { blocks: res }
  if (typeof res?.content === 'string') return { blocks: [{ type: 'paragraph', text: res.content }] }
  return { blocks: [] }
}

/** Soạn một GÓI BÀI TẬP (vận dụng / về nhà) — mỗi bài kèm LỜI GIẢI CHI TIẾT.
 *
 * kind: "vận dụng" hoặc "về nhà". count: số bài tối thiểu.
 * Trả về { exercises: [{ title, question, solution, lines }] }.
 */
export async function draftExercisePack(topic, context, kind, count, model, opts = {}) {
  const system = "Bạn là giáo viên ra đề. Bạn LUÔN trả về JSON hợp lệ, không kèm giải thích ngoài JSON."
  const special = opts.special ? `\nYÊU CẦU ĐẶC BIỆT (BẮT BUỘC tuân theo): ${opts.special}\n` : ''
  const sourceRule = opts.reference
    ? `\nƯU TIÊN NGUỒN THẬT: Hãy CHỌN LỌC và biên tập lại các BÀI TẬP có trong NGUỒN THAM KHẢO dưới đây (bài sưu tầm từ đề/tài liệu thật) cho phần lớn số bài; chỉ TỰ SOẠN THÊM 1-2 bài nếu còn thiếu. Giữ đúng trình độ lớp.
NGUỒN THAM KHẢO:
"""${String(opts.reference).slice(0, 4500)}"""\n`
    : ''
  const prompt = `Bối cảnh (mục tiêu, ranh giới): ${JSON.stringify(context)}.
Chủ đề: "${topic}". Hãy soạn ÍT NHẤT ${count} bài tập dạng "${kind}".
${special}${sourceRule}
Yêu cầu:
- Mỗi bài là một object trong "exercises", đánh số "title" là "Bài 1", "Bài 2", ...
- "question": đề bài rõ ràng, phù hợp trình độ, tăng dần độ khó. Bài "về nhà" nên có 1-2 bài vận dụng thực tế.
- "solution": LỜI GIẢI CHI TIẾT từng bước (không chỉ đáp số), để in ở phần đáp án cuối tài liệu.
- "lines": số dòng kẻ trống cho học sinh làm bài (3-6 tùy độ dài).
- Công thức/phép tính viết bằng LaTeX trong dấu $...$ (vd $P = (a+b) \\times 2$, $0{,}5$). Dùng dấu phẩy thập phân kiểu Việt Nam.
- Không dùng ký tự Markdown (**, ##). Không vượt ranh giới lớp học.

Trả về JSON: {"exercises":[{"title":"Bài 1","question":"...","solution":"...","lines":3}]}`
  const res = await chatJSON({ model, system, user: prompt })
  const list = Array.isArray(res?.exercises) ? res.exercises : (Array.isArray(res) ? res : [])
  return { exercises: list.filter(e => e && (e.question || e.problem)) }
}

/** Gộp text của các block để đưa cho Judge kiểm định. */
export function blocksToText(blocks) {
  return (blocks || []).map(b => {
    if (b.type === 'list') return (b.items || []).join('\n')
    if (b.type === 'example') return `${b.problem || ''}\n${b.solution || ''}`
    if (b.type === 'exercise') return b.question || ''
    if (b.type === 'figure') return b.desc || ''
    return b.text || b.content || ''
  }).join('\n')
}

/** 3. Chuyên gia kiểm tra và yêu cầu sửa */
export async function expertReview(content, grade, boundaries, model) {
  const prompt = `Kiểm tra nội dung sau cho ${grade}:
  Nội dung: ${content}
  Ranh giới không được vượt: ${boundaries.join(', ')}
  
  Trả về JSON: {"status": "PASS" | "FAIL", "reason": string, "suggestion": string}`
  return chatJSON({ model, system: "Bạn là chuyên gia kiểm tra chất lượng tài liệu, rất khắt khe.", user: prompt })
}
