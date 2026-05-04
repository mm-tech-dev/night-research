// Dump all WPCode snippets and find the one with requestSubmit
import { chromium } from 'playwright';
import fs from 'fs';

const REPORT_DIR = 'reports/2026-04-15/tzilum1-double-cart';
const WP_USER = 'mv-dev';
const WP_PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('Logging in...');
await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', WP_USER);
await page.fill('#user_pass', WP_PASS);
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

// Get ALL snippet IDs from the listing (may need pagination)
const allSnippets = [];
let pageNum = 1;
while (true) {
  console.log(`Loading snippet list page ${pageNum}...`);
  await page.goto(`https://tzilum1.mrvsn.com/wp-admin/admin.php?page=wpcode&paged=${pageNum}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const items = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tr[id^="post-"]'));
    return rows.map(r => {
      const id = r.id.replace('post-', '');
      const titleA = r.querySelector('.row-title, a.row-title');
      const editA = r.querySelector('a[href*="wpcode-snippet-manager"]');
      return {
        id,
        title: titleA?.textContent?.trim() || '',
        editUrl: editA?.getAttribute('href') || ''
      };
    });
  });
  if (items.length === 0) break;
  allSnippets.push(...items);
  // Check if next page exists
  const hasNext = await page.$('.next-page:not(.disabled)');
  if (!hasNext || items.length < 20) break;
  pageNum++;
  if (pageNum > 10) break;
}

console.log(`Found ${allSnippets.length} snippets`);
fs.writeFileSync(`${REPORT_DIR}/snippet-list.json`, JSON.stringify(allSnippets, null, 2));

// Filter snippets likely related to cart/WCPA
const candidates = allSnippets.filter(s =>
  /wcpa|cart|sale|add[- ]to|buy|quick|checkout/i.test(s.title)
);
console.log(`\nCandidates matching cart/wcpa: ${candidates.length}`);
candidates.forEach(c => console.log(`  - ${c.id}: ${c.title}`));

// Open each candidate and extract code
const snippetContents = [];
for (const c of candidates) {
  try {
    const url = c.editUrl.startsWith('http') ? c.editUrl : `https://tzilum1.mrvsn.com/wp-admin/${c.editUrl}`;
    console.log(`Fetching: ${c.id} - ${c.title}`);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const code = await page.evaluate(() => {
      // WPCode uses CodeMirror - try multiple selectors
      const cm = document.querySelector('.CodeMirror');
      if (cm && cm.CodeMirror) return cm.CodeMirror.getValue();
      // Fallback: textarea
      const ta = document.querySelector('#wpcode_snippet_code, textarea[name="wpcode_snippet_code"], textarea[name="content"]');
      return ta?.value || '';
    });
    const title = await page.evaluate(() => document.querySelector('#wpcode-snippet-title, input[name="wpcode_snippet_title"], #title')?.value || '');
    const status = await page.evaluate(() => {
      const toggle = document.querySelector('.wpcode-snippet-status-toggle input, input[name="active"]');
      return toggle ? toggle.checked : null;
    });
    snippetContents.push({
      id: c.id,
      title: title || c.title,
      status,
      length: code.length,
      hasRequestSubmit: code.includes('requestSubmit'),
      hasWcpaHook: code.includes('wcpa_form_outer') || code.includes('wcpa_data'),
      hasDispatchSubmit: code.includes("dispatchEvent(new Event('submit'"),
      code
    });
  } catch(e) {
    console.log(`  ERROR on ${c.id}: ${e.message}`);
  }
}

fs.writeFileSync(`${REPORT_DIR}/snippet-contents.json`, JSON.stringify(snippetContents, null, 2));

console.log('\n=== SMOKING GUN SEARCH ===');
const offenders = snippetContents.filter(s => s.hasRequestSubmit || s.hasDispatchSubmit);
offenders.forEach(o => {
  console.log(`\n*** ID ${o.id}: ${o.title} ***`);
  console.log(`  status: ${o.status}, length: ${o.length}`);
  console.log(`  hasRequestSubmit: ${o.hasRequestSubmit}`);
  console.log(`  hasDispatchSubmit: ${o.hasDispatchSubmit}`);
  console.log(`  hasWcpaHook: ${o.hasWcpaHook}`);
});

await browser.close();
