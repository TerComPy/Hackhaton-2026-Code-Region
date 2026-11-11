import { randomBytes } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { db } from '../../config/db.js';
import { HttpError } from '../../lib/errors.js';
import {
  AI_PROVIDER, MAX_ATTEMPTS, PROMPT_VERSION, summarySchema,
  type SourceVacancy, type SummaryStatus, type SummaryView
} from './schema.js';

export interface AiScope { provider: string; model: string; version: string }
export const scopeFor = (model: string): AiScope =>
  ({ provider: AI_PROVIDER, model, version: PROMPT_VERSION });

const validId = /^[1-9][0-9]*$/;
function requireId(id: string): void {
  if (!validId.test(id)) throw new HttpError(400, 'Invalid vacancy ID', 'INVALID_ID');
}

interface SummaryRow extends RowDataPacket {
  vacancy_status: 'active' | 'archived';
  summary_status: SummaryStatus | null;
  result_json: string | object | null;
  error_code: string | null;
}

export async function getAiSummary(id: string, scope: AiScope | null): Promise<SummaryView> {
  requireId(id);
  const [rows] = await db.execute<SummaryRow[]>(
    'SELECT v.status AS vacancy_status, a.status AS summary_status, a.result_json, a.error_code ' +
    'FROM vacancies v LEFT JOIN vacancy_ai_summaries a ON a.vacancy_id=v.id ' +
    'AND a.source_hash=v.content_hash AND a.provider=? AND a.model=? AND a.prompt_version=? WHERE v.id=?',
    [scope?.provider ?? '', scope?.model ?? '', scope?.version ?? '', id]
  );
  const record = rows[0];
  if (!record) throw new HttpError(404, 'Vacancy not found', 'NOT_FOUND');
  if (!scope || record.vacancy_status !== 'active' || !record.summary_status)
    return { status: 'unavailable', display: 'original', summary: null };
  if (record.summary_status !== 'done' || record.result_json === null) {
    return {
      status: record.summary_status,
      display: 'original', summary: null,
      ...(record.summary_status === 'failed' && record.error_code
        ? { errorCode: record.error_code } : {})
    };
  }
  let value: unknown = record.result_json;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); }
    catch { return { status: 'failed', display: 'original', summary: null, errorCode: 'INVALID_CACHE' }; }
  }
  const parsed = summarySchema.safeParse(value);
  if (!parsed.success)
    return { status: 'failed', display: 'original', summary: null, errorCode: 'INVALID_CACHE' };
  return { status: 'done', display: 'ai', summary: parsed.data };
}

export async function queueAiSummary(id: string, scope: AiScope): Promise<SummaryView> {
  requireId(id);
  const [created] = await db.execute<ResultSetHeader>(
    'INSERT INTO vacancy_ai_summaries(vacancy_id,provider,model,prompt_version,source_hash) ' +
    'SELECT id,?,?,?,content_hash FROM vacancies WHERE id=? AND status=\'active\' ' +
    'ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(vacancy_ai_summaries.id)',
    [scope.provider, scope.model, scope.version, id]
  );
  if (created.affectedRows === 0) {
    const current = await getAiSummary(id, scope);
    if (current.status === 'unavailable')
      throw new HttpError(404, 'Active vacancy not found', 'NOT_FOUND');
  }
  await db.execute(
    'UPDATE vacancy_ai_summaries SET status=\'pending\',result_json=NULL,error_code=NULL,' +
    'lease_token=NULL,lease_expires_at=NULL,completed_at=NULL,available_at=UTC_TIMESTAMP(6) ' +
    'WHERE vacancy_id=? AND provider=? AND model=? AND prompt_version=? ' +
    'AND source_hash=(SELECT content_hash FROM vacancies WHERE id=?) ' +
    'AND status=\'failed\' AND attempts<?',
    [id, scope.provider, scope.model, scope.version, id, MAX_ATTEMPTS]
  );
  return getAiSummary(id, scope);
}

export interface ClaimedJob { id: string; vacancyId: string; lease: Buffer; attempts: number }
interface JobRow extends RowDataPacket { id: string; vacancy_id: string; attempts: number }

/** One short transaction; release the row lock BEFORE the LLM HTTP request. */
export async function claimAiJob(scope: AiScope): Promise<ClaimedJob | null> {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<JobRow[]>(
      'SELECT id,vacancy_id,attempts FROM vacancy_ai_summaries ' +
      'WHERE status=\'pending\' AND available_at<=UTC_TIMESTAMP(6) AND provider=? AND model=? AND prompt_version=? ' +
      'ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED',
      [scope.provider, scope.model, scope.version]
    );
    const row = rows[0];
    if (!row) { await conn.rollback(); return null; }
    const lease = randomBytes(16);
    const [updated] = await conn.execute<ResultSetHeader>(
      'UPDATE vacancy_ai_summaries SET status=\'processing\',attempts=attempts+1,lease_token=?,' +
      'lease_expires_at=TIMESTAMPADD(SECOND,90,UTC_TIMESTAMP(6)),error_code=NULL ' +
      'WHERE id=? AND status=\'pending\'',
      [lease, row.id]
    );
    if (updated.affectedRows !== 1) throw new Error('AI claim lost');
    await conn.commit();
    return {
      id: String(row.id),
      vacancyId: String(row.vacancy_id),
      lease,
      attempts: row.attempts + 1
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}

export async function currentClaimedVacancy(job: ClaimedJob): Promise<SourceVacancy | null> {
  const [rows] = await db.execute<(RowDataPacket & SourceVacancy)[]>(
    'SELECT v.id,v.title,v.description,v.requirements,v.responsibilities,v.schedule_text,' +
    'v.work_format,v.employment_type,v.contract_type,v.salary_min,v.salary_max,v.currency,v.salary_period ' +
    'FROM vacancy_ai_summaries a JOIN vacancies v ON v.id=a.vacancy_id AND v.content_hash=a.source_hash ' +
    'WHERE a.id=? AND a.status=\'processing\' AND a.lease_token=? ' +
    'AND a.lease_expires_at>UTC_TIMESTAMP(6) AND v.status=\'active\'',
    [job.id, job.lease]
  );
  return rows[0] ?? null;
}

export async function finishAiJob(job: ClaimedJob, data: object): Promise<boolean> {
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE vacancy_ai_summaries SET status=\'done\',result_json=?,' +
    'lease_token=NULL,lease_expires_at=NULL,error_code=NULL,completed_at=UTC_TIMESTAMP(6) ' +
    'WHERE id=? AND status=\'processing\' AND lease_token=? AND lease_expires_at>UTC_TIMESTAMP(6)',
    [JSON.stringify(data), job.id, job.lease]
  );
  return result.affectedRows === 1;
}

export async function failAiJob(
  job: ClaimedJob, code: string, retryable: boolean, retryAfterSeconds = 0
): Promise<boolean> {
  const retry = retryable && job.attempts < MAX_ATTEMPTS;
  const delay = Math.max(
    Math.min(120, 10 * 2 ** Math.max(0, job.attempts - 1)),
    Math.min(120, retryAfterSeconds)
  );
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE vacancy_ai_summaries SET status=?,result_json=NULL,error_code=?,' +
    'lease_token=NULL,lease_expires_at=NULL,' +
    'completed_at=IF(?=1,NULL,UTC_TIMESTAMP(6)),' +
    'available_at=TIMESTAMPADD(SECOND,?,UTC_TIMESTAMP(6)) ' +
    'WHERE id=? AND status=\'processing\' AND lease_token=? AND lease_expires_at>UTC_TIMESTAMP(6)',
    [retry ? 'pending' : 'failed', retry ? null : code, retry ? 1 : 0,
      delay, job.id, job.lease]
  );
  return result.affectedRows === 1;
}

export async function recoverAiLeases(scope: AiScope): Promise<number> {
  const [result] = await db.execute<ResultSetHeader>(
    'UPDATE vacancy_ai_summaries SET status=IF(attempts<?,\'pending\',\'failed\'),' +
    'error_code=IF(attempts<?,NULL,\'LEASE_EXPIRED\'),' +
    'available_at=TIMESTAMPADD(SECOND,15,UTC_TIMESTAMP(6)),' +
    'completed_at=IF(attempts<?,NULL,UTC_TIMESTAMP(6)),lease_token=NULL,lease_expires_at=NULL ' +
    'WHERE status=\'processing\' AND lease_expires_at<=UTC_TIMESTAMP(6) ' +
    'AND provider=? AND model=? AND prompt_version=?',
    [MAX_ATTEMPTS, MAX_ATTEMPTS, MAX_ATTEMPTS, scope.provider, scope.model, scope.version]
  );
  return result.affectedRows;
}
