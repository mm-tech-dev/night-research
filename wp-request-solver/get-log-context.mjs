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

// Open today's fatal log
await page.goto(SITE + '/wp-admin/admin.php?page=wc-status&tab=logs&view=single_file&file_id=fatal-errors-2026-04-14', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// Find all "הקשר נוסף" (Additional context) links/buttons and click the LAST few (most recent)
// These usually toggle a details panel with file+line+stack trace
const toggles = await page.$$('a:has-text("הקשר נוסף"), button:has-text("הקשר נוסף"), a:has-text("Additional context"), button:has-text("Additional context"), [aria-expanded]');
console.log('toggles found:', toggles.length);

// expand the last 3 (most recent ternary fatals)
const takeLast = Math.min(3, toggles.length);
for (let i = toggles.length - takeLast; i < toggles.length; i++) {
  try {
    await toggles[i].scrollIntoViewIfNeeded();
    await toggles[i].click();
    await page.waitForTimeout(400);
  } catch (e) { console.log('toggle err', i, e.message); }
}
await page.waitForTimeout(1000);

await page.screenshot({ path: OUT + '/log_expanded.png', fullPage: true });

// capture full visible text
const fullText = await page.evaluate(() => document.body.innerText);
fs.writeFileSync(OUT + '/log_expanded.txt', fullText);
console.log('saved. length:', fullText.length);

await browser.close();
