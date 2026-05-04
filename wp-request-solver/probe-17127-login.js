const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const OUT = path.resolve('reports/2026-04-16/evidence/recXgyUsfCHCPRIw7');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  const p = await ctx.newPage();
  const urls = [
    'https://sby.co.il/mm-mgmt',
    'https://sby.co.il/mm-mgmt/',
    'https://sby.co.il/wp-admin/',
    'https://sby.co.il/wp-login.php',
  ];
  for (const u of urls) {
    try {
      const r = await p.goto(u, { waitUntil: 'domcontentloaded', timeout: 15000 });
      console.log(u, '→', r && r.status(), 'final:', p.url());
      const title = await p.title();
      const hasLogin = await p.$('#user_login');
      console.log('  title:', title, 'hasLoginForm:', !!hasLogin);
    } catch (e) { console.log(u, 'ERR:', e.message); }
  }
  await p.goto('https://sby.co.il/mm-mgmt/', { waitUntil: 'domcontentloaded' });
  await p.screenshot({ path: path.join(OUT, 'probe-mm-mgmt.png'), fullPage: true });
  // Look for any login form on last page
  const inputs = await p.$$eval('input', els => els.map(e => ({ name: e.name, type: e.type, id: e.id })));
  console.log('inputs:', JSON.stringify(inputs));
  await b.close();
})();
