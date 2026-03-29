# Elementor Editor — Playwright Automation Guide

Reference for executor agents automating Elementor page editing via Playwright.

## Opening Elementor Editor

### Method 1: From Pages List
```
1. Navigate to: {site_url}/wp-admin/edit.php?post_type=page
2. Hover over the page title
3. Click "Edit with Elementor" (appears in row actions)
```

### Method 2: Direct URL
```
Navigate to: {site_url}/?p={page_id}&elementor
OR: {site_url}/wp-admin/post.php?post={page_id}&action=elementor
```

### Method 3: From Page Editor
```
1. Open the page in WP editor
2. Click "Edit with Elementor" button (blue button near top)
```

## Waiting for Elementor to Load

**CRITICAL**: Elementor takes time to load. Never interact before it's ready.

```
1. Wait for the loading overlay to disappear: 
   - Wait until #elementor-loading is hidden/removed
   - OR wait until .elementor-editor-active class appears on body
2. Wait for the left panel to be visible:
   - Wait for #elementor-panel to be visible
3. Wait for the canvas (iframe) to load:
   - The page content is inside an iframe: #elementor-preview-iframe
```

## Elementor Structure

```
┌─────────────────────────────────────────────┐
│  Top Bar (save, undo, responsive, etc.)     │
├──────────┬──────────────────────────────────┤
│          │                                  │
│  Left    │     Canvas (iframe)              │
│  Panel   │     - Page content               │
│  (edit   │     - Widgets                    │
│  controls│     - Sections                   │
│  )       │     - Columns                    │
│          │                                  │
├──────────┴──────────────────────────────────┤
│  Bottom Bar (Update button, navigator)      │
└─────────────────────────────────────────────┘
```

**IMPORTANT**: The page content is inside an iframe (`#elementor-preview-iframe`). To interact with page elements, you must switch to the iframe context first.

## Editing Content

### Finding an Element

**Method 1: Click in Canvas**
```
1. Switch to iframe context: #elementor-preview-iframe
2. Click on the text/element you want to edit
3. The left panel will show the edit controls for that element
4. Switch back to main frame to use the panel controls
```

**Method 2: Navigator Panel**
```
1. Click the Navigator icon (layers icon) in the bottom bar
   OR press Ctrl+I / Cmd+I
2. The Navigator shows the page structure as a tree
3. Click on any element in the Navigator to select it
4. The left panel shows edit controls
```

**Method 3: Right-click**
```
1. Right-click on an element in the canvas
2. Select "Edit [Widget Name]" from context menu
```

### Editing Text (Heading, Text Editor widgets)

```
1. Click on the text element in the canvas (inside iframe)
2. The left panel shows "Content" tab with the text field
3. Edit the text in the panel's text area
   - For Heading: edit the "Title" field
   - For Text Editor: edit the WYSIWYG editor
4. Changes appear live in the canvas
```

### Editing Images

```
1. Click on the image element in the canvas
2. Left panel → Content tab → Image section
3. Click "Choose Image" to open media library
4. Upload new image or select existing
5. Click "Insert Media"
```

### Editing Buttons

```
1. Click on the button in the canvas
2. Left panel → Content tab:
   - Text: button label
   - Link: button URL
   - Icon: optional icon
3. Left panel → Style tab:
   - Typography, colors, padding, etc.
```

### Editing Sections/Columns

```
1. Click on the section handle (blue bar at top of section) in canvas
2. Left panel shows section settings:
   - Layout: content width, height, column gap
   - Style: background, border, typography
   - Advanced: margin, padding, responsive
```

## Saving Changes

```
1. Click the green "Update" button in the bottom bar
   Selector: #elementor-panel-footer-saver-publish button
   OR: .elementor-button.elementor-saver-button
2. Wait for the save confirmation (button changes briefly)
3. The page is now saved and live
```

**Alternative**: Ctrl+S / Cmd+S also saves.

## Common Elementor Tasks

### Change a Phone Number / Email / Address
```
1. Open Elementor editor for the page
2. In the canvas iframe, search for the text containing the old value
3. Click on that text element
4. In the left panel, find the text field and replace the value
5. Update (save)
```

### Add a Banner
```
1. Open Elementor editor
2. In the canvas, find where the banner should go
3. Drag a "Section" from the widget panel to the desired position
4. Add an "Image" widget inside the section
5. Upload/select the banner image
6. Adjust sizing: Style tab → Width: 100%
7. Update (save)
```

### Change Background Image
```
1. Click on the section/column
2. Left panel → Style tab → Background
3. Click on the image thumbnail
4. Choose new image from media library
5. Adjust position/size if needed
6. Update (save)
```

### Hide/Show Elements
```
1. Click on the element
2. Left panel → Advanced tab → Responsive
3. Toggle visibility for Desktop/Tablet/Mobile
4. Update (save)
```

### Change Colors/Fonts
```
1. Click on the element
2. Left panel → Style tab
3. Modify: Color, Typography (font family, size, weight)
4. Update (save)
```

## Carousel / Slider Management

### Identifying the Slider Type

WordPress sites use different slider solutions. Before editing, identify what type:

| Type | How to identify | Where to manage |
|------|----------------|----------------|
| **Elementor Slides** | Widget name "Slides" in Navigator, no shortcode | Edit in Elementor panel |
| **Elementor Image Carousel** | Widget name "Image Carousel" in Navigator | Edit in Elementor panel |
| **Smart Slider 3** | Shortcode `[smartslider3 slider=N]` in page source | WP Admin → Smart Slider |
| **Revolution Slider** | Shortcode `[rev_slider alias="..."]` or `class="rev_slider"` | WP Admin → Slider Revolution |
| **MetaSlider** | Shortcode `[metaslider id=N]` | WP Admin → MetaSlider |
| **Elementor Pro Carousel** | Widget name "Carousel" in Navigator | Edit in Elementor panel |

**How to check:** Open the page in Elementor → use Navigator (Ctrl+I) → look for the slider widget name. If it's a shortcode widget, inspect the shortcode text to identify the plugin.

### Deleting a Slide from Elementor Slides Widget

**⚠️ CRITICAL: Delete the SLIDE ITEM from the LEFT PANEL LIST — NOT the content in the canvas.**

Elementor Slides has two layers:
- The **slide item** in the left panel (this is what you DELETE)
- The **slide content** visible in the canvas/iframe (this is just the preview — deleting elements here leaves an empty slide)

If you delete a container/section/widget from inside the canvas, the slide itself still exists — it just becomes EMPTY. This is WRONG.

```
CORRECT METHOD — Delete from the LEFT PANEL:

1. Open the page in Elementor editor
2. Click on the Slides widget in the canvas (inside iframe) to select it
   → The LEFT PANEL now shows the Slides widget settings
3. In the LEFT PANEL, find the "Slides" tab / section
4. You will see a LIST of slide items — each one represents a full slide
   Each slide item shows:
   - Drag handle (≡) on the left
   - Slide title/preview in the middle
   - Delete icon (X or trash) on the right side of THAT LIST ITEM
5. Find the target slide IN THIS LIST (by its title, background image name, or content)
6. Click the X / trash icon on THAT SLIDE ITEM in the LEFT PANEL list
   → The entire slide (with all its content) is removed from the slider
7. Verify: the slide count should decrease by 1
8. Verify: the canvas preview should no longer show that slide when cycling through
9. Click "Update" to save

WRONG METHOD — DO NOT DO THIS:
❌ Clicking on content inside a slide in the canvas and pressing Delete
❌ Right-clicking a container/section inside the slide and choosing "Delete"
❌ Deleting elements from the Navigator that are INSIDE a slide
→ All of these only delete content WITHIN the slide, leaving an empty slide behind
```

### Deleting a Slide from Elementor Image Carousel

```
1. Click on the Image Carousel widget in the canvas
2. Left panel → Content tab → Image Carousel section
3. Images are listed in order
4. Find the target image
5. Hover over it → click the X to remove
6. Click "Update" to save
```

### Deleting a Slide from Smart Slider 3

```
1. Navigate to: {site_url}/wp-admin/admin.php?page=smart-slider3
2. Click on the relevant slider
3. Slides are shown as thumbnails/list
4. Find the target slide
5. Hover over the slide thumbnail → click the trash/delete icon
6. Confirm deletion
7. The slider auto-saves (or click Save)
```

### Deleting a Slide from Revolution Slider

```
1. Navigate to: {site_url}/wp-admin/admin.php?page=revslider
2. Click on the relevant slider to edit it
3. Slides appear as tabs/thumbnails at the top or side
4. Right-click the target slide tab → "Delete Slide"
   OR: hover over slide thumbnail → click delete icon
5. Confirm deletion
6. Click Save
```

### Deleting an Elementor Section

To remove an entire section (not just a slide):

```
Method 1: Right-click
1. In the canvas (inside iframe), right-click the section handle (blue bar at top)
2. Select "Delete" from context menu

Method 2: Navigator
1. Open Navigator (Ctrl+I)
2. Find the section in the tree
3. Right-click → "Delete"

Method 3: Keyboard
1. Click on the section to select it
2. Press Delete key

Always Update (save) after deleting.
```

### Safety Notes for Deletions

- **Always screenshot BEFORE deleting** — capture what the slider/section looks like
- **Delete from the LEFT PANEL, not the canvas** — deleting content inside the canvas only empties a slide, it doesn't remove it. Always delete the SLIDE ITEM from the widget's slide list in the left panel
- **Verify after deletion** — after deleting a slide, check that: (1) slide count decreased, (2) canvas preview doesn't show the deleted slide, (3) no empty slides remain
- **Count remaining slides** — if deleting leaves 0 or 1 slide, the carousel may look broken. Report this
- **Check other pages** — the same slider might be used on multiple pages (especially plugin sliders)
- **Undo in Elementor** — if you accidentally delete the wrong thing, press Ctrl+Z immediately (before saving)
- **Plugin sliders** — changes are usually instant/auto-saved. Be extra careful

## Troubleshooting

### Elementor Won't Load
- Try refreshing the page
- Check if another user is editing (lock warning)
- Try safe mode: add `?elementor&safe-mode` to URL

### Changes Not Visible on Frontend
- Clear any caching plugin (WP Super Cache, W3 Total Cache, LiteSpeed, etc.)
- Check: {site_url}/wp-admin/options-general.php for caching plugin settings
- Try: append `?nocache=1` to the frontend URL

### Element Not Clickable
- It might be overlapped by another element
- Try using the Navigator panel to select it
- Try right-clicking and selecting from the context menu

### Iframe Issues
- Remember: page content is in `#elementor-preview-iframe`
- Switch to iframe context before clicking page elements
- Switch back to main frame for panel controls
