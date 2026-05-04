import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const USER = 'mv-dev';
const PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const OUT = 'C:/tmp/tz';
const FORM_ID = 9602;

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1700, height: 1100 } });
const page = await ctx.newPage();

const captured = [];
page.on('request', req => {
  if (['POST','PUT','PATCH'].includes(req.method()) && req.url().includes('wcpa')) {
    captured.push({ method: req.method(), url: req.url(), postData: req.postData()?.slice(0, 100000) || null });
  }
});

await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', USER);
await page.fill('#user_pass', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

await page.goto(SITE + '/wp-admin/admin.php?page=wcpa-admin-ui', { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

// dump all anchors with href containing edit/form
const allLinks = await page.$$eval('a', as => as.map(a => ({ text: a.innerText.trim().slice(0,40), href: a.href })).filter(l => l.href && (l.href.includes('edit') || l.href.includes('form') || /\d{4,5}/.test(l.href))));
fs.writeFileSync(OUT + '/list_links.json', JSON.stringify(allLinks.slice(0, 200), null, 2));
console.log('relevant links sample:', allLinks.slice(0, 12).map(l=>l.text+' → '+l.href.replace(SITE,'')).join('\n  '));

// also dump buttons with data-id attributes (React table sometimes uses those)
const dataIds = await page.$$eval('[data-id], [data-form-id]', els => els.map(e=>({tag:e.tagName, id:e.getAttribute('data-id')||e.getAttribute('data-form-id'), text:e.innerText.slice(0,40)})));
console.log('data-id elements:', dataIds.length);
fs.writeFileSync(OUT + '/data_ids.json', JSON.stringify(dataIds.slice(0,30), null, 2));

// strategy: search the page for the form ID 9602 in any link or attribute
const found9602 = await page.evaluate((id) => {
  const matches = [];
  document.querySelectorAll('*').forEach(el => {
    const txt = el.innerText || '';
    const attrs = [...el.attributes].map(a => a.name+'='+a.value).join(' ');
    if (attrs.includes(String(id))) matches.push({tag:el.tagName, attrs:attrs.slice(0,300)});
  });
  return matches.slice(0, 20);
}, FORM_ID);
console.log('elements with attrs containing 9602:', found9602.length);
fs.writeFileSync(OUT + '/found9602.json', JSON.stringify(found9602, null, 2));

await browser.close();
