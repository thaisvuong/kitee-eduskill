import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeQuizCount, trimQuizPlan } from '../kientre-engine/agents/quizplanner.mjs'

assert.equal(normalizeQuizCount(1), 1)
assert.equal(normalizeQuizCount(5), 5)
assert.equal(normalizeQuizCount(99), 20)

const plan = { globalContext: 'ctx', quizzes: Array.from({ length: 6 }, (_, i) => ({ title: `Quiz ${i + 1}`, index: i + 1, questions: [] })) }
assert.equal(trimQuizPlan(plan, 1).quizzes.length, 1)
assert.equal(trimQuizPlan(plan, 3).quizzes.length, 3)
assert.equal(trimQuizPlan(plan, 0).quizzes.length, 1)

const runners = await readFile(new URL('../kientre-engine/runners.mjs', import.meta.url), 'utf8')
assert.match(runners, /trimQuizPlan\(await planQuizSet\([^\n]+quizCount: count/)
assert.match(runners, /return \{ \.\.\.question, \.\.\.parsed,[^\n]+frameMd: raw\.slice\(0, 12000\)/)
assert.match(runners, /const frameMd = renderQuizFrameMarkdown\(\{ topic, grade, subject, totalScore, timeMinutes, plan \}\)/)
assert.match(runners, /split\('·'\)/)

const examiner = await readFile(new URL('../kientre-engine/agents/examiner.mjs', import.meta.url), 'utf8')
assert.match(examiner, /Nội dung khung\.md liên quan/)
assert.match(examiner, /Phải triển khai đúng dòng khung\.md/)
assert.match(examiner, /if \(reference\) try/)

const agentRoute = await readFile(new URL('../src/app/api/agent/route.ts', import.meta.url), 'utf8')
assert.match(agentRoute, /KIENTRE_QUIZ_STREAM_GDOC: settings\.uploadDrive \? '1'/)
assert.match(agentRoute, /normalizeDriveFolderId/)

const uploader = await readFile(new URL('../kientre-engine/scripts/kientre_drive_upload.py', import.meta.url), 'utf8')
assert.match(uploader, /force_slim=False/)
assert.match(uploader, /if args\.delete_local and gdoc/)

console.log('quiz-count probe ok')
