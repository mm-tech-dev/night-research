// Reproduce double-add-to-cart bug - v2 with form submission tracking
import { chromium } from 'playwright';
import fs from 'fs';

const REPORT_DIR = 'reports/2026-04-15/tzilum1-double-cart';
const PRODUCT_URL = 'https://tzilum1.mrvsn.com/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/';
const WP_USER = 'mv-dev';
const WP_PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';

fs.mkdirSync(REPORT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const allRequests = [];
const consoleLogs = [];

page.on('request', req => {
  const url = req.url();
  // Track POST requests + any add-to-cart related URL
  if (req.method() === 'POST' || url.includes('add-to-cart') || url.includes('wc-ajax')) {
    allRequests.push({
      time: new Date().toISOString(),
      method: req.method(),
      url,
      postData: req.postData()?.slice(0, 600),
      resourceType: req.resourceType()
    });
  }
});
page.on('console', msg => { if (msg.type() !== 'log') consoleLogs.push(`[${msg.type()}] ${msg.text().slice(0,200)}`); });
page.on('pageerror', err => consoleLogs.push(`[pageerror] ${err.message}`));

console.log('Logging in...');
await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', WP_USER);
await page.fill('#user_pass', WP_PASS);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

// Empty cart
console.log('Emptying cart...');
await page.goto('https://tzilum1.mrvsn.com/cart/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
for (const l of await page.$$('a.remove')) { try { await l.click(); await page.waitForTimeout(500); } catch(e){} }
await page.waitForTimeout(1500);

// Go to product
console.log('Navigating to product...');
await page.goto(PRODUCT_URL, { waitUntil: 'networkidle' });

// Fill minimum required WCPA fields if they exist (for valid submission)
console.log('Filling any required WCPA fields...');
await page.evaluate(() => {
  // Select first option of every required select dropdown
  document.querySelectorAll('.wcpa_form_item select.wcpa_field').forEach(sel => {
    if (sel.options.length > 1) {
      sel.selectedIndex = 1;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  // Check first option of each required radio group
  const radioGroups = {};
  document.querySelectorAll('.wcpa_form_item input[type="radio"]').forEach(r => {
    radioGroups[r.name] = radioGroups[r.name] || [];
    radioGroups[r.name].push(r);
  });
  for (const name in radioGroups) {
    if (radioGroups[name].length) {
      radioGroups[name][0].checked = true;
      radioGroups[name][0].dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${REPORT_DIR}/v2-before-click.png`, fullPage: true });

// CLEAR tracker and CLICK
allRequests.length = 0;
console.log('>>> Clicking Add to Cart ONCE at', new Date().toISOString());
const clickStart = Date.now();

// Click + wait for navigation OR nothing (could be form submit)
await Promise.race([
  page.click('button.single_add_to_cart_button, button[name="add-to-cart"]'),
  page.waitForTimeout(1000)
]);

// Wait long enough to catch the 2s delayed fallback submit
await page.waitForTimeout(8000);
await page.screenshot({ path: `${REPORT_DIR}/v2-after-click.png`, fullPage: false });

// Count POST to product URL or ajax add-to-cart
const productPosts = allRequests.filter(r =>
  r.method === 'POST' && (r.url.includes('/product/') || r.url.includes('add-to-cart') || r.url.includes('wc-ajax=add_to_cart'))
);
const postDataHasAddToCart = allRequests.filter(r =>
  r.postData && r.postData.includes('add-to-cart')
);

// Check cart
console.log('Checking cart...');
await page.goto('https://tzilum1.mrvsn.com/cart/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${REPORT_DIR}/v2-cart.png`, fullPage: true });

const cartItems = await page.evaluate(() => {
  const results = [];
  // Try multiple selectors
  document.querySelectorAll('tr.woocommerce-cart-form__cart-item, tr.cart_item').forEach(r => {
    results.push({
      name: r.querySelector('.product-name a, .product-name')?.textContent?.trim().slice(0, 80),
      qty: r.querySelector('input.qty')?.value || r.querySelector('.product-quantity')?.textContent?.trim(),
      subtotal: r.querySelector('.product-subtotal')?.textContent?.trim()
    });
  });
  return results;
});

const result = {
  clickTime: new Date(clickStart).toISOString(),
  elapsedMs: Date.now() - clickStart,
  totalTrackedRequests: allRequests.length,
  productPostsCount: productPosts.length,
  postsWithAddToCart: postDataHasAddToCart.length,
  productPosts: productPosts.map(p => ({ time: p.time, method: p.method, url: p.url, postData: p.postData })),
  postsWithAddToCartDetails: postDataHasAddToCart.map(p => ({ time: p.time, url: p.url, postData: p.postData })),
  allRequests,
  cartItems,
  consoleLogs: consoleLogs.slice(-15)
};
fs.writeFileSync(`${REPORT_DIR}/v2-result.json`, JSON.stringify(result, null, 2));

console.log('\n=== RESULT ===');
console.log('Product POSTs:', productPosts.length);
console.log('POSTs containing add-to-cart in body:', postDataHasAddToCart.length);
console.log('Cart items:', JSON.stringify(cartItems, null, 2));

await browser.close();
