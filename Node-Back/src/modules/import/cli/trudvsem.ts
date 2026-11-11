#!/usr/bin/env node
// Standalone importer for "Работа России". Does not start Express.
//
//   npx tsx src/modules/import/cli/trudvsem.ts --dry-run --limit 20
//   npx tsx src/modules/import/cli/trudvsem.ts --region 7800000000000 --limit 100
//   npx tsx src/modules/import/cli/trudvsem.ts --probe-offset
//
// Run from Node-Back/ so dotenv finds .env. Exit codes: 0 ok, 1 fatal error,
// 2 partial (some vacancies failed to save or saving was aborted).

import { parseArgs } from 'node:util';
import { z } from 'zod';
import { TrudvsemAdapter, TRUDVSEM_MAX_LIMIT } from '../adapters/trudvsem.adapter.js';
import { MysqlRunRepository } from '../repositories/run.repository.js';
import { runSync } from '../services/sync.service.js';
import { ImportError, describeError } from '../errors.js';
import { runImport, type ImportStore } from '../services/import.service.js';
import type { ImportDbPool, ImportLogger } from '../types.js';

const HELP = `Usage: tsx src/modules/import/cli/trudvsem.ts [options]

  --limit <1..${TRUDVSEM_MAX_LIMIT}>      vacancies to request (default 20)
  --region <code>       13-digit region code, e.g. 7800000000000 (default: all regions)
  --text <query>        full-text filter passed to the API
  --offset <n>          raw API offset (default 0; unit is unverified, see --probe-offset)
  --dry-run             fetch + normalize + print, never touch MySQL
  --preview <n>         normalized records to print in dry-run (default 3)
  --probe-offset        check whether offset is a page or a record index, then exit
  --timeout-ms <ms>     per-request timeout (default 15000)
  --retries <n>         retries for transient errors (default 2)
  --api-base-url <url>  override the API endpoint (QA mock servers only)
  --verbose             debug logs
  --sync                journaled synchronization (legacy one-page import remains available)
  --max-pages <1..100>   sync page cap; probes offset before requesting multiple pages
  --max-records <n>     sync record cap (1..10000, default 1000)
  --pause-ms <ms>       pause between pages (default 500)
  --mode <full|incremental> incremental requires verified date filters (mock only for now)
  --mock-modified-window assert the local mock implements modifiedFrom/modifiedTo
  --list-runs           operator DB audit, last 20 runs (QI04)
  --fail-run <id> --confirm-stopped  recover a hard-killed run after verifying it stopped
  --help`;

const argsSchema = z.object({
  sync: z.boolean().default(false),
  maxPages: z.coerce.number().int().min(1).max(100).default(1),
  maxRecords: z.coerce.number().int().min(1).max(10000).default(1000),
  pauseMs: z.coerce.number().int().min(0).max(60000).default(500),
  mode: z.enum(['full','incremental']).default('full'),
  mockModifiedWindow: z.boolean().default(false),
  listRuns: z.boolean().default(false),
  failRun: z.string().regex(/^[1-9][0-9]*$/).optional(),
  confirmStopped: z.boolean().default(false),
  limit: z.coerce.number().int().min(1).max(TRUDVSEM_MAX_LIMIT).default(20),
  region: z.string().regex(/^\d{13}$/, 'region must be 13 digits').optional(),
  text: z.string().trim().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  dryRun: z.boolean().default(false),
  preview: z.coerce.number().int().min(0).max(TRUDVSEM_MAX_LIMIT).default(3),
  probeOffset: z.boolean().default(false),
  timeoutMs: z.coerce.number().int().min(1000).max(120_000).default(15_000),
  retries: z.coerce.number().int().min(0).max(5).default(2),
  apiBaseUrl: z
    .string()
    .refine(v => { try { return ['http:', 'https:'].includes(new URL(v).protocol); } catch { return false; } }, 'must be an http(s) URL')
    .optional(),
  verbose: z.boolean().default(false)
});

/** JSON-lines logger on stderr with the pino call signature; stdout carries the report. */
function createCliLogger(verbose: boolean): ImportLogger {
  const write = (level: string) => (obj: object, msg?: string) => {
    process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level, msg, ...obj })}\n`);
  };
  return { debug: verbose ? write('debug') : () => undefined, info: write('info'), warn: write('warn'), error: write('error') };
}

async function main(): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      options: {
        limit: { type: 'string' }, region: { type: 'string' }, text: { type: 'string' }, offset: { type: 'string' },
        'dry-run': { type: 'boolean' }, preview: { type: 'string' }, 'probe-offset': { type: 'boolean' },
        'timeout-ms': { type: 'string' }, retries: { type: 'string' }, 'api-base-url': { type: 'string' },
        sync: { type: 'boolean' }, 'max-pages': { type: 'string' }, 'max-records': { type: 'string' },
        'pause-ms': { type: 'string' }, mode: { type: 'string' }, 'mock-modified-window': { type: 'boolean' },
        'list-runs': { type: 'boolean' }, 'fail-run': { type: 'string' }, 'confirm-stopped': { type: 'boolean' },
        verbose: { type: 'boolean' }, help: { type: 'boolean' }
      },
      strict: true,
      allowPositionals: false
    }));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : 'Invalid arguments'}\n\n${HELP}\n`);
    return 1;
  }
  if (values.help) {
    process.stdout.write(`${HELP}\n`);
    return 0;
  }
  const parsed = argsSchema.safeParse({
    sync: values.sync, maxPages: values['max-pages'], maxRecords: values['max-records'], pauseMs: values['pause-ms'],
    mode: values.mode, mockModifiedWindow: values['mock-modified-window'],listRuns:values['list-runs'],failRun:values['fail-run'],confirmStopped:values['confirm-stopped'],
    limit: values.limit, region: values.region, text: values.text, offset: values.offset,
    dryRun: values['dry-run'], preview: values.preview, probeOffset: values['probe-offset'],
    timeoutMs: values['timeout-ms'], retries: values.retries, apiBaseUrl: values['api-base-url'], verbose: values.verbose
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    process.stderr.write(`Invalid option ${issue?.path.join('.') ?? ''}: ${issue?.message ?? ''}\n\n${HELP}\n`);
    return 1;
  }
  const args = parsed.data;
  if(args.apiBaseUrl){const u=new URL(args.apiBaseUrl);if(u.username||u.password||u.search||u.hash)throw new ImportError('INVALID_OPTIONS','Endpoint must not contain credentials, query or fragment');}
  if(!args.sync && (values['max-pages']!==undefined||values['max-records']!==undefined||values['pause-ms']!==undefined||values.mode!==undefined||args.mockModifiedWindow))throw new ImportError('INVALID_OPTIONS','Sync controls require --sync (or npm run sync:trudvsem)');
  const localMock = args.apiBaseUrl && ['127.0.0.1','localhost','[::1]'].includes(new URL(args.apiBaseUrl).hostname);
  if (args.mockModifiedWindow && !localMock) throw new ImportError('INVALID_OPTIONS','Mock date capability requires a loopback endpoint');
  if ((args.sync || args.listRuns || args.failRun) && args.dryRun) throw new ImportError('INVALID_OPTIONS','Sync/audit/recovery requires database mode');
  if (args.failRun && !args.confirmStopped) throw new ImportError('INVALID_OPTIONS','Recovery requires --confirm-stopped');
  if(args.sync && args.mode==='incremental'&&!args.mockModifiedWindow)throw new ImportError('INVALID_OPTIONS','Live incremental is disabled until date window semantics are verified');
  const logger = createCliLogger(args.verbose);
  const controller = new AbortController();
  const onSignal = () => {
    logger.warn({}, 'Interrupt received, finishing the current vacancy and stopping');
    controller.abort();
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  if (args.apiBaseUrl) logger.warn({ apiBaseUrl: args.apiBaseUrl }, 'Using a non-default API endpoint');
  const adapter = new TrudvsemAdapter({
    logger,
    http: { timeoutMs: args.timeoutMs, maxAttempts: args.retries + 1 },
    ...(args.apiBaseUrl ? { baseUrl: args.apiBaseUrl.replace(/\/+$/, '') } : {})
  });

  if (args.probeOffset) {
    const probe = await adapter.probeOffset(5, controller.signal, {regionCode:args.region,text:args.text});
    process.stdout.write(`${JSON.stringify(probe, null, 2)}\n`);
    return 0;
  }

  // The shared pool is imported lazily: dry-run never opens a MySQL connection.
  let pool: (ImportDbPool & { end(): Promise<void> }) | null = null;
  try {
    let store: ImportStore | undefined;
    if (!args.dryRun) {
      const [{ db }, { MysqlImportRepository }] = await Promise.all([
        import('../../../config/db.js'),
        import('../repositories/import.repository.js')
      ]);
      pool = db;
      store = new MysqlImportRepository(db, logger);
    }
    if (pool && (args.listRuns || args.failRun)) {
      const runs = new MysqlRunRepository(pool);
      if(args.listRuns) process.stdout.write(`${JSON.stringify(await runs.audit())}\n`);
      else { const source=await store!.resolveSource('trudvsem');await runs.recover(args.failRun!,source.id);process.stdout.write('"Recovered stopped run"\n'); }
      return 0;
    }
    if(args.sync && pool && store){
      let semantics: 'page'|'record'|'unknown' = 'unknown';
      if(args.maxPages>1){const source=await store.resolveSource(adapter.sourceCode);if(!source.enabled)throw new ImportError('SOURCE_DISABLED','Source disabled');try{semantics=(await adapter.probeOffset(5,controller.signal,{regionCode:args.region,text:args.text})).semantics;}catch(e){logger.warn(describeError(e),'Offset probe unavailable; safe one-page fallback');}}
      const report=await runSync(adapter,{limit:args.limit,offset:args.offset,regionCode:args.region,text:args.text,signal:controller.signal,mode:args.mode,maxPages:args.maxPages,maxRecords:args.maxRecords,pauseMs:args.pauseMs},{store,runs:new MysqlRunRepository(pool),logger,endpoint:args.apiBaseUrl??'https://opendata.trudvsem.ru/api/v1/vacancies',offsetSemantics:semantics,modifiedWindowVerified:args.mockModifiedWindow});
      process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
      return report.status==='succeeded'?0:report.status==='partial'?2:1;
    }
    const report = await runImport(
      adapter,
      { limit: args.limit, offset: args.offset, regionCode: args.region, text: args.text, dryRun: args.dryRun, signal: controller.signal },
      { logger, store, previewLimit: args.preview }
    );
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.failed.length > 0 || report.aborted ? 2 : 0;
  } finally {
    // The CLI owns the shared pool lifecycle; reusable code never closes it.
    if (pool) await pool.end().catch(() => undefined);
  }
}

main().then(
  code => { process.exitCode = code; },
  (err: unknown) => {
    const { code, message } = describeError(err);
    process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level: 'error', msg: 'Import failed', code, message })}\n`);
    process.exitCode = 1;
  }
);
