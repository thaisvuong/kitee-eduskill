import { chatJSON } from '../server/llm.mjs'

export async function runArchitect(topic, grade, subject) {
 const g = Number(String(grade || '').match(/\d+/)?.[0] || 0)
 const gradeRule = g === 5
  ? 'RANH GIỚI LỚP 5: Không dùng BCNN, bội chung nhỏ nhất, mẫu số chung nhỏ nhất, số nguyên tố cùng nhau, phép chia phân số, phân số đảo ngược, căn bậc hai, số thập phân vô hạn, ký hiệu khoa học. Khi quy đồng chỉ nói tìm mẫu số chung. Hình học: chỉ diện tích/chu vi, chưa có thể tích hình cầu/nón. Khoa học Lớp 5: tránh điện trở, hiệu điện thế, công suất, năng lượng hóa học, phản ứng hạt nhân. Tiếng Việt Lớp 5: tránh từ ghép/từ láy phức tạp dễ tranh cãi.'
  : g === 4
   ? 'RANH GIỚI LỚP 4: Không dùng số thập phân, phân số phức tạp, tỉ số phần trăm, hình thang, tam giác đều, đường kính/bán kính.'
   : `RANH GIỚI ${grade}: không vượt chương trình ${grade}.`
 const system = `Bạn là Kiến trúc sư Nội dung Giáo dục. Bạn xác định ranh giới kiến thức TUYỆT ĐỐI cho giáo viên soạn tài liệu.`
 const prompt = `Chủ đề: "${topic}", Lớp: ${grade}, Môn: ${subject}.
Xác định:
1. Mục tiêu (objectives): 3-5 mục tiêu học tập cụ thể, phù hợp ${grade}.
2. Ranh giới tuyệt đối không vượt (boundaries): NÊU RÕ những khái niệm/thuật ngữ/phương pháp ${grade} CHƯA học và CẤM dùng. ${gradeRule}
3. Danh sách tên phần (chunks) cho phần DẠY HỌC: chỉ gồm LÝ THUYẾT/KHÁI NIỆM và VÍ DỤ minh họa.
  TUYỆT ĐỐI KHÔNG đưa phần "bài tập"/"luyện tập"/"về nhà" vào chunks — phần bài tập được soạn ở khâu chuẩn hóa riêng.
  Ví dụ hợp lệ: ["Khái niệm và đặc điểm", "Công thức chu vi", "Ví dụ tính chu vi", "Công thức diện tích", "Ví dụ tính diện tích"]
Trả về JSON theo cấu trúc: {"objectives": [], "boundaries": [], "chunks": []}`
 const model = process.env.HERMES_ARCHITECT_MODEL || process.env.HERMES_WORKER_MODEL || 'gc/gemini-2.5-flash'
 return chatJSON({ model, system, user: prompt })
}
