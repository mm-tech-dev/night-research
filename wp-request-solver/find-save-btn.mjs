import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

await page.goto('https://tzilum1.mrvsn.com/wp-admin/admin.php?page=wpcode-snippet-manager&snippet_id=10430', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

const buttons = await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button, input[type="submit"], a.button'));
  return btns.filter(b => b.offsetParent !== null).map(b => ({
    tag: b.tagName,
    id: b.id,
    class: b.className,
    name: b.name || '',
    type: b.type || '',
    text: (b.textContent || b.value || '').trim().slice(0, 60),
    href: b.href || ''
  }));
});
console.log(JSON.stringify(buttons, null, 2));

await browser.close();
