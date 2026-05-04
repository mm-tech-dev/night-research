import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const OUT = 'C:/tmp/tz';
const FORM_ID = 9602;
const FORM_TITLE = 'שימשונית';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1700, height: 1100 } });
const page = await ctx.newPage();

const captured = [];
page.on('request', req => {
  if (['POST','PUT','PATCH'].includes(req.method()) && /wcpa|admin-ajax/.test(req.url())) {
    captured.push({ method: req.method(), url: req.url(), postData: req.postData()?.slice(0, 100000) || null });
  }
});

await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

await page.goto(SITE + '/wp-admin/admin.php?page=wcpa-admin-ui', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

// Find the row for "שימשונית" (FORM_ID 9602) and click its title
console.log('searching row for', FORM_TITLE);
// React table rows — try multiple strategies
const titleEl = await page.evaluateHandle((title) => {
  // find element whose text exactly equals the title
  const candidates = [...document.querySelectorAll('a, span, div, td')];
  return candidates.find(el => el.innerText && el.innerText.trim() === title) || null;
}, FORM_TITLE);

let clicked = false;
if (titleEl) {
  const tag = await titleEl.evaluate(el => el?.tagName);
  console.log('  found element tag:', tag);
  try {
    await titleEl.scrollIntoViewIfNeeded();
    await titleEl.click();
    clicked = true;
  } catch (e) { console.log('  click err:', e.message); }
}

// fallback: click via locator on first occurrence
if (!clicked) {
  try { await page.locator(`text=${FORM_TITLE}`).first().click({ timeout: 5000 }); clicked = true; }
  catch (e) { console.log('locator click err:', e.message); }
}

await page.waitForTimeout(4500);
await page.screenshot({ path: OUT + '/edit_form_step1.png', fullPage: true });
console.log('after click URL:', page.url());

// dump DOM info — find textarea/inputs with "?" formula content
const formulaInputs = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input, textarea')];
  return inputs.filter(i => i.value && i.value.includes('?') && i.value.includes(':'))
    .map(i => ({ tag: i.tagName, type: i.type, name: i.name, id: i.id, val: i.value.slice(0, 200) }));
});
console.log('formula-bearing inputs found:', formulaInputs.length);
fs.writeFileSync(OUT + '/formula_inputs.json', JSON.stringify(formulaInputs, null, 2));

fs.writeFileSync(OUT + '/captured_during_edit.json', JSON.stringify(captured, null, 2));
await browser.close();
console.log('done');
