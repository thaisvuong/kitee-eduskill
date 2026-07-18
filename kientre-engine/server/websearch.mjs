// Web search — ưu tiên 9Router /v1/search, fallback DuckDuckGo HTML.

function stripTags(html) {
 return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/\s+/g, ' ').trim()
}

/** Tìm kiếm web -> [{title, url, snippet}] */
export async function searchWeb(query, n = 6) {
 const nr = await search9Router(query, n).catch(() => [])
 if (nr.length) return nr
 try {
  const r = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query),
   { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh)' }, signal: AbortSignal.timeout(12000) })
  if (!r.ok) return []
  const html = await r.text()
  const out = []
  const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m
  while ((m = re.exec(html)) && out.length < n) {
   let url = m[1]
   const q = url.match(/uddg=([^&]+)/); if (q) url = decodeURIComponent(q[1])  // gỡ redirect DDG
   out.push({ url, title: stripTags(m[2]) })
  }
  // Ghép snippet theo thứ tự
  const snips = [...html.matchAll(/result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map(x => stripTags(x[1]))
  out.forEach((o, i) => { o.snippet = snips[i] || '' })
  return out
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

/** Lấy NGUỒN BÀI TẬP thật từ web cho một chủ đề — trả về đoạn text tham khảo (đã gộp, cắt gọn). */
export async function fetchExerciseSources(topic, grade, maxChars = 5000) {
 const results = await searchWeb(`bài tập ${topic} ${grade} có lời giải`, 6)
 if (!results.length) return { refs: '', sources: [] }
 let refs = ''
 const sources = []
 for (const res of results.slice(0, 3)) {
  sources.push(res.url)
  refs += `\n【Nguồn: ${res.title}】\n${res.snippet}\n`
  try {
   const pg = await fetch(res.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) })
   if (pg.ok) {
    const body = stripTags(await pg.text())
    refs += body.slice(0, 2200) + '\n'
   }
  } catch { /* bỏ qua trang lỗi */ }
  if (refs.length > maxChars) break
 }
 return { refs: refs.slice(0, maxChars), sources }
}
