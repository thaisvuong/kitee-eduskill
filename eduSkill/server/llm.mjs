const ROUTER = process.env.HERMES_ROUTER_URL ?? 'http://127.0.0.1:20128'

const DEFAULT_RELIABLE = [
  'gc/gemini-2.5-flash',
  'gc/gemini-2.5-pro',
  'gc/gemini-3.1-flash-lite-preview',
  'cx/gpt-5.5',
  'cx/gpt-5.4',
  'cc/claude-opus-4-8',
  'cc/claude-3.5-sonnet',
  'openrouter/openrouter/free',
]

const RELIABLE = (process.env.HERMES_FALLBACK_MODELS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const FALLBACK_CHAIN = RELIABLE.length ? RELIABLE : DEFAULT_RELIABLE
const PER_MODEL_RETRIES = Number(process.env.HERMES_MODEL_RETRIES || 2)
const RETRY_DELAY_MS = Number(process.env.HERMES_MODEL_RETRY_DELAY_MS || 1200)

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function cleanJSON(raw) {
  let s = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const start = s.search(/[{[]/)
  const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'))
  if (start >= 0 && end > start) s = s.slice(start, end + 1)

  let out = ''
  let inStr = false
  let esc = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (esc) { out += ch; esc = false; continue }
    if (ch === '\\') {
      if (inStr) {
        const nx = s[i + 1]
        if (nx === '"' || nx === '\\' || nx === '/') { out += ch; esc = true; continue }
        if ('bfnrtu'.includes(nx) && !/[a-zA-Z]/.test(s[i + 2] || '')) { out += ch; esc = true; continue }
        out += '\\\\'; continue
      }
      out += ch; esc = true; continue
    }
    if (ch === '"') { inStr = !inStr; out += ch; continue }
    if (inStr && ch.charCodeAt(0) < 0x20) {
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ' '
      continue
    }
    out += ch
  }
  return out
}

async function callOnce(model, system, user, temperature = 0.5) {
  const res = await fetch(`${ROUTER}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      temperature,
      stream: false,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
  if (!data.choices || !data.choices[0]) throw new Error(data.error?.message || 'Invalid API response')
  return data.choices[0].message.content.trim()
}

function isRetryable(err) {
  const m = String(err?.message || '').toLowerCase()
  return m.includes('fetch failed') || m.includes('timeout') || m.includes('429') || m.includes('quota') || m.includes('rate limit') || m.includes('503') || m.includes('502') || m.includes('connection')
}

async function callWithRetries(model, system, user, temperature) {
  let lastErr
  for (let attempt = 1; attempt <= PER_MODEL_RETRIES; attempt++) {
    try {
      return await callOnce(model, system, user, temperature)
    } catch (err) {
      lastErr = err
      if (attempt >= PER_MODEL_RETRIES || !isRetryable(err)) break
      console.warn(`⚠️ Model ${model} failed attempt ${attempt}/${PER_MODEL_RETRIES}: ${err.message}. Retry sau ${RETRY_DELAY_MS}ms...`)
      await delay(RETRY_DELAY_MS)
    }
  }
  throw lastErr
}

export async function callModel(model, system, user, temperature = 0.5) {
  const chain = [model, ...FALLBACK_CHAIN.filter(m => m !== model)]
  let lastErr
  for (const m of chain) {
    try {
      return await callWithRetries(m, system, user, temperature)
    } catch (err) {
      lastErr = err
      console.warn(`⚠️ Model ${m} failed: ${err.message}. Chuyển model...`)
    }
  }
  throw lastErr
}

export async function chatJSON(opts) {
  const raw = await callModel(opts.model, opts.system, opts.user, opts.temperature)
  try {
    return JSON.parse(cleanJSON(raw))
  } catch (err) {
    console.error('Failed to parse JSON. Raw content:', raw)
    throw err
  }
}
