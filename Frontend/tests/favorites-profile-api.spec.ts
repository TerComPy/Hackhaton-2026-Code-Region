import { test, expect, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { dismissExternalPasswordBalloon } from './support/kaspersky';
const require = createRequire(import.meta.url);
const prefix='favorites-e2e-'+randomBytes(6).toString('hex');
const first=BigInt('810000000000000000')+BigInt('0x'+randomBytes(5).toString('hex'));
const ids=Array.from({length:101},(_,i)=>(first+BigInt(i)).toString());
let db:any;
const createdIds: string[] = [];
test.beforeEach(async ({page})=>{test.skip(!test.info().config.configFile?.endsWith('playwright.api.config.ts'));await dismissExternalPasswordBalloon(page);});
test.beforeAll(async ()=>{
 if(!test.info().config.configFile?.endsWith('playwright.api.config.ts'))return;
 require('../../Node-Back/node_modules/dotenv').config({path:'../Node-Back/.env',quiet:true});
 db=await require('../../Node-Back/node_modules/mysql2/promise').createConnection({host:'127.0.0.1',port:33316,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE});
 const [[source]]=await db.query('SELECT id FROM sources LIMIT 1');
 for(const id of ids) { await db.execute('INSERT INTO vacancies(id,source_id,external_id,title,description,original_url) VALUES (?,?,?,?,?,?)',[id,source.id,prefix+id,'TEST FIXTURE Favorite '+id,'Original details','https://example.com/favorite/'+id]); createdIds.push(id); }
});
test.afterAll(async()=>{if(!db)return;try{for(const id of createdIds){await db.execute('DELETE FROM favorites WHERE vacancy_id=?',[id]);await db.execute('DELETE FROM vacancies WHERE id=? AND external_id=?',[id,prefix+id]);}}finally{await db.end();}});
async function account(request:any){const email=prefix+'-'+randomBytes(5).toString('hex')+'@example.invalid';const response=await request.post('/api/auth/register',{data:{email,password:'favorites-e2e-password',displayName:'TEST FIXTURE Favorites'}});expect(response.status()).toBe(201);return {...await response.json(),email};}
async function register(page:Page){await page.goto('/#/account');await page.locator('#auth-name').fill('TEST FIXTURE Favorites UI');await page.locator('#auth-email').fill(prefix+'-'+randomBytes(5).toString('hex')+'@example.invalid');await page.locator('#auth-password').fill('favorites-e2e-password');await page.locator('.auth-submit').click();await expect(page.locator('.member')).toBeVisible();return page.evaluate(()=>sessionStorage.getItem('starter.api.accessToken'));}
async function showFixture(page:Page,request:any,token:string){const detail=await request.get('/api/vacancies/'+ids[0],{headers:{Authorization:'Bearer '+token}});const row=(await detail.json()).vacancy;await page.route('**/api/vacancies?*',r=>r.fulfill({json:{items:[row],page:1,pageSize:6}}));await page.goto('/');await expect(page.locator('#catalog .save')).toBeEnabled();}
test('real idempotent favorites, ownership, archived and profile HTTP',async({request})=>{
 const a=await account(request),b=await account(request);const headers={Authorization:'Bearer '+a.accessToken};
 for(let n=0;n<2;n++){const r=await request.put('/api/favorites/'+ids[0],{headers});expect(r.status()).toBe(204);console.log('REAL PUT favorite: '+r.status());}
 const list=await request.get('/api/favorites',{headers});expect((await list.json()).items.map((v:any)=>v.id)).toEqual([ids[0]]);
 expect((await (await request.get('/api/favorites',{headers:{Authorization:'Bearer '+b.accessToken}})).json()).items).toEqual([]);
 const patch=await request.patch('/api/profile',{headers,data:{displayName:'Updated HTTP Name',city:'Москва'}});expect(patch.status()).toBe(200);console.log('REAL PATCH profile: '+patch.status());
 expect((await (await request.get('/api/profile',{headers})).json()).profile).toMatchObject({displayName:'Updated HTTP Name',city:'Москва'});
 expect((await request.patch('/api/profile',{headers,data:{displayName:''}})).status()).toBe(400);
 for(const path of ['/api/favorites','/api/profile']){const r=await request.get(path,{headers:{Authorization:'Bearer invalid'}});expect(r.status()).toBe(401);console.log('REAL invalid JWT '+path+': '+r.status());}
 await db.execute("UPDATE vacancies SET status='archived' WHERE id=?",[ids[0]]);
 try{
  expect((await (await request.get('/api/favorites',{headers})).json()).items[0].status).toBe('archived');
  for(let n=0;n<2;n++){const r=await request.delete('/api/favorites/'+ids[0],{headers});expect(r.status()).toBe(204);console.log('REAL DELETE favorite: '+r.status());}
  const forbidden=await request.put('/api/favorites/'+ids[0],{headers});expect(forbidden.status()).toBe(404);console.log('REAL re-add archived: '+forbidden.status());
 }finally{await db.execute("UPDATE vacancies SET status='active' WHERE id=?",[ids[0]]);}
});
test('UI sync, duplicate click guard, persistence, profile and account isolation',async({page,request})=>{
 const token=await register(page);await showFixture(page,request,token!);
 let puts=0;await page.route('**/api/favorites/'+ids[0],async r=>{if(r.request().method()==='PUT')puts++;await r.continue();});
 const saved=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().endsWith('/favorites/'+ids[0]));
 await page.locator('#catalog .save').evaluate((b:HTMLButtonElement)=>{b.click();b.click();});expect((await saved).status()).toBe(204);expect(puts).toBe(1);
 await expect(page.locator('#catalog .save')).toHaveAttribute('aria-pressed','true');await page.locator('#catalog .job__open').click();
 await expect(page.locator('dialog .save')).toHaveAttribute('aria-pressed','true');await expect(page.locator('dialog .save')).toBeEnabled();await page.locator('dialog .save').click();await expect(page.locator('dialog .save')).toHaveAttribute('aria-pressed','false');await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('#catalog .save')).toHaveAttribute('aria-pressed','false');
 await expect(page.locator('#catalog .save')).toBeEnabled();await page.locator('#catalog .save').click();await expect(page.locator('#catalog .save')).toHaveAttribute('aria-pressed','true');
 await page.goto('/#/saved');await expect(page.locator('.saved [data-vacancy-id="'+ids[0]+'"]')).toBeVisible();await page.reload();await expect(page.locator('.saved .job')).toHaveCount(1);
 await page.goto('/#/account');await page.locator('#profile-name').fill('Обновлённое имя');await page.locator('#profile-city').fill('Казань');const patched=page.waitForResponse(r=>r.request().method()==='PATCH'&&r.url().endsWith('/api/profile'));await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();expect((await patched).status()).toBe(200);await expect(page.locator('.member h1')).toHaveText('Обновлённое имя');await expect(page.locator('#account-label')).toHaveText('Обновлённое имя');await page.reload();await expect(page.locator('#profile-city')).toHaveValue('Казань');await expect(page.locator('.member h1')).toHaveText('Обновлённое имя');
 await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.locator('#saved-count')).toHaveText('0');await page.goto('/#/saved');await expect(page.locator('.saved .job')).toHaveCount(0);
 await register(page);await page.goto('/#/saved');await expect(page.locator('.saved .job')).toHaveCount(0);await expect(page.locator('#saved-count')).toHaveText('0');await page.goto('/#/account');await expect(page.locator('#profile-city')).toHaveValue('');await expect(page.locator('.member h1')).toHaveText('TEST FIXTURE Favorites UI');
});
test('real pagination beyond 100, archived UI, error and retry without mock',async({page,request})=>{
 const token=await register(page);const me=await request.get('/api/auth/me',{headers:{Authorization:'Bearer '+token}});const profileId=(await me.json()).user.profileId;
 for(const id of ids)await db.execute('INSERT INTO favorites(user_id,vacancy_id) VALUES (?,?)',[profileId,id]);
 await db.execute("UPDATE vacancies SET status='archived' WHERE id=?",[ids[100]]);
 try{
  const pages:number[]=[];page.on('request',r=>{if(r.url().includes('/api/favorites?'))pages.push(Number(new URL(r.url()).searchParams.get('page')));});
  await page.goto('/#/saved');await expect(page.locator('.saved .job')).toHaveCount(101);expect(pages).toContain(6);await expect(page.locator('#saved-count')).toHaveText('101');
  const archive=page.locator('.saved [data-vacancy-id="'+ids[100]+'"]');await expect(archive).toContainText('В архиве');await archive.locator('.job__open').click();await expect(page.locator('dialog .save')).toHaveAttribute('aria-pressed','true');await page.locator('dialog .save').click();await expect(page.locator('dialog .save')).toHaveAttribute('aria-pressed','false');await expect(page.locator('dialog .save')).toBeDisabled();await page.keyboard.press('Escape');await expect(page.locator('dialog')).toHaveCount(0);await expect(page.locator('.saved .job')).toHaveCount(100);
  // A full fifth page must probe page six, even when the result is empty.
  pages.length=0;await page.reload();await expect(page.locator('.saved .job')).toHaveCount(100);expect(pages).toContain(6);
  await page.route('**/api/favorites?*',r=>r.abort('connectionrefused'));await page.reload();await expect(page.locator('.saved [role=alert]')).toContainText('Не удалось');await expect(page.locator('.saved .job')).toHaveCount(0);
  await page.unroute('**/api/favorites?*');await page.locator('.saved').getByRole('button',{name:'Повторить',exact:true}).click();await expect(page.locator('.saved .job')).toHaveCount(100);
 }finally{await db.execute("UPDATE vacancies SET status='active' WHERE id=?",[ids[100]]);}
});
test('failed mutations and profile patch retain confirmed state; favorites 401 clears session',async({page,request})=>{
 const token=await register(page);await showFixture(page,request,token!);
 await page.route('**/api/favorites/'+ids[0],r=>r.abort('connectionrefused'));await page.locator('#catalog .save').click();await expect(page.locator('#catalog [role=alert]')).toContainText('Не удалось');await expect(page.locator('#catalog .save')).toHaveAttribute('aria-pressed','false');
 await page.unroute('**/api/favorites/'+ids[0]);await page.locator('#catalog').getByRole('button',{name:'Повторить',exact:true}).click();await expect(page.locator('#catalog .save')).toHaveAttribute('aria-pressed','true');
 await page.goto('/#/account');await page.route('**/api/profile',r=>r.request().method()==='PATCH'?r.abort('connectionrefused'):r.continue());await page.locator('#profile-name').fill('Not saved');await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();await expect(page.locator('.profile-editor [role=alert]')).toContainText('Не удалось');await expect(page.locator('.member h1')).toHaveText('TEST FIXTURE Favorites UI');await page.unroute('**/api/profile');
 await page.route('**/api/favorites?*',r=>r.continue({headers:{...r.request().headers(),authorization:'Bearer invalid'}}));await page.goto('/#/saved');await expect(page.locator('.saved')).toContainText('Войдите в аккаунт');await expect(page.locator('.saved .job')).toHaveCount(0);expect(await page.evaluate(()=>sessionStorage.getItem('starter.api.accessToken'))).toBeNull();
});
test('logout aborts pending user requests and ignores late account A responses',async({page,request})=>{
 const token=await register(page);const headers={Authorization:'Bearer '+token};await request.put('/api/favorites/'+ids[0],{headers});
 let releaseFavorites: (()=>void)|undefined, releaseProfile: (()=>void)|undefined;
 let firstFavorite=true;
 await page.route('**/api/favorites?*',async r=>{
  if(!firstFavorite){await r.continue();return;}firstFavorite=false;
  const response=await r.fetch();await new Promise<void>(resolve=>{releaseFavorites=resolve});await r.fulfill({response}).catch(()=>{});
 });
 await page.goto('/#/saved');await expect(page.locator('.saved [role=status]')).toBeVisible();await expect.poll(()=>!!releaseFavorites).toBe(true);
 await page.goto('/#/account');await page.route('**/api/profile',async r=>{
  if(r.request().method()!=='PATCH'){await r.continue();return;}
  const response=await r.fetch();await new Promise<void>(resolve=>{releaseProfile=resolve});await r.fulfill({response}).catch(()=>{});
 });
 await page.locator('#profile-name').fill('Late account A');await page.getByRole('button',{name:'Сохранить профиль',exact:true}).click();await expect.poll(()=>!!releaseProfile).toBe(true);
 const failures:string[]=[];page.on('requestfailed',r=>failures.push(r.url()));
 await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.locator('#saved-count')).toHaveText('0');
 await expect.poll(()=>failures.some(v=>v.includes('/api/favorites?'))&&failures.some(v=>v.endsWith('/api/profile'))).toBe(true);
 await page.unroute('**/api/profile');await register(page);releaseFavorites?.();releaseProfile?.();
 await page.goto('/#/saved');await expect(page.locator('.saved .job')).toHaveCount(0);await expect(page.locator('#saved-count')).toHaveText('0');await page.goto('/#/account');await expect(page.locator('.member h1')).toHaveText('TEST FIXTURE Favorites UI');await expect(page.locator('#profile-city')).toHaveValue('');
});
