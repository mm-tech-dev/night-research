const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const OUT = path.resolve('reports/2026-04-16/evidence/recXgyUsfCHCPRIw7');
(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: {width:1400,height:1200}, userAgent:'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36' });
  const p = await ctx.newPage();
  await p.goto('https://sby.co.il/mm-mgmt', { waitUntil:'domcontentloaded' });
  await p.fill('#user_login', process.env.WP_USERNAME);
  await p.fill('#user_pass', process.env.WP_PASSWORD);
  await p.evaluate(()=>{const r=document.querySelector('input[name="redirect_to"]');if(r)r.value='https://sby.co.il/wp-admin/';});
  try{await Promise.all([p.waitForNavigation({waitUntil:'domcontentloaded',timeout:30000}),p.click('#wp-submit')]);}catch(_){}
  await p.goto('https://sby.co.il/wp-admin/', { waitUntil:'domcontentloaded' });
  console.log('login ok', !!(await p.$('#wpadminbar')));

  // Test: CPT post edit
  await p.goto('https://sby.co.il/wp-admin/post.php?post=4376&action=edit', { waitUntil:'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2000);
  const info1 = await p.evaluate(() => {
    const sel = s => document.querySelector(s);
    return {
      editor: !!document.querySelector('body.block-editor-page') ? 'gutenberg' : (document.querySelector('body.classic-editor-toolbar,#wp-content-editor-container')?'classic':'unknown'),
      yoast_title_input: !!sel('#yoast_wpseo_title') ? 'input' : (!!sel('input[name="yoast_wpseo_title"]') ? 'by-name' : null),
      yoast_desc_input: !!sel('#yoast_wpseo_metadesc') ? 'input' : (!!sel('textarea[name="yoast_wpseo_metadesc"]') ? 'by-name' : null),
      yoast_sidebar: !!sel('#wpseo_meta') || !!sel('[data-yoast-collapsible-component]'),
      publish_btn: !!sel('#publish'),
      // All input names containing "yoast"
      yoast_inputs: [...document.querySelectorAll('input,textarea')].filter(el => /yoast/i.test(el.name||el.id||'')).map(el => ({ tag: el.tagName, name: el.name, id: el.id, type: el.type, value: (el.value||'').slice(0,80) })).slice(0, 20),
    };
  });
  console.log('POST(cpt) info:', JSON.stringify(info1, null, 2));
  await p.screenshot({ path: path.join(OUT, 'probe-yoast-cpt.png'), fullPage: false });

  // Test: term edit (product_cat)
  await p.goto('https://sby.co.il/wp-admin/term.php?taxonomy=product_cat&tag_ID=35&post_type=product', { waitUntil:'domcontentloaded', timeout: 60000 });
  await p.waitForTimeout(2000);
  const info2 = await p.evaluate(() => {
    const inputs = [...document.querySelectorAll('input,textarea')].filter(el => /yoast|wpseo/i.test(el.name||el.id||'')).map(el => ({ tag: el.tagName, name: el.name, id: el.id, type: el.type, value: (el.value||'').slice(0,80) })).slice(0, 20);
    return {
      save_btn: !!document.querySelector('.button-primary[type="submit"]'),
      yoast_metabox: !!document.querySelector('#wpseo_meta') || !!document.querySelector('[data-yoast-collapsible-component]'),
      inputs,
    };
  });
  console.log('TERM info:', JSON.stringify(info2, null, 2));
  await p.screenshot({ path: path.join(OUT, 'probe-yoast-term.png'), fullPage: true });
  await b.close();
})();
