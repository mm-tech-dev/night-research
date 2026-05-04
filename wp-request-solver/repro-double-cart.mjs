// Reproduce double-add-to-cart bug on tzilum1.mrvsn.com
// Product: שימשונית (ID 3627)
// https://tzilum1.mrvsn.com/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/

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

const addToCartCalls = [];
const consoleLogs = [];

page.on('request', req => {
  const url = req.url();
  if (url.includes('add-to-cart') || url.includes('wc-ajax=add_to_cart') || url.includes('add_to_cart')) {
    addToCartCalls.push({
      time: new Date().toISOString(),
      method: req.method(),
      url,
      postData: req.postData()?.slice(0, 500)
    });
  }
});
page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', err => consoleLogs.push(`[pageerror] ${err.message}`));

// 1. Login
console.log('Logging in...');
await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', WP_USER);
await page.fill('#user_pass', WP_PASS);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

// 2. Empty cart first
console.log('Emptying cart...');
await page.goto('https://tzilum1.mrvsn.com/cart/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const removeLinks = await page.$$('a.remove');
for (const l of removeLinks) { try { await l.click(); await page.waitForTimeout(500); } catch(e){} }

// 3. Go to product page
console.log('Navigating to product...');
await page.goto(PRODUCT_URL, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${REPORT_DIR}/01-product-page.png`, fullPage: false });

// 4. Inspect handlers on the button
const handlerInfo = await page.evaluate(() => {
  const btn = document.querySelector('button.single_add_to_cart_button, button[name="add-to-cart"]');
  const form = document.querySelector('form.cart');
  return {
    buttonExists: !!btn,
    buttonHTML: btn ? btn.outerHTML.slice(0, 300) : null,
    formAction: form ? form.action : null,
    formClasses: form ? form.className : null,
    wcpaFormExists: !!document.querySelector('.wcpa_form_outer'),
    sideCartExists: !!document.querySelector('.xoo-wsc-container, [class*=xoo-wsc]'),
    inlineScriptCount: document.querySelectorAll('script:not([src])').length
  };
});
fs.writeFileSync(`${REPORT_DIR}/02-handler-info.json`, JSON.stringify(handlerInfo, null, 2));
console.log('Handler info:', handlerInfo);

// 5. Ensure qty is 1 and click Add to Cart ONCE
console.log('Setting qty=1 and clicking Add to Cart ONCE...');
const qtyInput = await page.$('input.qty, input[name="quantity"]');
if (qtyInput) { await qtyInput.fill('1'); }

addToCartCalls.length = 0; // reset right before click
const clickTime = Date.now();
await page.click('button.single_add_to_cart_button, button[name="add-to-cart"]');

// Wait 5s to catch any delayed submits (the suspected 2s setTimeout)
await page.waitForTimeout(6000);
await page.screenshot({ path: `${REPORT_DIR}/03-after-click.png`, fullPage: false });

// 6. Check cart contents
console.log('Checking cart...');
const cartData = await page.evaluate(async () => {
  const res = await fetch('/?wc-ajax=get_refreshed_fragments', { credentials: 'same-origin' });
  const data = await res.json();
  return data;
}).catch(e => ({ error: e.message }));

await page.goto('https://tzilum1.mrvsn.com/cart/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${REPORT_DIR}/04-cart-page.png`, fullPage: true });

const cartItems = await page.evaluate(() => {
  const rows = document.querySelectorAll('.woocommerce-cart-form tr.cart_item, tr.woocommerce-cart-form__cart-item');
  return Array.from(rows).map(r => ({
    name: r.querySelector('.product-name')?.textContent?.trim(),
    qty: r.querySelector('input.qty')?.value || r.querySelector('.product-quantity')?.textContent?.trim()
  }));
});

const result = {
  addToCartCallCount: addToCartCalls.length,
  addToCartCalls,
  cartItems,
  handlerInfo,
  consoleLogs: consoleLogs.slice(-30),
  elapsedMs: Date.now() - clickTime
};
fs.writeFileSync(`${REPORT_DIR}/result.json`, JSON.stringify(result, null, 2));
console.log('\n=== RESULT ===');
console.log(`AJAX add_to_cart calls: ${addToCartCalls.length}`);
console.log('Cart items:', cartItems);
console.log('Full report:', `${REPORT_DIR}/result.json`);

await browser.close();
