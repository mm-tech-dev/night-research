#!/usr/bin/env node
/**
 * Read _elementor_data via wp/v2/{post_type}/{id}?context=edit and parse heading widgets.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://aryos.net';
const EVID = path.resolve(__dirname, 'reports', '2026-05-03', 'evidence', 'recVhky3jWVIuwxq2');

const TARGETS = [
  { id: 4567, postType: 'elementor_library', name: 'Single Product template' },
  { id: 35,   postType: 'pages',             name: 'Contact page (צור קשר)' },
];

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

function walk(elements, out = [], parentChain = '') {
  for (const el of elements || []) {
    const s = el.settings || {};
    const chain = `${parentChain}/${el.elType || '?'}:${el.widgetType || ''}`;
    if (el.widgetType) {
      out.push({
        elType: el.elType,
        widgetType: el.widgetType,
        id: el.id,
        chain,
        header_size: s.header_size || null,
        title_tag: s.title_tag || null,
        title_html_tag: s.title_html_tag || null,
        title: typeof s.title === 'string' ? s.title.slice(0, 80) : null,
        link: s.link && s.link.url ? s.link.url.slice(0, 80) : null,
      });
    }
    if (el.elements && el.elements.length) walk(el.elements, out, chain);
  }
  return out;
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await login(page);
  console.log('✓ login');

  const out = {};
  for (const t of TARGETS) {
    console.log(`\n→ ${t.name} (id=${t.id}, type=${t.postType})`);
    const result = await page.evaluate(async ({id, postType}) => {
      const r = await fetch(`/wp-json/wp/v2/${postType}/${id}?context=edit`, {
        credentials: 'same-origin',
        headers: { 'X-WP-Nonce': window.wpApiSettings?.nonce || '' }
      });
      if (!r.ok) return { error: r.status, body: (await r.text()).slice(0, 300) };
      const j = await r.json();
      return { rawElementor: (j.meta && j.meta._elementor_data) || null, slug: j.slug, title: j.title?.raw || j.title?.rendered };
    }, { id: t.id, postType: t.postType });

    if (result.error) {
      console.log(`  ERR ${result.error}: ${result.body}`);
      out[t.id] = { name: t.name, error: result.error };
      continue;
    }
    if (!result.rawElementor) {
      console.log(`  no _elementor_data in meta`);
      out[t.id] = { name: t.name, error: 'no_elementor_data' };
      continue;
    }

    const data = JSON.parse(result.rawElementor);
    fs.writeFileSync(path.join(EVID, `data-${t.id}.json`), JSON.stringify(data, null, 2));

    const widgets = walk(data);
    const headLike = widgets.filter(w =>
      (w.widgetType || '').includes('heading') ||
      (w.widgetType || '').includes('title') ||
      (w.widgetType || '').includes('post-title')
    );
    console.log(`  ${widgets.length} total widgets, ${headLike.length} heading-like`);
    for (const h of headLike) {
      console.log(`    [${h.id}] ${h.header_size || h.title_tag || '?'} | ${h.widgetType} | "${h.title || ''}"`);
    }
    out[t.id] = { name: t.name, slug: result.slug, title: result.title, widgetCount: widgets.length, headLike };
  }

  fs.writeFileSync(path.join(EVID, 'readdata-summary.json'), JSON.stringify(out, null, 2));
  console.log('\n=== DONE ===');
  await b.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
