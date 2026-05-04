import { chromium } from 'playwright';
import fs from 'fs';

const REPORT_DIR = 'reports/2026-04-15/tzilum1-double-cart';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

await page.goto('https://tzilum1.mrvsn.com/wp-login.php', { waitUntil: 'domcontentloaded' });
await page.fill('#user_login', 'mv-dev');
await page.fill('#user_pass', 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm');
await page.click('#wp-submit');
await page.waitForLoadState('networkidle', { timeout: 30000 });

await page.goto('https://tzilum1.mrvsn.com/wp-admin/admin.php?page=wpcode', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// Extract rows using multiple strategies
const rows = await page.evaluate(() => {
  const selectors = ['tr', '.wpcode-list-row', 'tbody tr', 'table tr'];
  const results = {};
  for (const s of selectors) {
    const els = document.querySelectorAll(s);
    results[s] = els.length;
  }
  // Try to find rows containing titles
  const allRows = Array.from(document.querySelectorAll('tr'));
  const withLinks = allRows.filter(r => r.querySelector('a[href*="wpcode"]')).slice(0, 3);
  return {
    counts: results,
    sampleRows: withLinks.map(r => r.outerHTML.slice(0, 800))
  };
});
console.log(JSON.stringify(rows, null, 2));

// Try a direct AJAX call to list snippets
const snippetRows = await page.evaluate(async () => {
  // Look for all <a> linking to wpcode-snippet-manager
  const links = Array.from(document.querySelectorAll('a[href*="wpcode-snippet-manager"]'));
  return links.map(a => ({
    href: a.href,
    text: a.textContent.trim().slice(0, 80),
    parent: a.closest('tr')?.textContent?.trim().slice(0, 200) || ''
  })).filter(l => l.href.includes('snippet_id='));
});
console.log('\nSnippet edit links:');
console.log(JSON.stringify(snippetRows.slice(0, 20), null, 2));
fs.writeFileSync(`${REPORT_DIR}/wpcode-links.json`, JSON.stringify(snippetRows, null, 2));

await browser.close();
