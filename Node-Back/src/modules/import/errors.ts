export type ImportErrorCode =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'HTTP_ERROR'
  | 'INVALID_JSON'
  | 'RESPONSE_TOO_LARGE'
  | 'API_ERROR'
  | 'INVALID_RESPONSE'
  | 'INVALID_OPTIONS'
  | 'SOURCE_NOT_FOUND'
  | 'SOURCE_DISABLED'
  | 'SCHEMA_MISMATCH'
  | 'DB_ERROR'
  | 'ABORTED';

/**
 * Error thrown by the import module. `message` is safe to log: it never
 * contains response bodies, credentials or personal data.
 */
export class ImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
    public readonly options: { retryable?: boolean; httpStatus?: number | undefined; retryAfterMs?: number | null; cause?: unknown } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ImportError';
  }

  get retryable(): boolean {
    return this.options.retryable ?? false;
  }
}

/** Safe one-line description of any error for logs (no stack, no SQL values). */
export function describeError(err: unknown): { code: string; message: string } {
  if (err instanceof ImportError) return { code: err.code, message: err.message };
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; errno?: unknown; message?: unknown };
    const code = typeof e.code === 'string' ? e.code : 'UNEXPECTED_ERROR';
    // mysql2 messages may quote values of a failed row; keep only the code/errno.
    const message = typeof e.errno === 'number' ? `MySQL error ${e.errno}` : 'Unexpected error';
    return { code, message };
  }
  return { code: 'UNEXPECTED_ERROR', message: 'Unexpected error' };
}
