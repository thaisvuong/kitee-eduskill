import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { kiteeConfig } from '@/lib/config/kitee'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_BYTES = 512 * 1024 // 512KB — file skill/agent nhỏ, chống ghi file khổng lồ
const EDITABLE_EXT = new Set(['.md', '.mjs', '.js', '.py', '.json', '.txt', '.yaml', '.yml', '.css'])

// ponytail: chỉ cho sửa file trong eduSkillDir và hermesHome/skills. add per-user ACL when multi-tenant.
function allowedRoots(): string[] {
  return [
    path.resolve(kiteeConfig.eduSkillDir),
    path.resolve(path.join(kiteeConfig.hermesHome, 'skills')),
    path.resolve(process.env.EDUSKILL_DIR || kiteeConfig.eduSkillDir),
  ]
}

function isInsideAllowed(target: string): boolean {
  const full = path.resolve(target)
  return allowedRoots().some(root => full === root || full.startsWith(root + path.sep))
}

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get('path') || ''
  if (!p) return NextResponse.json({ ok: false, error: 'Thiếu path' }, { status: 400 })
  if (!isInsideAllowed(p)) return NextResponse.json({ ok: false, error: 'Không được phép mở file ngoài eduSkill/skills' }, { status: 403 })
  const ext = path.extname(p).toLowerCase()
  if (!EDITABLE_EXT.has(ext)) return NextResponse.json({ ok: false, error: `Không sửa được định dạng ${ext}` }, { status: 400 })
  try {
    const st = await fs.stat(p)
    if (!st.isFile()) throw new Error('not a file')
    if (st.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File quá lớn để sửa trên web' }, { status: 413 })
    const content = await fs.readFile(p, 'utf8')
    return NextResponse.json({ ok: true, path: p, content, size: st.size })
  } catch {
    return NextResponse.json({ ok: false, error: 'Không đọc được file' }, { status: 404 })
  }
}

export async function PUT(req: Request) {
  const { path: p = '', content = '' } = await req.json().catch(() => ({})) as { path?: string; content?: string }
  if (!p) return NextResponse.json({ ok: false, error: 'Thiếu path' }, { status: 400 })
  if (!isInsideAllowed(p)) return NextResponse.json({ ok: false, error: 'Không được phép ghi file ngoài eduSkill/skills' }, { status: 403 })
  const ext = path.extname(p).toLowerCase()
  if (!EDITABLE_EXT.has(ext)) return NextResponse.json({ ok: false, error: `Không sửa được định dạng ${ext}` }, { status: 400 })
  if (Buffer.byteLength(content, 'utf8') > MAX_BYTES) return NextResponse.json({ ok: false, error: 'Nội dung quá lớn' }, { status: 413 })
  try {
    await fs.stat(p) // chỉ ghi đè file đã tồn tại, không tạo mới ngoài ý muốn
    // backup .bak trước khi ghi
    try { await fs.copyFile(p, p + '.bak') } catch {}
    await fs.writeFile(p, content, 'utf8')
    return NextResponse.json({ ok: true, path: p, size: Buffer.byteLength(content, 'utf8') })
  } catch {
    return NextResponse.json({ ok: false, error: 'Không ghi được file (file không tồn tại?)' }, { status: 404 })
  }
}
