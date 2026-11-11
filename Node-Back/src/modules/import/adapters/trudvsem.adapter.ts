import { ImportError } from '../errors.js';
import { DEFAULT_HTTP_OPTIONS, defaultSleep, getJsonWithRetry, type HttpClientOptions, type HttpDeps } from '../http.js';
import { trudvsemEnvelopeSchema, type TrudvsemEnvelope } from '../schemas.js';
import type { FetchOptions, FetchResult, ImportLogger, NormalizedVacancy, VacancySourceAdapter } from '../types.js';
import { mapTrudvsemVacancy, TRUDVSEM_SOURCE_CODE } from './trudvsem.mapper.js';

export const TRUDVSEM_API_BASE = 'https://opendata.trudvsem.ru/api/v1/vacancies';
export const TRUDVSEM_MAX_LIMIT = 100;

export interface TrudvsemAdapterDeps {
  logger: ImportLogger;
  fetch?: typeof globalThis.fetch;
  sleep?: HttpDeps['sleep'];
  random?: () => number;
  http?: Partial<HttpClientOptions>;
  baseUrl?: string;
}

export interface OffsetProbeResult {
  /** 'page': offset=1 returns the next page; 'record': it shifts by one record. */
  semantics: 'page' | 'record' | 'unknown';
  limit: number;
  firstIds: string[];
  secondIds: string[];
  overlap: number;
}

/**
 * Validates the JSON envelope. HTTP 200 is not enough: the API reports errors
 * in its own `status` field. 5xx inside the body is treated as transient.
 */
function validateEnvelope(body: unknown): TrudvsemEnvelope {
  const parsed = trudvsemEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    throw new ImportError('INVALID_RESPONSE', 'Unexpected response structure (no status/results)');
  }
  const status = Number(parsed.data.status);
  if (status !== 200) {
    throw new ImportError('API_ERROR', `Source reported status ${String(parsed.data.status)} in the response body`, {
      retryable: !Number.isFinite(status) || status >= 500,
      httpStatus: Number.isFinite(status) ? status : undefined
    });
  }
  const list = parsed.data.results?.vacancies;
  if (list !== undefined && list !== null && !Array.isArray(list)) {
    throw new ImportError('INVALID_RESPONSE', 'results.vacancies is not an array');
  }
  return parsed.data;
}

export class TrudvsemAdapter implements VacancySourceAdapter {
  readonly sourceCode = TRUDVSEM_SOURCE_CODE;
  private readonly http: HttpClientOptions;
  private readonly deps: HttpDeps;
  private readonly baseUrl: string;

  constructor(deps: TrudvsemAdapterDeps) {
    this.http = { ...DEFAULT_HTTP_OPTIONS, ...deps.http };
    this.deps = {
      fetch: deps.fetch ?? globalThis.fetch.bind(globalThis),
      sleep: deps.sleep ?? defaultSleep,
      random: deps.random ?? Math.random,
      logger: deps.logger
    };
    this.baseUrl = deps.baseUrl ?? TRUDVSEM_API_BASE;
  }

  buildUrl(options: FetchOptions): URL {
    const { limit, offset = 0, regionCode, text } = options;
    if (!Number.isInteger(limit) || limit < 1 || limit > TRUDVSEM_MAX_LIMIT) {
      throw new ImportError('INVALID_OPTIONS', `limit must be an integer 1..${TRUDVSEM_MAX_LIMIT}`);
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new ImportError('INVALID_OPTIONS', 'offset must be a non-negative integer');
    }
    if (regionCode !== undefined && !/^\d{13}$/.test(regionCode)) {
      throw new ImportError('INVALID_OPTIONS', 'regionCode must be 13 digits, e.g. 7800000000000');
    }
    const url = new URL(regionCode ? `${this.baseUrl}/region/${regionCode}` : this.baseUrl);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(limit));
    const trimmed = text?.trim();
    if (trimmed) url.searchParams.set('text', trimmed.slice(0, 200));
    return url;
  }

  async fetch(options: FetchOptions): Promise<FetchResult> {
    const url = this.buildUrl(options);
    const started = Date.now();
    const envelope = await getJsonWithRetry(url, validateEnvelope, this.http, this.deps, options.signal);
    const raw = envelope.results?.vacancies ?? [];
    const vacancies: NormalizedVacancy[] = [];
    const rejected: FetchResult['rejected'] = [];
    raw.forEach((item, index) => {
      const mapped = mapTrudvsemVacancy(item.vacancy, index);
      if (mapped.ok) vacancies.push(mapped.vacancy);
      else rejected.push(mapped.rejected);
    });
    const totalNum = Number(envelope.meta?.total);
    const total = Number.isFinite(totalNum) ? totalNum : null;
    this.deps.logger.info(
      { source: this.sourceCode, received: raw.length, normalized: vacancies.length, rejected: rejected.length, total, durationMs: Date.now() - started },
      'Fetched vacancies page'
    );
    for (const r of rejected) {
      this.deps.logger.warn({ source: this.sourceCode, index: r.index, externalId: r.externalId, reason: r.reason }, 'Vacancy rejected by normalizer');
    }
    return { vacancies, rejected, received: raw.length, total };
  }

  /**
   * The documentation does not define the unit of `offset`. Fetch offset=0 and
   * offset=1 with the same small limit and compare IDs to find out.
   */
  async probeOffset(limit = 5, signal?: AbortSignal): Promise<OffsetProbeResult> {
    const page = async (offset: number) => {
      const env = await getJsonWithRetry(this.buildUrl({ limit, offset }), validateEnvelope, this.http, this.deps, signal);
      return (env.results?.vacancies ?? []).map(x => {
        const id = (x.vacancy as { id?: unknown } | null)?.id;
        return typeof id === 'string' ? id : '';
      });
    };
    const firstIds = await page(0);
    await this.deps.sleep(500, signal);
    const secondIds = await page(1);
    const firstSet = new Set(firstIds);
    const overlap = secondIds.filter(id => firstSet.has(id)).length;
    let semantics: OffsetProbeResult['semantics'] = 'unknown';
    if (firstIds.length === limit && secondIds.length > 0) {
      if (overlap === 0) semantics = 'page';
      else if (overlap === limit - 1 && secondIds[0] === firstIds[1]) semantics = 'record';
    }
    return { semantics, limit, firstIds, secondIds, overlap };
  }
}
