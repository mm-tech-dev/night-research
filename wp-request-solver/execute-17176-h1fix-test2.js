#!/usr/bin/env node
/** Full end-to-end test: fix חיפוי (id=6971) heading to H1 via $e.run command API. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://sby.co.il';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', 'recIsWT8X1O7sp2nz');

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);

  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}

  const postId = 6971;
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 120000 });
  await page.waitForFunction(() => {
    const doc = elementor.documents.getCurrent();
    return doc && doc.container && doc.container.children && doc.container.children.length > 0;
  }, { timeout: 180000 });
  console.log('✓ editor + preview loaded');

  // Run the fix + save
  const result = await page.evaluate(async () => {
    const doc = elementor.documents.getCurrent();

    // Find first heading container
    let firstHeadingContainer = null;
    function walk(container) {
      if (firstHeadingContainer) return;
      if (!container || !container.children) return;
      for (let i = 0; i < container.children.length; i++) {
        const child = container.children.at(i);
        if (firstHeadingContainer) return;
        if (child && child.model && child.model.get('widgetType') === 'heading') {
          firstHeadingContainer = child;
          return;
        }
        walk(child);
      }
    }
    walk(doc.container);
    if (!firstHeadingContainer) return { error: 'no_heading_container' };

    const prevTag = firstHeadingContainer.model.get('settings').get('header_size');

    // Use Elementor's command API to update settings — this marks doc dirty
    $e.run('document/elements/settings', {
      container: firstHeadingContainer,
      settings: { header_size: 'h1' },
    });

    const afterTag = firstHeadingContainer.model.get('settings').get('header_size');

    // Save via publish command
    let saveResult;
    try {
      const r = await $e.run('document/save/publish');
      saveResult = { ok: true, r: r && r.type || 'ok' };
    } catch (e) {
      saveResult = { ok: false, error: e.message || String(e) };
    }

    return { prevTag, afterTag, saveResult };
  });

  console.log('fix+save result:', JSON.stringify(result, null, 2));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(EVID, 'h1fix-test2-after.png'), fullPage: false });

  // Verify on live frontend
  await page.waitForTimeout(2000);
  const html = await (await require('https').get).bind(null);
  // use fetch via node
  const { default: fetch } = await import('node-fetch').catch(() => ({ default: null }));

  await b.close();

  // Live verification via curl
  console.log('\n-- Live verification --');
  const https = require('https');
  await new Promise((resolve) => {
    https.get('https://sby.co.il/חיפוי/', { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/130' } }, (res) => {
      let body = ''; res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => {
        const h1s = [...body.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g,'').trim());
        const title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1];
        console.log('title:', title);
        console.log('H1 count:', h1s.length);
        h1s.forEach(h => console.log('  H1:', h));
        resolve();
      });
    });
  });
})();
