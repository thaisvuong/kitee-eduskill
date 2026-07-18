import { NextResponse } from 'next/server'
import { readStore, writeStore, genId } from '@/lib/store'
import { withDefaultSkills, type SkillDef as Skill } from '@/lib/defaultSkills'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
 const data = await readStore<{ items: Skill[] }>('skills', { items: [] })
 return NextResponse.json({ ok: true, items: withDefaultSkills(data.items) })
}

export async function POST(req: Request) {
 const body = await req.json().catch(() => ({}))
 const data = await readStore<{ items: Skill[] }>('skills', { items: [] })
 const input = body.item || body
 if (input.id) {
  const idx = data.items.findIndex(x => x.id === input.id)
  if (idx >= 0) data.items[idx] = { ...data.items[idx], ...input }
  else data.items.unshift({
   id: String(input.id),
   name: String(input.name || 'Kỹ năng mới').slice(0, 120),
   description: String(input.description || ''),
   systemPrompt: String(input.systemPrompt || ''),
   guidance: String(input.guidance || ''),
   appliesTo: Array.isArray(input.appliesTo) ? input.appliesTo : [],
   agentFlow: Array.isArray(input.agentFlow) ? input.agentFlow : [],
   enabled: input.enabled !== false,
  })
 } else {
  data.items.unshift({
   id: genId('sk'),
   name: String(input.name || 'Kỹ năng mới').slice(0, 120),
   description: String(input.description || ''),
   systemPrompt: String(input.systemPrompt || ''),
   guidance: String(input.guidance || ''),
   appliesTo: Array.isArray(input.appliesTo) ? input.appliesTo : [],
   agentFlow: Array.isArray(input.agentFlow) ? input.agentFlow : [],
   enabled: input.enabled !== false,
  })
 }
 await writeStore('skills', data)
 return NextResponse.json({ ok: true, items: withDefaultSkills(data.items) })
}

export async function DELETE(req: Request) {
 const id = new URL(req.url).searchParams.get('id') || ''
 const data = await readStore<{ items: Skill[] }>('skills', { items: [] })
 data.items = data.items.filter(x => x.id !== id)
 await writeStore('skills', data)
 return NextResponse.json({ ok: true, items: withDefaultSkills(data.items) })
}
