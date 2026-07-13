import { execFile } from 'node:child_process'
import { pyScript, PYTHON, cleanEnv } from './paths.mjs'

function bridge(args, timeout = 210000) {
  return new Promise(resolve => {
    execFile(PYTHON, [pyScript('notebooklm_bridge.py'), ...args],
      { timeout, maxBuffer: 1024 * 1024 * 16, env: cleanEnv() },
      (err, stdout) => {
        try { resolve(JSON.parse(stdout)) }
        catch { resolve({ ok: false, error: err?.message || 'Không đọc được NotebookLM' }) }
      })
  })
}

export const listNotebooks = () => bridge(['list'], 45000)
export const notebookRefs = (id, query) => bridge(['refs', id, query])
