import { ImportError } from './errors.js';
import type { ImportLogger } from './types.js';

export interface HttpClientOptions {
  /** Per-attempt timeout, including reading the body. */
  timeoutMs: number;
  /** Total attempts, including the first one (1 = no retries). */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Responses larger than this are rejected without parsing. */
  maxBodyBytes: number;
  userAgent: string;
}

export const DEFAULT_HTTP_OPTIONS: HttpClientOptions = {
  timeoutMs: 15_000,
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
  maxBodyBytes: 20 * 1024 * 1024,
  userAgent: 'STARTER-vacancy-importer/0.1 (hackathon prototype)'
};

export interface HttpDeps {
  fetch: typeof globalThis.fetch;
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  random: () => number;
  logger: ImportLogger;
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ImportError('ABORTED', 'Import aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(new ImportError('ABORTED', 'Import aborted'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

/** URL for logs: path and query only, without host credentials. */
function safeUrl(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/** One attempt: GET + read body + JSON.parse. Throws ImportError with retryable flag. */
async function attempt(url: URL, opts: HttpClientOptions, deps: HttpDeps, outer?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(opts.timeoutMs);
  const signal = outer ? AbortSignal.any([outer, timeout]) : timeout;
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': opts.userAgent },
      redirect: 'follow',
      signal
    });
  } catch (err) {
    throw classifyFetchError(err, outer, timeout);
  }

  if (!response.ok) {
    // Drain/cancel the body; its content is not logged.
    await response.body?.cancel().catch(() => undefined);
    throw new ImportError('HTTP_ERROR', `Source answered HTTP ${response.status}`, {
      retryable: RETRYABLE_HTTP.has(response.status),
      httpStatus: response.status,
      retryAfterMs: retryAfterMs(response.headers.get('retry-after'))
    });
  }

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > opts.maxBodyBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new ImportError('RESPONSE_TOO_LARGE', `Response exceeds ${opts.maxBodyBytes} bytes`);
  }

  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    throw classifyFetchError(err, outer, timeout);
  }
  if (Buffer.byteLength(text, 'utf8') > opts.maxBodyBytes) {
    throw new ImportError('RESPONSE_TOO_LARGE', `Response exceeds ${opts.maxBodyBytes} bytes`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // An HTML error page with HTTP 200 is usually a transient gateway problem.
    throw new ImportError('INVALID_JSON', 'Source returned a body that is not JSON', { retryable: true });
  }
}

function classifyFetchError(err: unknown, outer: AbortSignal | undefined, timeout: AbortSignal): ImportError {
  if (err instanceof ImportError) return err;
  if (outer?.aborted) return new ImportError('ABORTED', 'Import aborted', { cause: err });
  if (timeout.aborted) return new ImportError('TIMEOUT', 'Source did not answer in time', { retryable: true, cause: err });
  return new ImportError('NETWORK_ERROR', 'Network error while calling the source', { retryable: true, cause: err });
}

/**
 * GET a JSON document with a timeout and a bounded number of retries with
 * exponential backoff + jitter. Only transient failures are retried.
 * `validate` may throw ImportError (e.g. API status inside the body); it is
 * retried only if the thrown error is marked retryable.
 */
export async function getJsonWithRetry<T>(
  url: URL,
  validate: (body: unknown) => T,
  opts: HttpClientOptions,
  deps: HttpDeps,
  signal?: AbortSignal
): Promise<T> {
  let lastError: ImportError | null = null;
  for (let n = 1; n <= opts.maxAttempts; n++) {
    const started = Date.now();
    try {
      const body = await attempt(url, opts, deps, signal);
      const result = validate(body);
      deps.logger.debug({ url: safeUrl(url), attempt: n, durationMs: Date.now() - started }, 'Source request succeeded');
      return result;
    } catch (err) {
      const error = err instanceof ImportError
        ? err
        : new ImportError('INVALID_RESPONSE', 'Source response failed validation', { cause: err });
      lastError = error;
      const willRetry = error.retryable && n < opts.maxAttempts && !signal?.aborted;
      deps.logger.warn(
        { url: safeUrl(url), attempt: n, code: error.code, httpStatus: error.options.httpStatus, willRetry },
        'Source request failed'
      );
      if (!willRetry) throw error;
      const exp = Math.min(opts.maxDelayMs, opts.baseDelayMs * 2 ** (n - 1));
      const jittered = Math.round(exp * (0.5 + deps.random() * 0.5));
      const hinted = error.options.retryAfterMs;
      const delay = hinted != null ? Math.min(opts.maxDelayMs, Math.max(jittered, hinted)) : jittered;
      await deps.sleep(delay, signal);
    }
  }
  throw lastError ?? new ImportError('NETWORK_ERROR', 'Request was not attempted');
}
