const { chromium } = require('playwright');
const path = require('path');

const SITE = 'https://greentouch-plants.dev2.mrvsn.com';
const DIR = path.join(__dirname, 'reports', '2026-02-18', 'evidence', 'reccOB6feBd9JkOFi');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('dialog', d => d.accept());

  // Login
  await page.goto(`${SITE}/wp-login.php`);
  await page.fill('#user_login', 'mv-dev');
  await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
  await page.click('#wp-submit');
  await page.waitForSelector('#wpbody', { timeout: 15000 });
  console.log('Logged in ✓');

  // ===== STEP 1: Add terms to "גודל" global attribute =====
  console.log('\n=== Step 1: Adding terms to "גודל" attribute ===');
  await page.goto(`${SITE}/wp-admin/edit-tags.php?taxonomy=pa_%D7%92%D7%95%D7%93%D7%9C&post_type=product`);
  await page.waitForTimeout(2000);

  const pageTitle = await page.$eval('.wrap h1', el => el.textContent).catch(() => '');
  console.log(`  Page title: "${pageTitle}"`);

  // Get existing terms
  let existingTerms = await page.$$eval('#the-list .row-title', els =>
    els.map(el => el.textContent.trim())
  ).catch(() => []);
  console.log(`  Existing terms: ${JSON.stringify(existingTerms)}`);

  const neededTerms = ['ענקית ללא כד', 'גדולה ללא כד', 'קטנה ללא כד'];
  for (const term of neededTerms) {
    if (existingTerms.includes(term)) {
      console.log(`  "${term}" exists ✓`);
      continue;
    }
    await page.fill('#tag-name', term);
    await page.click('#submit');
    await page.waitForTimeout(2500);

    existingTerms = await page.$$eval('#the-list .row-title', els =>
      els.map(el => el.textContent.trim())
    ).catch(() => []);
    console.log(`  "${term}": ${existingTerms.includes(term) ? '✓' : '✗'}`);
  }

  console.log(`  Final terms: ${JSON.stringify(existingTerms)}`);

  // ===== STEP 2: Convert דרצנה ענקית → "דרצנה" variable =====
  console.log('\n=== Step 2: דרצנה — converting to variable product ===');

  // First ensure it's variable type
  await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

  // Rename
  const curTitle = await page.$eval('#title', el => el.value);
  if (curTitle !== 'דרצנה') {
    await page.$eval('#title', el => el.value = '');
    await page.fill('#title', 'דרצנה');
    console.log('  Renamed → דרצנה');
  }

  // Set to variable
  const curType = await page.$eval('#product-type', el => el.value);
  if (curType !== 'variable') {
    await page.selectOption('#product-type', 'variable');
    await page.waitForTimeout(1000);
    console.log('  Set to variable');
    await page.click('#publish');
    await page.waitForTimeout(3000);
    await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  }

  // Go to Attributes tab
  await page.click('.attribute_tab a');
  await page.waitForTimeout(2000);

  // Use Select2 to search for "גודל" attribute
  // Click the Select2 container to open it
  const select2Container = await page.$('.wc-attribute-search + .select2-container');
  if (select2Container) {
    await select2Container.click();
    await page.waitForTimeout(500);

    // Type in the search
    await page.keyboard.type('גודל');
    await page.waitForTimeout(1500);

    // Click the result
    const result = await page.$('.select2-results__option:not(.select2-results__message)');
    if (result) {
      const resultText = await result.textContent();
      console.log(`  Found attribute in dropdown: "${resultText}"`);
      await result.click();
      await page.waitForTimeout(3000);
      console.log('  Attribute added to product');
    } else {
      console.log('  No result found in Select2 dropdown');
      // Screenshot for debugging
      await page.screenshot({ path: path.join(DIR, 'debug-select2.png') });
    }
  } else {
    console.log('  Select2 container not found, trying alternative...');
    // Try direct interaction with the hidden select
    await page.evaluate(() => {
      const select = document.querySelector('.wc-attribute-search');
      if (select) {
        // Find the option for גודל
        const opt = document.createElement('option');
        opt.value = 'pa_גודל';
        opt.textContent = 'גודל';
        opt.selected = true;
        select.appendChild(opt);
        jQuery(select).trigger('change');
      }
    });
    await page.waitForTimeout(2000);
  }

  // Now select the terms for this product
  await page.waitForTimeout(1000);

  // Select terms using JS (Select2 multi-select for terms)
  const termResult = await page.evaluate((terms) => {
    const attrRow = document.querySelector('.woocommerce_attribute:last-child');
    if (!attrRow) return { error: 'no attribute row found' };

    // Find the multi-select for terms
    const select = attrRow.querySelector('select[multiple]');
    if (!select) return { error: 'no multi-select found', html: attrRow.innerHTML.substring(0, 300) };

    let found = [];
    select.querySelectorAll('option').forEach(opt => {
      if (terms.includes(opt.textContent.trim())) {
        opt.selected = true;
        found.push(opt.textContent.trim());
      }
    });
    if (window.jQuery) jQuery(select).trigger('change');

    // Check Used for variations
    const vis = attrRow.querySelector('input[name*="attribute_visibility"]');
    const vary = attrRow.querySelector('input[name*="attribute_variation"]');
    if (vis) vis.checked = true;
    if (vary) vary.checked = true;

    return { found, visChecked: vis?.checked, varyChecked: vary?.checked };
  }, ['ענקית ללא כד', 'גדולה ללא כד']);
  console.log(`  Terms selection: ${JSON.stringify(termResult)}`);

  // If terms weren't found in multi-select, try clicking "Select all"
  if (termResult.error || (Array.isArray(termResult.found) && termResult.found.length === 0)) {
    console.log('  Trying "Select all" button...');
    await page.click('.woocommerce_attribute:last-child .select_all_attributes').catch(() => {
      console.log('  No "Select all" button found');
    });
    await page.waitForTimeout(500);
  }

  // Save attributes
  await page.click('button.save_attributes');
  await page.waitForTimeout(3000);
  console.log('  Attributes saved');

  // Variations tab
  await page.click('.variations_tab a');
  await page.waitForTimeout(2000);

  // Create variations from all attributes
  // In newer WooCommerce, the variation action dropdown might be different
  const createResult = await page.evaluate(() => {
    const select = document.querySelector('select.variation_actions, #field_to_edit');
    if (!select) return 'no variation action select found';
    // Find the right option
    for (const opt of select.options) {
      if (opt.value === 'link_all_variations') {
        select.value = 'link_all_variations';
        return 'selected link_all_variations';
      }
    }
    return 'option not found, options: ' + Array.from(select.options).map(o => o.value).join(', ');
  });
  console.log(`  Variation action: ${createResult}`);

  // Click Go
  await page.click('.do_variation_action, input.do_variation_action, button.do_variation_action').catch(async () => {
    // Try finding the button by text
    const goBtn = await page.$('text=חלה');
    if (goBtn) await goBtn.click();
  });
  await page.waitForTimeout(5000);

  // Count variations
  const varCount = await page.$$eval('.woocommerce_variation', els => els.length);
  console.log(`  Variations created: ${varCount}`);

  if (varCount > 0) {
    // Set prices
    const prices = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('.woocommerce_variation').forEach(v => {
        v.classList.remove('closed');
        v.classList.add('open');
        const c = v.querySelector('.woocommerce_variable_attributes');
        if (c) c.style.display = 'block';

        const sel = v.querySelector('select[name^="attribute_"]');
        const opt = sel ? sel.options[sel.selectedIndex] : null;
        const attr = opt ? opt.textContent.trim() : '';
        const pi = v.querySelector('input[name^="variable_regular_price"]');
        let price = '';
        if (attr.includes('ענקית')) price = '1440';
        else if (attr.includes('גדולה')) price = '850';
        if (price && pi) {
          pi.value = price;
          pi.dispatchEvent(new Event('change', { bubbles: true }));
        }
        results.push({ attr, price });
      });
      return results;
    });
    prices.forEach(r => console.log(`    "${r.attr}" → ₪${r.price}`));

    // Save variations
    await page.click('button.save-variation-changes').catch(() => {});
    await page.waitForTimeout(3000);
  }

  // Save product
  await page.click('#publish');
  await page.waitForTimeout(3000);
  console.log('  דרצנה saved ✓');
  await page.screenshot({ path: path.join(DIR, 'dracena-after.png'), fullPage: true });

  // Draft דרצנה גדולה
  console.log('\n  Drafting דרצנה גדולה (ID:2918)...');
  await page.goto(`${SITE}/wp-admin/post.php?post=2918&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  await page.evaluate(() => { document.getElementById('post_status').value = 'draft'; });
  await page.click('#publish');
  await page.waitForTimeout(3000);
  console.log('  דרצנה גדולה → Draft ✓');

  // ===== STEP 3: Convert ציפור גן עדן גדולה → "ציפור גן עדן" variable =====
  console.log('\n=== Step 3: ציפור גן עדן — converting to variable product ===');
  await page.goto(`${SITE}/wp-admin/post.php?post=2889&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

  const bTitle = await page.$eval('#title', el => el.value);
  if (bTitle !== 'ציפור גן עדן') {
    await page.$eval('#title', el => el.value = '');
    await page.fill('#title', 'ציפור גן עדן');
    console.log('  Renamed → ציפור גן עדן');
  }

  const bType = await page.$eval('#product-type', el => el.value);
  if (bType !== 'variable') {
    await page.selectOption('#product-type', 'variable');
    await page.waitForTimeout(1000);
    console.log('  Set to variable');
    await page.click('#publish');
    await page.waitForTimeout(3000);
    await page.goto(`${SITE}/wp-admin/post.php?post=2889&action=edit`);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  }

  // Attributes tab
  await page.click('.attribute_tab a');
  await page.waitForTimeout(2000);

  // Use Select2 for attribute
  const s2c = await page.$('.wc-attribute-search + .select2-container');
  if (s2c) {
    await s2c.click();
    await page.waitForTimeout(500);
    await page.keyboard.type('גודל');
    await page.waitForTimeout(1500);
    const r = await page.$('.select2-results__option:not(.select2-results__message)');
    if (r) {
      await r.click();
      await page.waitForTimeout(3000);
      console.log('  Attribute added');
    }
  }

  // Select terms
  await page.evaluate((terms) => {
    const attrRow = document.querySelector('.woocommerce_attribute:last-child');
    if (!attrRow) return;
    const select = attrRow.querySelector('select[multiple]');
    if (!select) return;
    select.querySelectorAll('option').forEach(opt => {
      if (terms.includes(opt.textContent.trim())) opt.selected = true;
    });
    if (window.jQuery) jQuery(select).trigger('change');
    const vis = attrRow.querySelector('input[name*="attribute_visibility"]');
    const vary = attrRow.querySelector('input[name*="attribute_variation"]');
    if (vis) vis.checked = true;
    if (vary) vary.checked = true;
  }, ['גדולה ללא כד', 'קטנה ללא כד']);

  await page.click('button.save_attributes');
  await page.waitForTimeout(3000);
  console.log('  Attributes saved');

  // Create variations
  await page.click('.variations_tab a');
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    const s = document.querySelector('select.variation_actions, #field_to_edit');
    if (s) s.value = 'link_all_variations';
  });
  await page.click('.do_variation_action, input.do_variation_action').catch(() => {});
  await page.waitForTimeout(5000);

  const bVarCount = await page.$$eval('.woocommerce_variation', els => els.length);
  console.log(`  Variations created: ${bVarCount}`);

  if (bVarCount > 0) {
    await page.evaluate(() => {
      document.querySelectorAll('.woocommerce_variation').forEach(v => {
        v.classList.remove('closed');
        v.classList.add('open');
        const c = v.querySelector('.woocommerce_variable_attributes');
        if (c) c.style.display = 'block';
        const sel = v.querySelector('select[name^="attribute_"]');
        const opt = sel ? sel.options[sel.selectedIndex] : null;
        const attr = opt ? opt.textContent.trim() : '';
        const pi = v.querySelector('input[name^="variable_regular_price"]');
        let price = '';
        if (attr.includes('גדולה')) price = '560';
        else if (attr.includes('קטנה')) price = '400';
        if (price && pi) {
          pi.value = price;
          pi.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });
    await page.click('button.save-variation-changes').catch(() => {});
    await page.waitForTimeout(3000);
  }

  await page.click('#publish');
  await page.waitForTimeout(3000);
  console.log('  ציפור גן עדן saved ✓');
  await page.screenshot({ path: path.join(DIR, 'bop-after.png'), fullPage: true });

  // Draft duplicate
  console.log('\n  Drafting ציפור גן עדן קטנה (ID:2615)...');
  await page.goto(`${SITE}/wp-admin/post.php?post=2615&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  await page.evaluate(() => { document.getElementById('post_status').value = 'draft'; });
  await page.click('#publish');
  await page.waitForTimeout(3000);
  console.log('  ציפור גן עדן קטנה → Draft ✓');

  // ===== VERIFICATION =====
  console.log('\n=== Final Verification ===');

  // Check דרצנה
  await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  const dt = await page.$eval('#title', el => el.value);
  const dty = await page.$eval('#product-type', el => el.value);
  await page.click('.variations_tab a').catch(() => {});
  await page.waitForTimeout(2000);
  const dvc = await page.$$eval('.woocommerce_variation', els => els.length);
  const dPrices = await page.evaluate(() => {
    const r = [];
    document.querySelectorAll('.woocommerce_variation').forEach(v => {
      v.classList.remove('closed');
      const c = v.querySelector('.woocommerce_variable_attributes');
      if (c) c.style.display = 'block';
      const s = v.querySelector('select[name^="attribute_"]');
      const o = s ? s.options[s.selectedIndex] : null;
      const p = v.querySelector('input[name^="variable_regular_price"]');
      r.push({ attr: o?.textContent?.trim() || '', price: p?.value || '' });
    });
    return r;
  });
  console.log(`  דרצנה: title="${dt}", type=${dty}, vars=${dvc}`);
  dPrices.forEach(r => console.log(`    "${r.attr}" → ₪${r.price}`));

  // Check ציפור
  await page.goto(`${SITE}/wp-admin/post.php?post=2889&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  const bt = await page.$eval('#title', el => el.value);
  const bty = await page.$eval('#product-type', el => el.value);
  await page.click('.variations_tab a').catch(() => {});
  await page.waitForTimeout(2000);
  const bvc = await page.$$eval('.woocommerce_variation', els => els.length);
  const bPrices = await page.evaluate(() => {
    const r = [];
    document.querySelectorAll('.woocommerce_variation').forEach(v => {
      v.classList.remove('closed');
      const c = v.querySelector('.woocommerce_variable_attributes');
      if (c) c.style.display = 'block';
      const s = v.querySelector('select[name^="attribute_"]');
      const o = s ? s.options[s.selectedIndex] : null;
      const p = v.querySelector('input[name^="variable_regular_price"]');
      r.push({ attr: o?.textContent?.trim() || '', price: p?.value || '' });
    });
    return r;
  });
  console.log(`  ציפור גן עדן: title="${bt}", type=${bty}, vars=${bvc}`);
  bPrices.forEach(r => console.log(`    "${r.attr}" → ₪${r.price}`));

  // Frontend verification
  console.log('\n  Frontend checks...');
  for (const [id, name] of [[2920, 'dracena'], [2889, 'bop'], [2932, 'sriaus']]) {
    await page.goto(`${SITE}/?post_type=product&p=${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(DIR, `verify-${name}.png`), fullPage: true });
    const hasForm = !!(await page.$('.variations_form, form.variations_form').catch(() => null));
    console.log(`  ${name} (ID:${id}): variation form = ${hasForm ? '✓' : '✗'}`);
  }

  // AFTER screenshot
  await page.goto(`${SITE}/wp-admin/edit.php?post_type=product`);
  await page.waitForSelector('.wp-list-table', { timeout: 10000 });
  await page.screenshot({ path: path.join(DIR, 'after.png'), fullPage: true });

  console.log('\n========================================');
  console.log('EXECUTION COMPLETE');
  console.log('Request #: 15022 | Record: reccOB6feBd9JkOFi');
  console.log('========================================');

  await browser.close();
})();
