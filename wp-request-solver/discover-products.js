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
  console.log('Logged in successfully');

  // Check existing attributes
  await page.goto('https://greentouch-plants.dev2.mrvsn.com/wp-admin/edit.php?post_type=product&page=product_attributes');
  await page.waitForSelector('.wp-list-table', { timeout: 10000 }).catch(() => {});
  const attrs = await page.$$eval('.wp-list-table tbody tr .row-title', els => els.map(el => el.textContent.trim()));
  console.log('Existing attributes:', JSON.stringify(attrs));

  // Get all products
  await page.goto('https://greentouch-plants.dev2.mrvsn.com/wp-admin/edit.php?post_type=product&posts_per_page=100');
  await page.waitForSelector('.wp-list-table', { timeout: 10000 });

  const products = await page.$$eval('.wp-list-table tbody tr', rows => {
    return rows.map(row => {
      const titleEl = row.querySelector('.row-title');
      const typeEl = row.querySelector('.product_type');
      const priceEl = row.querySelector('.column-price');
      const editLink = titleEl ? titleEl.getAttribute('href') : '';
      const idMatch = editLink ? editLink.match(/post=(\d+)/) : null;
      return {
        id: idMatch ? idMatch[1] : '',
        title: titleEl ? titleEl.textContent.trim() : '',
        type: typeEl ? typeEl.textContent.trim() : '',
        price: priceEl ? priceEl.textContent.trim().replace(/\s+/g, ' ') : ''
      };
    });
  });

  console.log('\n=== ALL PRODUCTS ===');
  products.forEach(p => {
    console.log(`ID: ${p.id} | Title: ${p.title} | Type: ${p.type} | Price: ${p.price}`);
  });

  // Search for specific products
  const searchTerms = ['דרצנה', 'ציפור גן עדן', 'פיקוס', 'בונסאי', 'קקטוס', 'אופורביה'];
  for (const term of searchTerms) {
    await page.goto(`https://greentouch-plants.dev2.mrvsn.com/wp-admin/edit.php?post_type=product&s=${encodeURIComponent(term)}`);
    await page.waitForSelector('.wp-list-table', { timeout: 10000 }).catch(() => {});
    const results = await page.$$eval('.wp-list-table tbody tr .row-title', els =>
      els.map(el => el.textContent.trim())
    ).catch(() => []);
    console.log(`\nSearch "${term}":`, JSON.stringify(results));
  }

  await browser.close();
})();
