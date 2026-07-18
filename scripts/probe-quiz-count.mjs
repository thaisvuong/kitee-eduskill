import assert from 'node:assert/strict'
import { normalizeQuizCount, trimQuizPlan } from '../kientre-engine/agents/quizplanner.mjs'

assert.equal(normalizeQuizCount(1), 1)
assert.equal(normalizeQuizCount(5), 5)
assert.equal(normalizeQuizCount(99), 20)

const plan = { globalContext: 'ctx', quizzes: Array.from({ length: 6 }, (_, i) => ({ title: `Quiz ${i + 1}`, index: i + 1, questions: [] })) }
assert.equal(trimQuizPlan(plan, 1).quizzes.length, 1)
assert.equal(trimQuizPlan(plan, 3).quizzes.length, 3)
assert.equal(trimQuizPlan(plan, 0).quizzes.length, 1)

console.log('quiz-count probe ok')
