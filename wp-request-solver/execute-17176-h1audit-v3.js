#!/usr/bin/env node
/**
 * H1 audit v3 — Load Elementor editor, extract _elementor_data from the editor's
 * internal model (elementor.documents.getCurrent().container.model.get('elements')).
 */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
fs.readFileSync(path.resolve(__dirname, '.env'), 'utf-8').split(/\r?\n/).forEach(l => {
  const i = l.indexOf('='); if (i > 0 && !process.env[l.slice(0, i).trim()]) process.env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
});
const SITE = 'https://sby.co.il';
const EVID = path.resolve(__dirname, 'reports', '2026-04-19', 'evidence', 'recIsWT8X1O7sp2nz');
const META = JSON.parse(fs.readFileSync(path.join(EVID, 'apply-log.json'), 'utf8'));

function collectHeadings(elements, out = [], pathStr = '') {
  if (!elements) return out;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const step = `${pathStr}[${i}]${el.widgetType || el.elType || '?'}`;
    if (el.widgetType === 'heading' || el.widgetType === 'theme-post-title' || el.widgetType === 'post-title') {
      const s = el.settings || {};
      out.push({
        path: step, widgetType: el.widgetType, id: el.id,
        tag: s.header_size || s.title_tag || s.title_html_tag || '(default)',
        text: (s.title || '').toString().slice(0, 80),
        has_dynamic: JSON.stringify(s).includes('__dynamic__'),
      });
    } else if (/loop|posts|archive/.test(el.widgetType || '')) {
      const s = el.settings || {};
      out.push({
        path: step, widgetType: el.widgetType, id: el.id, tag: '(LOOP)',
        template_id: s.template_id || s.loop_template_id || null,
        title_tag: s.title_tag || s.title_size || s.title_html_tag || null,
        keys: Object.keys(s).filter(k => /template|title|tag/i.test(k)),
      });
    }
    if (el.elements && el.elements.length) collectHeadings(el.elements, out, step + '>');
  }
  return out;
}

async function login(page) {
  await page.goto(`${SITE}/mm-mgmt`, { waitUntil: 'domcontentloaded' });
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  try { await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 45000 }), page.click('#wp-submit')]); } catch(_){}
  await page.goto(`${SITE}/wp-admin/`, { waitUntil: 'domcontentloaded' });
  if (!(await page.$('#wpadminbar'))) throw new Error('Login failed');
}

async function fetchViaAjax(page, postId) {
  // Load an admin page to obtain nonce
  await page.goto(`${SITE}/wp-admin/post.php?post=${postId}&action=edit`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const nonces = await page.evaluate(() => ({
    restNonce: (window.wpApiSettings && window.wpApiSettings.nonce) || null,
    ajaxNonce: (window.elementorCommon && elementorCommon.config && elementorCommon.config.ajax && elementorCommon.config.ajax.nonce) || null,
    ajaxurl: (window.ajaxurl) || '/wp-admin/admin-ajax.php',
    editMode: (document.querySelector('#_elementor_edit_mode_nonce') || {}).value,
  }));
  // Use Elementor's AJAX "get_document_config" action
  const resp = await page.evaluate(async ({ id, ajaxurl, ajaxNonce }) => {
    const payload = {
      action: 'elementor_ajax',
      _nonce: ajaxNonce,
      actions: JSON.stringify({ get_doc: { action: 'get_document_config', data: { id } } }),
    };
    const form = new URLSearchParams(payload);
    const r = await fetch(ajaxurl, { method: 'POST', credentials: 'include', body: form, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return { status: r.status, body: (await r.text()).slice(0, 500000) };
  }, { id: postId, ajaxurl: nonces.ajaxurl, ajaxNonce: nonces.ajaxNonce });

  return { nonces, resp };
}

async function fetchViaEditor(page, postId) {
  // Open Elementor editor in edit mode — it loads _elementor_data into the editor's model
  const editorUrl = `${SITE}/wp-admin/post.php?post=${postId}&action=elementor`;
  await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for the editor frame or the global elementor to exist
  try {
    await page.waitForFunction(() => {
      return !!(window.elementor && elementor.documents && elementor.documents.getCurrent);
    }, { timeout: 45000 });
  } catch(e) {
    return { error: 'editor_never_loaded' };
  }

  const elements = await page.evaluate(() => {
    try {
      const doc = elementor.documents.getCurrent();
      if (!doc) return { error: 'no_current_doc' };
      // Multiple ways to access the document's elements
      const cfgElements = (doc.config && doc.config.elements) || null;
      const container = doc.container;
      const modelElements = container && container.model && container.model.get && container.model.get('elements');
      if (modelElements) {
        try { return { elements: modelElements.toJSON ? modelElements.toJSON() : modelElements }; }
        catch(e){ return { error: 'toJSON_failed' }; }
      }
      if (cfgElements) return { elements: cfgElements };
      return { error: 'no_elements' };
    } catch(e) { return { error: e.message }; }
  });

  return elements;
}

(async () => {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120000);
  await login(page);
  console.log('✓ login');

  const audit = [];
  for (const item of META) {
    console.log(`→ ${item.name_he} (id=${item.id})`);
    try {
      const r = await fetchViaEditor(page, item.id);
      if (r.error) { console.log(`  editor_err: ${r.error}`); audit.push({id:item.id,name:item.name_he,error:r.error}); continue; }
      const elements = r.elements;
      const headings = collectHeadings(elements || []);
      audit.push({ id: item.id, name: item.name_he, headings, raw_len: JSON.stringify(elements).length });
      const tags = {};
      for (const h of headings) tags[h.tag] = (tags[h.tag] || 0) + 1;
      console.log(`  raw_len: ${JSON.stringify(elements).length}  headings: ${headings.length}  tags: ${JSON.stringify(tags)}`);
      headings.slice(0, 10).forEach(h => console.log(`    ${h.tag} | ${h.widgetType} | ${h.text || h.template_id || ''}`));
    } catch (e) {
      console.log('  ERR:', e.message);
      audit.push({id:item.id,name:item.name_he,error:e.message});
    }
  }
  fs.writeFileSync(path.join(EVID, 'h1-audit-v3.json'), JSON.stringify(audit, null, 2));
  await b.close();
})();
