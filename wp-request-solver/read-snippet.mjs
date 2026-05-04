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

// Read snippet 10430 + 10431
for (const id of [10430, 10431]) {
  const url = `${SITE}/wp-admin/admin.php?page=wpcode-snippet-manager&snippet_id=${id}`;
  console.log('open snippet', id);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/snippet_${id}.png`, fullPage: true });
  // CodeMirror text — try to read .CodeMirror code or textarea
  const code = await page.evaluate(() => {
    // CodeMirror v5
    const cm = document.querySelector('.CodeMirror');
    if (cm && cm.CodeMirror) return cm.CodeMirror.getValue();
    // textarea fallback
    const ta = document.querySelector('textarea#wpcode_snippet_code, textarea[name="wpcode_snippet_code"], textarea#snippet-code');
    if (ta) return ta.value;
    // grep all textareas
    const tas = document.querySelectorAll('textarea');
    for (const t of tas) if (t.value && t.value.length > 50) return t.value;
    return null;
  });
  fs.writeFileSync(`${OUT}/snippet_${id}.txt`, code || '');
  console.log(`  snippet ${id} length: ${(code||'').length}`);
}

await browser.close();
