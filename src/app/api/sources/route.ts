import { NextResponse } from 'next/server'
import { readStore, writeStore, genId } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Source library: reference documents (text/link/file-extract) the agent uses
// as grounding material. scope: 'global' or a module key (topic/test/solve/review).
type Source = {
 id: string; title: string; kind: 'text' | 'link' | 'file'
 content: string; sourceRef: string; scope: string; enabled: boolean; createdAt: number
}

const MAX_CONTENT = 40000

function stripTags(html: string) {
 return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/\s{2,}/g, ' ').trim()
}

export async function GET() {
 const data = await readStore<{ items: Source[] }>('sources', { items: [] })
 return NextResponse.json({ ok: true, items: data.items })
}

export async function POST(req: Request) {
 const body = await req.json().catch(() => ({}))
 const data = await readStore<{ items: Source[] }>('sources', { items: [] })
 const input = body.item || body
 let content = String(input.content || '')

 // Link → fetch and strip to text.
 if (input.kind === 'link' && input.sourceRef) {
  try {
   const r = await fetch(input.sourceRef, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12000) })
   if (r.ok) content = stripTags(await r.text())
  } catch (e: any) {
   return NextResponse.json({ ok: false, error: 'Không tải được link: ' + (e?.message || '') }, { status: 200 })
  }
 }
 content = content.slice(0, MAX_CONTENT)

 const now = Date.now()
 if (input.id) {
  const idx = data.items.findIndex(x => x.id === input.id)
  if (idx >= 0) {
   data.items[idx] = { ...data.items[idx], ...input, content: content || data.items[idx].content }
  }
 } else {
  const item: Source = {
   id: genId('src'),
   title: String(input.title || 'Nguồn không tên').slice(0, 200),
   kind: (input.kind || 'text') as Source['kind'],
   content,
   sourceRef: String(input.sourceRef || ''),
   scope: String(input.scope || 'global'),
   enabled: input.enabled !== false,
   createdAt: now,
  }
  data.items.unshift(item)
 }
 await writeStore('sources', data)
 return NextResponse.json({ ok: true, items: data.items })
}

export async function DELETE(req: Request) {
 const id = new URL(req.url).searchParams.get('id') || ''
 const data = await readStore<{ items: Source[] }>('sources', { items: [] })
 data.items = data.items.filter(x => x.id !== id)
 await writeStore('sources', data)
 return NextResponse.json({ ok: true, items: data.items })
}
