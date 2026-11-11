import { describe,it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalScope,runSync } from '../../src/modules/import/services/sync.service.js';
import { mapTrudvsemVacancy } from '../../src/modules/import/adapters/trudvsem.mapper.js';
import { rawVacancy,captureLogger } from './helpers.js';

const mapped=mapTrudvsemVacancy(rawVacancy(),0);if(!mapped.ok)throw Error('fixture');
const vacancy=mapped.vacancy;
function setup(pages:any[], semantics:'page'|'record'|'unknown'='page'){
 const calls:any[]=[],finished:any[]=[],saved:any[]=[];
 const adapter={sourceCode:'trudvsem',async fetch(o:any){calls.push(o);const result=pages[calls.length-1];if(result instanceof Error)throw result;return result??page([]);}};
 const store={async resolveSource(){return {id:'1',enabled:true};},async loadVacancyColumns(){return [];},async saveVacancy(_s:string,v:any):Promise<'inserted'|'updated'|'skipped_stale'>{saved.push(v);return 'inserted' as const;}};
 const runs={async start(){return {id:'1',sourceId:'1',windowFrom:'2026-11-01 00:00:00.000000',windowTo:'2026-11-11 00:00:00.000000'};},async checkpoint(){},async finish(...args:any[]){finished.push(args);}};
 return {adapter,store,runs,calls,saved,finished,deps:{store,runs,logger:captureLogger(),endpoint:'http://localhost/mock',offsetSemantics:semantics,sleep:async()=>{}}};
}
function page(ids:string[],total:number|null=null){return {vacancies:ids.map(externalId=>({...vacancy,externalId})),received:ids.length,total,rejected:[]};}
const opts={limit:2,maxPages:5,maxRecords:20,pauseMs:0};
describe('journaled sync safety',()=>{
 it('scope ignores run mechanics and normalizes Unicode/filter whitespace',()=>{
  assert.deepEqual(canonicalScope({text:'  cafe\u0301 ',regionCode:'77'},'http://LOCALHOST/mock/'),canonicalScope({regionCode:'77',text:'caf\u00e9'},'http://localhost/mock'));
  assert.notEqual(canonicalScope({text:'a'},'http://localhost/mock').hash,canonicalScope({text:'b'},'http://localhost/mock').hash);
 });
 it('walks page offsets and pauses until terminal page',async()=>{const s=setup([page(['a','b']),page(['c'])]);const r=await runSync(s.adapter,opts,s.deps);assert.equal(r.status,'succeeded');assert.deepEqual(s.calls.map(c=>c.offset),[0,1]);assert.equal(r.inserted,3);});
 it('walks record offsets without changing page size',async()=>{const s=setup([page(['a','b']),page(['c'])],'record');await runSync(s.adapter,opts,s.deps);assert.deepEqual(s.calls.map(c=>c.offset),[0,2]);});
 it('unverified offsets stay one page and partial',async()=>{const s=setup([page(['a','b'])],'unknown');const r=await runSync(s.adapter,opts,s.deps);assert.equal(s.calls.length,1);assert.equal(r.status,'partial');assert.equal(r.errorCode,'OFFSET_UNVERIFIED');});
 it('single short page with contradicting total cannot succeed',async()=>{const s=setup([page(['a'],99)],'unknown');assert.equal((await runSync(s.adapter,opts,s.deps)).status,'partial');});
 it('page cap cannot advance cursor',async()=>{const s=setup([page(['a','b'])]);const r=await runSync(s.adapter,{...opts,maxPages:1},s.deps);assert.equal(r.errorCode,'PAGE_LIMIT');assert.equal(s.finished[0][2],'partial');});
 it('record cap never changes size of later pages',async()=>{const s=setup([page(['a','b'])]);const r=await runSync(s.adapter,{...opts,maxRecords:3},s.deps);assert.equal(r.errorCode,'RECORD_LIMIT');assert.equal(s.calls.length,1);});
 it('repeated pages stop without saving duplicate page',async()=>{const s=setup([page(['a','b']),page(['a','b'])]);const r=await runSync(s.adapter,opts,s.deps);assert.equal(r.errorCode,'REPEATED_PAGE');assert.equal(s.saved.length,2);});
 it('partial and failed network errors finalize journal',async()=>{for(const pages of [[new Error('network')],[page(['a','b']),new Error('network')]]){const s=setup(pages);const r=await runSync(s.adapter,opts,s.deps);assert.equal(r.status,pages.length===1?'failed':'partial');assert.equal(s.finished.length,1);}});
 it('save errors do not report success',async()=>{const s=setup([page(['a'])]);s.store.saveVacancy=async()=>{throw Error('sql');};assert.equal((await runSync(s.adapter,opts,s.deps)).status,'partial');});
 it('rejects live incremental before any network or run',async()=>{const s=setup([]);await assert.rejects(runSync(s.adapter,{...opts,mode:'incremental'},s.deps));assert.equal(s.calls.length,0);});
 it('verified mock incremental sends stable date window',async()=>{const s=setup([page([])]);await runSync(s.adapter,{...opts,mode:'incremental'},{...s.deps,modifiedWindowVerified:true});assert.equal(s.calls[0].modifiedFrom,'2026-11-01 00:00:00.000000');assert.equal(s.calls[0].modifiedTo,'2026-11-11 00:00:00.000000');});
 it('abort persists partial without fetching',async()=>{const s=setup([]);const c=new AbortController();c.abort();const r=await runSync(s.adapter,{...opts,signal:c.signal},s.deps);assert.equal(r.aborted,true);assert.equal(r.errorCode,'ABORTED');});
 it('source cannot exceed requested page limit',async()=>{const s=setup([page(['a','b','c'])]);const r=await runSync(s.adapter,opts,s.deps);assert.equal(r.errorCode,'SOURCE_PAGE_LIMIT');assert.equal(s.saved.length,0);});
 it('skipped counters include stale and duplicate snapshots',async()=>{const s=setup([page(['a','a'])]);s.store.saveVacancy=async()=> 'skipped_stale';await runSync(s.adapter,{...opts,maxPages:1},s.deps);assert.equal(s.finished[0][1].skipped,2);});
 it('nonzero offset cannot certify full scope',async()=>{const s=setup([page([])]);assert.equal((await runSync(s.adapter,{...opts,offset:4},s.deps)).status,'partial');});
});
