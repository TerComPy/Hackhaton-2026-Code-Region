// Source-independent import flow: fetch (no DB transaction open) → deduplicate →
// save each vacancy in its own transaction. Knows nothing about Trudvsem JSON.

import { describeError, ImportError } from '../errors.js';
import type { FetchOptions, ImportLogger, NormalizedVacancy, RejectedRecord, SaveOutcome, VacancySourceAdapter } from '../types.js';

/** What the service needs from storage; MysqlImportRepository implements it. */
export interface ImportStore {
  resolveSource(code: string): Promise<{ id: string; enabled: boolean }>;
  loadVacancyColumns(): Promise<readonly string[]>;
  saveVacancy(sourceId: string, vacancy: NormalizedVacancy): Promise<SaveOutcome>;
}

export interface ImportRunOptions extends FetchOptions {
  dryRun: boolean;
  /** Stop after this many consecutive save failures (e.g. the DB went away). */
  maxConsecutiveFailures?: number;
}

export interface FailedRecord {
  externalId: string;
  code: string;
  message: string;
}

export interface ImportReport {
  source: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  /** Raw records in the API response. */
  received: number;
  totalReportedBySource: number | null;
  normalized: number;
  rejected: RejectedRecord[];
  duplicatesInBatch: number;
  inserted: number;
  updated: number;
  skippedStale: number;
  failed: FailedRecord[];
  /** Saving was stopped early because of repeated failures. */
  aborted: boolean;
  /** Normalized records (only in dry-run): contains no contact data. */
  preview?: NormalizedVacancy[];
}

/** Keep one record per externalId: the most recently modified one. */
export function dedupeByExternalId(list: readonly NormalizedVacancy[]): { unique: NormalizedVacancy[]; duplicates: number } {
  const byId = new Map<string, NormalizedVacancy>();
  for (const v of list) {
    const seen = byId.get(v.externalId);
    if (!seen || (v.sourceUpdatedAt ?? '') > (seen.sourceUpdatedAt ?? '')) byId.set(v.externalId, v);
  }
  return { unique: [...byId.values()], duplicates: list.length - byId.size };
}

export async function runImport(
  adapter: VacancySourceAdapter,
  options: ImportRunOptions,
  deps: { logger: ImportLogger; store?: ImportStore | undefined; previewLimit?: number }
): Promise<ImportReport> {
  const { logger } = deps;
  const startedAt = new Date();
  if (!options.dryRun && !deps.store) {
    throw new ImportError('INVALID_OPTIONS', 'A store is required unless dryRun is true');
  }

  // Validate the target before calling the source: a misconfigured DB should
  // fail fast, without spending API requests.
  let sourceId: string | null = null;
  if (!options.dryRun && deps.store) {
    const source = await deps.store.resolveSource(adapter.sourceCode);
    if (!source.enabled) {
      throw new ImportError('SOURCE_DISABLED', `Source "${adapter.sourceCode}" is disabled (sources.is_enabled = 0)`);
    }
    await deps.store.loadVacancyColumns();
    sourceId = source.id;
  }

  const fetched = await adapter.fetch(options);
  const { unique, duplicates } = dedupeByExternalId(fetched.vacancies);

  const report: ImportReport = {
    source: adapter.sourceCode,
    dryRun: options.dryRun,
    startedAt: startedAt.toISOString(),
    finishedAt: '',
    durationMs: 0,
    received: fetched.received,
    totalReportedBySource: fetched.total,
    normalized: fetched.vacancies.length,
    rejected: fetched.rejected,
    duplicatesInBatch: duplicates,
    inserted: 0,
    updated: 0,
    skippedStale: 0,
    failed: [],
    aborted: false
  };

  if (options.dryRun || !deps.store || sourceId === null) {
    report.preview = unique.slice(0, deps.previewLimit ?? unique.length);
  } else {
    const maxConsecutive = options.maxConsecutiveFailures ?? 5;
    let consecutive = 0;
    for (const vacancy of unique) {
      if (options.signal?.aborted) {
        report.aborted = true;
        break;
      }
      try {
        const outcome = await deps.store.saveVacancy(sourceId, vacancy);
        consecutive = 0;
        if (outcome === 'inserted') report.inserted++;
        else if (outcome === 'updated') report.updated++;
        else report.skippedStale++;
      } catch (err) {
        consecutive++;
        const { code, message } = describeError(err);
        report.failed.push({ externalId: vacancy.externalId, code, message });
        logger.error({ source: adapter.sourceCode, externalId: vacancy.externalId, code, message }, 'Vacancy not saved; transaction rolled back');
        if (consecutive >= maxConsecutive) {
          report.aborted = true;
          logger.error({ source: adapter.sourceCode, consecutiveFailures: consecutive }, 'Stopping import after repeated failures');
          break;
        }
      }
    }
  }

  const finishedAt = new Date();
  report.finishedAt = finishedAt.toISOString();
  report.durationMs = finishedAt.getTime() - startedAt.getTime();
  logger.info(
    {
      source: report.source, dryRun: report.dryRun, received: report.received, normalized: report.normalized,
      rejected: report.rejected.length, duplicatesInBatch: duplicates, inserted: report.inserted, updated: report.updated,
      skippedStale: report.skippedStale, failed: report.failed.length, aborted: report.aborted, durationMs: report.durationMs
    },
    'Import finished'
  );
  return report;
}
