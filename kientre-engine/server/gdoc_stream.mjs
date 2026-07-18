// Google Docs streaming helper: create a doc, then append quiz questions one at
// a time so the user sees them land in real time. Wraps the stdlib-only python
// script kientre_gdoc_stream.py. Never throws — returns null / false on failure
// so a Docs problem cannot break the local Word pipeline.
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'scripts', 'kientre_gdoc_stream.py')

let _py = null
async function pickPython() {
  if (_py) return _py
  const cands = [process.env.HERMES_PYTHON,
    '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3',
    '/opt/homebrew/bin/python3', '/usr/local/bin/python3', 'python3'].filter(Boolean)
  for (const c of cands) {
    const ok = await new Promise(res => {
      const ch = spawn(c, ['-c', 'import json,urllib.request'])
      ch.on('error', () => res(false)); ch.on('close', code => res(code === 0))
    })
    if (ok) { _py = c; return c }
  }
  _py = 'python3'; return _py
}

function run(action, payload) {
  return new Promise(async resolve => {
    const py = await pickPython()
    const env = { ...process.env }
    delete env.PYTHONPATH; delete env.PYTHONHOME
    const child = spawn(py, [SCRIPT, action], { env })
    let out = '', err = ''
    child.stdout.on('data', d => { out += d.toString() })
    child.stderr.on('data', d => { err += d.toString() })
    child.on('error', () => resolve({ ok: false, error: 'spawn failed' }))
    child.on('close', code => {
      try { resolve(JSON.parse(out.trim())) }
      catch { resolve({ ok: false, error: err.trim() || `exit ${code}: ${out.slice(0, 300)}` }) }
    })
    child.stdin.write(JSON.stringify(payload)); child.stdin.end()
  })
}

// Create a Google Doc. Returns { documentId, url } or null.
export async function createQuizDoc(title, folderId = '', tokenFile = '') {
  const res = await run('create', { title, folder: folderId || '', tokenFile: tokenFile || undefined })
  if (!res?.ok) console.warn(`⚠️ Google Docs create failed: ${res?.error || 'unknown'}`)
  return res?.ok ? { documentId: res.documentId, url: res.url } : null
}

// Append one question block to the doc. Returns true/false.
export async function appendQuizQuestion(documentId, question, tokenFile = '') {
  if (!documentId) return false
  const res = await run('append', { documentId, question, tokenFile: tokenFile || undefined })
  if (!res?.ok) console.warn(`⚠️ Google Docs append failed: ${res?.error || 'unknown'}`)
  return !!res?.ok
}
