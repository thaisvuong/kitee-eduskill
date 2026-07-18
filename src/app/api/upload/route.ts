import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { kientreConfig } from '@/lib/config/kientre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED = new Set(['.docx', '.pdf', '.png', '.jpg', '.jpeg', '.txt', '.md'])
const MAX_BYTES = 25 * 1024 * 1024
const DEFAULT_ROOT = path.resolve(kientreConfig.outputDir)

function rootAllowed(root: string) {
 const full = path.resolve(root)
 return full === DEFAULT_ROOT || full.startsWith(DEFAULT_ROOT + path.sep)
}

// ponytail: uploads go to Output/_uploads. add virus scan / size policy when public-facing.
export async function POST(req: Request) {
 const form = await req.formData().catch(() => null)
 if (!form) return NextResponse.json({ ok: false, error: 'Không đọc được form' }, { status: 400 })
 const file = form.get('file')
 const outputDir = String(form.get('outputDir') || kientreConfig.outputDir)
 if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'Thiếu file' }, { status: 400 })
 if (!rootAllowed(outputDir)) return NextResponse.json({ ok: false, error: 'Không được phép upload ngoài Output' }, { status: 403 })
 if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: 'File quá lớn' }, { status: 413 })

 const ext = path.extname(file.name).toLowerCase()
 if (!ALLOWED.has(ext)) return NextResponse.json({ ok: false, error: `Không hỗ trợ định dạng ${ext}` }, { status: 400 })

 const uploadsDir = path.join(path.resolve(outputDir), '_uploads')
 await fs.mkdir(uploadsDir, { recursive: true })
 const stem = path.basename(file.name, ext)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9._-]+/g, '-')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80) || 'upload'
 const dest = path.join(uploadsDir, `${Date.now()}_${stem}${ext}`)
 const buf = Buffer.from(await file.arrayBuffer())
 await fs.writeFile(dest, buf)

 return NextResponse.json({ ok: true, path: dest, name: path.basename(dest), size: buf.length })
}
