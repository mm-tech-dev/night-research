#!/usr/bin/env node
/** Fix template 6438 — set theme-post-title widget's header_size to h2. */
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
  console.log('✓ login');

  const postId = 6438;
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 120000 });
  await page.waitForFunction(() => {
    const doc = elementor.documents.getCurrent();
    return doc && doc.container && doc.container.children && doc.container.children.length > 0;
  }, { timeout: 180000 });
  console.log('✓ editor loaded for 6438');

  const result = await page.evaluate(async () => {
    const doc = elementor.documents.getCurrent();
    let target = null;
    function walk(container) {
      if (target) return;
      if (!container || !container.children) return;
      for (let i = 0; i < container.children.length; i++) {
        const child = container.children.at(i);
        if (target) return;
        if (child && child.model && child.model.get('widgetType') === 'theme-post-title') {
          target = child;
          return;
        }
        walk(child);
      }
    }
    walk(doc.container);
    if (!target) return { error: 'no_theme_post_title' };

    const prev = target.model.get('settings').get('header_size');
    $e.run('document/elements/settings', { container: target, settings: { header_size: 'h2' } });
    const after = target.model.get('settings').get('header_size');

    try { await $e.run('document/save/publish'); }
    catch(e) { return { action: 'saved_failed', prev, after, error: e.message || String(e) }; }
    return { action: 'set_header_size_h2', prev, after };
  });
  console.log('result:', JSON.stringify(result, null, 2));
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(EVID, 'tpl-6438-after.png'), fullPage: false });
  await b.close();
})();
