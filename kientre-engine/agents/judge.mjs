import { chatJSON } from '../server/llm.mjs'

export async function runJudge(chunkContent, boundaries, grade) {
 const system = "Bạn là Chuyên gia Thẩm định khắt khe. Bạn so khớp nội dung với ranh giới lớp học."
 const prompt = `Lớp: ${grade}. Ranh giới: ${boundaries.join(', ')}.
 Nội dung: ${chunkContent}.
 Kiểm tra: Sai kiến thức? Vượt lớp? Không thực tế?
 Trả về JSON: {"status": "PASS" | "FAIL", "reason": string}`
 // Judge chạy trên model qua 9Router (Hermes) — KHÔNG cần Claude để tự kiểm.
 const model = process.env.HERMES_JUDGE_MODEL || process.env.HERMES_WORKER_MODEL || 'cx/gpt-5.5'
 return chatJSON({ model, system, user: prompt })
}
