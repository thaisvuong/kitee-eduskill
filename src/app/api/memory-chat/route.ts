import { NextResponse } from 'next/server'
import { readStore } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SessionMemory = {
 id: string
 module: string
 summary: string
 updatedAt: number
 turns: number
 lastUserText: string
 lastAssistantText: string
 difficultySignals: string[]
}

export async function POST(req: Request) {
 const { message = '', sessionId = '', moduleKey = '', runningJobs = [] } = await req.json().catch(() => ({}))
 const data = await readStore<{ items: SessionMemory[] }>('session-memory', { items: [] })
 const mem = data.items.find(x => x.id === sessionId) || null
 const jobs = Array.isArray(runningJobs) ? runningJobs : []
 const t = String(message || '').toLowerCase()
 if (/đang làm|dang lam|task|việc gì|viec gi|đang thực hiện|dang thuc hien|tiến độ|tien do|trạng thái|trang thai/.test(t)) {
  const active = jobs.filter((j: any) => j?.status !== 'done' && j?.status !== 'error')
  if (active.length) {
   const lines = active.map((j: any) => `- ${j.task || j.command || j.id}`).join('\n')
   return NextResponse.json({ ok: true, reply: `Anh đang có ${active.length} task đang chạy:\n${lines}` })
  }
  if (mem?.lastUserText) return NextResponse.json({ ok: true, reply: `Hiện không thấy task nào đang chạy. Gần nhất trong phiên này anh đang làm: ${mem.lastUserText}.` })
  return NextResponse.json({ ok: true, reply: 'Hiện không thấy task nào đang chạy trong phiên này.' })
 }
 if (/nhớ|nho|lúc nãy|luc nay|trước đó|truoc do/.test(t)) {
  if (!mem?.summary) return NextResponse.json({ ok: true, reply: 'Phiên này chưa có gì đáng nhớ. Anh gửi yêu cầu đầu tiên, em sẽ bám theo từ đó.' })
  return NextResponse.json({ ok: true, reply: `Em nhớ phiên này: ${mem.summary.slice(-900)}` })
 }
 if (/tiếp tục|tiep tuc/.test(t) && mem?.lastUserText) {
  return NextResponse.json({ ok: true, reply: `Mình tiếp tục từ việc: ${mem.lastUserText}. Anh muốn em chạy tiếp, chỉnh nội dung, hay tạo file Word từ phần này?` })
 }
 return NextResponse.json({ ok: true, reply: mem?.summary ? `Em đang bám theo phiên ${moduleKey}: ${mem.summary.slice(-700)}` : 'Em đang nghe. Anh muốn tiếp tục phần nào?' })
}
