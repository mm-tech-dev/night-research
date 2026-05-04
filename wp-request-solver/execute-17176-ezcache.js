#!/usr/bin/env node
/** Explore ezCache admin page and trigger purge button. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});

const SITE = 'https://sby.co.il';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', 'recIsWT8X1O7sp2nz');

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);

  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([ page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit') ]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  console.log('✓ logged in');

  await page.goto(`${SITE}/wp-admin/admin.php?page=ezcache`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(EVID, 'ezcache-page.png'), fullPage: true });

  // Extract all buttons/inputs
  const buttons = await page.$$eval('button, input[type="submit"], a.button, a[href*="purge"], a[href*="clear"]', els => els.map(e => ({
    tag: e.tagName, type: e.type || '', text: (e.textContent || e.value || '').trim().slice(0, 60), id: e.id, name: e.name, href: e.getAttribute('href')
  })).filter(b => b.text));
  console.log('ezcache buttons:');
  buttons.forEach(b => console.log(`  <${b.tag.toLowerCase()} id=${b.id} name=${b.name}> "${b.text}" href=${b.href}`));
  fs.writeFileSync(path.join(EVID, 'ezcache-buttons.json'), JSON.stringify(buttons, null, 2));

  // Click all purge/clear-looking buttons
  for (const b of buttons) {
    if (!/purge|clear|ניקוי|ניקית|נקה/i.test(b.text)) continue;
    try {
      console.log(`→ clicking "${b.text}"`);
      if (b.href && b.href !== '#') {
        await page.goto(b.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else {
        const sel = b.id ? `#${b.id}` : (b.name ? `[name="${b.name}"]` : null);
        if (sel) {
          await Promise.all([ page.waitForResponse(() => true).catch(() => null), page.click(sel) ]);
        }
      }
      await page.waitForTimeout(2500);
      console.log('  ✓');
    } catch (e) {
      console.log('  err:', e.message);
    }
  }

  await page.screenshot({ path: path.join(EVID, 'ezcache-after.png'), fullPage: true });

  // Also try Elementor regenerate
  await page.goto(`${SITE}/wp-admin/admin.php?page=elementor-tools`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const regenBtn = await page.$('input[name="elementor_regenerate_css"], button[name="elementor_regenerate_css"]');
  if (regenBtn) {
    await page.evaluate(() => {
      const btn = document.querySelector('input[name="elementor_regenerate_css"], button[name="elementor_regenerate_css"]');
      if (btn) btn.click();
    });
    console.log('→ Elementor regen clicked');
    await page.waitForTimeout(5000);
  }
  await page.screenshot({ path: path.join(EVID, 'elementor-tools-after.png'), fullPage: true });

  await b.close();
  console.log('done');
})();
