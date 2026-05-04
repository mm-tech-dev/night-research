#!/usr/bin/env node
/**
 * Targeted probe: read _elementor_data for the Single Product template (4567) and contact page (35).
 * Try both edit screen and Elementor REST API.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://aryos.net';
const EVID = path.resolve(__dirname, 'reports', '2026-05-03', 'evidence', 'recVhky3jWVIuwxq2');

const TARGETS = [
  { id: 4567, name: 'Single Product template' },
  { id: 35,   name: 'Contact page (צור קשר)' },
];

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

function walk(elements, out = []) {
  for (const el of elements || []) {
    const s = el.settings || {};
    out.push({
      elType: el.elType,
      widgetType: el.widgetType || null,
      id: el.id,
      header_size: s.header_size || null,
      title_tag: s.title_tag || null,
      title_html_tag: s.title_html_tag || null,
      title: typeof s.title === 'string' ? s.title.slice(0, 80) : null,
    });
    if (el.elements && el.elements.length) walk(el.elements, out);
  }
  return out;
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  await login(page);
  console.log('✓ login');

  const out = {};
  for (const t of TARGETS) {
    console.log(`\n→ ${t.name} (id=${t.id})`);
    // Method A: classic edit screen
    let raw = null;
    try {
      await page.goto(`${SITE}/wp-admin/post.php?post=${t.id}&action=edit`, { waitUntil: 'domcontentloaded', timeout: 90000 });
      raw = await page.evaluate(() => {
        const el = document.querySelector('#_elementor_data') || document.querySelector('[name="_elementor_data"]') || document.querySelector('[name=_elementor_data]');
        return el ? el.value : null;
      });
      console.log(`  edit-screen _elementor_data: ${raw ? raw.length + ' chars' : 'not found'}`);
    } catch(e) { console.log(`  edit-screen ERR: ${e.message}`); }

    // Method B: Elementor REST API
    if (!raw || raw === '[]') {
      try {
        const apiData = await page.evaluate(async (id) => {
          const r = await fetch(`/wp-json/elementor/v1/documents/${id}`, { credentials: 'same-origin', headers: { 'X-WP-Nonce': (window.wpApiSettings && window.wpApiSettings.nonce) || '' } });
          if (!r.ok) return { error: r.status, body: (await r.text()).slice(0, 200) };
          return await r.json();
        }, t.id);
        console.log(`  REST elementor doc: ${apiData.error ? 'ERR ' + apiData.error : 'OK keys=' + Object.keys(apiData).slice(0,10).join(',')}`);
        if (apiData && !apiData.error) {
          // Look for elements
          if (apiData.elements) raw = JSON.stringify(apiData.elements);
          else if (apiData.content) raw = apiData.content;
          fs.writeFileSync(path.join(EVID, `rest-doc-${t.id}.json`), JSON.stringify(apiData).slice(0, 50000));
        }
      } catch(e) { console.log(`  REST ERR: ${e.message}`); }
    }

    if (raw && raw !== '[]') {
      try {
        const data = JSON.parse(raw);
        const headings = walk(data).filter(w =>
          w.widgetType && (w.widgetType.includes('heading') || w.widgetType.includes('title') || w.widgetType.includes('post-title'))
        );
        console.log(`  Heading-like widgets: ${headings.length}`);
        headings.forEach(h => console.log(`    ${h.header_size || h.title_tag || '?'} | ${h.widgetType} | id=${h.id} | "${h.title || ''}"`));
        out[t.id] = { name: t.name, headingsCount: headings.length, headings };
        fs.writeFileSync(path.join(EVID, `data-${t.id}.json`), JSON.stringify(data, null, 2));
      } catch(e) { console.log('  JSON parse ERR:', e.message); }
    } else {
      console.log('  no data found by either method');
      out[t.id] = { name: t.name, error: 'no_data' };
    }
  }

  fs.writeFileSync(path.join(EVID, 'probe2-summary.json'), JSON.stringify(out, null, 2));
  console.log('\n=== DONE ===');
  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
