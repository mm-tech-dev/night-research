const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const [key, ...vals] = line.split('=');
      if (key && vals.length) {
        const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) process.env[key.trim()] = val;
      }
    });
  }
} catch (e) {}

const SITE = 'https://free-lancer.co.il';
const TARGET_USER_ID = parseInt(process.argv[2] || '76'); // default סיון

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('response', async (r) => {
    if (r.status() >= 500) {
      try {
        const body = await r.text();
        errors.push({ url: r.url(), status: r.status(), body: body.slice(0, 3000) });
      } catch {}
    }
  });
  page.on('pageerror', e => errors.push({ type: 'jsError', msg: e.message }));

  console.error('[1] Login admin...');
  await page.goto(`${SITE}/wp-login.php`);
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.click('#wp-submit');
  await page.waitForURL(/wp-admin/, { timeout: 30000 });

  console.error('[2] Navigate to users.php');
  await page.goto(`${SITE}/wp-admin/users.php`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.error('[3] Look for "Login as" button/link');
  const links = await page.evaluate((uid) => {
    const out = [];
    document.querySelectorAll('a').forEach(a => {
      const txt = (a.innerText || '').toLowerCase();
      const href = a.href || '';
      if ((txt.includes('login as') || txt.includes('log in as') || txt.includes('התחבר'))
          && href.includes(`user_id=${uid}`) || href.includes('loginas')) {
        out.push({ text: a.innerText.trim().slice(0, 100), href });
      }
    });
    // Also look for row actions linking to user ID 76
    const row = document.querySelector(`tr#user-${uid}`);
    if (row) {
      row.querySelectorAll('a').forEach(a => {
        out.push({ text: a.innerText.trim().slice(0, 100), href: a.href, inRow: true });
      });
    }
    return out;
  }, TARGET_USER_ID);

  console.error(`Found ${links.length} candidate links:`);
  links.forEach(l => console.error(`   ${l.inRow ? '[row]' : '     '} ${l.text} -> ${l.href}`));

  // Try to find login-as URL
  const loginAsLink = links.find(l => l.href.includes('loginas') || (l.text.toLowerCase().includes('login as') && l.href.includes(`${TARGET_USER_ID}`)));

  if (loginAsLink) {
    console.error(`[4] Clicking login-as URL: ${loginAsLink.href}`);
    const resp = await page.goto(loginAsLink.href, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => ({ error: e.message }));
    if (resp?.error) console.error('NAV ERROR:', resp.error);
    else console.error(`Status: ${resp.status()}`);
    await page.waitForTimeout(2000);
    const title = await page.title();
    const url = page.url();
    console.error(`Final URL: ${url}`);
    console.error(`Page title: ${title}`);
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
    console.error('Body snippet:\n' + bodyText);
    await page.screenshot({ path: 'c:/Users/1/Desktop/morevision-maintnance-agent/reports/2026-04-14/login-as-error.png', fullPage: true });
  } else {
    console.error('[!] No login-as link found. Capturing users.php screenshot.');
    await page.screenshot({ path: 'c:/Users/1/Desktop/morevision-maintnance-agent/reports/2026-04-14/users-page.png', fullPage: true });
  }

  console.error('\n=== Collected errors ===');
  errors.forEach(e => console.error(JSON.stringify(e).slice(0, 1500)));

  await browser.close();
})();
