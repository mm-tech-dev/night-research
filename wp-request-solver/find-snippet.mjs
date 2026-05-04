// Find the snippet that contains the WCPA double-submit code
import { chromium } from 'playwright';
import fs from 'fs';

const REPORT_DIR = 'reports/2026-04-15/tzilum1-double-cart';
const WP_USER = 'mv-dev';
const WP_PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';

fs.mkdirSync(REPORT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('Logging in...');
await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', WP_USER);
await page.fill('#user_pass', WP_PASS);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

// 1. Check WPCode snippets list
console.log('\n== WPCode snippets ==');
await page.goto('https://tzilum1.mrvsn.com/wp-admin/admin.php?page=wpcode', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${REPORT_DIR}/admin-wpcode.png`, fullPage: true });
const wpcodeUrl = page.url();
console.log('WPCode page URL:', wpcodeUrl);

// 2. Check Insert Headers and Footers
console.log('\n== IHAF settings ==');
await page.goto('https://tzilum1.mrvsn.com/wp-admin/options-general.php?page=WP_Headers_And_Footers', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
const ihafUrl = page.url();
console.log('IHAF page URL:', ihafUrl);
await page.screenshot({ path: `${REPORT_DIR}/admin-ihaf.png`, fullPage: true });

// Try to extract textarea contents
const ihafData = await page.evaluate(() => {
  const textareas = Array.from(document.querySelectorAll('textarea'));
  return textareas.map(t => ({
    name: t.name || t.id,
    valueLength: t.value.length,
    containsWcpa: t.value.includes('WCPA') || t.value.includes('wcpa_form_outer'),
    containsRequestSubmit: t.value.includes('requestSubmit'),
    preview: t.value.slice(0, 500)
  }));
});
console.log('IHAF textareas:', JSON.stringify(ihafData, null, 2));
fs.writeFileSync(`${REPORT_DIR}/ihaf-textareas.json`, JSON.stringify(ihafData, null, 2));

// 3. Check Elementor Custom Code
console.log('\n== Elementor Custom Code ==');
await page.goto('https://tzilum1.mrvsn.com/wp-admin/edit.php?post_type=elementor_snippet', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${REPORT_DIR}/admin-elementor-snippets.png`, fullPage: true });

// 4. Also check morevision snippet types (custom plugin)
console.log('\n== listing all admin menu entries for snippets ==');
await page.goto('https://tzilum1.mrvsn.com/wp-admin/', { waitUntil: 'domcontentloaded' });
const menuItems = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('#adminmenu a')).map(a => ({
    text: a.textContent.trim().slice(0, 60),
    href: a.getAttribute('href')
  })).filter(x => /cod|snip|ihaf|header|footer|custom/i.test(x.text));
});
console.log('Snippet-related menu items:', menuItems);
fs.writeFileSync(`${REPORT_DIR}/admin-menu.json`, JSON.stringify(menuItems, null, 2));

await browser.close();
