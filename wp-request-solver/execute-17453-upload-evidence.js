#!/usr/bin/env node
// Upload evidence screenshots to Discord webhook (?wait=true) to get public URLs for Airtable attachments.
const fs = require('fs');
const path = require('path');

const ENV = (() => {
  const env = {};
  fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
    const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  });
  return env;
})();

const WEBHOOK = ENV.DISCORD_WEBHOOK + '?wait=true';
const EVID = path.resolve(__dirname, 'reports', '2026-05-04', 'evidence', 'recX2M4F9bPEnAybU');

const FILES = [
  ['media-edit-wintax_co_il-4848.png', '📸 **#17453 AFTER** — wintax media editor: logo-wintax.svg with new alt text "לוגו WinTax - שירות החזר מס"'],
  ['login-fail-fd_wintax_co_il.png',  '📸 **#17453 BLOCKER** — fd.wintax.co.il rejected mv-dev login (separate WP install, different credentials needed)'],
];

async function uploadOne(file, caption) {
  const filePath = path.join(EVID, file);
  if (!fs.existsSync(filePath)) { console.log(`  SKIP ${file}: not found`); return null; }
  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: caption }));
  const buf = fs.readFileSync(filePath);
  fd.append('file', new Blob([buf], { type: 'image/png' }), file);
  const r = await fetch(WEBHOOK, { method: 'POST', body: fd });
  if (!r.ok) { console.log(`  ERR ${file}: ${r.status} ${await r.text()}`); return null; }
  const j = await r.json();
  const att = (j.attachments || [])[0];
  if (!att) { console.log(`  ERR ${file}: no attachment in response`); return null; }
  console.log(`  OK ${file}: ${att.url}`);
  return { filename: file, url: att.url };
}

(async () => {
  console.log('→ Uploading evidence to Discord...');
  const uploads = [];
  for (const [file, caption] of FILES) {
    uploads.push(await uploadOne(file, caption));
  }
  const ok = uploads.filter(Boolean);
  console.log(`\n${ok.length}/${uploads.length} uploaded`);
  fs.writeFileSync(path.join(EVID, 'evidence-urls.json'), JSON.stringify(ok, null, 2));
})();
