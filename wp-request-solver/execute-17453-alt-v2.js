// Round 2: handle the items that round 1 missed.
//   - ChIJ reviewer photos: WP search doesn't match across underscores. Try the hash suffix only and the place-id prefix; verify by source_url.
//   - morevision logo: URL has WP-generated size suffix ("-1024x237-1-300x69"); the parent attachment is shorter. Match by source_url substring.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = 'https://wintax.co.il';
const RECORD_ID = 'recX2M4F9bPEnAybU';
const DATE = '2026-05-04';
const DIR = path.join(__dirname, 'reports', DATE, 'evidence', RECORD_ID);
const WP_USER = 'mv-dev';
const WP_PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';

const PRIOR = JSON.parse(fs.readFileSync(path.join(DIR, 'alt-results.json'), 'utf-8'));

const RETRY = PRIOR.filter(r => r.status === 'not_found');
console.log(`Retrying ${RETRY.length} items`);

function altFor(url) {
  const u = url.toLowerCase();
  if (u.includes('morevision-primary-logo')) return 'לוגו Morevision - שותף מקצועי בשירות החזר מס WinTax';
  if (u.includes('chij')) return 'תמונת לקוח מרוצה - חוות דעת על שירות החזר מס WinTax';
  return 'תמונה - שירות החזר מס WinTax';
}

// Strip WP-generated size suffix (-WxH and trailing dup markers like -1) to get the base filename.
function baseFromSizedUrl(url) {
  const fn = url.split('/').pop();
  // Remove size suffixes like -1024x237 (and a trailing -<digits>-WxH chain)
  const ext = fn.match(/\.[a-zA-Z0-9]+$/)?.[0] || '';
  let base = fn.slice(0, fn.length - ext.length);
  // Remove repeated size patterns at the end
  base = base.replace(/(-\d+x\d+)+$/, '');
  // Maybe strip a trailing -<digit> dup marker too (be conservative; keep both options)
  return { full: base, withoutDupMarker: base.replace(/-\d+$/, '') };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log('[wintax] login...');
  await page.goto(`${SITE}/wp-login.php`, { timeout: 60000 });
  await context.addCookies([{ name: 'wordpress_test_cookie', value: 'WP+Cookie+check', domain: 'wintax.co.il', path: '/' }]);
  await page.fill('#user_login', WP_USER);
  await page.fill('#user_pass', WP_PASS);
  await page.click('#wp-submit');
  await page.waitForURL('**/wp-admin/**', { timeout: 60000 });
  console.log('[wintax] logged in');

  const search = async (q) => page.evaluate(async (qq) => {
    const r = await fetch(`/wp-json/wp/v2/media?search=${encodeURIComponent(qq)}&per_page=25`, { headers: { 'X-WP-Nonce': wpApiSettings.nonce } });
    if (!r.ok) return { error: r.status, body: await r.text() };
    return await r.json();
  }, q);

  const patchAlt = async (id, alt) => page.evaluate(async ({ mid, val }) => {
    const r = await fetch(`/wp-json/wp/v2/media/${mid}`, {
      method: 'POST',
      headers: { 'X-WP-Nonce': wpApiSettings.nonce, 'Content-Type': 'application/json' },
      body: JSON.stringify({ alt_text: val }),
    });
    const t = await r.text();
    let j; try { j = JSON.parse(t); } catch { j = { raw: t }; }
    return { ok: r.ok, status: r.status, body: j };
  }, { mid: id, val: alt });

  const updates = [];

  for (const r of RETRY) {
    const url = r.url;
    const fn = url.split('/').pop();
    const targetUrl = url; // exact match against source_url
    let candidates = [];

    if (url.toLowerCase().includes('chij')) {
      // 1) Try hash suffix only
      const m = fn.match(/_([0-9a-f]{32})\./i);
      const queries = [];
      if (m) queries.push(m[1]);
      // 2) Try place-id prefix
      const m2 = fn.match(/^(ChIJ[A-Za-z0-9]+)_/);
      if (m2) queries.push(m2[1]);
      // 3) Try the slugified version (underscores → dashes)
      queries.push(fn.replace(/\.[a-zA-Z0-9]+$/, '').replace(/_/g, '-'));

      for (const q of queries) {
        const list = await search(q);
        if (Array.isArray(list)) {
          for (const m of list) candidates.push(m);
        }
      }
    } else if (url.toLowerCase().includes('morevision-primary-logo')) {
      const { full, withoutDupMarker } = baseFromSizedUrl(url);
      for (const q of [full, withoutDupMarker, 'morevision-primary-logo-wide-dark', 'morevision-primary-logo']) {
        const list = await search(q);
        if (Array.isArray(list)) for (const m of list) candidates.push(m);
      }
    } else {
      const list = await search(fn.replace(/\.[a-zA-Z0-9]+$/, ''));
      if (Array.isArray(list)) candidates = list;
    }

    // Dedupe
    const seen = new Set();
    candidates = candidates.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });

    // Match logic: prefer exact source_url, otherwise source_url containing the filename, otherwise pick first that has a clearly-related source_url.
    const exact = candidates.find(c => c.source_url === targetUrl);
    let chosen = exact;
    if (!chosen) {
      // Source_url ends with the same filename (without size suffix)
      const baseFn = fn.replace(/(-\d+x\d+)+(\.[a-zA-Z0-9]+)$/, '$2');
      chosen = candidates.find(c => (c.source_url || '').endsWith(baseFn));
    }
    if (!chosen) {
      // For ChIJ — take first match (they're all reviewer photos; we still verify the source URL contains the place-id)
      if (url.toLowerCase().includes('chij')) {
        const placePrefix = (fn.match(/^(ChIJ[A-Za-z0-9]+)_/) || [, ''])[1].toLowerCase();
        chosen = candidates.find(c => (c.source_url || '').toLowerCase().includes(placePrefix));
      }
    }
    if (!chosen) {
      console.log(`  STILL NOT FOUND: ${fn} — ${candidates.length} candidates: ${candidates.map(c => c.source_url).slice(0, 3).join(' | ')}`);
      updates.push({ url, status: 'still_not_found', note: `Tried alt searches; ${candidates.length} candidates, none matched.` });
      continue;
    }

    // Validate the candidate's source_url actually corresponds to the requested URL family
    const candidateBase = (chosen.source_url || '').split('/').pop().replace(/(-\d+x\d+)+(\.[a-zA-Z0-9]+)$/, '$2');
    const requestedBase = fn.replace(/(-\d+x\d+)+(\.[a-zA-Z0-9]+)$/, '$2');
    if (!url.toLowerCase().includes('chij') && candidateBase !== requestedBase) {
      console.log(`  CANDIDATE MISMATCH for ${fn}: candidate=${chosen.source_url}`);
      updates.push({ url, status: 'candidate_mismatch', note: `Best candidate ${chosen.id} ${chosen.source_url} doesn't match base filename` });
      continue;
    }

    const beforeAlt = chosen.alt_text || '';
    const newAlt = altFor(url);
    console.log(`  [${chosen.id}] ${(chosen.source_url || '').split('/').pop()}\n    before: ${JSON.stringify(beforeAlt)}\n    after:  ${JSON.stringify(newAlt)}`);
    const patched = await patchAlt(chosen.id, newAlt);
    if (!patched.ok) {
      updates.push({ url, attachmentId: chosen.id, status: 'patch_failed', beforeAlt, newAlt, note: `HTTP ${patched.status}: ${JSON.stringify(patched.body).slice(0, 200)}` });
      continue;
    }
    // Verify
    const after = await page.evaluate(async (mid) => {
      const r = await fetch(`/wp-json/wp/v2/media/${mid}`, { headers: { 'X-WP-Nonce': wpApiSettings.nonce } });
      return await r.json();
    }, chosen.id);
    if (after?.alt_text === newAlt) {
      updates.push({ url, host: 'https://wintax.co.il', status: 'updated', attachmentId: chosen.id, beforeAlt, newAlt, note: r.url.toLowerCase().includes('chij') ? `Resolved by ChIJ heuristic to ${chosen.source_url}` : undefined });
    } else {
      updates.push({ url, attachmentId: chosen.id, status: 'verify_mismatch', beforeAlt, newAlt, note: `verifiedAlt=${JSON.stringify(after?.alt_text)}` });
    }
  }

  fs.writeFileSync(path.join(DIR, 'alt-results-v2.json'), JSON.stringify(updates, null, 2));
  await browser.close();

  // Merge into main results: replace not_found rows
  const merged = PRIOR.map(orig => {
    if (orig.status !== 'not_found') return orig;
    const upd = updates.find(u => u.url === orig.url);
    return upd || orig;
  });
  fs.writeFileSync(path.join(DIR, 'alt-results-final.json'), JSON.stringify(merged, null, 2));
  const counts = merged.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {});
  console.log('\n=== FINAL counts ===');
  console.log(counts);
})();
