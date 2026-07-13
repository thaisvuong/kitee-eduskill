import { chatJSON } from '../server/llm.mjs'

export async function runArchitect(topic, grade, subject) {
  const system = "Bạn là Kiến trúc sư Nội dung Giáo dục. Bạn xác định ranh giới kiến thức."
  const prompt = `Chủ đề: ${topic}, Lớp: ${grade}, Môn: ${subject}.
  Xác định:
  1. Mục tiêu (objectives)
  2. Ranh giới tuyệt đối không vượt (boundaries)
  3. Danh sách tên phần (chunks) cho phần DẠY HỌC: chỉ gồm LÝ THUYẾT/KHÁI NIỆM và VÍ DỤ minh họa.
     TUYỆT ĐỐI KHÔNG đưa phần "bài tập"/"luyện tập"/"về nhà" vào chunks — phần bài tập được soạn ở khâu chuẩn hóa riêng.
     Ví dụ hợp lệ: ["Khái niệm và đặc điểm", "Công thức chu vi", "Ví dụ tính chu vi", "Công thức diện tích", "Ví dụ tính diện tích"]
  Trả về JSON theo cấu trúc: {"objectives": [], "boundaries": [], "chunks": []}`
  const model = process.env.HERMES_ARCHITECT_MODEL || 'gc/gemini-2.5-flash'
  return chatJSON({ model, system, user: prompt })
}
