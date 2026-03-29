const { chromium } = require('playwright');
const path = require('path');

const SITE = 'https://greentouch-plants.dev2.mrvsn.com';
const DIR = path.join(__dirname, 'reports', '2026-02-18', 'evidence', 'reccOB6feBd9JkOFi');
const WP_USER = 'mv-dev';
const WP_PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';

// Base64 encode for WP REST API auth
const AUTH = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

async function wcApi(method, endpoint, body = null) {
  const url = `${SITE}/wp-json/wc/v3/${endpoint}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  const data = await resp.json();
  if (!resp.ok) {
    console.error(`API Error ${resp.status}:`, JSON.stringify(data).substring(0, 200));
  }
  return data;
}

async function wpApi(method, endpoint, body = null) {
  const url = `${SITE}/wp-json/wp/v2/${endpoint}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) opts.body = JSON.stringify(body);

  const resp = await fetch(url, opts);
  return await resp.json();
}

(async () => {
  // ===== TEST API ACCESS =====
  console.log('Testing WC REST API access...');
  const test = await wcApi('GET', 'products?per_page=1');
  if (test.code) {
    console.log('WC REST API error:', test.message);
    console.log('Trying alternative auth methods...');

    // Try with consumer key approach or application password
    // Actually let's check what auth is needed
    const testResp = await fetch(`${SITE}/wp-json/wc/v3/products?per_page=1`, {
      headers: { 'Authorization': `Basic ${AUTH}` }
    });
    console.log('Response status:', testResp.status);
    const testData = await testResp.text();
    console.log('Response:', testData.substring(0, 300));

    if (testResp.status === 401) {
      console.log('\nBasic auth failed. Will use Playwright with AJAX approach instead...');
      await usePlaywrightAjax();
      return;
    }
  } else {
    console.log(`API access OK, found ${test.length} product(s)`);
    await useRestApi();
  }
})();

async function useRestApi() {
  // ===== PRODUCT 1: דרצנה (ID:2920) → Variable =====
  console.log('\n=== Converting דרצנה (ID:2920) → variable ===');

  // Update product to variable with attribute and variations
  const dracena = await wcApi('PUT', 'products/2920', {
    name: 'דרצנה',
    type: 'variable',
    attributes: [{
      name: 'גודל',
      visible: true,
      variation: true,
      options: ['ענקית ללא כד', 'גדולה ללא כד']
    }]
  });
  console.log(`  Product updated: type=${dracena.type}, name="${dracena.name}"`);

  // Create variations
  const dVar1 = await wcApi('POST', 'products/2920/variations', {
    regular_price: '1440',
    attributes: [{ name: 'גודל', option: 'ענקית ללא כד' }]
  });
  console.log(`  Variation 1: "ענקית ללא כד" → ₪1440 (ID:${dVar1.id})`);

  const dVar2 = await wcApi('POST', 'products/2920/variations', {
    regular_price: '850',
    attributes: [{ name: 'גודל', option: 'גדולה ללא כד' }]
  });
  console.log(`  Variation 2: "גדולה ללא כד" → ₪850 (ID:${dVar2.id})`);

  // Draft דרצנה גדולה (ID:2918)
  await wcApi('PUT', 'products/2918', { status: 'draft' });
  console.log('  דרצנה גדולה → Draft ✓');

  // ===== PRODUCT 2: ציפור גן עדן (ID:2889) → Variable =====
  console.log('\n=== Converting ציפור גן עדן (ID:2889) → variable ===');

  const bop = await wcApi('PUT', 'products/2889', {
    name: 'ציפור גן עדן',
    type: 'variable',
    attributes: [{
      name: 'גודל',
      visible: true,
      variation: true,
      options: ['גדולה ללא כד', 'קטנה ללא כד']
    }]
  });
  console.log(`  Product updated: type=${bop.type}, name="${bop.name}"`);

  const bVar1 = await wcApi('POST', 'products/2889/variations', {
    regular_price: '560',
    attributes: [{ name: 'גודל', option: 'גדולה ללא כד' }]
  });
  console.log(`  Variation 1: "גדולה ללא כד" → ₪560 (ID:${bVar1.id})`);

  const bVar2 = await wcApi('POST', 'products/2889/variations', {
    regular_price: '400',
    attributes: [{ name: 'גודל', option: 'קטנה ללא כד' }]
  });
  console.log(`  Variation 2: "קטנה ללא כד" → ₪400 (ID:${bVar2.id})`);

  // Draft ציפור גן עדן קטנה (ID:2615)
  await wcApi('PUT', 'products/2615', { status: 'draft' });
  console.log('  ציפור גן עדן קטנה → Draft ✓');

  console.log('\n=== Verification ===');
  // Verify products
  const verify1 = await wcApi('GET', 'products/2920');
  console.log(`  דרצנה: type=${verify1.type}, name="${verify1.name}", price="${verify1.price}"`);
  const v1vars = await wcApi('GET', 'products/2920/variations');
  v1vars.forEach(v => console.log(`    Var ID:${v.id} — "${v.attributes.map(a=>a.option).join(', ')}" → ₪${v.regular_price}`));

  const verify2 = await wcApi('GET', 'products/2889');
  console.log(`  ציפור גן עדן: type=${verify2.type}, name="${verify2.name}", price="${verify2.price}"`);
  const v2vars = await wcApi('GET', 'products/2889/variations');
  v2vars.forEach(v => console.log(`    Var ID:${v.id} — "${v.attributes.map(a=>a.option).join(', ')}" → ₪${v.regular_price}`));

  await takeScreenshots();
}

async function usePlaywrightAjax() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.accept());

  // Login
  await page.goto(`${SITE}/wp-login.php`);
  await page.fill('#user_login', WP_USER);
  await page.fill('#user_pass', WP_PASS);
  await page.click('#wp-submit');
  await page.waitForSelector('#wpbody', { timeout: 15000 });
  console.log('Logged in ✓');

  // Use WP AJAX from within the authenticated session
  // This way we can call WooCommerce internal AJAX endpoints

  // ===== דרצנה (ID:2920) =====
  console.log('\n=== Converting דרצנה (ID:2920) via AJAX ===');

  // First, update product to variable via WP REST (using cookie auth from browser session)
  const dResult = await page.evaluate(async () => {
    // Use the WP REST API with nonce-based auth (already logged in)
    const nonce = wpApiSettings?.nonce || '';

    // Update product type and name
    const updateResp = await fetch('/wp-json/wc/v3/products/2920', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': nonce
      },
      body: JSON.stringify({
        name: 'דרצנה',
        type: 'variable',
        attributes: [{
          name: 'גודל',
          visible: true,
          variation: true,
          options: ['ענקית ללא כד', 'גדולה ללא כד']
        }]
      })
    });
    const updateData = await updateResp.json();

    if (!updateResp.ok) return { error: 'update failed', status: updateResp.status, data: updateData };

    // Create variation 1
    const var1Resp = await fetch('/wp-json/wc/v3/products/2920/variations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': nonce
      },
      body: JSON.stringify({
        regular_price: '1440',
        attributes: [{ name: 'גודל', option: 'ענקית ללא כד' }]
      })
    });
    const var1Data = await var1Resp.json();

    // Create variation 2
    const var2Resp = await fetch('/wp-json/wc/v3/products/2920/variations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': nonce
      },
      body: JSON.stringify({
        regular_price: '850',
        attributes: [{ name: 'גודל', option: 'גדולה ללא כד' }]
      })
    });
    const var2Data = await var2Resp.json();

    return {
      product: { type: updateData.type, name: updateData.name },
      var1: { id: var1Data.id, price: var1Data.regular_price },
      var2: { id: var2Data.id, price: var2Data.regular_price }
    };
  });

  console.log('  Result:', JSON.stringify(dResult));

  if (dResult.error) {
    console.log('  WC REST API not available via nonce. Trying direct WP admin AJAX...');

    // Alternative: use wp-admin/admin-ajax.php
    // Or just manipulate the product via the admin UI with proper AJAX calls
    // Let's try the admin-ajax approach

    await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

    // Get the WP nonce from the page
    const pageNonce = await page.evaluate(() => {
      return document.querySelector('#woocommerce-product-data-nonce')?.value || '';
    });
    console.log('  Page nonce:', pageNonce ? 'found' : 'not found');

    // Set title
    await page.$eval('#title', el => el.value = '');
    await page.fill('#title', 'דרצנה');

    // Set type to variable
    await page.selectOption('#product-type', 'variable');
    await page.waitForTimeout(1000);

    // Save first to register the variable type
    await page.click('#publish');
    await page.waitForTimeout(4000);
    console.log('  Saved as variable product');

    // Reload
    await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

    // Go to attributes tab
    await page.click('.attribute_tab a');
    await page.waitForTimeout(2000);

    // Use Select2 to add the global attribute "גודל"
    const s2 = await page.$('.wc-attribute-search + .select2-container');
    if (s2) {
      await s2.click();
      await page.waitForTimeout(500);
      await page.keyboard.type('גודל');
      await page.waitForTimeout(1500);
      const opt = await page.$('.select2-results__option:not(.select2-results__message)');
      if (opt) {
        await opt.click();
        await page.waitForTimeout(3000);
        console.log('  Attribute "גודל" added');
      }
    }

    // Now find and interact with the term selection
    // The terms might be in a Select2 multi-select within the attribute row
    await page.waitForTimeout(1000);

    // Screenshot to see current state
    await page.screenshot({ path: path.join(DIR, 'debug-attr-row.png'), fullPage: true });

    // Try to interact with Select2 for terms
    const termS2 = await page.$$('.woocommerce_attribute:last-child .select2-container--default');
    console.log(`  Found ${termS2.length} Select2 containers in attribute row`);

    if (termS2.length > 0) {
      // Click the Select2 for terms (usually the first one in the attribute row)
      for (const container of termS2) {
        const isMulti = await container.$('.select2-selection--multiple');
        if (isMulti) {
          // This is the terms multi-select
          await isMulti.click();
          await page.waitForTimeout(500);

          // Type and select "ענקית ללא כד"
          await page.keyboard.type('ענקית');
          await page.waitForTimeout(1000);
          const opt1 = await page.$('.select2-results__option:not(.select2-results__message)');
          if (opt1) {
            await opt1.click();
            console.log('  Selected "ענקית ללא כד"');
          }

          await page.waitForTimeout(500);
          // Select "גדולה ללא כד"
          await isMulti.click();
          await page.waitForTimeout(500);
          await page.keyboard.type('גדולה');
          await page.waitForTimeout(1000);
          const opt2 = await page.$('.select2-results__option:not(.select2-results__message)');
          if (opt2) {
            await opt2.click();
            console.log('  Selected "גדולה ללא כד"');
          }

          break;
        }
      }
    }

    // Check "Used for variations"
    await page.evaluate(() => {
      const attr = document.querySelector('.woocommerce_attribute:last-child');
      if (!attr) return;
      const vis = attr.querySelector('input[name*="attribute_visibility"]');
      const vary = attr.querySelector('input[name*="attribute_variation"]');
      if (vis && !vis.checked) vis.click();
      if (vary && !vary.checked) vary.click();
    });

    // Save attributes
    await page.click('button.save_attributes');
    await page.waitForTimeout(3000);
    console.log('  Attributes saved');

    // Screenshot after saving attributes
    await page.screenshot({ path: path.join(DIR, 'debug-after-save-attrs.png'), fullPage: true });

    // Now go to Variations tab and add variations manually
    await page.click('.variations_tab a');
    await page.waitForTimeout(2000);

    // In newer WooCommerce, need to "Add manually" or use specific approach
    // Let's try adding variations via "Add manually" button
    const addVarBtn = await page.$('.add-variation-manually, .add_variation_manually, a.add_variation');
    if (addVarBtn) {
      console.log('  Found "Add variation" button');
      // Add first variation
      await addVarBtn.click();
      await page.waitForTimeout(2000);
    } else {
      // Try the "Generate variations" link if it exists
      const generateLink = await page.$('a[href="#generate_variations"], .generate_variations');
      if (generateLink) {
        await generateLink.click();
        await page.waitForTimeout(3000);
        console.log('  Generated variations');
      } else {
        // Check what's in the variations tab
        const varTabHTML = await page.evaluate(() => {
          const tab = document.querySelector('#variable_product_options');
          return tab ? tab.innerHTML.substring(0, 1000) : 'not found';
        });
        console.log('  Variations tab content:', varTabHTML.substring(0, 300));

        // Maybe there's a toolbar with "Generate" button
        const toolbarBtns = await page.$$eval('#variable_product_options button, #variable_product_options a, #variable_product_options input[type="button"]', els =>
          els.map(el => ({ tag: el.tagName, text: el.textContent?.trim()?.substring(0, 30) || '', class: el.className, href: el.href || '' }))
        );
        console.log('  Toolbar buttons:', JSON.stringify(toolbarBtns));
      }
    }

    // Save product
    await page.click('#publish');
    await page.waitForTimeout(4000);

    // Reload and check
    await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

    const finalType = await page.$eval('#product-type', el => el.value);
    const finalTitle = await page.$eval('#title', el => el.value);
    console.log(`  Final state: title="${finalTitle}", type=${finalType}`);

    await page.click('.variations_tab a').catch(() => {});
    await page.waitForTimeout(2000);
    const finalVars = await page.$$eval('.woocommerce_variation', els => els.length);
    console.log(`  Variations: ${finalVars}`);

    await page.screenshot({ path: path.join(DIR, 'dracena-final.png'), fullPage: true });
  }

  // ===== ציפור גן עדן (ID:2889) =====
  if (!dResult.error) {
    // REST API worked, do ציפור גן עדן the same way
    console.log('\n=== Converting ציפור גן עדן (ID:2889) via REST API ===');
    const bResult = await page.evaluate(async () => {
      const nonce = wpApiSettings?.nonce || '';
      const updateResp = await fetch('/wp-json/wc/v3/products/2889', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
        body: JSON.stringify({
          name: 'ציפור גן עדן',
          type: 'variable',
          attributes: [{ name: 'גודל', visible: true, variation: true, options: ['גדולה ללא כד', 'קטנה ללא כד'] }]
        })
      });
      if (!updateResp.ok) return { error: true };

      await fetch('/wp-json/wc/v3/products/2889/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
        body: JSON.stringify({ regular_price: '560', attributes: [{ name: 'גודל', option: 'גדולה ללא כד' }] })
      });
      await fetch('/wp-json/wc/v3/products/2889/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
        body: JSON.stringify({ regular_price: '400', attributes: [{ name: 'גודל', option: 'קטנה ללא כד' }] })
      });
      await fetch('/wp-json/wc/v3/products/2615', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
        body: JSON.stringify({ status: 'draft' })
      });
      return { ok: true };
    });
    console.log('  ציפור גן עדן result:', JSON.stringify(bResult));
  }

  // Take screenshots
  console.log('\n=== Screenshots ===');
  for (const [id, name] of [[2920, 'dracena'], [2889, 'bop'], [2932, 'sriaus']]) {
    await page.goto(`${SITE}/?post_type=product&p=${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(DIR, `verify-${name}.png`), fullPage: true });
    console.log(`  ${name} screenshot ✓`);
  }

  await page.goto(`${SITE}/wp-admin/edit.php?post_type=product`);
  await page.waitForSelector('.wp-list-table', { timeout: 10000 });
  await page.screenshot({ path: path.join(DIR, 'after.png'), fullPage: true });

  console.log('\n========================================');
  console.log('EXECUTION COMPLETE');
  console.log('Request #: 15022 | Record: reccOB6feBd9JkOFi');
  console.log('========================================');

  await browser.close();
}

async function takeScreenshots() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  await page.goto(`${SITE}/wp-login.php`);
  await page.fill('#user_login', WP_USER);
  await page.fill('#user_pass', WP_PASS);
  await page.click('#wp-submit');
  await page.waitForSelector('#wpbody', { timeout: 15000 });

  for (const [id, name] of [[2920, 'dracena'], [2889, 'bop'], [2932, 'sriaus']]) {
    await page.goto(`${SITE}/?post_type=product&p=${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(DIR, `verify-${name}.png`), fullPage: true });
    console.log(`  ${name} screenshot ✓`);
  }

  await page.goto(`${SITE}/wp-admin/edit.php?post_type=product`);
  await page.waitForSelector('.wp-list-table', { timeout: 10000 });
  await page.screenshot({ path: path.join(DIR, 'after.png'), fullPage: true });

  console.log('\nDone ✓');
  await browser.close();
}
