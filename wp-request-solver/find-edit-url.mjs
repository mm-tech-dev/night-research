import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const USER = 'mv-dev';
const PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const OUT = 'C:/tmp/tz';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

const captured = [];
page.on('request', req => {
  if (['POST','PUT','PATCH'].includes(req.method()) && req.url().includes('wcpa')) {
    captured.push({ method: req.method(), url: req.url(),
      headers: req.headers(), postData: req.postData()?.slice(0, 80000) || null });
  }
});

await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', USER);
await page.fill('#user_pass', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

// Open the WCPA admin SPA — it uses hash routing
await page.goto(SITE + '/wp-admin/admin.php?page=wcpa-admin-ui', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: OUT + '/wcpa_list.png', fullPage: true });

// Navigate to forms list and click form 9602
// The hash for editing might be #/forms/9602/edit or #/forms/edit/9602
// Try a few
for (const hash of ['#/forms/9602', '#/forms/edit/9602', '#/forms/9602/edit']) {
  console.log('try hash', hash);
  await page.goto(SITE + '/wp-admin/admin.php?page=wcpa-admin-ui' + hash, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
}
await page.screenshot({ path: OUT + '/wcpa_form_edit.png', fullPage: true });

// Look for any link that goes to form 9602
const links9602 = await page.$$eval('a', as => as.map(a=>a.href).filter(h=>h.includes('9602')));
console.log('links containing 9602:', links9602.slice(0, 10));

// Try clicking the Save button — find anything that looks like save
const buttons = await page.$$eval('button', bs => bs.map(b=>({text:b.innerText.trim(), id:b.id, cls:b.className})).filter(b=>b.text));
fs.writeFileSync(OUT + '/buttons.json', JSON.stringify(buttons.slice(0,40), null, 2));

// Try clicking save (Hebrew/English)
let saveClicked = false;
for (const sel of ['button:has-text("שמור")','button:has-text("עדכן")','button:has-text("Save")','button:has-text("Update")']) {
  const b = await page.$(sel);
  if (b && await b.isVisible()) {
    console.log('click', sel);
    await b.click().catch(()=>{});
    saveClicked = true;
    break;
  }
}
if (saveClicked) {
  await page.waitForTimeout(3000);
}
await page.screenshot({ path: OUT + '/wcpa_after_save.png', fullPage: true });

fs.writeFileSync(OUT + '/save_capture.json', JSON.stringify(captured, null, 2));
console.log('captured wcpa POSTs:', captured.length);
for (const r of captured) console.log(`  ${r.method} ${r.url} body:${(r.postData||'').length}`);
await browser.close();
