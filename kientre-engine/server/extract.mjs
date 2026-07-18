import { execFile } from 'node:child_process'
import { pyScript, PYTHON, cleanEnv } from './paths.mjs'

/** Đọc nội dung văn bản từ tệp .docx / .pdf / .md / .txt / .tex qua Python. */
export function extractText(filePath) {
 return new Promise((resolve, reject) => {
  execFile(PYTHON, [pyScript('extract_text.py'), filePath],
   { maxBuffer: 1024 * 1024 * 32, env: cleanEnv() },
   (err, stdout, stderr) => {
    if (err) reject(new Error(`Không đọc được tệp: ${stderr || err.message}`))
    else resolve(stdout)
   })
 })
}
