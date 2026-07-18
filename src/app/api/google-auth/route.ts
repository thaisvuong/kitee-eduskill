import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { kientreConfig } from '@/lib/config/kientre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Web app stores one fresh Google OAuth JSON uploaded by user. Never returns raw JSON.
const CREDENTIAL_FILE = kientreConfig.googleCredentialFile
const PENDING_FILE = path.join(kientreConfig.hermesHome, 'google_oauth_pending_web.json')
const SCOPES = [
 'https://www.googleapis.com/auth/drive.file',
 'https://www.googleapis.com/auth/drive.metadata.readonly',
]
const REDIRECT_URI = 'http://localhost:1'

function pickPython(): string {
 return process.env.HERMES_PYTHON
  || '/Library/Frameworks/Python.framework/Versions/3.12/bin/python3'
}

function b64url(buf: Buffer) {
 return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function clientFrom(d: any) {
 const client = (d?.installed || d?.web || {})
 return {
  client_id: d?.client_id || client.client_id || '',
  client_secret: d?.client_secret || client.client_secret || '',
  token_uri: d?.token_uri || client.token_uri || 'https://oauth2.googleapis.com/token',
  auth_uri: d?.auth_uri || client.auth_uri || 'https://accounts.google.com/o/oauth2/v2/auth',
 }
}

async function readCredential() {
 const raw = await fs.readFile(CREDENTIAL_FILE, 'utf8')
 return JSON.parse(raw)
}

async function tokenStatus() {
 try {
  const d = await readCredential()
  const acct = d.account || d.email || ''
  const masked = acct ? acct.replace(/^(.).*(@.*)$/, '$1•••$2') : ''
  return {
   present: true,
   account: masked,
   hasClient: Boolean(d.installed || d.web || d.client_id),
   hasRefresh: Boolean(d.refresh_token),
   hasAccess: Boolean(d.token || d.access_token),
   expiry: d.expiry || null,
   credentialFile: CREDENTIAL_FILE,
  }
 } catch {
  return { present: false, account: '', hasClient: false, hasRefresh: false, hasAccess: false, expiry: null, credentialFile: CREDENTIAL_FILE }
 }
}

export async function GET() {
 return NextResponse.json({ ok: true, ...(await tokenStatus()) })
}

async function createAuthUrl() {
 const d = await readCredential()
 const client = clientFrom(d)
 if (!client.client_id) throw new Error('OAuth JSON thiếu client_id')
 const verifier = b64url(crypto.randomBytes(64))
 const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
 const state = b64url(crypto.randomBytes(16))
 await fs.mkdir(path.dirname(PENDING_FILE), { recursive: true })
 await fs.writeFile(PENDING_FILE, JSON.stringify({ verifier, state, createdAt: Date.now() }), 'utf8')
 const u = new URL(client.auth_uri)
 u.searchParams.set('client_id', client.client_id)
 u.searchParams.set('redirect_uri', REDIRECT_URI)
 u.searchParams.set('response_type', 'code')
 u.searchParams.set('scope', SCOPES.join(' '))
 u.searchParams.set('access_type', 'offline')
 u.searchParams.set('prompt', 'consent')
 u.searchParams.set('code_challenge', challenge)
 u.searchParams.set('code_challenge_method', 'S256')
 u.searchParams.set('state', state)
 return u.toString()
}

async function exchangeAuthCode(input: string) {
 const d = await readCredential()
 const client = clientFrom(d)
 const pending = JSON.parse(await fs.readFile(PENDING_FILE, 'utf8'))
 let code = input.trim()
 try {
  const u = new URL(code)
  if (u.searchParams.get('state') && u.searchParams.get('state') !== pending.state) throw new Error('OAuth state không khớp')
  code = u.searchParams.get('code') || code
 } catch (e: any) {
  if (String(e?.message || '').includes('state')) throw e
 }
 if (!code) throw new Error('Thiếu authorization code')
 const body = new URLSearchParams({
  client_id: client.client_id,
  client_secret: client.client_secret,
  code,
  code_verifier: pending.verifier,
  grant_type: 'authorization_code',
  redirect_uri: REDIRECT_URI,
 })
 const res = await fetch(client.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
 const token = await res.json().catch(() => ({}))
 if (!res.ok) throw new Error(token.error_description || token.error || `OAuth exchange HTTP ${res.status}`)
 const now = Date.now()
 const merged = {
  ...d,
  ...client,
  token: token.access_token,
  access_token: token.access_token,
  refresh_token: token.refresh_token || d.refresh_token,
  token_uri: client.token_uri,
  scopes: token.scope || SCOPES.join(' '),
  expiry: token.expires_in ? new Date(now + Number(token.expires_in) * 1000).toISOString() : d.expiry,
 }
 if (!merged.refresh_token) throw new Error('Google chưa trả refresh_token. Bấm tạo link lại, chọn consent, rồi dán URL mới nhất.')
 await fs.writeFile(CREDENTIAL_FILE, JSON.stringify(merged), 'utf8')
 await fs.rm(PENDING_FILE, { force: true }).catch(() => {})
 return merged
}

// POST { token } -> save OAuth client/token JSON
// POST { action:'auth-url' } -> create consent URL
// POST { action:'auth-code', code } -> exchange redirect URL/code into refresh_token
// POST { action:'verify' } -> live-check Drive access
export async function POST(req: Request) {
 const body = await req.json().catch(() => ({})) as any

 if (body.action === 'auth-url') {
  try { return NextResponse.json({ ok: true, authUrl: await createAuthUrl(), redirectUri: REDIRECT_URI }) }
  catch (e: any) { return NextResponse.json({ ok: false, error: e?.message || 'Không tạo được auth URL' }, { status: 400 }) }
 }

 if (body.action === 'auth-code') {
  try {
   await exchangeAuthCode(String(body.code || body.url || ''))
   return NextResponse.json({ ok: true, ...(await tokenStatus()) })
  } catch (e: any) {
   return NextResponse.json({ ok: false, error: e?.message || 'Không đổi được OAuth code' }, { status: 400 })
  }
 }

 if (body.action === 'verify') {
  const py = pickPython()
  const code = `
import json,ssl,urllib.request,urllib.parse
try:
    import certifi; ctx=ssl.create_default_context(cafile=certifi.where())
except Exception: ctx=ssl.create_default_context()
d=json.load(open(${JSON.stringify(CREDENTIAL_FILE)}))
client=(d.get('installed') or d.get('web') or {}) if isinstance(d,dict) else {}
client_id=d.get('client_id') or client.get('client_id')
client_secret=d.get('client_secret') or client.get('client_secret')
token_uri=d.get('token_uri') or client.get('token_uri') or 'https://oauth2.googleapis.com/token'
tok=d.get('token') or d.get('access_token')
if not tok and d.get('refresh_token'):
    body=urllib.parse.urlencode({'client_id':client_id,'client_secret':client_secret,'refresh_token':d['refresh_token'],'grant_type':'refresh_token'}).encode()
    r=urllib.request.Request(token_uri,data=body,method='POST',headers={'Content-Type':'application/x-www-form-urlencoded'})
    tok=json.loads(urllib.request.urlopen(r,context=ctx,timeout=60).read()).get('access_token')
if not tok:
    raise SystemExit('JSON này mới là OAuth client, chưa cấp quyền. Bấm Tạo link cấp quyền, đăng nhập Google, rồi dán URL redirect về app.')
req=urllib.request.Request('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)',headers={'Authorization':'Bearer '+tok})
res=json.loads(urllib.request.urlopen(req,context=ctx,timeout=60).read())
print(json.dumps({'ok':True,'email':res.get('user',{}).get('emailAddress','')}))
`
  const out = await new Promise<{ ok: boolean; email?: string; error?: string }>(resolve => {
   const ch = spawn(py, ['-c', code])
   let so = '', se = ''
   ch.stdout.on('data', d => so += d)
   ch.stderr.on('data', d => se += d)
   ch.on('error', e => resolve({ ok: false, error: e.message }))
   ch.on('close', c => {
    if (c !== 0) return resolve({ ok: false, error: (se.trim() || 'exit ' + c).slice(0, 300) })
    try { resolve(JSON.parse(so)) } catch { resolve({ ok: false, error: 'parse' }) }
   })
  })
  if (out.ok && out.email) {
   const d = await readCredential().catch(() => ({}))
   d.account = out.email
   await fs.writeFile(CREDENTIAL_FILE, JSON.stringify(d), 'utf8').catch(() => {})
   const masked = out.email.replace(/^(.).*(@.*)$/, '$1•••$2')
   return NextResponse.json({ ok: true, verified: true, account: masked })
  }
  return NextResponse.json({ ok: false, verified: false, error: out.error || 'Drive không truy cập được' }, { status: 400 })
 }

 let obj: any = body.token
 if (typeof obj === 'string') {
  try { obj = JSON.parse(obj) } catch { return NextResponse.json({ ok: false, error: 'JSON không hợp lệ' }, { status: 400 }) }
 }
 if (!obj || typeof obj !== 'object') return NextResponse.json({ ok: false, error: 'Thiếu nội dung credential' }, { status: 400 })
 if (!(obj.refresh_token || obj.token || obj.access_token || obj.installed || obj.web || obj.client_id)) {
  return NextResponse.json({ ok: false, error: 'JSON thiếu refresh_token/token hoặc OAuth client installed/web' }, { status: 400 })
 }
 await fs.mkdir(path.dirname(CREDENTIAL_FILE), { recursive: true })
 await fs.writeFile(CREDENTIAL_FILE, JSON.stringify(obj), 'utf8')
 return NextResponse.json({ ok: true, ...(await tokenStatus()) })
}
