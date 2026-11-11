import { createHash } from 'node:crypto';
import { ImportError, describeError } from '../errors.js';
import { defaultSleep } from '../http.js';
import type { FetchOptions, ImportLogger, VacancySourceAdapter } from '../types.js';
import { runImport, type ImportReport, type ImportStore } from './import.service.js';
import type { MysqlRunRepository, RunCounters, RunStatus } from '../repositories/run.repository.js';

export function canonicalScope(options: {regionCode?: string | undefined; text?: string | undefined}, endpoint: string) {
  // Page size, offset, run mode and moving date windows are NOT filter identity.
  const json=JSON.stringify({version:1,endpoint:new URL(endpoint).toString().replace(/\/+$/,''),regionCode:options.regionCode??null,text:options.text?.normalize('NFC').trim()||null});
  return {json,hash:createHash('sha256').update(json).digest('hex')};
}
export interface SyncOptions extends FetchOptions {
  mode?: 'full'|'incremental'; maxPages?: number; maxRecords?: number; pauseMs?: number;
}
export interface SyncReport extends ImportReport {
  runId: string; status: RunStatus; pages: number; scopeHash: string; windowFrom: string|null; windowTo: string; errorCode: string|null;
}
export async function runSync(adapter: VacancySourceAdapter, options: SyncOptions, deps: {
  store: ImportStore; runs: Pick<MysqlRunRepository,'start'|'checkpoint'|'finish'>; logger: ImportLogger; endpoint: string;
  /** Runtime probe result, never a user assertion about live API behavior. */
  offsetSemantics: 'page'|'record'|'unknown';
  /** Enabled only for verified mock contract until live date filter semantics are verified. */
  modifiedWindowVerified?: boolean; sleep?: typeof defaultSleep;
}): Promise<SyncReport> {
  const maxPages=options.maxPages??1, maxRecords=options.maxRecords??1000, pause=options.pauseMs??500;
  if(!Number.isInteger(maxPages)||maxPages<1||maxPages>100||!Number.isInteger(maxRecords)||maxRecords<1||maxRecords>10000||!Number.isInteger(pause)||pause<0||pause>60000||!Number.isInteger(options.limit)||options.limit<1||options.limit>100||!Number.isSafeInteger(options.offset??0)||(options.offset??0)<0)throw new ImportError('INVALID_OPTIONS','Invalid sync bounds');
  if(options.mode==='incremental'&&!deps.modifiedWindowVerified)throw new ImportError('INVALID_OPTIONS','Incremental date window semantics are not verified for this endpoint');
  const source=await deps.store.resolveSource(adapter.sourceCode);
  if(!source.enabled)throw new ImportError('SOURCE_DISABLED','Source disabled');
  await deps.store.loadVacancyColumns();
  const scope=canonicalScope(options,deps.endpoint);
  const run=await deps.runs.start(source.id,scope.hash,scope.json,options.mode??'full');
  const report:SyncReport={source:adapter.sourceCode,dryRun:false,startedAt:new Date().toISOString(),finishedAt:'',durationMs:0,received:0,totalReportedBySource:null,normalized:0,rejected:[],duplicatesInBatch:0,inserted:0,updated:0,skippedStale:0,failed:[],aborted:false,runId:run.id,status:'failed',pages:0,scopeHash:scope.hash,windowFrom:run.windowFrom,windowTo:run.windowTo,errorCode:null};
  const n:RunCounters={recordsSeen:0,inserted:0,updated:0,skipped:0};
  const limit=Math.min(options.limit,maxRecords);
  let exhausted=false, offset=options.offset??0;
  const signatures=new Set<string>();
  try {
    for(let page=0;page<maxPages;page++){
      if(options.signal?.aborted){report.aborted=true;report.errorCode='ABORTED';break;}
      // Keep page size fixed: changing limit in page-index mode would skip records.
      if(n.recordsSeen+limit>maxRecords){report.errorCode='RECORD_LIMIT';break;}
      const fetched=await adapter.fetch({...options,limit,offset,...(deps.modifiedWindowVerified&&options.mode==='incremental'?{modifiedFrom:run.windowFrom??'1970-01-01 00:00:00.000000',modifiedTo:run.windowTo}:{})});
      report.pages++;report.received+=fetched.received;n.recordsSeen=report.received;
      report.totalReportedBySource=fetched.total;
      if(fetched.received>limit){report.errorCode='SOURCE_PAGE_LIMIT';await deps.runs.checkpoint(run,n);break;}
      const signature=JSON.stringify(fetched.vacancies.map(v=>v.externalId).sort());
      if(fetched.received>0&&signatures.has(signature)){report.errorCode='REPEATED_PAGE';await deps.runs.checkpoint(run,n);break;}
      signatures.add(signature);
      // Existing per-vacancy transactions and counters remain the single save path.
      const one=await runImport({sourceCode:adapter.sourceCode,fetch:async()=>fetched}, {...options,offset,dryRun:false}, {store:deps.store,logger:deps.logger});
      report.normalized+=one.normalized;report.rejected.push(...one.rejected);report.failed.push(...one.failed);
      report.duplicatesInBatch+=one.duplicatesInBatch;report.inserted+=one.inserted;report.updated+=one.updated;report.skippedStale+=one.skippedStale;
      n.inserted=report.inserted;n.updated=report.updated;n.skipped=report.skippedStale+report.duplicatesInBatch+report.rejected.length;
      await deps.runs.checkpoint(run,n);
      if(one.aborted){report.aborted=true;report.errorCode=options.signal?.aborted?'ABORTED':'SAVE_ABORTED';break;}
      if(one.failed.length||one.rejected.length){report.errorCode=one.failed[0]?.code??'REJECTED_RECORDS';break;}
      // An exact total is advisory; require an empty/short terminal page. Unknown
      // offset mode may finish only a short first page with no contradictory total.
      const short=fetched.received<limit;
      const covered=deps.offsetSemantics==='record'?offset+fetched.received:offset*limit+fetched.received;
      if(short&&(fetched.total===null||covered>=fetched.total)){exhausted=(options.offset??0)===0;break;}
      if(deps.offsetSemantics==='unknown'){report.errorCode='OFFSET_UNVERIFIED';break;}
      if(page+1===maxPages){report.errorCode='PAGE_LIMIT';break;}
      offset+=deps.offsetSemantics==='page'?1:limit;
      await (deps.sleep??defaultSleep)(pause,options.signal);
    }
    report.status=exhausted&&!report.errorCode?'succeeded':'partial';
    if(!exhausted&&!report.errorCode)report.errorCode='INCOMPLETE_SCOPE';
  }catch(e){report.errorCode=options.signal?.aborted?'ABORTED':describeError(e).code;report.status=report.pages>0?'partial':'failed';report.aborted=options.signal?.aborted??false;}
  report.finishedAt=new Date().toISOString();report.durationMs=Date.parse(report.finishedAt)-Date.parse(report.startedAt);
  await deps.runs.finish(run,n,report.status,report.errorCode);
  return report;
}
