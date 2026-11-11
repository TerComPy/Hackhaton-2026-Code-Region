import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TrudvsemAdapter } from '../../src/modules/import/adapters/trudvsem.adapter.js';
import { ImportError } from '../../src/modules/import/errors.js';
import { captureLogger, envelope, hang, json, loadFixture, rawVacancy, scriptedFetch } from './helpers.js';

function adapter(fetch: typeof globalThis.fetch, http: Record<string, number> = {}) {
  const logger = captureLogger();
  const sleeps: number[] = [];
  const a = new TrudvsemAdapter({
    logger,
    fetch,
    sleep: async ms => { sleeps.push(ms); },
    random: () => 1,
    http: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000, timeoutMs: 2000, ...http }
  });
  return { a, logger, sleeps };
}

async function rejectsWith(p: Promise<unknown>, code: string) {
  await assert.rejects(p, (e: unknown) => e instanceof ImportError && e.code === code);
}

describe('TrudvsemAdapter.buildUrl', () => {
  const { a } = adapter(scriptedFetch(json({})));
  it('uses the region route and encodes text', () => {
    const url = a.buildUrl({ limit: 20, offset: 0, regionCode: '7800000000000', text: 'инженер по тестированию' });
    assert.equal(url.origin + url.pathname, 'https://opendata.trudvsem.ru/api/v1/vacancies/region/7800000000000');
    assert.equal(url.searchParams.get('text'), 'инженер по тестированию');
    assert.equal(url.searchParams.get('limit'), '20');
  });
  it('validates limit, offset and region', () => {
    for (const bad of [{ limit: 0 }, { limit: 101 }, { limit: 10, offset: -1 }, { limit: 10, regionCode: '78' }]) {
      assert.throws(() => a.buildUrl(bad), (e: unknown) => e instanceof ImportError && e.code === 'INVALID_OPTIONS');
    }
  });
});

describe('TrudvsemAdapter.fetch', () => {
  it('normalizes a real response page', async () => {
    const fx = loadFixture();
    const { a } = adapter(scriptedFetch(json(fx)));
    const res = await a.fetch({ limit: 10 });
    assert.equal(res.received, fx.results.vacancies.length);
    assert.equal(res.vacancies.length, fx.results.vacancies.length);
    assert.equal(res.total, fx.meta.total);
  });

  it('reports rejected records without failing the page', async () => {
    const bad = rawVacancy(); delete bad.vac_url;
    const { a } = adapter(scriptedFetch(json(envelope([rawVacancy(0), bad]))));
    const res = await a.fetch({ limit: 2 });
    assert.equal(res.vacancies.length, 1);
    assert.equal(res.rejected.length, 1);
    assert.equal(res.rejected[0]?.index, 1);
  });

  it('accepts an empty result', async () => {
    const { a } = adapter(scriptedFetch(json({ status: '200', meta: { total: 0 }, results: {} })));
    const res = await a.fetch({ limit: 5 });
    assert.deepEqual([res.received, res.vacancies.length], [0, 0]);
  });

  it('retries transient HTTP errors with backoff, then succeeds', async () => {
    const fetch = scriptedFetch(json({}, 503), json({}, 502), json(envelope([rawVacancy()])));
    const { a, sleeps } = adapter(fetch);
    const res = await a.fetch({ limit: 1 });
    assert.equal(res.vacancies.length, 1);
    assert.equal(fetch.calls.length, 3);
    assert.deepEqual(sleeps, [100, 200]);
  });

  it('honours Retry-After on 429 (capped by maxDelayMs)', async () => {
    const fetch = scriptedFetch(json({}, 429, { 'retry-after': '30' }), json(envelope([])));
    const { a, sleeps } = adapter(fetch);
    await a.fetch({ limit: 1 });
    assert.deepEqual(sleeps, [1000]);
  });

  it('does not retry a client error', async () => {
    const fetch = scriptedFetch(json({}, 400));
    const { a } = adapter(fetch);
    await rejectsWith(a.fetch({ limit: 1 }), 'HTTP_ERROR');
    assert.equal(fetch.calls.length, 1);
  });

  it('treats HTTP 200 with an error status in the body as a failure', async () => {
    const body = { status: '500', request: { api: 'v1' }, meta: { error: 'При выполнении запроса произошла ошибка' } };
    const fetch = scriptedFetch(json(body));
    const { a, logger } = adapter(fetch);
    await rejectsWith(a.fetch({ limit: 1 }), 'API_ERROR');
    assert.equal(fetch.calls.length, 3, 'body status 5xx is retried a bounded number of times');
    assert.ok(!logger.text().includes('При выполнении'), 'response body is not logged');
  });

  it('does not retry a 4xx status in the body', async () => {
    const fetch = scriptedFetch(json({ status: '400' }));
    const { a } = adapter(fetch);
    await rejectsWith(a.fetch({ limit: 1 }), 'API_ERROR');
    assert.equal(fetch.calls.length, 1);
  });

  it('fails on a body that is not JSON or has no status', async () => {
    const html = () => new Response('<html>busy</html>', { status: 200 });
    await rejectsWith(adapter(scriptedFetch(html), { maxAttempts: 1 }).a.fetch({ limit: 1 }), 'INVALID_JSON');
    await rejectsWith(adapter(scriptedFetch(json({ results: [] })), { maxAttempts: 1 }).a.fetch({ limit: 1 }), 'INVALID_RESPONSE');
  });

  it('times out a hung request and gives up after maxAttempts', async () => {
    const fetch = scriptedFetch(hang);
    const { a } = adapter(fetch, { timeoutMs: 50, maxAttempts: 2 });
    await rejectsWith(a.fetch({ limit: 1 }), 'TIMEOUT');
    assert.equal(fetch.calls.length, 2);
  });

  it('maps network failures to NETWORK_ERROR', async () => {
    const fetch = scriptedFetch(() => { throw new TypeError('fetch failed'); });
    await rejectsWith(adapter(fetch, { maxAttempts: 1 }).a.fetch({ limit: 1 }), 'NETWORK_ERROR');
  });

  it('stops immediately when aborted by the caller', async () => {
    const controller = new AbortController();
    const fetch = scriptedFetch(hang);
    const { a } = adapter(fetch, { timeoutMs: 5000 });
    const p = a.fetch({ limit: 1, signal: controller.signal });
    controller.abort();
    await rejectsWith(p, 'ABORTED');
    assert.equal(fetch.calls.length, 1);
  });
});

describe('TrudvsemAdapter.probeOffset', () => {
  const ids = (xs: string[]) => envelope(xs.map(id => ({ ...rawVacancy(), id })));
  it('detects page semantics', async () => {
    const { a } = adapter(scriptedFetch(json(ids(['a', 'b', 'c', 'd', 'e'])), json(ids(['f', 'g', 'h', 'i', 'j']))));
    assert.equal((await a.probeOffset(5)).semantics, 'page');
  });
  it('detects record semantics', async () => {
    const { a } = adapter(scriptedFetch(json(ids(['a', 'b', 'c', 'd', 'e'])), json(ids(['b', 'c', 'd', 'e', 'f']))));
    assert.equal((await a.probeOffset(5)).semantics, 'record');
  });
  it('reports unknown for anything else', async () => {
    const { a } = adapter(scriptedFetch(json(ids(['a', 'b', 'c', 'd', 'e'])), json(ids(['c', 'x', 'a']))));
    assert.equal((await a.probeOffset(5)).semantics, 'unknown');
  });
});

