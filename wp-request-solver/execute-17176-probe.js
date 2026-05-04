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
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/post.php?post=5981&action=edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Find all hidden inputs with meta-looking names
  const inputs = await page.$$eval('input, textarea', els => els.map(e => ({ tag: e.tagName, type: e.type, name: e.name, id: e.id, valLen: (e.value || '').length })).filter(x => x.name && (/_elementor|meta|elementor/.test(x.name) || x.valLen > 5000)));
  console.log('Elementor-ish inputs:');
  inputs.forEach(i => console.log(`  ${i.tag}<${i.type}> name=${i.name} id=${i.id} valLen=${i.valLen}`));

  // Check body class / page mode
  const info = await page.evaluate(() => ({
    bodyClass: document.body.className,
    hasElementorEditor: !!document.querySelector('#elementor-editor-inline-styles, [data-elementor-id]'),
    editorButtons: Array.from(document.querySelectorAll('.page-title-action, .edit-with-elementor, #elementor-editor-button'))
                       .map(e => ({ text: e.textContent.trim().slice(0,40), href: e.href || null })),
  }));
  console.log('info:', JSON.stringify(info, null, 2));

  await b.close();
})();
