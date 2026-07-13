export type EduSkillMode = 'create' | 'test' | 'solve' | 'review'

export interface CreateCommandInput {
  topic: string
  grade?: string | number
  subject?: string
  summary?: boolean
  special?: string
}

export interface TestCommandInput {
  topic: string
  grade?: string | number
  subject?: string
  mc?: number
  fill?: number
  essay?: number
  special?: string
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, ' ')
}

function gradeText(grade: string | number | undefined, fallback = 4) {
  const raw = String(grade || fallback)
  const n = raw.match(/\d+/)?.[0] || String(fallback)
  return `lớp ${n}`
}

function quoteFlag(value: string) {
  return `"${value.replace(/"/g, '\\"')}"`
}

export function buildCreateCommand(input: CreateCommandInput) {
  if (!input.topic?.trim()) throw new Error('Thiếu chủ đề')
  const parts = ['/es-create', clean(input.topic), gradeText(input.grade, 4), input.subject || 'toán']
  if (input.summary !== false) parts.push('--summary')
  if (input.special?.trim()) parts.push('--special', quoteFlag(clean(input.special)))
  return parts.join(' ')
}

export function buildTestCommand(input: TestCommandInput) {
  if (!input.topic?.trim()) throw new Error('Thiếu chủ đề')
  const parts = ['/es-test', clean(input.topic), gradeText(input.grade, 5), input.subject || 'toán']
  if (input.mc) parts.push(`mc=${input.mc}`)
  if (input.fill) parts.push(`fill=${input.fill}`)
  if (input.essay) parts.push(`essay=${input.essay}`)
  if (input.special?.trim()) parts.push('--special', quoteFlag(clean(input.special)))
  return parts.join(' ')
}
