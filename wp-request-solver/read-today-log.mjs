import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

await page.goto(SITE + '/wp-admin/admin.php?page=wc-status&tab=logs&view=single_file&file_id=fatal-errors-2026-04-15', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

await page.evaluate(() => {
  document.querySelectorAll('details').forEach(d => d.open = true);
  document.querySelectorAll('[aria-expanded="false"]').forEach(el => el.setAttribute('aria-expanded','true'));
});
await page.waitForTimeout(500);

const html = await page.content();
fs.writeFileSync('C:/tmp/tz/fatal_today.html', html);
console.log('size:', html.length);

await browser.close();
