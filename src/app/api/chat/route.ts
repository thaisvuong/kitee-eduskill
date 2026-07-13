import { NextResponse } from 'next/server'
import { buildCreateCommand, buildTestCommand } from '@/lib/eduskill/commands'

interface ChatBody { message?: string; settings?: Record<string, any> }

// ponytail: intent parsing is keyword-based, not an LLM. add real router when backend wired.
function parseGrade(t: string) { return t.match(/lớp\s*(\d+)/i)?.[1] }
function parseSubject(t: string) { return /tiếng việt|tv\b/i.test(t) ? 'tiếng việt' : 'toán' }
function parseTopic(t: string) {
  return t
    .replace(/^\/?(es-create|tạo chuyên đề|tạo đề( kiểm tra)?|es-test|giải|es-solve|review|es-review)/i, '')
    .replace(/lớp\s*\d+/i, '')
    .replace(/(môn\s*)?(toán|tiếng việt)/i, '')
    .replace(/(mc|tn|fill|điền|essay|tự luận)\s*=?\s*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .trim() || 'chủ đề mẫu'
}
function parseNum(t: string, keys: string[]) {
  for (const k of keys) { const m = t.match(new RegExp(k + '\\s*=?\\s*(\\d+)', 'i')); if (m) return Number(m[1]) }
  return undefined
}

export async function POST(req: Request) {
  const { message = '', settings = {} }: ChatBody = await req.json().catch(() => ({}))
  const t = message.trim()
  const low = t.toLowerCase()
  const summary = settings.useSummary !== false

  let reply = ''
  try {
    if (/es-create|tạo chuyên đề/i.test(low)) {
      const cmd = buildCreateCommand({ topic: parseTopic(t), grade: parseGrade(t), subject: parseSubject(t), summary })
      reply = `Đã dựng lệnh eduSkill:\n\n\`${cmd}\`\n\nKết quả sẽ lưu vào: ${settings.outputDir || 'Kitee/Output'}`
    } else if (/es-test|tạo đề|đề kiểm tra/i.test(low)) {
      const cmd = buildTestCommand({
        topic: parseTopic(t), grade: parseGrade(t), subject: parseSubject(t),
        mc: parseNum(t, ['mc', 'tn']), fill: parseNum(t, ['fill', 'điền']), essay: parseNum(t, ['essay', 'tự luận']),
      })
      reply = `Đã dựng lệnh tạo đề:\n\n\`${cmd}\`\n\n${settings.uploadDrive ? 'Sẽ upload lên Drive Kitee sau khi xong.' : 'Lưu local, chưa upload Drive.'}`
    } else if (/es-solve|giải/i.test(low)) {
      reply = `Chế độ giải tài liệu. Gửi đường dẫn file .docx trong workspace để chạy \`/es-solve\`.\nWorkspace: ${settings.workspaceDir || ''}`
    } else if (/es-review|review/i.test(low)) {
      reply = `Chế độ Review nghiêm khắc. Gửi đường dẫn file hoặc Google Docs URL để chạy \`/es-review\`.`
    } else if (/setting|cài đặt|nơi lưu|nới lưu/i.test(low)) {
      reply = `Mở tab Cài đặt (Settings) để chỉnh nơi lưu, model, router và Drive. Nơi lưu hiện tại: ${settings.outputDir || 'Kitee/Output'}`
    } else {
      reply = `Mình là trợ lý Kitee eduSkill. Bạn có thể:\n• Tạo chuyên đề — "tạo chuyên đề tỉ số phần trăm lớp 5"\n• Tạo đề kiểm tra — "tạo đề phân số lớp 5 mc=10 điền=5 tự luận=3"\n• Giải / Review tài liệu\n\nVào tab Cài đặt để đổi nơi lưu và cấu hình.`
    }
  } catch (e: any) {
    reply = `Lỗi: ${e?.message || 'không rõ'}`
  }
  return NextResponse.json({ ok: true, reply })
}
