#!/usr/bin/env node
// Bộ điều phối lệnh: node Sub-Hermes/cli.mjs <compose|solve|review> <arg> [lớp] [môn]
import { composeDocument } from './orchestrator.mjs'
import { runSolve, runReview, runExam } from './runners.mjs'

const mode = process.argv[2]
const arg = process.argv[3]
const grade = process.argv[4] || 'Lớp 4'
const subject = process.argv[5] || 'Toán'
const depth = process.argv[6] || 'detailed'     // 'summary' | 'detailed'
const special = process.argv[7] || ''
const notebook = process.argv[8] || ''        // NotebookLM notebook id (tùy chọn)

try {
 if (mode === 'compose') await composeDocument(arg, grade, subject, { depth, special, notebook })
 else if (mode === 'solve') await runSolve(arg, grade, subject)
 else if (mode === 'review') await runReview(arg, grade, subject)
 else if (mode === 'exam') await runExam(JSON.parse(arg || '{}'))
 else { console.error('Chế độ không hợp lệ:', mode); process.exit(2) }
} catch (err) {
 console.error('❌ Lỗi:', err.message)
 process.exit(1)
}
