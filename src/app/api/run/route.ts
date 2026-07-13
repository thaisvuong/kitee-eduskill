import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import { NextResponse } from 'next/server'
import { kiteeConfig } from '@/lib/config/kitee'
import { findCommand } from '@/lib/eduskill/slashCommands'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ponytail: in-memory process registry. add DB/queue worker when jobs must survive server restart.
const RUNNING = (globalThis as any).__KITEE_RUNNING__ || new Map<string, ChildProcessWithoutNullStreams>()
;(globalThis as any).__KITEE_RUNNING__ = RUNNING

function sse(controller: ReadableStreamDefaultController, event: string, data: unknown) {
  try {
    controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
  } catch {}
}

async function snapshotOutput(dir: string): Promise<Set<string>> {
  const root = path.resolve(dir)
  const out = new Set<string>()
  async function walk(p: string) {
    let entries: string[] = []
    try { entries = await fs.readdir(p) } catch { return }
    await Promise.all(entries.map(async name => {
      if (name.startsWith('.')) return
      const full = path.join(p, name)
      const st = await fs.stat(full).catch(() => null)
      if (!st) return
      if (st.isDirectory()) return walk(full)
      if (/\.(docx|pdf)$/i.test(name)) out.add(path.relative(root, full))
    }))
  }
  await walk(root)
  return out
}

async function collectResultFiles(root: string, created: string[]) {
  const out: string[] = []
  async function walk(p: string) {
    let st
    try { st = await fs.stat(p) } catch { return }
    if (st.isFile()) {
      if (/\.(docx|pdf)$/i.test(p)) out.push(p)
      return
    }
    if (!st.isDirectory()) return
    const entries = await fs.readdir(p)
    await Promise.all(entries.map(e => walk(path.join(p, e))))
  }
  await Promise.all(created.map(name => walk(path.join(root, name))))
  return out
}

async function resolveEduSkillDir(candidate: string) {
  const dirs = [candidate, kiteeConfig.eduSkillDir, path.join(process.cwd(), 'eduSkill')]
  for (const dir of dirs) {
    if (!dir) continue
    try { await fs.access(path.join(dir, 'slash.mjs')); return dir } catch {}
  }
  return candidate || kiteeConfig.eduSkillDir
}

async function uploadToDrive(filePath: string, parentId: string, hermesHome: string): Promise<{ ok: boolean; name: string; link?: string; error?: string }> {
  const script = path.join(hermesHome, 'skills/productivity/google-workspace/scripts/google_api.py')
  const name = path.basename(filePath)
  return await new Promise(resolve => {
    const child = spawn('python', [script, 'drive', 'upload', filePath, '--parent', parentId], {
      env: { ...process.env, HERMES_HOME: hermesHome },
    })
    let stdout = '', stderr = ''
    child.stdout.on('data', d => { stdout += d.toString() })
    child.stderr.on('data', d => { stderr += d.toString() })
    child.on('error', e => resolve({ ok: false, name, error: e.message }))
    child.on('close', code => {
      if (code !== 0) return resolve({ ok: false, name, error: stderr.trim() || stdout.trim() || `exit ${code}` })
      try {
        const data = JSON.parse(stdout)
        resolve({ ok: true, name: data.name || name, link: data.webViewLink || data.webContentLink })
      } catch {
        resolve({ ok: true, name })
      }
    })
  })
}

export async function POST(req: Request) {
  const { jobId = '', command = '', settings = {} } = await req.json().catch(() => ({})) as {
    jobId?: string; command?: string; settings?: Record<string, any>
  }
  const line = command.trim()
  const token = (line.split(/\s+/)[0] || '').toLowerCase()
  const cmd = findCommand(token)
  const outputDir = settings.outputDir || kiteeConfig.outputDir

  const stream = new ReadableStream({
    async start(controller) {
      const close = () => { try { controller.close() } catch {} }
      if (!jobId) { sse(controller, 'error', { message: 'Thiếu jobId' }); return close() }
      if (!line.startsWith('/')) { sse(controller, 'error', { message: 'Lệnh phải bắt đầu bằng "/". Gõ /help.' }); return close() }
      if (!cmd) { sse(controller, 'error', { message: `Không rõ lệnh "${token}". Gõ /help để xem danh sách.` }); return close() }
      if (token === '/help' || token === '/es' || token === '/es-help' || token === '/?') { sse(controller, 'done', { help: true, reply: 'help', code: 0 }); return close() }
      const eduSkillDir = await resolveEduSkillDir(settings.eduSkillDir || kiteeConfig.eduSkillDir)
      const slashPath = path.join(eduSkillDir, 'slash.mjs')
      try { await fs.access(slashPath) } catch {
        sse(controller, 'error', { message: `Không tìm thấy engine eduSkill tại ${slashPath}. Kiểm tra "Thư mục eduSkill" trong Cài đặt.` })
        return close()
      }

      const before = await snapshotOutput(outputDir)
      sse(controller, 'start', { command: line, mode: cmd.mode, jobId })

      const routerBaseUrl = settings.routerBaseUrl || kiteeConfig.routerBaseUrl
      const env = {
        ...process.env,
        HERMES_WORKSPACE_DIR: settings.workspaceDir || kiteeConfig.workspaceDir,
        HERMES_EDUSKILL_OUTPUT_DIR: outputDir,
        HERMES_HOME: settings.hermesHome || kiteeConfig.hermesHome,
        HERMES_DRIVE_PARENT_ID: settings.driveParentId || kiteeConfig.driveParentId,
        NINE_ROUTER_BASE_URL: routerBaseUrl,
        HERMES_ROUTER_URL: routerBaseUrl.replace(/\/v1\/?$/, ''),
        HERMES_WORKER_MODEL: settings.defaultWorkerModel || kiteeConfig.defaultWorkerModel,
        HERMES_FALLBACK_MODELS: settings.fallbackModels || process.env.HERMES_FALLBACK_MODELS || 'gc/gemini-2.5-flash,gc/gemini-2.5-pro,gc/gemini-3.1-flash-lite-preview,cx/gpt-5.5,cx/gpt-5.4,cc/claude-opus-4-8,openrouter/openrouter/free',
        HERMES_MODEL_RETRIES: String(settings.modelRetries ?? process.env.HERMES_MODEL_RETRIES ?? '2'),
        HERMES_MODEL_RETRY_DELAY_MS: String(settings.retryDelayMs ?? process.env.HERMES_MODEL_RETRY_DELAY_MS ?? '1200'),
      }

      const child = spawn('node', [slashPath, line], { cwd: eduSkillDir, env })
      RUNNING.set(jobId, child)
      let buf = ''
      let cancelled = false

      const onData = (chunk: Buffer) => {
        buf += chunk.toString()
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const l of lines) if (l.trim()) sse(controller, 'log', { line: l, jobId })
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)

      child.on('error', (e) => {
        RUNNING.delete(jobId)
        sse(controller, 'error', { message: e.message, jobId })
        close()
      })
      child.on('close', async (code, signal) => {
        RUNNING.delete(jobId)
        if (buf.trim()) sse(controller, 'log', { line: buf, jobId })
        const after = await snapshotOutput(outputDir)
        const created = [...after].filter(x => !before.has(x))
        const hermesHome = settings.hermesHome || kiteeConfig.hermesHome
        const driveParentId = settings.driveParentId || kiteeConfig.driveParentId
        if (cancelled || signal === 'SIGTERM') {
          sse(controller, 'done', { code: 130, cancelled: true, created, outputDir, jobId })
        } else {
          const driveUploads: any[] = []
          if ((code ?? 1) === 0 && settings.uploadDrive && driveParentId) {
            const files = await collectResultFiles(outputDir, created)
            if (files.length) sse(controller, 'log', { line: `☁️ Đang upload ${files.length} file lên Google Drive...`, jobId })
            for (const file of files) {
              const result = await uploadToDrive(file, driveParentId, hermesHome)
              driveUploads.push(result)
              sse(controller, 'log', { line: result.ok ? `☁️ Drive: ${result.name}${result.link ? ' → ' + result.link : ''}` : `⚠️ Drive upload lỗi (${result.name}): ${result.error}`, jobId })
            }
          }
          sse(controller, 'done', { code: code ?? 1, created, outputDir, jobId, driveUploads })
        }
        close()
      })

      req.signal.addEventListener('abort', () => {
        if (child.exitCode !== null || child.signalCode !== null || !RUNNING.has(jobId)) return
        cancelled = true
        child.kill('SIGTERM')
        RUNNING.delete(jobId)
        close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}

export async function DELETE(req: Request) {
  const url = new URL(req.url)
  const jobId = url.searchParams.get('jobId') || ''
  if (!jobId) return NextResponse.json({ ok: false, error: 'Thiếu jobId' }, { status: 400 })
  const child = RUNNING.get(jobId)
  if (!child) return NextResponse.json({ ok: false, error: 'Job không còn chạy' }, { status: 404 })
  const ok = child.kill('SIGTERM')
  RUNNING.delete(jobId)
  return NextResponse.json({ ok, jobId, status: ok ? 'cancelled' : 'failed_to_cancel' })
}
