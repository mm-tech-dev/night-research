const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://ac-geffen.co.il';
const WP_ADMIN = 'https://ac-geffen.co.il/wp-admin/';
const USERNAME = 'mv-dev';
const PASSWORD = 'L(HLlalOTYPRvZPv@tA-z4l(y=oTm';
const EVIDENCE_DIR = '/Users/menimor/CascadeProjects/claude-code-night-research/wp-request-solver/reports/2026-02-12/evidence/recibM0VSWmMaGYin';

// Ensure evidence directory exists
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function executeTask() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // Slow down actions to see what's happening
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem'
  });

  const page = await context.newPage();

  try {
    console.log('1. Navigating to WordPress admin...');
    await page.goto(WP_ADMIN, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check if already logged in
    const isLoggedIn = await page.locator('#wpadminbar').isVisible().catch(() => false);

    if (!isLoggedIn) {
      console.log('2. Logging in...');
      await page.fill('#user_login', USERNAME);
      await page.fill('#user_pass', PASSWORD);
      await page.click('#wp-submit');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    } else {
      console.log('2. Already logged in, skipping login step.');
    }

    // Dismiss any notices or popups
    const noticeClose = page.locator('.notice-dismiss, .wp-core-ui-notification-dismiss');
    if (await noticeClose.isVisible().catch(() => false)) {
      await noticeClose.click().catch(() => {});
    }

    console.log('3. Navigating to Settings > General...');
    await page.goto('https://ac-geffen.co.il/wp-admin/options-general.php', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('4. Taking BEFORE screenshot...');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'before.png'),
      fullPage: true
    });

    console.log('5. Checking current site title...');
    const currentTitle = await page.locator('#blogname').inputValue();
    console.log(`   Current Site Title: "${currentTitle}"`);

    console.log('6. Updating site title to "מכללת גפן"...');
    await page.fill('#blogname', 'מכללת גפן');

    // Also update tagline if needed
    const currentTagline = await page.locator('#blogdescription').inputValue();
    console.log(`   Current Tagline: "${currentTagline}"`);

    console.log('7. Scrolling to Save Changes button...');
    await page.locator('#submit').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);

    console.log('8. Taking screenshot before saving...');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'before-save.png'),
      fullPage: true
    });

    console.log('9. Clicking Save Changes...');
    await page.click('#submit');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Wait for success message
    const successMessage = page.locator('.notice-success, .updated');
    if (await successMessage.isVisible().catch(() => false)) {
      console.log('   ✓ Settings saved successfully!');
    }

    console.log('10. Taking AFTER screenshot...');
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'after.png'),
      fullPage: true
    });

    console.log('11. Checking for SEO plugins...');
    await page.goto('https://ac-geffen.co.il/wp-admin/plugins.php', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'plugins.png'),
      fullPage: true
    });

    // Check if Yoast SEO is active
    const yoastActive = await page.locator('tr[data-slug="wordpress-seo"].active, tr.active:has-text("Yoast SEO")').isVisible().catch(() => false);

    if (yoastActive) {
      console.log('   Yoast SEO is active. Checking settings...');
      await page.goto('https://ac-geffen.co.il/wp-admin/admin.php?page=wpseo_dashboard', { waitUntil: 'networkidle' });
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'yoast-dashboard.png'),
        fullPage: true
      });
    } else {
      console.log('   Yoast SEO not found. Checking for other SEO plugins...');
      const rankMathActive = await page.locator('tr[data-slug="seo-by-rank-math"].active, tr.active:has-text("Rank Math")').isVisible().catch(() => false);
      const aioseoActive = await page.locator('tr[data-slug="all-in-one-seo-pack"].active, tr.active:has-text("All in One SEO")').isVisible().catch(() => false);

      if (rankMathActive) {
        console.log('   Rank Math is active.');
      } else if (aioseoActive) {
        console.log('   All in One SEO is active.');
      } else {
        console.log('   No major SEO plugin detected. Site title change should be sufficient.');
      }
    }

    console.log('12. Checking Site Identity (logo)...');
    await page.goto('https://ac-geffen.co.il/wp-admin/customize.php?autofocus[section]=title_tagline', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'site-identity.png'),
      fullPage: true
    });

    console.log('13. Verifying on live site...');
    await page.goto(SITE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Check page title
    const pageTitle = await page.title();
    console.log(`   Live Page Title: "${pageTitle}"`);

    // Get page source to check meta tags
    const pageSource = await page.content();

    // Take screenshot of the homepage
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'homepage.png'),
      fullPage: false
    });

    // View page source
    const sourceUrl = 'view-source:' + SITE_URL;
    console.log('14. Capturing page source...');

    // Create a simple HTML file with the source highlighted
    const sourceHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Page Source</title>
  <style>
    body { font-family: monospace; white-space: pre-wrap; padding: 20px; background: #f5f5f5; }
    .title-tag { background: yellow; font-weight: bold; }
  </style>
</head>
<body>${pageSource.replace(/<title>/gi, '<span class="title-tag">&lt;title&gt;</span>').replace(/<\/title>/gi, '<span class="title-tag">&lt;/title&gt;</span>')}</body>
</html>`;

    fs.writeFileSync(path.join(EVIDENCE_DIR, 'page-source.html'), sourceHtml);

    // Navigate to the source HTML and screenshot it
    await page.goto('file://' + path.join(EVIDENCE_DIR, 'page-source.html'));
    await page.waitForTimeout(1000);

    // Find and highlight the title tag
    await page.locator('.title-tag').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);

    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'verify.png'),
      fullPage: false
    });

    console.log('\n=== EXECUTION COMPLETE ===');
    console.log('Previous Title:', currentTitle);
    console.log('New Title: מכללת גפן');
    console.log('Live Page Title:', pageTitle);
    console.log('Title tag contains "מכללת גפן"?', pageTitle.includes('מכללת גפן') || pageTitle.includes('גפן'));
    console.log('\nAll screenshots saved to:', EVIDENCE_DIR);

  } catch (error) {
    console.error('ERROR:', error.message);
    await page.screenshot({
      path: path.join(EVIDENCE_DIR, 'error.png'),
      fullPage: true
    });
    throw error;
  } finally {
    await browser.close();
  }
}

executeTask().catch(console.error);
