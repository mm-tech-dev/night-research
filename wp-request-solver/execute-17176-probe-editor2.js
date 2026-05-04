#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://sby.co.il';

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(240000);

  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}

  await page.goto(`${SITE}/wp-admin/post.php?post=6971&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 120000 });

  // Wait longer for preview iframe to render
  console.log('waiting for preview iframe...');
  await page.waitForFunction(() => {
    const doc = elementor.documents.getCurrent();
    return doc && doc.container && doc.container.children && doc.container.children.length > 0;
  }, { timeout: 180000 }).catch(() => console.log('timeout but continuing'));

  const probe = await page.evaluate(() => {
    const doc = elementor.documents.getCurrent();
    const out = { children_len: doc.container.children.length, config_elements_len: doc.config.elements.length };
    // Walk config.elements for heading
    function walk(elements, out = []) {
      if (!elements) return out;
      for (const el of elements) {
        if (el.widgetType === 'heading') {
          out.push({ id: el.id, tag: (el.settings && el.settings.header_size) || '(default)', text: (el.settings && el.settings.title || '').slice(0, 40) });
        }
        if (el.elements && el.elements.length) walk(el.elements, out);
      }
      return out;
    }
    out.headings_from_config = walk(doc.config.elements);

    // Walk via children
    function walkChildren(container, out = []) {
      if (!container || !container.children) return out;
      for (let i = 0; i < container.children.length; i++) {
        const child = container.children.findAtIndex ? container.children.findAtIndex(i) : container.children.at(i);
        if (!child) continue;
        const wt = child.model.get('widgetType');
        if (wt === 'heading') {
          out.push({ id: child.id, tag: child.model.get('settings').get('header_size') || '(default)', text: (child.model.get('settings').get('title') || '').slice(0, 40) });
        }
        walkChildren(child, out);
      }
      return out;
    }
    out.headings_from_children = walkChildren(doc.container);
    return out;
  });

  console.log(JSON.stringify(probe, null, 2));
  await b.close();
})();
