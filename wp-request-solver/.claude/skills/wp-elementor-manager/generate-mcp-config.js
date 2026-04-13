#!/usr/bin/env node
/**
 * Generate .mcp.json from sites.json
 *
 * Reads sites.json and generates a .mcp.json file with:
 * - One Elementor MCP server per site
 * - Playwright MCP for visual QA
 *
 * Usage: node generate-mcp-config.js [--output path/to/.mcp.json]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const args = process.argv.slice(2);
const outputIdx = args.indexOf('--output');
const outputPath = outputIdx !== -1 ? args[outputIdx + 1] : '.mcp.json';
const sitesPath = args.find(a => a.endsWith('.json') && a !== outputPath) || 'sites.json';

// Find sites.json
const sitesFile = resolve(process.cwd(), sitesPath);
if (!existsSync(sitesFile)) {
  console.error(`Error: ${sitesFile} not found.`);
  console.error(`\nCreate a sites.json file with this structure:`);
  console.error(JSON.stringify({
    sites: {
      "my-site": {
        url: "https://example.com",
        username: "wp-user",
        app_password: "xxxx xxxx xxxx xxxx xxxx xxxx",
        description: "My WordPress site"
      }
    },
    defaults: {
      mcp_protocol_version: "2024-11-05",
      proxy_path: "./elementor-mcp/mcp-proxy.mjs"
    }
  }, null, 2));
  process.exit(1);
}

const config = JSON.parse(readFileSync(sitesFile, 'utf-8'));
const sites = config.sites || {};
const defaults = config.defaults || {};
const proxyPath = resolve(dirname(sitesFile), defaults.proxy_path || './elementor-mcp/mcp-proxy.mjs');

// Build .mcp.json
const mcpConfig = {
  mcpServers: {
    // Playwright - always included
    playwright: {
      type: "stdio",
      command: "npx",
      args: ["@playwright/mcp@latest"]
    }
  }
};

// Add each site as a separate MCP server
for (const [alias, site] of Object.entries(sites)) {
  const serverName = `elementor-${alias}`;
  mcpConfig.mcpServers[serverName] = {
    type: "stdio",
    command: "node",
    args: [proxyPath],
    env: {
      WP_URL: site.url,
      WP_USERNAME: site.username,
      WP_APP_PASSWORD: site.app_password,
      MCP_PROTOCOL_VERSION: defaults.mcp_protocol_version || "2024-11-05",
      MCP_LOG_FILE: `./logs/${alias}-debug.log`
    }
  };
}

// Write output
const output = resolve(process.cwd(), outputPath);
writeFileSync(output, JSON.stringify(mcpConfig, null, 2) + '\n');

const siteCount = Object.keys(sites).length;
console.log(`Generated ${output}`);
console.log(`  - Playwright MCP: included`);
console.log(`  - Elementor MCP sites: ${siteCount}`);
for (const [alias, site] of Object.entries(sites)) {
  console.log(`    - elementor-${alias}: ${site.url}`);
}
console.log(`\nRestart Claude Code to load the new configuration.`);
