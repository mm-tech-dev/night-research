#!/usr/bin/env node
/**
 * Discovery + audit for request #17589 (aryos.net H1 fix)
 *
 * Goal: locate the Elementor "Single Product" template that renders the
 * product title as <h3>, and locate the contact page heading widget rendered as <h2>.
 *
 * Outputs: reports/2026-05-03/evidence/recVhky3jWVIuwxq2/audit.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const SITE = 'https://aryos.net';
const EVID = path.resolve(__dirname, 'reports', '2026-05-03', 'evidence', 'recVhky3jWVIuwxq2');
fs.mkdirSync(EVID, { recursive: true });

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

function collectHeadings(elements, out = [], pathStr = '') {
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const step = `${pathStr}[${i}]${el.widgetType || el.elType || '?'}`;
    if (
      el.widgetType === 'heading' ||
      el.widgetType === 'theme-post-title' ||
      el.widgetType === 'post-title' ||
      el.widgetType === 'woocommerce-product-title' ||
      el.widgetType === 'wc-archive-products-title'
    ) {
      const s = el.settings || {};
      out.push({
        path: step,
        widgetType: el.widgetType,
        id: el.id,
        tag: s.header_size || s.title_tag || s.title_html_tag || '(default)',
        text: (s.title || '').toString().slice(0, 80),
      });
    }
    if (el.elements && el.elements.length) collectHeadings(el.elements, out, step + '>');
  }
  return out;
}

async function readElementorData(page, postId) {
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=edit`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  return await page.evaluate(() => {
    const el = document.querySelector('#_elementor_data') || document.querySelector('[name="_elementor_data"]');
    return el ? el.value : null;
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);

  console.log('→ logging in to', SITE);
  await login(page);
  console.log('✓ login OK');

  // STEP 1: list Elementor library templates (theme builder includes Single Product)
  console.log('\n→ Listing elementor_library templates...');
  await page.goto(`${SITE}/wp-admin/edit.php?post_type=elementor_library&tabs_group=theme`, { waitUntil: 'domcontentloaded' });
  // Get all visible template rows with their type and ID
  const tplRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr[id^="post-"]'));
    return rows.map(r => {
      const id = (r.id.match(/post-(\d+)/) || [])[1];
      const titleA = r.querySelector('.row-title');
      const title = titleA ? titleA.textContent.trim() : '';
      const editLink = titleA ? titleA.getAttribute('href') : '';
      const typeCell = r.querySelector('td.elementor_library_type, td.column-elementor_library_type, td.taxonomy-elementor_library_type, td:nth-of-type(3)');
      const typeText = typeCell ? typeCell.textContent.trim() : '';
      return { id, title, editLink, typeText };
    }).filter(x => x.id);
  });
  console.log(`  Found ${tplRows.length} library rows`);
  fs.writeFileSync(path.join(EVID, 'tpl-rows-theme.json'), JSON.stringify(tplRows, null, 2));

  // Also try the saved-templates URL with different query for theme-builder
  await page.goto(`${SITE}/wp-admin/admin.php?page=elementor-app#/site-editor`, { waitUntil: 'domcontentloaded' }).catch(()=>{});

  // STEP 2: scan each template's _elementor_data for Product Title widget rendered as h3
  console.log('\n→ Auditing templates for product-title H3 widgets...');
  const templateAudit = [];
  for (const t of tplRows) {
    try {
      const raw = await readElementorData(page, t.id);
      if (!raw || raw === '[]') continue;
      let data; try { data = JSON.parse(raw); } catch(e) { continue; }
      const heads = collectHeadings(data);
      const productTitleH3 = heads.filter(h =>
        (h.widgetType === 'woocommerce-product-title' || h.widgetType === 'theme-post-title' || h.widgetType === 'heading') &&
        h.tag === 'h3'
      );
      if (heads.length) {
        templateAudit.push({ ...t, totalHeadings: heads.length, headings: heads, productTitleH3Count: productTitleH3.length });
        console.log(`  [${t.id}] ${t.title} (${t.typeText}): ${heads.length} headings, productTitleH3=${productTitleH3.length}`);
      }
    } catch (e) {
      console.log(`  [${t.id}] ${t.title}: ERR ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(EVID, 'template-audit.json'), JSON.stringify(templateAudit, null, 2));

  // STEP 3: find contact page (slug 'צור-קשר')
  console.log('\n→ Locating contact page...');
  const contactSlug = encodeURIComponent('צור-קשר');
  const contactInfo = await page.evaluate(async (slug) => {
    const r = await fetch(`/wp-json/wp/v2/pages?slug=${slug}&_fields=id,slug,title,link`, { credentials: 'same-origin' });
    if (!r.ok) return { error: r.status };
    return await r.json();
  }, contactSlug);
  console.log('  contact lookup:', JSON.stringify(contactInfo));
  fs.writeFileSync(path.join(EVID, 'contact-page-info.json'), JSON.stringify(contactInfo, null, 2));

  let contactAudit = null;
  if (Array.isArray(contactInfo) && contactInfo[0]) {
    const cId = contactInfo[0].id;
    try {
      const raw = await readElementorData(page, cId);
      if (raw && raw !== '[]') {
        const data = JSON.parse(raw);
        const heads = collectHeadings(data);
        contactAudit = { id: cId, headings: heads };
        console.log(`  contact page ${cId}: ${heads.length} headings`);
        heads.forEach(h => console.log(`    - ${h.tag} | ${h.widgetType} | "${h.text}"`));
      }
    } catch (e) {
      console.log('  contact audit ERR:', e.message);
    }
  }
  fs.writeFileSync(path.join(EVID, 'contact-audit.json'), JSON.stringify(contactAudit, null, 2));

  // STEP 4: also scan one product's _elementor_data so we can see what widget renders the title
  console.log('\n→ Sampling one product for context...');
  const productInfo = await page.evaluate(async () => {
    const r = await fetch(`/wp-json/wp/v2/product?slug=${encodeURIComponent('כובע-בייסבול')}&_fields=id,slug,title,link`, { credentials: 'same-origin' });
    if (!r.ok) return { error: r.status };
    return await r.json();
  });
  console.log('  product lookup:', JSON.stringify(productInfo));
  let productAudit = null;
  if (Array.isArray(productInfo) && productInfo[0]) {
    const pId = productInfo[0].id;
    try {
      const raw = await readElementorData(page, pId);
      if (raw && raw !== '[]') {
        const data = JSON.parse(raw);
        const heads = collectHeadings(data);
        productAudit = { id: pId, headings: heads };
        console.log(`  product ${pId}: ${heads.length} headings (product page itself; the title likely comes from template)`);
        heads.forEach(h => console.log(`    - ${h.tag} | ${h.widgetType} | "${h.text}"`));
      } else {
        productAudit = { id: pId, note: 'no_elementor_data — product is rendered solely by the Single Product template' };
        console.log(`  product ${pId}: no _elementor_data (uses template)`);
      }
    } catch (e) { console.log('  product audit ERR:', e.message); }
  }
  fs.writeFileSync(path.join(EVID, 'product-sample-audit.json'), JSON.stringify(productAudit, null, 2));

  // FINAL summary
  const summary = {
    site: SITE,
    when: new Date().toISOString(),
    contactPageId: contactAudit && contactAudit.id,
    contactH2Headings: contactAudit ? contactAudit.headings.filter(h => h.tag === 'h2' || h.tag === 'h3') : [],
    sampledProductId: productAudit && productAudit.id,
    sampledProductHasOwnHeadings: productAudit && productAudit.headings && productAudit.headings.length > 0,
    candidateTemplates: templateAudit.filter(t => t.productTitleH3Count > 0).map(t => ({
      id: t.id, title: t.title, type: t.typeText, productTitleH3: t.headings.filter(h => h.tag === 'h3')
    })),
  };
  fs.writeFileSync(path.join(EVID, 'audit-summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  await browser.close();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
