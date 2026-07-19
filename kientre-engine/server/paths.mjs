import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

// Gốc Sub-Hermes tuyệt đối (…/Hermes/Sub-Hermes) — độc lập với cwd/entry point.
export const SUB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const SERVER_DIR = path.join(SUB_ROOT, 'server')

/**
 * Output root có thể cấu hình theo profile/workspace.
 * Ưu tiên:
 *  1. KIENTRE_OUTPUT_DIR / KIENTRE_ENGINE_OUTPUT_DIR: đường dẫn output trực tiếp.
 *  2. HERMES_WORKSPACE_DIR / KIENTRE_WORKSPACE_DIR: tự lưu vào <workspace>/Output.
 *  3. Fallback legacy: <Kientre>/output.
 */
function resolveOutputDir() {
 const direct = process.env.KIENTRE_OUTPUT_DIR || process.env.KIENTRE_ENGINE_OUTPUT_DIR
 if (direct) return path.resolve(direct.replace(/^~(?=\/|$)/, process.env.HOME || ''))
 const workspace = process.env.HERMES_WORKSPACE_DIR || process.env.KIENTRE_WORKSPACE_DIR
 if (workspace) return path.join(path.resolve(workspace.replace(/^~(?=\/|$)/, process.env.HOME || '')), 'Output')
 const kientreWorkspace = '/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee'
 if (fs.existsSync(kientreWorkspace)) return path.join(kientreWorkspace, 'Output')
 return path.join(SUB_ROOT, 'output')
}

export const OUTPUT_DIR = resolveOutputDir()

/** Đường dẫn tuyệt đối tới một script Python trong server/. */
export const pyScript = name => path.join(SERVER_DIR, name)
/** Thư mục output tuyệt đối cho một job. */
export const outDirFor = folderName => path.join(OUTPUT_DIR, folderName)

// ── Chọn Python có đủ thư viện (docx, matplotlib, latex2mathml…) ───────────
// Ưu tiên: biến môi trường HERMES_PYTHON > 3.12 framework > /usr/local > python3 PATH.
// Kiểm tra một lần lúc nạp module, cache lại. Chạy với env SẠCH (bỏ PYTHONPATH)
// để tránh venv 3.11 của Hermes rò rỉ vào tiến trình con gây xung đột lib.
const CANDIDATES = [
 process.env.HERMES_PYTHON,
 '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
 '/opt/homebrew/bin/python3',
 '/usr/local/bin/python3',
 'python3',
].filter(Boolean)

function pickPython() {
 for (const py of CANDIDATES) {
  try {
   execFileSync(py, ['-c', 'import docx, latex2mathml, mathml2omml'],
    { env: cleanEnv(), stdio: 'ignore' })
   return py
  } catch { /* thử ứng viên kế tiếp */ }
 }
 return 'python3'  // fallback: cứ chạy, để lỗi tự hiện nếu thiếu lib
}

/** Môi trường sạch cho tiến trình Python con: bỏ PYTHONPATH pha trộn của Hermes venv. */
export function cleanEnv(extra = {}) {
 const env = { ...process.env, ...extra }
 delete env.PYTHONPATH
 delete env.PYTHONHOME
 return env
}

export const PYTHON = pickPython()

// Log một lần để dễ chẩn đoán (chỉ khi bật HERMES_DEBUG).
if (process.env.HERMES_DEBUG) console.error(`[paths] PYTHON = ${PYTHON}`)
