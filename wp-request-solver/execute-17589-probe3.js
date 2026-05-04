#!/usr/bin/env node
/**
 * Inspect what's actually on the post edit screen + which REST endpoints are exposed for Elementor.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://aryos.net';
const EVID = path.resolve(__dirname, 'reports', '2026-05-03', 'evidence', 'recVhky3jWVIuwxq2');

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await login(page);
  console.log('✓ login');

  // 1. Inspect REST namespaces list for elementor
  const ns = await page.evaluate(async () => {
    const r = await fetch('/wp-json/?context=help', { credentials: 'same-origin' });
    if (!r.ok) return { error: r.status };
    const j = await r.json();
    const elNs = Object.keys(j.namespaces || {}).filter(k => /elementor/i.test(k));
    const allRoutes = Object.keys(j.routes || {}).filter(k => /elementor/i.test(k));
    return { elNs, allRoutes };
  });
  console.log('Elementor REST namespaces/routes:', JSON.stringify(ns, null, 2).slice(0, 2000));

  // 2. Check what edit screen looks like for template 4567
  console.log('\n→ template 4567 edit screen inspection');
  await page.goto(`${SITE}/wp-admin/post.php?post=4567&action=edit`, { waitUntil: 'domcontentloaded' });
  const inspect4567 = await page.evaluate(() => {
    const url = location.href;
    const title = document.title;
    const editorActive = !!document.querySelector('#elementor-switch-mode-button');
    const editorBlocks = !!document.querySelector('.block-editor');
    const elementorMeta = !!document.querySelector('#_elementor_data');
    const postType = (document.body.className.match(/post-type-(\w+)/) || [])[1];
    const inputs = Array.from(document.querySelectorAll('input[name^="_elementor"], input[id*="elementor"]')).map(i => ({ id: i.id, name: i.name }));
    const hasGutenberg = !!window.wp && !!window.wp.blocks;
    return { url, title, editorActive, editorBlocks, elementorMeta, postType, inputs, hasGutenberg };
  });
  console.log(JSON.stringify(inspect4567, null, 2));

  // 3. Try fetching post meta via REST
  console.log('\n→ try wp/v2/elementor_library/4567');
  const tplRest = await page.evaluate(async () => {
    const r = await fetch('/wp-json/wp/v2/elementor_library/4567?context=edit', { credentials: 'same-origin', headers: { 'X-WP-Nonce': window.wpApiSettings?.nonce || '' } });
    if (!r.ok) return { error: r.status, body: (await r.text()).slice(0, 300) };
    const j = await r.json();
    return { status: r.status, keys: Object.keys(j), hasMeta: !!j.meta, metaKeys: j.meta ? Object.keys(j.meta) : null, hasElementorData: j.meta && '_elementor_data' in j.meta };
  });
  console.log(JSON.stringify(tplRest, null, 2));

  // 4. Try elementor/v1/globals or /elementor/v1/site-navigation
  console.log('\n→ list /elementor/v1/');
  const elv1 = await page.evaluate(async () => {
    const r = await fetch('/wp-json/elementor/v1', { credentials: 'same-origin' });
    if (!r.ok) return { error: r.status, body: (await r.text()).slice(0, 200) };
    const j = await r.json();
    return j;
  });
  console.log(JSON.stringify(elv1, null, 2).slice(0, 2000));

  fs.writeFileSync(path.join(EVID, 'probe3-output.json'), JSON.stringify({ ns, inspect4567, tplRest, elv1 }, null, 2));
  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
