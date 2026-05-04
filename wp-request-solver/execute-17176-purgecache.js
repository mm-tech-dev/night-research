#!/usr/bin/env node
/**
 * Purge caches on sby.co.il:
 *   - WP Rocket (if installed) via admin bar
 *   - ezCache / other plugin pages via tools
 *   - Elementor regenerate CSS
 * Attempts each known plugin endpoint and logs results.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');

fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const SITE = 'https://sby.co.il';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', 'recIsWT8X1O7sp2nz');

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#user_login', { timeout: 15000 });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.evaluate((S) => { const r = document.querySelector('input[name="redirect_to"]'); if (r) r.value = `${S}/wp-admin/`; }, SITE);
  try { await Promise.all([ page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit') ]); } catch(_) {}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

async function probeAdminBar(page) {
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  const items = await page.$$eval('#wpadminbar .ab-item', els => els.map(e => ({ id: e.id || null, text: e.textContent.trim().slice(0,40), href: e.getAttribute('href') })));
  return items.filter(i => i.text);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  try {
    await login(page);
    console.log('✓ logged in');

    // Probe admin bar for cache-related items
    const bar = await probeAdminBar(page);
    const cacheItems = bar.filter(b => /cache|clear|purge|elementor|rocket/i.test(b.text));
    console.log('Cache-related admin bar items:');
    cacheItems.forEach(i => console.log(`  ${i.id} | ${i.text} | ${i.href}`));
    fs.writeFileSync(path.join(EVID, 'adminbar-items.json'), JSON.stringify(cacheItems, null, 2));

    // Try Elementor Tools > Regenerate CSS
    try {
      await page.goto(`${SITE}/wp-admin/admin.php?page=elementor-tools`, { waitUntil: 'domcontentloaded' });
      // Click "Regenerate Files & Data" button
      const regenBtn = await page.$('input[name="elementor_regenerate_css"], button[data-action*="regenerate"]');
      if (regenBtn) {
        await regenBtn.click();
        console.log('✓ clicked Elementor regenerate CSS');
        await page.waitForTimeout(3000);
      } else {
        // Try the button inside the section via JS
        const clicked = await page.evaluate(() => {
          const h = Array.from(document.querySelectorAll('h3, h4, .elementor-tools-section-title')).find(e => /regenerate/i.test(e.textContent));
          if (!h) return false;
          const wrap = h.closest('tr') || h.parentElement;
          const btn = wrap && (wrap.querySelector('.button') || wrap.querySelector('input[type="submit"]'));
          if (btn) { btn.click(); return true; }
          return false;
        });
        console.log('  Regenerate button JS-click result:', clicked);
      }
    } catch (e) {
      console.log('Elementor regen failed:', e.message);
    }

    // Try ezCache / WP-Optimize / WP Rocket / W3TC
    const candidates = [
      `${SITE}/wp-admin/admin.php?page=wp-rocket`,
      `${SITE}/wp-admin/admin.php?page=wpo_cache`,
      `${SITE}/wp-admin/admin.php?page=w3tc_dashboard`,
      `${SITE}/wp-admin/admin.php?page=autoptimize`,
      `${SITE}/wp-admin/options-general.php?page=ez-cache`,
    ];
    for (const c of candidates) {
      try {
        await page.goto(c, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const found = !/no+_page|not-found|cheatin/i.test(page.url());
        const title = await page.title();
        console.log(`  ${c} -> ${page.url().slice(0,80)} | title=${title.slice(0,40)}`);
      } catch(_){}
    }

    // Try "ezCache" / generic purge from the admin bar
    for (const item of cacheItems) {
      if (item.href && /purge|clear|cache/i.test(item.text)) {
        try {
          console.log(`→ clicking ${item.text} (${item.href})`);
          await page.goto(item.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(1500);
          console.log('  ok');
        } catch (e) { console.log('  err:', e.message); }
      }
    }

    // Also try hitting the wp-admin "update caches" via WooCommerce
    try {
      await page.goto(`${SITE}/wp-admin/admin.php?page=wc-status&tab=tools`, { waitUntil: 'domcontentloaded' });
      // Click any "Clear transients" or "Update caches" button
      const tools = await page.$$eval('.tools-table tr', rows =>
        rows.map(r => {
          const name = (r.querySelector('td strong, th') || {}).textContent || '';
          const btn = r.querySelector('.button, input[type="submit"]');
          const href = btn ? btn.getAttribute('href') || (btn.closest('form') && btn.closest('form').getAttribute('action')) : null;
          return { name: name.trim(), href };
        })
      );
      const target = tools.find(t => /cache|transient/i.test(t.name));
      if (target) console.log('WC tools cache candidate:', target);
    } catch(_){}

    console.log('\nDone cache purge attempts.');
  } catch (e) {
    console.error('FATAL:', e.message);
    try { await page.screenshot({ path: path.join(EVID, 'purge-error.png'), fullPage: true }); } catch(_){}
  } finally {
    await browser.close();
  }
})();
