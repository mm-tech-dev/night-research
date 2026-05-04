#!/usr/bin/env node
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

  for (const postId of [6438, 6027, 4231]) {
    console.log(`\n=== Template ${postId} ===`);
    await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 120000 });
    try {
      await page.waitForFunction(() => {
        const doc = elementor.documents.getCurrent();
        return doc && doc.container && doc.container.children && doc.container.children.length > 0;
      }, { timeout: 120000 });
    } catch(e) {
      console.log('  children never loaded, using config.elements');
    }

    const widgets = await page.evaluate(() => {
      const doc = elementor.documents.getCurrent();
      const out = [];
      function walkConfig(elements, depth = 0) {
        if (!elements) return;
        for (const el of elements) {
          if (el.widgetType) {
            const s = el.settings || {};
            out.push({
              depth,
              widgetType: el.widgetType,
              id: el.id,
              header_size: s.header_size,
              title_tag: s.title_tag,
              title_size: s.title_size,
              title_html_tag: s.title_html_tag,
              title_tag_type: s.title_tag_type,
              title_field: s.title || null,
              // Show all keys that contain 'title' or 'tag'
              title_keys: Object.keys(s).filter(k => /title|tag|size|header/i.test(k)),
            });
          }
          if (el.elements && el.elements.length) walkConfig(el.elements, depth + 1);
        }
      }
      walkConfig(doc.config.elements);
      return out;
    });

    console.log(`  ${widgets.length} widgets total. Potential title widgets:`);
    widgets.filter(w => /heading|title/i.test(w.widgetType) || w.title_field || w.title_keys.length).forEach(w => {
      const indent = '  '.repeat(w.depth + 1);
      console.log(`${indent}[${w.widgetType}] hs=${w.header_size} tag=${w.title_tag} size=${w.title_size} html=${w.title_html_tag} tagtype=${w.title_tag_type} text="${(w.title_field || '').toString().slice(0,40)}" keys=${JSON.stringify(w.title_keys.slice(0, 6))}`);
    });

    fs.writeFileSync(path.join(EVID, `tpl-${postId}-widgets.json`), JSON.stringify(widgets, null, 2));
  }

  await b.close();
})();
