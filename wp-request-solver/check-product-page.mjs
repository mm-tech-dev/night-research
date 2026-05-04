import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const PRODUCT = SITE + '/product/%d7%a9%d7%99%d7%9e%d7%a9%d7%95%d7%a0%d7%99%d7%aa/';
const OUT = 'C:/tmp/tz';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1400, height: 1100 } });
const page = await ctx.newPage();

await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

await page.goto(PRODUCT, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
await page.screenshot({ path: OUT + '/product_now.png', fullPage: true });

// inspect WCPA presence
const info = await page.evaluate(() => {
  const wcpaOuter = document.querySelector('.wcpa_form_outer');
  const wcpaForm = document.querySelector('.wcpa_form');
  const fields = document.querySelectorAll('.wcpa_field, [class*="wcpa"]');
  const inputs = document.querySelectorAll('.wcpa_form_outer input, .wcpa_form_outer select');
  // look for error messages
  const txt = document.body.innerText.slice(0, 3000);
  return {
    hasOuter: !!wcpaOuter,
    hasForm: !!wcpaForm,
    wcpaElCount: fields.length,
    wcpaInputs: inputs.length,
    outerHTML: wcpaOuter ? wcpaOuter.outerHTML.slice(0, 500) : null,
    pageTitle: document.title,
    hasComingSoon: txt.includes('סליחה') || txt.includes('coming soon'),
  };
});
console.log(JSON.stringify(info, null, 2));

await browser.close();
