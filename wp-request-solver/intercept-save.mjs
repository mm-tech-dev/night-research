import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const USER = 'mv-dev';
const PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const OUT = 'C:/tmp/tz';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', USER);
await page.fill('#user_pass', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
console.log('logged in');

// Capture all POST/PUT requests with bodies
const captured = [];
page.on('request', req => {
  if (['POST','PUT','PATCH'].includes(req.method())) {
    captured.push({
      method: req.method(),
      url: req.url(),
      headers: req.headers(),
      postData: req.postData()?.slice(0, 50000) || null,
    });
  }
});

// Open WCPA form 9602 edit page
// Acowebs WCPA uses admin URL like:
//   /wp-admin/admin.php?page=wcpa_form_designer&id=9602
const editUrl = SITE + '/wp-admin/admin.php?page=wcpa_form_designer&id=9602';
console.log('opening:', editUrl);
await page.goto(editUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await page.screenshot({ path: OUT + '/edit_form.png', fullPage: true });

// Look for save button
const saveSelectors = [
  'button:has-text("שמור")', 'button:has-text("Save")', 'button:has-text("Update")',
  'button:has-text("עדכן")', '#save_form', 'button.save', 'button[type="submit"]',
];
let saveBtn = null;
for (const sel of saveSelectors) {
  const btn = await page.$(sel);
  if (btn && await btn.isVisible()) { saveBtn = btn; console.log('save sel:', sel); break; }
}

if (saveBtn) {
  console.log('clicking save...');
  await saveBtn.click().catch(e => console.log('click err:', e.message));
  await page.waitForTimeout(3000);
}

// dump captured save requests (filter to wcpa)
const wcpaReqs = captured.filter(r => r.url.includes('wcpa'));
fs.writeFileSync(OUT + '/save_capture.json', JSON.stringify(wcpaReqs, null, 2));
console.log('wcpa POSTs captured:', wcpaReqs.length);
for (const r of wcpaReqs) {
  console.log(`  ${r.method} ${r.url}`);
  console.log(`    body len: ${r.postData?.length || 0}`);
}

await browser.close();
