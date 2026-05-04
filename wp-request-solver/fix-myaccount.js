#!/usr/bin/env node
/**
 * Fix free-lancer.co.il my-account page #1780:
 * Remove WC Memberships + DCE visibility conditions from container e64c677.
 */

const fs = require('fs');
const https = require('https');
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

const SITE = 'https://free-lancer.co.il';
const USER = 'mv-dev';
const APP_PASS = 'bWqr iCYH VE4n 773N tnL3 91f7';
const POST_ID = 1780;
const TARGET_ID = 'e64c677';

const VIS_KEYS_TO_STRIP = [
  'wcm_element_visibility_condition',
  'wcm_element_visibility_show_plans',
  'wcm_element_visibility_hide_plans',
  'dce_visibility_selected',
  'dce_visibility_triggers',
  'dce_visibility_role',
  'dce_visibility_action',
  'dce_visibility_type',
  'dce_visibility_user_state',
];

function req(method, pathStr, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(SITE + pathStr);
    const headers = {
      'Authorization': 'Basic ' + Buffer.from(`${USER}:${APP_PASS}`).toString('base64'),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const r = https.request({
      method, hostname: url.hostname, port: 443, path: url.pathname + url.search, headers
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (bodyStr) r.write(bodyStr);
    r.end();
  });
}

(async () => {
  console.log('[1/6] Fetching current _elementor_data...');
  const getResp = await req('GET', `/wp-json/wp/v2/pages/${POST_ID}?context=edit`);
  if (getResp.status !== 200) { console.error('GET failed:', getResp.status, getResp.body); process.exit(1); }
  const page = getResp.body;
  const elementorData = typeof page.meta._elementor_data === 'string'
    ? JSON.parse(page.meta._elementor_data)
    : page.meta._elementor_data;
  console.log(`       Got ${elementorData.length} top-level sections`);

  console.log(`[2/6] Locating container ${TARGET_ID}...`);
  const target = elementorData.find(s => s.id === TARGET_ID);
  if (!target) { console.error(`Section ${TARGET_ID} not found!`); process.exit(1); }

  const beforeKeys = Object.keys(target.settings).filter(k => VIS_KEYS_TO_STRIP.includes(k));
  console.log(`       Found ${beforeKeys.length} visibility keys to strip:`);
  beforeKeys.forEach(k => console.log(`         - ${k} = ${JSON.stringify(target.settings[k])}`));

  console.log('[3/6] Stripping visibility keys...');
  for (const k of VIS_KEYS_TO_STRIP) {
    delete target.settings[k];
  }
  const afterKeys = Object.keys(target.settings).filter(k => VIS_KEYS_TO_STRIP.includes(k));
  console.log(`       Remaining vis keys: ${afterKeys.length}`);

  console.log('[4/6] Saving backup of MODIFIED data...');
  fs.writeFileSync(
    path.resolve(__dirname, '..', 'reports', '2026-04-14', 'free-lancer-myaccount-1780-MODIFIED.json'),
    JSON.stringify(elementorData, null, 2)
  );

  console.log('[5/6] PATCHing page with cleaned _elementor_data...');
  const newDataStr = JSON.stringify(elementorData);
  const patchResp = await req('POST', `/wp-json/wp/v2/pages/${POST_ID}`, {
    meta: {
      _elementor_data: newDataStr,
      _elementor_css: ''
    }
  });
  console.log(`       PATCH status: ${patchResp.status}`);
  if (patchResp.status >= 400) {
    console.error('PATCH failed:', JSON.stringify(patchResp.body).slice(0, 500));
    process.exit(1);
  }

  console.log('[6/6] Verifying...');
  const verifyResp = await req('GET', `/wp-json/wp/v2/pages/${POST_ID}?context=edit`);
  const verifyData = typeof verifyResp.body.meta._elementor_data === 'string'
    ? JSON.parse(verifyResp.body.meta._elementor_data)
    : verifyResp.body.meta._elementor_data;
  const verifyTarget = verifyData.find(s => s.id === TARGET_ID);
  const remaining = Object.keys(verifyTarget.settings).filter(k => VIS_KEYS_TO_STRIP.includes(k));
  console.log(`       Container ${TARGET_ID} now has ${remaining.length} vis keys (expect 0)`);

  if (remaining.length === 0) {
    console.log('\n  SUCCESS. Run snapshot-myaccount.js to verify visually.');
  } else {
    console.log('\n  FAILED. Some keys remained:', remaining);
    process.exit(1);
  }
})();
