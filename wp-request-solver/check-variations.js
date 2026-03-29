const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Login
  await page.goto('https://greentouch-plants.dev2.mrvsn.com/wp-login.php');
  await page.fill('#user_login', 'mv-dev');
  await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
  await page.click('#wp-submit');
  await page.waitForSelector('#wpbody', { timeout: 15000 });

  // Check each variable product's attributes and variation prices
  const variableProducts = [
    { id: 2934, name: 'קקטוס סגווארו' },
    { id: 2922, name: 'קקטוס סריאוס' },
    { id: 2925, name: 'קקטוס מוסטרוזה' },
    { id: 2932, name: 'סריאוס מפוסל' },
    { id: 2927, name: 'קקטוס אופורביה' },
  ];

  for (const prod of variableProducts) {
    console.log(`\n=== ${prod.name} (ID: ${prod.id}) ===`);
    await page.goto(`https://greentouch-plants.dev2.mrvsn.com/wp-admin/post.php?post=${prod.id}&action=edit`);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });

    // Get product type
    const prodType = await page.$eval('#product-type', el => el.value).catch(() => 'unknown');
    console.log('Type:', prodType);

    // Get attributes
    await page.click('.attribute_tab a').catch(() => {});
    await page.waitForTimeout(500);
    const attrs = await page.$$eval('.woocommerce_attribute', els => {
      return els.map(el => {
        const label = el.querySelector('.attribute_name strong')?.textContent?.trim() ||
                      el.querySelector('h3 strong')?.textContent?.trim() || '';
        const values = el.querySelector('.attribute_values')?.textContent?.trim() || '';
        const usedForVar = el.querySelector('input[name*="attribute_variation"]')?.checked || false;
        return { label, values: values.substring(0, 200), usedForVar };
      });
    }).catch(() => []);
    console.log('Attributes:', JSON.stringify(attrs, null, 2));

    // Get variations
    await page.click('.variations_tab a').catch(() => {});
    await page.waitForTimeout(1500);

    // Expand all variations
    const variationCount = await page.$$eval('.woocommerce_variation', els => els.length);
    console.log('Variation count:', variationCount);

    // Click expand all
    await page.click('.expand_all').catch(() => {});
    await page.waitForTimeout(1000);

    const variations = await page.$$eval('.woocommerce_variation', els => {
      return els.map(el => {
        const selects = el.querySelectorAll('select[name^="attribute_"]');
        let attrValues = {};
        selects.forEach(s => {
          const attrName = s.getAttribute('name')?.replace(/attribute_/, '').replace(/\[\d+\]/, '') || '';
          const val = s.querySelector('option[selected]')?.textContent?.trim() || s.value || '';
          attrValues[attrName] = val;
        });
        const price = el.querySelector('input[name^="variable_regular_price"]')?.value || '';
        const salePrice = el.querySelector('input[name^="variable_sale_price"]')?.value || '';
        return { attrValues, price, salePrice };
      });
    }).catch(() => []);

    variations.forEach((v, i) => {
      console.log(`  Variation ${i+1}: attrs=${JSON.stringify(v.attrValues)} price=${v.price} sale=${v.salePrice}`);
    });
  }

  // Check the existing global attribute details
  console.log('\n=== GLOBAL ATTRIBUTES ===');
  await page.goto('https://greentouch-plants.dev2.mrvsn.com/wp-admin/edit.php?post_type=product&page=product_attributes');
  await page.waitForTimeout(1000);

  const globalAttrs = await page.$$eval('.wp-list-table tbody tr', rows => {
    return rows.map(row => {
      const nameEl = row.querySelector('.row-title');
      const slugCol = row.querySelectorAll('td');
      const name = nameEl ? nameEl.textContent.trim() : '';
      const slug = slugCol[1] ? slugCol[1].textContent.trim() : '';
      const termsLink = row.querySelector('a[href*="taxonomy=pa_"]');
      const termsUrl = termsLink ? termsLink.getAttribute('href') : '';
      return { name, slug, termsUrl };
    });
  }).catch(() => []);

  globalAttrs.forEach(a => console.log(`  Attr: "${a.name}" slug: "${a.slug}" terms_url: ${a.termsUrl}`));

  // Check simple products - just need price verification
  const simpleProducts = [
    { id: 2920, name: 'דרצנה ענקית' },
    { id: 2918, name: 'דרצנה גדולה' },
    { id: 2889, name: 'ציפור גן עדן גדולה' },
    { id: 2615, name: 'ציפור גן עדן קטנה' },
    { id: 2614, name: 'פיקוס כינורי' },
    { id: 2612, name: 'קקטוס כדורי' },
  ];

  console.log('\n=== SIMPLE PRODUCTS CHECK ===');
  for (const prod of simpleProducts) {
    await page.goto(`https://greentouch-plants.dev2.mrvsn.com/wp-admin/post.php?post=${prod.id}&action=edit`);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
    const prodType = await page.$eval('#product-type', el => el.value).catch(() => 'unknown');
    const regPrice = await page.$eval('#_regular_price', el => el.value).catch(() => '');
    const salePrice = await page.$eval('#_sale_price', el => el.value).catch(() => '');
    console.log(`${prod.name} (ID:${prod.id}): type=${prodType}, regular_price=${regPrice}, sale_price=${salePrice}`);
  }

  await browser.close();
})();
