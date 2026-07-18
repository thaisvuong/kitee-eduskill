// Registry lệnh slash Kientre — dùng chung cho autocomplete (client) và validate (server).
export interface SlashCommand {
 name: string    // '/es-create'
 aliases: string[]  // lệnh tương đương
 mode: 'topic' | 'test' | 'solve' | 'review'
 label: string    // mô tả ngắn hiện trong dropdown
 usage: string    // cú pháp
 example: string
 needsFile?: boolean // solve/review cần đường dẫn file
}

export const SLASH_COMMANDS: SlashCommand[] = [
 {
  name: '/es-create', aliases: ['/topic', '/es-topic', '/es-compose', '/chuyende', '/soan'],
  mode: 'topic', label: 'Soạn chuyên đề đầy đủ (lý thuyết + ví dụ + bài tập + đáp án)',
  usage: '/es-create <chủ đề> [lớp N] [môn] [--summary] [--special "…"]',
  example: '/es-create Phân số lớp 5 toán',
 },
 {
  name: '/es-test', aliases: ['/test', '/es-exam', '/es-de', '/de', '/kiemtra'],
  mode: 'test', label: 'Soạn đề kiểm tra (trắc nghiệm + điền + tự luận) kèm biểu điểm',
  usage: '/es-test [chủ đề] [lớp N] [môn] [mc=10] [fill=5] [essay=3] [diem=6]',
  example: '/es-test phân số lớp 5 toán mc=12 fill=4 essay=3',
 },
 {
  name: '/es-solve', aliases: ['/solve', '/es-giai', '/giai'],
  mode: 'solve', label: 'Giải chi tiết mọi câu trong tài liệu', needsFile: true,
  usage: '/es-solve <đường dẫn tài liệu> [lớp N] [môn]',
  example: '/es-solve ~/Desktop/de.docx lớp 4 toán',
 },
 {
  name: '/es-review', aliases: ['/review', '/es-nhanxet', '/nhanxet'],
  mode: 'review', label: 'Nhận xét / thẩm định tài liệu (điểm mạnh, lỗi, cải thiện)', needsFile: true,
  usage: '/es-review <đường dẫn tài liệu> [lớp N] [môn]',
  example: '/es-review ~/Desktop/bai.docx lớp 4 toán',
 },
 {
  name: '/help', aliases: ['/es', '/es-help', '/?'],
  mode: 'topic', label: 'Xem hướng dẫn các lệnh',
  usage: '/help', example: '/help',
 },
]

// map mọi tên/alias -> command (để tra nhanh khi validate)
const BY_NAME = new Map<string, SlashCommand>()
for (const c of SLASH_COMMANDS) {
 BY_NAME.set(c.name, c)
 for (const a of c.aliases) BY_NAME.set(a, c)
}

export function findCommand(token: string): SlashCommand | undefined {
 return BY_NAME.get(token.toLowerCase())
}

/** Gợi ý cho autocomplete: lọc theo tiền tố đang gõ (vd "/es"). */
export function suggestCommands(prefix: string): SlashCommand[] {
 const p = prefix.toLowerCase()
 if (!p.startsWith('/')) return []
 const seen = new Set<string>()
 const out: SlashCommand[] = []
 for (const c of SLASH_COMMANDS) {
  const hit = c.name.startsWith(p) || c.aliases.some(a => a.startsWith(p))
  if (hit && !seen.has(c.name)) { seen.add(c.name); out.push(c) }
 }
 return out
}
