import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { kiteeConfig } from '@/lib/config/kitee'

// ponytail: config persisted to a single JSON file, no DB. add DB when multi-user.
const SETTINGS_PATH = path.join(kiteeConfig.hermesHome, 'kitee-webapp-settings.json')

const DEFAULTS = {
  outputDir: kiteeConfig.outputDir,
  workspaceDir: kiteeConfig.workspaceDir,
  eduSkillDir: kiteeConfig.eduSkillDir,
  driveParentId: kiteeConfig.driveParentId,
  driveFolderUrl: 'https://drive.google.com/drive/folders/' + kiteeConfig.driveParentId,
  routerBaseUrl: kiteeConfig.routerBaseUrl,
  defaultWorkerModel: kiteeConfig.defaultWorkerModel,
  useSummary: kiteeConfig.defaultSummary,
  uploadDrive: false,
  fallbackModels: kiteeConfig.fallbackModels,
  modelRetries: kiteeConfig.modelRetries,
  retryDelayMs: kiteeConfig.retryDelayMs,
}

async function readSettings() {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, 'utf8')
    return { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULTS }
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, settings: await readSettings(), path: SETTINGS_PATH })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const current = await readSettings()
  // whitelist keys only
  const next: Record<string, unknown> = { ...current }
  for (const k of Object.keys(DEFAULTS)) {
    if (k in body) next[k] = body[k]
  }
  await fs.mkdir(path.dirname(SETTINGS_PATH), { recursive: true })
  await fs.writeFile(SETTINGS_PATH, JSON.stringify(next, null, 2), 'utf8')
  return NextResponse.json({ ok: true, settings: next })
}
