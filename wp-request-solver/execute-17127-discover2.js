#!/usr/bin/env node
/**
 * Phase A.2 — full discovery including CPT posts
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});

const SITE = 'https://sby.co.il';
const REC = 'recXgyUsfCHCPRIw7';
const EVID = path.resolve('reports', '2026-04-16', 'evidence', REC);
fs.mkdirSync(EVID, { recursive: true });

// Items we're targeting
const TAX_TARGETS = [
  { kind: 'term', taxonomy: 'product_cat',       post_type: 'product' },
  { kind: 'term', taxonomy: 'material-category', post_type: 'product' },
];
const CPT_TARGETS = [
  { kind: 'cpt', post_type: 'type-of-material' },
  { kind: 'cpt', post_type: 'material' },
];

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#user_login', { timeout: 15000 });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.evaluate(() => { const r = document.querySelector('input[name="redirect_to"]'); if (r) r.value = 'https://sby.co.il/wp-admin/'; });
  try { await Promise.all([ page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit') ]); } catch (_) {}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

async function listTerms(page, tax) {
  const url = `${SITE}/wp-admin/edit-tags.php?taxonomy=${encodeURIComponent(tax.taxonomy)}&post_type=${tax.post_type}&number=200`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page.$$eval('#the-list tr', trs => trs.map(tr => {
    const a = tr.querySelector('.row-title, td.name a, a.row-title, a[href*="tag_ID="]');
    const edit = tr.querySelector('.row-actions .edit a') || tr.querySelector('a[href*="tag_ID="]');
    return { name: a ? a.textContent.trim() : null, href: edit ? edit.href : null };
  }).filter(r => r.name && r.href).map(r => {
    const m = r.href.match(/tag_ID=(\d+)/);
    return { id: m ? +m[1] : null, name: r.name, editHref: r.href };
  }));
}

async function listCptPosts(page, cpt) {
  const url = `${SITE}/wp-admin/edit.php?post_type=${encodeURIComponent(cpt.post_type)}&posts_per_page=-1`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page.$$eval('#the-list tr', trs => trs.map(tr => {
    const a = tr.querySelector('.row-title') || tr.querySelector('a.row-title') || tr.querySelector('td.title a');
    const edit = tr.querySelector('.row-actions .edit a') || (a && a.href ? a : null);
    return { name: a ? a.textContent.trim() : null, href: edit ? edit.href : null };
  }).filter(r => r.name && r.href).map(r => {
    const m = r.href.match(/post=(\d+)/);
    return { id: m ? +m[1] : null, name: r.name, editHref: r.href };
  }));
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36' });
  const p = await ctx.newPage();
  try {
    await login(p); console.log('✓ login');
    const all = [];
    for (const t of TAX_TARGETS) {
      const terms = await listTerms(p, t);
      terms.forEach(x => all.push({ ...x, kind: 'term', taxonomy: t.taxonomy, post_type: t.post_type }));
      console.log(`  ${t.taxonomy}: ${terms.length} terms`);
    }
    for (const c of CPT_TARGETS) {
      const posts = await listCptPosts(p, c);
      posts.forEach(x => all.push({ ...x, kind: 'cpt', post_type: c.post_type }));
      console.log(`  ${c.post_type}: ${posts.length} posts`);
    }
    fs.writeFileSync(path.join(EVID, 'all-items.json'), JSON.stringify(all, null, 2));
    console.log(`✓ total: ${all.length}`);
  } catch (e) {
    console.error('ERR:', e.message);
    await p.screenshot({ path: path.join(EVID, 'discover2-error.png'), fullPage: true });
  } finally { await b.close(); }
})();
