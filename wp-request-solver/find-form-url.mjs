import { chromium } from 'playwright';
import fs from 'fs';

const SITE = 'https://tzilum1.mrvsn.com';
const USER = 'mv-dev';
const PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const OUT = 'C:/tmp/tz';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'he-IL', viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await page.goto(SITE + '/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', USER);
await page.fill('#user_pass', PASS);
await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('#wp-submit')]);

await page.goto(SITE + '/wp-admin/', { waitUntil: 'networkidle' });

// Find the "תוספי מוצרים" (Product Add-ons) menu link
const links = await page.$$eval('a', as =>
  as.map(a => ({ text: a.innerText.trim(), href: a.href }))
    .filter(l => l.href.includes('wp-admin/admin.php?page=') && l.text)
);
fs.writeFileSync(OUT + '/admin_links.json', JSON.stringify(links, null, 2));
const wcpaLinks = links.filter(l => /wcpa|wccpf|product[-_]?addon|addon|forms/i.test(l.href + ' ' + l.text));
console.log('wcpa-related menu items:');
for (const l of wcpaLinks.slice(0, 20)) console.log(`  ${l.text}  →  ${l.href.replace(SITE,'')}`);

await browser.close();
