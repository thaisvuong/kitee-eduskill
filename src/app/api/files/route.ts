import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import mammoth from 'mammoth'
import { kientreConfig } from '@/lib/config/kientre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MIME: Record<string, string> = {
 '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 '.pdf': 'application/pdf',
}
const ALLOWED = new Set(['.docx', '.pdf'])
const DEFAULT_ROOT = path.resolve(kientreConfig.outputDir)

function rootAllowed(root: string) {
 const full = path.resolve(root)
 return full === DEFAULT_ROOT || full.startsWith(DEFAULT_ROOT + path.sep)
}

function safeJoin(root: string, rel: string) {
 const full = path.resolve(root, rel)
 if (full !== root && !full.startsWith(root + path.sep)) return null
 return full
}

async function resolveRequestedFile(root: string, requested: string) {
 const resolvedRoot = path.resolve(root)
 const candidates = path.isAbsolute(requested)
  ? [requested]
  : [path.resolve(resolvedRoot, requested)]

 for (const candidate of candidates) {
  if (candidate !== resolvedRoot && !candidate.startsWith(resolvedRoot + path.sep)) continue
  const st = await fs.stat(candidate).catch(() => null)
  if (st?.isFile()) return candidate
 }

 // Backward compatibility for old chat links that stored only the basename while
 // the file actually lives in a timestamped/subfolder path.
 const basename = path.basename(requested)
 if (!basename || basename === requested && requested.includes(path.sep)) return null
 let found: string | null = null
 async function walk(dir: string) {
  if (found) return
  let entries: any[] = []
  try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
   if (found || e.name.startsWith('.')) continue
   const full = path.join(dir, e.name)
   if (e.isDirectory()) await walk(full)
   else if (e.name === basename) found = full
  }
 }
 await walk(resolvedRoot)
 return found
}

function htmlPage(title: string, body: string, warnings: string[] = []) {
 const safeTitle = title.replace(/[&<>\"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c))
 const warningHtml = warnings.length
  ? `<aside class="warnings"><b>Ghi chú chuyển đổi:</b><ul>${warnings.map(w => `<li>${w.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] || c))}</li>`).join('')}</ul></aside>`
  : ''
 return `<!doctype html>
<html lang="vi">
<head>
 <meta charset="utf-8" />
 <meta name="viewport" content="width=device-width, initial-scale=1" />
 <title>${safeTitle}</title>
 <style>
  body { margin: 0; background: #f7f9fc; color: #0f172a; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.65; }
  main { max-width: 900px; margin: 24px auto; background: #fff; border: 1px solid #e6ecf3; border-radius: 14px; box-shadow: 0 12px 32px rgba(20,45,84,.08); padding: 34px 42px; }
  h1 { margin: 0 0 18px; color: #1B3C6E; font-size: 20px; }
  img { max-width: 100%; height: auto; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; }
  td, th { border: 1px solid #d8e3f2; padding: 8px; vertical-align: top; }
  .warnings { margin-bottom: 18px; padding: 12px 14px; background: #fff3e8; border: 1px solid #f6d9be; border-radius: 10px; color: #7a3b08; font-size: 13px; }
  .docx-body { overflow-wrap: anywhere; }
 </style>
</head>
<body><main><h1>${safeTitle}</h1>${warningHtml}<div class="docx-body">${body}</div></main></body>
</html>`
}

async function walk(dir: string, root: string, acc: { folders: any[]; files: any[] }) {
 let entries: any[] = []
 try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return acc }

 for (const e of entries) {
  if (e.name.startsWith('.')) continue
  const full = path.join(dir, e.name)
  const rel = path.relative(root, full)
  const st = await fs.stat(full).catch(() => null)
  if (!st) continue

  if (e.isDirectory()) {
   acc.folders.push({ rel, name: e.name, mtime: st.mtimeMs })
   await walk(full, root, acc)
   continue
  }

  const ext = path.extname(e.name).toLowerCase()
  if (ALLOWED.has(ext)) {
   acc.files.push({ rel, name: e.name, ext, size: st.size, mtime: st.mtimeMs })
  }
 }
 return acc
}

export async function GET(req: Request) {
 const url = new URL(req.url)
 const outputDir = url.searchParams.get('root') || kientreConfig.outputDir
 if (!rootAllowed(outputDir)) return NextResponse.json({ ok: false, error: 'Không được phép mở thư mục ngoài Output' }, { status: 403 })
 const preview = url.searchParams.get('preview')
 const download = url.searchParams.get('download')
 const requestedFile = preview || download

 if (requestedFile) {
  const full = await resolveRequestedFile(outputDir, requestedFile)
  if (!full) return NextResponse.json({ ok: false, error: 'Không tìm thấy file' }, { status: 404 })
  try {
   const st = await fs.stat(full)
   if (!st.isFile()) throw new Error('not a file')
   const ext = path.extname(full).toLowerCase()
   if (!ALLOWED.has(ext)) return NextResponse.json({ ok: false, error: 'Chỉ cho mở file .docx hoặc .pdf' }, { status: 400 })

   if (preview && ext === '.docx') {
    const result = await mammoth.convertToHtml(
     { path: full },
     { convertImage: mammoth.images.dataUri, includeDefaultStyleMap: true },
    )
    return new Response(htmlPage(path.basename(full), result.value || '<p>(Tài liệu không có nội dung xem trước)</p>', result.messages.map(m => m.message)), {
     headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
     },
    })
   }

   const stream = createReadStream(full) as any
   return new Response(stream, {
    headers: {
     'Content-Type': MIME[ext] || 'application/octet-stream',
     'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename="${encodeURIComponent(path.basename(full))}"`,
     'Content-Length': String(st.size),
     'Cache-Control': 'no-store',
    },
   })
  } catch {
   return NextResponse.json({ ok: false, error: 'Không tìm thấy file' }, { status: 404 })
  }
 }

 const root = path.resolve(outputDir)
 const data = await walk(root, root, { folders: [], files: [] })
 data.folders.sort((a, b) => b.mtime - a.mtime)
 data.files.sort((a, b) => b.mtime - a.mtime)
 return NextResponse.json({ ok: true, root, folders: data.folders.slice(0, 200), files: data.files.slice(0, 200) })
}

export async function DELETE(req: Request) {
 const url = new URL(req.url)
 const outputDir = url.searchParams.get('root') || kientreConfig.outputDir
 const rel = url.searchParams.get('rel') || ''
 if (!rootAllowed(outputDir)) return NextResponse.json({ ok: false, error: 'Không được phép xoá ngoài Output' }, { status: 403 })
 if (!rel) return NextResponse.json({ ok: false, error: 'Thiếu rel' }, { status: 400 })
 const full = await resolveRequestedFile(outputDir, rel)
 if (!full) return NextResponse.json({ ok: false, error: 'Không tìm thấy file' }, { status: 404 })
 // Xoá toàn bộ thư mục chứa file (mỗi quiz/topic nằm trong thư mục riêng)
 const parentDir = path.dirname(full)
 if (parentDir !== outputDir && parentDir.startsWith(outputDir)) {
   await fs.rm(parentDir, { recursive: true, force: true }).catch(() => null)
 } else {
   await fs.unlink(full).catch(() => null)
 }
 return NextResponse.json({ ok: true, rel })
}
