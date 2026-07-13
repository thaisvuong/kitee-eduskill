import path from 'node:path'
import os from 'node:os'

// Repo root = ../../.. tính từ file này (src/lib/config/kitee.ts).
const REPO_ROOT = path.resolve(__dirname, '../../..')
const HOME = os.homedir()

export const kiteeConfig = {
  workspaceDir: process.env.KITEE_WORKSPACE_DIR ?? path.join(HOME, 'Kitee'),
  outputDir: process.env.HERMES_EDUSKILL_OUTPUT_DIR ?? path.join(HOME, 'Kitee', 'Output'),
  eduSkillDir: process.env.EDUSKILL_DIR ?? path.join(REPO_ROOT, 'eduSkill'),
  hermesHome: process.env.HERMES_HOME ?? path.join(HOME, '.hermes', 'profiles', 'cmkitee'),
  driveParentId: process.env.HERMES_DRIVE_PARENT_ID ?? '',
  routerBaseUrl: process.env.NINE_ROUTER_BASE_URL ?? 'http://localhost:20128/v1',
  defaultWorkerModel: process.env.HERMES_WORKER_MODEL ?? 'gc/gemini-2.5-flash',
  defaultSummary: process.env.KITEE_DEFAULT_SUMMARY !== '0',
  fallbackModels: process.env.HERMES_FALLBACK_MODELS ?? 'gc/gemini-2.5-flash,gc/gemini-2.5-pro,cx/gpt-5.5,cc/claude-opus-4-8,openrouter/openrouter/free',
  modelRetries: Number(process.env.HERMES_MODEL_RETRIES ?? 2),
  retryDelayMs: Number(process.env.HERMES_MODEL_RETRY_DELAY_MS ?? 1200),
}
