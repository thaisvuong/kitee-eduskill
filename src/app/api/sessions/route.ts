import { NextResponse } from 'next/server'
import { readStore, writeStore, genId } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Session = {
 id: string; title: string; module: string
 messages: any[]; createdAt: number; updatedAt: number
}

type QueueJob = {
 id: string
 role: 'run' | 'agent'
 module: string
 status: 'running' | 'done' | 'error'
 startedAt: number
 command?: string
 task?: string
 agent?: string
 outputDir?: string
 created?: string[]
 drive?: any[]
 logs?: string[]
 steps?: any[]
 sessionId: string
 sessionTitle: string
}

const MAX_MESSAGES = 400
const CONTEXT_LIMIT = 20000

function contextChars(messages: any[]) {
 const text = (messages || []).map((m: any) => {
  if (m?.role === 'user') return `U:${m.text || ''}`
  if (m?.role === 'bot') return `B:${m.text || ''}`
  if (m?.role === 'agent') return `A:${m.task || ''}\n${m.finalText || ''}`
  if (m?.role === 'upload') return `F:${m.name || ''} ${m.filePath || ''}`
  return ''
 }).filter(Boolean).join('\n')
 return text.length
}

function queueJobs(session: Session): QueueJob[] {
 return (session.messages || [])
  .filter((m: any) => m?.role === 'run' || m?.role === 'agent')
  .map((m: any) => ({
   id: String(m.id || ''),
   role: m.role,
   module: String(m.module || session.module || 'topic'),
   status: m.status || 'error',
   startedAt: Number(m.startedAt || session.updatedAt || Date.now()),
   command: m.command,
   task: m.task,
   agent: m.agent,
   outputDir: m.outputDir,
   created: Array.isArray(m.created) ? m.created : [],
   drive: Array.isArray(m.drive) ? m.drive : [],
   logs: Array.isArray(m.logs) ? m.logs.slice(-120) : [],
   steps: Array.isArray(m.steps) ? m.steps.slice(-120) : [],
   sessionId: session.id,
   sessionTitle: session.title,
  }))
}

export async function GET(req: Request) {
 const url = new URL(req.url)
 const id = url.searchParams.get('id')
 const module = url.searchParams.get('module') || ''
 const includeJobs = url.searchParams.get('includeJobs') === '1'
 const data = await readStore<{ items: Session[] }>('sessions', { items: [] })
 if (id) {
  const s = data.items.find(x => x.id === id)
  return NextResponse.json({ ok: !!s, session: s || null })
 }
 const filtered = module ? data.items.filter(x => x.module === module) : data.items
 const list = filtered
  .slice()
  .sort((a, b) => b.updatedAt - a.updatedAt)
  .map(s => {
   const chars = contextChars(s.messages)
   return {
    id: s.id,
    title: s.title,
    module: s.module,
    count: s.messages.length,
    updatedAt: s.updatedAt,
    contextChars: chars,
    contextLimit: CONTEXT_LIMIT,
    contextPct: Math.min(100, Math.round((chars / CONTEXT_LIMIT) * 100)),
   }
  })
 if (!includeJobs) return NextResponse.json({ ok: true, items: list })
 const jobs = filtered
  .flatMap(queueJobs)
  .sort((a, b) => b.startedAt - a.startedAt)
 return NextResponse.json({ ok: true, items: list, jobs })
}

export async function POST(req: Request) {
 const body = await req.json().catch(() => ({}))
 const data = await readStore<{ items: Session[] }>('sessions', { items: [] })
 const now = Date.now()
 if (body.action === 'remove_job') {
  const sessionId = String(body.sessionId || '')
  const jobId = String(body.jobId || '')
  const s = data.items.find(x => x.id === sessionId)
  if (!s) return NextResponse.json({ ok: false, error: 'session not found' }, { status: 404 })
  s.messages = (s.messages || []).filter((m: any) => String(m?.id || '') !== jobId)
  s.updatedAt = now
  await writeStore('sessions', data)
  return NextResponse.json({ ok: true })
 }
 if (body.action === 'clear_jobs') {
  const module = String(body.module || '')
  for (const s of data.items) {
   if (module && s.module !== module) continue
   s.messages = (s.messages || []).filter((m: any) => !((m?.role === 'run' || m?.role === 'agent') && m?.status !== 'running'))
   s.updatedAt = now
  }
  await writeStore('sessions', data)
  return NextResponse.json({ ok: true })
 }
 if (body.id) {
  const idx = data.items.findIndex(x => x.id === body.id)
  if (idx >= 0) {
   const s = data.items[idx]
   if (typeof body.title === 'string') s.title = body.title.slice(0, 120)
   if (typeof body.module === 'string') s.module = body.module
   if (Array.isArray(body.messages)) s.messages = body.messages.slice(-MAX_MESSAGES)
   s.updatedAt = now
   await writeStore('sessions', data)
   return NextResponse.json({ ok: true, session: s })
  }
  return NextResponse.json({ ok: false, error: 'session not found' }, { status: 200 })
 }
 const session: Session = {
  id: genId('ses'),
  title: String(body.title || 'Phiên mới').slice(0, 120),
  module: String(body.module || 'topic'),
  messages: Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [],
  createdAt: now, updatedAt: now,
 }
 data.items.unshift(session)
 await writeStore('sessions', data)
 return NextResponse.json({ ok: true, session })
}

export async function DELETE(req: Request) {
 const id = new URL(req.url).searchParams.get('id') || ''
 const data = await readStore<{ items: Session[] }>('sessions', { items: [] })
 data.items = data.items.filter(x => x.id !== id)
 await writeStore('sessions', data)
 return NextResponse.json({ ok: true })
}
