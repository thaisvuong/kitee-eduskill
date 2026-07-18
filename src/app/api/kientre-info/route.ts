import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { kientreConfig } from '@/lib/config/kientre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Từ khóa nhận diện skill phục vụ Kientre (giáo dục) — chỉ khớp TÊN skill, không khớp mô tả (tránh dương tính giả).
const EDU_NAME_HINTS = /kientre|edu-skill|kientre|tutor|exam-creation|lesson|worksheet|chuyen-de|de-kiem-tra|vietnamese-tutoring|tutoring-curriculum|(^|[\/_-])es($|[\/_-])/i

async function listDir(dir: string, exts: string[]) {
 try {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  return entries
   .filter(e => e.isFile() && !e.name.startsWith('.') && exts.some(x => e.name.toLowerCase().endsWith(x)))
   .map(e => e.name)
   .sort()
 } catch { return [] }
}

async function readFrontDesc(file: string): Promise<string> {
 try {
  const raw = await fs.readFile(file, 'utf8')
  const m = raw.match(/^description:\s*["']?(.+?)["']?\s*$/im)
  return m ? m[1] : ''
 } catch { return '' }
}

// Liệt kê skill có SKILL.md; CHỈ giữ skill phục vụ Kientre (education).
async function listKientreSkills(hermesHome: string) {
 const skillsRoot = path.join(hermesHome, 'skills')
 const out: { name: string; path: string; description: string; category: string }[] = []
 async function walk(dir: string, depth: number) {
  if (depth > 4) return
  let entries: any[] = []
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
   if (e.name.startsWith('.')) continue
   const full = path.join(dir, e.name)
   if (e.isDirectory()) { await walk(full, depth + 1) }
   else if (e.name === 'SKILL.md') {
    const rel = path.relative(skillsRoot, path.dirname(full))
    const name = rel || path.basename(path.dirname(full))
    const description = await readFrontDesc(full)
    const category = rel.split(path.sep)[0] || ''
    // Kientre nếu: nằm trong category education/, HOẶC tên khớp từ khóa giáo dục
    const isEdu = category === 'education' || EDU_NAME_HINTS.test(name)
    if (isEdu) out.push({ name, path: full, description, category })
   }
  }
 }
 await walk(skillsRoot, 0)
 return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function GET(req: Request) {
 const url = new URL(req.url)
 const engineDir = url.searchParams.get('engineDir') || kientreConfig.engineDir
 const hermesHome = url.searchParams.get('hermesHome') || kientreConfig.hermesHome

 const agents = await listDir(path.join(engineDir, 'agents'), ['.mjs', '.js'])
 const serverModules = await listDir(path.join(engineDir, 'server'), ['.mjs', '.js', '.py'])
 const skills = await listKientreSkills(hermesHome)

 return NextResponse.json({
  ok: true,
  engineDir,
  hermesHome,
  agents: agents.map(name => ({ name, path: path.join(engineDir, 'agents', name) })),
  serverModules: serverModules.map(name => ({ name, path: path.join(engineDir, 'server', name) })),
  skills,
 })
}
