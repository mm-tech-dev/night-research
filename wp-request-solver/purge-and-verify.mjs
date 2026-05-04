// Purge EZCache and verify double-add-to-cart is fixed
import { chromium } from 'playwright';
import fs from 'fs';

const REPORT_DIR = 'reports/2026-04-15/tzilum1-double-cart';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Login
await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

// Look for cache purge options
console.log('Looking for EZCache purge...');
await page.goto('https://tzilum1.mrvsn.com/wp-admin/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);

const cacheLink = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('#wpadminbar a, #adminmenu a'));
  return links.filter(a => /ezcache|cache|clear|purge/i.test(a.textContent + ' ' + (a.href || ''))).map(a => ({
    text: a.textContent.trim().slice(0, 80),
    href: a.href
  }));
});
console.log('Cache-related links:', cacheLink);

// Try clicking EZCache purge in admin bar if present
const adminBarPurge = await page.$('#wp-admin-bar-ezcache a, a[href*="ezcache"]');
if (adminBarPurge) {
  console.log('Clicking EZCache link...');
  await adminBarPurge.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${REPORT_DIR}/purge-01-ezcache-page.png`, fullPage: true });

  // Look for purge-all button
  const purgeBtn = await page.$('button[name*="purge"], input[name*="purge"], a[href*="purge"], button:has-text("Clear"), button:has-text("Purge")');
  if (purgeBtn) {
    try { await purgeBtn.click(); await page.waitForTimeout(3000); } catch(e) {}
  }
  // Also look for any button/link with text Clear/Purge/Empty/Flush via evaluate
  await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
    for (const el of els) {
      const t = (el.textContent || el.value || '').trim();
      if (/clear|purge|empty|flush|ריק|נקה/i.test(t) && el.offsetParent !== null) {
        el.click();
        return t;
      }
    }
  });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${REPORT_DIR}/purge-02-after.png`, fullPage: true });
}

// Verify fix is live on product page (fresh fetch, no cache)
console.log('\n=== Verifying fix on product page (fresh) ===');
const freshCtx = await browser.newContext();
const freshPage = await freshCtx.newPage();
await freshPage.goto('https://tzilum1.mrvsn.com/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
const content = await freshPage.content();
const hasFix = content.includes('cancelFailsafe');
const hasBug = content.includes('requestSubmit') && !hasFix;
console.log(`New code present (cancelFailsafe): ${hasFix}`);
console.log(`Bug pattern present: ${hasBug}`);
await freshCtx.close();

// ===== REPRODUCTION TEST =====
console.log('\n=== Reproducing double-add (post-fix) ===');
const testCtx = await browser.newContext();
const testPage = await testCtx.newPage();

// Login
await testPage.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await testPage.fill('#user_login', 'mv-dev');
await testPage.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await testPage.click('#wp-submit');
await testPage.waitForLoadState('networkidle', { timeout: 30000 });

// Empty cart
console.log('Emptying cart...');
await testPage.goto('https://tzilum1.mrvsn.com/cart/', { waitUntil: 'domcontentloaded' });
await testPage.waitForTimeout(1500);
for (const l of await testPage.$$('a.remove')) { try { await l.click(); await testPage.waitForTimeout(500); } catch(e){} }

// Track add-to-cart POSTs
const addRequests = [];
testPage.on('request', req => {
  const url = req.url();
  const post = req.postData() || '';
  if (req.method() === 'POST' && (url.includes('wc-ajax=add_to_cart') || post.includes('add-to-cart=3627'))) {
    addRequests.push({ time: new Date().toISOString(), url, postData: post.slice(0, 300) });
  }
});

console.log('Navigating to product...');
await testPage.goto('https://tzilum1.mrvsn.com/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/', { waitUntil: 'networkidle' });

// Fill any required fields
await testPage.evaluate(() => {
  document.querySelectorAll('.wcpa_form_item select.wcpa_field').forEach(sel => {
    if (sel.options.length > 1) { sel.selectedIndex = 1; sel.dispatchEvent(new Event('change', {bubbles:true})); }
  });
});
await testPage.waitForTimeout(1500);

addRequests.length = 0;
console.log('>>> Clicking Add to Cart ONCE');
await testPage.click('button.single_add_to_cart_button, button[name="add-to-cart"]', { timeout: 10000 });

// Wait long enough to catch the 2s failsafe (should NOT fire now)
await testPage.waitForTimeout(8000);
await testPage.screenshot({ path: `${REPORT_DIR}/verify-after-click.png` });

// Check cart via fragments (logged in)
await testPage.goto('https://tzilum1.mrvsn.com/cart/', { waitUntil: 'domcontentloaded' });
await testPage.waitForTimeout(2500);
await testPage.screenshot({ path: `${REPORT_DIR}/verify-cart.png`, fullPage: true });

const cartItems = await testPage.evaluate(() => {
  const rows = document.querySelectorAll('tr.woocommerce-cart-form__cart-item, tr.cart_item');
  return Array.from(rows).map(r => ({
    name: r.querySelector('.product-name a, .product-name')?.textContent?.trim().slice(0,80),
    qty: r.querySelector('input.qty')?.value || r.querySelector('.product-quantity')?.textContent?.trim()
  }));
});

const result = {
  addRequestCount: addRequests.length,
  addRequests,
  cartItems,
  fixLive: hasFix,
  bugStillPresent: hasBug
};
fs.writeFileSync(`${REPORT_DIR}/verify-result.json`, JSON.stringify(result, null, 2));

console.log('\n======= VERIFICATION =======');
console.log(`Fix live on page: ${hasFix}`);
console.log(`Bug pattern gone: ${!hasBug}`);
console.log(`Add-to-cart POSTs captured: ${addRequests.length}`);
console.log(`Cart contents:`, JSON.stringify(cartItems, null, 2));

await browser.close();
