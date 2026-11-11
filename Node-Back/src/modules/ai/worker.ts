import { ZodError } from 'zod';
import { AiProviderError, generateAiSummary, type ProviderOptions } from './provider.js';
import { AiValidationError } from './schema.js';
import {
  claimAiJob, currentClaimedVacancy, failAiJob, finishAiJob,
  queueAiSummary, recoverAiLeases, type AiScope
} from './repository.js';

export async function processAiJob(scope: AiScope, provider: ProviderOptions): Promise<boolean> {
  const job = await claimAiJob(scope);
  if (!job) return false;
  try {
    const source = await currentClaimedVacancy(job);
    if (!source) {
      await failAiJob(job, 'SOURCE_CHANGED', false);
      try { await queueAiSummary(job.vacancyId, scope); }
      catch { /* absent/archived vacancy: nothing current to enqueue */ }
      return true;
    }
    const result = await generateAiSummary(source, provider);
    await finishAiJob(job, result);
  } catch (error) {
    let code = 'AI_UNEXPECTED';
    let retryable = true;
    let retryAfter = 0;
    if (error instanceof AiProviderError) {
      code = error.code;
      retryable = error.retryable;
      retryAfter = error.retryAfterSeconds;
    } else if (error instanceof AiValidationError) {
      code = error.code;
      retryable = false;
    } else if (error instanceof ZodError) {
      code = 'AI_INVALID_SCHEMA';
      retryable = false;
    }
    await failAiJob(job, code, retryable, retryAfter);
  }
  return true;
}
export { recoverAiLeases };
