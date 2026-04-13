---
name: wp-elementor-manager
description: "WordPress & Elementor site manager. Connects, builds, and maintains WordPress sites with Elementor. Handles multi-site MCP configuration, landing page creation, page design with animations, content management, and visual QA via Playwright. Actions: connect-site, build-page, design, maintain, audit, fix, update WordPress sites. Integrates Elementor MCP + Playwright MCP."
---

# WordPress & Elementor Site Manager

Unified skill for managing multiple WordPress + Elementor sites. Handles MCP connection setup, page building, design, content management, and visual QA.

## When to Apply

### Must Use
- Connecting a new WordPress site to the agent
- Building or editing Elementor pages
- Creating landing pages, homepages, or any page with Elementor
- Visual QA / debugging page rendering issues
- Managing multiple WordPress sites

### Recommended
- Auditing site design or content
- Fixing CSS/layout issues on Elementor pages
- Updating content across pages

### Skip
- Pure code development unrelated to WordPress
- Backend API work not involving WordPress

---

## Architecture

```
Agent
  |
  +-- Elementor MCP (per site)
  |     - Connects via mcp-proxy.mjs -> WP REST API
  |     - Requires: elementor-mcp plugin + app password on each site
  |
  +-- Playwright MCP (global)
  |     - Browser automation for visual QA
  |     - Login, screenshot, inspect, debug
  |
  +-- sites.json (config file)
        - Stores all connected sites
        - One source of truth for credentials
```

---

## Site Configuration

All connected sites are stored in `sites.json` in the working directory.

### sites.json Schema
```json
{
  "sites": {
    "site-alias": {
      "url": "https://example.com",
      "username": "wp-user",
      "app_password": "xxxx xxxx xxxx xxxx xxxx xxxx",
      "description": "Client site description"
    }
  },
  "defaults": {
    "mcp_protocol_version": "2024-11-05",
    "proxy_path": "path/to/mcp-proxy.mjs"
  }
}
```

---

## Connecting a New Site

### Prerequisites (on the WordPress site)
1. Install & activate the `elementor-mcp` plugin (upload the zip via WP Admin > Plugins)
2. Create an Application Password: WP Admin > Users > Profile > Application Passwords

### Steps
1. Add site to `sites.json`
2. Run the `generate-mcp-config` script to update `.mcp.json`
3. Restart Claude Code to load the new MCP server

### Generate .mcp.json Command
```bash
node generate-mcp-config.js
```
This reads `sites.json` and generates `.mcp.json` with all sites + Playwright.

---

## Page Building Workflow

### 1. Plan
- Analyze requirements (JSON spec, reference site, or user description)
- Fetch existing site content with `WebFetch` if reference URL provided
- Define sections, content, and design direction

### 2. Build
- Use `build-page` tool for full page creation in one call
- Structure: containers with widgets (heading, text-editor, button, icon-box, form, etc.)
- Always set `page_settings.template: "elementor_canvas"` for landing pages

### 3. Images
- Use `search-images` to find stock images
- Use `sideload-image` to upload to WordPress media library
- Use images from existing/reference sites when available

### 4. Gradient Background Fix
**IMPORTANT:** Elementor MCP may not generate CSS for gradient backgrounds correctly.
After building a page with gradient containers, always:
1. Open the page in Elementor editor (via Playwright or manually)
2. Use `$e.run('document/elements/settings', {...})` to re-apply gradients
3. Save via `$e.run('document/save/default')`
4. Or clear Elementor CSS cache: WP Admin > Elementor > Tools > Clear Files & Data

### 5. Visual QA
- Use Playwright to navigate and screenshot the page
- Check all sections render correctly
- Verify images load, gradients display, animations work
- Test mobile responsiveness with `browser_resize`

---

## Design Guidelines

### Color Palettes for Landing Pages
Use the UI/UX Pro Max skill for color palette selection. Popular combinations:
- **Premium Dark**: `#0F0C29` -> `#302B63` gradient + `#8B5CF6` accent
- **Warm Professional**: `#1B2A4A` base + `#E8683F` accent
- **Clean Modern**: `#FFFFFF` base + `#3B82F6` accent
- **Bold Energy**: `#1A1A2E` base + `#E94560` accent

### Typography for Hebrew Sites
- Primary: **Noto Sans Hebrew** (supports all weights)
- English headings: **Poppins** (for brand names, numbers)
- Hierarchy: H1=52-62px, H2=38-42px, H3=28-32px, H4=22-26px, Body=15-17px

### Animations (Elementor)
Available entrance animations:
- `fadeInUp`, `fadeInDown`, `fadeInRight`, `fadeInLeft`
- `zoomIn`, `bounceIn`, `slideInUp`
- Use `animation_delay` (ms) for staggered effects (0, 200, 400...)
- Hover animations: `grow`, `float`, `pulse`, `push`, `bob`

### Section Structure Pattern
```
Hero (full, gradient bg, 100vh)
  -> Logo + Nav button
  -> H1 + subtitle + CTA buttons + image
  -> Counters

Advantages (boxed, light bg)
  -> H2 + divider
  -> 3-4 icon cards in row

About (boxed, white bg)
  -> Text column + Image column

Services (boxed, dark bg)
  -> H2 + subtitle
  -> 3x2 service cards grid

CTA (full, accent gradient)
  -> H2 + text + button

Testimonials (boxed, light bg)
  -> H2 + 3 quote cards

FAQ (boxed, white bg)
  -> H2 + accordion widget

Contact (boxed, dark bg)
  -> Info column + Form column

Footer (full, darkest bg)
  -> Copyright + logo
```

---

## Troubleshooting

### Images not showing on frontend but visible in editor
- Change `image_size` to `"full"` via `update-widget`
- Ensure parent container has `min_height` set

### Gradient backgrounds not rendering
- This is a known Elementor CSS generation issue
- Fix: Re-apply via Elementor editor using `$e.run('document/elements/settings', ...)`
- Or: Add custom CSS via Elementor page settings or WordPress Customizer

### Page shows 404
- Check page status is `publish` (not `draft`)
- Or use `?preview=true` while logged in

### Elementor MCP connection failed
- Verify plugin is active on the WP site
- Check app password is correct (no extra spaces)
- Test: `curl -u "user:pass" https://site.com/wp-json/mcp/elementor-mcp-server`
