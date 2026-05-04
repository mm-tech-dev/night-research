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
  page.setDefaultTimeout(120000);

  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}

  await page.goto(`${SITE}/wp-admin/post.php?post=6971&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 90000 });
  await page.waitForTimeout(5000);

  const probe = await page.evaluate(() => {
    const out = {};
    const doc = elementor.documents.getCurrent();
    out.doc_keys = Object.keys(doc);
    out.doc_container_keys = doc.container ? Object.keys(doc.container) : null;
    out.model_keys = doc.container && doc.container.model ? Object.keys(doc.container.model.attributes || {}) : null;
    out.elements_from_attr = doc.container.model.attributes.elements;
    out.elements_via_get = doc.container.model.get('elements');
    // children?
    if (doc.container.children) out.children_len = doc.container.children.length;
    if (doc.container.view && doc.container.view.collection) {
      out.view_coll_len = doc.container.view.collection.length;
    }
    // alternate data paths
    out.doc_config_elements_len = doc.config && doc.config.elements ? doc.config.elements.length : null;
    // Inspect saver & $e
    out.saver = Object.keys(elementor.saver || {});
    out.saver_proto = elementor.saver ? Object.getPrototypeOf(elementor.saver) && Object.getOwnPropertyNames(Object.getPrototypeOf(elementor.saver)) : null;
    out.e_run_commands = (window.$e && $e.commands && $e.commands.getAll) ? $e.commands.getAll().filter(c => /save/.test(c)).slice(0, 20) : null;
    return out;
  });
  console.log(JSON.stringify(probe, null, 2).slice(0, 5000));

  await b.close();
})();
