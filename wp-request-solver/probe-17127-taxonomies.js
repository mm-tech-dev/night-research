const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36', viewport: {width:1400,height:900} });
  const p = await ctx.newPage();
  await p.goto('https://sby.co.il/mm-mgmt', { waitUntil: 'domcontentloaded' });
  await p.fill('#user_login', process.env.WP_USERNAME);
  await p.fill('#user_pass', process.env.WP_PASSWORD);
  await p.evaluate(()=>{const r=document.querySelector('input[name="redirect_to"]');if(r)r.value='https://sby.co.il/wp-admin/';});
  await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded'}), p.click('#wp-submit')]);
  await p.goto('https://sby.co.il/wp-admin/', { waitUntil: 'domcontentloaded' });
  console.log('logged in:', !!(await p.$('#wpadminbar')));

  // Discover custom post types from the admin menu
  const menu = await p.$$eval('#adminmenu li.menu-top a', as => as.map(a => ({ href: a.href, text: a.textContent.trim() })));
  console.log('menu items with taxonomy-ish hrefs:');
  menu.filter(m => m.href.includes('post_type=') || m.href.includes('edit.php')).slice(0, 30).forEach(m => console.log(' ', m.text, '→', m.href));

  // Try several post_types for each missing taxonomy
  const TAX = ['type-of-material', 'material'];
  const POST_TYPES = ['product', 'material', 'type-of-material', 'post', 'page', ''];
  for (const t of TAX) {
    for (const pt of POST_TYPES) {
      const url = `https://sby.co.il/wp-admin/edit-tags.php?taxonomy=${encodeURIComponent(t)}${pt ? '&post_type=' + pt : ''}`;
      const r = await p.goto(url, { waitUntil: 'domcontentloaded' });
      const rows = await p.$$eval('#the-list tr', trs => trs.length);
      const title = await p.title();
      console.log(`${t} / ${pt || '(none)'} → status=${r.status()} rows=${rows} title="${title.slice(0,60)}"`);
      if (rows > 0) break;
    }
  }
  // Also try WP REST taxonomies endpoint
  const rest = await p.evaluate(async () => {
    const r = await fetch('/wp-json/wp/v2/taxonomies', { credentials: 'include' });
    return r.ok ? await r.json() : { error: r.status };
  });
  console.log('taxonomies:', JSON.stringify(Object.keys(rest || {})));

  await b.close();
})();
