import { readFileSync } from 'node:fs';
import type { ImportLogger } from '../../src/modules/import/types.js';

export const FIXTURE_PATH = new URL('../fixtures/trudvsem/vacancies.page.json', import.meta.url);

/** Sanitized real response of /api/v1/vacancies (10 records, fake contacts). */
export function loadFixture(): { status: string; meta: { total: number }; results: { vacancies: Array<{ vacancy: Record<string, any> }> } } {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
}

export function rawVacancy(index = 0): Record<string, any> {
  const v = loadFixture().results.vacancies[index]?.vacancy;
  if (!v) throw new Error(`fixture has no vacancy #${index}`);
  return structuredClone(v);
}

export function envelope(vacancies: Array<Record<string, any>>, status: string | number = '200'): unknown {
  return { status, request: { api: 'v1' }, meta: { total: vacancies.length, limit: vacancies.length }, results: { vacancies: vacancies.map(vacancy => ({ vacancy })) } };
}

export interface CapturedLog { level: string; obj: object; msg?: string | undefined }

export function captureLogger(): ImportLogger & { entries: CapturedLog[]; text(): string } {
  const entries: CapturedLog[] = [];
  const at = (level: string) => (obj: object, msg?: string) => { entries.push({ level, obj, msg }); };
  return { entries, debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error'), text: () => JSON.stringify(entries) };
}

type Responder = (url: URL, init: RequestInit | undefined) => Response | Promise<Response>;

/** fetch replacement that serves scripted responses in order and records URLs. */
export function scriptedFetch(...responders: Responder[]): typeof fetch & { calls: URL[] } {
  const calls: URL[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url);
    const responder = responders[Math.min(calls.length - 1, responders.length - 1)];
    if (!responder) throw new Error('no responder');
    return responder(url, init);
  }) as typeof fetch & { calls: URL[] };
  fn.calls = calls;
  return fn;
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

/**
 * Never answers until the request is aborted (simulates a hung server). A ref'ed
 * timer stands in for the open socket: AbortSignal.timeout() alone is unref'ed
 * and would not keep the test process alive.
 */
export const hang: Responder = (_url, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const socket = setTimeout(() => reject(new Error('hang responder was never aborted')), 60_000);
    signal?.addEventListener('abort', () => { clearTimeout(socket); reject(signal.reason ?? new Error('aborted')); }, { once: true });
  });
