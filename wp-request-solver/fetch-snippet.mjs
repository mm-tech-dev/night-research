import { chromium } from 'playwright';
import fs from 'fs';

const REPORT_DIR = 'reports/2026-04-15/tzilum1-double-cart';
const SNIPPETS_TO_FETCH = [10430, 10431, 10465, 10462];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

const results = [];
for (const id of SNIPPETS_TO_FETCH) {
  console.log(`\nFetching snippet ${id}...`);
  await page.goto(`https://tzilum1.mrvsn.com/wp-admin/admin.php?page=wpcode-snippet-manager&snippet_id=${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const data = await page.evaluate(() => {
    // Title
    const title = document.querySelector('#wpcode_snippet_title, input[name="wpcode_snippet_title"]')?.value || '';
    // Code type
    const codeType = document.querySelector('#wpcode_snippet_type, select[name="wpcode_snippet_type"]')?.value || '';
    // Active/Status
    const statusToggle = document.querySelector('#wpcode_active, input[name="wpcode_active"]');
    const status = statusToggle ? statusToggle.checked : null;
    // Code — try CodeMirror first
    let code = '';
    const cmWrappers = document.querySelectorAll('.CodeMirror');
    for (const w of cmWrappers) {
      if (w.CodeMirror) {
        const val = w.CodeMirror.getValue();
        if (val && val.length > code.length) code = val;
      }
    }
    if (!code) {
      const ta = document.querySelector('#wpcode_snippet_code, textarea[name="wpcode_snippet_code"]');
      if (ta) code = ta.value;
    }
    // Location/trigger
    const location = document.querySelector('#wpcode_auto_insert_location, select[name="wpcode_auto_insert_location"]')?.value || '';
    return { title, codeType, status, code, codeLength: code.length, location };
  });

  results.push({ id, ...data });
  console.log(`  ${data.title} [${data.codeType}] active=${data.status} len=${data.codeLength}`);
  if (data.code.includes('requestSubmit') || data.code.includes("dispatchEvent(new Event('submit'")) {
    console.log('  *** CONTAINS requestSubmit/dispatchSubmit ***');
  }
  if (data.code.includes('wcpa_form_outer') || data.code.includes('WCPA React')) {
    console.log('  *** CONTAINS WCPA hook ***');
  }
}

fs.writeFileSync(`${REPORT_DIR}/snippet-sources.json`, JSON.stringify(results, null, 2));
// Also dump each to individual file for easy reading
for (const r of results) {
  const safe = r.title.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 60);
  fs.writeFileSync(`${REPORT_DIR}/snippet-${r.id}-${safe}.txt`, r.code);
}

await browser.close();
console.log('\nDone.');
