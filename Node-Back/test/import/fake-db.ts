// In-memory stand-in for the mysql2 pool, used to test transaction handling and
// idempotency WITHOUT MySQL. It understands only the statements the importer
// issues. It does NOT prove SQL syntax: that needs a real MySQL 8.4 run.

import type { ImportDbConnection, ImportDbPool } from '../../src/modules/import/types.js';

type Row = Record<string, unknown>;

interface State {
  sources: Row[];
  companies: Row[];
  vacancies: Row[];
  skills: Row[];
  vacancySkills: Row[];
  nextId: number;
}

export interface FakeDbOptions {
  /** Columns of table `vacancies` (default: pinned baseline efe6b9d + nothing optional). */
  vacancyColumns?: string[];
  sourceEnabled?: boolean;
  withSource?: boolean;
}

export const BASELINE_COLUMNS = [
  'id', 'source_id', 'external_id', 'company_id', 'title', 'description', 'requirements', 'responsibilities',
  'original_url', 'country_code', 'region_name', 'city', 'address_text', 'work_format', 'employment_type',
  'schedule_text', 'schedule_type', 'contract_type', 'salary_min', 'salary_max', 'currency', 'salary_period',
  'salary_gross', 'experience_months_min', 'status', 'published_at', 'source_updated_at', 'first_seen_at',
  'last_seen_at', 'updated_at', 'raw_payload'
];
export const UPSTREAM_HEAD_COLUMNS = [
  ...BASELINE_COLUMNS.filter(c => c !== 'raw_payload'),
  'typical_position', 'code_profession', 'specialisation', 'region_code', 'latitude', 'longitude', 'content_hash'
];

class SimulatedError extends Error {
  constructor(public readonly code: string, public readonly errno: number) {
    super(`simulated ${code}`);
  }
}

export class FakePool implements ImportDbPool {
  state: State;
  readonly log: string[] = [];
  readonly events: string[] = [];
  connectionsOpen = 0;
  getConnectionCalls = 0;
  /** Throw on the first statement matching this pattern (once per match count). */
  failOn: RegExp | null = null;
  failTimes = Infinity;
  readonly vacancyColumns: string[];

  constructor(options: FakeDbOptions = {}) {
    this.vacancyColumns = options.vacancyColumns ?? BASELINE_COLUMNS;
    this.state = {
      sources: options.withSource === false ? [] : [{ id: '1', code: 'trudvsem', is_enabled: options.sourceEnabled === false ? 0 : 1 }],
      companies: [],
      vacancies: [],
      skills: [],
      vacancySkills: [],
      nextId: 100
    };
  }

  async getConnection(): Promise<ImportDbConnection> {
    this.getConnectionCalls++;
    this.connectionsOpen++;
    return new FakeConnection(this);
  }

  allocateId(): string {
    return String(this.state.nextId++);
  }
}

class FakeConnection implements ImportDbConnection {
  private snapshot: State | null = null;
  private lastInsertId = '0';
  private released = false;

  constructor(private readonly pool: FakePool) {}

  async beginTransaction(): Promise<void> {
    if (this.snapshot) throw new Error('nested transaction');
    this.snapshot = structuredClone(this.pool.state);
    this.pool.events.push('begin');
  }

  async commit(): Promise<void> {
    if (!this.snapshot) throw new Error('commit without transaction');
    this.snapshot = null;
    this.pool.events.push('commit');
  }

  async rollback(): Promise<void> {
    if (this.snapshot) this.pool.state = this.snapshot;
    this.snapshot = null;
    this.pool.events.push('rollback');
  }

  release(): void {
    if (this.released) throw new Error('double release');
    this.released = true;
    this.pool.connectionsOpen--;
    this.pool.events.push('release');
  }

  async query(sql: string, values: unknown[] = []): Promise<[unknown, unknown]> {
    const s = sql.replace(/\s+/g, ' ').trim();
    this.pool.log.push(s);
    const placeholders = (s.match(/\?/g) ?? []).length;
    if (placeholders !== values.length) throw new Error(`placeholder mismatch: ${placeholders} vs ${values.length} in ${s.slice(0, 60)}`);
    if (this.pool.failOn && this.pool.failOn.test(s) && this.pool.failTimes > 0) {
      this.pool.failTimes--;
      throw new SimulatedError('ER_SIMULATED', 9999);
    }
    const st = this.pool.state;

    if (/^SET time_zone/.test(s)) return [[], []];
    if (/^SELECT id, is_enabled FROM sources WHERE code = \?$/.test(s)) {
      return [st.sources.filter(r => r.code === values[0]).map(r => ({ id: r.id, is_enabled: r.is_enabled })), []];
    }
    if (/information_schema\.COLUMNS/.test(s)) {
      return [this.pool.vacancyColumns.map(c => ({ column_name: c })), []];
    }
    if (/^SELECT id, source_updated_at FROM vacancies WHERE source_id = \? AND external_id = \? FOR UPDATE$/.test(s)) {
      if (!this.snapshot) throw new Error('FOR UPDATE outside a transaction');
      const row = st.vacancies.find(r => r.source_id === values[0] && r.external_id === values[1]);
      return [row ? [{ id: row.id, source_updated_at: row.source_updated_at ?? null }] : [], []];
    }
    if (/^SELECT LAST_INSERT_ID\(\) AS id$/.test(s)) return [[{ id: this.lastInsertId }], []];

    if (/^INSERT INTO companies /.test(s)) {
      const [sourceId, externalId, name, url] = values;
      let row = st.companies.find(r => r.source_id === sourceId && r.external_id === externalId);
      if (row) Object.assign(row, { name, original_url: url });
      else st.companies.push((row = { id: this.pool.allocateId(), source_id: sourceId, external_id: externalId, name, original_url: url }));
      this.lastInsertId = String(row.id);
      return [{ affectedRows: 1 }, []];
    }
    const vac = /^INSERT INTO vacancies \(([^)]+)\)/.exec(s);
    if (vac) {
      const cols = vac[1]!.split(',').map(c => c.trim()).filter(c => c !== 'last_seen_at');
      for (const c of cols) if (!this.pool.vacancyColumns.includes(c)) throw new SimulatedError('ER_BAD_FIELD_ERROR', 1054);
      const data: Row = Object.fromEntries(cols.map((c, i) => [c, values[i]]));
      let row = st.vacancies.find(r => r.source_id === data.source_id && r.external_id === data.external_id);
      if (row) Object.assign(row, data, { last_seen_at: 'now' });
      else st.vacancies.push((row = { id: this.pool.allocateId(), ...data, last_seen_at: 'now' }));
      this.lastInsertId = String(row.id);
      return [{ affectedRows: 1 }, []];
    }
    if (/^INSERT INTO skills /.test(s)) {
      const [name, normalized] = values;
      let row = st.skills.find(r => r.normalized_name === normalized);
      if (!row) st.skills.push((row = { id: this.pool.allocateId(), name, normalized_name: normalized }));
      this.lastInsertId = String(row.id);
      return [{ affectedRows: 1 }, []];
    }
    if (/^DELETE FROM vacancy_skills WHERE vacancy_id = \?$/.test(s)) {
      st.vacancySkills = st.vacancySkills.filter(r => r.vacancy_id !== values[0]);
      return [{ affectedRows: 0 }, []];
    }
    if (/^INSERT INTO vacancy_skills /.test(s)) {
      for (let i = 0; i < values.length; i += 2) {
        const [vacancyId, skillId] = [values[i], values[i + 1]];
        if (st.vacancySkills.some(r => r.vacancy_id === vacancyId && r.skill_id === skillId)) throw new SimulatedError('ER_DUP_ENTRY', 1062);
        st.vacancySkills.push({ vacancy_id: vacancyId, skill_id: skillId, is_required: 0 });
      }
      return [{ affectedRows: values.length / 2 }, []];
    }
    throw new Error(`FakePool: unsupported statement: ${s.slice(0, 80)}`);
  }
}
