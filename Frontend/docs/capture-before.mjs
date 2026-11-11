import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const files = ['src/pages/Account.vue','src/shared/styles.css','src/widgets/CatalogWidget.vue'];
const saved = files.map(f=>readFileSync(f));
const browser = await chromium.launch({channel:'msedge'});
try {
 for(const f of files) writeFileSync(f,execFileSync('git',['-c','safe.directory=*','show',`origin/main:Frontend/${f}`]));
 await new Promise(r=>setTimeout(r,2000));
 mkdirSync('docs/screenshots',{recursive:true});
 for(const [name,width,height] of [['desktop',1440,900],['desktop-small',1280,800],['mobile',390,844],['mobile-small',375,812]]) {
  for(const theme of ['light','dark']) {
   const page=await browser.newPage({viewport:{width,height}});
   await page.addInitScript(t=>localStorage.setItem('starter.theme',JSON.stringify(t)),theme);
   await page.goto('http://127.0.0.1:5173/#/account');
   await page.locator('.account__intro').waitFor();
   await page.screenshot({path:`docs/screenshots/before-auth-${theme}-${name}.png`});
   await page.goto('http://127.0.0.1:5173/');
   await page.locator('.results__bar').screenshot({path:`docs/screenshots/before-sort-${theme}-${name}.png`});
   await page.close();
  }
 }
} finally {
 files.forEach((f,i)=>writeFileSync(f,saved[i]));
 await browser.close();
}
