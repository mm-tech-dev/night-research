// Probe how the Google Reviews widget renders images, and check for an admin alt setting.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = 'https://wintax.co.il';
const RECORD_ID = 'recX2M4F9bPEnAybU';
const DATE = '2026-05-04';
const DIR = path.join(__dirname, 'reports', DATE, 'evidence', RECORD_ID);
const WP_USER = 'mv-dev';
const WP_PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 1) Frontend probe
  console.log('Visiting homepage to probe widget HTML...');
  await page.goto(`${SITE}/`, { timeout: 60000, waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  // Scroll to load lazy widgets
  await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(2500);

  const imgs = await page.$$eval('img', els => els.map(e => ({
    src: e.getAttribute('src'),
    alt: e.getAttribute('alt'),
    title: e.getAttribute('title'),
  })));
  fs.writeFileSync(path.join(DIR, 'frontend-imgs.json'), JSON.stringify(imgs, null, 2));
  const chijImgs = imgs.filter(i => (i.src || '').includes('ChIJ'));
  console.log(`Frontend ChIJ imgs: ${chijImgs.length}`);
  for (const i of chijImgs.slice(0, 5)) console.log(`  alt=${JSON.stringify(i.alt)} src=${(i.src || '').split('/').pop()}`);
  const gmblogoImg = imgs.find(i => (i.src || '').includes('gmblogo'));
  if (gmblogoImg) console.log(`gmblogo: alt=${JSON.stringify(gmblogoImg.alt)} src=${gmblogoImg.src}`);

  // 2) Admin probe — login & visit widget settings
  console.log('\nLogging in...');
  await page.goto(`${SITE}/wp-login.php`, { timeout: 60000 });
  await ctx.addCookies([{ name: 'wordpress_test_cookie', value: 'WP+Cookie+check', domain: 'wintax.co.il', path: '/' }]);
  await page.fill('#user_login', WP_USER);
  await page.fill('#user_pass', WP_PASS);
  await page.click('#wp-submit');
  await page.waitForURL('**/wp-admin/**', { timeout: 60000 });
  console.log('logged in');

  // The plugin slug is widget-google-reviews — check possible admin pages
  const possible = [
    '/wp-admin/admin.php?page=widget-google-reviews',
    '/wp-admin/admin.php?page=trustindex',
    '/wp-admin/widgets.php',
  ];
  for (const p of possible) {
    try {
      await page.goto(`${SITE}${p}`, { timeout: 30000, waitUntil: 'domcontentloaded' });
      const url = page.url();
      const title = await page.title();
      console.log(`  ${p} → ${url} | "${title}"`);
      if (!/page=widget-google-reviews|trustindex/.test(url)) continue;
      const fn = `widget-admin-${p.split('=').pop()}.png`;
      await page.screenshot({ path: path.join(DIR, fn), fullPage: true });
    } catch (e) {
      console.log(`  ${p} err: ${e.message}`);
    }
  }

  // List installed plugins to see plugin's full metadata
  const plugins = await page.evaluate(async () => {
    const r = await fetch('/wp-json/wp/v2/plugins', { headers: { 'X-WP-Nonce': wpApiSettings.nonce } });
    if (!r.ok) return { error: r.status };
    return await r.json();
  });
  if (Array.isArray(plugins)) {
    const wgr = plugins.filter(p => (p.plugin || '').includes('widget-google-reviews') || (p.textdomain || '').includes('widget-google-reviews') || (p.name || '').toLowerCase().includes('google review'));
    fs.writeFileSync(path.join(DIR, 'plugin-info.json'), JSON.stringify(wgr, null, 2));
    console.log('\nPlugin info:');
    for (const p of wgr) console.log(`  ${p.plugin} | ${p.name} | v${p.version} | status=${p.status}`);
  } else {
    console.log('plugins list err:', plugins);
  }

  await browser.close();
})();
