const { chromium } = require('playwright');
const SITE = 'https://free-lancer.co.il';
const OUT = process.argv[2] || 'myaccount-snapshot.png';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  console.error('Fetching /my-account/ as anonymous visitor...');
  const resp = await page.goto(`${SITE}/my-account/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  console.error(`Status: ${resp.status()}`);
  await page.waitForTimeout(5000);

  await page.screenshot({ path: OUT, fullPage: true });
  console.error(`Screenshot saved: ${OUT}`);

  const loginFormPresent = await page.evaluate(() => {
    const form = document.querySelector('form.woocommerce-form-login, form.login, input[name="username"], #customer_login');
    return {
      found: !!form,
      selector: form?.className || form?.id || null,
      hidden: form ? getComputedStyle(form).display === 'none' || getComputedStyle(form.closest('section,.e-con,.elementor-element')||form).display === 'none' : null
    };
  });
  console.error('Login form detection:', JSON.stringify(loginFormPresent));

  const container = await page.evaluate(() => {
    const el = document.querySelector('.elementor-element-e64c677');
    if (!el) return { found: false };
    const style = getComputedStyle(el);
    return {
      found: true,
      display: style.display,
      visibility: style.visibility,
      hasChildren: el.children.length,
      outerHTML_len: el.outerHTML.length
    };
  });
  console.error('Container e64c677:', JSON.stringify(container));

  await browser.close();
})();
