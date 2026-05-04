#!/usr/bin/env node
/**
 * Fix H1 hierarchy: Open Elementor Theme Builder templates,
 * find heading widgets set to H2 (the page title), change to H1.
 * Works by editing _elementor_data post meta directly via WP admin.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync('.env','utf-8').split(/\r?\n/).forEach(l=>{const i=l.indexOf('=');if(i>0&&!process.env[l.slice(0,i).trim()])process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();});
const EVID = path.resolve('reports','2026-04-16','evidence','recXgyUsfCHCPRIw7');

const SITE = 'https://sby.co.il';

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil:'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.evaluate(()=>{const r=document.querySelector('input[name="redirect_to"]');if(r)r.value='https://sby.co.il/wp-admin/';});
  try{await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}),page.click('#wp-submit')]);}catch(_){}
  await page.goto(`${SITE}/wp-admin/`,{waitUntil:'domcontentloaded',timeout:45000});
  if(!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

async function getTemplateIds(page) {
  await page.goto(`${SITE}/wp-admin/edit.php?post_type=elementor_library&tabs_group=theme`, {waitUntil:'domcontentloaded',timeout:45000});
  return page.$$eval('#the-list tr', trs => trs.map(tr => {
    const title = tr.querySelector('.row-title');
    const edit = tr.querySelector('.row-actions .edit a') || tr.querySelector('a[href*="post="]');
    const m = edit ? edit.href.match(/post=(\d+)/) : null;
    return { title: title ? title.textContent.trim() : null, id: m ? +m[1] : null };
  }).filter(r => r.title && r.id));
}

async function fixH1InTemplate(page, templateId, templateName) {
  // Go to post.php to read _elementor_data
  await page.goto(`${SITE}/wp-admin/post.php?post=${templateId}&action=edit`, {waitUntil:'domcontentloaded',timeout:60000});
  // Get _elementor_data from the hidden textarea
  const rawData = await page.evaluate(() => {
    const el = document.querySelector('#_elementor_data');
    if (!el) return null;
    return el.value;
  });
  if (!rawData) { console.log(`  ${templateName}: no _elementor_data found, skipping`); return { fixed: false, reason: 'no_data' }; }
  let data;
  try { data = JSON.parse(rawData); } catch(e) { console.log(`  ${templateName}: invalid JSON`); return { fixed: false, reason: 'json_error' }; }

  let fixCount = 0;
  function walkAndFix(elements) {
    for (const el of elements) {
      if (el.widgetType === 'heading' || el.widgetType === 'theme-post-title' || el.widgetType === 'post-title') {
        const s = el.settings || {};
        if (s.header_size === 'h2' || s.title_tag === 'h2' || (!s.header_size && !s.title_tag)) {
          // Check if this looks like the main title (first heading, or has dynamic tag for post title)
          const isDynamic = JSON.stringify(s).includes('__dynamic__') || JSON.stringify(s).includes('post-title') || el.widgetType.includes('title');
          const isFirst = fixCount === 0;
          if (isDynamic || isFirst) {
            if (s.header_size) s.header_size = 'h1';
            if (s.title_tag) s.title_tag = 'h1';
            if (!s.header_size && !s.title_tag) s.header_size = 'h1';
            fixCount++;
          }
        }
      }
      if (el.elements && el.elements.length) walkAndFix(el.elements);
    }
  }
  walkAndFix(data);

  if (fixCount === 0) { console.log(`  ${templateName}: no H2 title found to fix`); return { fixed: false, reason: 'no_h2_title' }; }

  // Write back
  const newData = JSON.stringify(data);
  await page.evaluate((val) => {
    const el = document.querySelector('#_elementor_data');
    if (el) { el.value = val; el.dispatchEvent(new Event('input', {bubbles:true})); }
  }, newData);

  // Save
  const publish = await page.$('#publish');
  if (publish) {
    await Promise.all([
      page.waitForNavigation({waitUntil:'domcontentloaded',timeout:45000}).catch(()=>{}),
      publish.click()
    ]);
  }

  // Verify
  await page.goto(`${SITE}/wp-admin/post.php?post=${templateId}&action=edit`, {waitUntil:'domcontentloaded',timeout:45000});
  const verify = await page.evaluate(() => {
    const el = document.querySelector('#_elementor_data');
    return el ? el.value : '';
  });
  const hasH1 = verify.includes('"h1"');
  console.log(`  ${templateName}: fixed ${fixCount} headings, verified: ${hasH1}`);
  return { fixed: true, fixCount, verified: hasH1 };
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport:{width:1400,height:900}, userAgent:'Mozilla/5.0 Chrome/130 Safari' });
  const page = await ctx.newPage();
  try {
    await login(page); console.log('✓ login');
    const templates = await getTemplateIds(page);
    console.log('Templates found:', templates.length);

    // Target templates for H1 fix:
    // - "Singles הדפסות עומק" (type-of-material single)
    // - "Singles חומרים, פוסטים" (material/post single)
    // - "Product Archive" (product_cat archives)
    // - "עמוד ארכיון חומרים" (material archive)
    const targets = ['Singles הדפסות עומק', 'Singles חומרים, פוסטים', 'Product Archive', 'עמוד ארכיון חומרים'];
    const results = {};
    for (const tpl of templates) {
      if (targets.some(t => tpl.title.includes(t) || t.includes(tpl.title))) {
        console.log(`\n→ Fixing ${tpl.title} (ID ${tpl.id})`);
        // Screenshot before
        await page.goto(`${SITE}/wp-admin/post.php?post=${tpl.id}&action=edit`, {waitUntil:'domcontentloaded',timeout:60000});
        await page.screenshot({ path: path.join(EVID, `h1-before-${tpl.id}.png`), fullPage: false });
        results[tpl.title] = await fixH1InTemplate(page, tpl.id, tpl.title);
        // Screenshot after
        await page.screenshot({ path: path.join(EVID, `h1-after-${tpl.id}.png`), fullPage: false });
      }
    }

    fs.writeFileSync(path.join(EVID, 'h1-fix-results.json'), JSON.stringify(results, null, 2));
    console.log('\nDone. Results:', JSON.stringify(results, null, 2));
  } catch (e) {
    console.error('ERR:', e.message);
    await page.screenshot({ path: path.join(EVID, 'h1fix-error.png'), fullPage: true });
  } finally { await b.close(); }
})();
