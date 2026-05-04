#!/usr/bin/env node
/** Test H1 fix on ONE page (חיפוי id=6971 — simple case, only 1 heading). */
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
  page.setDefaultTimeout(120000);

  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}
  console.log('✓ login');

  const postId = 6971;
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  console.log('  page loaded, waiting for editor globals...');
  try {
    await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 90000 });
  } catch (e) {
    await page.screenshot({ path: path.join(EVID, 'h1fix-editor-load-fail.png'), fullPage: true });
    const state = await page.evaluate(() => ({ hasEl: !!window.elementor, docsType: window.elementor ? typeof elementor.documents : 'n/a', bodyClass: document.body.className.slice(0, 200) }));
    console.log('editor load FAILED. state:', JSON.stringify(state));
    await b.close();
    return;
  }
  await page.waitForTimeout(3000);
  console.log('✓ editor loaded');

  // Inspect what's available
  const probe = await page.evaluate(() => {
    const doc = elementor.documents.getCurrent();
    const out = {
      hasDoc: !!doc,
      hasSaver: !!elementor.saver,
      saverMethods: elementor.saver ? Object.keys(elementor.saver).filter(k => typeof elementor.saver[k] === 'function') : [],
      hasE: !!window.$e,
      eRunExists: !!(window.$e && $e.run),
      documentStatus: doc && doc.editor ? doc.editor.status : null,
      dataTag: (() => {
        const el = doc.container.model.get('elements');
        if (!el) return null;
        let first = null, firstSettings = null;
        function walk(coll) {
          coll.each(m => {
            if (first) return;
            if (m.get('widgetType') === 'heading' && !first) {
              first = m;
              firstSettings = m.get('settings').toJSON ? m.get('settings').toJSON() : m.get('settings');
            }
            const c = m.get('elements'); if (c && c.length) walk(c);
          });
        }
        walk(el);
        return firstSettings;
      })(),
    };
    return out;
  });
  console.log('probe:', JSON.stringify(probe, null, 2));

  // Apply mutation
  const mutR = await page.evaluate(() => {
    const doc = elementor.documents.getCurrent();
    const elements = doc.container.model.get('elements');
    let firstHeading = null;
    function walk(coll) {
      coll.each(m => {
        if (firstHeading) return;
        if (m.get('widgetType') === 'heading') { firstHeading = m; return; }
        const c = m.get('elements'); if (c && c.length) walk(c);
      });
    }
    walk(elements);
    if (!firstHeading) return { error: 'no_heading' };

    const prev = firstHeading.get('settings').get('header_size');

    // Try the command API (proper way)
    if (window.$e && $e.run && firstHeading._container) {
      try {
        $e.run('document/elements/settings', {
          container: firstHeading._container,
          settings: { header_size: 'h1' },
        });
        return { method: 'command_api', prev, after: firstHeading.get('settings').get('header_size') };
      } catch(e) { /* fall through */ }
    }
    // Fallback: direct set
    firstHeading.get('settings').set('header_size', 'h1');
    return { method: 'direct', prev, after: firstHeading.get('settings').get('header_size') };
  });
  console.log('mutation:', JSON.stringify(mutR, null, 2));
  await page.waitForTimeout(1500);

  // Save via savePublish / saveUpdate
  const saveR = await page.evaluate(async () => {
    try {
      if (window.$e && $e.run) {
        try {
          // Try $e.run command for saving
          await $e.run('document/save/auto', { force: true });
          return { method: '$e.run_auto' };
        } catch (e) {
          // Try default save
          try {
            await $e.run('document/save/default');
            return { method: '$e.run_default', note: e.message };
          } catch(e2) {
            // Try publish
            return new Promise((resolve) => {
              elementor.saver.savePublish({
                onSuccess: () => resolve({ method: 'savePublish.onSuccess' }),
                onError: (err) => resolve({ method: 'savePublish.onError', err: err && err.message || String(err) }),
              });
              setTimeout(() => resolve({ method: 'savePublish.timeout' }), 30000);
            });
          }
        }
      }
    } catch (e) { return { error: e.message }; }
  });
  console.log('save:', JSON.stringify(saveR, null, 2));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: path.join(EVID, 'h1fix-test-after.png'), fullPage: false });

  // Fetch the saved data back to confirm
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=elementor`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 90000 });
  const verify = await page.evaluate(() => {
    const doc = elementor.documents.getCurrent();
    const elements = doc.container.model.get('elements');
    let firstHeading = null;
    function walk(coll) { coll.each(m => { if (firstHeading) return; if (m.get('widgetType') === 'heading') firstHeading = m; const c = m.get('elements'); if (c && c.length) walk(c); }); }
    walk(elements);
    return firstHeading ? { tag: firstHeading.get('settings').get('header_size'), text: firstHeading.get('settings').get('title') } : null;
  });
  console.log('verify after reload:', JSON.stringify(verify));

  await b.close();
})();
