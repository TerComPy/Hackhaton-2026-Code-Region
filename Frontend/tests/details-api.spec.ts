import { test, expect, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { dismissExternalPasswordBalloon } from './support/kaspersky';
const require = createRequire(import.meta.url);
const ids = ['9100000' + randomBytes(5).readUIntBE(0,5).toString().padStart(13,'0'), '9200000' + randomBytes(5).readUIntBE(0,5).toString().padStart(13,'0')].map(s => s.slice(0,18));
let db: any, active: any, archived: any;
test.beforeEach(async ({ page }) => {
  test.skip(!test.info().config.configFile?.endsWith('playwright.api.config.ts'));
  await dismissExternalPasswordBalloon(page);
});
test.beforeAll(async ({ request }) => {
  if (!test.info().config.configFile?.endsWith('playwright.api.config.ts')) return;
  require('../../Node-Back/node_modules/dotenv').config({ path: '../Node-Back/.env', quiet: true });
  const mysql = require('../../Node-Back/node_modules/mysql2/promise');
  db = await mysql.createConnection({ host: '127.0.0.1', port: 33316, user: process.env.MYSQL_USER, password: process.env.MYSQL_PASSWORD, database: process.env.MYSQL_DATABASE, supportBigNumbers:true,bigNumberStrings:true });
  const [[source]] = await db.query('SELECT id FROM sources LIMIT 1');
  for (const [index,id] of ids.entries()) {
    await db.execute(`INSERT INTO vacancies(id,source_id,external_id,title,description,requirements,responsibilities,original_url,city,work_format,schedule_text,schedule_type,experience_months_min,salary_min,currency,salary_period,salary_gross,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id,source.id,'details-e2e-'+id,'TEST FIXTURE Details '+index,'Реальное описание\nВторая строка',index ? null : 'Реальные требования',index ? null : 'Реальные обязанности','https://example.com/details-e2e/'+id,index ? null : 'Москва',index ? 'unknown' : 'hybrid',index ? null : 'Два дня через два',index ? 'unknown' : 'shift',index ? null : 0,index ? null : '1234567890.12',index ? null : 'RUB','month',index ? null : 1,index ? 'archived' : 'active']);
  }
  const [[skill]] = await db.query('SELECT id FROM skills LIMIT 1');
  if (skill) await db.execute('INSERT INTO vacancy_skills(vacancy_id,skill_id,is_required) VALUES (?,?,1)',[ids[0],skill.id]);
  const registered=await request.post('/api/auth/register',{data:{email:`details-${randomBytes(6).toString('hex')}@example.invalid`,password:'details-e2e-password',displayName:'TEST FIXTURE Details'}});
  expect(registered.status()).toBe(201); const token=(await registered.json()).accessToken;
  for (const [i,id] of ids.entries()) {
    const response=await request.get('/api/vacancies/'+id,{headers:{Authorization:'Bearer '+token}});
    console.log('REAL GET /api/vacancies/'+id+': '+response.status()); expect(response.status()).toBe(200);
    const data=await response.json(); expect(data.vacancy.id).toBe(id); if(i) archived=data; else active=data;
  }
  const seedList=await request.get('/api/vacancies?pageSize=6',{headers:{Authorization:'Bearer '+token}});
  expect(seedList.status()).toBe(200);
  const seed=(await seedList.json()).items.find((v:any)=>!ids.includes(v.id));
  expect(seed).toBeTruthy();
  const seedDetail=await request.get('/api/vacancies/'+seed.id,{headers:{Authorization:'Bearer '+token}});
  expect(seedDetail.status()).toBe(200);
  const seedDto=await seedDetail.json();
  expect(seedDto.vacancy.title).toBe(seed.title);
  console.log('REAL seed detail '+seed.id+': '+seedDetail.status()+', skills='+seedDto.skills.length);
  const missing=await request.get('/api/vacancies/8999999999999999999',{headers:{Authorization:'Bearer '+token}}); expect(missing.status()).toBe(404); console.log('REAL missing detail: 404');
  const invalid=await request.get('/api/vacancies/'+ids[0],{headers:{Authorization:'Bearer invalid'}}); expect(invalid.status()).toBe(401); console.log('REAL invalid JWT detail: 401');
  const out=await request.post('/api/vacancies/'+ids[1]+'/outbound-click',{headers:{Authorization:'Bearer '+token}}); expect(out.status()).toBe(404); console.log('REAL archived outbound: 404');
});
test.afterAll(async () => {
  if(!db) return;
  try { for(const id of ids) { await db.execute('DELETE FROM outbound_clicks WHERE vacancy_id=?',[id]); await db.execute('DELETE FROM vacancy_skills WHERE vacancy_id=?',[id]); await db.execute('DELETE FROM vacancies WHERE id=? AND external_id=?',[id,'details-e2e-'+id]); } } finally { await db.end(); }
});
async function login(page: Page) {
  await page.goto('/#/account');
  await page.locator('#auth-name').fill('TEST FIXTURE Details UI');
  await page.locator('#auth-email').fill(`details-ui-${randomBytes(6).toString('hex')}@example.invalid`);
  await page.locator('#auth-password').fill('details-e2e-password');
  await page.locator('.auth-submit').click(); await expect(page.locator('.member')).toBeVisible();
}
async function catalog(page:Page, vacancy=active.vacancy) {
  await page.route('**/api/vacancies?*', r=>r.fulfill({json:{items:[vacancy],page:1,pageSize:6}}));
  await page.goto('/'); await page.locator('#catalog .job__open').click();
  await expect(page.locator('.sheet__panel')).toHaveCSS('opacity','1');
}
test('real detail fields, skills, exact salary, outbound and focus',async ({page})=>{
  await login(page); await catalog(page);
  const dialog=page.locator('dialog');
  await expect(dialog.locator('#sheet-title')).toHaveText(active.vacancy.title);
  for(const text of ['Москва','1 234 567 890,12 ₽ / мес. до налогов','Гибрид','Без опыта','Два дня через два','Реальные обязанности','Реальные требования','Реальное описание']) await expect(dialog).toContainText(text);
  expect(active.skills.length).toBeGreaterThan(0);
  for(const skill of active.skills) await expect(dialog).toContainText(skill.name);
  await expect(dialog.locator('.seg')).toHaveCount(0);
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await expect(dialog.locator('.sheet__panel')).toHaveCSS('opacity','1');
    await expect(dialog.locator('.sheet__panel')).toHaveCSS('transform','none');
    const bounds=(await dialog.locator('.sheet__panel').boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x+bounds.width).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({width:1280,height:720});
  await page.route('https://example.com/**',r=>r.fulfill({body:'Employer fixture'}));
  const post=page.waitForResponse(r=>r.url().endsWith('/'+ids[0]+'/outbound-click'));
  const popup=page.waitForEvent('popup'); await dialog.getByRole('button',{name:'Открыть у работодателя',exact:true}).click();
  const response=await post; expect(response.status()).toBe(200); expect(response.request().method()).toBe('POST'); console.log('REAL active outbound: 200');
  const tab=await popup; await expect(tab).toHaveURL(active.vacancy.original_url); expect(await tab.evaluate(()=>window.opener)).toBeNull(); await tab.close();
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(page.locator('#catalog .job__open')).toBeFocused();
});
test('archived real details and absent values',async ({page})=>{
  await login(page); await catalog(page,archived.vacancy);
  await expect(page.locator('dialog')).toContainText('Вакансия в архиве');
  await expect(page.locator('dialog')).toContainText('Зарплата не указана');
  await expect(page.locator('dialog')).toContainText('Город не указан');
  await expect(page.locator('dialog').getByRole('button',{name:'Открыть у работодателя',exact:true})).toBeDisabled();
});
test('network retry, 404, 401 and loading cancellation',async ({page})=>{
  await login(page);
  await page.route('**/api/vacancies/'+ids[0],r=>r.abort('connectionrefused'));
  await catalog(page); await expect(page.locator('dialog [role=alert]')).toContainText('Не удалось');
  await page.unroute('**/api/vacancies/'+ids[0]);
  await page.locator('dialog').getByRole('button',{name:'Повторить'}).click(); await expect(page.locator('#sheet-title')).toHaveText(active.vacancy.title);
  await page.keyboard.press('Escape'); await expect(page.locator('dialog')).toHaveCount(0);
  // Serve a catalog ID that genuinely does not exist; detail HTTP stays real.
  await catalog(page,{...active.vacancy,id:'8999999999999999999'}); await expect(page.locator('dialog [role=alert]')).toContainText('не найдена');
  await page.keyboard.press('Escape'); await expect(page.locator('dialog')).toHaveCount(0);
  let release: (()=>void) | undefined;
  await page.route('**/api/vacancies/'+ids[0],async r=>{ await new Promise<void>(resolve=>{release=resolve}); await r.fulfill({json:active}).catch(()=>{}); });
  await catalog(page); await expect(page.locator('.sheet__loading')).toBeVisible();
  const cancelled=page.waitForEvent('requestfailed',r=>r.url().endsWith('/api/vacancies/'+ids[0]));
  await page.keyboard.press('Escape'); await cancelled; await expect(page.locator('dialog')).toHaveCount(0);
  await catalog(page,archived.vacancy); release?.();
  await expect(page.locator('#sheet-title')).toHaveText(archived.vacancy.title);
  await page.keyboard.press('Escape'); await expect(page.locator('dialog')).toHaveCount(0);
  await page.unroute('**/api/vacancies/'+ids[0]);
  await page.route('**/api/vacancies/'+ids[0],r=>r.continue({headers:{...r.request().headers(),authorization:'Bearer invalid'}}));
  await catalog(page); await expect(page.locator('dialog [role=alert]')).toContainText('Войдите повторно');
});
test('blocked popup link, unsafe URL and outbound failure',async ({page})=>{
  await login(page); await catalog(page);
  await expect(page.locator('#sheet-title')).toHaveText(active.vacancy.title);
  await page.evaluate(()=>{ window.open=()=>null; });
  const button=page.locator('dialog').getByRole('button',{name:'Открыть у работодателя',exact:true});
  await button.click(); await expect(page.locator('dialog a[target=_blank]')).toHaveAttribute('href',active.vacancy.original_url);
  await page.route('**/outbound-click',r=>r.fulfill({json:{originalUrl:'javascript:alert(1)'}})); await button.click();
  await expect(page.locator('dialog [role=alert]')).toContainText('Не удалось'); await expect(page.locator('dialog a[target=_blank]')).toHaveCount(0);
  await page.route('**/outbound-click',r=>r.abort('connectionrefused')); await button.click(); await expect(page.locator('dialog [role=alert]')).toContainText('Не удалось');
  await page.route('**/outbound-click',r=>r.fulfill({status:404,json:{error:{code:'NOT_FOUND'}}})); await button.click(); await expect(page.locator('dialog [role=alert]')).toContainText('Переход недоступен'); await expect(button).toBeDisabled();
});
