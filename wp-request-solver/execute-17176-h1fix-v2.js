#!/usr/bin/env node
/**
 * H1 fix v2 — uses Elementor $e.run command API + document/save/publish.
 *   - For 12 pages: promote FIRST heading widget to h1
 *   - For 3 loop templates (6438 brand, 6027 Awagami, 4231 home): demote H1 headings to h2
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://sby.co.il';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', 'recIsWT8X1O7sp2nz');

const PAGES = JSON.parse(fs.readFileSync(path.join(EVID, 'apply-log.json'), 'utf8'));
const LOOP_TEMPLATES = [
  { id: 6438, name: 'brand_loop_card' },
  { id: 6027, name: 'awagami_loop_card' },
  { id: 4231, name: 'home_loop_card' },
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
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 120000 });
  await page.waitForFunction(() => {
    const doc = elementor.documents.getCurrent();
    return doc && doc.container && doc.container.children && doc.container.children.length > 0;
  }, { timeout: 180000 });
}

async function promoteFirstHeadingToH1(page) {
  return await page.evaluate(async () => {
    const doc = elementor.documents.getCurrent();
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
    if (!firstHeadingContainer) return { action: 'none', reason: 'no_heading' };

    const prev = firstHeadingContainer.model.get('settings').get('header_size');
    if (prev === 'h1') return { action: 'noop', prev, note: 'already_h1' };

    const title = firstHeadingContainer.model.get('settings').get('title');
    $e.run('document/elements/settings', { container: firstHeadingContainer, settings: { header_size: 'h1' } });

    const after = firstHeadingContainer.model.get('settings').get('header_size');
    try { await $e.run('document/save/publish'); }
    catch(e) { return { action: 'saved_failed', prev, after, title, error: e.message || String(e) }; }
    return { action: 'promoted', prev, after, title };
  });
}

async function demoteAllH1sToH2(page) {
  return await page.evaluate(async () => {
    const doc = elementor.documents.getCurrent();
    const demoted = [];
    function walk(container) {
      if (!container || !container.children) return;
      for (let i = 0; i < container.children.length; i++) {
        const child = container.children.at(i);
        if (!child || !child.model) continue;
        if (child.model.get('widgetType') === 'heading') {
          const hs = child.model.get('settings').get('header_size');
          if (hs === 'h1') {
            $e.run('document/elements/settings', { container: child, settings: { header_size: 'h2' } });
            demoted.push({ id: child.id, title: (child.model.get('settings').get('title') || '').slice(0, 60) });
          }
        }
        walk(child);
      }
    }
    walk(doc.container);
    if (demoted.length === 0) return { action: 'noop', demoted: 0 };
    try { await $e.run('document/save/publish'); }
    catch(e) { return { action: 'demoted_but_save_failed', demoted: demoted.length, details: demoted, error: e.message || String(e) }; }
    return { action: 'demoted', demoted: demoted.length, details: demoted };
  });
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);
  await login(page);
  console.log('✓ login');

  const results = { pages: [], loopTemplates: [] };

  // Step 1: Fix first heading on each page
  for (const p of PAGES) {
    console.log(`\n→ PAGE: ${p.name_he} (id=${p.id})`);
    try {
      await openEditor(page, p.id);
      const r = await promoteFirstHeadingToH1(page);
      console.log(`  result:`, JSON.stringify(r));
      results.pages.push({ id: p.id, name: p.name_he, result: r });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('  ERR:', e.message);
      results.pages.push({ id: p.id, name: p.name_he, error: e.message });
    }
    fs.writeFileSync(path.join(EVID, 'h1-fix-results.json'), JSON.stringify(results, null, 2));
  }

  // Step 2: Demote H1s in loop templates
  for (const t of LOOP_TEMPLATES) {
    console.log(`\n→ LOOP TEMPLATE: ${t.name} (id=${t.id})`);
    try {
      await openEditor(page, t.id);
      const r = await demoteAllH1sToH2(page);
      console.log(`  result:`, JSON.stringify(r));
      results.loopTemplates.push({ id: t.id, name: t.name, result: r });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.log('  ERR:', e.message);
      results.loopTemplates.push({ id: t.id, name: t.name, error: e.message });
    }
    fs.writeFileSync(path.join(EVID, 'h1-fix-results.json'), JSON.stringify(results, null, 2));
  }

  await b.close();
  console.log('\nDONE.');
})();
