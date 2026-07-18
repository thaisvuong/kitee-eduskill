import { chatJSON } from '../server/llm.mjs'

/** Agent HỌC SINH GIỎI: ước lượng thời gian giải từng bài + thời gian đọc lý thuyết.
 *
 * Dùng để canh cho phiếu học tập tại lớp hoàn thành trong khoảng thời gian cho phép.
 * Trả về { readingMinutes, times: [{title, minutes}] }.
 */
export async function estimateSolveTime(exercises, grade, context, model = process.env.HERMES_STUDENT_MODEL || 'gc/gemini-2.5-flash') {
 const list = exercises
  .map((e, i) => `${e.title || 'Bài ' + (i + 1)}: ${e.question || e.problem || ''}`)
  .join('\n')

 const system = "Bạn đóng vai một HỌC SINH GIỎI của lớp. Học sinh giỏi đọc đề là biết cách làm ngay hoặc chỉ suy nghĩ một chút. Bạn ước lượng thời gian THỰC TẾ cần để giải xong (đọc hiểu + suy nghĩ + trình bày bài làm). LUÔN trả JSON hợp lệ."
 const prompt = `Lớp: ${grade}. Bối cảnh bài học: ${JSON.stringify(context).slice(0, 800)}.

1) Ước lượng "readingMinutes": thời gian một học sinh giỏi đọc hiểu phần lý thuyết + ví dụ mẫu của bài học.
2) Với MỖI bài tập dưới đây, ước lượng "minutes" (số phút) để học sinh giỏi giải xong (gồm cả trình bày).

Bài tập:
${list}

Trả về JSON: {"readingMinutes": 15, "times": [{"title":"Bài 1","minutes":3}]}`

 const res = await chatJSON({ model, system, user: prompt })
 const times = Array.isArray(res?.times) ? res.times : []
 const readingMinutes = Number(res?.readingMinutes) || Math.max(10, exercises.length * 2)
 return { readingMinutes, times }
}
