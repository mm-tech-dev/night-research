#!/usr/bin/env node
/**
 * Phase A.3 — Apply Yoast title + meta description to all 33 items.
 * Strategy: for each item, fetch edit page; locate Yoast fields (hidden inputs
 * _yoast_wpseo_title, _yoast_wpseo_metadesc); POST via AJAX if present, else
 * use the edit form save flow.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});

const SITE = 'https://sby.co.il';
const REC = 'recXgyUsfCHCPRIw7';
const EVID = path.resolve('reports', '2026-04-16', 'evidence', REC);
const meta = JSON.parse(fs.readFileSync(path.join(EVID, 'meta-plan.json'), 'utf8'));
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = process.argv.includes('--only') ? parseInt(process.argv[process.argv.indexOf('--only')+1], 10) : null;

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

async function fillYoastInput(page, selector, value) {
  // Yoast hidden inputs + React-driven visible inputs. Try the hidden input first,
  // then the visible input, then fall back to dispatching input events.
  const el = await page.$(selector);
  if (!el) return false;
  await page.evaluate(({sel, val}) => {
    const e = document.querySelector(sel);
    if (!e) return;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    setter.set.call(e, val);
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  }, { sel: selector, val: value });
  return true;
}

async function applyPost(page, item) {
  // CPT post edit page
  const url = `${SITE}/wp-admin/post.php?post=${item.id}&action=edit`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  // Dismiss any Elementor/Gutenberg modal
  try { await page.click('button.components-modal__header button[aria-label*="close"i]', { timeout: 1500 }); } catch(_){}
  // Capture BEFORE current values
  const before = await page.evaluate(() => {
    const t = document.querySelector('#yoast_wpseo_title');
    const d = document.querySelector('#yoast_wpseo_metadesc');
    return { title: t ? t.value : null, desc: d ? d.value : null, hasFields: !!(t && d) };
  });
  if (!before.hasFields) {
    // Maybe Yoast fields only render after metabox toggle / Gutenberg sidebar.
    // Try scrolling to Yoast metabox area.
    await page.evaluate(() => { const m = document.querySelector('#wpseo_meta'); if (m) m.scrollIntoView(); });
    await page.waitForTimeout(500);
  }
  // Set values
  await fillYoastInput(page, '#yoast_wpseo_title', item.title);
  await fillYoastInput(page, '#yoast_wpseo_metadesc', item.desc);
  if (DRY_RUN) return { ok: true, dryRun: true, before };
  // Save via Publish/Update button (classic) or Gutenberg top bar
  const publish = await page.$('#publish') || await page.$('input[name="save"][value*="עדכן"]') || null;
  if (publish) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{}),
      publish.click(),
    ]);
  } else {
    // Gutenberg save
    await page.click('button.editor-post-publish-button, button.editor-post-save-draft, .edit-post-header__settings button.is-primary', { timeout: 5000 }).catch(()=>{});
    await page.waitForTimeout(3000);
  }
  // Re-read to confirm
  const after = await page.evaluate(() => ({
    title: (document.querySelector('#yoast_wpseo_title')||{}).value,
    desc:  (document.querySelector('#yoast_wpseo_metadesc')||{}).value,
  }));
  return { ok: after.title === item.title && after.desc === item.desc, before, after };
}

async function applyTerm(page, item) {
  const url = `${SITE}/wp-admin/term.php?taxonomy=${item.taxonomy}&tag_ID=${item.id}&post_type=product`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  const before = await page.evaluate(() => {
    const t = document.querySelector('#hidden_wpseo_title') || document.querySelector('#yoast_wpseo_title');
    const d = document.querySelector('#hidden_wpseo_desc')  || document.querySelector('#yoast_wpseo_metadesc');
    return { title: t ? t.value : null, desc: d ? d.value : null, hasFields: !!(t && d) };
  });
  await fillYoastInput(page, '#hidden_wpseo_title', item.title).catch(()=>{});
  await fillYoastInput(page, '#yoast_wpseo_title',  item.title).catch(()=>{});
  await fillYoastInput(page, '#hidden_wpseo_desc',  item.desc ).catch(()=>{});
  await fillYoastInput(page, '#yoast_wpseo_metadesc', item.desc).catch(()=>{});
  if (DRY_RUN) return { ok: true, dryRun: true, before };
  const save = await page.$('input.button-primary[type="submit"]') || await page.$('#submit') || null;
  if (save) {
    await Promise.all([ page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }).catch(()=>{}), save.click() ]);
  }
  // re-load to check
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const after = await page.evaluate(() => ({
    title: (document.querySelector('#hidden_wpseo_title')||document.querySelector('#yoast_wpseo_title')||{}).value,
    desc:  (document.querySelector('#hidden_wpseo_desc') ||document.querySelector('#yoast_wpseo_metadesc')||{}).value,
  }));
  return { ok: after.title === item.title && after.desc === item.desc, before, after };
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36' });
  const page = await ctx.newPage();
  const results = [];
  try {
    await login(page); console.log('✓ login');
    const items = ONLY ? meta.filter(x => x.id === ONLY) : meta;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const tag = `[${i+1}/${items.length}] ${it.kind} ${it.id} ${it.name}`;
      process.stdout.write(tag + ' ... ');
      try {
        const r = it.kind === 'term' ? await applyTerm(page, it) : await applyPost(page, it);
        console.log(r.ok ? '✓' : '✗', 'after:', JSON.stringify((r.after && {t: r.after.title && r.after.title.slice(0,40), d: r.after.desc && r.after.desc.slice(0,40)}) || {}));
        results.push({ ...it, result: r });
      } catch (e) {
        console.log('ERR', e.message);
        results.push({ ...it, result: { ok: false, error: e.message } });
      }
      fs.writeFileSync(path.join(EVID, 'apply-log.json'), JSON.stringify(results, null, 2));
    }
  } finally {
    await b.close();
  }
  const ok = results.filter(r => r.result && r.result.ok).length;
  console.log(`\nDONE: ${ok}/${results.length} updated`);
})();
