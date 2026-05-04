#!/usr/bin/env node
/**
 * Apply H1 fix on aryos.net for request #17589.
 *
 * 1. BEFORE screenshots: 1 product page + contact page (live, public)
 * 2. Open Elementor editor for template 4567 → set widget 0b27d16 (woocommerce-product-title) header_size = h1 → save
 * 3. Open Elementor editor for page 35 → set widget ab2553c (heading "בואו נדבר") header_size = h1 → save
 * 4. AFTER screenshots: same pages
 * 5. Verify <h1> via curl on a sample of 5 product pages + contact page
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const SITE = 'https://aryos.net';
const EVID = path.resolve(__dirname, 'reports', '2026-05-03', 'evidence', 'recVhky3jWVIuwxq2');
fs.mkdirSync(EVID, { recursive: true });

// 5 product pages to verify (mix of real slugs + auto slugs from the request list)
const SAMPLE_PRODUCTS = [
  'כובע-בייסבול',
  'כובע-פלקספיט',
  'חולצת-פולו-פרימיום',
  'דגלים',
  'פוטר-סווטשירט',
];
const CONTACT_SLUG = 'צור-קשר';

const TARGETS = [
  { id: 4567, name: 'Single Product template', widgetId: '0b27d16', desiredTag: 'h1' },
  { id: 35,   name: 'Contact page',            widgetId: 'ab2553c', desiredTag: 'h1' },
];

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

async function openEditor(page, postId) {
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=elementor`, { waitUntil: 'domcontentloaded', timeout: 240000 });
  await page.waitForFunction(() => !!(window.elementor && elementor.documents && elementor.documents.getCurrent && elementor.documents.getCurrent()), { timeout: 180000 });
  await page.waitForFunction(() => {
    const doc = elementor.documents.getCurrent();
    return doc && doc.container && doc.container.children && doc.container.children.length > 0;
  }, { timeout: 240000 });
}

async function setWidgetHeaderSizeAndSave(page, widgetId, desiredTag) {
  return await page.evaluate(async ({ widgetId, desiredTag }) => {
    const doc = elementor.documents.getCurrent();
    let target = null;
    function walk(container) {
      if (target) return;
      if (!container || !container.children) return;
      for (let i = 0; i < container.children.length; i++) {
        const child = container.children.at(i);
        if (target) return;
        if (child && child.id === widgetId) { target = child; return; }
        if (child && child.model && child.model.get('id') === widgetId) { target = child; return; }
        walk(child);
      }
    }
    walk(doc.container);
    if (!target) return { action: 'none', reason: 'widget_not_found', widgetId };

    const settings = target.model.get('settings');
    const prev = settings.get('header_size') || '(unset)';
    if (prev === desiredTag) return { action: 'noop', prev, widgetId, widgetType: target.model.get('widgetType') };

    $e.run('document/elements/settings', { container: target, settings: { header_size: desiredTag } });
    const after = settings.get('header_size');

    try { await $e.run('document/save/publish'); }
    catch (e) { return { action: 'set_but_save_failed', prev, after, error: e.message || String(e) }; }
    return { action: 'updated', prev, after, widgetType: target.model.get('widgetType') };
  }, { widgetId, desiredTag });
}

async function snap(page, url, file) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(EVID, file), fullPage: true });
  console.log(`  📸 ${file}`);
}

async function curlH1(url) {
  const { execSync } = require('child_process');
  try {
    const html = execSync(`curl -s "${url}"`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
    const matches = (html.match(/<h([1-6])\b[^>]*>([^<]{1,100})/g) || []).slice(0, 8);
    return { url, h1Count: (html.match(/<h1\b/g) || []).length, headings: matches };
  } catch (e) { return { url, error: e.message }; }
}

(async () => {
  const log = { steps: [], when: new Date().toISOString() };
  function step(name, data) { log.steps.push({ name, ...data, t: new Date().toISOString() }); fs.writeFileSync(path.join(EVID, 'apply-log.json'), JSON.stringify(log, null, 2)); }

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);

  console.log('→ login');
  await login(page);
  console.log('✓ login');

  // -------- BEFORE --------
  console.log('\n→ BEFORE screenshots (logged-out viewport so admin bar doesn\'t cover headings)');
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'he-IL' });
  const anonPage = await ctx2.newPage();
  await snap(anonPage, `${SITE}/product/${encodeURIComponent('כובע-בייסבול')}/`, 'before-product.png');
  await snap(anonPage, `${SITE}/${encodeURIComponent(CONTACT_SLUG)}/`, 'before-contact.png');

  // -------- VERIFY BEFORE via curl --------
  console.log('\n→ BEFORE: curl-based heading audit');
  const beforeH1 = {};
  for (const slug of SAMPLE_PRODUCTS) {
    beforeH1[slug] = await curlH1(`${SITE}/product/${encodeURIComponent(slug)}/`);
    console.log(`  product/${slug}: h1Count=${beforeH1[slug].h1Count}`);
  }
  beforeH1[CONTACT_SLUG] = await curlH1(`${SITE}/${encodeURIComponent(CONTACT_SLUG)}/`);
  console.log(`  ${CONTACT_SLUG}: h1Count=${beforeH1[CONTACT_SLUG].h1Count}`);
  step('before_audit', { beforeH1 });

  // -------- APPLY --------
  for (const t of TARGETS) {
    console.log(`\n→ APPLY: ${t.name} (id=${t.id}) widget ${t.widgetId} -> ${t.desiredTag}`);
    try {
      await openEditor(page, t.id);
      const r = await setWidgetHeaderSizeAndSave(page, t.widgetId, t.desiredTag);
      console.log(`  result:`, JSON.stringify(r));
      step('apply', { id: t.id, ...r });
      await page.waitForTimeout(2000);
    } catch (e) {
      console.log(`  ERR: ${e.message}`);
      step('apply', { id: t.id, error: e.message });
    }
  }

  // Allow caches to settle
  await page.waitForTimeout(3000);

  // -------- AFTER --------
  console.log('\n→ AFTER screenshots');
  await snap(anonPage, `${SITE}/product/${encodeURIComponent('כובע-בייסבול')}/?_ts=${Date.now()}`, 'after-product.png');
  await snap(anonPage, `${SITE}/${encodeURIComponent(CONTACT_SLUG)}/?_ts=${Date.now()}`, 'after-contact.png');

  // -------- VERIFY AFTER via curl --------
  console.log('\n→ AFTER: curl-based heading audit');
  const afterH1 = {};
  for (const slug of SAMPLE_PRODUCTS) {
    afterH1[slug] = await curlH1(`${SITE}/product/${encodeURIComponent(slug)}/?_ts=${Date.now()}`);
    console.log(`  product/${slug}: h1Count=${afterH1[slug].h1Count} | first headings: ${(afterH1[slug].headings || []).slice(0, 2).join(' || ')}`);
  }
  afterH1[CONTACT_SLUG] = await curlH1(`${SITE}/${encodeURIComponent(CONTACT_SLUG)}/?_ts=${Date.now()}`);
  console.log(`  ${CONTACT_SLUG}: h1Count=${afterH1[CONTACT_SLUG].h1Count} | first: ${(afterH1[CONTACT_SLUG].headings || []).slice(0, 2).join(' || ')}`);
  step('after_audit', { afterH1 });

  await browser.close();
  console.log('\n=== DONE ===');
  console.log(`Evidence: ${EVID}`);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
