#!/usr/bin/env node
/**
 * Request #17176 — Apply Yoast title + meta description to 12 regular pages.
 * Strategy:
 *   1. login to /mm-mgmt
 *   2. discover page IDs by visiting /wp-admin/edit.php?post_type=page and matching slugs
 *   3. for each page, open /wp-admin/post.php?post=ID&action=edit and fill Yoast fields
 *   4. screenshot before+after, save apply-log.json after each item (crash-safe)
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');

fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const SITE = 'https://sby.co.il';
const REC = 'recIsWT8X1O7sp2nz';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', REC);
fs.mkdirSync(EVID, { recursive: true });

const META = JSON.parse(fs.readFileSync(path.join(EVID, 'meta-plan.json'), 'utf8'));
const DRY = process.argv.includes('--dry-run');
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only')+1] : null;
const SKIP_DISCOVERY = process.argv.includes('--skip-discovery');

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#user_login', { timeout: 15000 });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.evaluate(() => { const r = document.querySelector('input[name="redirect_to"]'); if (r) r.value = 'https://sby.co.il/wp-admin/'; });
  try { await Promise.all([ page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit') ]); } catch(_) {}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

async function discoverPages(page) {
  // Crawl all pages from admin, match by slug
  const out = {};
  let p = 1;
  while (true) {
    const url = `${SITE}/wp-admin/edit.php?post_type=page&paged=${p}&posts_per_page=200`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const rows = await page.$$eval('#the-list tr', trs =>
      trs.map(tr => {
        const title = tr.querySelector('.row-title');
        const editLink = tr.querySelector('.row-actions .edit a') || tr.querySelector('.row-title');
        const viewLink = tr.querySelector('.row-actions .view a');
        const href = editLink ? editLink.href : null;
        const m = href && href.match(/post=(\d+)/);
        const view = viewLink ? viewLink.href : null;
        return {
          id: m ? +m[1] : null,
          title: title ? title.textContent.trim() : null,
          editHref: href,
          viewUrl: view,
        };
      }).filter(r => r.id)
    );
    if (!rows.length) break;
    rows.forEach(r => { out[r.id] = r; });
    const hasNext = await page.$('a.next-page:not(.disabled)');
    if (!hasNext) break;
    p++; if (p > 15) break;
  }
  return Object.values(out);
}

function findPageByPlan(pages, plan) {
  // Match strategies: by viewUrl slug path, by title
  const target = plan.url_path;  // e.g. "/awagami/"
  // Normalize: extract slug from viewUrl
  const byUrl = pages.find(p => {
    if (!p.viewUrl) return false;
    try {
      const u = new URL(p.viewUrl);
      const slug = decodeURIComponent(u.pathname).replace(/^\/+|\/+$/g, '');
      const want = decodeURIComponent(target).replace(/^\/+|\/+$/g, '');
      return slug === want || (want === '' && slug === '');
    } catch { return false; }
  });
  if (byUrl) return byUrl;
  // Fallback: by title
  if (plan.name_he) {
    const byTitle = pages.find(p => p.title && p.title.trim() === plan.name_he.trim());
    if (byTitle) return byTitle;
  }
  return null;
}

async function fillYoastInput(page, selector, value) {
  const el = await page.$(selector); if (!el) return false;
  await page.evaluate(({sel, val}) => {
    const e = document.querySelector(sel); if (!e) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    setter.set.call(e, val);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel: selector, val: value });
  return true;
}

async function applyPageMeta(page, item) {
  const url = `${SITE}/wp-admin/post.php?post=${item.id}&action=edit`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Dismiss Gutenberg/Elementor welcome modal if any
  try { await page.click('button.components-modal__header button[aria-label*="close"i]', { timeout: 1000 }); } catch(_){}
  try { await page.click('.elementor-modal__close-button, .elementor-exit-to-wp-editor', { timeout: 1000 }); } catch(_){}
  // Give Yoast metabox time to render
  await page.waitForTimeout(1500);

  // Screenshot BEFORE
  const beforePath = path.join(EVID, `before-${item.id}.png`);
  try { await page.screenshot({ path: beforePath, fullPage: false }); } catch(_){}

  const before = await page.evaluate(() => {
    const t = document.querySelector('#yoast_wpseo_title');
    const d = document.querySelector('#yoast_wpseo_metadesc');
    return { title: t ? t.value : null, desc: d ? d.value : null, hasFields: !!(t && d) };
  });

  if (!before.hasFields) {
    // Try scrolling to the Yoast metabox
    await page.evaluate(() => { const m = document.querySelector('#wpseo_meta'); if (m) m.scrollIntoView(); });
    await page.waitForTimeout(500);
  }

  if (!DRY) {
    await fillYoastInput(page, '#yoast_wpseo_title', item.title);
    await fillYoastInput(page, '#yoast_wpseo_metadesc', item.desc);
  }

  if (DRY) return { ok: true, dryRun: true, before };

  // Save via Classic Publish button (preferred for Elementor-edited pages)
  const updateBtn = await page.$('#publish') || await page.$('input[name="save"][value*="עדכן"]') || await page.$('input[name="save"][value*="Update"]');
  if (updateBtn) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {}),
      updateBtn.click(),
    ]);
  } else {
    // Gutenberg fallback
    try {
      await page.click('button.editor-post-publish-button, button.editor-post-save-draft', { timeout: 3000 });
      await page.waitForTimeout(4000);
    } catch(_){}
  }

  // Re-read values from the current page (may have redirected to post edit again)
  const after = await page.evaluate(() => ({
    title: (document.querySelector('#yoast_wpseo_title') || {}).value,
    desc:  (document.querySelector('#yoast_wpseo_metadesc') || {}).value,
  }));

  // Screenshot AFTER
  const afterPath = path.join(EVID, `after-${item.id}.png`);
  try { await page.screenshot({ path: afterPath, fullPage: false }); } catch(_){}

  return { ok: after.title === item.title && after.desc === item.desc, before, after };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  const results = [];

  try {
    console.log('→ login');
    await login(page);
    console.log('  ✓ logged in');

    // Step 1: discover page IDs (unless cached)
    let pages;
    const cachePath = path.join(EVID, 'pages.json');
    if (SKIP_DISCOVERY && fs.existsSync(cachePath)) {
      pages = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      console.log(`→ using cached pages.json (${pages.length} pages)`);
    } else {
      console.log('→ discover pages');
      pages = await discoverPages(page);
      fs.writeFileSync(cachePath, JSON.stringify(pages, null, 2));
      console.log(`  ✓ ${pages.length} pages discovered`);
    }

    // Step 2: resolve plan → page IDs
    const resolved = META.map(m => {
      const p = findPageByPlan(pages, m);
      return { ...m, id: p ? p.id : null, matched_title: p ? p.title : null, matched_url: p ? p.viewUrl : null };
    });
    fs.writeFileSync(path.join(EVID, 'resolved-plan.json'), JSON.stringify(resolved, null, 2));

    const matched = resolved.filter(r => r.id);
    const missed = resolved.filter(r => !r.id);
    console.log(`  matched: ${matched.length}/${resolved.length}`);
    if (missed.length) {
      console.log('  missed:', missed.map(m => m.name_he).join(', '));
    }

    // Step 3: apply meta for each matched page
    const items = ONLY ? matched.filter(x => String(x.id) === ONLY || x.slug === ONLY) : matched;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const tag = `[${i+1}/${items.length}] id=${it.id} ${it.name_he}`;
      process.stdout.write(tag + ' ... ');
      try {
        const r = await applyPageMeta(page, it);
        console.log(r.ok ? '✓' : '✗', 'before:', JSON.stringify({t: (r.before && r.before.title || '').slice(0,30), d: (r.before && r.before.desc || '').slice(0,30)}));
        results.push({ ...it, result: r });
      } catch (e) {
        console.log('ERR', e.message);
        results.push({ ...it, result: { ok: false, error: e.message } });
      }
      fs.writeFileSync(path.join(EVID, 'apply-log.json'), JSON.stringify(results, null, 2));
    }

    const ok = results.filter(r => r.result && r.result.ok).length;
    console.log(`\nDONE: ${ok}/${results.length} updated`);
  } catch (e) {
    console.error('FATAL:', e.message);
    try { await page.screenshot({ path: path.join(EVID, 'fatal-error.png'), fullPage: true }); } catch(_){}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
