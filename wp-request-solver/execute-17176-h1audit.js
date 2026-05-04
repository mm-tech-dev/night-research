#!/usr/bin/env node
/**
 * Read _elementor_data for each of the 12 pages and map heading widgets
 * (heading, theme-post-title, loop grids with templates) so we can plan H1 fixes.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://sby.co.il';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', 'recIsWT8X1O7sp2nz');
const META = JSON.parse(fs.readFileSync(path.join(EVID, 'apply-log.json'), 'utf8'));

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

function collectHeadings(elements, out = [], pathStr = '') {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const step = `${pathStr}[${i}]${el.widgetType || el.elType || '?'}`;
    if (el.widgetType === 'heading' || el.widgetType === 'theme-post-title' || el.widgetType === 'post-title') {
      const s = el.settings || {};
      out.push({
        path: step,
        widgetType: el.widgetType,
        id: el.id,
        tag: s.header_size || s.title_tag || s.title_html_tag || '(default)',
        text: (s.title || s.selected_icon || '').toString().slice(0, 60),
        has_dynamic: JSON.stringify(s).includes('__dynamic__'),
      });
    } else if (el.widgetType === 'loop-grid' || el.widgetType === 'loop-carousel' || el.widgetType === 'posts' || el.widgetType === 'portfolio' || el.widgetType === 'archive-posts') {
      const s = el.settings || {};
      out.push({
        path: step,
        widgetType: el.widgetType,
        id: el.id,
        tag: '(LOOP)',
        template_id: s.template_id || null,
        title_tag: s.title_tag || s.title_size || null,
      });
    } else if (/archive|products-archive|wc/.test(el.widgetType || '')) {
      out.push({ path: step, widgetType: el.widgetType, id: el.id, tag: '(WC)', settings_keys: Object.keys(el.settings || {}).slice(0,10) });
    }
    if (el.elements && el.elements.length) collectHeadings(el.elements, out, step + '>');
  }
  return out;
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  await login(page);
  console.log('✓ login');

  const audit = [];
  for (const item of META) {
    console.log(`→ ${item.name_he} (id=${item.id})`);
    await page.goto(`${SITE}/wp-admin/post.php?post=${item.id}&action=edit`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const raw = await page.evaluate(() => {
      const el = document.querySelector('#_elementor_data') || document.querySelector('[name="_elementor_data"]');
      return el ? el.value : null;
    });
    if (!raw) { audit.push({ id: item.id, name: item.name_he, error: 'no_elementor_data' }); continue; }
    let data; try { data = JSON.parse(raw); } catch(e) { audit.push({id:item.id,name:item.name_he,error:'invalid_json'}); continue; }
    const headings = collectHeadings(data);
    audit.push({ id: item.id, name: item.name_he, headings });
    console.log(`   headings: ${headings.length}`);
    headings.slice(0, 8).forEach(h => console.log(`     ${h.tag} | ${h.widgetType} | ${h.text || h.template_id || ''}`));
  }
  fs.writeFileSync(path.join(EVID, 'h1-audit.json'), JSON.stringify(audit, null, 2));

  // Summary
  console.log('\nSUMMARY:');
  for (const a of audit) {
    if (a.error) { console.log(`  ${a.name}: ERROR ${a.error}`); continue; }
    const tags = {};
    for (const h of a.headings) {
      tags[h.tag] = (tags[h.tag] || 0) + 1;
    }
    console.log(`  ${a.name}: ${a.headings.length} heading widgets: ${JSON.stringify(tags)}`);
  }
  await b.close();
})();
