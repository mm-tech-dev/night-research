#!/usr/bin/env node
/**
 * Request #17176 — Verify on live HTML:
 *   1. <title> contains our new title
 *   2. <meta name="description" content="..."> matches our new desc
 *   3. <h1> count == 1
 * Saves reports/2026-04-19/evidence/recIsWT8X1O7sp2nz/verification.json
 */
const https = require('https');
const fs = require('fs'); const path = require('path');

const SITE = 'https://sby.co.il';
const REC = 'recIsWT8X1O7sp2nz';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', REC);
const META = JSON.parse(fs.readFileSync(path.join(EVID, 'meta-plan.json'), 'utf8'));
const APPLY = JSON.parse(fs.readFileSync(path.join(EVID, 'apply-log.json'), 'utf8'));

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36', 'Accept-Language': 'he' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(new URL(res.headers.location, url).href).then(resolve, reject);
      }
      let body = ''; res.setEncoding('utf8');
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, html: body }));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(new Error('timeout')); });
  });
}

function decode(s) {
  if (!s) return s;
  return s
    .replace(/&#8211;/g, '–').replace(/&#8212;/g, '—')
    .replace(/&#8217;/g, "'").replace(/&#8220;/g, '"').replace(/&#8221;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function extract(html) {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const descM = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
  return {
    title: decode(titleM ? titleM[1].trim() : ''),
    desc: decode(descM ? descM[1].trim() : ''),
    h1Count: h1s.length,
    h1Texts: h1s,
  };
}

(async () => {
  const results = [];
  for (let i = 0; i < META.length; i++) {
    const m = META[i];
    const applied = APPLY.find(a => a.slug === m.slug || a.name_he === m.name_he);
    const url = SITE + m.url_path;
    process.stdout.write(`[${i+1}/${META.length}] ${m.name_he} ... `);
    try {
      const { status, html } = await fetchUrl(url);
      const e = extract(html);
      const titleOk = e.title && (e.title === m.title || e.title.includes(m.title));
      const descOk = e.desc && (e.desc === m.desc || e.desc.replace(/\s+/g,' ').trim() === m.desc.replace(/\s+/g,' ').trim());
      const h1Ok = e.h1Count === 1;
      const pass = titleOk && descOk && h1Ok;
      console.log(pass ? '✓' : '✗', `status=${status} H1=${e.h1Count} title=${titleOk?'Y':'N'} desc=${descOk?'Y':'N'}`);
      results.push({ name: m.name_he, url, status, expected: { title: m.title, desc: m.desc }, actual: e, checks: { titleOk, descOk, h1Ok, pass } });
    } catch (e) {
      console.log('ERR', e.message);
      results.push({ name: m.name_he, url, error: e.message });
    }
  }
  fs.writeFileSync(path.join(EVID, 'verification.json'), JSON.stringify(results, null, 2));
  const passing = results.filter(r => r.checks && r.checks.pass).length;
  const withExtraH1 = results.filter(r => r.actual && r.actual.h1Count > 1);
  console.log(`\nPASS ${passing}/${results.length}  |  Extra H1s on: ${withExtraH1.length}`);
  if (withExtraH1.length) {
    console.log('Pages with extra H1 (need fix):');
    withExtraH1.forEach(r => console.log(`  - ${r.name} (${r.actual.h1Count} H1s): ${r.actual.h1Texts.slice(0,3).map(t => t.slice(0,40)).join(' | ')}`));
  }
})();
