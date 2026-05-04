#!/usr/bin/env node
/**
 * Upload before/after screenshots to Discord webhook (?wait=true)
 * to obtain publicly accessible CDN URLs we can use in the Airtable
 * "הוכחת ביצוע" attachment field.
 */
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
const EVID = path.resolve(__dirname, 'reports', '2026-05-03', 'evidence', 'recVhky3jWVIuwxq2');

const FILES = [
  'before-product.png',
  'after-product.png',
  'before-contact.png',
  'after-contact.png',
];

async function uploadOne(file, caption) {
  const filePath = path.join(EVID, file);
  if (!fs.existsSync(filePath)) { console.log(`  SKIP ${file}: not found`); return null; }

  const fd = new FormData();
  fd.append('payload_json', JSON.stringify({ content: caption }));
  const buf = fs.readFileSync(filePath);
  // Use Blob (Node 20+ supports global FormData/Blob)
  fd.append('file', new Blob([buf], { type: 'image/png' }), file);

  const r = await fetch(WEBHOOK, { method: 'POST', body: fd });
  if (!r.ok) { console.log(`  ERR ${file}: ${r.status} ${await r.text()}`); return null; }
  const j = await r.json();
  const att = (j.attachments || [])[0];
  if (!att) { console.log(`  ERR ${file}: no attachment in response`); return null; }
  console.log(`  OK ${file}: ${att.url}`);
  return { filename: file, url: att.url, size: att.size, msgId: j.id };
}

(async () => {
  const uploads = [];
  console.log('→ Uploading evidence to Discord...');
  uploads.push(await uploadOne('before-product.png', '📸 **#17589 BEFORE** — product page (כובע בייסבול): no H1, title rendered as H3'));
  uploads.push(await uploadOne('after-product.png',  '📸 **#17589 AFTER** — product page (כובע בייסבול): now with proper H1'));
  uploads.push(await uploadOne('before-contact.png', '📸 **#17589 BEFORE** — contact page (צור קשר): no H1, "בואו נדבר" rendered as H2'));
  uploads.push(await uploadOne('after-contact.png',  '📸 **#17589 AFTER** — contact page (צור קשר): now with proper H1'));

  const ok = uploads.filter(Boolean);
  console.log(`\n${ok.length}/${uploads.length} uploaded`);
  fs.writeFileSync(path.join(EVID, 'evidence-urls.json'), JSON.stringify(ok, null, 2));
})();
