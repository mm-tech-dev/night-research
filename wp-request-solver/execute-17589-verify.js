#!/usr/bin/env node
/**
 * Wider verification: probe ~20 URLs from the client's request list and confirm <h1> exists.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE = 'https://aryos.net';
const EVID = path.resolve(__dirname, 'reports', '2026-05-03', 'evidence', 'recVhky3jWVIuwxq2');

// Mix of real-slug, auto-slug products + contact page from the client list
const URLS = [
  'https://aryos.net/product/product-68a6f5e8d247488df31a9fde/',
  'https://aryos.net/product/מחברת-ספירלה-כריכה-קשה/',
  'https://aryos.net/product/פאץ-רקום-גדול-בעיצוב-אישי/',
  'https://aryos.net/product/חולצת-לייקרה-צווארון-וי/',
  'https://aryos.net/product/כובע-רשת-צבאי/',
  'https://aryos.net/product/דרגות-לצהל-משטרה/',
  'https://aryos.net/product/כובע-פלקספיט-2/',
  'https://aryos.net/product/חולצת-לייקרה/',
  'https://aryos.net/product/חולצת-פולו-פרימיום-העתק/',
  'https://aryos.net/product/גרביים-איכותיות-אנטי-בקטרליות-עם-חוטי/',
  'https://aryos.net/צור-קשר/',
  'https://aryos.net/product/כובע-רשת/',
  'https://aryos.net/product/פאץ-סיליקון-גדול-בעיצוב-אישי/',
  'https://aryos.net/product/חולצת-פולו-ארוכה/',
  'https://aryos.net/product/דגלים/',
  'https://aryos.net/product/חולצת-טריקו-קצרה/',
  'https://aryos.net/product/חולצת-טריקו-ארוכה/',
  'https://aryos.net/product/כובע-בייסבול/',
  'https://aryos.net/product/כובע-סנאפבאק-איכותי/',
  'https://aryos.net/product/קפוצון-רוכסן/',
  'https://aryos.net/product/חולצת-3-4-אמריקאית/',
  'https://aryos.net/product/מנשא-צידי-לרחפן-התקפי/',
];

function encodeUrl(rawUrl) {
  // Split URL into path components and encode any non-ASCII characters
  const m = rawUrl.match(/^(https?:\/\/[^\/]+)(\/.*)$/);
  if (!m) return rawUrl;
  const origin = m[1];
  const pathSegments = m[2].split('/').map(seg => {
    // Re-encode each segment so Hebrew→%XX while keeping already-encoded parts intact
    try { return encodeURIComponent(decodeURIComponent(seg)); } catch { return encodeURIComponent(seg); }
  });
  return origin + pathSegments.join('/');
}

function probe(rawUrl) {
  const url = encodeUrl(rawUrl);
  const cacheBust = url + (url.includes('?') ? '&' : '?') + '_v=' + Date.now();
  const html = execSync(`curl -sL --max-time 30 "${cacheBust}"`, { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });
  const h1Count = (html.match(/<h1\b/g) || []).length;
  const firstH1 = (html.match(/<h1\b[^>]*>([^<]{1,150})/) || [])[1] || null;
  return { url: rawUrl, h1Count, firstH1: firstH1 ? firstH1.trim() : null };
}

const results = URLS.map((u, i) => {
  process.stdout.write(`[${i+1}/${URLS.length}] `);
  const r = probe(u);
  console.log(`h1=${r.h1Count} | "${(r.firstH1 || '').slice(0, 60)}" | ${u}`);
  return r;
});

const summary = {
  total: results.length,
  withH1: results.filter(r => r.h1Count >= 1).length,
  withoutH1: results.filter(r => r.h1Count === 0).map(r => r.url),
  multipleH1: results.filter(r => r.h1Count > 1).map(r => ({ url: r.url, h1Count: r.h1Count })),
};
console.log('\n=== SUMMARY ===');
console.log(JSON.stringify(summary, null, 2));

fs.writeFileSync(path.join(EVID, 'verify-after.json'), JSON.stringify({ summary, details: results }, null, 2));
