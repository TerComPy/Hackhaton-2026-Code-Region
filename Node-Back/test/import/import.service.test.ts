import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mapTrudvsemVacancy } from '../../src/modules/import/adapters/trudvsem.mapper.js';
import { ImportError } from '../../src/modules/import/errors.js';
import { MysqlImportRepository } from '../../src/modules/import/repositories/import.repository.js';
import { dedupeByExternalId, runImport } from '../../src/modules/import/services/import.service.js';
import type { FetchResult, NormalizedVacancy, VacancySourceAdapter } from '../../src/modules/import/types.js';
import { BASELINE_COLUMNS, FakePool, UPSTREAM_HEAD_COLUMNS } from './fake-db.js';
import { captureLogger, loadFixture, rawVacancy } from './helpers.js';

function fixtureVacancies(): NormalizedVacancy[] {
  return loadFixture().results.vacancies.map((x, i) => {
    const r = mapTrudvsemVacancy(x.vacancy, i);
    if (!r.ok) throw new Error(r.rejected.reason);
    return r.vacancy;
  });
}

/** Adapter returning prepared data; counts calls. */
function stubAdapter(vacancies: NormalizedVacancy[]): VacancySourceAdapter & { calls: number } {
  return {
    sourceCode: 'trudvsem',
    calls: 0,
    async fetch(): Promise<FetchResult> {
      this.calls++;
      return { vacancies: structuredClone(vacancies), rejected: [], received: vacancies.length, total: vacancies.length };
    }
  };
}

function setup(columns = BASELINE_COLUMNS) {
  const pool = new FakePool({ vacancyColumns: columns });
  const logger = captureLogger();
  const store = new MysqlImportRepository(pool, logger);
  return { pool, logger, store };
}

describe('runImport — dry run', () => {
  it('normalizes without touching the database', async () => {
    const pool = new FakePool();
    const report = await runImport(stubAdapter(fixtureVacancies()), { limit: 10, dryRun: true }, { logger: captureLogger(), previewLimit: 2 });
    assert.equal(pool.getConnectionCalls, 0);
    assert.equal(report.preview?.length, 2);
    assert.deepEqual([report.inserted, report.updated], [0, 0]);
  });
});

describe('runImport + MysqlImportRepository (fake MySQL)', () => {
  it('inserts companies, vacancies and skills in one transaction each', async () => {
    const { pool, logger, store } = setup();
    const data = fixtureVacancies();
    const report = await runImport(stubAdapter(data), { limit: 10, dryRun: false }, { logger, store });
    assert.equal(report.inserted, data.length);
    assert.equal(report.failed.length, 0);
    assert.equal(pool.state.vacancies.length, data.length);
    assert.equal(pool.state.companies.length, new Set(data.map(v => v.company?.externalId)).size);
    const expectedLinks = data.filter(v => v.skillsComplete).reduce((n, v) => n + v.skills.length, 0);
    assert.equal(pool.state.vacancySkills.length, expectedLinks);
    assert.equal(pool.events.filter(e => e === 'commit').length, data.length);
    assert.equal(pool.connectionsOpen, 0, 'every connection released');
  });

  it('re-import updates rows instead of duplicating them', async () => {
    const { pool, logger, store } = setup();
    const data = fixtureVacancies();
    await runImport(stubAdapter(data), { limit: 10, dryRun: false }, { logger, store });
    const before = structuredClone(pool.state);
    const changed = data.map(v => ({ ...v, title: `${v.title} (обновлено)` }));
    const report = await runImport(stubAdapter(changed), { limit: 10, dryRun: false }, { logger, store });
    assert.equal(report.updated, data.length);
    assert.equal(report.inserted, 0);
    assert.equal(pool.state.vacancies.length, before.vacancies.length);
    assert.equal(pool.state.companies.length, before.companies.length);
    assert.equal(pool.state.skills.length, before.skills.length);
    assert.equal(pool.state.vacancySkills.length, before.vacancySkills.length);
    assert.deepEqual(pool.state.vacancies.map(r => r.id), before.vacancies.map(r => r.id), 'ids are stable');
    assert.ok(pool.state.vacancies.every(r => String(r.title).endsWith('(обновлено)')));
  });

  it('skips a snapshot older than the stored one', async () => {
    const { pool, logger, store } = setup();
    const [v] = fixtureVacancies();
    await runImport(stubAdapter([{ ...v!, sourceUpdatedAt: '2026-11-10 10:00:00.000000' }]), { limit: 1, dryRun: false }, { logger, store });
    const report = await runImport(
      stubAdapter([{ ...v!, title: 'старая версия', sourceUpdatedAt: '2026-11-01 10:00:00.000000' }]),
      { limit: 1, dryRun: false }, { logger, store }
    );
    assert.equal(report.skippedStale, 1);
    assert.notEqual(pool.state.vacancies[0]?.title, 'старая версия');
  });

  it('rolls back the whole vacancy when a later statement fails', async () => {
    const { pool, logger, store } = setup();
    const withSkills = fixtureVacancies().find(v => v.skills.length > 0)!;
    pool.failOn = /^INSERT INTO vacancy_skills/;
    const report = await runImport(stubAdapter([withSkills]), { limit: 1, dryRun: false }, { logger, store });
    assert.equal(report.failed.length, 1);
    assert.equal(report.failed[0]?.code, 'DB_ERROR');
    assert.equal(pool.state.vacancies.length, 0, 'no vacancy row left behind');
    assert.equal(pool.state.companies.length, 0, 'company insert rolled back too');
    assert.equal(pool.state.vacancySkills.length, 0);
    assert.ok(pool.events.includes('rollback'));
    assert.equal(pool.connectionsOpen, 0);
  });

  it('a failed update keeps the previously stored version', async () => {
    const { pool, logger, store } = setup();
    const [v] = fixtureVacancies();
    await runImport(stubAdapter([v!]), { limit: 1, dryRun: false }, { logger, store });
    pool.failOn = /^SELECT LAST_INSERT_ID/;
    pool.failTimes = 1;
    const report = await runImport(stubAdapter([{ ...v!, company: null, title: 'не должно сохраниться' }]), { limit: 1, dryRun: false }, { logger, store });
    assert.equal(report.failed.length, 1);
    assert.equal(pool.state.vacancies[0]?.title, v!.title);
  });

  it('logs failures without SQL values or personal data', async () => {
    const { pool, logger, store } = setup();
    pool.failOn = /^INSERT INTO vacancies/;
    await runImport(stubAdapter(fixtureVacancies().slice(0, 1)), { limit: 1, dryRun: false }, { logger, store });
    const text = logger.text();
    assert.ok(text.includes('DB_ERROR'));
    assert.ok(!text.includes('INSERT INTO'), 'SQL is not logged');
  });

  it('stops after repeated consecutive failures (e.g. database gone)', async () => {
    const { pool, logger, store } = setup();
    await store.loadVacancyColumns();
    pool.failOn = /^SET time_zone/;
    const report = await runImport(stubAdapter(fixtureVacancies()), { limit: 10, dryRun: false, maxConsecutiveFailures: 3 }, { logger, store: {
      resolveSource: async () => ({ id: '1', enabled: true }),
      loadVacancyColumns: () => store.loadVacancyColumns(),
      saveVacancy: (id, v) => store.saveVacancy(id, v)
    } });
    assert.equal(report.failed.length, 3);
    assert.equal(report.aborted, true);
  });

  it('fails before calling the API when the source is missing or disabled', async () => {
    for (const opts of [{ withSource: false, code: 'SOURCE_NOT_FOUND' }, { sourceEnabled: false, code: 'SOURCE_DISABLED' }] as const) {
      const pool = new FakePool(opts);
      const adapter = stubAdapter(fixtureVacancies());
      await assert.rejects(
        runImport(adapter, { limit: 1, dryRun: false }, { logger: captureLogger(), store: new MysqlImportRepository(pool, captureLogger()) }),
        (e: unknown) => e instanceof ImportError && e.code === opts.code
      );
      assert.equal(adapter.calls, 0);
    }
  });

  it('fails fast on an incompatible schema', async () => {
    const { store } = setup(BASELINE_COLUMNS.filter(c => c !== 'contract_type'));
    await assert.rejects(store.loadVacancyColumns(), (e: unknown) => e instanceof ImportError && e.code === 'SCHEMA_MISMATCH');
  });

  it('baseline schema: never writes raw_payload or columns it does not have', async () => {
    const { pool, logger, store } = setup(BASELINE_COLUMNS);
    await runImport(stubAdapter(fixtureVacancies().slice(0, 1)), { limit: 1, dryRun: false }, { logger, store });
    const insert = pool.log.find(s => s.startsWith('INSERT INTO vacancies'))!;
    assert.ok(!insert.includes('raw_payload'));
    assert.ok(!insert.includes('typical_position'));
  });

  it('newer upstream schema: also writes profession/region/coordinate columns', async () => {
    const { pool, logger, store } = setup(UPSTREAM_HEAD_COLUMNS);
    const [v] = fixtureVacancies();
    await runImport(stubAdapter([v!]), { limit: 1, dryRun: false }, { logger, store });
    const row = pool.state.vacancies[0]!;
    assert.equal(row.typical_position, v!.typicalPosition);
    assert.equal(row.region_code, v!.regionCode);
    assert.equal(row.latitude, v!.latitude);
  });

  it('skills are left alone when the source did not send a complete list', async () => {
    const { pool, logger, store } = setup();
    const v = fixtureVacancies().find(x => x.skills.length > 0)!;
    await runImport(stubAdapter([v]), { limit: 1, dryRun: false }, { logger, store });
    const links = pool.state.vacancySkills.length;
    await runImport(stubAdapter([{ ...v, skills: [], skillsComplete: false }]), { limit: 1, dryRun: false }, { logger, store });
    assert.equal(pool.state.vacancySkills.length, links);
    await runImport(stubAdapter([{ ...v, skills: [], skillsComplete: true }]), { limit: 1, dryRun: false }, { logger, store });
    assert.equal(pool.state.vacancySkills.length, 0, 'a complete empty list clears links');
  });
});

describe('dedupeByExternalId', () => {
  it('keeps the most recently modified copy', () => {
    const r = mapTrudvsemVacancy(rawVacancy(), 0);
    assert.ok(r.ok);
    const a = { ...r.vacancy, title: 'old', sourceUpdatedAt: '2026-01-01 00:00:00.000000' };
    const b = { ...r.vacancy, title: 'new', sourceUpdatedAt: '2026-02-01 00:00:00.000000' };
    const out = dedupeByExternalId([a, b]);
    assert.equal(out.duplicates, 1);
    assert.equal(out.unique[0]?.title, 'new');
  });
});
