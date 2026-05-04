#!/usr/bin/env node
/**
 * H1 hierarchy audit — scan 5 category-like pages for heading structure issues.
 * Reports: multiple H1s, missing H1, skipped heading levels.
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const EVID = path.resolve('reports','2026-04-16','evidence','recXgyUsfCHCPRIw7');
const URLS = [
  { label: 'type-of-material/זכוכית', url: 'https://sby.co.il/type-of-material/%d7%94%d7%93%d7%a4%d7%a1%d7%94-%d7%a2%d7%9c-%d7%96%d7%9b%d7%95%d7%9b%d7%99%d7%aa/' },
  { label: 'type-of-material/עץ', url: 'https://sby.co.il/type-of-material/%d7%94%d7%93%d7%a4%d7%a1%d7%94-%d7%a2%d7%9c-%d7%a2%d7%a5/' },
  { label: 'material/פרופיל-עץ', url: 'https://sby.co.il/material/%d7%a4%d7%a8%d7%95%d7%a4%d7%99%d7%9c-%d7%9c%d7%9e%d7%a1%d7%92%d7%95%d7%a8-%d7%a2%d7%a5/' },
  { label: 'material/קנבסים', url: 'https://sby.co.il/material/%d7%a4%d7%a8%d7%95%d7%a4%d7%99%d7%9c%d7%99-%d7%9c%d7%9e%d7%aa%d7%99%d7%97%d7%aa-%d7%a7%d7%a0%d7%91%d7%a1%d7%99%d7%9d/' },
  { label: 'product_cat/כללי', url: 'https://sby.co.il/product-category/%d7%9b%d7%9c%d7%9c%d7%99/' },
];

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: {width:1400,height:900}, userAgent:'Mozilla/5.0 Chrome/130 Safari' });
  const page = await ctx.newPage();
  const results = [];
  for (const t of URLS) {
    try {
      await page.goto(t.url + '?nc=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      const headings = await page.$$eval('h1,h2,h3,h4,h5,h6', els => els.map(e => ({
        tag: e.tagName, text: e.textContent.trim().slice(0, 120), visible: e.offsetParent !== null || e.style.display !== 'none',
      })));
      const h1s = headings.filter(h => h.tag === 'H1');
      const levels = headings.filter(h => h.visible).map(h => parseInt(h.tag[1]));
      const issues = [];
      if (h1s.length === 0) issues.push('NO_H1');
      if (h1s.length > 1) issues.push(`MULTIPLE_H1(${h1s.length})`);
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i-1] + 1) issues.push(`SKIPPED:H${levels[i-1]}→H${levels[i]}`);
      }
      results.push({ label: t.label, h1Count: h1s.length, headingCount: headings.length, issues, h1s: h1s.map(h=>h.text), allHeadings: headings.filter(h=>h.visible) });
      console.log(`${t.label}: H1x${h1s.length} issues=[${issues.join(',')}]`);
    } catch (e) { console.log(t.label, 'ERR', e.message); results.push({ label: t.label, error: e.message }); }
  }
  fs.writeFileSync(path.join(EVID, 'h1-audit.json'), JSON.stringify(results, null, 2));
  console.log('→', path.join(EVID, 'h1-audit.json'));
  await b.close();
})();
