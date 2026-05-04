#!/usr/bin/env node
/**
 * H1 audit v2 — Fetch _elementor_data via Elementor REST API
 * (/wp-json/elementor/v1/documents/{id}) using the admin session cookie.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://sby.co.il';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', 'recIsWT8X1O7sp2nz');
const META = JSON.parse(fs.readFileSync(path.join(EVID, 'apply-log.json'), 'utf8'));

function collectHeadings(elements, out = [], pathStr = '') {
  if (!elements) return out;
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
        text: (s.title || '').toString().slice(0, 80),
        has_dynamic: JSON.stringify(s).includes('__dynamic__'),
      });
    } else if (/loop|posts|archive|product-grid/.test(el.widgetType || '')) {
      const s = el.settings || {};
      out.push({
        path: step,
        widgetType: el.widgetType,
        id: el.id,
        tag: '(LOOP)',
        template_id: s.template_id || s.loop_template_id || null,
        title_tag: s.title_tag || s.title_size || s.title_html_tag || null,
      });
    }
    if (el.elements && el.elements.length) collectHeadings(el.elements, out, step + '>');
  }
  return out;
}

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

async function fetchElementorDoc(page, postId) {
  // Extract nonce from admin
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=edit`, { waitUntil: 'domcontentloaded' });
  const nonce = await page.evaluate(() => {
    // Elementor exposes restNonce in multiple places
    return (window.wpApiSettings && window.wpApiSettings.nonce)
        || (window.elementorCommon && elementorCommon.config && elementorCommon.config.ajax && elementorCommon.config.ajax.nonce)
        || (document.querySelector('meta[name="_wpnonce"]') && document.querySelector('meta[name="_wpnonce"]').content)
        || null;
  });
  // Use fetch in page context so cookies + nonce are applied
  const data = await page.evaluate(async ({ id, nonce }) => {
    const url = `/wp-json/elementor/v1/documents/${id}`;
    const r = await fetch(url, { credentials: 'include', headers: nonce ? { 'X-WP-Nonce': nonce } : {} });
    const t = await r.text();
    return { status: r.status, body: t.slice(0, 800000) };
  }, { id: postId, nonce });
  return data;
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await login(page);
  console.log('✓ login');

  const audit = [];
  for (const item of META) {
    console.log(`→ ${item.name_he} (id=${item.id})`);
    try {
      const resp = await fetchElementorDoc(page, item.id);
      if (resp.status !== 200) {
        console.log(`  HTTP ${resp.status}`);
        audit.push({ id: item.id, name: item.name_he, error: `http_${resp.status}`, body: resp.body.slice(0, 300) });
        continue;
      }
      const doc = JSON.parse(resp.body);
      const elements = (doc.elements && doc.elements) || (doc.content && doc.content);
      const headings = collectHeadings(elements || []);
      audit.push({ id: item.id, name: item.name_he, template_type: doc.type || null, headings });
      const tags = {};
      for (const h of headings) tags[h.tag] = (tags[h.tag] || 0) + 1;
      console.log(`  headings: ${headings.length} | tags: ${JSON.stringify(tags)}`);
      headings.slice(0, 10).forEach(h => console.log(`    ${h.tag} | ${h.widgetType} | ${h.text || h.template_id || ''}`));
    } catch (e) {
      console.log(`  ERR: ${e.message}`);
      audit.push({ id: item.id, name: item.name_he, error: e.message });
    }
  }
  fs.writeFileSync(path.join(EVID, 'h1-audit-v2.json'), JSON.stringify(audit, null, 2));
  await b.close();
})();
