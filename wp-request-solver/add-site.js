#!/usr/bin/env node
/**
 * Add a WordPress site to the Elementor MCP configuration.
 *
 * Automates the entire setup:
 *   1. Login to WP Admin with shared credentials
 *   2. Install & activate the elementor-mcp plugin (if not already installed)
 *   3. Create an Application Password via REST API
 *   4. Add the site to sites.json
 *   5. Regenerate .mcp.json
 *
 * Usage:
 *   node add-site.js <site-url> [--alias name] [--description "text"]
 *   node add-site.js https://client.example.com --alias client1
 *   node add-site.js https://client.example.com  (alias auto-generated from domain)
 *
 * Batch:
 *   node add-site.js --batch urls.txt
 *
 * Environment variables (or .env file):
 *   WP_USERNAME       Shared WordPress username (default: mv-dev)
 *   WP_PASSWORD        Shared WordPress login password
 *   PLUGIN_ZIP_PATH   Path to elementor-mcp zip (default: ./elementor-mcp-1.4.3.zip)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Try to load .env
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const [key, ...vals] = line.split('=');
      if (key && vals.length) {
        const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
        if (!process.env[key.trim()]) process.env[key.trim()] = val;
      }
    });
  }
} catch (e) { /* ignore */ }

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WP_USERNAME = process.env.WP_USERNAME || 'mv-dev';
const WP_PASSWORD = process.env.WP_PASSWORD || '';
const PLUGIN_ZIP = process.env.PLUGIN_ZIP_PATH || path.resolve(__dirname, '..', 'elementor-mcp-1.4.3.zip');
const SITES_FILE = path.resolve(__dirname, 'sites.json');
const MCP_CONFIG = path.resolve(__dirname, '.mcp.json');
const PROXY_PATH = path.resolve(__dirname, 'elementor-mcp', 'mcp-proxy.mjs');

// ---------------------------------------------------------------------------
// Parse arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
}

const batchFile = getArg('--batch');
const siteUrl = args.find(a => a.startsWith('http'));
const aliasArg = getArg('--alias');
const descArg = getArg('--description') || getArg('--desc') || '';

if (!siteUrl && !batchFile) {
  console.log(`
Usage:
  node add-site.js <site-url> [--alias name] [--description "text"]
  node add-site.js --batch urls.txt

Examples:
  node add-site.js https://client.example.com --alias client1
  node add-site.js https://client.example.com
  node add-site.js --batch sites-list.txt

The batch file should contain one URL per line, optionally followed by an alias:
  https://site1.com site1
  https://site2.com site2
  https://site3.com
`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function urlToAlias(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/\./g, '-').replace(/^www-/, '');
  } catch { return 'site'; }
}

function loadSites() {
  if (fs.existsSync(SITES_FILE)) {
    return JSON.parse(fs.readFileSync(SITES_FILE, 'utf-8'));
  }
  return {
    sites: {},
    defaults: {
      mcp_protocol_version: '2024-11-05',
      proxy_path: './elementor-mcp/mcp-proxy.mjs'
    }
  };
}

function saveSites(config) {
  fs.writeFileSync(SITES_FILE, JSON.stringify(config, null, 2) + '\n');
}

function generateMcpJson(sitesConfig) {
  const mcpConfig = {
    mcpServers: {
      playwright: {
        type: 'stdio',
        command: 'npx',
        args: ['@playwright/mcp@latest']
      }
    }
  };

  for (const [alias, site] of Object.entries(sitesConfig.sites)) {
    mcpConfig.mcpServers[`elementor-${alias}`] = {
      type: 'stdio',
      command: 'node',
      args: [PROXY_PATH],
      env: {
        WP_URL: site.url,
        WP_USERNAME: site.username,
        WP_APP_PASSWORD: site.app_password,
        MCP_PROTOCOL_VERSION: sitesConfig.defaults?.mcp_protocol_version || '2024-11-05',
        MCP_LOG_FILE: `./logs/${alias}-debug.log`
      }
    };
  }

  fs.writeFileSync(MCP_CONFIG, JSON.stringify(mcpConfig, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Main: Add a single site
// ---------------------------------------------------------------------------
async function addSite(url, alias, description) {
  url = url.replace(/\/+$/, '');
  alias = alias || urlToAlias(url);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Adding site: ${url}`);
  console.log(`Alias: ${alias}`);
  console.log(`${'='.repeat(60)}\n`);

  // Check if already exists
  const sitesConfig = loadSites();
  if (sitesConfig.sites[alias]) {
    console.log(`Site "${alias}" already exists in sites.json. Skipping.`);
    return { success: true, skipped: true, alias };
  }

  if (!WP_PASSWORD) {
    console.error('Error: WP_PASSWORD not set. Add it to .env or set as environment variable.');
    return { success: false, error: 'No password' };
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Step 1: Login
    console.log('[1/4] Logging in to WordPress...');
    await page.goto(`${url}/wp-login.php`, { timeout: 30000 });
    await page.fill('#user_login', WP_USERNAME);
    await page.fill('#user_pass', WP_PASSWORD);
    await page.click('#wp-submit');
    await page.waitForURL('**/wp-admin/**', { timeout: 15000 });
    console.log('      Logged in successfully.');

    // Step 2: Check if plugin is installed, if not - install it
    console.log('[2/4] Checking elementor-mcp plugin...');
    const pluginCheckResp = await page.evaluate(async () => {
      const resp = await fetch('/wp-json/wp/v2/plugins', {
        headers: { 'X-WP-Nonce': wpApiSettings.nonce }
      });
      if (!resp.ok) return { error: resp.status };
      const plugins = await resp.json();
      return plugins.find(p => p.textdomain === 'elementor-mcp' || p.plugin?.includes('elementor-mcp'));
    });

    if (pluginCheckResp && !pluginCheckResp.error) {
      console.log('      Plugin already installed.');
      // Activate if not active
      if (pluginCheckResp.status !== 'active') {
        console.log('      Activating plugin...');
        await page.evaluate(async (pluginFile) => {
          await fetch(`/wp-json/wp/v2/plugins/${encodeURIComponent(pluginFile)}`, {
            method: 'POST',
            headers: {
              'X-WP-Nonce': wpApiSettings.nonce,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'active' })
          });
        }, pluginCheckResp.plugin);
      }
    } else {
      // Install plugin via upload
      console.log('      Installing plugin...');
      if (!fs.existsSync(PLUGIN_ZIP)) {
        console.error(`      Error: Plugin ZIP not found at ${PLUGIN_ZIP}`);
        console.error('      Set PLUGIN_ZIP_PATH to the correct path.');
        await browser.close();
        return { success: false, error: 'Plugin ZIP not found' };
      }

      await page.goto(`${url}/wp-admin/plugin-install.php?tab=upload`);
      const fileInput = await page.locator('#pluginzip');
      await fileInput.setInputFiles(PLUGIN_ZIP);
      await page.click('#install-plugin-submit');
      await page.waitForSelector('.wrap', { timeout: 60000 });

      // Activate
      const activateLink = page.locator('a:has-text("Activate Plugin"), a:has-text("הפעלת תוסף")');
      if (await activateLink.count() > 0) {
        await activateLink.click();
        await page.waitForLoadState('domcontentloaded');
      }
      console.log('      Plugin installed and activated.');
    }

    // Step 3: Create Application Password
    console.log('[3/4] Creating Application Password...');

    // Get current user ID
    await page.goto(`${url}/wp-admin/profile.php`);

    const appPassword = await page.evaluate(async (username) => {
      // Get current user
      const meResp = await fetch('/wp-json/wp/v2/users/me', {
        headers: { 'X-WP-Nonce': wpApiSettings.nonce }
      });
      const me = await meResp.json();

      // Create application password
      const passResp = await fetch(`/wp-json/wp/v2/users/${me.id}/application-passwords`, {
        method: 'POST',
        headers: {
          'X-WP-Nonce': wpApiSettings.nonce,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Elementor MCP Agent - ' + new Date().toISOString().split('T')[0]
        })
      });

      if (!passResp.ok) {
        const err = await passResp.json();
        return { error: err.message || passResp.status };
      }

      const result = await passResp.json();
      return { password: result.password };
    }, WP_USERNAME);

    if (appPassword.error) {
      console.error(`      Error creating app password: ${appPassword.error}`);
      await browser.close();
      return { success: false, error: appPassword.error };
    }

    console.log('      Application Password created.');

    // Step 4: Save to sites.json
    console.log('[4/4] Saving configuration...');

    const freshConfig = loadSites();
    freshConfig.sites[alias] = {
      url: url,
      username: WP_USERNAME,
      app_password: appPassword.password,
      description: description || alias
    };
    saveSites(freshConfig);
    generateMcpJson(freshConfig);

    console.log(`      Saved to sites.json and regenerated .mcp.json`);
    console.log(`\n  Site "${alias}" added successfully!`);
    console.log(`  MCP server name: elementor-${alias}`);

    await browser.close();
    return { success: true, alias, serverName: `elementor-${alias}` };

  } catch (err) {
    console.error(`\n  Error: ${err.message}`);
    await browser.close();
    return { success: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Main: Batch mode
// ---------------------------------------------------------------------------
async function batchAdd(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  console.log(`\nBatch mode: ${lines.length} sites to add\n`);

  const results = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const siteUrl = parts[0];
    const siteAlias = parts[1] || null;
    const result = await addSite(siteUrl, siteAlias, '');
    results.push(result);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('BATCH RESULTS:');
  console.log(`${'='.repeat(60)}`);
  const success = results.filter(r => r.success && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const failed = results.filter(r => !r.success).length;
  console.log(`  Added: ${success}`);
  console.log(`  Skipped: ${skipped}`);
  console.log(`  Failed: ${failed}`);
  if (success > 0) {
    console.log(`\nRestart Claude Code to load the new MCP servers.`);
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
(async () => {
  if (batchFile) {
    await batchAdd(batchFile);
  } else {
    const result = await addSite(siteUrl, aliasArg, descArg);
    if (result.success && !result.skipped) {
      console.log(`\nRestart Claude Code to load the new MCP server.`);
    }
  }
})();
