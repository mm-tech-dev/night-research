import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const PRODUCT = SITE + '/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/';
const OUT = 'C:/tmp/tz';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();

const cartReqs = [];
page.on('response', async r => {
  const u = r.url();
  if (u.includes('xoo_wsc_add_to_cart') || u.includes('add_to_cart') || u.includes('wc-ajax')) {
    let body = ''; try { body = (await r.text()).slice(0, 800); } catch {}
    cartReqs.push({ status: r.status(), url: u.replace(SITE, ''), body });
  }
});

const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type()==='error') errors.push('console: ' + m.text().slice(0, 300)); });

console.log('1) load product page (anonymous)...');
await page.goto(PRODUCT, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
await page.screenshot({ path: OUT + '/verify_product.png', fullPage: false });

console.log('2) fill required WCPA fields (length=1, width=1)...');
// number fields named like number_5536767551 (length) and number_5536786432 (width)
await page.evaluate(() => {
  const setNum = (name, val) => {
    const el = document.querySelector(`input[name="${name}"], input[name*="${name}"]`);
    if (el) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, String(val));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  setNum('number_5536767551', 2);
  setNum('number_5536786432', 3);
});
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/verify_filled.png', fullPage: false });

console.log('3) click add to cart...');
const btn = await page.$('button.single_add_to_cart_button, button[name="add-to-cart"]');
if (btn) {
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true }).catch(e => console.log('  click err:', e.message));
}
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT + '/verify_after.png', fullPage: false });

fs.writeFileSync(OUT + '/cart_reqs.json', JSON.stringify(cartReqs, null, 2));
fs.writeFileSync(OUT + '/page_errors.txt', errors.join('\n'));

console.log('\n=== RESULTS ===');
console.log('cart-related requests:', cartReqs.length);
for (const r of cartReqs) console.log(`  ${r.status}  ${r.url}  body[0..120]:${r.body.slice(0,120).replace(/\n/g,' ')}`);
console.log('\npage errors:', errors.length);
for (const e of errors.slice(0, 8)) console.log('  ' + e);

await browser.close();
