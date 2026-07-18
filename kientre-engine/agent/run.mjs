#!/usr/bin/env node
// Agent entry point. Reads a JSON payload from stdin:
//   { task, config, sources, history }
// Streams NDJSON events to stdout: {event:'agent_step', ...} per step,
// then {event:'agent_done', createdFiles, finalText}.
// The webapp's /api/run route spawns this and maps events to SSE.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runAgent } from './loop.mjs'

// Run from engine root so relative python script paths resolve (same as slash.mjs).
const here = path.dirname(fileURLToPath(import.meta.url)) // .../kientre-engine/agent
process.chdir(path.resolve(here, '..'))          // .../kientre-engine

function emit(obj) { process.stdout.write(JSON.stringify(obj) + '\n') }

async function readStdin() {
 const chunks = []
 for await (const c of process.stdin) chunks.push(c)
 return Buffer.concat(chunks).toString('utf8')
}

const raw = await readStdin()
let payload = {}
try { payload = JSON.parse(raw || '{}') } catch (e) { emit({ event: 'agent_error', message: 'payload JSON lỗi: ' + e.message }); process.exit(1) }

const { task = '', config = {}, sources = [], history = [] } = payload
if (!task.trim()) { emit({ event: 'agent_error', message: 'thiếu task' }); process.exit(1) }

try {
 const { finalText, createdFiles } = await runAgent({
  task, config, sources, history,
  onStep: (step) => emit({ event: 'agent_step', ...step }),
 })
 emit({ event: 'agent_done', finalText, createdFiles })
} catch (e) {
 emit({ event: 'agent_error', message: e.message })
 process.exit(1)
}
