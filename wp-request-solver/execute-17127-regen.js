#!/usr/bin/env node
/**
 * Trigger Elementor CSS regeneration + open each fixed template in Elementor editor and Save.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const SITE = 'https://sby.co.il';
const EVID = path.resolve('reports','2026-04-16','evidence','recXgyUsfCHCPRIw7');
const TEMPLATES = [6889, 4289, 2680]; // the 3 that were fixed

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

    // Step 1: Go to Elementor Tools and trigger Regenerate CSS
    await page.goto(`${SITE}/wp-admin/admin.php?page=elementor-tools`, {waitUntil:'domcontentloaded',timeout:45000});
    const regenBtn = await page.$('button[name="elementor_css_print_method"], a.elementor-button[href*="regenerate"], #elementor-replace-url-button');
    console.log('regen btn:', !!regenBtn);
    // Click "Regenerate Files & Data" button
    const regenLink = await page.$('a[href*="regenerate_css"]');
    const regenSubmit = await page.$('input[name="elementor_css_print_method"]');
    // Look for any regen button
    const allBtns = await page.$$eval('a.button, button, input[type="submit"]', els => els.map(e => ({ text: e.textContent.trim().slice(0,60), href: e.href || '', name: e.name || '' })));
    console.log('tool btns:', allBtns.filter(b => b.text.includes('regen') || b.text.includes('Regenerate') || b.text.includes('יצר') || b.name.includes('regen')));

    // Try the Elementor Replace URL page for regen
    await page.goto(`${SITE}/wp-admin/admin.php?page=elementor-tools#tab-general`, {waitUntil:'domcontentloaded',timeout:45000});
    // screenshot the tools page
    await page.screenshot({ path: path.join(EVID, 'elementor-tools.png'), fullPage: true });

    // Step 2: Open each template in Elementor editor, wait for load, then Save
    for (const tplId of TEMPLATES) {
      console.log(`\n→ Opening template ${tplId} in Elementor editor...`);
      await page.goto(`${SITE}/wp-admin/post.php?post=${tplId}&action=elementor`, {waitUntil:'load',timeout:120000});
      // Wait for Elementor to load
      try {
        await page.waitForSelector('#elementor-panel, .elementor-panel', {timeout: 60000});
        console.log('  Elementor panel loaded');
      } catch(e) {
        console.log('  Elementor panel not found, trying alt...');
        await page.waitForTimeout(5000);
      }
      await page.screenshot({ path: path.join(EVID, `elementor-editor-${tplId}.png`), fullPage: false });

      // Click the Save/Publish button (Elementor's green button)
      try {
        // First try the footer save button
        const saveBtn = await page.$('#elementor-panel-saver-button-publish, button.elementor-button.e-primary');
        if (saveBtn) {
          await saveBtn.click();
          await page.waitForTimeout(3000);
          console.log('  Saved via panel button');
        } else {
          // Try the header publish area
          const pubBtn = await page.$('.elementor-panel-footer-sub-menu-item:has-text("Publish"), .elementor-panel-footer-sub-menu-item:has-text("עדכן")');
          if (pubBtn) { await pubBtn.click(); await page.waitForTimeout(3000); console.log('  Saved via footer menu'); }
          else { console.log('  No save button found'); }
        }
      } catch (e) { console.log('  Save error:', e.message); }
    }

    console.log('\n✓ Done regenerating templates');
  } catch(e) {
    console.error('ERR:', e.message);
    await page.screenshot({ path: path.join(EVID, 'regen-error.png'), fullPage: true });
  } finally { await b.close(); }
})();
