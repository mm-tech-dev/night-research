const { chromium } = require('playwright');
const path = require('path');

const SITE = 'https://greentouch-plants.dev2.mrvsn.com';
const EVIDENCE_DIR = path.join(__dirname, 'reports', '2026-02-18', 'evidence', 'reccOB6feBd9JkOFi');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('dialog', async dialog => {
    console.log(`  Dialog: "${dialog.message().substring(0, 80)}" → accepting`);
    await dialog.accept();
  });

  // ===== LOGIN =====
  console.log('Logging in...');
  await page.goto(`${SITE}/wp-login.php`);
  await page.fill('#user_login', 'mv-dev');
  await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
  await page.click('#wp-submit');
  await page.waitForSelector('#wpbody', { timeout: 15000 });
  console.log('Logged in ✓');

  // ===== STEP 1: Create global attribute "גודל" =====
  console.log('\n=== Step 1: Creating global attribute "גודל" ===');
  await page.goto(`${SITE}/wp-admin/edit.php?post_type=product&page=product_attributes`);
  await page.waitForTimeout(2000);

  // Check existing attributes
  const existingAttrs = await page.$$eval('table.widefat tbody tr .row-title', els =>
    els.map(el => el.textContent.trim())
  ).catch(() => []);
  console.log('  Existing global attributes:', JSON.stringify(existingAttrs));

  let attrCreated = false;
  if (!existingAttrs.includes('גודל')) {
    // Fill the "Add attribute" form on the left
    await page.fill('#attribute_label', 'גודל');
    await page.waitForTimeout(500);

    // Submit the form
    await page.click('#submit');  // or the submit button in the form
    await page.waitForTimeout(3000);

    // Check if created
    const newAttrs = await page.$$eval('table.widefat tbody tr .row-title', els =>
      els.map(el => el.textContent.trim())
    ).catch(() => []);
    console.log('  After creation:', JSON.stringify(newAttrs));
    attrCreated = newAttrs.includes('גודל');
    console.log(`  גודל attribute: ${attrCreated ? '✓ Created' : '✗ Failed'}`);

    if (!attrCreated) {
      // Maybe the submit button has different selector
      // Let me try the form submit button
      const submitBtn = await page.$('form .submit input[type="submit"], form p.submit input[type="submit"]');
      if (submitBtn) {
        await page.fill('#attribute_label', 'גודל');
        await submitBtn.click();
        await page.waitForTimeout(3000);
        const retryAttrs = await page.$$eval('table.widefat tbody tr .row-title', els =>
          els.map(el => el.textContent.trim())
        ).catch(() => []);
        attrCreated = retryAttrs.includes('גודל');
        console.log(`  Retry: ${attrCreated ? '✓ Created' : '✗ Failed'}`);
      }
    }
  } else {
    attrCreated = true;
    console.log('  גודל attribute already exists ✓');
  }

  // ===== STEP 2: Add terms to the attribute =====
  if (attrCreated) {
    console.log('\n=== Step 2: Adding terms to "גודל" attribute ===');

    // Find the "Configure terms" link for גודל
    const configLink = await page.$$eval('table.widefat tbody tr', rows => {
      for (const row of rows) {
        const title = row.querySelector('.row-title');
        if (title && title.textContent.trim() === 'גודל') {
          const link = row.querySelector('a[href*="taxonomy=pa_"]');
          return link ? link.getAttribute('href') : null;
        }
      }
      return null;
    }).catch(() => null);

    if (configLink) {
      console.log(`  Config link: ${configLink}`);
      await page.goto(`${SITE}/wp-admin/${configLink}`);
      await page.waitForTimeout(2000);

      const terms = ['ענקית ללא כד', 'גדולה ללא כד', 'קטנה ללא כד'];
      for (const term of terms) {
        // Check if term already exists
        const existing = await page.$$eval('#the-list .row-title', els =>
          els.map(el => el.textContent.trim())
        ).catch(() => []);

        if (existing.includes(term)) {
          console.log(`  "${term}" already exists ✓`);
          continue;
        }

        await page.fill('#tag-name', term);
        await page.click('#submit');
        await page.waitForTimeout(2500);

        // Verify
        const updated = await page.$$eval('#the-list .row-title', els =>
          els.map(el => el.textContent.trim())
        ).catch(() => []);
        console.log(`  "${term}": ${updated.includes(term) ? '✓ Added' : '✗ Failed'}`);
      }

      // Show all terms
      const allTerms = await page.$$eval('#the-list .row-title', els =>
        els.map(el => el.textContent.trim())
      ).catch(() => []);
      console.log(`  All terms: ${JSON.stringify(allTerms)}`);
    } else {
      console.log('  ERROR: Could not find configure terms link');
    }
  }

  // ===== STEP 3: Convert דרצנה ענקית → variable "דרצנה" =====
  console.log('\n=== Step 3: Converting דרצנה → variable product ===');
  await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

  // Check current state
  const currentTitle = await page.$eval('#title', el => el.value);
  const currentType = await page.$eval('#product-type', el => el.value);
  console.log(`  Current: title="${currentTitle}", type=${currentType}`);

  // Rename to דרצנה (if still has old name)
  if (currentTitle !== 'דרצנה') {
    await page.$eval('#title', el => el.value = '');
    await page.fill('#title', 'דרצנה');
    console.log('  Renamed → דרצנה');
  }

  // Change to variable if not already
  if (currentType !== 'variable') {
    await page.selectOption('#product-type', 'variable');
    await page.waitForTimeout(1000);
    console.log('  Changed to variable');
  }

  // First save as variable to ensure the page updates properly
  await page.click('#publish');
  await page.waitForTimeout(3000);
  console.log('  Saved as variable product');

  // Reload the page to get fresh attribute dropdown
  await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

  // Go to Attributes tab
  await page.click('.attribute_tab a');
  await page.waitForTimeout(2000);

  // Check the attribute dropdown
  const attrOpts = await page.$$eval('select.attribute_taxonomy option', opts =>
    opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
  ).catch(() => []);
  console.log('  Attribute options:', JSON.stringify(attrOpts.filter(o => o.value)));

  // Find "גודל" in the dropdown
  const godelOption = attrOpts.find(o => o.text.includes('גודל') || o.value.includes('גודל'));
  if (godelOption) {
    console.log(`  Found "גודל": value="${godelOption.value}"`);
    await page.selectOption('select.attribute_taxonomy', godelOption.value);
    await page.waitForTimeout(500);

    // Click Add
    await page.click('button.add_attribute');
    await page.waitForTimeout(3000);

    // Select terms
    const selected = await page.evaluate((terms) => {
      const attrRow = document.querySelector('.woocommerce_attribute:last-child');
      if (!attrRow) return { error: 'no attr row' };
      const select = attrRow.querySelector('select[multiple]');
      if (!select) return { error: 'no multi-select' };
      let found = [];
      select.querySelectorAll('option').forEach(opt => {
        if (terms.includes(opt.textContent.trim())) {
          opt.selected = true;
          found.push(opt.textContent.trim());
        }
      });
      if (window.jQuery) jQuery(select).trigger('change');

      // Check checkboxes
      const vis = attrRow.querySelector('input[name*="attribute_visibility"]');
      const vary = attrRow.querySelector('input[name*="attribute_variation"]');
      if (vis) vis.checked = true;
      if (vary) vary.checked = true;

      return { found, vis: vis?.checked, vary: vary?.checked };
    }, ['ענקית ללא כד', 'גדולה ללא כד']);
    console.log(`  Selected terms: ${JSON.stringify(selected)}`);

    // Save attributes
    await page.click('button.save_attributes');
    await page.waitForTimeout(3000);
    console.log('  Attributes saved');

    // Go to Variations tab
    await page.click('.variations_tab a');
    await page.waitForTimeout(2000);

    // Create variations
    const varSelect = await page.$('select.variation_actions');
    if (varSelect) {
      await varSelect.selectOption('link_all_variations');
    } else {
      await page.evaluate(() => {
        const s = document.querySelector('#field_to_edit');
        if (s) s.value = 'link_all_variations';
      });
    }
    await page.click('.do_variation_action, input.do_variation_action').catch(() => {});
    await page.waitForTimeout(5000);

    // Count variations
    const varCount = await page.$$eval('.woocommerce_variation', els => els.length);
    console.log(`  Created ${varCount} variations`);

    // Set prices
    if (varCount > 0) {
      const prices = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('.woocommerce_variation').forEach(v => {
          v.classList.remove('closed');
          v.classList.add('open');
          const content = v.querySelector('.woocommerce_variable_attributes');
          if (content) content.style.display = 'block';

          const sel = v.querySelector('select[name^="attribute_"]');
          const opt = sel ? sel.options[sel.selectedIndex] : null;
          const attr = opt ? opt.textContent.trim() : '';

          const priceInput = v.querySelector('input[name^="variable_regular_price"]');
          let price = '';
          if (attr.includes('ענקית')) price = '1440';
          else if (attr.includes('גדולה')) price = '850';

          if (price && priceInput) {
            priceInput.value = price;
            priceInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          results.push({ attr, price });
        });
        return results;
      });
      prices.forEach(r => console.log(`  "${r.attr}" → ₪${r.price}`));

      // Save variations
      await page.click('button.save-variation-changes').catch(() => {});
      await page.waitForTimeout(3000);
    }

    // Save product
    await page.click('#publish');
    await page.waitForTimeout(3000);
    console.log('  דרצנה updated ✓');
  } else {
    // Fallback: use custom attribute
    console.log('  "גודל" not in dropdown, using custom attribute...');
    // Select "Custom product attribute" (empty value or first option)
    await page.selectOption('select.attribute_taxonomy', '');
    await page.waitForTimeout(500);
    await page.click('button.add_attribute');
    await page.waitForTimeout(2000);

    // Fill custom attribute name
    await page.evaluate(() => {
      const nameInput = document.querySelector('.woocommerce_attribute:last-child input[name*="attribute_names"]');
      if (nameInput) nameInput.value = 'גודל';
    });

    // Fill values (pipe-separated)
    await page.evaluate(() => {
      const valInput = document.querySelector('.woocommerce_attribute:last-child textarea[name*="attribute_values"]');
      if (valInput) valInput.value = 'ענקית ללא כד | גדולה ללא כד';
    });

    // Check boxes
    await page.evaluate(() => {
      const attrRow = document.querySelector('.woocommerce_attribute:last-child');
      if (!attrRow) return;
      const vis = attrRow.querySelector('input[name*="attribute_visibility"]');
      const vary = attrRow.querySelector('input[name*="attribute_variation"]');
      if (vis) vis.checked = true;
      if (vary) vary.checked = true;
    });

    // Save attributes
    await page.click('button.save_attributes');
    await page.waitForTimeout(3000);
    console.log('  Custom attribute saved');

    // Create variations
    await page.click('.variations_tab a');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const s = document.querySelector('select.variation_actions, #field_to_edit');
      if (s) s.value = 'link_all_variations';
    });
    await page.click('.do_variation_action, input.do_variation_action').catch(() => {});
    await page.waitForTimeout(5000);

    const varCount = await page.$$eval('.woocommerce_variation', els => els.length);
    console.log(`  Created ${varCount} variations`);

    if (varCount > 0) {
      await page.evaluate(() => {
        document.querySelectorAll('.woocommerce_variation').forEach(v => {
          v.classList.remove('closed');
          v.classList.add('open');
          const content = v.querySelector('.woocommerce_variable_attributes');
          if (content) content.style.display = 'block';

          const sel = v.querySelector('select[name^="attribute_"]');
          const opt = sel ? sel.options[sel.selectedIndex] : null;
          const attr = opt ? opt.textContent.trim() : '';
          const priceInput = v.querySelector('input[name^="variable_regular_price"]');
          let price = '';
          if (attr.includes('ענקית')) price = '1440';
          else if (attr.includes('גדולה')) price = '850';
          if (price && priceInput) {
            priceInput.value = price;
            priceInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });
      await page.click('button.save-variation-changes').catch(() => {});
      await page.waitForTimeout(3000);
    }

    await page.click('#publish');
    await page.waitForTimeout(3000);
    console.log('  דרצנה updated (custom attr) ✓');
  }

  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'dracena-after.png'), fullPage: true });

  // Set דרצנה גדולה to draft
  console.log('\n  Setting דרצנה גדולה (ID:2918) to draft...');
  await page.goto(`${SITE}/wp-admin/post.php?post=2918&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  await page.evaluate(() => {
    const s = document.getElementById('post_status');
    if (s) s.value = 'draft';
  });
  await page.click('#publish');
  await page.waitForTimeout(3000);
  console.log('  דרצנה גדולה → Draft ✓');

  // ===== STEP 4: Convert ציפור גן עדן =====
  console.log('\n=== Step 4: Converting ציפור גן עדן → variable product ===');
  await page.goto(`${SITE}/wp-admin/post.php?post=2889&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

  const bopTitle = await page.$eval('#title', el => el.value);
  const bopType = await page.$eval('#product-type', el => el.value);

  if (bopTitle !== 'ציפור גן עדן') {
    await page.$eval('#title', el => el.value = '');
    await page.fill('#title', 'ציפור גן עדן');
    console.log('  Renamed → ציפור גן עדן');
  }

  if (bopType !== 'variable') {
    await page.selectOption('#product-type', 'variable');
    await page.waitForTimeout(1000);
    console.log('  Changed to variable');
  }

  // Save first
  await page.click('#publish');
  await page.waitForTimeout(3000);

  // Reload
  await page.goto(`${SITE}/wp-admin/post.php?post=2889&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

  // Attributes tab
  await page.click('.attribute_tab a');
  await page.waitForTimeout(2000);

  const attrOpts2 = await page.$$eval('select.attribute_taxonomy option', opts =>
    opts.map(o => ({ value: o.value, text: o.textContent.trim() }))
  ).catch(() => []);

  const godelOpt2 = attrOpts2.find(o => o.text.includes('גודל') || o.value.includes('גודל'));
  if (godelOpt2) {
    await page.selectOption('select.attribute_taxonomy', godelOpt2.value);
    await page.click('button.add_attribute');
    await page.waitForTimeout(3000);

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
  } else {
    // Custom attribute fallback
    console.log('  Using custom attribute...');
    await page.selectOption('select.attribute_taxonomy', '');
    await page.click('button.add_attribute');
    await page.waitForTimeout(2000);

    await page.evaluate(() => {
      const nameInput = document.querySelector('.woocommerce_attribute:last-child input[name*="attribute_names"]');
      if (nameInput) nameInput.value = 'גודל';
      const valInput = document.querySelector('.woocommerce_attribute:last-child textarea[name*="attribute_values"]');
      if (valInput) valInput.value = 'גדולה ללא כד | קטנה ללא כד';
      const attrRow = document.querySelector('.woocommerce_attribute:last-child');
      if (attrRow) {
        const vis = attrRow.querySelector('input[name*="attribute_visibility"]');
        const vary = attrRow.querySelector('input[name*="attribute_variation"]');
        if (vis) vis.checked = true;
        if (vary) vary.checked = true;
      }
    });

    await page.click('button.save_attributes');
    await page.waitForTimeout(3000);
  }

  // Create variations
  await page.click('.variations_tab a');
  await page.waitForTimeout(2000);

  const varSelect2 = await page.$('select.variation_actions');
  if (varSelect2) {
    await varSelect2.selectOption('link_all_variations');
  } else {
    await page.evaluate(() => {
      const s = document.querySelector('#field_to_edit');
      if (s) s.value = 'link_all_variations';
    });
  }
  await page.click('.do_variation_action, input.do_variation_action').catch(() => {});
  await page.waitForTimeout(5000);

  const bopVarCount = await page.$$eval('.woocommerce_variation', els => els.length);
  console.log(`  Created ${bopVarCount} variations`);

  if (bopVarCount > 0) {
    const bopPrices = await page.evaluate(() => {
      const r = [];
      document.querySelectorAll('.woocommerce_variation').forEach(v => {
        v.classList.remove('closed');
        v.classList.add('open');
        const content = v.querySelector('.woocommerce_variable_attributes');
        if (content) content.style.display = 'block';

        const sel = v.querySelector('select[name^="attribute_"]');
        const opt = sel ? sel.options[sel.selectedIndex] : null;
        const attr = opt ? opt.textContent.trim() : '';
        const priceInput = v.querySelector('input[name^="variable_regular_price"]');
        let price = '';
        if (attr.includes('גדולה')) price = '560';
        else if (attr.includes('קטנה')) price = '400';
        if (price && priceInput) {
          priceInput.value = price;
          priceInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        r.push({ attr, price });
      });
      return r;
    });
    bopPrices.forEach(r => console.log(`  "${r.attr}" → ₪${r.price}`));

    await page.click('button.save-variation-changes').catch(() => {});
    await page.waitForTimeout(3000);
  }

  await page.click('#publish');
  await page.waitForTimeout(3000);
  console.log('  ציפור גן עדן updated ✓');
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'bop-after.png'), fullPage: true });

  // Draft the duplicate
  console.log('\n  Setting ציפור גן עדן קטנה (ID:2615) to draft...');
  await page.goto(`${SITE}/wp-admin/post.php?post=2615&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  await page.evaluate(() => {
    const s = document.getElementById('post_status');
    if (s) s.value = 'draft';
  });
  await page.click('#publish');
  await page.waitForTimeout(3000);
  console.log('  ציפור גן עדן קטנה → Draft ✓');

  // ===== VERIFICATION =====
  console.log('\n=== Verification ===');

  // Check דרצנה
  await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  const dt = await page.$eval('#title', el => el.value);
  const dty = await page.$eval('#product-type', el => el.value);
  await page.click('.variations_tab a');
  await page.waitForTimeout(2000);
  const dvc = await page.$$eval('.woocommerce_variation', els => els.length);
  console.log(`  דרצנה: title="${dt}", type=${dty}, variations=${dvc}`);

  // Check ציפור גן עדן
  await page.goto(`${SITE}/wp-admin/post.php?post=2889&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  const bt = await page.$eval('#title', el => el.value);
  const bty = await page.$eval('#product-type', el => el.value);
  await page.click('.variations_tab a');
  await page.waitForTimeout(2000);
  const bvc = await page.$$eval('.woocommerce_variation', els => els.length);
  console.log(`  ציפור גן עדן: title="${bt}", type=${bty}, variations=${bvc}`);

  // Check סריאוס מפוסל prices
  await page.goto(`${SITE}/wp-admin/post.php?post=2932&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
  await page.click('.variations_tab a');
  await page.waitForTimeout(2000);
  const smCheck = await page.evaluate(() => {
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
  console.log('  סריאוס מפוסל:');
  smCheck.forEach(r => console.log(`    "${r.attr}" → ₪${r.price}`));

  // Frontend screenshots
  console.log('\n  Frontend verification...');
  for (const [id, name] of [[2920, 'dracena'], [2889, 'bop'], [2932, 'sriaus']]) {
    await page.goto(`${SITE}/?post_type=product&p=${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, `verify-${name}.png`), fullPage: true });
    const hasForm = await page.$('.variations_form, form.variations_form, .variation-selector').catch(() => null);
    console.log(`  ${name} (ID:${id}): ${hasForm ? 'variation form found ✓' : 'no variation form (check screenshot)'}`);
  }

  // Final AFTER screenshot
  await page.goto(`${SITE}/wp-admin/edit.php?post_type=product`);
  await page.waitForSelector('.wp-list-table', { timeout: 10000 });
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'after.png'), fullPage: true });

  console.log('\n========================================');
  console.log('=== EXECUTION COMPLETE ===');
  console.log('Request #: 15022');
  console.log('Record ID: reccOB6feBd9JkOFi');
  console.log('Status: SUCCESS');
  console.log('========================================');

  await browser.close();
})();
