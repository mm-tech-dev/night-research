# WordPress Admin — Playwright Navigation Guide

Reference for executor agents automating WP Admin tasks via Playwright browser automation.

## Login Flow

```
1. Navigate to: {site_url}/wp-admin/
2. If redirected to /wp-login.php:
   - Fill #user_login with username
   - Fill #user_pass with password
   - Click #wp-submit
3. Wait for: #wpbody or .wrap (dashboard loaded)
4. Dismiss any update notices: click .notice-dismiss buttons
```

### Common Login Issues
- **Two-factor auth**: If a 2FA prompt appears, report NEEDS_HUMAN
- **Maintenance mode**: If "Briefly unavailable for scheduled maintenance", wait 30s and retry
- **Cookie expired**: If redirected back to login after submitting, try once more

## Admin Menu Navigation

The left sidebar menu. Click items by their text or CSS selectors:

| Destination | Menu Click | Submenu Click | URL Path |
|-------------|-----------|---------------|----------|
| Dashboard | `#menu-dashboard` | — | `/wp-admin/` |
| Posts | `#menu-posts` | — | `/wp-admin/edit.php` |
| Pages | `#menu-pages` | — | `/wp-admin/edit.php?post_type=page` |
| Media | `#menu-media` | — | `/wp-admin/upload.php` |
| Plugins | `#menu-plugins` | — | `/wp-admin/plugins.php` |
| Add Plugin | `#menu-plugins` | "Add New" | `/wp-admin/plugin-install.php` |
| Users | `#menu-users` | — | `/wp-admin/users.php` |
| Settings | `#menu-settings` | — | `/wp-admin/options-general.php` |
| WooCommerce | `#toplevel_page_woocommerce` | — | `/wp-admin/admin.php?page=wc-admin` |
| Products | `#menu-posts-product` | — | `/wp-admin/edit.php?post_type=product` |
| Appearance | `#menu-appearance` | — | `/wp-admin/themes.php` |
| Menus | `#menu-appearance` | "Menus" | `/wp-admin/nav-menus.php` |

**Tip**: Direct URL navigation is more reliable than clicking menus. Use `{site_url}/wp-admin/edit.php?post_type=page` instead of clicking through menus.

## Pages & Posts

### Finding a Page
```
1. Navigate to: {site_url}/wp-admin/edit.php?post_type=page
2. Use search box: #post-search-input → type page name → click #search-submit
3. Or scroll the list and find by title
4. Click the page title to edit
```

### Edit with Elementor
```
1. From the pages list, hover over the page title
2. Click "Edit with Elementor" link (appears on hover)
   OR: Navigate directly to {site_url}/?p={page_id}&elementor
   OR: From the page editor, click "Edit with Elementor" button
3. Wait for Elementor to fully load (loading overlay disappears)
```

### Edit with Classic/Gutenberg Editor
```
1. Click the page title from the list
2. Make changes in the editor
3. Click "Update" button (#publish or .editor-post-publish-button)
4. Wait for "Page updated" notice
```

## Plugins

### Install a Plugin
```
1. Navigate to: {site_url}/wp-admin/plugin-install.php
2. Type plugin name in search box: #search-plugins
3. Wait for results to load
4. Find the correct plugin card
5. Click "Install Now" button
6. Wait for button to change to "Activate"
7. Click "Activate"
8. Verify plugin appears in active plugins list
```

### Activate/Deactivate
```
1. Navigate to: {site_url}/wp-admin/plugins.php
2. Find the plugin in the list
3. Click "Activate" or "Deactivate" link
```

## Media

### Upload Media
```
1. Navigate to: {site_url}/wp-admin/upload.php
2. Click "Add New" button
3. Use file upload: drag and drop or click "Select Files"
4. Wait for upload to complete
5. Note the attachment URL for later use
```

## Settings

### General Settings
```
Navigate to: {site_url}/wp-admin/options-general.php
- Site Title: #blogname
- Tagline: #blogdescription
- Site URL: #siteurl
- Click "Save Changes" at bottom
```

### Reading Settings (Homepage)
```
Navigate to: {site_url}/wp-admin/options-reading.php
- Static front page: #page_on_front
- Posts page: #page_for_posts
```

## SEO (Yoast)

```
1. Edit the page/post
2. Scroll down to "Yoast SEO" metabox
3. Click "Edit snippet" button
4. Fill: SEO title, Slug, Meta description
5. Save the page
```

## SEO (RankMath)

```
1. Edit the page/post
2. Click the RankMath icon in the top bar (or scroll to metabox)
3. Edit: Title, Description, Focus Keyword
4. Save the page
```

## Common Patterns

### Waiting for Page Load
After any navigation, wait for the admin page to fully load:
- Wait for `#wpbody` to be visible
- Or wait for `.wrap` to be visible
- Or wait for specific element you need

### Handling Notices
WordPress shows admin notices at the top. Dismiss them:
```
Click all .notice-dismiss buttons
```

### Saving Changes
After any edit, always:
1. Click the Save/Update/Publish button
2. Wait for the success notice (usually a green bar or "updated" message)
3. Verify the change persisted by refreshing the page
