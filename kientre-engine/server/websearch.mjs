// Web search — 9Router /v1/search, Gemini grounding, DuckDuckGo HTML.
// Also extracts page-local educational images so diagrams come from the source page,
// not random stock photos.

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; KientreAAA education websearch)' }

function decodeHtml(s = '') {
 return String(s)
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/g, '"')
}

function stripTags(html) {
 return decodeHtml(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ').trim()
}

function wordsOf(text) {
 return String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .split(/[^a-z0-9]+/).filter(w => w.length > 2 && !['image', 'illustration', 'worksheet', 'photo', 'png', 'jpg'].includes(w))
}

function attr(tag, name) {
 const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)`, 'i'))
 return m ? decodeHtml(m[1]) : ''
}

const BAD_IMAGE = /\/((logo|icon|badge|teacher|google|apple|loading|support|avatar|book|exam|doc|qa|gbt|kh)\b|git\/images|images\/loading)/i
const GOOD_EDU = /hướng dẫn|huong dan|ví dụ|vi du|chứng minh|chung minh|hình bình hành|hinh binh hanh|hình chữ nhật|hinh chu nhat|efgh|abcd|tam giác|tam giac|phân giác|phan giac|diện tích|dien tich|chu vi/i

function imageScore(img, words) {
 const hay = `${img.url} ${img.alt} ${img.context}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
 let score = 0
 for (const w of words) if (hay.includes(w)) score += 2
 if (GOOD_EDU.test(img.context)) score += 6
 if (/vietjack\.com\/cong-thuc\/images\//i.test(img.url)) score += 5
 if (img.inline) score -= 8
 if (/hướng dẫn|huong dan/i.test(img.context) && !img.inline) score += 8
 if (/\.(png|jpe?g|webp)(\?|$)/i.test(img.url)) score += 1
 if (BAD_IMAGE.test(img.url) || BAD_IMAGE.test(img.alt)) score -= 20
 if (/base64|1x1|spacer|pixel/i.test(img.url)) score -= 20
 return score
}

export function extractPageImages(html, pageUrl, query = '', limit = 8) {
 const words = wordsOf(query)
 const out = []
 for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
  const tag = m[0]
  const raw = attr(tag, 'data-src') || attr(tag, 'src')
  if (!raw || /^data:/i.test(raw)) continue
  let url = ''
  try { url = new URL(raw, pageUrl).toString() } catch { continue }
  const context = stripTags(html.slice(Math.max(0, m.index - 180), Math.min(html.length, m.index + tag.length + 220)))
  const style = attr(tag, 'style')
  const img = { url, alt: attr(tag, 'alt'), context, pageUrl, inline: /display\s*:\s*inline/i.test(style) }
  const score = imageScore(img, words)
  if (score < 0) continue
  out.push({ ...img, score })
 }
 return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

async function pageImages(pageUrl, query, limit = 5) {
 try {
  const r = await fetch(pageUrl, { headers: UA, signal: AbortSignal.timeout(12000) })
  if (!r.ok || !String(r.headers.get('content-type') || '').includes('text/html')) return []
  return extractPageImages(await r.text(), pageUrl, query, limit)
 } catch { return [] }
}

async function attachImages(results, query) {
 const top = results.slice(0, 4)
 await Promise.all(top.map(async r => { r.images = await pageImages(r.url, query, 4); r.image_url = r.image_url || r.images?.[0]?.url || '' }))
 return results
}

/** Tìm kiếm web -> [{title, url, snippet, image_url, images[]}] */
export async function searchWeb(query, n = 6) {
 const nr = await search9Router(query, n).catch(() => [])
 if (nr.length) return attachImages(nr, query)
 const gem = await searchGeminiGrounding(query, n).catch(() => [])
 if (gem.length) return attachImages(gem, query)
 try {
  const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query),
   { headers: UA, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return []
  const html = await r.text()
  const out = []
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(html)) && out.length < n) {
   let url = m[1]
   const q = url.match(/uddg=([^&]+)/); if (q) url = decodeURIComponent(q[1])
   out.push({ url, title: stripTags(m[2]) })
  }
  const snips = [...html.matchAll(/result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map(x => stripTags(x[1]))
  out.forEach((o, i) => { o.snippet = snips[i] || '' })
  return attachImages(out, query)
 } catch { return [] }
}

async function search9Router(query, n = 6) {
 const base = (process.env.NINEROUTER_URL || process.env.NINE_ROUTER_BASE_URL || process.env.HERMES_ROUTER_URL || '').replace(/\/v1\/?$/, '').replace(/\/$/, '')
 if (!base) return []
 const headers = { 'Content-Type': 'application/json' }
 const key = process.env.NINEROUTER_KEY || process.env.NINE_ROUTER_KEY || ''
 if (key) headers.Authorization = `Bearer ${key}`
 const r = await fetch(`${base}/v1/search`, {
  method: 'POST', headers, signal: AbortSignal.timeout(15000),
  body: JSON.stringify({ model: process.env.KIENTRE_WEB_SEARCH_MODEL || 'search-combo', query, max_results: n }),
 })
 if (!r.ok) return []
 const j = await r.json().catch(() => ({}))
 return (j.results || []).slice(0, n).map((x, i) => ({
  title: x.title || x.url || `Nguồn ${i + 1}`,
  url: x.url || '',
  snippet: x.snippet || x.content || '',
  image_url: x.metadata?.image_url || x.image_url || '',
  provider: j.provider || '9router',
 })).filter(x => x.url || x.snippet)
}

async function searchGeminiGrounding(query, n = 6) {
 const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
 if (!key) return []
 const model = process.env.KIENTRE_GEMINI_SEARCH_MODEL || 'gemini-2.5-flash'
 const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
  body: JSON.stringify({
   contents: [{ parts: [{ text: `Tìm ${n} nguồn web tiếng Việt đáng tin cậy cho: ${query}. Trả lời ngắn, ưu tiên trang có hình minh họa/bài tập thật.` }] }],
   tools: [{ google_search: {} }],
  }),
 })
 if (!r.ok) return []
 const j = await r.json().catch(() => ({}))
 const chunks = j.candidates?.[0]?.groundingMetadata?.groundingChunks || []
 const text = j.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || ''
 return chunks.map((c, i) => ({
  title: c.web?.title || `Nguồn ${i + 1}`,
  url: c.web?.uri || '',
  snippet: text.slice(0, 350),
  provider: 'gemini-grounding',
 })).filter(x => x.url).slice(0, n)
}

/** Lấy NGUỒN BÀI TẬP thật từ web cho một chủ đề — trả về text + ảnh nguồn. */
export async function fetchExerciseSources(topic, grade, maxChars = 5000) {
 const results = await searchWeb(`bài tập ${topic} ${grade} có lời giải`, 6)
 if (!results.length) return { refs: '', sources: [], images: [] }
 let refs = ''
 const sources = []
 const images = []
 for (const res of results.slice(0, 3)) {
  sources.push(res.url)
  for (const img of res.images || []) images.push(img)
  refs += `\n【Nguồn: ${res.title}】\n${res.snippet}\n`
  try {
   const pg = await fetch(res.url, { headers: UA, signal: AbortSignal.timeout(10000) })
   if (pg.ok) {
    const body = stripTags(await pg.text())
    refs += body.slice(0, 2200) + '\n'
   }
  } catch { /* bỏ qua trang lỗi */ }
  if (refs.length > maxChars) break
 }
 return { refs: refs.slice(0, maxChars), sources, images: images.slice(0, 12) }
}
