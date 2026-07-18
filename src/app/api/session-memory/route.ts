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

export async function GET(req: Request) {
 const id = new URL(req.url).searchParams.get('id') || ''
 const data = await readStore<{ items: SessionMemory[] }>('session-memory', { items: [] })
 if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 })
 const item = data.items.find(x => x.id === id) || null
 return NextResponse.json({ ok: true, item })
}
