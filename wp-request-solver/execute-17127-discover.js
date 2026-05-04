#!/usr/bin/env node
/**
 * Phase A.1 — Discover all taxonomy terms on sby.co.il
 * Login → enumerate product_cat, type-of-material, material, material-category
 * Output: reports/2026-04-16/evidence/recXgyUsfCHCPRIw7/terms.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '.env');
fs.readFileSync(envPath, 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('=');
  if (i > 0 && !process.env[l.slice(0, i).trim()]) {
    process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
});

const SITE = 'https://sby.co.il';
const ADMIN = `${SITE}/mm-mgmt`;
const USER = process.env.WP_USERNAME;
const PASS = process.env.WP_PASSWORD;
const REC = 'recXgyUsfCHCPRIw7';
const EVID = path.resolve(__dirname, 'reports', '2026-04-16', 'evidence', REC);
fs.mkdirSync(EVID, { recursive: true });

const TAXONOMIES = [
  { slug: 'product_cat',       post_type: 'product' },
  { slug: 'type-of-material',  post_type: 'product' },
  { slug: 'material',          post_type: 'product' },
  { slug: 'material-category', post_type: 'product' },
];

async function paginate(page, tax) {
  const terms = [];
  let p = 1;
  while (true) {
    const url = `${SITE}/wp-admin/edit-tags.php?taxonomy=${encodeURIComponent(tax.slug)}&post_type=${tax.post_type}&paged=${p}&number=200`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const rows = await page.$$eval('#the-list tr.level-0, #the-list tr', trs =>
      trs.map(tr => {
        const a = tr.querySelector('.row-title, a.row-title, td.name a, a');
        const editLink = tr.querySelector('.row-actions .edit a') || tr.querySelector('a[href*="tag_ID="]');
        return {
          name: a ? a.textContent.trim() : null,
          editHref: editLink ? editLink.href : null,
          raw: tr.className,
        };
      }).filter(r => r.name && r.editHref)
    );
    if (!rows.length) break;
    terms.push(...rows.map(r => {
      const m = r.editHref.match(/tag_ID=(\d+)/);
      return { taxonomy: tax.slug, id: m ? +m[1] : null, name: r.name, editHref: r.editHref, level: (r.raw.match(/level-(\d+)/) || [, 0])[1] };
    }));
    // check for next page
    const nextDisabled = await page.$('a.next-page.disabled, span.next-page.disabled');
    const hasNext = await page.$('a.next-page:not(.disabled)');
    if (!hasNext || nextDisabled) break;
    p++;
    if (p > 20) break;
  }
  // dedupe by id
  const seen = new Map();
  terms.forEach(t => { if (t.id) seen.set(`${t.taxonomy}-${t.id}`, t); });
  return [...seen.values()];
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  });
  const page = await ctx.newPage();
  try {
    console.log('→ Login');
    await page.goto(ADMIN, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#user_login', { timeout: 15000 });
    await page.fill('#user_login', USER);
    await page.fill('#user_pass', PASS);
    await page.evaluate(() => { const r = document.querySelector('input[name="redirect_to"]'); if (r) r.value = 'https://sby.co.il/wp-admin/'; });
    await Promise.all([ page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit') ]);
    await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
    const loggedIn = !!(await page.$('#wpadminbar'));
    console.log('  loggedIn:', loggedIn, 'url:', page.url());
    if (!loggedIn) { await page.screenshot({ path: path.join(EVID, 'login-failed.png'), fullPage: true }); throw new Error('Login failed'); }
    await page.screenshot({ path: path.join(EVID, '01-login-dashboard.png'), fullPage: false });

    const all = [];
    for (const tax of TAXONOMIES) {
      console.log(`→ Enumerate ${tax.slug}`);
      try {
        const terms = await paginate(page, tax);
        console.log(`  found ${terms.length}`);
        all.push(...terms);
      } catch (e) {
        console.log(`  FAILED ${tax.slug}:`, e.message);
      }
    }

    fs.writeFileSync(path.join(EVID, 'terms.json'), JSON.stringify(all, null, 2));
    console.log(`✓ Total terms: ${all.length}`);
    console.log(`✓ Saved: ${path.join(EVID, 'terms.json')}`);
  } catch (e) {
    console.error('ERR:', e.message);
    await page.screenshot({ path: path.join(EVID, 'discover-error.png'), fullPage: true });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
