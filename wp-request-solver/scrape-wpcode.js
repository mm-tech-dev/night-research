#!/usr/bin/env node
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const [key, ...vals] = line.split('=');
      if (key && vals.length) {
        const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) process.env[key.trim()] = val;
      }
    });
  }
} catch (e) {}

const SITE_URL = (process.argv[2] || '').replace(/\/+$/, '');
const OUT_FILE = process.argv[3] || 'snippets.json';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  console.error('[1/3] Login...');
  await page.goto(`${SITE_URL}/wp-login.php`);
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.click('#wp-submit');
  await page.waitForURL(/wp-admin/, { timeout: 30000 });

  console.error('[2/3] List snippets...');
  await page.goto(`${SITE_URL}/wp-admin/admin.php?page=wpcode`, { waitUntil: 'networkidle' });
  const snippetIds = await page.evaluate(() => {
    const seen = new Set();
    const items = [];
    document.querySelectorAll('a[href*="snippet_id="]').forEach(a => {
      const m = a.href.match(/snippet_id=(\d+)/);
      if (m && !a.href.includes('action=trash') && !a.href.includes('action=duplicate')) {
        const id = m[1];
        if (!seen.has(id)) {
          seen.add(id);
          items.push({ id, title: a.innerText.trim().slice(0, 200) });
        }
      }
    });
    return items;
  });
  console.error(`     Found ${snippetIds.length} unique snippet IDs`);

  console.error('[3/3] Fetch each snippet...');
  const results = [];
  for (let i = 0; i < snippetIds.length; i++) {
    const s = snippetIds[i];
    const url = `${SITE_URL}/wp-admin/admin.php?page=wpcode-snippet-manager&snippet_id=${s.id}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForTimeout(1500);

      const detail = await page.evaluate(() => {
        const out = {};
        const titleInput = document.querySelector('#wpcode-snippet-title, input[name="wpcode_snippet_title"], input[name*="title"]');
        out.title = titleInput?.value || '';

        let code = '';
        const cmEls = document.querySelectorAll('.CodeMirror');
        for (const el of cmEls) {
          if (el.CodeMirror) {
            const v = el.CodeMirror.getValue();
            if (v && v.length > code.length) code = v;
          }
        }
        if (!code) {
          const ta = document.querySelector('textarea[name="wpcode_snippet_code"], textarea#wpcode-snippet-code');
          if (ta) code = ta.value || '';
        }
        out.code = code;

        const typeSel = document.querySelector('#wpcode-code-type, select[name*="code_type"]');
        out.type = typeSel?.value || '';

        const locSel = document.querySelector('#wpcode-snippet-location, select[name*="location"]');
        out.location = locSel?.value || locSel?.options?.[locSel.selectedIndex]?.text || '';

        const activeToggle = document.querySelector('input[name*="active_status"], #wpcode-snippet-active, input[type="checkbox"][name*="active"]');
        out.active = activeToggle ? activeToggle.checked : null;

        const descTa = document.querySelector('textarea[name*="description"], #wpcode-snippet-description');
        out.description = descTa?.value || '';

        const tagsInput = document.querySelector('input[name*="tags"], #wpcode-snippet-tags');
        out.tags = tagsInput?.value || '';

        const priorityInput = document.querySelector('input[name*="priority"]');
        out.priority = priorityInput?.value || '';

        return out;
      });

      results.push({ id: s.id, listTitle: s.title, ...detail });
      console.error(`     [${i + 1}/${snippetIds.length}] ${detail.title || s.title} | type=${detail.type} | loc=${detail.location} | active=${detail.active} | code=${detail.code?.length || 0}ch`);
    } catch (e) {
      console.error(`     [${i + 1}/${snippetIds.length}] ERR ${s.id}: ${e.message}`);
      results.push({ id: s.id, listTitle: s.title, error: e.message });
    }
  }

  await browser.close();
  fs.writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.error(`\n✓ Saved ${results.length} snippets to ${OUT_FILE}`);
})();
