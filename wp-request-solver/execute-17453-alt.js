const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = 'https://wintax.co.il';
const RECORD_ID = 'recX2M4F9bPEnAybU';
const DATE = '2026-05-04';
const DIR = path.join(__dirname, 'reports', DATE, 'evidence', RECORD_ID);
const WP_USER = 'mv-dev';
const WP_PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

const URLS = [
  'https://wintax.co.il/wp-content/uploads/2024/05/image-160.svg',
  'https://wintax.co.il/wp-content/uploads/2025/10/ChIJ3QhRoeBLHRURDWEPoj6wWeg_735eaed38c865a2aaf421c4bb272bd62.jpg',
  'https://wintax.co.il/wp-content/uploads/2025/10/ChIJ3QhRoeBLHRURDWEPoj6wWeg_f82f9844b1eb2ade6eb685128c943669.jpg',
  'https://wintax.co.il/wp-content/uploads/2025/10/ChIJ3QhRoeBLHRURDWEPoj6wWeg_c565f7880dd0cd9e428c02d1f609f959.jpg',
  'https://fd.wintax.co.il/wp-content/uploads/2024/05/Group-1000003918.png',
  'https://wintax.co.il/wp-content/uploads/2025/10/online-logo-2.svg',
  'https://wintax.co.il/wp-content/uploads/2026/03/morevision-primary-logo-wide-dark-1024x237-1-300x69.png',
  'https://wintax.co.il/wp-content/uploads/2025/10/ChIJ3QhRoeBLHRURDWEPoj6wWeg_3819c687d3743192d2322bfe782f19b7.jpg',
  'https://wintax.co.il/wp-content/uploads/2025/10/ChIJ3QhRoeBLHRURDWEPoj6wWeg_f7c7078446bbfd5df2b096394d13e9e6.jpg',
  'https://fd.wintax.co.il/wp-content/uploads/2024/05/download-1.png',
  'https://wintax.co.il/wp-content/uploads/2025/10/ChIJ3QhRoeBLHRURDWEPoj6wWeg_7c3fbe53617834a93ce3e806a87334a2.jpg',
  'https://wintax.co.il/wp-content/uploads/2025/11/Digitouch.png',
  'https://wintax.co.il/wp-content/uploads/2025/10/ChIJ3QhRoeBLHRURDWEPoj6wWeg_9a0171efffea80d656410073130fe05f.jpg',
  'https://wintax.co.il/wp-content/plugins/widget-google-reviews/assets/img/gmblogo.svg',
  'https://wintax.co.il/wp-content/uploads/2024/05/logo-wintax.svg',
  'https://wintax.co.il/wp-content/uploads/2025/12/Landing-page-second.png',
];

// Build alt text for an image based on filename / URL
function altFor(url) {
  const u = url.toLowerCase();
  const fn = url.split('/').pop().split('?')[0];
  if (u.includes('logo-wintax')) return 'לוגו WinTax - שירות החזר מס';
  if (u.includes('morevision-primary-logo')) return 'לוגו Morevision - שותף מקצועי בשירות החזר מס WinTax';
  if (u.includes('online-logo')) return 'לוגו פלטפורמה שותפה - מערכת החזר מס WinTax';
  if (u.includes('digitouch')) return 'לוגו Digitouch - שותף עסקי בשירות החזר מס WinTax';
  if (u.includes('gmblogo')) return 'לוגו Google My Business - חוות דעת על שירות החזר מס';
  if (u.includes('chij')) return 'תמונת לקוח מרוצה - חוות דעת על שירות החזר מס WinTax';
  if (u.includes('image-160')) return 'אייקון - שירות החזר מס WinTax';
  if (u.includes('landing-page')) return 'עמוד נחיתה - שירות החזר מס WinTax';
  if (u.includes('group-1000003918')) return 'גרפיקה - שירות החזר מס WinTax';
  if (u.includes('download-1')) return 'תמונה - שירות החזר מס WinTax';
  return 'תמונה - שירות החזר מס WinTax';
}

function basenameNoExt(url) {
  const fn = url.split('/').pop().split('?')[0];
  return fn.replace(/\.[a-zA-Z0-9]+$/, '');
}

async function loginAndGetContext(host) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log(`[${host}] Logging in...`);
  await page.goto(`${host}/wp-login.php`, { timeout: 60000 });
  await context.addCookies([{
    name: 'wordpress_test_cookie',
    value: 'WP+Cookie+check',
    domain: new URL(host).hostname,
    path: '/',
  }]);
  await page.fill('#user_login', WP_USER);
  await page.fill('#user_pass', WP_PASS);
  await page.click('#wp-submit');
  try {
    await page.waitForURL('**/wp-admin/**', { timeout: 60000 });
    console.log(`[${host}] Logged in OK`);
  } catch (e) {
    const url = page.url();
    console.log(`[${host}] LOGIN FAILED — ended at: ${url}`);
    await page.screenshot({ path: path.join(DIR, `login-fail-${new URL(host).hostname.replace(/\./g,'_')}.png`) });
    await browser.close();
    throw new Error(`Login failed for ${host}`);
  }
  return { browser, context, page };
}

async function findMediaIdByFilename(page, basename) {
  return await page.evaluate(async (q) => {
    const url = `/wp-json/wp/v2/media?search=${encodeURIComponent(q)}&per_page=20`;
    const r = await fetch(url, { headers: { 'X-WP-Nonce': wpApiSettings.nonce } });
    if (!r.ok) return { error: r.status, body: await r.text() };
    return await r.json();
  }, basename);
}

async function getMedia(page, id) {
  return await page.evaluate(async (mid) => {
    const r = await fetch(`/wp-json/wp/v2/media/${mid}`, { headers: { 'X-WP-Nonce': wpApiSettings.nonce } });
    if (!r.ok) return { error: r.status, body: await r.text() };
    return await r.json();
  }, id);
}

async function patchAlt(page, id, alt) {
  return await page.evaluate(async ({ mid, val }) => {
    const r = await fetch(`/wp-json/wp/v2/media/${mid}`, {
      method: 'POST',
      headers: {
        'X-WP-Nonce': wpApiSettings.nonce,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ alt_text: val }),
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { ok: r.ok, status: r.status, body: json };
  }, { mid: id, val: alt });
}

(async () => {
  // Group URLs by host
  const byHost = {};
  for (const u of URLS) {
    const h = new URL(u).origin;
    (byHost[h] = byHost[h] || []).push(u);
  }
  console.log('Hosts:', Object.keys(byHost).map(h => `${h} (${byHost[h].length})`).join(', '));

  const results = []; // [{url, host, status, attachmentId, beforeAlt, newAlt, note}]

  for (const host of Object.keys(byHost)) {
    let session;
    try {
      session = await loginAndGetContext(host);
    } catch (e) {
      console.log(`Skipping host ${host}: ${e.message}`);
      for (const u of byHost[host]) {
        results.push({ url: u, host, status: 'host_unavailable', note: `Login failed for ${host}` });
      }
      continue;
    }
    const { browser, page } = session;

    for (const u of byHost[host]) {
      const isPlugin = u.includes('/wp-content/plugins/');
      if (isPlugin) {
        results.push({ url: u, host, status: 'skipped_plugin_asset', note: 'Static plugin file, not in media library' });
        continue;
      }
      const fn = basenameNoExt(u);
      // WP search ignores some chars; try with full basename, then with first 30 chars
      let mediaList = await findMediaIdByFilename(page, fn);
      if (mediaList && mediaList.error) {
        results.push({ url: u, host, status: 'search_error', note: `HTTP ${mediaList.error}: ${String(mediaList.body).slice(0, 200)}` });
        continue;
      }
      if (!Array.isArray(mediaList) || mediaList.length === 0) {
        // Retry with shorter substring
        const shortQ = fn.length > 24 ? fn.slice(0, 24) : fn;
        mediaList = await findMediaIdByFilename(page, shortQ);
      }
      if (!Array.isArray(mediaList)) {
        results.push({ url: u, host, status: 'search_error', note: JSON.stringify(mediaList).slice(0, 200) });
        continue;
      }
      // Match by source_url or guid containing the filename
      const targetFn = u.split('/').pop();
      const match = mediaList.find(m => {
        const src = (m.source_url || '').split('/').pop();
        const guid = (m.guid?.rendered || '').split('/').pop();
        return src === targetFn || guid === targetFn;
      }) || mediaList.find(m => (m.source_url || '').endsWith(targetFn));
      if (!match) {
        results.push({ url: u, host, status: 'not_found', note: `Searched "${fn}", got ${mediaList.length} results` });
        continue;
      }
      const beforeAlt = match.alt_text || '';
      const newAlt = altFor(u);
      console.log(`  [${match.id}] ${targetFn}\n    before: ${JSON.stringify(beforeAlt)}\n    after:  ${JSON.stringify(newAlt)}`);
      const patched = await patchAlt(page, match.id, newAlt);
      if (!patched.ok) {
        results.push({ url: u, host, status: 'patch_failed', attachmentId: match.id, beforeAlt, newAlt, note: `HTTP ${patched.status}: ${JSON.stringify(patched.body).slice(0, 200)}` });
        continue;
      }
      // Verify
      const after = await getMedia(page, match.id);
      const verifiedAlt = after?.alt_text;
      if (verifiedAlt === newAlt) {
        results.push({ url: u, host, status: 'updated', attachmentId: match.id, beforeAlt, newAlt });
      } else {
        results.push({ url: u, host, status: 'verify_mismatch', attachmentId: match.id, beforeAlt, newAlt, note: `verifiedAlt=${JSON.stringify(verifiedAlt)}` });
      }
    }

    // Take a screenshot of the media library showing one of the updated items (the wintax logo) for evidence
    try {
      const winLogo = results.find(r => r.host === host && r.status === 'updated' && r.url.includes('logo-wintax'));
      const anyOk = winLogo || results.find(r => r.host === host && r.status === 'updated');
      if (anyOk && anyOk.attachmentId) {
        await page.goto(`${host}/wp-admin/post.php?post=${anyOk.attachmentId}&action=edit`, { timeout: 60000 });
        await page.waitForTimeout(2500);
        const fname = `media-edit-${new URL(host).hostname.replace(/\./g, '_')}-${anyOk.attachmentId}.png`;
        await page.screenshot({ path: path.join(DIR, fname), fullPage: true });
        console.log(`  Screenshot saved: ${fname}`);
      }
    } catch (e) {
      console.log(`  screenshot err: ${e.message}`);
    }

    await browser.close();
  }

  fs.writeFileSync(path.join(DIR, 'alt-results.json'), JSON.stringify(results, null, 2));
  console.log('\n=== Summary ===');
  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  console.log(counts);
})();
