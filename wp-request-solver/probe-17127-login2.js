const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const OUT = path.resolve('reports/2026-04-16/evidence/recXgyUsfCHCPRIw7');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    viewport: { width: 1400, height: 900 }
  });
  const p = await ctx.newPage();
  p.on('response', r => { if (r.url().includes('sby.co.il') && r.status() >= 300) console.log('resp', r.status(), r.url()); });
  await p.goto('https://sby.co.il/mm-mgmt', { waitUntil: 'domcontentloaded' });
  console.log('login page:', p.url());
  // set redirect_to
  const action = await p.$eval('form#loginform', f => f.action);
  console.log('form action:', action);
  await p.fill('#user_login', process.env.WP_USERNAME);
  await p.fill('#user_pass', process.env.WP_PASSWORD);
  // Ensure redirect_to is set to wp-admin
  await p.evaluate(() => {
    const r = document.querySelector('input[name="redirect_to"]');
    if (r) r.value = 'https://sby.co.il/wp-admin/';
  });
  await Promise.all([ p.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }), p.click('#wp-submit') ]);
  console.log('after submit:', p.url());
  await p.screenshot({ path: path.join(OUT, 'after-login.png'), fullPage: true });
  const adminBar = await p.$('#wpadminbar');
  console.log('adminBar:', !!adminBar);
  const title = await p.title();
  console.log('title:', title);
  if (!adminBar) {
    // try navigating to admin
    await p.goto('https://sby.co.il/wp-admin/', { waitUntil: 'domcontentloaded' });
    console.log('after wp-admin:', p.url(), await p.title());
    console.log('adminBar?', !!(await p.$('#wpadminbar')));
  }
  await b.close();
})();
