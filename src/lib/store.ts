import { promises as fs } from 'node:fs'
import path from 'node:path'
import { kientreConfig } from '@/lib/config/kientre'

// Tiny JSON store: one file under HERMES_HOME per collection. No DB.
// ponytail: single-file JSON, no locking. add SQLite when concurrent writers appear.
export function storePath(name: string) {
 return path.join(kientreConfig.hermesHome, `kientre-${name}.json`)
}

export async function readStore<T = any>(name: string, fallback: T): Promise<T> {
 try {
  const raw = await fs.readFile(storePath(name), 'utf8')
  return JSON.parse(raw) as T
 } catch {
  return fallback
 }
}

export async function writeStore(name: string, data: any): Promise<void> {
 const p = storePath(name)
 await fs.mkdir(path.dirname(p), { recursive: true })
 await fs.writeFile(p, JSON.stringify(data, null, 2), 'utf8')
}

export function genId(prefix: string) {
 return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
