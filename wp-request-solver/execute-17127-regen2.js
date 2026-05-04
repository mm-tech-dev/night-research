#!/usr/bin/env node
/**
 * Regenerate Elementor CSS + clear ezCache to reflect H1 changes live.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const SITE = 'https://sby.co.il';
const EVID = path.resolve('reports','2026-04-16','evidence','recXgyUsfCHCPRIw7');

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, {waitUntil:'domcontentloaded'});
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.evaluate(()=>{const r=document.querySelector('input[name="redirect_to"]');if(r)r.value='https://sby.co.il/wp-admin/';});
  try{await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}),page.click('#wp-submit')]);}catch(_){}
  await page.goto(`${SITE}/wp-admin/`,{waitUntil:'domcontentloaded',timeout:45000});
  if(!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport:{width:1400,height:1000}, userAgent:'Mozilla/5.0 Chrome/130 Safari' });
  const page = await ctx.newPage();
  try {
    await login(page); console.log('✓ login');

    // Step 1: Elementor → Tools → Regenerate CSS
    console.log('→ Regenerating Elementor CSS...');
    await page.goto(`${SITE}/wp-admin/admin.php?page=elementor-tools`, {waitUntil:'domcontentloaded',timeout:45000});
    // Click "נקה קבצים ונתונים" button
    const regenBtn = await page.$('button:has-text("נקה קבצים ונתונים"), a:has-text("נקה קבצים ונתונים")');
    if (regenBtn) {
      await Promise.all([
        page.waitForNavigation({waitUntil:'domcontentloaded',timeout:60000}).catch(()=>{}),
        regenBtn.click()
      ]);
      console.log('  ✓ Elementor CSS regenerated');
    } else {
      // Try via AJAX
      const result = await page.evaluate(async () => {
        const r = await fetch('/wp-admin/admin-ajax.php', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'action=elementor_clear_cache'
        });
        return { ok: r.ok, status: r.status, text: (await r.text()).slice(0,200) };
      });
      console.log('  AJAX clear cache:', result);
    }

    // Step 2: Clear ezCache
    console.log('→ Clearing ezCache...');
    // Try going to ezCache settings / purge
    await page.goto(`${SITE}/wp-admin/admin.php?page=ezcache-settings`, {waitUntil:'domcontentloaded',timeout:30000}).catch(()=>{});
    const purgeAll = await page.$('a:has-text("Purge"), button:has-text("Purge"), a:has-text("נקה"), a[href*="purge"]');
    if (purgeAll) {
      await purgeAll.click();
      await page.waitForTimeout(2000);
      console.log('  ✓ ezCache purged via settings page');
    } else {
      // Try admin bar purge
      await page.goto(`${SITE}/wp-admin/`, {waitUntil:'domcontentloaded',timeout:30000});
      const adminBarPurge = await page.$('#wp-admin-bar-ezcache a, #wp-admin-bar-ezcache-purge a, a[href*="ezcache"][href*="purge"]');
      if (adminBarPurge) {
        const href = await adminBarPurge.getAttribute('href');
        console.log('  purge link:', href);
        if (href) {
          await page.goto(href.startsWith('http') ? href : `${SITE}${href}`, {waitUntil:'domcontentloaded',timeout:30000});
          console.log('  ✓ ezCache purged via admin bar');
        }
      } else {
        // fallback - look for any cache purge link
        const allCacheLinks = await page.$$eval('#wpadminbar a', as => as.filter(a => /cache|purge|clear/i.test(a.textContent + a.href)).map(a => ({ text: a.textContent.trim(), href: a.href })));
        console.log('  cache links in admin bar:', allCacheLinks.slice(0,5));
        if (allCacheLinks.length > 0) {
          await page.goto(allCacheLinks[0].href, {waitUntil:'domcontentloaded',timeout:30000});
          console.log('  ✓ Cache purged via:', allCacheLinks[0].text);
        }
      }
    }

    // Step 3: Wait and verify
    console.log('→ Waiting 5s and verifying...');
    await page.waitForTimeout(5000);
    await page.goto(`${SITE}/type-of-material/%d7%94%d7%93%d7%a4%d7%a1%d7%94-%d7%a2%d7%9c-%d7%96%d7%9b%d7%95%d7%9b%d7%99%d7%aa/?nc=${Date.now()}`, {waitUntil:'domcontentloaded'});
    const h1s = await page.$$eval('h1', els => els.map(e => e.textContent.trim().slice(0,80)));
    const h2s = await page.$$eval('h2', els => els.map(e => e.textContent.trim().slice(0,80)));
    console.log('  H1s:', h1s);
    console.log('  First H2s:', h2s.slice(0,3));
    await page.screenshot({ path: path.join(EVID, 'h1-verify-final.png'), fullPage: false });

    console.log('\n✓ Done');
  } catch(e) {
    console.error('ERR:', e.message);
    await page.screenshot({ path: path.join(EVID, 'regen2-error.png'), fullPage: true });
  } finally { await b.close(); }
})();
