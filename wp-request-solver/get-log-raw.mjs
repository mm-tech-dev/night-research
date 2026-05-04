import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const USER = 'mv-dev';
const PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const OUT = 'C:/tmp/tz';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1600, height: 1200 } });
const page = await ctx.newPage();

await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', USER);
await page.fill('#user_pass', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

// go to the log page and grab the full HTML (context may be hidden in <details> or similar)
await page.goto(SITE + '/wp-admin/admin.php?page=wc-status&tab=logs&view=single_file&file_id=fatal-errors-2026-04-14', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// expand ALL <details> or [aria-expanded=false]
await page.evaluate(() => {
  document.querySelectorAll('details').forEach(d => d.open = true);
  document.querySelectorAll('[aria-expanded="false"]').forEach(el => el.setAttribute('aria-expanded','true'));
});
await page.waitForTimeout(500);

// Grab raw HTML of main content
const html = await page.evaluate(() => {
  const main = document.querySelector('#wpbody-content, #wpbody, main, .wrap') || document.body;
  return main.outerHTML;
});
fs.writeFileSync(OUT + '/log_page.html', html);

// Also try download link — usually "הורדה" links to raw file
const dlLinks = await page.$$eval('a', as => as.map(a => a.href).filter(h => /download|file|raw|\.log/i.test(h)));
fs.writeFileSync(OUT + '/dl_links.json', JSON.stringify(dlLinks, null, 2));
console.log('download-like links:', dlLinks.length);

// Try to fetch the .log file directly through browser context (uses cookies)
if (dlLinks.length) {
  const u = dlLinks.find(h => /download|\.log/.test(h)) || dlLinks[0];
  console.log('fetching:', u);
  const resp = await page.request.get(u);
  console.log('  status:', resp.status(), 'size:', (await resp.body()).length);
  fs.writeFileSync(OUT + '/log_raw.txt', await resp.text());
}

await browser.close();
console.log('done');
