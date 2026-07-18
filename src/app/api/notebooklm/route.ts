import { NextResponse } from 'next/server'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { kientreConfig } from '@/lib/config/kientre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function runNotebook(args: string[], timeoutMs = 120_000): Promise<any> {
  const script = path.join(kientreConfig.engineDir, 'scripts', 'kientre_notebooklm.py')
  return new Promise(resolve => {
    const child = spawn('python3', [script, ...args], { cwd: kientreConfig.engineDir, env: process.env })
    let out = '', err = ''
    const t = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({ ok: false, error: 'NotebookLM timeout' })
    }, timeoutMs)
    child.stdout.on('data', d => out += d.toString())
    child.stderr.on('data', d => err += d.toString())
    child.on('close', code => {
      clearTimeout(t)
      try {
        const json = JSON.parse(out || '{}')
        if (code === 0) resolve(json)
        else resolve({ ...json, ok: false, error: json.error || err || `NotebookLM exited ${code}` })
      } catch {
        resolve({ ok: false, error: err || out || `NotebookLM exited ${code}` })
      }
    })
  })
}

function addOpt(args: string[], flag: string, value: any) {
  if (value !== undefined && value !== null && String(value).trim()) args.push(flag, String(value))
}
function addBool(args: string[], yes: boolean | undefined, on: string, off?: string) {
  if (yes === true) args.push(on)
  else if (yes === false && off) args.push(off)
}
function sourceCsv(v: any) {
  return Array.isArray(v) ? v.join(',') : String(v || '')
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action') || 'list'
  const notebookId = url.searchParams.get('notebookId') || ''
  if (action === 'status') return NextResponse.json(await runNotebook(['list'], 60_000))
  if (action === 'sources') {
    if (!notebookId) return NextResponse.json({ ok: false, error: 'missing notebookId' }, { status: 400 })
    return NextResponse.json(await runNotebook(['sources', '--notebook-id', notebookId], 120_000))
  }
  return NextResponse.json(await runNotebook(['list'], 120_000))
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const action = String(body.action || '')
  const nb = String(body.notebookId || body.notebookIds?.[0] || '')

  if (action === 'ask') {
    const ids = Array.isArray(body.notebookIds) ? body.notebookIds.join(',') : nb
    if (!ids || !body.prompt) return NextResponse.json({ ok: false, error: 'missing notebookIds or prompt' }, { status: 400 })
    return NextResponse.json(await runNotebook(['ask', '--notebook-id', ids, '--prompt', String(body.prompt)], 300_000))
  }
  if (action === 'list-full') return NextResponse.json(await runNotebook(['list'], 120_000))
  if (action === 'create') {
    if (!body.title) return NextResponse.json({ ok: false, error: 'missing title' }, { status: 400 })
    return NextResponse.json(await runNotebook(['create', '--title', String(body.title)], 120_000))
  }
  if (['delete', 'rename', 'summary', 'metadata'].includes(action)) {
    if (!nb) return NextResponse.json({ ok: false, error: 'missing notebookId' }, { status: 400 })
    const args = [action, '--notebook-id', nb]
    if (action === 'rename') addOpt(args, '--title', body.title)
    return NextResponse.json(await runNotebook(args, 180_000))
  }

  if (action === 'sources') {
    if (!nb) return NextResponse.json({ ok: false, error: 'missing notebookId' }, { status: 400 })
    return NextResponse.json(await runNotebook(['sources', '--notebook-id', nb], 120_000))
  }
  if (action === 'add-url' || action === 'add-text' || action === 'source-add') {
    if (!nb) return NextResponse.json({ ok: false, error: 'missing notebookId' }, { status: 400 })
    const content = String(body.url || body.text || body.content || '')
    if (!content) return NextResponse.json({ ok: false, error: 'missing content' }, { status: 400 })
    const args = ['source-add', '--notebook-id', nb, '--content', content]
    addOpt(args, '--title', body.title || body.url)
    addOpt(args, '--type', body.type || (action === 'add-url' ? 'url' : action === 'add-text' ? 'text' : ''))
    addBool(args, Boolean(body.wait ?? true), '--wait', '--no-wait')
    return NextResponse.json(await runNotebook(args, 300_000))
  }
  if (action === 'source-refresh' || action === 'source-fulltext') {
    if (!nb || !body.sourceId) return NextResponse.json({ ok: false, error: 'missing notebookId/sourceId' }, { status: 400 })
    const args = [action, '--notebook-id', nb, '--source-id', String(body.sourceId)]
    addOpt(args, '--format', body.format)
    addOpt(args, '--output', body.output)
    return NextResponse.json(await runNotebook(args, 300_000))
  }

  if (action.startsWith('generate-')) {
    if (!nb) return NextResponse.json({ ok: false, error: 'missing notebookId' }, { status: 400 })
    const args = [action, '--notebook-id', nb, '--description', String(body.description || '')]
    addOpt(args, '--format', body.format)
    addOpt(args, '--quantity', body.quantity)
    addOpt(args, '--difficulty', body.difficulty)
    addOpt(args, '--length', body.length)
    const langOk = !['generate-quiz', 'generate-flashcards'].includes(action)
    if (langOk) addOpt(args, '--language', body.language || 'vi')
    addOpt(args, '--style', body.style)
    addOpt(args, '--style-prompt', body.stylePrompt)
    addOpt(args, '--orientation', body.orientation)
    addOpt(args, '--detail', body.detail)
    addOpt(args, '--append', body.append)
    addOpt(args, '--instructions', body.instructions)
    addOpt(args, '--kind', body.kind)
    addOpt(args, '--sources', sourceCsv(body.sources))
    addBool(args, Boolean(body.wait), '--wait', '--no-wait')
    return NextResponse.json(await runNotebook(args, Number(body.timeout || 1_800_000)))
  }

  if (action.startsWith('download-')) {
    if (!nb) return NextResponse.json({ ok: false, error: 'missing notebookId' }, { status: 400 })
    const args = [action, '--notebook-id', nb]
    addOpt(args, '--artifact-id', body.artifactId)
    addOpt(args, '--format', body.format)
    addOpt(args, '--output', body.output)
    return NextResponse.json(await runNotebook(args, 300_000))
  }
  if (action === 'artifact-list' || action === 'artifact-get' || action === 'artifact-export') {
    if (!nb) return NextResponse.json({ ok: false, error: 'missing notebookId' }, { status: 400 })
    const args = [action, '--notebook-id', nb]
    addOpt(args, '--artifact-id', body.artifactId)
    addOpt(args, '--type', body.type)
    addOpt(args, '--title', body.title)
    return NextResponse.json(await runNotebook(args, 300_000))
  }

  if (['note-create', 'note-list', 'note-get', 'note-save', 'research-status', 'research-wait', 'share-status'].includes(action)) {
    if (!nb) return NextResponse.json({ ok: false, error: 'missing notebookId' }, { status: 400 })
    const args = [action, '--notebook-id', nb]
    addOpt(args, '--note-id', body.noteId)
    addOpt(args, '--title', body.title)
    addOpt(args, '--content', body.content)
    addOpt(args, '--timeout', body.timeout)
    return NextResponse.json(await runNotebook(args, 600_000))
  }

  return NextResponse.json({ ok: false, error: 'unknown action: ' + action }, { status: 400 })
}
