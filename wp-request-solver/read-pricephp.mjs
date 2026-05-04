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

// Plugin slug from file path: woo-custom-product-addons-pro. Main plugin file from listing: "start.php"
const url = SITE + '/wp-admin/plugin-editor.php?file=woo-custom-product-addons-pro/includes/process/price.php&plugin=woo-custom-product-addons-pro/start.php';
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/editor.png', fullPage: false });

// The editor uses a <textarea id="newcontent"> with the file contents
const content = await page.$eval('#newcontent', el => el.value).catch(() => null);
if (!content) {
  console.log('no textarea; checking for confirmation dialog');
  // sometimes a "I understand" button appears
  const btn = await page.$('button#file-editor-warning-accept, button:has-text("I understand")');
  if (btn) {
    await btn.click();
    await page.waitForTimeout(800);
  }
}
const content2 = await page.$eval('#newcontent', el => el.value).catch(() => null);
if (content2) {
  fs.writeFileSync(OUT + '/price.php', content2);
  const lines = content2.split('\n');
  console.log('total lines:', lines.length);
  const from = Math.max(0, 740), to = Math.min(lines.length, 790);
  console.log(`--- lines ${from+1}..${to} ---`);
  for (let i = from; i < to; i++) console.log((i+1).toString().padStart(4,' ') + ': ' + lines[i]);
} else {
  console.log('failed to read file; dumping page HTML');
  fs.writeFileSync(OUT + '/editor.html', await page.content());
}

await browser.close();
