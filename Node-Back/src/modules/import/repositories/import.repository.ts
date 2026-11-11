// MySQL persistence of normalized vacancies: canonical Q01 (company), QI14
// (previous row), Q02 (vacancy) and skill links in ONE transaction per vacancy.
// All values are bound with `?` placeholders; column names come only from the
// constant lists below, never from input. Upserts use the MySQL 8.0.19+ row alias
// (`AS new_row`) instead of the deprecated VALUES() function.

import { describeError, ImportError } from '../errors.js';
import { normalizeSkillName } from '../normalize.js';
import type { ImportDbConnection, ImportDbPool, ImportLogger, NormalizedVacancy, SaveOutcome } from '../types.js';

type Row = Record<string, unknown>;

/** Columns present in every supported revision of the canonical schema. */
const BASE_COLUMNS = [
  'source_id', 'external_id', 'company_id', 'title', 'description', 'requirements', 'responsibilities',
  'original_url', 'country_code', 'region_name', 'city', 'address_text', 'work_format', 'employment_type',
  'schedule_text', 'schedule_type', 'contract_type', 'salary_min', 'salary_max', 'currency', 'salary_period',
  'salary_gross', 'experience_months_min', 'status', 'published_at', 'source_updated_at'
] as const;

/**
 * Added in canonical upstream 4ce04c4 (absent in the pinned baseline efe6b9d).
 * Written only when the connected database has them. raw_payload is never written.
 */
const OPTIONAL_COLUMNS = ['typical_position', 'code_profession', 'specialisation', 'region_code', 'latitude', 'longitude'] as const;

type Column = (typeof BASE_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];

function rows(result: [unknown, unknown]): Row[] {
  return Array.isArray(result[0]) ? (result[0] as Row[]) : [];
}

function idOf(result: [unknown, unknown], field: string): string {
  const value = rows(result)[0]?.[field];
  if (value === null || value === undefined || String(value) === '0') {
    throw new ImportError('DB_ERROR', `Could not read ${field} after upsert`);
  }
  return String(value); // BIGINT stays a string
}

/** DATETIME from mysql2 (Date with timezone 'Z', or string with dateStrings) → epoch ms. */
function toEpochMs(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const ms = Date.parse(`${value.replace(' ', 'T')}Z`);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function valueFor(column: Column, sourceId: string, companyId: string | null, v: NormalizedVacancy): unknown {
  switch (column) {
    case 'source_id': return sourceId;
    case 'external_id': return v.externalId;
    case 'company_id': return companyId;
    case 'title': return v.title;
    case 'description': return v.description;
    case 'requirements': return v.requirements;
    case 'responsibilities': return v.responsibilities;
    case 'original_url': return v.originalUrl;
    case 'country_code': return v.countryCode;
    case 'region_name': return v.regionName;
    case 'city': return v.city;
    case 'address_text': return v.addressText;
    case 'work_format': return v.workFormat;
    case 'employment_type': return v.employmentType;
    case 'schedule_text': return v.scheduleText;
    case 'schedule_type': return v.scheduleType;
    case 'contract_type': return v.contractType;
    case 'salary_min': return v.salaryMin;
    case 'salary_max': return v.salaryMax;
    case 'currency': return v.currency;
    case 'salary_period': return v.salaryPeriod;
    case 'salary_gross': return v.salaryGross === null ? null : v.salaryGross ? 1 : 0;
    case 'experience_months_min': return v.experienceMonthsMin;
    case 'status': return v.status;
    case 'published_at': return v.publishedAt;
    case 'source_updated_at': return v.sourceUpdatedAt;
    case 'typical_position': return v.typicalPosition;
    case 'code_profession': return v.codeProfession;
    case 'specialisation': return v.specialisation;
    case 'region_code': return v.regionCode;
    case 'latitude': return v.latitude;
    case 'longitude': return v.longitude;
  }
}

export interface SourceInfo {
  id: string;
  enabled: boolean;
}

export class MysqlImportRepository {
  private columns: Column[] | null = null;

  constructor(private readonly pool: ImportDbPool, private readonly logger: ImportLogger) {}

  /** Borrow a connection with UTC session time zone; always released. */
  private async withConnection<T>(fn: (conn: ImportDbConnection) => Promise<T>): Promise<T> {
    let conn: ImportDbConnection;
    try {
      conn = await this.pool.getConnection();
    } catch (err) {
      throw new ImportError('DB_ERROR', `Cannot connect to MySQL (${describeError(err).code})`, { cause: err });
    }
    try {
      await conn.query("SET time_zone = '+00:00'");
      return await fn(conn);
    } finally {
      conn.release();
    }
  }

  async resolveSource(code: string): Promise<SourceInfo> {
    return this.withConnection(async conn => {
      const result = await conn.query('SELECT id, is_enabled FROM sources WHERE code = ?', [code]);
      const row = rows(result)[0];
      if (!row) {
        throw new ImportError('SOURCE_NOT_FOUND', `Source "${code}" is not registered in table sources (see 03_seed.sql)`);
      }
      return { id: String(row.id), enabled: Number(row.is_enabled) === 1 || row.is_enabled === true };
    });
  }

  /** Detect which canonical vacancy columns exist; fail fast on an incompatible schema. */
  async loadVacancyColumns(): Promise<Column[]> {
    if (this.columns) return this.columns;
    const found = await this.withConnection(async conn => {
      const result = await conn.query(
        "SELECT COLUMN_NAME AS column_name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vacancies'"
      );
      return new Set(rows(result).map(r => String(r.column_name ?? r.COLUMN_NAME).toLowerCase()));
    });
    const missing = BASE_COLUMNS.filter(c => !found.has(c));
    if (missing.length) {
      throw new ImportError('SCHEMA_MISMATCH', `Table vacancies lacks canonical columns: ${missing.join(', ')}`);
    }
    const optional = OPTIONAL_COLUMNS.filter(c => found.has(c));
    this.logger.info(
      { optionalColumns: optional, skippedOptionalColumns: OPTIONAL_COLUMNS.filter(c => !found.has(c)) },
      'Vacancy columns detected'
    );
    this.columns = [...BASE_COLUMNS, ...optional];
    return this.columns;
  }

  /**
   * Upsert one vacancy with its company and skills atomically.
   * A snapshot older than the stored one (by source_updated_at) is skipped.
   * On any error the transaction is rolled back and the error re-thrown.
   */
  async saveVacancy(sourceId: string, v: NormalizedVacancy): Promise<SaveOutcome> {
    const columns = await this.loadVacancyColumns();
    return this.withConnection(async conn => {
      await conn.beginTransaction();
      try {
        // QI14: lock and read the previous row of this (source, external_id).
        const prior = rows(await conn.query(
          'SELECT id, source_updated_at FROM vacancies WHERE source_id = ? AND external_id = ? FOR UPDATE',
          [sourceId, v.externalId]
        ))[0];
        if (prior) {
          const storedMs = toEpochMs(prior.source_updated_at);
          const incomingMs = v.sourceUpdatedAt ? toEpochMs(v.sourceUpdatedAt) : null;
          if (storedMs !== null && incomingMs !== null && incomingMs < storedMs) {
            await conn.rollback();
            return 'skipped_stale';
          }
        }

        // Q01: company (source-scoped), id via LAST_INSERT_ID on the same connection.
        let companyId: string | null = null;
        if (v.company) {
          await conn.query(
            `INSERT INTO companies (source_id, external_id, name, original_url)
             VALUES (?, ?, ?, ?) AS new_row
             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(companies.id), name = new_row.name, original_url = new_row.original_url`,
            [sourceId, v.company.externalId, v.company.name, v.company.originalUrl]
          );
          companyId = idOf(await conn.query('SELECT LAST_INSERT_ID() AS id'), 'id');
        }

        // Q02: vacancy upsert. last_seen_at is refreshed on every import.
        const updatable = columns.filter(c => c !== 'source_id' && c !== 'external_id');
        const sql =
          `INSERT INTO vacancies (${columns.join(', ')}, last_seen_at)
           VALUES (${columns.map(() => '?').join(', ')}, UTC_TIMESTAMP(6)) AS new_row
           ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(vacancies.id), ` +
          updatable.map(c => `${c} = new_row.${c}`).join(', ') +
          ', last_seen_at = UTC_TIMESTAMP(6)';
        await conn.query(sql, columns.map(c => valueFor(c, sourceId, companyId, v)));
        const vacancyId = idOf(await conn.query('SELECT LAST_INSERT_ID() AS id'), 'id');

        // Skills: replace links only when the source sent the complete list.
        if (v.skillsComplete) {
          const skillIds: string[] = [];
          for (const name of v.skills) {
            await conn.query(
              'INSERT INTO skills (name, normalized_name) VALUES (?, ?) ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(skills.id)',
              [name, normalizeSkillName(name)]
            );
            const id = idOf(await conn.query('SELECT LAST_INSERT_ID() AS id'), 'id');
            // Different spellings may collide under the column collation: keep one link.
            if (!skillIds.includes(id)) skillIds.push(id);
          }
          await conn.query('DELETE FROM vacancy_skills WHERE vacancy_id = ?', [vacancyId]);
          if (skillIds.length) {
            await conn.query(
              `INSERT INTO vacancy_skills (vacancy_id, skill_id, is_required) VALUES ${skillIds.map(() => '(?, ?, 0)').join(', ')}`,
              skillIds.flatMap(id => [vacancyId, id])
            );
          }
        }

        await conn.commit();
        return prior ? 'updated' : 'inserted';
      } catch (err) {
        try {
          await conn.rollback();
        } catch (rollbackErr) {
          this.logger.error({ externalId: v.externalId, ...describeError(rollbackErr) }, 'Rollback failed');
        }
        if (err instanceof ImportError) throw err;
        const { code, message } = describeError(err);
        throw new ImportError('DB_ERROR', `Saving vacancy failed: ${code} (${message})`, { cause: err });
      }
    });
  }
}
