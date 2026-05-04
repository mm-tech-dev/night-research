import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const USER = 'mv-dev';
const PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const PRODUCT_URL = SITE + '/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/';
const OUT = 'C:/tmp/tz';

const consoleLogs = [];
const netLogs = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL' });
const page = await ctx.newPage();

page.on('console', m => consoleLogs.push(`[${m.type()}] ${m.text()}`));
page.on('response', async r => {
  const u = r.url();
  if (u.includes('wc-ajax') || u.includes('admin-ajax')) {
    let body = '';
    try { body = (await r.text()).slice(0, 3000); } catch {}
    netLogs.push({ status: r.status(), url: u, body });
  }
});

console.log('1) Login...');
await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', USER);
await page.fill('#user_pass', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
console.log('   logged in:', page.url());

console.log('2) Open WC Status > Logs...');
await page.goto(SITE + '/wp-admin/admin.php?page=wc-status&tab=logs', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT + '/wc_status_logs.png', fullPage: true });

// Try to get latest fatal-errors log
const logOptions = await page.$$eval('select#log_file option', opts =>
  opts.map(o => ({ v: o.value, t: o.textContent.trim() })).filter(o => o.v)
);
fs.writeFileSync(OUT + '/log_options.json', JSON.stringify(logOptions, null, 2));
console.log('   found', logOptions.length, 'log files');

// Pick latest fatal/error log if exists, else newest
let pick = logOptions.find(o => /fatal/i.test(o.t)) || logOptions[0];
if (pick) {
  console.log('   opening:', pick.t);
  await page.selectOption('select#log_file', pick.v);
  await page.click('button[name="log_file"], input[name="log_file"], button:has-text("View")').catch(()=>{});
  await page.waitForTimeout(1500);
  const content = await page.$eval('textarea.wc-log-content, pre, .log-content', el => el.textContent).catch(()=>null);
  if (content) fs.writeFileSync(OUT + '/wc_log_latest.txt', content);
  await page.screenshot({ path: OUT + '/wc_log_view.png', fullPage: true });
}

console.log('3) Now reproduce 500 on product page as logged-in user...');
consoleLogs.length = 0;
netLogs.length = 0;
await page.goto(PRODUCT_URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.screenshot({ path: OUT + '/product_page.png', fullPage: true });

// Try to click add to cart
const btnSelectors = [
  'button.single_add_to_cart_button',
  '.xoo-wsc-ptr-btn',
  'button[name="add-to-cart"]',
  '.add_to_cart_button',
];
let clicked = false;
for (const sel of btnSelectors) {
  const el = await page.$(sel);
  if (el) {
    console.log('   clicking', sel);
    await el.scrollIntoViewIfNeeded();
    await el.click({ force: true }).catch(e => console.log('   click err:', e.message));
    clicked = true;
    break;
  }
}
if (!clicked) console.log('   no add-to-cart button found');

await page.waitForTimeout(4000);
await page.screenshot({ path: OUT + '/after_click.png', fullPage: true });

fs.writeFileSync(OUT + '/console_logs.txt', consoleLogs.join('\n'));
fs.writeFileSync(OUT + '/net_logs.json', JSON.stringify(netLogs, null, 2));

console.log('DONE. Net captures:', netLogs.length);
for (const n of netLogs) console.log(`  ${n.status} ${n.url}`);

await browser.close();
