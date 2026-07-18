export function quickChatReply(message: string, settings: Record<string, any> = {}) {
 const text = message.trim()
 const subject = String(settings.subject || 'môn học').toLowerCase()
 const grade = String(settings.grade || '5')
 const low = text.toLowerCase()
 if (/chủ điểm|chu diem|chủ đề|chu de|con người và sức khỏe|con nguoi va suc khoe/.test(low)) {
  const topic = text.replace(/^chủ\s*(điểm|đề)\s*:\s*/i, '').trim()
  if (/con người và sức khỏe|con nguoi va suc khoe/i.test(topic)) {
   return `Hiểu rồi anh: chủ điểm "Con người và sức khỏe" cho ${subject} lớp ${grade}.\n\nCó thể triển khai nhanh thành các nhánh:\n• Cơ thể người và sức khỏe cá nhân\n• Dinh dưỡng, vệ sinh, phòng bệnh\n• Tuổi dậy thì, chăm sóc bản thân\n• An toàn trong đời sống\n• Thói quen sống lành mạnh\n\nNếu muốn tạo tài liệu, anh nhập rõ: "Soạn quiz chủ điểm Con người và sức khỏe...".`
  }
  return `Hiểu rồi anh: chủ điểm "${topic || text}" cho ${subject} lớp ${grade}.\n\nAnh có thể hỏi nhanh để em gợi ý ý chính, hoặc nhập "Soạn quiz..." nếu muốn chạy flow tạo tài liệu.`
 }
 return ''
}
