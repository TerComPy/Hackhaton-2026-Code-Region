#!/usr/bin/env node
import { db } from '../../../config/db.js';
import { env } from '../../../config/env.js';
import { validateProviderOptions } from '../provider.js';
import { scopeFor } from '../repository.js';
import { processAiJob, recoverAiLeases } from '../worker.js';

const options = {
  baseUrl: env.OPENAI_BASE_URL,
  apiKey: env.OPENAI_API_KEY,
  model: env.OPENAI_MODEL,
  timeoutMs: 15_000
};
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; });
process.on('SIGTERM', () => { interrupted = true; });

async function main(): Promise<void> {
  validateProviderOptions(options);
  const scope = scopeFor(options.model);
  await recoverAiLeases(scope);
  let lastRecovery = Date.now();
  while (!interrupted) {
    if (Date.now() - lastRecovery > 30_000) {
      await recoverAiLeases(scope);
      lastRecovery = Date.now();
    }
    const processed = await processAiJob(scope, options);
    if (!processed) await new Promise<void>(resolve => setTimeout(resolve, 1500));
  }
}
main().catch(() => {
  process.stderr.write('AI worker stopped: configuration or database error\n');
  process.exitCode = 1;
}).finally(async () => { await db.end(); });
