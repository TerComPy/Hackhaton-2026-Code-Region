// Developer HTTP + real MySQL acceptance. Creates and retains a NEW uniquely named DB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import mysql from 'mysql2/promise';
import { SignJWT, jwtVerify } from 'jose';
const revision = '4ce04c4870c43a65fe1f0265f0c75d3f4265c603';
assert.equal(process.env.RUN_ISOLATED_MYSQL_TESTS, 'yes', 'Set RUN_ISOLATED_MYSQL_TESTS=yes on a dedicated test MySQL instance');
const upstream = resolve(process.env.CANONICAL_DB_DIR || '../../canonical-db');
assert.equal(execFileSync('git', ['-c', 'safe.directory=*', '-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
assert.equal(execFileSync('git', ['-c', 'safe.directory=*', '-C', upstream, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Canonical checkout must be clean');
const name = `starter_sync_${randomBytes(6).toString('hex')}`;
const appUser = `pr2_${randomBytes(5).toString('hex')}`;
const appPassword = randomBytes(24).toString('hex');
const config = { host: process.env.TEST_MYSQL_HOST || '127.0.0.1', port: Number(process.env.TEST_MYSQL_PORT || 33316), user: process.env.TEST_MYSQL_USER || 'root', password: process.env.TEST_MYSQL_PASSWORD || '', supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, timezone: 'Z' };
const admin = await mysql.createConnection({ ...config, multipleStatements: true });
let server, mock, db, originalTimezone, spawnedChild, checks = 0;
function ok(label, value = true) { assert.ok(value, label); checks++; console.log(`PASS ${label}`); }
try {
  const [[version]] = await admin.query('SELECT VERSION() AS version');
  assert.match(version.version, /^8\.4\./);
  console.log(`MySQL ${version.version}; retained isolated database: ${name}`);
  await admin.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  await admin.query(`USE \`${name}\``);
  for (const file of ['01_schema.sql', '08_prompt_schema.sql', '09_ai_schema.sql', '03_seed.sql']) {
    const sql = (await readFile(resolve(upstream, file), 'utf8'))
      .replace(/CREATE DATABASE IF NOT EXISTS vacancy_aggregator\s+CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;/i, '')
      .replace(/USE vacancy_aggregator;/g, '');
    assert.ok(!sql.includes('USE vacancy_aggregator'));
    await admin.query(sql);
  }
  const [tables] = await admin.query('SHOW TABLES');
  ok('canonical 17 tables and demo seed', tables.length === 17);
  await admin.query('CREATE USER ?@\'%\' IDENTIFIED BY ?', [appUser, appPassword]);
  for (const table of tables.map(row => Object.values(row)[0]))
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON \`${name}\`.\`${table}\` TO ?@'%'`, [appUser]);
  // Force non-UTC server default: application must initialize EVERY session itself.
  const [[settings]] = await admin.query('SELECT @@global.time_zone AS tz');
  originalTimezone = settings.tz;
  await admin.query("SET GLOBAL time_zone = '+03:00'");
  Object.assign(process.env, { NODE_ENV: 'test', CORS_ORIGIN: 'http://localhost', MYSQL_HOST: config.host,
    MYSQL_PORT: String(config.port), MYSQL_USER: appUser, MYSQL_PASSWORD: appPassword, MYSQL_DATABASE: name,
    JWT_SECRET: randomBytes(32).toString('hex'), JWT_ISSUER: 'starter-api', JWT_AUDIENCE: 'starter-client' });
  const { logger } = await import('../dist/lib/logger.js'); logger.level = 'silent';
  const { app } = await import('../dist/app.js');
  ({ db } = await import('../dist/config/db.js'));
  server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function http(path, status = 200, token, method = 'GET', body) {
    const response = await fetch(base + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text(); const data = text ? JSON.parse(text) : null;
    assert.equal(response.status, status, `${method} ${path}: ${text}`); checks++;
    if (status >= 400) { assert.equal(typeof data.error.code, 'string'); assert.equal(typeof data.error.message, 'string'); }
    return data;
  }


  const fixture=JSON.parse(await readFile(new URL('../test/fixtures/trudvsem/vacancies.page.json',import.meta.url),'utf8'));
  let failOffset=-1,hang=false;
  const urls=[];
  mock=createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost');urls.push(u);
    if(hang)return;
    const limit=Number(u.searchParams.get('limit')),offset=Number(u.searchParams.get('offset'));
    if(offset===failOffset&&limit===4){res.writeHead(503);res.end();return;}
    const body=structuredClone(fixture);body.meta.total=10;body.results.vacancies=body.results.vacancies.slice(offset*limit,(offset+1)*limit);
    res.setHeader('content-type','application/json');res.end(JSON.stringify(body));
  });
  mock.listen(0,'127.0.0.1');await once(mock,'listening');
  const endpoint=`http://127.0.0.1:${mock.address().port}/api/v1/vacancies`;
  async function cli(extra=[],exit=0){let r;try{r=await promisify(execFile)(process.execPath,['dist/modules/import/cli/trudvsem.js','--api-base-url',endpoint,'--sync','--limit','4','--max-pages','5','--pause-ms','1','--retries','0',...extra],{env:process.env,timeout:60000});assert.equal(exit,0);}catch(e){assert.equal(e.code,exit,e.stderr);r=e;}return JSON.parse(r.stdout);}
  const {MysqlRunRepository}=await import('../dist/modules/import/repositories/run.repository.js');
  const {MysqlImportRepository}=await import('../dist/modules/import/repositories/import.repository.js');
  const {runSync,canonicalScope}=await import('../dist/modules/import/services/sync.service.js');
  const {TrudvsemAdapter}=await import('../dist/modules/import/adapters/trudvsem.adapter.js');
  const runs=new MysqlRunRepository(db),store=new MysqlImportRepository(db,logger);
  const sourceId=(await store.resolveSource('trudvsem')).id;
  const scope=canonicalScope({},endpoint);
  const full=await cli();ok('CLI multi-page run succeeds',full.status==='succeeded'&&full.inserted===10&&full.pages===3);
  const [[row]]=await admin.query('SELECT * FROM import_runs WHERE id=?',[full.runId]);
  ok('QI02/QI03 exact journal counters/status',row.records_seen===10&&row.inserted_count===10&&row.status==='succeeded'&&row.finished_at!==null&&row.error_code===null);
  const cursor=await runs.cursor(sourceId,scope.hash);ok('QI01 successful scoped cursor',cursor!==null);
  const repeat=await cli();ok('repeat sync updates without duplicate vacancies',repeat.updated===10&&repeat.inserted===0);
  const cursor2=await runs.cursor(sourceId,scope.hash);
  const partial=await cli(['--max-pages','1'],2);ok('safe one-page partial never advances cursor',partial.status==='partial'&&(await runs.cursor(sourceId,scope.hash))===cursor2);
  const scoped=await cli(['--text','independent']);ok('other filter has its own scope',scoped.scopeHash!==scope.hash);
  ok('QI01 separate scope cursor',await runs.cursor(sourceId,scoped.scopeHash)!==null);
  failOffset=1;
  const failedAfter=await cli([],2);ok('page failure finalizes partial',failedAfter.status==='partial'&&failedAfter.errorCode==='HTTP_ERROR');
  failOffset=0;const failed=await cli([],1);ok('first-page failure is failed',failed.status==='failed'&&failed.errorCode==='HTTP_ERROR');failOffset=-1;
  ok('failed and partial preserve last succeeded cursor',(await runs.cursor(sourceId,scope.hash))===cursor2);
  const incremental=await cli(['--mode','incremental','--mock-modified-window']);ok('incremental uses scoped previous window with overlap',incremental.windowFrom!==null&&incremental.status==='succeeded');
  const windowRequests=urls.filter(u=>u.searchParams.has('modifiedTo'));ok('mock date window forwarded',windowRequests.length===3&&windowRequests.every(u=>u.searchParams.has('modifiedFrom')));
  const [[overlap]]=await admin.query('SELECT TIMESTAMPDIFF(SECOND,window_from,?) n FROM import_runs WHERE id=?',[cursor2,incremental.runId]);ok('cursor has 60-second overlap',Number(overlap.n)===60);
  await assert.rejects(cli(['--mode','incremental'],0));ok('unverified incremental rejected');
  const lockScope=canonicalScope({text:'lock'},endpoint);
  const locks=await Promise.allSettled([runs.start(sourceId,lockScope.hash,lockScope.json,'full'),runs.start(sourceId,lockScope.hash,lockScope.json,'full')]);
  ok('canonical unique lock prevents concurrent same scope',locks.filter(x=>x.status==='fulfilled').length===1&&locks.filter(x=>x.status==='rejected').length===1);
  const locked=locks.find(x=>x.status==='fulfilled').value;
  await runs.finish(locked,{recordsSeen:0,inserted:0,updated:0,skipped:0},'failed','TEST_STOPPED');
  const different=await Promise.all([runs.start(sourceId,canonicalScope({text:'a'},endpoint).hash,canonicalScope({text:'a'},endpoint).json,'full'),runs.start(sourceId,canonicalScope({text:'b'},endpoint).hash,canonicalScope({text:'b'},endpoint).json,'full')]);
  ok('different scopes may coexist',different.length===2);for(const r of different)await runs.finish(r,{recordsSeen:0,inserted:0,updated:0,skipped:0},'failed','TEST_STOPPED');
  // Abort while waiting between pages: preserve committed rows but never cursor.
  const aborter=new AbortController();const adapter=new TrudvsemAdapter({logger,baseUrl:endpoint,http:{maxAttempts:1}});
  const aborted=await runSync(adapter,{limit:4,maxPages:5,text:'abort',signal:aborter.signal},{store,runs,logger,endpoint,offsetSemantics:'page',sleep:async()=>{aborter.abort();throw Error('aborted');}});
  ok('graceful interruption journaled partial',aborted.status==='partial'&&aborted.aborted&&aborted.pages===1);
  ok('aborted scope has no cursor',await runs.cursor(sourceId,aborted.scopeHash)===null);
  // Hard process kill cannot run finally: explicit stopped-run recovery only.
  hang=true;
  const {spawn}=await import('node:child_process');
  const child=spawn(process.execPath,['dist/modules/import/cli/trudvsem.js','--sync','--text','kill-test','--limit','4','--retries','0','--api-base-url',endpoint],{env:process.env,stdio:'ignore'});
  spawnedChild=child;
  const ended=once(child,'exit');let pending;
  for(let i=0;i<100;i++){const [r]=await admin.query("SELECT id,source_id,scope_hash FROM import_runs WHERE JSON_UNQUOTE(JSON_EXTRACT(scope_json,'$.text'))='kill-test' AND status='running'");if(r[0]){pending=r[0];break;}await new Promise(r=>setTimeout(r,50));}
  assert.ok(pending,'child must establish running journal');child.kill('SIGKILL');await ended;hang=false;
  const killScope=canonicalScope({text:'kill-test'},endpoint);
  await assert.rejects(runs.start(sourceId,killScope.hash,killScope.json,'full'),e=>e.code==='SCOPE_BUSY');ok('hard kill keeps scope blocked until explicit recovery');
  await cli(['--fail-run',pending.id,'--confirm-stopped']);
  const [[recovered]]=await admin.query('SELECT status,error_code FROM import_runs WHERE id=?',[pending.id]);ok('operator recovery marks stopped process failed',recovered.status==='failed'&&recovered.error_code==='PROCESS_STOPPED');
  const recoveredRun=await cli(['--text','kill-test']);ok('recovery permits new run',recoveredRun.status==='succeeded');

  const {mapTrudvsemVacancy}=await import('../dist/modules/import/adapters/trudvsem.mapper.js');
  const mapped=mapTrudvsemVacancy(fixture.results.vacancies[0].vacancy,0);assert.ok(mapped.ok);
  const broken={...mapped.vacancy,externalId:'sync-rollback:new',skills:['Sync rollback skill'],skillsComplete:true};
  await admin.query(`REVOKE INSERT ON \`${name}\`.vacancy_skills FROM ?@'%'`,[appUser]);
  let sqlFailure;
  try{sqlFailure=await runSync({sourceCode:'trudvsem',fetch:async()=>({vacancies:[broken],received:1,total:1,rejected:[]})},{limit:4,text:'sql-failure'},{store,runs,logger,endpoint,offsetSemantics:'unknown'});}
  finally{await admin.query(`GRANT INSERT ON \`${name}\`.vacancy_skills TO ?@'%'`,[appUser]);}
  const [[journalFailure]]=await admin.query('SELECT * FROM import_runs WHERE id=?',[sqlFailure.runId]);
  ok('actual SQL failure journal is partial with exact counts',journalFailure.status==='partial'&&journalFailure.error_code==='DB_ERROR'&&journalFailure.records_seen===1&&journalFailure.inserted_count===0);
  ok('SQL failure rolls back vacancy',(await admin.query("SELECT COUNT(*) n FROM vacancies WHERE external_id='sync-rollback:new'"))[0][0].n==='0');
  const audit=await runs.audit(5,0);ok('QI04 operator audit works',audit.length===5);
  ok('no archival by absence',(await admin.query("SELECT COUNT(*) n FROM vacancies WHERE source_id=? AND status='archived'",[sourceId]))[0][0].n==='0');
  await http('/ready');ok('shared pool still usable');
  console.log(`PASS ${checks} sync assertions/HTTP checks. Retained database: ${name}`);
}finally{
  if(spawnedChild && spawnedChild.exitCode===null)spawnedChild.kill('SIGKILL');
  if(mock){mock.closeAllConnections();await new Promise(r=>mock.close(r));}
  if(server)await new Promise(r=>server.close(r));
  if(db)await db.end();
  if(originalTimezone!==undefined)await admin.query('SET GLOBAL time_zone = ?',[originalTimezone]);
  await admin.end();
}
