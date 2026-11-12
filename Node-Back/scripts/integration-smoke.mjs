// Developer HTTP + real MySQL acceptance. Creates and retains a NEW uniquely named DB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import mysql from 'mysql2/promise';
import { SignJWT, jwtVerify } from 'jose';
const revision = '4ce04c4870c43a65fe1f0265f0c75d3f4265c603';
assert.equal(process.env.RUN_ISOLATED_MYSQL_TESTS, 'yes', 'Set RUN_ISOLATED_MYSQL_TESTS=yes on a dedicated test MySQL instance');
const upstream = resolve(process.env.CANONICAL_DB_DIR || '../../canonical-db');
assert.equal(execFileSync('git', ['-c', 'safe.directory=*', '-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision);
assert.equal(execFileSync('git', ['-c', 'safe.directory=*', '-C', upstream, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '', 'Canonical checkout must be clean');
const name = `starter_pr2_${randomBytes(6).toString('hex')}`;
const appUser = `pr2_${randomBytes(5).toString('hex')}`;
const appPassword = randomBytes(24).toString('hex');
const config = { host: process.env.TEST_MYSQL_HOST || '127.0.0.1', port: Number(process.env.TEST_MYSQL_PORT || 33316), user: process.env.TEST_MYSQL_USER || 'root', password: process.env.TEST_MYSQL_PASSWORD || '', supportBigNumbers: true, bigNumberStrings: true, dateStrings: true, timezone: 'Z' };
const admin = await mysql.createConnection({ ...config, multipleStatements: true });
let server, modelServer, db, originalTimezone, checks = 0;
let modelFailure = false;
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
  // Local OpenAI-compatible stub: exercises the actual HTTP route with canonical MySQL.
  const story = 'Я люблю создавать сайты, разговаривать с людьми и помогать разбираться в сложных задачах.';
  const aiDirections = [
    { name: 'Веб-разработка', what: 'Создание сайтов для разных пользователей.', why: 'Интерес к созданию сайтов может помочь начать.', evidence: ['создавать сайты'], searchTerms: ['разработчик'] },
    { name: 'Поддержка пользователей', what: 'Помощь людям при технических вопросах.', why: 'Любовь к общению может пригодиться в поддержке.', evidence: ['разговаривать с людьми'], searchTerms: ['оператор'] },
    { name: 'Обучение', what: 'Объяснение тем начинающим специалистам.', why: 'Желание помогать в сложных задачах близко к обучению.', evidence: ['помогать разбираться'], searchTerms: ['преподаватель'] }
  ];
  modelServer = createServer((_req, res) => {
    if (modelFailure) { res.writeHead(503); res.end('unavailable'); return; }
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ directions: aiDirections }) } }] }));
  });
  modelServer.listen(0, '127.0.0.1'); await once(modelServer, 'listening');
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + modelServer.address().port + '/v1';
  process.env.OPENAI_API_KEY = 'ci-fixture-key-only';
  process.env.OPENAI_MODEL = 'ci-fixture-model';
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
  const credentials = email => ({ email, password: 'Acceptance-password-42', displayName: 'QA' });
  await http('/ready');
  // Above JS safe integer range, proving profile ID never passes through Number.
  await admin.query('ALTER TABLE user_profiles AUTO_INCREMENT = 9007199254740993');
  const a = await http('/auth/register', 201, null, 'POST', credentials(' A@example.invalid '));
  const b = await http('/auth/register', 201, null, 'POST', credentials('b@example.invalid'));

  await http('/match', 401, null, 'POST', { about: story });
  await http('/match', 400, a.accessToken, 'POST', { about: 'too short' });
  const matchedDirections = await http('/match', 200, a.accessToken, 'POST', { about: story });
  ok('AI matching returns exactly three grounded directions', matchedDirections.directions.length === 3
    && matchedDirections.directions[0].evidence[0] === 'создавать сайты');
  ok('AI matching returns only active MySQL vacancies as strings', matchedDirections.directions.every(d =>
    Array.isArray(d.vacancies) && d.vacancies.every(v => typeof v.id === 'string' && v.status === 'active')));
  await http('/match', 429, a.accessToken, 'POST', { about: story });
  modelFailure = true;
  await http('/match', 503, b.accessToken, 'POST', { about: story });
  modelFailure = false;

  ok('BIGINT profile IDs preserve precision', a.user.profileId === '9007199254740993' && b.user.profileId === '9007199254740994');
  const [[account]] = await admin.query('SELECT * FROM users WHERE id=?', [a.user.id]);
  ok('Argon2id and default role', account.password_hash.startsWith('$argon2id$') && account.role === 'user');
  const [[fk]] = await admin.query('SELECT auth_subject FROM user_profiles WHERE id=?', [a.user.profileId]);
  ok('profile FK belongs to registered UUID', fk.auth_subject === a.user.id);
  await assert.rejects(admin.query('INSERT INTO user_profiles(auth_subject,display_name) VALUES (?,?)', ['missing-subject','orphan']), error => error.code === 'ER_NO_REFERENCED_ROW_2'); ok('FK rejects orphan');
  await http('/auth/register', 409, null, 'POST', credentials('A@EXAMPLE.INVALID'));
  const concurrent = await Promise.all(Array.from({ length: 2 }, async () => {
    const r = await fetch(base + '/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials('race@example.invalid')) }); return r.status;
  })); ok('concurrent duplicate registration', concurrent.sort().join(',') === '201,409');
  // Real SQL permission failure after users INSERT proves registration rollback.
  await admin.query(`REVOKE INSERT ON \`${name}\`.user_profiles FROM ?@'%'`, [appUser]);
  try { await http('/auth/register', 500, null, 'POST', credentials('rollback@example.invalid')); }
  finally { await admin.query(`GRANT INSERT ON \`${name}\`.user_profiles TO ?@'%'`, [appUser]); }
  const [[rolled]] = await admin.query("SELECT COUNT(*) n FROM users WHERE email='rollback@example.invalid'");
  ok('failed second write rolls back account', rolled.n === '0');
  const login = await http('/auth/login', 200, null, 'POST', credentials('A@EXAMPLE.INVALID'));
  await http('/auth/login', 401, null, 'POST', { email: 'a@example.invalid', password: 'wrong-password' });
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(login.accessToken, secret, { issuer: 'starter-api', audience: 'starter-client' });
  ok('JWT subject/version/expiry', payload.sub === a.user.id && payload.token_version === 0 && payload.exp - payload.iat === 3600);
  const ta = login.accessToken, tb = b.accessToken;
  await http('/auth/me', 200, ta); await http('/auth/me', 401); await http('/auth/me', 401, 'invalid');
  const expired = await new SignJWT({ token_version: 0 }).setProtectedHeader({ alg: 'HS256' }).setSubject(a.user.id).setIssuer('starter-api').setAudience('starter-client').setExpirationTime(1).sign(secret);
  await http('/auth/me', 401, expired);
  await admin.query("UPDATE users SET status='blocked' WHERE id=?", [a.user.id]);
  await http('/auth/me', 401, ta); await http('/auth/login', 401, null, 'POST', credentials('a@example.invalid'));
  await admin.query("UPDATE users SET status='active', token_version=token_version+1, role='admin' WHERE id=?", [a.user.id]);
  await http('/auth/me', 401, ta);
  const renewed = await http('/auth/login', 200, null, 'POST', credentials('a@example.invalid'));
  ok('login uses current role/version', renewed.user.role === 'admin');
  await http('/auth/me', 200, renewed.accessToken);
  await http('/profile', 200, tb, 'PATCH', { displayName: 'B only', city: 'QA city' });
  ok('profile isolation', (await http('/profile', 200, renewed.accessToken)).profile.displayName === 'QA');
  await http('/profile', 400, tb, 'PATCH', { id: a.user.profileId, city: 'attack' });
  const catalog = await http('/vacancies', 200, tb);
  ok('only five active seeded vacancies', catalog.items.length === 5 && catalog.items.every(v => v.status === 'active'));
  ok('DECIMAL exact salary and UTC date strings', catalog.items.find(v => v.id === '4').salary_min === '70000.00' && catalog.items.find(v => v.id === '4').published_at === '2026-11-11 08:30:00.000000');
  console.log('Aggregate runtime types:', JSON.stringify(catalog.items.map(v => ({ id:v.id, matched: v.matched_skills, listed: v.listed_skills, missing: v.missing_required_skills, percent:v.skill_match_percent }))));
  const filters = [ ['regionCode=9300000000000', ['3','1']], ['codeProfession=17351', ['1']], ['typicalPosition=\u041f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0438\u0441\u0442', ['4','2']], ['specialisation=\u041f\u0440\u043e\u0434\u0430\u0436\u0438', ['3','1']], ['workFormat=remote', ['5','2']], ['scheduleType=flexible', ['5']], ['employmentType=part_time', ['5']], ['contractType=permanent', ['5','4','3','2','1']], ['minSalary=90000', ['4']], ['salaryGross=true', ['4']], ['onlyNoExperience=true', ['5','3','2','1']], ['experienceMonths=0', ['5','3','2','1']], ['city=\u041c\u043e\u0441\u043a\u0432\u0430', ['4']], ['regionName=\u041c\u043e\u0441\u043a\u0432\u0430', ['4']], ['countryCode=RU', ['5','4','3','2','1']], ['regionCode=9300000000000&includeRemote=true', ['5','3','2','1']], ['search=Python', ['4']], ['specialisation=\u041f\u0440\u043e\u0434\u0430\u0436\u0438&onlyNoExperience=true', ['3','1']] ];
  for (const [query, ids] of filters) { const result = await http('/vacancies?' + new URLSearchParams(query), 200, tb); ok(`filter ${query}`, result.items.map(v=>v.id).sort().join(',') === ids.sort().join(',')); }
  const pages = []; for (let page=1;page<=3;page++) pages.push(...(await http(`/vacancies?page=${page}&pageSize=2`,200,tb)).items.map(v=>v.id));
  ok('pagination deterministic without duplicates', pages.length === 5 && new Set(pages).size === 5);
  ok('empty page', (await http('/vacancies?page=99',200,tb)).items.length === 0);
  await http('/vacancies?page=0',400,tb); await http('/vacancies?pageSize=101',400,tb);
  ok('SQL injection remains literal', (await http('/vacancies?city=' + encodeURIComponent("' OR 1=1 --"),200,tb)).items.length === 0);
  await admin.query('INSERT INTO user_skills(user_id,skill_id) VALUES (?,4),(?,2)', [b.user.profileId,b.user.profileId]);
  const matched = await http('/vacancies?requireAllRequired=true',200,tb);
  ok('required skills filter and personalized ranking', matched.items.map(v=>v.id).join(',') === '4,5' && matched.items[0].skill_match_percent === '100');
  ok('skills do not leak between users', (await http('/vacancies?requireAllRequired=true',200,renewed.accessToken)).items.map(v=>v.id).join(',') === '5');
  const card = await http('/vacancies/4',200,tb); ok('card and skill list', card.vacancy.typical_position === '\u041f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0438\u0441\u0442' && card.skills.length === 2 && card.vacancy.is_favorite === 0);
  await http('/vacancies/999999',404,tb); await http('/vacancies/invalid',400,tb);
  await http('/favorites/4',204,tb,'PUT'); await http('/favorites/4',204,tb,'PUT');
  ok('favorite marker owner', (await http('/vacancies/4',200,tb)).vacancy.is_favorite === 1 && (await http('/vacancies/4',200,renewed.accessToken)).vacancy.is_favorite === 0);
  await http('/favorites/4',204,renewed.accessToken,'DELETE');
  ok('favorites isolation', (await http('/favorites',200,renewed.accessToken)).items.length === 0 && (await http('/favorites',200,tb)).items.length === 1);
  const click = await http('/vacancies/4/outbound-click',200,tb,'POST'); ok('original URL', click.originalUrl === 'https://example.com/demo/v4');
  const [[clicked]] = await admin.query('SELECT user_id FROM outbound_clicks'); ok('click owner profile', clicked.user_id === b.user.profileId);
  await admin.query("UPDATE vacancies SET status='archived' WHERE id=4");
  ok('archived excluded from catalog', !(await http('/vacancies',200,tb)).items.some(v=>v.id==='4'));
  ok('archived retained in favorite/card', (await http('/favorites',200,tb)).items[0].status === 'archived' && (await http('/vacancies/4',200,tb)).vacancy.status === 'archived');
  await http('/favorites/4',204,tb,'PUT'); await http('/favorites/4',404,renewed.accessToken,'PUT');
  await http('/vacancies/4/outbound-click',404,tb,'POST');
  const [[clickCount]] = await admin.query('SELECT COUNT(*) n FROM outbound_clicks'); ok('failed click does not write', clickCount.n === '1');
  await http('/favorites/4',204,tb,'DELETE'); await http('/favorites/4',204,tb,'DELETE');
  const largeId = '9007199254740993';
  await admin.query("INSERT INTO vacancies(id,source_id,external_id,title,description,original_url,salary_min,currency,salary_period) VALUES (?,3,'large-id-fixture','Precision','Test','https://example.com/large',1234567890.12,'RUB','month')", [largeId]);
  ok('vacancy card preserves large ID and decimal', (await http('/vacancies/'+largeId,200,tb)).vacancy.id === largeId && (await http('/vacancies/'+largeId,200,tb)).vacancy.salary_min === '1234567890.12');
  await http('/favorites/'+largeId,204,tb,'PUT');
  ok('favorite preserves large vacancy ID', (await http('/favorites',200,tb)).items[0].id === largeId);
  await http('/vacancies/'+largeId+'/outbound-click',200,tb,'POST');
  const held = await Promise.all(Array.from({length:10},()=>db.getConnection()));
  try { for (const c of held) { const [[row]] = await c.query("SELECT @@session.time_zone tz, CAST(9007199254740993 AS SIGNED) id, CAST(1234567890.12 AS DECIMAL(12,2)) money"); assert.deepEqual(row,{tz:'+00:00',id:'9007199254740993',money:'1234567890.12'}); } ok('all 10 pool sessions UTC/BIGINT/DECIMAL'); }
  finally { for(const c of held)c.release(); }
  ok('no hash or auth_subject in catalog/card', !/password_hash|auth_subject|raw_payload|contact_list/.test(JSON.stringify({catalog,card})));
  console.log(`PASS ${checks} assertions/HTTP checks on MySQL ${version.version}. Database retained: ${name}`);
} finally {
  if(server) await new Promise(resolve=>server.close(resolve));
  if(modelServer) await new Promise(resolve=>modelServer.close(resolve));
  if(db) await db.end();
  if(originalTimezone !== undefined) await admin.query('SET GLOBAL time_zone = ?', [originalTimezone]);
  await admin.end();
}
