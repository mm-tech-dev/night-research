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

const SITE_URL = 'https://free-lancer.co.il';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${SITE_URL}/wp-login.php`);
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.click('#wp-submit');
  await page.waitForURL(/wp-admin/);

  await page.goto(`${SITE_URL}/wp-admin/admin.php?page=wpcode`, { waitUntil: 'networkidle' });

  const html = await page.content();
  fs.writeFileSync('c:/Users/1/Desktop/fl_wpcode_admin.html', html);

  const links = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('a').forEach(a => {
      if (a.href && (a.href.includes('snippet_id') || a.href.includes('wpcode-snippet'))) {
        out.push({ text: a.innerText.trim().slice(0, 80), href: a.href });
      }
    });
    return out;
  });

  console.log('=== Snippet links ===');
  links.slice(0, 30).forEach(l => console.log(`  ${l.text} -> ${l.href}`));

  await browser.close();
})();
