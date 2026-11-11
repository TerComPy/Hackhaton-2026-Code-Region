import { ImportError } from '../errors.js';
import type { ImportDbConnection, ImportDbPool } from '../types.js';

export interface RunCounters { recordsSeen: number; inserted: number; updated: number; skipped: number }
export type RunStatus = 'succeeded' | 'partial' | 'failed';
export interface RunHandle { id: string; sourceId: string; windowFrom: string | null; windowTo: string }
const rows = (r: [unknown, unknown]) => r[0] as Record<string, unknown>[];

/** Canonical QI01-QI04; unique active_scope_hash is the cross-process lock. */
export class MysqlRunRepository {
  constructor(private readonly pool: ImportDbPool) {}
  private async use<T>(fn: (c: ImportDbConnection) => Promise<T>): Promise<T> {
    const c = await this.pool.getConnection();
    try { await c.query("SET time_zone = '+00:00'"); return await fn(c); }
    finally { c.release(); }
  }
  async cursor(sourceId: string, scopeHash: string): Promise<string | null> {
    return this.use(async c => {
      const row = rows(await c.query("SELECT MAX(window_to) modified_through FROM import_runs WHERE source_id=? AND scope_hash=UNHEX(?) AND status='succeeded'", [sourceId, scopeHash]))[0];
      return row?.modified_through == null ? null : String(row.modified_through);
    });
  }
  async start(sourceId: string, scopeHash: string, scopeJson: string, mode: 'full' | 'incremental'): Promise<RunHandle> {
    return this.use(async c => {
      await c.beginTransaction();
      try {
        const prior = rows(await c.query("SELECT MAX(window_to) modified_through FROM import_runs WHERE source_id=? AND scope_hash=UNHEX(?) AND status='succeeded'", [sourceId, scopeHash]))[0];
        // Small overlap covers timestamp precision and boundary updates.
        const from = mode === 'incremental' && prior?.modified_through != null
          ? String(rows(await c.query('SELECT DATE_FORMAT(DATE_SUB(?, INTERVAL 60 SECOND), \'%Y-%m-%d %H:%i:%s.%f\') value', [prior.modified_through]))[0]!.value) : null;
        const to = String(rows(await c.query("SELECT DATE_FORMAT(UTC_TIMESTAMP(6), '%Y-%m-%d %H:%i:%s.%f') value"))[0]!.value);
        await c.query('INSERT INTO import_runs(source_id,scope_hash,scope_json,mode,window_from,window_to) VALUES (?,UNHEX(?),?,?,?,?)', [sourceId,scopeHash,scopeJson,mode,from,to]);
        const id = String(rows(await c.query('SELECT LAST_INSERT_ID() id'))[0]!.id);
        await c.commit();
        return { id, sourceId, windowFrom: from, windowTo: to };
      } catch (e) {
        await c.rollback();
        if ((e as {code?: string}).code === 'ER_DUP_ENTRY') throw new ImportError('SCOPE_BUSY','A run for this source/scope is already running; verify stopped process before explicit recovery');
        throw e;
      }
    });
  }
  async checkpoint(run: RunHandle, n: RunCounters): Promise<void> {
    await this.update(run,n);
  }
  private async update(run: RunHandle, n: RunCounters, status?: RunStatus, error: string | null = null): Promise<void> {
    await this.use(async c => {
      const result = await c.query(`UPDATE import_runs SET records_seen=?,inserted_count=?,updated_count=?,skipped_count=?${status ? ',status=?,error_code=?,finished_at=UTC_TIMESTAMP(6)' : ''} WHERE id=? AND source_id=? AND status='running'`,
        [n.recordsSeen,n.inserted,n.updated,n.skipped,...(status ? [status,error] : []),run.id,run.sourceId]);
      if ((result[0] as { affectedRows: number }).affectedRows !== 1) throw new ImportError('DB_ERROR','Import run is no longer running');
    });
  }
  async finish(run: RunHandle, n: RunCounters, status: RunStatus, error: string | null): Promise<void> { await this.update(run,n,status,error); }
  /** Operator-only CLI, NOT an anonymous/user-facing HTTP endpoint. QI04. */
  async audit(pageSize=20, offset=0): Promise<Record<string,unknown>[]> {
    if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(pageSize)||pageSize<1||pageSize>100) throw new ImportError('INVALID_OPTIONS','Invalid audit pagination');
    return this.use(async c => rows(await c.query('SELECT r.*,s.name source_name FROM import_runs r JOIN sources s ON s.id=r.source_id ORDER BY r.started_at DESC,r.id DESC LIMIT ? OFFSET ?', [pageSize,offset])));
  }
  /** Never automatic: caller must establish the old process is stopped. */
  async recover(id: string, sourceId: string): Promise<void> {
    await this.use(async c=>{
      const result=await c.query("UPDATE import_runs SET status='failed',finished_at=UTC_TIMESTAMP(6),error_code='PROCESS_STOPPED' WHERE id=? AND source_id=? AND status='running'",[id,sourceId]);
      if((result[0] as {affectedRows:number}).affectedRows!==1)throw new ImportError('INVALID_OPTIONS','No matching running import to recover');
    });
  }
}
