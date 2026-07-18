import { NextResponse } from 'next/server'
import { readStore, writeStore, genId } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Chat sessions: each keeps its own module + message history (context memory).
// Messages are stored as the app's Msg[] shape (opaque here) so the UI owns rendering.
type Session = {
 id: string; title: string; module: string
 messages: any[]; createdAt: number; updatedAt: number
}

const MAX_MESSAGES = 400

export async function GET(req: Request) {
 const id = new URL(req.url).searchParams.get('id')
 const data = await readStore<{ items: Session[] }>('sessions', { items: [] })
 if (id) {
  const s = data.items.find(x => x.id === id)
  return NextResponse.json({ ok: !!s, session: s || null })
 }
 // list without full message bodies (lighter)
 const list = data.items
  .slice()
  .sort((a, b) => b.updatedAt - a.updatedAt)
  .map(s => ({ id: s.id, title: s.title, module: s.module, count: s.messages.length, updatedAt: s.updatedAt }))
 return NextResponse.json({ ok: true, items: list })
}

export async function POST(req: Request) {
 const body = await req.json().catch(() => ({}))
 const data = await readStore<{ items: Session[] }>('sessions', { items: [] })
 const now = Date.now()
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
