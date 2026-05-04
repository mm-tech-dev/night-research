// Apply fix to WPCode snippet 10430 "Fix WCPA Add to Cart"
import { chromium } from 'playwright';
import fs from 'fs';

const REPORT_DIR = 'reports/2026-04-15/tzilum1-double-cart';
const SNIPPET_ID = 10430;
const NEW_CODE = fs.readFileSync(`${REPORT_DIR}/snippet-10430-FIXED.php`, 'utf8');

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

console.log('Logging in...');
await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

console.log(`Opening snippet ${SNIPPET_ID} edit page...`);
await page.goto(`https://tzilum1.mrvsn.com/wp-admin/admin.php?page=wpcode-snippet-manager&snippet_id=${SNIPPET_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${REPORT_DIR}/fix-01-before.png`, fullPage: true });

// Capture current code for backup
const backup = await page.evaluate(() => {
  const cmWrappers = document.querySelectorAll('.CodeMirror');
  let code = '';
  for (const w of cmWrappers) {
    if (w.CodeMirror) {
      const val = w.CodeMirror.getValue();
      if (val.length > code.length) code = val;
    }
  }
  return code;
});
fs.writeFileSync(`${REPORT_DIR}/snippet-10430-BACKUP-before-fix.txt`, backup);
console.log(`Backup saved (${backup.length} chars)`);

// Set the new code into the code CodeMirror (the one with the largest content)
const setResult = await page.evaluate((newCode) => {
  const cmWrappers = document.querySelectorAll('.CodeMirror');
  // Find the one with the most content - that's the code editor (not description/notes)
  let targetCM = null;
  let maxLen = -1;
  for (const w of cmWrappers) {
    if (w.CodeMirror) {
      const len = w.CodeMirror.getValue().length;
      if (len > maxLen) {
        maxLen = len;
        targetCM = w.CodeMirror;
      }
    }
  }
  if (!targetCM) return { ok: false, reason: 'no CodeMirror found' };
  targetCM.setValue(newCode);
  return { ok: true, newLength: targetCM.getValue().length };
}, NEW_CODE);
console.log('Set result:', setResult);

await page.waitForTimeout(1000);
await page.screenshot({ path: `${REPORT_DIR}/fix-02-after-edit.png`, fullPage: true });

// Click "Update" / save button directly via playwright
console.log('Clicking update...');
try {
  await page.locator('button[type="submit"]:has-text("Update")').first().click({ timeout: 10000 });
  console.log('Clicked Update button via locator');
} catch(e) {
  console.log('Locator click failed:', e.message);
}
{
  const updated = await page.evaluate(() => {
    // WPCode's save button
    const candidates = [
      '#wpcode_update_snippet',
      'button[name="save_to_library"]',
      '.wpcode-button-primary',
      '#publish',
      'input[type="submit"][value*="Update"]'
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.offsetParent !== null) {
        el.click();
        return { clicked: sel };
      }
    }
    // Fallback: find any visible button containing "Update"
    const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
    for (const b of btns) {
      const t = (b.textContent || b.value || '').trim();
      if (/^update$|עדכן|שמור/.test(t) && b.offsetParent !== null) {
        b.click();
        return { clicked: 'text-match: ' + t };
      }
    }
    return { clicked: null };
  });
  console.log('Save click:', updated);
}
await page.waitForTimeout(5000);
await page.screenshot({ path: `${REPORT_DIR}/fix-03-after-save.png`, fullPage: true });

// Verify: reload and check the code
console.log('Reloading to verify...');
await page.goto(`https://tzilum1.mrvsn.com/wp-admin/admin.php?page=wpcode-snippet-manager&snippet_id=${SNIPPET_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const verified = await page.evaluate(() => {
  const cmWrappers = document.querySelectorAll('.CodeMirror');
  let code = '';
  for (const w of cmWrappers) {
    if (w.CodeMirror) {
      const val = w.CodeMirror.getValue();
      if (val.length > code.length) code = val;
    }
  }
  return code;
});
fs.writeFileSync(`${REPORT_DIR}/snippet-10430-AFTER-save.txt`, verified);
console.log(`Verified code length: ${verified.length}`);
console.log(`Contains new fix marker: ${verified.includes('cancelFailsafe')}`);
console.log(`Contains bug: still has unprotected requestSubmit? ${verified.includes('requestSubmit') && !verified.includes('cancelFailsafe')}`);

await browser.close();
