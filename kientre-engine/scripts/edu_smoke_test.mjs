import { mkdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fetchImage } from '../agents/imagefetcher.mjs'
import { designWord } from '../server/compiler.mjs'

const exec = promisify(execFile)
const root = path.resolve(import.meta.dirname, '..')
const out = path.join(root, 'output', '_smoke')
const images = path.join(out, 'images')
await mkdir(images, { recursive: true })

const results = []
async function step(name, fn) {
 try {
  const data = await fn()
  results.push({ name, ok: true, ...data })
  console.log(`OK ${name}`)
 } catch (err) {
  results.push({ name, ok: false, error: err.message })
  console.error(`FAIL ${name}: ${err.message}`)
 }
}

await step('syntax', async () => {
 for (const file of ['slash.mjs', 'cli.mjs', 'orchestrator.mjs', 'agents/imagefetcher.mjs', 'server/compiler.mjs']) {
  await exec('node', ['--check', path.join(root, file)])
 }
 return {}
})

await step('python-libs', async () => {
 const code = 'import docx, latex2mathml, mathml2omml, matplotlib, fitz, PIL; print("ok")'
 const { stdout } = await exec('/Library/Frameworks/Python.framework/Versions/3.12/bin/python3', ['-c', code], {
  env: { ...process.env, PYTHONPATH: '', PYTHONHOME: '' },
 })
 return { stdout: stdout.trim() }
})

await step('tikz', async () => {
 const png = path.join(images, 'rectangle.png')
 const tikz = '\\draw[BrandNavy, line width=2pt] (0,0) rectangle (4,2); \\node at (2,-0.35) {4 cm}; \\node[rotate=90] at (-0.35,1) {2 cm};'
 await exec('/Library/Frameworks/Python.framework/Versions/3.12/bin/python3', [path.join(root, 'server', 'tikz_artist.py'), png, tikz])
 const s = await stat(png)
 if (s.size < 3000) throw new Error('TikZ PNG too small')
 return { path: png, bytes: s.size }
})

await step('image-fetch', async () => {
 const jpg = path.join(images, 'honeycomb.jpg')
 const ok = await fetchImage('honeycomb hexagon bee', jpg)
 if (!ok) throw new Error('fetchImage returned false')
 const s = await stat(jpg)
 const meta = JSON.parse(await (await import('node:fs/promises')).readFile(`${jpg}.json`, 'utf8'))
 return { path: jpg, bytes: s.size, title: meta.title || '', url: meta.url || '' }
})

await step('word-pdf', async () => {
 const modelPath = path.join(out, 'model.json')
 const docx = path.join(out, 'smoke.docx')
 const pdf = path.join(out, 'smoke.pdf')
 const model = {
  title: 'Smoke Test Kientre', subject: 'Toán', topic: 'Kiểm tra', grade: 'Lớp 4',
  sections: [{ heading: 'KIỂM TRA WORD', blocks: [
   { type: 'paragraph', text: 'Đây là đoạn kiểm tra mẫu Word Ki-Tee.' },
   { type: 'keypoint', title: 'Ghi nhớ', text: 'Mẫu Word tạo được box màu thương hiệu.' },
   { type: 'image', path: path.join(images, 'rectangle.png'), caption: 'Hình chữ nhật 4 cm x 2 cm' },
  ] }],
 }
 await writeFile(modelPath, JSON.stringify(model, null, 2))
 await designWord(modelPath, docx)
 await exec('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', out, docx])
 const ds = await stat(docx), ps = await stat(pdf)
 if (ds.size < 10000 || ps.size < 10000) throw new Error('DOCX/PDF output too small')
 return { docx, docxBytes: ds.size, pdf, pdfBytes: ps.size }
})

await writeFile(path.join(out, 'smoke-results.json'), JSON.stringify(results, null, 2))
const failed = results.filter(r => !r.ok)
console.log(JSON.stringify({ ok: failed.length === 0, failed, results }, null, 2))
process.exit(failed.length ? 1 : 0)
