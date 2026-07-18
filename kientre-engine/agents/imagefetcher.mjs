import { writeFile } from 'node:fs/promises'
import { searchWeb } from '../server/websearch.mjs'

const UA = { 'User-Agent': 'HermesEdu/1.0 (education)' }

const BAD_EXT = /\.(pdf|djvu|tif|tiff|svg)\b/i
const BAD_WORDS = /\b(book|cover|quilt|wallflower|prophet|map|diagram|clipart|logo)\b/i

function scoreTitle(title, words) {
 const t = (title || '').toLowerCase()
 let score = words.reduce((s, w) => s + (w.length > 2 && t.includes(w) ? 1 : 0), 0)
 if (BAD_EXT.test(t) || BAD_WORDS.test(t)) score -= 4
 return score
}

function looksRelevant(title, words) {
 const useful = words.filter(w => w.length > 2 && !['real', 'true', 'photo', 'photograph', 'close', 'image', 'illustration', 'worksheet'].includes(w))
 if (!useful.length) return true
 return useful.some(w => String(title || '').toLowerCase().includes(w))
}

async function download(url, dest, title = '', metaExtra = {}) {
 try {
  const img = await fetch(url, { headers: UA, signal: AbortSignal.timeout(12000) })
  const ct = img.headers.get('content-type') || ''
  if (!ct.startsWith('image/')) return false
  const buf = Buffer.from(await img.arrayBuffer())
  if (buf.length < 3000) return false
  await writeFile(dest, buf)
  const meta = { url, title, ...metaExtra, contentType: ct, bytes: buf.length, downloadedAt: new Date().toISOString() }
  await writeFile(`${dest}.json`, JSON.stringify(meta, null, 2))
  return true
 } catch { return false }
}

async function fromWebSearchImages(query, words, dest) {
 try {
  const results = await searchWeb(`${query} image illustration worksheet`, 8)
  for (const r of results) {
   const url = r.image_url || ''
   const title = `${r.title || ''} ${r.snippet || ''}`
   if (!url || !looksRelevant(title, words)) continue
   if (await download(url, dest, r.title || '', { query, pageUrl: r.url, source: r.provider || 'web-search-image' })) return true
  }
 } catch { /* fallthrough */ }
 return false
}

async function fromOpenverse(query, words, dest) {
 try {
  const api = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=12&mature=false`
  const r = await fetch(api, { headers: UA, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return false
  const j = await r.json()
  const ranked = (j.results || [])
   .map(it => ({ it, sc: scoreTitle(it.title, words) }))
   .sort((a, b) => b.sc - a.sc)
  for (const { it, sc } of ranked) {
   if (sc < 0 || !looksRelevant(it.title, words)) continue
   if (await download(it.url || it.thumbnail, dest, it.title || '', { query, source: 'openverse' })) return true
  }
 } catch { /* fallthrough */ }
 return false
}

async function fromWikimedia(query, dest) {
 try {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url&iiurlwidth=1024&format=json&origin=*`
  const r = await fetch(api, { headers: UA, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return false
  const j = await r.json()
  const pages = Object.values(j?.query?.pages || {})
  const ranked = pages.map(pg => ({ pg, sc: scoreTitle(pg.title, String(query).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) }))
   .sort((a, b) => b.sc - a.sc)
  for (const { pg, sc } of ranked) {
   if (sc < 0) continue
   const info = pg.imageinfo?.[0]
   const url = info?.thumburl || info?.url
   if (url && await download(url, dest, pg.title || '', { query, source: 'wikimedia' })) return true
  }
 } catch { /* fallthrough */ }
 return false
}

async function from9RouterImage(prompt, dest) {
 try {
  if (!process.env.KIENTRE_ALLOW_IMAGE_GENERATION) return false
  const base = (process.env.NINEROUTER_URL || process.env.NINE_ROUTER_BASE_URL || process.env.HERMES_ROUTER_URL || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')
  if (!base) return false
  const headers = { 'Content-Type': 'application/json' }
  const key = process.env.NINEROUTER_KEY || process.env.NINE_ROUTER_KEY || ''
  if (key) headers.Authorization = `Bearer ${key}`
  const r = await fetch(`${base}/v1/images/generations?response_format=binary`, {
   method: 'POST', headers, signal: AbortSignal.timeout(60000),
   body: JSON.stringify({ model: process.env.KIENTRE_IMAGE_MODEL || 'gemini/gemini-3-pro-image-preview', prompt, size: '1024x1024' }),
  })
  if (!r.ok || !String(r.headers.get('content-type') || '').startsWith('image/')) return false
  const buf = Buffer.from(await r.arrayBuffer())
  if (buf.length < 3000) return false
  await writeFile(dest, buf)
  await writeFile(`${dest}.json`, JSON.stringify({ prompt, source: '9router-image-generation', bytes: buf.length, downloadedAt: new Date().toISOString() }, null, 2))
  return true
 } catch { return false }
}

/** Tải ảnh minh họa thật, ưu tiên: image_url từ websearch → Openverse → Wikimedia → 9Router image nếu bật rõ. */
export async function fetchImage(query, dest) {
 const words = String(query).toLowerCase().split(/[^a-zà-ỹ0-9]+/).filter(Boolean)
 const short = words.slice(0, 4).join(' ')
 const quoted = short ? `"${short}"` : query
 if (await fromWebSearchImages(query, words, dest)) return true
 if (await fromOpenverse(`${quoted} photograph`, words, dest)) return true
 if (await fromOpenverse(quoted, words, dest)) return true
 if (short && short !== query && await fromOpenverse(`${short} photograph`, words, dest)) return true
 if (await fromWikimedia(short || query, dest)) return true
 if (await fromOpenverse(query, words, dest)) return true
 if (await from9RouterImage(query, dest)) return true
 return false
}
