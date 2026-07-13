import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const execFileAsync = promisify(execFile)
const ROOT = path.resolve(process.env.KITEE_APP_ROOT || process.cwd())

async function run(cmd: string, args: string[] = []) {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    cwd: ROOT,
    env: { ...process.env },
    timeout: 10 * 60_000,
    maxBuffer: 1024 * 1024 * 4,
  })
  return [stdout, stderr].filter(Boolean).join('\n').trim()
}

async function git(args: string[]) { return run('git', args) }

export async function GET() {
  try {
    await git(['fetch', 'origin', 'main'])
    const local = (await git(['rev-parse', '--short', 'HEAD'])).trim()
    const remote = (await git(['rev-parse', '--short', 'origin/main'])).trim()
    const branch = (await git(['branch', '--show-current'])).trim()
    const status = await git(['status', '--short'])
    return NextResponse.json({ ok: true, root: ROOT, branch, local, remote, behind: local !== remote, dirty: Boolean(status.trim()), status })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Không kiểm tra được update' }, { status: 500 })
  }
}

export async function POST() {
  const logs: string[] = []
  try {
    logs.push('==> git fetch origin main')
    logs.push(await git(['fetch', 'origin', 'main']))

    const status = await git(['status', '--short'])
    if (status.trim()) {
      return NextResponse.json({ ok: false, error: 'Local đang có thay đổi chưa commit. Không tự pull để tránh mất code.', logs, status })
    }

    logs.push('==> git pull --ff-only origin main')
    logs.push(await git(['pull', '--ff-only', 'origin', 'main']))

    logs.push('==> npm install')
    logs.push(await run('npm', ['install']))

    logs.push('==> npm run build')
    logs.push(await run('npm', ['run', 'build']))

    const local = (await git(['rev-parse', '--short', 'HEAD'])).trim()
    return NextResponse.json({ ok: true, root: ROOT, local, restartRequired: true, logs: logs.filter(Boolean) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Cập nhật thất bại', logs }, { status: 500 })
  }
}
