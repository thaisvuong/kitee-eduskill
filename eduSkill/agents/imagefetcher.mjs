import { writeFile } from 'node:fs/promises'

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
  const useful = words.filter(w => w.length > 2 && !['real', 'true', 'photo', 'photograph', 'close'].includes(w))
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

async function fromOpenverse(query, words, dest) {
  try {
    const api = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=12&mature=false`
    const r = await fetch(api, { headers: UA, signal: AbortSignal.timeout(12000) })
    if (!r.ok) return false
    const j = await r.json()
    // Xếp hạng theo mức khớp tiêu đề với từ khóa -> chọn ảnh SÁT mô tả nhất.
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

/** Tải ảnh minh họa thật, ưu tiên ảnh KHỚP MÔ TẢ. query nên là từ khóa tiếng Anh. */
export async function fetchImage(query, dest) {
  const words = String(query).toLowerCase().split(/[^a-zà-ỹ0-9]+/).filter(Boolean)
  const short = words.slice(0, 4).join(' ')       // truy vấn gọn cho khớp hơn
  const quoted = short ? `"${short}"` : query
  // Ưu tiên truy vấn cụ thể trước; chỉ fallback rộng hơn nếu chưa tải được ảnh.
  if (await fromOpenverse(`${quoted} photograph`, words, dest)) return true
  if (await fromOpenverse(quoted, words, dest)) return true
  if (short && short !== query && await fromOpenverse(`${short} photograph`, words, dest)) return true
  if (await fromWikimedia(short || query, dest)) return true
  if (await fromOpenverse(query, words, dest)) return true
  return false
}
