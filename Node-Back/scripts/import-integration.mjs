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
const name = `starter_import_${randomBytes(6).toString('hex')}`;
const appUser = `pr2_${randomBytes(5).toString('hex')}`;
const appPassword = randomBytes(24).toString('hex');
const config = { host: process.env.TEST_MYSQL_HOST || '127.0.0.1', port: Number(process.env.TEST_MYSQL_PORT || 33316), user: process.env.TEST_MYSQL_USER || 'root', password: process.env.TEST_MYSQL_PASSWORD || '', supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, timezone: 'Z' };
const admin = await mysql.createConnection({ ...config, multipleStatements: true });
let server, mock, db, originalTimezone, checks = 0;
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

  const fixture = JSON.parse(await readFile(new URL('../test/fixtures/trudvsem/vacancies.page.json',import.meta.url),'utf8'));
  let responseBody = structuredClone(fixture);
  let probing = false;
  mock = createServer((req,res)=>{
    const body = structuredClone(responseBody);
    if(probing){const url=new URL(req.url,'http://localhost');const offset=Number(url.searchParams.get('offset'));body.results.vacancies=body.results.vacancies.slice(offset*5,offset*5+5);}
    res.setHeader('content-type','application/json');res.end(JSON.stringify(body));
  });
  mock.listen(0,'127.0.0.1');await once(mock,'listening');
  const endpoint=`http://127.0.0.1:${mock.address().port}/api/v1/vacancies`;
  async function cli(extra=[],exit=0) {
    let result;
    try {result=await promisify(execFile)(process.execPath,['dist/modules/import/cli/trudvsem.js','--api-base-url',endpoint,'--limit','10','--retries','0',...extra],{env:process.env,timeout:60000,maxBuffer:1024*1024});assert.equal(exit,0);}
    catch(error){assert.equal(error.code,exit,error.stderr);result=error;}
    const report=JSON.parse(result.stdout);assert.ok(!result.stderr.includes('password_hash'));return report;
  }
  const sourceId = (await admin.query("SELECT id FROM sources WHERE code='trudvsem'"))[0][0].id;
  probing=true;
  const probe=await cli(['--probe-offset']);ok('CLI mock offset probe detects pages',probe.semantics==='page');
  probing=false;
  const dry=await cli(['--dry-run','--preview','10']);ok('CLI dry-run fixture',dry.normalized===10&&dry.received===10);
  const first=await cli();ok('CLI imports 10 fixture vacancies',first.inserted===10&&first.failed.length===0);
  async function snapshot(){const state={};for(const table of ['companies','vacancies','skills','vacancy_skills'])state[table]=(await admin.query(`SELECT * FROM ${table}`))[0];return state;}
  const before=await snapshot();
  const second=await cli();ok('CLI repeat upserts rather than inserts',second.updated===10&&second.inserted===0&&second.failed.length===0);
  const after=await snapshot();for(const table of Object.keys(before))ok(`${table} repeat stable row count`,before[table].length===after[table].length);
  const ids=state=>state.vacancies.filter(v=>v.source_id===sourceId).map(v=>v.id).sort();
  assert.deepEqual(ids(before),ids(after));ok('repeat stable vacancy IDs');
  const a=await http('/auth/register',201,null,'POST',{email:'import-a@example.invalid',password:'Acceptance-pass-42',displayName:'A'});
  const b=await http('/auth/register',201,null,'POST',{email:'import-b@example.invalid',password:'Acceptance-pass-42',displayName:'B'});
  const catalog=await http('/vacancies?pageSize=100',200,a.accessToken);
  const imported=after.vacancies.filter(v=>v.source_id===sourceId);
  ok('all imported IDs visible in authorized catalog',imported.every(v=>catalog.items.some(item=>item.id===v.id)));
  for(const row of imported){const card=await http('/vacancies/'+row.id,200,a.accessToken);assert.equal(card.vacancy.title,row.title);assert.equal(card.vacancy.description,row.description);assert.equal(card.vacancy.external_id,row.external_id);assert.equal(card.vacancy.status,'active');}
  ok('all imported cards open with Bearer');await http('/vacancies',401);
  await http('/favorites/'+imported[0].id,204,a.accessToken,'PUT');
  ok('imported favorite owner isolated',(await http('/favorites',200,b.accessToken)).items.length===0);
  await http('/favorites/'+imported[0].id,204,b.accessToken,'DELETE');
  ok('foreign delete does not remove favorite',(await http('/favorites',200,a.accessToken)).items.length===1);
  await http('/vacancies/'+imported[0].id+'/outbound-click',200,b.accessToken,'POST');
  const [[clicked]]=await admin.query('SELECT user_id FROM outbound_clicks');ok('click owner is current profile',clicked.user_id===b.user.profileId);
  // Update and stale snapshot use the real mapper and repository on the shared pool.
  const { MysqlImportRepository }=await import('../dist/modules/import/repositories/import.repository.js');
  const { mapTrudvsemVacancy }=await import('../dist/modules/import/adapters/trudvsem.mapper.js');
  const store=new MysqlImportRepository(db,logger);
  const mapped=mapTrudvsemVacancy(fixture.results.vacancies[0].vacancy,0);assert.ok(mapped.ok);
  const updated={...mapped.vacancy,title:'\u0418\u043d\u0436\u0435\u043d\u0435\u0440 \u0401\u0436 \u{1f6e0}',sourceUpdatedAt:'2026-12-01 12:00:00.000000'};
  assert.equal(await store.saveVacancy(sourceId,updated),'updated');
  assert.equal(await store.saveVacancy(sourceId,{...updated,title:'Stale must not win',sourceUpdatedAt:'2020-01-01 00:00:00.000000'}),'skipped_stale');
  ok('real update and stale skip',(await admin.query('SELECT title FROM vacancies WHERE source_id=? AND external_id=?',[sourceId,updated.externalId]))[0][0].title===updated.title);
  const rollback={...updated,externalId:'qa-rollback:vacancy',company:{externalId:'qa-rollback-company',name:'QA rollback',originalUrl:null},skills:['QA rollback skill'],skillsComplete:true};
  await admin.query(`REVOKE INSERT ON \`${name}\`.vacancy_skills FROM ?@'%'`,[appUser]);
  try {await assert.rejects(store.saveVacancy(sourceId,rollback));await assert.rejects(store.saveVacancy(sourceId,{...updated,title:'Failed update',skills:['QA rollback skill'],skillsComplete:true}));}
  finally {await admin.query(`GRANT INSERT ON \`${name}\`.vacancy_skills TO ?@'%'`,[appUser]);}
  for(const [table,column,value] of [['vacancies','external_id',rollback.externalId],['companies','external_id',rollback.company.externalId],['skills','name','QA rollback skill']]){
    const [[row]]=await admin.query(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`,[value]);ok(`rollback removes new ${table} row`,row.n==='0');
  }
  ok('failed update preserves old title',(await admin.query('SELECT title FROM vacancies WHERE source_id=? AND external_id=?',[sourceId,updated.externalId]))[0][0].title===updated.title);
  const demoBefore=before.vacancies.filter(v=>v.source_id!==sourceId);const demoAfter=(await snapshot()).vacancies.filter(v=>v.source_id!==sourceId);assert.deepEqual(demoAfter,demoBefore);ok('other sources unchanged');
  // Known source contacts are negative canaries; never print them.
  const contacts=fixture.results.vacancies.flatMap(({vacancy:v})=>[v.contact_person,v.company?.email,...(v.contact_list||[]).map(c=>c.contact_value)]).filter(v=>typeof v==='string'&&v.trim().length>2);
  const persisted=JSON.stringify(await snapshot());const responses=JSON.stringify(catalog);
  for(const contact of contacts){assert.ok(!persisted.includes(contact),'Contact leaked in DB');assert.ok(!responses.includes(contact),'Contact leaked in API');}
  ok('fixture contact names/phones/emails absent from DB and API');
  const privacyRaw=structuredClone(fixture.results.vacancies[0].vacancy);
  const canary='privacy-canary@example.invalid';
  for(const field of ['duty','schedule','typicalPosition'])privacyRaw[field]=`QA ${canary}`;
  privacyRaw.company.name=`QA company ${canary}`;privacyRaw.skills=[`QA ${canary}`];
  const privacy=mapTrudvsemVacancy(privacyRaw,0);assert.ok(privacy.ok);ok('all persisted text fields scrub contact canary',!JSON.stringify(privacy.vacancy).includes(canary));

  const safePrivacy={...privacy.vacancy,externalId:'privacy-check:fixture',company:{...privacy.vacancy.company,externalId:'privacy-check-company'}};
  await store.saveVacancy(sourceId,safePrivacy);
  const [[savedPrivacy]]=await admin.query('SELECT * FROM vacancies WHERE external_id=?',[safePrivacy.externalId]);
  const privacyCard=await http('/vacancies/'+savedPrivacy.id,200,a.accessToken);
  ok('scrubbed canary absent from stored rows and card',!JSON.stringify({state:await snapshot(),privacyCard}).includes(canary));
  responseBody=structuredClone(fixture);responseBody.results.vacancies=[{vacancy:{...fixture.results.vacancies[0].vacancy,id:'partial-fixture',company:{companycode:'partial-company',name:'QA company'},skills:['QA rollback skill']}}];
  await admin.query(`REVOKE INSERT ON \`${name}\`.vacancy_skills FROM ?@'%'`,[appUser]);
  try{const failed=await cli([],2);ok('CLI partial failure exit2 sanitized report',failed.failed.length===1&&failed.failed[0].code==='DB_ERROR');}
  finally{await admin.query(`GRANT INSERT ON \`${name}\`.vacancy_skills TO ?@'%'`,[appUser]);}
  const [[partial]]=await admin.query("SELECT COUNT(*) n FROM vacancies WHERE external_id='partial-company:partial-fixture'");ok('partial CLI failure rolls back vacancy',partial.n==='0');
  await http('/ready');ok('reusable importer leaves shared pool open');
  console.log(`PASS ${checks} import assertions/HTTP checks. Retained database: ${name}`);
} finally {
  if(mock)await new Promise(resolve=>mock.close(resolve));
  if(server)await new Promise(resolve=>server.close(resolve));
  if(db)await db.end();
  if(originalTimezone!==undefined)await admin.query('SET GLOBAL time_zone = ?',[originalTimezone]);
  await admin.end();
}
