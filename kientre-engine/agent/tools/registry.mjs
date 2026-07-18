// Tool registry for the mini-agent loop.
// Each tool: { name, schema (OpenAI function def), handler(args, ctx) -> any }.
// Modules whitelist tools by name via config.enabledTools.

const REGISTRY = new Map()

export function register(name, schema, handler) {
 REGISTRY.set(name, { name, schema, handler })
}

export function has(name) { return REGISTRY.has(name) }

// OpenAI tools[] for a given whitelist of names.
export function getSchemas(names = []) {
 return names
  .filter(n => REGISTRY.has(n))
  .map(n => ({ type: 'function', function: REGISTRY.get(n).schema }))
}

// Run a tool by name. Never throws — returns { ok, result } or { ok:false, error }
// so a tool failure feeds back into the model instead of crashing the loop.
export async function run(name, args, ctx) {
 const tool = REGISTRY.get(name)
 if (!tool) return { ok: false, error: `unknown tool "${name}"` }
 try {
  const result = await tool.handler(args || {}, ctx || {})
  return { ok: true, result }
 } catch (e) {
  return { ok: false, error: String(e?.message || e) }
 }
}

// Guard: resolve p under base, reject path traversal outside base.
import path from 'node:path'
export function safeResolve(base, p) {
 const full = path.resolve(base, p || '')
 const root = path.resolve(base)
 if (full !== root && !full.startsWith(root + path.sep)) {
  throw new Error(`path "${p}" is outside allowed directory`)
 }
 return full
}
