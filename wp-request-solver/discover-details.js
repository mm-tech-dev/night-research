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

  const searchTerms = [
    'דרצנה ענקית', 'דרצנה גדולה',
    'ציפור גן עדן גדולה', 'ציפור גן עדן קטנה',
    'פיקוס כינורי', 'עץ בונסאי', 'קקטוס כדורי',
    'קקטוס סריאוס', 'קקטוס סגווארו', 'קקטוס מוסטרוזה',
    'סריאוס מפוסל', 'קקטוס אופורביה בהיר', 'קקטוס אופורביה'
  ];

  for (const term of searchTerms) {
    await page.goto(`https://greentouch-plants.dev2.mrvsn.com/wp-admin/edit.php?post_type=product&s=${encodeURIComponent(term)}`);
    await page.waitForSelector('.wp-list-table', { timeout: 10000 }).catch(() => {});

    const results = await page.$$eval('.wp-list-table tbody#the-list tr', rows => {
      return rows.map(row => {
        const titleEl = row.querySelector('.row-title');
        const editLink = titleEl ? titleEl.closest('a')?.getAttribute('href') || '' : '';
        const idMatch = editLink.match(/post=(\d+)/);
        const priceEl = row.querySelector('.column-price');
        // Get product type from the icon class
        const typeIcon = row.querySelector('a.order-status');
        const typeText = typeIcon ? typeIcon.getAttribute('title') || typeIcon.textContent.trim() : '';
        return {
          id: idMatch ? idMatch[1] : '',
          title: titleEl ? titleEl.textContent.trim() : '',
          type: typeText,
          price: priceEl ? priceEl.textContent.trim().replace(/\s+/g, ' ').substring(0, 80) : ''
        };
      });
    }).catch(() => []);

    console.log(`\n--- Search: "${term}" ---`);
    results.forEach(r => console.log(`  ID:${r.id} | "${r.title}" | type:${r.type} | price: ${r.price}`));
    if (results.length === 0) console.log('  (no results)');
  }

  // Now check existing attributes and their terms
  await page.goto('https://greentouch-plants.dev2.mrvsn.com/wp-admin/edit.php?post_type=product&page=product_attributes');
  const attrRows = await page.$$eval('.wp-list-table tbody tr', rows => {
    return rows.map(row => {
      const nameEl = row.querySelector('.row-title');
      const slugEl = row.querySelector('.attribute-slug');
      const termsLink = row.querySelector('td:nth-child(5)');
      return {
        name: nameEl ? nameEl.textContent.trim() : '',
        slug: slugEl ? slugEl.textContent.trim() : '',
        terms: termsLink ? termsLink.textContent.trim() : ''
      };
    });
  }).catch(() => []);
  console.log('\n--- Existing Global Attributes ---');
  if (attrRows.length === 0) console.log('  (none)');
  attrRows.forEach(a => console.log(`  "${a.name}" (slug: ${a.slug}) | terms: ${a.terms}`));

  // Check קקטוס סגווארו variations (already variable)
  console.log('\n--- Checking קקטוס סגווארו variations ---');
  await page.goto('https://greentouch-plants.dev2.mrvsn.com/wp-admin/edit.php?post_type=product&s=' + encodeURIComponent('קקטוס סגווארו'));
  await page.waitForSelector('.wp-list-table', { timeout: 10000 });
  const sgLink = await page.$eval('.row-title', el => el.closest('a')?.getAttribute('href') || '').catch(() => '');
  if (sgLink) {
    await page.goto(sgLink);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
    const prodType = await page.$eval('#product-type', el => el.value).catch(() => '');
    console.log('  Product type:', prodType);
    // Click variations tab
    await page.click('.variations_tab a').catch(() => {});
    await page.waitForTimeout(1000);
    const variations = await page.$$eval('.woocommerce_variation', els => {
      return els.map(el => {
        const header = el.querySelector('h3')?.textContent?.trim() || '';
        return header.substring(0, 80);
      });
    }).catch(() => []);
    console.log('  Variations:', JSON.stringify(variations));
  }

  // Check סריאוס מפוסל variations
  console.log('\n--- Checking סריאוס מפוסל variations ---');
  await page.goto('https://greentouch-plants.dev2.mrvsn.com/wp-admin/edit.php?post_type=product&s=' + encodeURIComponent('סריאוס מפוסל'));
  await page.waitForSelector('.wp-list-table', { timeout: 10000 });
  const smLink = await page.$eval('.row-title', el => el.closest('a')?.getAttribute('href') || '').catch(() => '');
  if (smLink) {
    await page.goto(smLink);
    await page.waitForSelector('#woocommerce-product-data', { timeout: 10000 });
    const prodType = await page.$eval('#product-type', el => el.value).catch(() => '');
    console.log('  Product type:', prodType);
    await page.click('.variations_tab a').catch(() => {});
    await page.waitForTimeout(1000);
    const variations = await page.$$eval('.woocommerce_variation', els => {
      return els.map(el => {
        const header = el.querySelector('h3')?.textContent?.trim() || '';
        return header.substring(0, 80);
      });
    }).catch(() => []);
    console.log('  Variations:', JSON.stringify(variations));
  }

  await browser.close();
})();
