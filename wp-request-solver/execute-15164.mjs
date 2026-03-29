import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const SITE_URL = 'https://surprise-boutique.co.il';
const WP_USERNAME = 'mv-dev';
const WP_PASSWORD = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const EVIDENCE_DIR = 'reports/2026-02-19/evidence/rec5HSrZiBQtJGXR5';
const HOMEPAGE_ID = '12273';

mkdirSync(EVIDENCE_DIR, { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.setDefaultTimeout(60000);

const log = [];
function logAction(msg) {
  console.log(msg);
  log.push(`[${new Date().toISOString()}] ${msg}`);
}

try {
  // ========== LOGIN ==========
  logAction('=== Step 1: Login ===');
  await page.goto(`${SITE_URL}/wp-login.php`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.fill('#user_login', WP_USERNAME);
  await page.fill('#user_pass', WP_PASSWORD);
  await page.click('#wp-submit');
  await page.waitForTimeout(5000);
  if (page.url().includes('wp-login') && !page.url().includes('wp-admin')) throw new Error('Login failed');
  logAction('Logged in');

  // ================================================================
  // PART A: REMOVE MENU ITEM (using WP's JS API)
  // ================================================================
  logAction('\n=== PART A: Remove "יום האהבה" menu item ===');
  await page.goto(`${SITE_URL}/wp-admin/nav-menus.php`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${EVIDENCE_DIR}/menu-before.png`, fullPage: false });

  // Use WordPress's built-in wpNavMenu to remove the item
  const menuRemoveResult = await page.evaluate(() => {
    const menuItem = document.getElementById('menu-item-13157');
    if (!menuItem) return { found: false };

    // WordPress approach: use wpNavMenu API
    if (window.wpNavMenu && typeof window.wpNavMenu.removeMenuItem === 'function') {
      window.wpNavMenu.removeMenuItem(jQuery('#menu-item-13157'));
      return { found: true, method: 'wpNavMenu.removeMenuItem' };
    }

    // Fallback: trigger the WP menu removal manually
    // Make the settings visible
    const settings = menuItem.querySelector('.menu-item-settings');
    if (settings) settings.style.display = 'block';

    // Find and trigger the deletion
    const deleteLink = menuItem.querySelector('.item-delete.submitdelete, a.submitdelete');
    if (deleteLink) {
      // WP uses jQuery event handling, trigger via jQuery if available
      if (window.jQuery) {
        jQuery(deleteLink).trigger('click');
        return { found: true, method: 'jQuery click' };
      }
      deleteLink.click();
      return { found: true, method: 'native click' };
    }

    // Last resort: just remove the element and its inputs from the form
    menuItem.remove();
    return { found: true, method: 'DOM removal' };
  });

  logAction(`Menu removal: ${JSON.stringify(menuRemoveResult)}`);
  await page.waitForTimeout(2000);

  // Verify the item is gone
  const itemGone = await page.evaluate(() => !document.getElementById('menu-item-13157'));
  logAction(`Menu item removed from DOM: ${itemGone}`);

  // Save the menu - scroll the save button into view and click
  await page.evaluate(() => {
    const saveBtn = document.getElementById('save_menu_header') || document.getElementById('save_menu_footer');
    if (saveBtn) {
      saveBtn.scrollIntoView({ block: 'center' });
      saveBtn.style.display = 'block';
      saveBtn.style.visibility = 'visible';
    }
  });
  await page.waitForTimeout(500);

  // Click with force
  try {
    const saveBtn = await page.$('#save_menu_header');
    if (saveBtn) {
      await saveBtn.click({ force: true });
      logAction('Clicked save_menu_header (forced)');
    } else {
      const saveBtnFooter = await page.$('#save_menu_footer');
      if (saveBtnFooter) {
        await saveBtnFooter.click({ force: true });
        logAction('Clicked save_menu_footer (forced)');
      }
    }
  } catch (e) {
    // Submit the form directly
    logAction('Force click failed, submitting form directly...');
    await page.evaluate(() => {
      const form = document.getElementById('update-nav-menu');
      if (form) {
        // Set the action to save
        const actionInput = form.querySelector('input[name="action"]');
        if (!actionInput) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = 'action';
          input.value = 'update';
          form.appendChild(input);
        }
        form.submit();
      }
    });
    logAction('Form submitted directly');
  }

  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${EVIDENCE_DIR}/menu-after-save.png`, fullPage: false });

  // Verify after page reload
  const verifyMenuUrl = page.url();
  if (verifyMenuUrl.includes('nav-menus.php')) {
    const itemStillThere = await page.$('#menu-item-13157');
    logAction(`After save, menu item exists: ${!!itemStillThere}`);
  }

  // ================================================================
  // PART B: REMOVE VALENTINE BANNER FROM CAROUSEL
  // ================================================================
  logAction('\n=== PART B: Open Elementor and remove Valentine slide ===');
  await page.goto(`${SITE_URL}/wp-admin/post.php?post=${HOMEPAGE_ID}&action=elementor`, {
    waitUntil: 'domcontentloaded', timeout: 120000
  });
  await page.waitForSelector('#elementor-preview-iframe', { timeout: 60000 });
  await page.waitForTimeout(18000); // Extra wait for full Elementor load
  logAction('Elementor loaded');

  // Close popups
  for (const sel of ['.dialog-close-button', '.eicon-close', '.dialog-widget-content .dialog-close-button']) {
    const els = await page.$$(sel);
    for (const el of els) { await el.click().catch(() => {}); }
  }
  await page.waitForTimeout(1000);

  // Explore the Elementor model tree
  const modelTree = await page.evaluate(() => {
    const e = window.elementor;
    if (!e) return { error: 'No elementor' };

    const doc = e.getPreviewContainer();
    if (!doc) return { error: 'No preview container' };

    const getInfo = (container, depth = 0) => {
      if (depth > 6) return null;
      const model = container.model;
      const settings = model?.get('settings');
      const attrs = settings?.attributes || {};

      const info = {
        id: container.id,
        elType: model?.get('elType'),
        widgetType: model?.get('widgetType'),
        childCount: container.children ? container.children.length : 0
      };

      // Collect text content
      const textFields = [];
      for (const [key, val] of Object.entries(attrs)) {
        if (typeof val === 'string' && val.length > 0 && val.length < 500) {
          textFields.push({ key, value: val.substring(0, 200) });
        }
      }
      if (textFields.length > 0) info.textFields = textFields;

      // Recurse into children
      if (container.children && container.children.length > 0) {
        info.children = [];
        container.children.forEach(child => {
          const childInfo = getInfo(child, depth + 1);
          if (childInfo) info.children.push(childInfo);
        });
      }

      return info;
    };

    return getInfo(doc);
  });

  writeFileSync(`${EVIDENCE_DIR}/elementor-model.json`, JSON.stringify(modelTree, null, 2));
  logAction(`Model tree saved. Root children: ${modelTree.childCount || modelTree.children?.length || 0}`);

  // Find carousel and Valentine slide
  function findValentineInTree(node) {
    // Check if this is a carousel
    if (node.widgetType === 'nested-carousel') {
      logAction(`Found carousel: ${node.id}, slides: ${node.childCount}`);
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) {
          const slide = node.children[i];
          if (containsValentine(slide)) {
            return { carouselId: node.id, slideId: slide.id, slideIndex: i };
          }
        }
      }
    }

    // Recurse
    if (node.children) {
      for (const child of node.children) {
        const result = findValentineInTree(child);
        if (result) return result;
      }
    }
    return null;
  }

  function containsValentine(node) {
    if (node.textFields) {
      for (const field of node.textFields) {
        if (field.value.includes('אהבה') || field.value.includes('14.2') ||
            field.value.includes('Valentine') || field.value.includes('valentine')) {
          logAction(`  Valentine text in ${node.id}: ${field.key}="${field.value.substring(0, 80)}"`);
          return true;
        }
      }
    }
    if (node.children) {
      return node.children.some(child => containsValentine(child));
    }
    return false;
  }

  const valentineInfo = findValentineInTree(modelTree);

  if (valentineInfo) {
    logAction(`\nFound Valentine slide: carousel=${valentineInfo.carouselId}, slide=${valentineInfo.slideId}, index=${valentineInfo.slideIndex}`);
    await page.screenshot({ path: `${EVIDENCE_DIR}/before-delete-slide.png`, fullPage: false });

    // Delete the slide using Elementor API
    const deleteResult = await page.evaluate((slideId) => {
      try {
        const container = window.elementor.getContainer(slideId);
        if (!container) return { error: 'Slide container not found: ' + slideId };
        window.$e.run('document/elements/delete', { container });
        return { success: true };
      } catch (e) {
        return { error: e.toString() };
      }
    }, valentineInfo.slideId);

    logAction(`Delete result: ${JSON.stringify(deleteResult)}`);

    if (deleteResult.success) {
      logAction('VALENTINE SLIDE DELETED!');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${EVIDENCE_DIR}/after-delete-slide.png`, fullPage: false });

      // Save
      logAction('Saving Elementor...');

      // Click the publish/update button
      const publishResult = await page.evaluate(() => {
        // Try the saver button
        const saverBtn = document.querySelector('#elementor-panel-saver-button-publish');
        if (saverBtn) {
          saverBtn.click();
          return 'clicked publish button';
        }
        // Try Ctrl+S approach via the $e command
        if (window.$e) {
          window.$e.run('document/save/default');
          return 'used $e.run save';
        }
        return 'no save method found';
      });
      logAction(`Save method: ${publishResult}`);
      await page.waitForTimeout(8000);
      await page.screenshot({ path: `${EVIDENCE_DIR}/after-save-elementor.png`, fullPage: false });
    }
  } else {
    logAction('COULD NOT FIND VALENTINE SLIDE IN MODEL TREE');

    // Log the first-level children of the model for debugging
    if (modelTree.children) {
      for (let i = 0; i < Math.min(5, modelTree.children.length); i++) {
        const child = modelTree.children[i];
        logAction(`  Root child ${i}: type=${child.elType}/${child.widgetType}, id=${child.id}, children=${child.childCount}`);
        if (child.children) {
          for (let j = 0; j < Math.min(5, child.children.length); j++) {
            const grandchild = child.children[j];
            logAction(`    Child ${j}: type=${grandchild.elType}/${grandchild.widgetType}, id=${grandchild.id}`);
          }
        }
      }
    }
  }

  // ================================================================
  // PART C: VERIFY
  // ================================================================
  logAction('\n=== PART C: Verify on live site ===');

  // Clear cache first
  await page.goto(`${SITE_URL}/wp-admin/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  // Visit live site
  await page.goto(`${SITE_URL}/?v=${Date.now()}`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);

  // Close popups
  const popup = await page.$('.dialog-close-button');
  if (popup) await popup.click().catch(() => {});
  await page.waitForTimeout(1000);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${EVIDENCE_DIR}/verify-final.png`, fullPage: false });

  // Check results
  const menuLinksCount = await page.$$eval('nav a, .menu-item a, .elementor-nav-menu a',
    els => els.filter(el => el.textContent.trim() === 'יום האהבה').length
  );
  const bodyText = await page.textContent('body');
  const bannerGone = !bodyText.includes('14.2') && !bodyText.includes("Valentine's Day");

  logAction('\n========== FINAL RESULTS ==========');
  logAction(`Menu "יום האהבה" links remaining: ${menuLinksCount} → ${menuLinksCount === 0 ? 'SUCCESS' : 'NEEDS REVIEW'}`);
  logAction(`Valentine banner: ${bannerGone ? 'REMOVED - SUCCESS' : 'STILL PRESENT - NEEDS REVIEW'}`);

} catch (error) {
  logAction('ERROR: ' + error.message);
  logAction(error.stack);
  await page.screenshot({ path: `${EVIDENCE_DIR}/error.png`, fullPage: false }).catch(() => {});
} finally {
  writeFileSync(`${EVIDENCE_DIR}/execution-log.txt`, log.join('\n'));
  await browser.close();
}
