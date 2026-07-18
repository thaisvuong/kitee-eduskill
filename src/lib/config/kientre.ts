import path from 'node:path'
import os from 'node:os'

// In standalone mode, __dirname points inside .next/standalone/.next/server.
// process.cwd() is the repo root when launched via `npm start` from the project.
const RUNTIME_ROOT = process.env.KIENTRE_APP_ROOT || process.cwd()
const HOME = os.homedir()

export const kientreConfig = {
 workspaceDir: process.env.KIENTRE_WORKSPACE_DIR ?? path.join(HOME, 'Kientre'),
 outputDir: process.env.KIENTRE_OUTPUT_DIR ?? path.join(HOME, 'Kientre', 'Output'),
 engineDir: process.env.KIENTRE_ENGINE_DIR ?? path.join(RUNTIME_ROOT, 'kientre-engine'),
 hermesHome: process.env.HERMES_HOME ?? path.join(HOME, '.hermes', 'profiles', 'cmkitee'),
 driveParentId: process.env.HERMES_DRIVE_PARENT_ID ?? '',
 googleCredentialFile: process.env.GOOGLE_OAUTH_JSON ?? path.join(process.env.HERMES_HOME ?? path.join(HOME, '.hermes', 'profiles', 'cmkitee'), 'google_oauth.json'),
 routerBaseUrl: process.env.NINE_ROUTER_BASE_URL ?? 'http://localhost:20128/v1',
 defaultWorkerModel: process.env.HERMES_WORKER_MODEL ?? 'gc/gemini-2.5-flash',
 defaultSummary: process.env.KIENTRE_DEFAULT_SUMMARY !== '0',
 fallbackModels: process.env.HERMES_FALLBACK_MODELS ?? 'gc/gemini-2.5-flash,gc/gemini-2.5-pro,cx/gpt-5.5,cc/claude-opus-4-8,openrouter/openrouter/free',
 modelRetries: Number(process.env.HERMES_MODEL_RETRIES ?? 2),
 retryDelayMs: Number(process.env.HERMES_MODEL_RETRY_DELAY_MS ?? 1200),
}
