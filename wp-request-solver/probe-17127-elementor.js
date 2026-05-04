const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const EVID = path.resolve('reports','2026-04-16','evidence','recXgyUsfCHCPRIw7');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport:{width:1400,height:900}, userAgent:'Mozilla/5.0 Chrome/130 Safari' });
  const p = await ctx.newPage();
  // login
  await p.goto('https://sby.co.il/mm-mgmt', {waitUntil:'domcontentloaded'});
  await p.fill('#user_login', process.env.WP_USERNAME);
  await p.fill('#user_pass', process.env.WP_PASSWORD);
  await p.evaluate(()=>{const r=document.querySelector('input[name="redirect_to"]');if(r)r.value='https://sby.co.il/wp-admin/';});
  try{await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}),p.click('#wp-submit')]);}catch(_){}
  await p.goto('https://sby.co.il/wp-admin/',{waitUntil:'domcontentloaded'});

  // Check a CPT post
  await p.goto('https://sby.co.il/wp-admin/post.php?post=4376&action=edit', { waitUntil:'domcontentloaded', timeout:45000 });
  const info = await p.evaluate(() => {
    const editLink = document.querySelector('a[href*="action=elementor"]');
    const isElementor = !!document.querySelector('#elementor-switch-mode, .elementor-switch-mode');
    const builtWith = document.querySelector('#elementor-switch-mode-button, .elementor-editor-active');
    return {
      hasElementorButton: !!editLink, editLink: editLink ? editLink.href : null,
      isElementor, builtWith: builtWith ? builtWith.textContent.trim() : null,
    };
  });
  console.log('Post 4376 Elementor:', JSON.stringify(info));

  // Now check another CPT
  await p.goto('https://sby.co.il/wp-admin/post.php?post=4382&action=edit', { waitUntil:'domcontentloaded', timeout:45000 });
  const info2 = await p.evaluate(() => {
    const editLink = document.querySelector('a[href*="action=elementor"]');
    return { hasElementorButton: !!editLink, editLink: editLink ? editLink.href : null };
  });
  console.log('Post 4382 Elementor:', JSON.stringify(info2));

  // Check Elementor theme builder templates
  await p.goto('https://sby.co.il/wp-admin/edit.php?post_type=elementor_library&tabs_group=theme', {waitUntil:'domcontentloaded', timeout:45000});
  const templates = await p.$$eval('#the-list tr', trs => trs.map(tr => {
    const title = tr.querySelector('.row-title');
    const type = tr.querySelector('td.type, .column-type');
    return { title: title ? title.textContent.trim() : null, type: type ? type.textContent.trim() : null };
  }).filter(r => r.title));
  console.log('Theme Builder templates:', JSON.stringify(templates.slice(0,20)));

  await p.screenshot({ path: path.join(EVID, 'probe-templates.png'), fullPage: false });
  await b.close();
})();
