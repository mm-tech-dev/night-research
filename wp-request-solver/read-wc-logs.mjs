import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const USER = 'mv-dev';
const PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const OUT = 'C:/tmp/tz';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

console.log('1) Login...');
await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', USER);
await page.fill('#user_pass', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);
console.log('   ok:', page.url());

// Step 2 — logs list page
console.log('2) Load logs list...');
await page.goto(SITE + '/wp-admin/admin.php?page=wc-status&tab=logs', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.screenshot({ path: OUT + '/logs_page.png', fullPage: true });

// Step 3 — inspect rows: extract source, level, date, and the link/id for each row
const rows = await page.$$eval('table tr', trs =>
  trs.map(tr => {
    const tds = [...tr.querySelectorAll('td')].map(t => t.innerText.trim());
    const link = tr.querySelector('a[href*="view"], a[href*="log_id"], a[href*="file="]')?.href || null;
    return { tds, link };
  }).filter(r => r.tds.length > 0)
);
fs.writeFileSync(OUT + '/logs_rows.json', JSON.stringify(rows, null, 2));
console.log('   rows:', rows.length);

// Step 4 — try source filter for fatal-errors / error-level
const sourceOptions = await page.$$eval('select[name="source"] option, select#source option', opts =>
  opts.map(o => o.value).filter(Boolean)
);
fs.writeFileSync(OUT + '/source_options.json', JSON.stringify(sourceOptions, null, 2));
console.log('   source options:', sourceOptions.length);

// Filter to fatal-errors if available
let fatalRows = [];
const hasFatal = sourceOptions.find(s => s === 'fatal-errors');
if (hasFatal) {
  console.log('   filtering source=fatal-errors...');
  const url = new URL(page.url());
  url.searchParams.set('source', 'fatal-errors');
  await page.goto(url.toString(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: OUT + '/logs_fatal.png', fullPage: true });
  fatalRows = await page.$$eval('table tr', trs =>
    trs.map(tr => {
      const tds = [...tr.querySelectorAll('td')].map(t => t.innerText.trim());
      const link = tr.querySelector('a[href*="view"], a[href*="log_id"], a[href*="file="]')?.href || null;
      return { tds, link };
    }).filter(r => r.tds.length > 0 && r.link)
  );
  fs.writeFileSync(OUT + '/fatal_rows.json', JSON.stringify(fatalRows, null, 2));
  console.log('   fatal rows:', fatalRows.length);
}

// Step 5 — open the 3 most recent fatal logs (or most recent overall)
const toOpen = (fatalRows.length ? fatalRows : rows).filter(r => r.link).slice(0, 5);
console.log(`3) Opening ${toOpen.length} log entries...`);
const logContents = [];
for (let i = 0; i < toOpen.length; i++) {
  const r = toOpen[i];
  console.log('   ->', r.tds.slice(0, 3).join(' | '));
  await page.goto(r.link, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // try to grab the log body — multiple possible selectors
  const body = await page.evaluate(() => {
    const sels = ['.wc-log-content', 'pre', 'textarea', '.log-content', '.wp-core-ui pre', 'main'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && el.innerText && el.innerText.length > 100) return el.innerText;
    }
    return document.body.innerText.slice(0, 20000);
  });
  logContents.push({ meta: r.tds, link: r.link, body });
  await page.screenshot({ path: `${OUT}/log_view_${i}.png`, fullPage: true });
}
fs.writeFileSync(OUT + '/log_contents.json', JSON.stringify(logContents, null, 2));

console.log('DONE.');
await browser.close();
