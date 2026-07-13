export const kiteeConfig = {
  workspaceDir: process.env.KITEE_WORKSPACE_DIR ?? '/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee',
  outputDir: process.env.HERMES_EDUSKILL_OUTPUT_DIR ?? '/Users/nguyenthaivuong/Desktop/HermesWorkSpace/Kitee/Output',
  eduSkillDir: process.env.EDUSKILL_DIR ?? '/Users/nguyenthaivuong/Desktop/HermesWorkspace/eduSkill',
  hermesHome: process.env.HERMES_HOME ?? '/Users/nguyenthaivuong/.hermes/profiles/cmkitee',
  driveParentId: process.env.HERMES_DRIVE_PARENT_ID ?? '18fe276zrUdVAlFOFyKHPtc_8-GpEexKn',
  routerBaseUrl: process.env.NINE_ROUTER_BASE_URL ?? 'http://localhost:20128/v1',
  defaultWorkerModel: process.env.HERMES_WORKER_MODEL ?? 'gc/gemini-2.5-flash',
  defaultSummary: process.env.KITEE_DEFAULT_SUMMARY !== '0',
  fallbackModels: process.env.HERMES_FALLBACK_MODELS ?? 'gc/gemini-2.5-flash,gc/gemini-2.5-pro,gc/gemini-3.1-flash-lite-preview,cx/gpt-5.5,cx/gpt-5.4,cc/claude-opus-4-8,openrouter/openrouter/free',
  modelRetries: Number(process.env.HERMES_MODEL_RETRIES ?? 2),
  retryDelayMs: Number(process.env.HERMES_MODEL_RETRY_DELAY_MS ?? 1200),
}
