// Web search (DuckDuckGo HTML) — lấy bài tập/nguồn thật trên mạng để Agent bám theo.

function stripTags(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim()
}

/** Tìm kiếm web -> [{title, url, snippet}] */
export async function searchWeb(query, n = 6) {
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
      const q = url.match(/uddg=([^&]+)/); if (q) url = decodeURIComponent(q[1])   // gỡ redirect DDG
      out.push({ url, title: stripTags(m[2]) })
    }
    // Ghép snippet theo thứ tự
    const snips = [...html.matchAll(/result__snippet"[^>]*>([\s\S]*?)<\/a>/g)].map(x => stripTags(x[1]))
    out.forEach((o, i) => { o.snippet = snips[i] || '' })
    return out
  } catch { return [] }
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
