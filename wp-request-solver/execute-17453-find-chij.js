// Find the ChIJ reviewer photos by paging through media uploaded around 2025-10.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE = 'https://wintax.co.il';
const RECORD_ID = 'recX2M4F9bPEnAybU';
const DATE = '2026-05-04';
const DIR = path.join(__dirname, 'reports', DATE, 'evidence', RECORD_ID);
const WP_USER = 'mv-dev';
const WP_PASS = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';

const TARGET_HASHES = [
  '735eaed38c865a2aaf421c4bb272bd62',
  'f82f9844b1eb2ade6eb685128c943669',
  'c565f7880dd0cd9e428c02d1f609f959',
  '3819c687d3743192d2322bfe782f19b7',
  'f7c7078446bbfd5df2b096394d13e9e6',
  '7c3fbe53617834a93ce3e806a87334a2',
  '9a0171efffea80d656410073130fe05f',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log('login...');
  await page.goto(`${SITE}/wp-login.php`, { timeout: 60000 });
  await context.addCookies([{ name: 'wordpress_test_cookie', value: 'WP+Cookie+check', domain: 'wintax.co.il', path: '/' }]);
  await page.fill('#user_login', WP_USER);
  await page.fill('#user_pass', WP_PASS);
  await page.click('#wp-submit');
  await page.waitForURL('**/wp-admin/**', { timeout: 60000 });
  console.log('logged in');

  // Page through media in 2025-10 looking for ChIJ source_urls
  const found = {}; // hash → media obj
  const allCollected = [];
  let pageNum = 1;
  const PER = 100;
  while (true) {
    const list = await page.evaluate(async ({ p, per }) => {
      const r = await fetch(
        `/wp-json/wp/v2/media?after=2025-09-25T00:00:00&before=2025-11-15T00:00:00&per_page=${per}&page=${p}&_fields=id,source_url,alt_text`,
        { headers: { 'X-WP-Nonce': wpApiSettings.nonce } }
      );
      if (!r.ok) return { error: r.status, body: await r.text() };
      return await r.json();
    }, { p: pageNum, per: PER });

    if (!Array.isArray(list)) {
      console.log('list err:', list);
      break;
    }
    if (list.length === 0) break;
    console.log(`  page ${pageNum}: ${list.length} items`);
    allCollected.push(...list);
    for (const m of list) {
      const fn = (m.source_url || '').split('/').pop();
      for (const h of TARGET_HASHES) {
        if (fn.includes(h)) found[h] = m;
      }
    }
    if (list.length < PER) break;
    pageNum++;
    if (pageNum > 30) break; // safety
  }

  console.log(`\nScanned ${allCollected.length} media items.`);
  console.log(`Found ${Object.keys(found).length}/${TARGET_HASHES.length} target hashes.`);
  for (const h of TARGET_HASHES) {
    if (found[h]) console.log(`  ${h} → id=${found[h].id} alt=${JSON.stringify(found[h].alt_text || '')}`);
    else console.log(`  ${h} → MISSING`);
  }

  fs.writeFileSync(path.join(DIR, 'chij-search.json'), JSON.stringify({ found, scanned: allCollected.length }, null, 2));

  // If no ChIJ-named items found at all, also search for 'ChIJ' in source_url across all the collected items (already done) and confirm:
  const anyChij = allCollected.filter(m => (m.source_url || '').includes('ChIJ'));
  console.log(`\nAny ChIJ-named items found in scan: ${anyChij.length}`);
  if (anyChij.length === 0) {
    // The reviewer photos are NOT in the media library. Confirm by trying GET on the file URL via the proxy.
    console.log('→ ChIJ files are not registered as media library attachments.');
  }

  await browser.close();
})();
