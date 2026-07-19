import { writeFile } from 'node:fs/promises'
import { extractPageImages, searchWeb } from '../server/websearch.mjs'

const UA = { 'User-Agent': 'HermesEdu/1.0 (education)' }

const BAD_EXT = /\.(pdf|djvu|tif|tiff|svg)\b/i
const BAD_WORDS = /\b(book|cover|quilt|wallflower|prophet|map|diagram|clipart|logo|teacher|avatar|badge|app|download|course)\b/i
const MATH_WORDS = /hình|hinh|chữ nhật|chu nhat|bình hành|binh hanh|tam giác|tam giac|góc|goc|phân giác|phan giac|diện tích|dien tich|chu vi|efgh|abcd/i

function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }

function scoreTitle(title, words) {
 const t = norm(title)
 let score = words.reduce((s, w) => s + (w.length > 2 && t.includes(norm(w)) ? 1 : 0), 0)
 if (MATH_WORDS.test(title)) score += 4
 if (BAD_EXT.test(t) || BAD_WORDS.test(t)) score -= 10
 return score
}

function looksRelevant(title, words) {
 const hay = norm(title)
 if (BAD_WORDS.test(hay) || BAD_EXT.test(hay)) return false
 const useful = words.map(norm).filter(w => w.length > 2 && !['real', 'true', 'photo', 'photograph', 'close', 'image', 'illustration', 'worksheet', 'minh', 'hoa'].includes(w))
 if (!useful.length) return true
 return useful.some(w => hay.includes(w)) || MATH_WORDS.test(title)
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
  const results = await searchWeb(`${query} hình minh họa bài tập`, 8)
  const candidates = []
  for (const r of results) {
   if (r.image_url) candidates.push({ url: r.image_url, title: r.title || '', pageUrl: r.url, source: r.provider || 'web-search-image', sc: scoreTitle(`${r.title} ${r.snippet}`, words) })
   for (const img of r.images || []) candidates.push({ url: img.url, title: img.alt || r.title || '', pageUrl: img.pageUrl || r.url, source: 'source-page-image', sc: Number(img.score || 0) + scoreTitle(`${img.alt} ${img.context}`, words) })
  }
  candidates.sort((a, b) => b.sc - a.sc)
  for (const c of candidates) {
   const title = `${c.title || ''} ${c.pageUrl || ''}`
   if (!c.url || !looksRelevant(title, words)) continue
   if (await download(c.url, dest, c.title || '', { query, pageUrl: c.pageUrl, source: c.source, score: c.sc })) return true
  }
 } catch { /* fallthrough */ }
 return false
}

async function fromExplicitUrls(query, words, dest) {
 const urls = [...String(query).matchAll(/https?:\/\/\S+/gi)].map(m => m[0].replace(/[)\].,;]+$/, ''))
 for (const pageUrl of urls) {
  try {
   const r = await fetch(pageUrl, { headers: UA, signal: AbortSignal.timeout(12000) })
   if (!r.ok) continue
   const images = extractPageImages(await r.text(), pageUrl, query, 8)
   for (const img of images) {
    if (!looksRelevant(`${img.alt} ${img.context} ${img.pageUrl}`, words)) continue
    if (await download(img.url, dest, img.alt || '', { query, pageUrl, source: 'explicit-source-page-image', score: img.score })) return true
   }
  } catch { /* next url */ }
 }
 return false
}

async function fromOpenverse(query, words, dest) {
 try {
  const api = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=12&mature=false`
  const r = await fetch(api, { headers: UA, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return false
  const j = await r.json()
  const ranked = (j.results || [])
   .map(it => ({ it, sc: scoreTitle(`${it.title || ''} ${it.url || ''}`, words) }))
   .sort((a, b) => b.sc - a.sc)
  for (const { it, sc } of ranked) {
   if (sc < 3 || !looksRelevant(`${it.title} ${it.url}`, words)) continue
   if (await download(it.url || it.thumbnail, dest, it.title || '', { query, source: 'openverse', score: sc })) return true
  }
 } catch { /* fallthrough */ }
 return false
}

async function fromWikimedia(query, words, dest) {
 try {
  const api = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=6&prop=imageinfo&iiprop=url&iiurlwidth=1024&format=json&origin=*`
  const r = await fetch(api, { headers: UA, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return false
  const j = await r.json()
  const pages = Object.values(j?.query?.pages || {})
  const ranked = pages.map(pg => ({ pg, sc: scoreTitle(pg.title, words) })).sort((a, b) => b.sc - a.sc)
  for (const { pg, sc } of ranked) {
   if (sc < 3 || !looksRelevant(pg.title, words)) continue
   const info = pg.imageinfo?.[0]
   const url = info?.thumburl || info?.url
   if (url && await download(url, dest, pg.title || '', { query, source: 'wikimedia', score: sc })) return true
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

async function fromPixabay(query, words, dest) {
 try {
  const key = process.env.PIXABAY_API_KEY || ''
  if (!key) return false
  const api = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&per_page=12&safesearch=true&image_type=photo&orientation=horizontal`
  const r = await fetch(api, { headers: UA, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return false
  const j = await r.json()
  const ranked = (j.hits || [])
   .map(h => ({ h, sc: scoreTitle(`${h.tags || ''}`, words) + (h.likes > 10 ? 1 : 0) + (h.webformatWidth > h.webformatHeight ? 1 : 0) }))
   .sort((a, b) => b.sc - a.sc)
  for (const { h, sc } of ranked) {
   if (sc < 2 || !looksRelevant(`${h.tags || ''} ${h.user || ''}`, words)) continue
   const url = h.largeImageURL || h.webformatURL
   if (url && await download(url, dest, h.tags || '', { query, source: 'pixabay', score: sc, pageUrl: h.pageURL })) return true
  }
 } catch { /* fallthrough */ }
 return false
}

async function fromPexels(query, words, dest) {
 try {
  const key = process.env.PEXELS_API_KEY || ''
  if (!key) return false
  const api = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=landscape&size=medium`
  const r = await fetch(api, { headers: { ...UA, Authorization: key }, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return false
  const j = await r.json()
  const ranked = (j.photos || [])
   .map(p => ({ p, sc: scoreTitle(`${p.alt || ''} ${p.photographer || ''}`, words) + (p.width > p.height ? 1 : 0) }))
   .sort((a, b) => b.sc - a.sc)
  for (const { p, sc } of ranked) {
   if (sc < 2 || !looksRelevant(`${p.alt || ''} ${p.photographer || ''} ${p.url || ''}`, words)) continue
   const url = p.src?.large || p.src?.original || p.src?.medium
   if (url && await download(url, dest, p.alt || '', { query, source: 'pexels', score: sc, pageUrl: p.url })) return true
  }
 } catch { /* fallthrough */ }
 return false
}

async function fromGoogleImages(query, words, dest) {
 try {
  const key = process.env.GOOGLE_API_KEY || ''
  const cx = process.env.GOOGLE_CSE_ID || ''
  if (!key || !cx) return false
  const api = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(key)}&cx=${encodeURIComponent(cx)}&q=${encodeURIComponent(query)}&searchType=image&num=8&safe=active&imgSize=medium`
  const r = await fetch(api, { headers: UA, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return false
  const j = await r.json()
  const ranked = (j.items || [])
   .map(it => ({ it, sc: scoreTitle(`${it.title || ''} ${it.snippet || ''}`, words) }))
   .sort((a, b) => b.sc - a.sc)
  for (const { it, sc } of ranked) {
   if (sc < 2 || !looksRelevant(`${it.title || ''} ${it.snippet || ''}`, words)) continue
   const url = it.link
   if (url && await download(url, dest, it.title || '', { query, source: 'google-images', score: sc, pageUrl: it.image?.contextLink })) return true
  }
 } catch { /* fallthrough */ }
 return false
}

/** Tải ảnh minh họa thật: Google → Pexels → ảnh nguồn web → Openverse/Wikimedia → generated. */
export async function fetchImage(query, dest) {
 const words = String(query).toLowerCase().split(/[^a-zà-ỹ0-9]+/).filter(Boolean)
 const short = words.slice(0, 7).join(' ')
 const quoted = short ? `"${short}"` : query
 if (await fromGoogleImages(query, words, dest)) return true
 if (await fromPixabay(short || query, words, dest)) return true
 if (await fromPexels(short || query, words, dest)) return true
 if (await fromExplicitUrls(query, words, dest)) return true
 if (await fromWebSearchImages(query, words, dest)) return true
 if (await fromOpenverse(quoted, words, dest)) return true
 if (short && short !== query && await fromOpenverse(short, words, dest)) return true
 if (await fromWikimedia(short || query, words, dest)) return true
 if (await fromOpenverse(query, words, dest)) return true
 if (await from9RouterImage(`Hình minh họa toán học chính xác, dạng sơ đồ/vector giáo dục, không ảnh người, không ảnh trang trí: ${query}`, dest)) return true
 return false
}
