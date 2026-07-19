import { spawn } from 'node:child_process'
import http from 'node:http'
import path from 'node:path'
import { once } from 'node:events'

const root = path.resolve(process.cwd())
const engine = path.join(root, 'kientre-engine')
const port = 43219
const flows = {
 topic: ['Intent','Architect','Source/NotebookLM','Judge','VisualCurator','Artist','Student','Reviewer','Word'],
 quiz: ['Intent','Architect','Source/NotebookLM','QuizPlanner','Examiner','Artist','Judge','Reviewer','Word'],
 test: ['Intent','Examiner','Judge','Reviewer','Word'],
 solve: ['Read/Extract','Solver','Judge','Reviewer','Word'],
 review: ['Read/Extract','Reviewer','Judge','Word'],
}
const required = { topic: 'topic', quiz: 'quiz', test: 'exam', solve: 'solve', review: 'review' }
let calls = []

const server = http.createServer(async (req, res) => {
 const chunks = []
 for await (const c of req) chunks.push(c)
 const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
 const messages = Array.isArray(body.messages) ? body.messages : []
 const last = messages.at(-1)
 const tools = body.tools || []
 let msg
 if (last?.role === 'user') {
  calls.push({ phase: 'chat', system: messages[0]?.content || '', tools: tools.map(t => t.function?.name) })
  const run = tools.find(t => t.function?.name === 'run_skill')
  msg = { role: 'assistant', content: 'Dùng flow đã thiết lập.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'run_skill', arguments: JSON.stringify({ skill: process.env.EXPECT_SKILL || 'topic', topic: 'phân số', filePath: '/tmp/missing.docx', special: 'probe' }) } }] }
 } else {
  const finish = tools.find(t => t.function?.name === 'finish')
  msg = { role: 'assistant', content: 'Hoàn tất.', tool_calls: [{ id: 'c2', type: 'function', function: { name: 'finish', arguments: JSON.stringify({ summary: 'probe done' }) } }] }
 }
 res.writeHead(200, { 'content-type': 'application/json' })
 res.end(JSON.stringify({ choices: [{ message: msg }] }))
})
server.listen(port, '127.0.0.1')
await once(server, 'listening')

async function runOne(moduleKey) {
 calls = []
 const payload = { task: moduleKey === 'solve' || moduleKey === 'review' ? 'xử lý file vừa tải' : 'soạn phân số', history: [], sources: [], config: { model: 'fake/model', moduleKey, grade: 'Lớp 5', subject: 'Toán', maxTurns: 2, enabledTools: ['run_skill','finish'], useNotebook: false, skillFlows: [{ name: `/${moduleKey}`, agentFlow: flows[moduleKey] }], quizSpec: { quizCount: 3, totalScore: 10, timeMinutes: 15 } } }
 const child = spawn('node', ['agent/run.mjs'], { cwd: engine, env: { ...process.env, HERMES_ROUTER_URL: `http://127.0.0.1:${port}`, HERMES_FALLBACK_MODELS: '', HERMES_MODEL_RETRIES: '1', EXPECT_SKILL: required[moduleKey], KIENTRE_OUTPUT_DIR: '/tmp', HERMES_WORKSPACE_DIR: '/tmp', HERMES_JUDGE_MODEL: 'fake/model' } })
 child.stdin.end(JSON.stringify(payload))
 let out = '', err = ''
 child.stdout.on('data', c => out += c)
 child.stderr.on('data', c => err += c)
 const [code] = await once(child, 'close')
 const system = calls[0]?.system || ''
 const hasFlow = flows[moduleKey].every(x => system.includes(x))
 const hasForce = system.includes(`skill=\"${required[moduleKey]}\"`) || system.includes(`skill="${required[moduleKey]}"`)
 const sawRunSkill = out.includes('"name":"run_skill"') || out.includes('run_skill')
 const toolList = calls[0]?.tools || []
 return { moduleKey, code, hasFlow, hasForce, sawRunSkill, toolList, err: err.trim(), out: out.trim().split('\n').slice(0,8) }
}

const results = []
for (const m of Object.keys(flows)) results.push(await runOne(m))
server.close()
console.log(JSON.stringify(results, null, 2))
if (results.some(r => !r.hasFlow || !r.hasForce || !r.sawRunSkill || !r.toolList.includes('run_skill'))) process.exit(1)
