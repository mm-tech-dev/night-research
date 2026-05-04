import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const PRODUCT = SITE + '/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/';
const OUT = 'C:/tmp/tz';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();

const cartReqs = [];
page.on('response', async r => {
  const u = r.url();
  if (u.includes('add_to_cart') || u.includes('xoo_wsc')) {
    let body = ''; try { body = (await r.text()).slice(0, 2000); } catch {}
    cartReqs.push({ status: r.status(), url: u.replace(SITE, ''), body });
  }
});

// login as mv-dev to bypass coming-soon mode
await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

await page.goto(PRODUCT, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

// Fill ALL number inputs with 2 and select first non-empty option for ALL selects
console.log('filling all WCPA fields...');
const filled = await page.evaluate(() => {
  const out = { numbers: 0, selects: 0, radios: 0 };
  const setVal = (el, v) => {
    const setter = el.tagName === 'SELECT'
      ? Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  // number inputs in WCPA
  document.querySelectorAll('.wcpa_form_outer input[type="number"], input.wcpa_field[type="number"]').forEach(el => {
    setVal(el, 2); out.numbers++;
  });
  // selects
  document.querySelectorAll('.wcpa_form_outer select, select.wcpa_field').forEach(sel => {
    const opt = [...sel.options].find(o => o.value && o.value !== '0') || sel.options[1];
    if (opt) { setVal(sel, opt.value); out.selects++; }
  });
  // radios
  const radioGroups = new Set();
  document.querySelectorAll('.wcpa_form_outer input[type="radio"]').forEach(r => radioGroups.add(r.name));
  radioGroups.forEach(name => {
    const first = document.querySelector(`input[type="radio"][name="${name}"]`);
    if (first) { first.checked = true; first.dispatchEvent(new Event('change', { bubbles: true })); out.radios++; }
  });
  return out;
});
console.log('  filled:', filled);
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT + '/full_filled.png', fullPage: false });

// Click add to cart
console.log('clicking add-to-cart...');
const btn = await page.$('button.single_add_to_cart_button, button[name="add-to-cart"]');
if (btn) {
  await btn.scrollIntoViewIfNeeded();
  await btn.click({ force: true }).catch(e => console.log('click err:', e.message));
}
await page.waitForTimeout(7000);
await page.screenshot({ path: OUT + '/full_after.png', fullPage: false });

console.log('\n=== CART REQUESTS ===');
console.log('total:', cartReqs.length);
for (const r of cartReqs) {
  console.log(`  ${r.status}  ${r.url}`);
  if (r.status >= 400 || r.url.includes('add_to_cart')) console.log(`    body: ${r.body.slice(0,300).replace(/\s+/g,' ')}`);
}

fs.writeFileSync(OUT + '/full_cart_reqs.json', JSON.stringify(cartReqs, null, 2));
await browser.close();
