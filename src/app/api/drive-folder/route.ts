import { NextResponse } from 'next/server'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { kientreConfig } from '@/lib/config/kientre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function pickPython() {
 return process.env.HERMES_PYTHON || 'python3'
}

export async function GET(req: Request) {
 const id = new URL(req.url).searchParams.get('id') || ''
 if (!id) return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 })
 const script = path.join(kientreConfig.hermesHome, 'skills/productivity/google-workspace/scripts/google_api.py')
 const py = pickPython()
 const out = await new Promise<{ ok: boolean; data?: any; error?: string }>(resolve => {
  const ch = spawn(py, [script, 'drive', 'get', id], { env: { ...process.env, HERMES_HOME: kientreConfig.hermesHome } })
  let so = '', se = ''
  ch.stdout.on('data', d => so += d)
  ch.stderr.on('data', d => se += d)
  ch.on('error', e => resolve({ ok: false, error: e.message }))
  ch.on('close', code => {
   if (code !== 0) return resolve({ ok: false, error: se.trim() || `exit ${code}` })
   try { resolve({ ok: true, data: JSON.parse(so) }) } catch { resolve({ ok: false, error: 'parse' }) }
  })
 })
 if (!out.ok) return NextResponse.json({ ok: false, error: out.error || 'drive get failed' }, { status: 400 })
 return NextResponse.json({ ok: true, id, name: out.data?.name || '', webViewLink: out.data?.webViewLink || '' })
}
