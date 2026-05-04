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
const TARGET_USER_ID = parseInt(process.argv[2] || '76');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.error('[1] Login admin...');
  await page.goto(`${SITE}/wp-login.php`);
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.click('#wp-submit');
  await page.waitForURL(/wp-admin/);

  console.error('[2] Navigate to users.php');
  await page.goto(`${SITE}/wp-admin/users.php`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  console.error('[3] Find "Switch To" link for user', TARGET_USER_ID);
  const links = await page.evaluate((uid) => {
    const out = [];
    const row = document.querySelector(`tr#user-${uid}`);
    if (row) {
      row.querySelectorAll('a').forEach(a => {
        if (a.href.includes('switch_to_user') || (a.innerText||'').toLowerCase().includes('switch')) {
          out.push({ text: a.innerText.trim(), href: a.href });
        }
      });
    }
    return out;
  }, TARGET_USER_ID);
  console.error(`Found ${links.length} switch links`);
  links.forEach(l => console.error(`   ${l.text} -> ${l.href}`));

  if (links.length > 0) {
    const url = links[0].href;
    console.error('[4] Clicking switch URL...');
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => ({ error: e.message }));
    if (resp?.error) {
      console.error('NAV ERROR:', resp.error);
    } else {
      console.error(`Status: ${resp.status()}`);
      console.error(`Final URL: ${page.url()}`);
      console.error(`Title: ${await page.title()}`);
      const userInfo = await page.evaluate(() => {
        const howdy = document.querySelector('#wp-admin-bar-my-account .display-name, #wp-admin-bar-my-account .ab-item');
        return howdy ? howdy.innerText.trim() : null;
      });
      console.error(`Logged-in as: ${userInfo}`);
    }
  }

  await browser.close();
})();
