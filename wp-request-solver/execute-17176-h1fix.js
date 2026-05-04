#!/usr/bin/env node
/**
 * H1 fix — works inside the Elementor editor:
 *   1. Load editor for each page
 *   2. Mutate FIRST heading widget's `header_size` to 'h1'
 *   3. Save via elementor.saver.saveDraft() / publish()
 *
 * Also handles loop templates (6438 Awagami/brand card, 6027 Awagami variant, 4231 home)
 * to ensure their product title widget is NOT h1.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://sby.co.il';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', 'recIsWT8X1O7sp2nz');

// Pages and loop templates to fix
const PAGES = JSON.parse(fs.readFileSync(path.join(EVID, 'apply-log.json'), 'utf8'));
const LOOP_TEMPLATES = [
  { id: 6438, name: 'Canson/Hahnemühle/Sihl/Epson product card' },
  { id: 6027, name: 'Awagami product card' },
  { id: 4231, name: 'Home loop card' },
];

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

async function openEditor(page, postId) {
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 90000 });
  await page.waitForTimeout(2000);
}

/**
 * In-page fix function: sets the first 'heading' widget's header_size to 'h1' unless already set.
 * Returns { fixed:[], alreadyH1, total }.
 */
async function fixFirstHeadingToH1(page) {
  return await page.evaluate(() => {
    const doc = elementor.documents.getCurrent();
    if (!doc) return { error: 'no_current_doc' };
    const elements = doc.container.model.get('elements');
    if (!elements) return { error: 'no_elements' };

    let firstHeading = null;
    let h1Count = 0;
    function walk(coll) {
      coll.each(m => {
        const t = m.get('widgetType');
        if (t === 'heading' && !firstHeading) {
          const s = m.get('settings');
          // Backbone model settings is itself a model with attributes
          const hs = s && s.get ? s.get('header_size') : (s && s.header_size);
          if (!hs || hs === 'default') {
            firstHeading = { model: m, settings: s };
          } else if (hs === 'h1') {
            h1Count++;
          }
        } else if (t === 'heading') {
          const s = m.get('settings');
          const hs = s && s.get ? s.get('header_size') : (s && s.header_size);
          if (hs === 'h1') h1Count++;
        }
        const children = m.get('elements');
        if (children && children.length) walk(children);
      });
    }
    walk(elements);

    if (firstHeading) {
      const hs = firstHeading.settings.get('header_size');
      const currentText = firstHeading.settings.get('title');
      firstHeading.settings.set('header_size', 'h1');
      // Trigger editor change event so saver sees it as dirty
      doc.history && doc.history.addItem && doc.history.addItem({ type: 'settings', title: 'H1 Fix', subTitle: '' });
      elementor.channels.editor.trigger('change');
      // Mark document dirty
      if (doc.config) doc.config.panel && doc.config.panel.needsRefresh && (doc.config.panel.needsRefresh = true);
      return { ok: true, fixedFirst: { prev: hs, text: currentText }, h1CountBefore: h1Count };
    }
    return { ok: false, reason: 'no_heading_found', h1CountBefore: h1Count };
  });
}

/**
 * Demote any heading widget with header_size='h1' to 'h2'.
 * Used for loop templates to prevent products from getting H1.
 */
async function demoteH1sToH2(page) {
  return await page.evaluate(() => {
    const doc = elementor.documents.getCurrent();
    if (!doc) return { error: 'no_current_doc' };
    const elements = doc.container.model.get('elements');
    if (!elements) return { error: 'no_elements' };
    let demoted = 0;
    function walk(coll) {
      coll.each(m => {
        const t = m.get('widgetType');
        if (t === 'heading') {
          const s = m.get('settings');
          const hs = s && s.get ? s.get('header_size') : (s && s.header_size);
          if (hs === 'h1') {
            s.set('header_size', 'h2');
            demoted++;
          }
        }
        const children = m.get('elements');
        if (children && children.length) walk(children);
      });
    }
    walk(elements);
    if (demoted > 0) {
      elementor.channels.editor.trigger('change');
    }
    return { demoted };
  });
}

async function saveDoc(page) {
  return await page.evaluate(async () => {
    try {
      // Mark document as modified
      const doc = elementor.documents.getCurrent();
      if (!doc) return { error: 'no_doc' };
      doc.editor.status = 'modified';
      // Trigger change event so saver sees it as dirty
      elementor.channels.editor.trigger('change');
      // Use the saver — save as PUBLISH (not draft, since these are published pages)
      await new Promise((resolve, reject) => {
        let done = false;
        elementor.saver.savePublish({
          onSuccess: () => { if (!done) { done = true; resolve({ ok: true }); } },
          onError: (err) => { if (!done) { done = true; reject(err || new Error('save failed')); } },
        });
        setTimeout(() => { if (!done) { done = true; resolve({ ok: 'timeout' }); } }, 25000);
      });
      return { ok: true };
    } catch (e) { return { error: e.message || String(e) }; }
  });
}

async function processPage(page, postId, name, mode) {
  console.log(`\n→ ${name} (id=${postId}) mode=${mode}`);
  try {
    await openEditor(page, postId);
    await page.screenshot({ path: path.join(EVID, `h1-before-${postId}.png`), fullPage: false });

    const fixResult = mode === 'demoteH1' ? await demoteH1sToH2(page) : await fixFirstHeadingToH1(page);
    console.log('  mutation:', JSON.stringify(fixResult));

    if ((mode === 'demoteH1' && fixResult.demoted > 0) || (mode === 'promoteFirst' && fixResult.ok)) {
      const saveR = await saveDoc(page);
      console.log('  save:', JSON.stringify(saveR));
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(EVID, `h1-after-${postId}.png`), fullPage: false });
      return { id: postId, name, fixResult, saveResult: saveR };
    } else {
      return { id: postId, name, fixResult, saveResult: { skipped: true } };
    }
  } catch (e) {
    console.log('  ERR:', e.message);
    return { id: postId, name, error: e.message };
  }
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  await login(page);
  console.log('✓ login');

  const results = { pages: [], loopTemplates: [] };

  // Step 1: Fix first heading on each of the 12 pages → H1
  for (const p of PAGES) {
    const r = await processPage(page, p.id, p.name_he, 'promoteFirst');
    results.pages.push(r);
    fs.writeFileSync(path.join(EVID, 'h1-fix-results.json'), JSON.stringify(results, null, 2));
  }

  // Step 2: Demote H1s in loop templates
  for (const t of LOOP_TEMPLATES) {
    const r = await processPage(page, t.id, t.name, 'demoteH1');
    results.loopTemplates.push(r);
    fs.writeFileSync(path.join(EVID, 'h1-fix-results.json'), JSON.stringify(results, null, 2));
  }

  await b.close();
  console.log('\nDONE. Results saved.');
})();
