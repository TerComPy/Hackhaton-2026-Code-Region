// Source-independent contract of the vacancy import module.
// Field names follow the canonical MySQL schema (manhattanattack/hackaton-sql-scheme),
// written in camelCase. Adapters produce NormalizedVacancy; the repository stores it.

export const WORK_FORMATS = ['onsite', 'remote', 'hybrid', 'unknown'] as const;
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'internship', 'unknown'] as const;
export const SCHEDULE_TYPES = ['five_two', 'six_one', 'shift', 'flexible', 'other', 'unknown'] as const;
export const CONTRACT_TYPES = ['permanent', 'fixed_term', 'unknown'] as const;
export const SALARY_PERIODS = ['hour', 'shift', 'day', 'week', 'month', 'year', 'unknown'] as const;
export const VACANCY_STATUSES = ['active', 'archived'] as const;

export type WorkFormat = (typeof WORK_FORMATS)[number];
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];
export type ContractType = (typeof CONTRACT_TYPES)[number];
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];
export type VacancyStatus = (typeof VACANCY_STATUSES)[number];

export interface NormalizedCompany {
  /** Stable company ID inside the source (companies.external_id). */
  externalId: string;
  name: string;
  originalUrl: string | null;
}

/**
 * One vacancy in the canonical shape. Unknown facts are `null` or `'unknown'`,
 * never guessed. Contact data (names, phones, e-mails) is never present here.
 * Timestamps are UTC strings in MySQL DATETIME(6) format: `YYYY-MM-DD HH:MM:SS.ffffff`.
 */
export interface NormalizedVacancy {
  sourceCode: string;
  /** Unique inside the source; Trudvsem: `companycode:id`. */
  externalId: string;
  company: NormalizedCompany | null;
  title: string;
  description: string;
  requirements: string | null;
  responsibilities: string | null;
  originalUrl: string;
  countryCode: string | null;
  regionName: string | null;
  city: string | null;
  addressText: string | null;
  workFormat: WorkFormat;
  employmentType: EmploymentType;
  scheduleText: string | null;
  scheduleType: ScheduleType;
  contractType: ContractType;
  salaryMin: number | null;
  salaryMax: number | null;
  /** ISO 4217, e.g. RUB. Never converted between currencies. */
  currency: string | null;
  salaryPeriod: SalaryPeriod;
  /** null = unknown, true = before tax, false = net. */
  salaryGross: boolean | null;
  /** null = unknown, 0 = explicitly no experience required. */
  experienceMonthsMin: number | null;
  status: VacancyStatus;
  publishedAt: string | null;
  sourceUpdatedAt: string | null;
  /**
   * Profession / region fields. They exist in the newer canonical schema
   * (upstream 4ce04c4) but not in the pinned baseline efe6b9d. The repository
   * writes them only if the columns exist in the connected database.
   */
  typicalPosition: string | null;
  codeProfession: string | null;
  specialisation: string | null;
  regionCode: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Display names, deduplicated by normalized form. */
  skills: string[];
  /** True only if the source sent the full skill list for this card. */
  skillsComplete: boolean;
}

export interface FetchOptions {
  /** Source-specific region code (Trudvsem: 13-digit code, e.g. 7800000000000). */
  regionCode?: string | undefined;
  text?: string | undefined;
  /** 1..100 records per request. */
  limit: number;
  /** Passed to the source unchanged; its unit is source-specific (see docs). */
  offset?: number | undefined;
  signal?: AbortSignal | undefined;
}

/** A record the adapter could not normalize. Contains no personal data. */
export interface RejectedRecord {
  index: number;
  externalId: string | null;
  reason: string;
}

export interface FetchResult {
  vacancies: NormalizedVacancy[];
  rejected: RejectedRecord[];
  /** Number of raw records in the response. */
  received: number;
  /** Total reported by the source for the query, if any. */
  total: number | null;
}

export interface VacancySourceAdapter {
  readonly sourceCode: string;
  fetch(options: FetchOptions): Promise<FetchResult>;
}

/** pino-compatible subset, so the shared `logger` can be injected directly. */
export interface ImportLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

/**
 * Minimal subset of mysql2/promise used by the importer. The project pool
 * (`db` from src/config/db.ts) satisfies it structurally, so tests can inject a fake.
 */
export interface ImportDbConnection {
  query(sql: string, values?: unknown[]): Promise<[unknown, unknown]>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

export interface ImportDbPool {
  getConnection(): Promise<ImportDbConnection>;
}

export type SaveOutcome = 'inserted' | 'updated' | 'skipped_stale';
