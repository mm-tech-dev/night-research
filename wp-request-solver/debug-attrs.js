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

  // Debug 1: Attributes page
  console.log('=== Attributes Page ===');
  await page.goto(`${SITE}/wp-admin/edit.php?post_type=product&page=product_attributes`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(DIR, 'debug-attrs-page.png'), fullPage: true });

  // Get ALL form elements
  const formInfo = await page.evaluate(() => {
    const form = document.querySelector('form');
    const inputs = form ? Array.from(form.querySelectorAll('input, select, textarea, button')).map(el => ({
      tag: el.tagName,
      type: el.type || '',
      id: el.id || '',
      name: el.name || '',
      className: el.className || '',
      value: el.value || ''
    })) : [];
    return inputs;
  });
  console.log('Form elements:', JSON.stringify(formInfo, null, 2));

  // Get table content
  const tableHTML = await page.$eval('.wp-list-table', el => el.innerHTML.substring(0, 2000)).catch(() => 'no table');
  console.log('\nTable HTML (truncated):', tableHTML.substring(0, 500));

  // Try to create attribute with correct selectors
  console.log('\n=== Trying to create attribute ===');
  // Try filling the attribute name
  const labelInput = await page.$('#attribute_label');
  if (labelInput) {
    await labelInput.fill('גודל');
    console.log('Filled #attribute_label');
  } else {
    console.log('#attribute_label not found');
    // Try other selectors
    const allInputs = await page.$$eval('input[type="text"]', els =>
      els.map(el => ({ id: el.id, name: el.name, placeholder: el.placeholder }))
    );
    console.log('Text inputs on page:', JSON.stringify(allInputs));
  }

  // Find submit button
  const buttons = await page.$$eval('input[type="submit"], button[type="submit"]', els =>
    els.map(el => ({ tag: el.tagName, id: el.id, value: el.value, text: el.textContent?.trim() || '', class: el.className }))
  );
  console.log('Submit buttons:', JSON.stringify(buttons));

  // Debug 2: Product page with variable type
  console.log('\n=== Product Page (Variable) ===');
  await page.goto(`${SITE}/wp-admin/post.php?post=2920&action=edit`);
  await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

  const prodType = await page.$eval('#product-type', el => el.value);
  console.log('Product type:', prodType);

  // Click attributes tab
  await page.click('.attribute_tab a');
  await page.waitForTimeout(2000);

  await page.screenshot({ path: path.join(DIR, 'debug-product-attrs.png'), fullPage: true });

  // Get everything in the attributes panel
  const attrPanelHTML = await page.$eval('#product_attributes', el => el.innerHTML.substring(0, 3000)).catch(() => 'not found');
  console.log('\nAttributes panel HTML (truncated):', attrPanelHTML.substring(0, 1000));

  // Check if the select exists
  const selectExists = await page.$('select.attribute_taxonomy');
  console.log('\nselect.attribute_taxonomy exists:', !!selectExists);

  if (selectExists) {
    const selHTML = await page.$eval('select.attribute_taxonomy', el => el.outerHTML);
    console.log('Select HTML:', selHTML);
  }

  // Look for any select elements in the attributes area
  const allSelects = await page.$$eval('#product_attributes select', els =>
    els.map(el => ({ id: el.id, name: el.name, class: el.className, optionCount: el.options.length }))
  );
  console.log('All selects in #product_attributes:', JSON.stringify(allSelects));

  // Check for "Add" button
  const addBtns = await page.$$eval('#product_attributes button, #product_attributes input[type="button"]', els =>
    els.map(el => ({ tag: el.tagName, text: el.textContent?.trim() || el.value || '', class: el.className, id: el.id }))
  );
  console.log('Buttons in #product_attributes:', JSON.stringify(addBtns));

  await browser.close();
})();
