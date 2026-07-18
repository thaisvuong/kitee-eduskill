import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { kientreConfig } from '@/lib/config/kientre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Well-known models per direct provider, shown when the user has a key configured.
// The `<provider>/…` prefix tells the engine to bypass 9router (see server/llm.mjs).
const DIRECT_MODELS: Record<string, string[]> = {
 gemini: [
  'gemini/gemini-2.5-flash',
  'gemini/gemini-2.5-pro',
  'gemini/gemini-2.0-flash',
 ],
 deepseek: [
  'deepseek/deepseek-chat',
  'deepseek/deepseek-reasoner',
 ],
 glm: [
  'glm/glm-4.6',
  'glm/glm-4.5',
  'glm/glm-4-flash',
 ],
 openrouter: [
  'openrouter/openrouter/auto',
  'openrouter/google/gemini-2.5-flash',
  'openrouter/deepseek/deepseek-chat',
 ],
}

async function configuredProviders(): Promise<string[]> {
 const settingsPath = path.join(kientreConfig.hermesHome, 'kientre-webapp-settings.json')
 try {
  const raw = await fs.readFile(settingsPath, 'utf8')
  const keys = (JSON.parse(raw)?.apiKeys || {}) as Record<string, string>
  return Object.keys(DIRECT_MODELS).filter(p => String(keys[p] || '').trim())
 } catch {
  return []
 }
}

// Lists available models: 9router (OpenAI-compatible /v1/models) + any direct
// provider the user has an API key for. Used to populate the model selector.
export async function GET(req: Request) {
 const url = new URL(req.url)
 const base = (url.searchParams.get('router') || kientreConfig.routerBaseUrl).replace(/\/$/, '')
 const endpoint = base.endsWith('/v1') ? base + '/models' : base + '/v1/models'

 const direct = (await configuredProviders()).flatMap(p => DIRECT_MODELS[p])

 let routerModels: string[] = []
 let routerError: string | undefined
 try {
  const r = await fetch(endpoint, { cache: 'no-store', signal: AbortSignal.timeout(6000) })
  if (r.ok) {
   const data = await r.json()
   routerModels = (data?.data || data?.models || [])
    .map((m: any) => (typeof m === 'string' ? m : m.id || m.name))
    .filter(Boolean)
  } else {
   routerError = `router ${r.status}`
  }
 } catch (e: any) {
  routerError = e?.message || 'fetch failed'
 }

 const models = Array.from(new Set([...direct, ...routerModels])).sort()
 // ok stays true as long as we have *something* to show (direct keys count).
 return NextResponse.json({ ok: models.length > 0, models, direct, router: base, routerError }, { status: 200 })
}
