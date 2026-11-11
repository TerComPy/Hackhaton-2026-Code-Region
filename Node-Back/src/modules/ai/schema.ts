import { z } from 'zod';

export const PROMPT_VERSION = 'starter-simplify-v1';
export const AI_PROVIDER = 'openai-compatible';
export const MAX_ATTEMPTS = 3;

export const summarySchema = z.object({
  simpleTitle: z.string().trim().min(1).max(180),
  whatYouDo: z.array(z.string().trim().min(1).max(320)).max(8),
  requirements: z.array(z.string().trim().min(1).max(320)).max(8),
  conditions: z.array(z.string().trim().min(1).max(320)).max(8),
  beginnerFriendly: z.boolean()
}).strict();

export type AiSummary = z.infer<typeof summarySchema>;
export type SummaryStatus = 'pending' | 'processing' | 'done' | 'failed' | 'unavailable';
export interface SummaryView {
  status: SummaryStatus;
  display: 'ai' | 'original';
  summary: AiSummary | null;
  errorCode?: string;
}
export interface SourceVacancy {
  id: string;
  title: string;
  description: string;
  requirements: string | null;
  responsibilities: string | null;
  schedule_text: string | null;
  work_format: string | null;
  employment_type: string | null;
  contract_type: string | null;
  salary_min: string | null;
  salary_max: string | null;
  currency: string | null;
  salary_period: string | null;
}

export function sourceFields(job: SourceVacancy) {
  return {
    title: job.title.slice(0, 300),
    description: job.description.slice(0, 6000),
    requirements: job.requirements?.slice(0, 2400) ?? null,
    responsibilities: job.responsibilities?.slice(0, 2400) ?? null,
    schedule: job.schedule_text?.slice(0, 600) ?? null,
    format: job.work_format,
    employment: job.employment_type,
    contract: job.contract_type,
    salaryMin: job.salary_min,
    salaryMax: job.salary_max,
    currency: job.currency,
    salaryPeriod: job.salary_period
  };
}

function digitsIn(text: string): Set<string> {
  return new Set((text.match(/\d(?:[\d \u00a0]*\d)?(?:[.,]\d+)?/g) ?? [])
    .map(value => value.replace(/\D/g, '')));
}

export class AiValidationError extends Error {
  constructor(readonly code: string) { super(code); }
}

export function validateGrounding(value: unknown, vacancy: SourceVacancy): AiSummary {
  const summary = summarySchema.parse(value);
  const input = JSON.stringify(sourceFields(vacancy));
  const output = [summary.simpleTitle, ...summary.whatYouDo, ...summary.requirements, ...summary.conditions].join(' ');
  const allowedNumbers = digitsIn(input);
  for (const number of digitsIn(output)) {
    if (!allowedNumbers.has(number)) throw new AiValidationError('UNSUPPORTED_NUMBER');
  }
  if (/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(output) || /(?:\+?\d[\s()\-]*){10,}/.test(output))
    throw new AiValidationError('CONTACT_IN_OUTPUT');
  return summary;
}

export function parseModelJson(raw: string, job: SourceVacancy): AiSummary {
  if (raw.length > 24_000) throw new AiValidationError('OUTPUT_TOO_LARGE');
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new AiValidationError('INVALID_JSON'); }
  return validateGrounding(value, job);
}
