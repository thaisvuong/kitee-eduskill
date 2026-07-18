import { execFile } from 'node:child_process'
import { mkdtemp, readFile, readdir, copyFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pyScript as py, PYTHON, cleanEnv } from './paths.mjs'

function execFileP(cmd, args, opts = {}) {
 return new Promise((resolve, reject) => {
  execFile(cmd, args, opts, (err, stdout, stderr) => err ? reject(new Error(stderr || stdout || err.message)) : resolve({ stdout, stderr }))
 })
}

async function officeCliPolish(docModelPath, outputPath) {
 if (process.env.KIENTRE_OFFICECLI_WORD === '0') return false
 try { await execFileP('officecli', ['--version']) } catch { return false }
 const tmp = await mkdtemp(path.join(os.tmpdir(), 'kientre-officecli-'))
 try {
  const model = await readFile(docModelPath, 'utf8')
  const promptPath = path.join(tmp, 'prompt.txt')
  await writeFile(promptPath, [
   'Tạo file Word tiếng Việt, trình bày đẹp, giáo dục tiểu học.',
   'Giữ đúng toàn bộ nội dung trong JSON, không bỏ câu, không tự thêm kiến thức mới.',
   'Định dạng rõ: tiêu đề, mục, bảng nếu phù hợp, khoảng trống làm bài, đáp án/lời giải.',
   'Nội dung JSON:',
   model,
  ].join('\n\n'), 'utf8')
  await execFileP('officecli', ['new', 'docx', path.basename(outputPath, '.docx'), '--prompt-file', promptPath, '--out', tmp, '--mode', 'fast', '--lang', 'vi', '--no-publish'], { env: process.env, timeout: 240000 })
  const made = (await readdir(tmp)).find(f => f.toLowerCase().endsWith('.docx'))
  if (!made) return false
  await copyFile(path.join(tmp, made), outputPath)
  return true
 } finally {
  await rm(tmp, { recursive: true, force: true }).catch(() => {})
 }
}

/** Thiết kế Word: Python giữ nội dung chuẩn; officecli polish nếu có. */
export async function designWord(docModelPath, outputPath, polish = true) {
 await execFileP(PYTHON, [py('word_designer.py'), docModelPath, outputPath], { env: cleanEnv() })
 if (polish) await officeCliPolish(docModelPath, outputPath).catch(e => console.warn(`⚠️ officecli bỏ qua: ${e.message}`))
 return outputPath
}

/** Vẽ biểu đồ hình quạt tròn */
export async function generatePieChart(chartData, outputPath) {
 return new Promise((resolve, reject) => {
  execFile(PYTHON, [
   py('chart_gen.py'),
   outputPath,
   JSON.stringify(chartData.data),
   JSON.stringify(chartData.labels),
   chartData.title
  ], { env: cleanEnv() }, (err, stdout, stderr) => {
   if (err) reject(new Error(`Lỗi Chart Gen: ${stderr || stdout}`))
   else resolve(outputPath)
  })
 })
}

/** Xuất PNG từ mã TikZ sử dụng kịch bản Python mới */
export async function compileTikzToPng(tikzCode, outputPath) {
 return new Promise((resolve, reject) => {
  execFile(PYTHON, [py('tikz_artist.py'), outputPath, tikzCode], { env: cleanEnv() }, (err, stdout, stderr) => {
   if (err) {
    console.error("Lỗi TikZ:", stderr || stdout)
    reject(new Error(`Lỗi Artist Agent: ${stderr || stdout}`))
   }
   else resolve(outputPath)
  })
 })
}
