import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

// Get fresh nonce for cache clear
await page.goto('https://tzilum1.mrvsn.com/wp-admin/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const clearHref = await page.$eval('a[href*="wpb_clear_cache"]', a => a.href).catch(() => null);
console.log('Clear cache URL:', clearHref);

if (clearHref) {
  await page.goto(clearHref, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('Cache clear navigated to:', page.url());
  await page.screenshot({ path: 'reports/2026-04-15/tzilum1-double-cart/purge-done.png', fullPage: true });
}

// Verify: fetch product page anonymously
const anonCtx = await browser.newContext();
const anonPage = await anonCtx.newPage();
await anonPage.goto('https://tzilum1.mrvsn.com/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/', { waitUntil: 'domcontentloaded' });
const html = await anonPage.content();
console.log(`Anonymous view has cancelFailsafe: ${html.includes('cancelFailsafe')}`);
console.log(`Anonymous view has old unprotected requestSubmit only: ${html.includes('requestSubmit') && !html.includes('cancelFailsafe')}`);

await browser.close();
