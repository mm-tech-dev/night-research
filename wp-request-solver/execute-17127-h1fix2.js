#!/usr/bin/env node
/**
 * Fix H1 via WP REST API — read _elementor_data from postmeta, fix heading tag, save back.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const EVID = path.resolve('reports','2026-04-16','evidence','recXgyUsfCHCPRIw7');
const SITE = 'https://sby.co.il';

const TEMPLATES = [
  { name: 'Singles הדפסות עומק', id: 6889 },
  { name: 'Singles חומרים, פוסטים', id: 4289 },
  { name: 'Product Archive', id: 2680 },
  { name: 'עמוד ארכיון חומרים', id: 6216 },
];

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil:'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.evaluate(()=>{const r=document.querySelector('input[name="redirect_to"]');if(r)r.value='https://sby.co.il/wp-admin/';});
  try{await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}),page.click('#wp-submit')]);}catch(_){}
  await page.goto(`${SITE}/wp-admin/`,{waitUntil:'domcontentloaded',timeout:45000});
  if(!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport:{width:1400,height:900}, userAgent:'Mozilla/5.0 Chrome/130 Safari' });
  const page = await ctx.newPage();
  const results = {};
  try {
    await login(page); console.log('✓ login');

    // Get REST nonce
    const nonce = await page.evaluate(() => {
      if (typeof wpApiSettings !== 'undefined') return wpApiSettings.nonce;
      const el = document.querySelector('#_wpnonce') || document.querySelector('meta[name="wp-nonce"]');
      return el ? el.content || el.value : null;
    });
    console.log('nonce from page:', nonce ? nonce.slice(0,6)+'...' : 'none');

    // Get nonce via admin-ajax
    const ajaxNonce = await page.evaluate(async () => {
      try {
        const r = await fetch('/wp-admin/admin-ajax.php', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'action=rest-nonce'
        });
        return r.ok ? await r.text() : null;
      } catch(e) { return null; }
    });
    console.log('ajax nonce:', ajaxNonce ? ajaxNonce.slice(0,6)+'...' : 'none');

    const restNonce = nonce || ajaxNonce;

    for (const tpl of TEMPLATES) {
      console.log(`\n→ ${tpl.name} (${tpl.id})`);
      // Read _elementor_data via REST
      const data = await page.evaluate(async ({ id, nonce }) => {
        const r = await fetch(`/wp-json/wp/v2/elementor_library/${id}?context=edit`, {
          credentials: 'include',
          headers: nonce ? { 'X-WP-Nonce': nonce } : {},
        });
        if (!r.ok) return { error: r.status, text: await r.text().catch(()=>'') };
        const json = await r.json();
        return { meta: json.meta, id: json.id, status: json.status };
      }, { id: tpl.id, nonce: restNonce });

      if (data.error) {
        console.log('  REST error:', data.error, data.text && data.text.slice(0,200));
        // Fallback: read via admin-ajax
        const fallback = await page.evaluate(async ({ id }) => {
          const r = await fetch('/wp-admin/admin-ajax.php', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `action=elementor_ajax&editor_post_id=${id}&actions=${encodeURIComponent(JSON.stringify({ get_document_config: { action: 'get_document_config' } }))}`
          });
          return r.ok ? await r.text() : null;
        }, { id: tpl.id });
        if (fallback) {
          try {
            const parsed = JSON.parse(fallback);
            console.log('  Elementor AJAX keys:', Object.keys(parsed).slice(0,5));
          } catch(e) { console.log('  Elementor AJAX parse failed'); }
        }
        results[tpl.name] = { fixed: false, reason: 'api_error' };
        continue;
      }

      console.log('  meta keys:', data.meta ? Object.keys(data.meta).filter(k => k.includes('elementor')).slice(0,5) : 'none');

      if (data.meta && data.meta._elementor_data) {
        let elemData;
        try { elemData = typeof data.meta._elementor_data === 'string' ? JSON.parse(data.meta._elementor_data) : data.meta._elementor_data; } catch(e) {
          console.log('  parse error'); results[tpl.name] = { fixed: false, reason: 'parse' }; continue;
        }

        let fixCount = 0;
        function walk(els) {
          for (const el of els) {
            if (el.widgetType && (el.widgetType === 'heading' || el.widgetType === 'theme-post-title' || el.widgetType.includes('title'))) {
              const s = el.settings || {};
              const tag = s.header_size || s.title_tag;
              if (tag === 'h2' || (!tag && fixCount === 0)) {
                console.log(`  FOUND: ${el.widgetType} tag=${tag || 'default'} → changing to h1`);
                if (s.header_size !== undefined || !s.title_tag) s.header_size = 'h1';
                if (s.title_tag !== undefined) s.title_tag = 'h1';
                fixCount++;
              }
            }
            if (el.elements) walk(el.elements);
          }
        }
        walk(elemData);

        if (fixCount === 0) {
          console.log('  No H2 title widget found');
          // Show what headings exist
          function showHeadings(els, depth=0) {
            for (const el of els) {
              if (el.widgetType && el.widgetType.includes('head')) {
                const s = el.settings || {};
                console.log(`  ${'  '.repeat(depth)}${el.widgetType} tag=${s.header_size||s.title_tag||'?'} text=${(s.title||'').slice(0,40)}`);
              }
              if (el.elements) showHeadings(el.elements, depth+1);
            }
          }
          showHeadings(elemData);
          results[tpl.name] = { fixed: false, reason: 'no_h2' };
        } else {
          // Save back via REST
          const saveResult = await page.evaluate(async ({ id, nonce, newData }) => {
            const r = await fetch(`/wp-json/wp/v2/elementor_library/${id}`, {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
              body: JSON.stringify({ meta: { _elementor_data: JSON.stringify(newData) } })
            });
            return { ok: r.ok, status: r.status };
          }, { id: tpl.id, nonce: restNonce, newData: elemData });
          console.log('  Saved:', saveResult);
          results[tpl.name] = { fixed: saveResult.ok, fixCount };
        }
      } else {
        console.log('  No _elementor_data in meta');
        results[tpl.name] = { fixed: false, reason: 'no_meta' };
      }
    }

    fs.writeFileSync(path.join(EVID, 'h1-fix-results.json'), JSON.stringify(results, null, 2));
    console.log('\n✓ Results:', JSON.stringify(results, null, 2));
  } catch(e) {
    console.error('ERR:', e.message);
    await page.screenshot({ path: path.join(EVID, 'h1fix2-error.png'), fullPage: true });
  } finally { await b.close(); }
})();
