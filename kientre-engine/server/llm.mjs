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

// ---- Direct providers -----------------------------------------------------
// Any model id prefixed with `<provider>/…` is sent straight to that provider's
// OpenAI-compatible endpoint using the API key from env, instead of 9router.
// No prefix (or an unknown one) → falls back to the local 9router as before.
// Env keys are injected by the webapp from user-entered settings.
const PROVIDERS = {
 gemini: {
  base: 'https://generativelanguage.googleapis.com/v1beta/openai',
  key: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
 },
 deepseek: {
  base: 'https://api.deepseek.com',
  key: () => process.env.DEEPSEEK_API_KEY || '',
 },
 glm: {
  base: 'https://open.bigmodel.cn/api/paas/v4',
  key: () => process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY || '',
 },
 openrouter: {
  base: 'https://openrouter.ai/api/v1',
  key: () => process.env.OPENROUTER_API_KEY || '',
 },
}

// Split "gemini/gemini-2.5-flash" → { provider, base, key, model }.
// Returns null for anything routed through 9router.
function resolveTarget(modelId) {
 const idx = String(modelId).indexOf('/')
 if (idx <= 0) return null
 const prefix = modelId.slice(0, idx).toLowerCase()
 const rest = modelId.slice(idx + 1)
 const p = PROVIDERS[prefix]
 if (!p) return null
 const key = p.key()
 if (!key) return { missingKey: prefix }
 return { provider: prefix, base: p.base.replace(/\/$/, ''), key, model: rest }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }

function routeLabel(target) {
 return target ? `${target.provider}:${target.base}` : `9router:${ROUTER}`
}

function normalizeModelId(id) {
 return String(id || '').trim().replace(/^(gc|cx|cc|openrouter|gemini|deepseek|glm)\//i, '')
}

function sameModel(requested, responded) {
 const a = normalizeModelId(requested)
 const b = normalizeModelId(responded)
 return !!a && !!b && a === b
}

function logModel(kind, meta = {}) {
 const bits = Object.entries(meta)
  .filter(([, v]) => v !== undefined && v !== null && v !== '')
  .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
 console.error(`[model:${kind}] ${bits.join(' ')}`)
}

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
 const target = resolveTarget(model)
 if (target?.missingKey) {
  throw new Error(`missing API key for provider "${target.missingKey}" (set it in Settings)`)
 }
 const endpoint = target ? `${target.base}/chat/completions` : `${ROUTER}/v1/chat/completions`
 const sendModel = target ? target.model : model
 logModel('request', { requested: model, sent: sendModel, route: routeLabel(target), mode: 'text' })
 const headers = { 'Content-Type': 'application/json' }
 if (target) headers['Authorization'] = `Bearer ${target.key}`

 const res = await fetch(endpoint, {
  method: 'POST',
  headers,
  body: JSON.stringify({
   model: sendModel,
   messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
   temperature,
   stream: false,
  }),
 })
 const data = await res.json().catch(() => ({}))
 if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
 if (!data.choices || !data.choices[0]) throw new Error(data.error?.message || 'Invalid API response')
 const respondedModel = data.model || sendModel
 logModel('response', { requested: model, sent: sendModel, responded: respondedModel, route: routeLabel(target), mode: 'text' })
 if (!target && !sameModel(sendModel, respondedModel)) throw new Error(`router model mismatch: requested ${sendModel} but responded ${respondedModel}`)
 return data.choices[0].message.content.trim()
}

function isRetryable(err) {
 const m = String(err?.message || '').toLowerCase()
 if (m.includes('missing api key')) return false
 return m.includes('fetch failed') || m.includes('timeout') || m.includes('429') || m.includes('quota') || m.includes('rate limit') || m.includes('503') || m.includes('502') || m.includes('connection')
}

async function callWithRetries(model, system, user, temperature) {
 let lastErr
 for (let attempt = 1; attempt <= PER_MODEL_RETRIES; attempt++) {
  try {
   logModel('attempt', { requested: model, attempt, maxAttempts: PER_MODEL_RETRIES, mode: 'text' })
   return await callOnce(model, system, user, temperature)
  } catch (err) {
   lastErr = err
   logModel('failure', { requested: model, attempt, maxAttempts: PER_MODEL_RETRIES, retryable: isRetryable(err), error: err?.message || String(err), mode: 'text' })
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
 logModel('chain', { primary: model, fallbacks: chain.slice(1), mode: 'text' })
 for (const m of chain) {
  try {
   if (m !== model) logModel('fallback', { primary: model, fallbackTo: m, reason: lastErr?.message || 'unknown', mode: 'text' })
   return await callWithRetries(m, system, user, temperature)
  } catch (err) {
   lastErr = err
   if (!isRetryable(err)) throw err
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

// ---- Agent chat (tool-calling) --------------------------------------------
// Full-message chat used by the agent loop. Unlike callModel (string in/out),
// this takes an OpenAI-style messages[] and optional tools[], and returns the
// raw assistant `message` object (so tool_calls survive). Routes to a direct
// provider or 9router with the same prefix logic as callOnce.
async function chatOnce(model, messages, tools, temperature = 0.4) {
 const target = resolveTarget(model)
 if (target?.missingKey) throw new Error(`missing API key for provider "${target.missingKey}" (set it in Settings)`)
 const endpoint = target ? `${target.base}/chat/completions` : `${ROUTER}/v1/chat/completions`
 const sendModel = target ? target.model : model
 logModel('request', { requested: model, sent: sendModel, route: routeLabel(target), mode: 'chat', tools: Array.isArray(tools) ? tools.map(t => t.function?.name).filter(Boolean) : [] })
 const headers = { 'Content-Type': 'application/json' }
 if (target) headers['Authorization'] = `Bearer ${target.key}`

 const body = { model: sendModel, messages, temperature, stream: false }
 if (tools && tools.length) { body.tools = tools; body.tool_choice = 'auto' }

 const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) })
 const data = await res.json().catch(() => ({}))
 if (!res.ok) throw new Error(data.error?.message || `HTTP ${res.status}`)
 const msg = data?.choices?.[0]?.message
 if (!msg) throw new Error(data.error?.message || 'Invalid API response (no message)')
 const respondedModel = data.model || sendModel
 logModel('response', { requested: model, sent: sendModel, responded: respondedModel, route: routeLabel(target), mode: 'chat', finishReason: data?.choices?.[0]?.finish_reason || '' })
 if (!target && !sameModel(sendModel, respondedModel)) throw new Error(`router model mismatch: requested ${sendModel} but responded ${respondedModel}`)
 return msg
}

// callChat with the same model-fallback chain as callModel.
export async function callChat({ model, messages, tools, temperature = 0.4 }) {
 const chain = [model, ...FALLBACK_CHAIN.filter(m => m !== model)]
 let lastErr
 logModel('chain', { primary: model, fallbacks: chain.slice(1), mode: 'chat' })
 for (const m of chain) {
  for (let attempt = 1; attempt <= PER_MODEL_RETRIES; attempt++) {
   try {
    logModel('attempt', { requested: m, primary: model, attempt, maxAttempts: PER_MODEL_RETRIES, mode: 'chat' })
    return await chatOnce(m, messages, tools, temperature)
   } catch (err) {
    lastErr = err
    logModel('failure', { requested: m, primary: model, attempt, maxAttempts: PER_MODEL_RETRIES, retryable: isRetryable(err), error: err?.message || String(err), mode: 'chat' })
    if (attempt >= PER_MODEL_RETRIES || !isRetryable(err)) break
    await delay(RETRY_DELAY_MS)
   }
  }
  if (!isRetryable(lastErr)) throw lastErr
  if (m !== model) logModel('fallback', { primary: model, fallbackTo: m, reason: lastErr?.message || 'unknown', mode: 'chat' })
  console.warn(`⚠️ callChat model ${m} failed: ${lastErr?.message}. Chuyển model...`)
 }
 throw lastErr
}
