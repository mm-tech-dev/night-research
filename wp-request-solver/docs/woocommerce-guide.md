# WooCommerce Admin — Playwright Automation Guide

Reference for executor agents automating WooCommerce tasks via Playwright.

## Navigation

| Destination | URL Path |
|-------------|----------|
| WooCommerce Home | `/wp-admin/admin.php?page=wc-admin` |
| Orders | `/wp-admin/edit.php?post_type=shop_order` |
| Products | `/wp-admin/edit.php?post_type=product` |
| Add Product | `/wp-admin/post-new.php?post_type=product` |
| Categories | `/wp-admin/edit-tags.php?taxonomy=product_cat&post_type=product` |
| Tags | `/wp-admin/edit-tags.php?taxonomy=product_tag&post_type=product` |
| Coupons | `/wp-admin/edit.php?post_type=shop_coupon` |
| Add Coupon | `/wp-admin/post-new.php?post_type=shop_coupon` |
| Settings | `/wp-admin/admin.php?page=wc-settings` |
| Shipping | `/wp-admin/admin.php?page=wc-settings&tab=shipping` |
| Payments | `/wp-admin/admin.php?page=wc-settings&tab=checkout` |
| Tax | `/wp-admin/admin.php?page=wc-settings&tab=tax` |
| Import Products | `/wp-admin/edit.php?post_type=product&page=product_importer` |
| **Attributes (Global)** | `/wp-admin/edit.php?post_type=product&page=product_attributes` |

## Products

### Edit a Product
```
1. Navigate to: {site_url}/wp-admin/edit.php?post_type=product
2. Search for product: #post-search-input → type name → #search-submit
3. Click product title to edit
4. Modify fields:
   - Product name: #title
   - Regular price: #_regular_price
   - Sale price: #_sale_price
   - Short description: #excerpt (or TinyMCE editor)
   - Long description: #content (main editor)
   - SKU: #_sku
   - Stock quantity: #_stock
   - Product image: #set-post-thumbnail
5. Click "Update" (#publish)
```

### Add a Product
```
1. Navigate to: {site_url}/wp-admin/post-new.php?post_type=product
2. Fill in product details (same fields as edit)
3. Set product type: #product-type (Simple, Variable, Grouped, External)
4. Set categories: check boxes in #product_catchecklist
5. Set product image: click "Set product image" in right sidebar
6. Click "Publish" (#publish)
```

### Product Types
- **Simple**: Single product, one price
- **Variable**: Has variations (size, color) — each with own price/stock
- **Grouped**: Collection of simple products
- **External/Affiliate**: Link to external site

### Variable Products — Full Detailed Guide

Variable products allow customers to choose between options (size, color, type) with different prices per option.

#### Global vs Custom Attributes — ALWAYS USE GLOBAL

| Type | Where it lives | Filterable? | Reusable? | Use when? |
|------|---------------|------------|-----------|-----------|
| **Global Attribute** ✅ | Products → Attributes page | ✅ Yes | ✅ Yes | **ALWAYS — this is the default** |
| Custom Attribute ❌ | Only inside one product | ❌ No | ❌ No | Never use this unless explicitly asked |

**RULE: Always create Global Attributes.** They allow filtering, layered navigation, and consistency across products.

#### Step 0: Create Global Attribute (BEFORE editing products)

When multiple products share the same attribute (e.g., "גודל"), create it ONCE as a global attribute:

```
PHASE 0: Create Global Attribute
──────────────────────────────────
1. Navigate to: {site_url}/wp-admin/edit.php?post_type=product&page=product_attributes
   This is the "Attributes" page under Products menu

2. CHECK IF ATTRIBUTE ALREADY EXISTS:
   - Look at the table on the right side of the page
   - It lists all existing global attributes (Name, Slug, Type, Terms)
   - If an attribute with the same name (e.g., "גודל") already exists → SKIP to Phase 0b
   - If it doesn't exist → continue to step 3

3. CREATE NEW ATTRIBUTE (left side form):
   - Name field: Type the attribute name in Hebrew (e.g., "גודל", "דגם", "סוג")
     Selector: #attribute_label
   - Slug: leave empty — WooCommerce will auto-generate
     Selector: #attribute_name
   - Type: keep default "Select"
   - Default sort order: "Custom ordering" or "Name"
     Selector: #attribute_orderby
   - Click "Add attribute" button
     Selector: input[type="submit"].button (the submit button in the left form)
   - Wait for page to reload — the new attribute appears in the right-side table

4. ADD TERMS (values) TO THE ATTRIBUTE:
   - In the right-side table, click "Configure terms" link next to the attribute name
     (This navigates to a page like: edit-tags.php?taxonomy=pa_[slug]&post_type=product)
   - For EACH variation value:
     a. In the "Name" field on the left: type the term name in Hebrew
        Example: "ענקית ללא כד", "גדולה ללא כד", "קטנה ללא כד"
        Selector: #tag-name
     b. Slug: leave empty (auto-generated)
     c. Click "Add new [attribute name]" button
        Selector: #submit (or input[type="submit"].button)
     d. Wait for the term to appear in the right-side table
     e. Repeat for ALL terms/values

   IMPORTANT: Add ALL possible values from ALL products that will use this attribute.
   For example, if products have sizes "ענקית", "גדולה", "קטנה" — add ALL three now.
```

#### Phase 0b: Add New Terms to an EXISTING Global Attribute

If the global attribute exists but is missing some terms:

```
1. Navigate to: {site_url}/wp-admin/edit.php?post_type=product&page=product_attributes
2. Find the attribute in the right-side table
3. Click "Configure terms" link
4. Add each missing term:
   - Type name in #tag-name
   - Click "Add new" button
   - Wait for it to appear in the list
5. Repeat for all missing terms
```

#### Step-by-Step: Convert Simple Product → Variable Product (with Global Attribute)

```
PHASE 1: Change Product Type
─────────────────────────────
1. Edit the product
2. In the "Product data" metabox (#woocommerce-product-data), find the dropdown at the top
   Selector: #product-type (or select.wc-product-data-type)
3. Change from "Simple product" to "Variable product"
4. The page will update — new tabs appear: "Attributes" and "Variations"
   NOTE: The old price fields (#_regular_price, #_sale_price) will disappear.
         Prices are now set per-variation.

PHASE 2: Assign Global Attribute to Product
─────────────────────────────────────────────
5. Click the "Attributes" tab
   Selector: .attribute_tab a (inside #woocommerce-product-data)
6. In the attribute dropdown at the bottom, find and select the GLOBAL attribute:
   Selector: select.attribute_taxonomy
   → The dropdown lists all global attributes by name (e.g., "גודל", "דגם")
   → Select the relevant one — NOT "Custom product attribute"
7. Click "Add" button
   Selector: button.add_attribute
8. The attribute row appears with a multi-select field showing all available terms
   - SELECT the terms (values) that apply to THIS product:
     Selector: select.wc-taxonomy-term-select (or the Select2 multi-select dropdown)
     → Click to open → check/select each relevant term
     → Or click "Select all" button if all terms apply to this product
     Selector for Select All: button.select_all_attributes
9. CHECK these two checkboxes:
   ☑ "Visible on the product page"
     Selector: input.checkbox[name*="attribute_visibility"]
   ☑ "Used for variations" — THIS IS CRITICAL
     Selector: input.checkbox[name*="attribute_variation"]
10. Click "Save attributes"
    Selector: button.save_attributes

PHASE 3: Generate Variations
─────────────────────────────
11. Click the "Variations" tab
    Selector: .variations_tab a
12. In the dropdown at the top of the tab:
    Selector: select.variation_actions (or #field_to_edit)
    → Select "Create variations from all attributes"
13. Click "Go" button
    Selector: button.do_variation_action (or input.do_variation_action)
14. An alert/popup will appear: "Are you sure you want to link all variations?"
    → Click "OK" / confirm
15. Wait for the page to update — variations will appear as collapsible rows
    Each variation shows the attribute value (e.g., "גדול", "קטן")

PHASE 4: Set Prices per Variation
──────────────────────────────────
16. For EACH variation row:
    a. Click on the variation header to EXPAND it (click the row/arrow)
       Selector: .woocommerce_variation h3 (or .wc-metabox h3)
    b. Find the "Regular price (₪)" field inside the expanded variation
       Selector: input[name*="variable_regular_price"]
    c. Type the price (number only, no ₪ symbol)
    d. Optionally set sale price: input[name*="variable_sale_price"]
    e. Optionally set stock: input[name*="variable_stock"]
    f. Optionally set SKU: input[name*="variable_sku"]
17. Repeat for ALL variations

PHASE 5: Save Everything
─────────────────────────
18. Click "Save changes" button INSIDE the Variations tab
    Selector: button.save-variation-changes (or .woocommerce_variations button.button)
    Wait for the save to complete (loading spinner disappears)
19. Click the main "Update" button to publish changes
    Selector: #publish (or input#publish)
    Wait for "Product updated." message
20. Clear cache if applicable
```

#### Adding Variations to an EXISTING Variable Product

If the product is already variable and you need to ADD more variations:

```
1. Edit the product
2. Go to "Attributes" tab
3. Find the existing attribute
4. Add new values to the Values field (append with " | ")
   Example: existing "קטן | גדול" → change to "קטן | גדול | ענק"
5. Click "Save attributes"
6. Go to "Variations" tab
7. Select "Create variations from all attributes" → "Go"
   → WooCommerce will only create the NEW variations that don't exist yet
8. Set prices for the new variations
9. Save changes + Update
```

#### Editing Existing Variation Prices

```
1. Edit the product
2. Go to "Variations" tab
3. Expand the variation you want to edit
4. Change the price in "Regular price" field
5. Click "Save changes"
6. Click "Update"
```

#### Multiple Attributes per Product

Some products need more than one attribute (e.g., Size AND Color):

```
1. After adding the first attribute, click "Add" again
2. Add the second attribute with its values
3. Save attributes
4. Generate variations → WooCommerce creates ALL COMBINATIONS
   Example: Size (S,M,L) × Color (Red,Blue) = 6 variations
5. Set price for each of the 6 variations
```

#### Common Hebrew Attribute Names

| Hebrew | English | When to use |
|--------|---------|-------------|
| גודל | Size | Physical dimensions (קטן/בינוני/גדול) |
| צבע | Color | Color options |
| דגם | Model | Different versions of same product |
| סוג | Type | General category of variation |
| מידה | Measurement | Clothing/shoe sizes |
| משקל | Weight | Weight-based pricing |
| כמות | Quantity | Pack size (1/3/6/12) |
| חומר | Material | Material type |
| גובה | Height | Height variations |

#### Troubleshooting Variable Products

| Problem | Solution |
|---------|----------|
| "Used for variations" checkbox missing | Make sure product type is "Variable product" first |
| No variations generated | Check that "Used for variations" is checked for the attribute |
| Price shows as blank on frontend | Make sure each variation has a Regular Price set |
| "Select options" button instead of "Add to cart" | This is normal for variable products — customer must choose a variation |
| Variation dropdown empty on frontend | Clear cache, check that variations are published (not draft) |
| Old simple price still showing | Old price fields are gone for variable products — check variation prices |

## Coupons

### Create a Coupon
```
1. Navigate to: {site_url}/wp-admin/post-new.php?post_type=shop_coupon
2. Coupon code: #title (the code customers enter)
3. General tab:
   - Discount type: #discount_type (percent/fixed_cart/fixed_product)
   - Coupon amount: #coupon_amount
   - Allow free shipping: #free_shipping
   - Expiry date: #expiry_date
4. Usage restriction tab:
   - Minimum spend: #minimum_amount
   - Maximum spend: #maximum_amount
   - Individual use only: #individual_use
   - Exclude sale items: #exclude_sale_items
   - Products: #product_ids (search and select)
   - Exclude products: #exclude_product_ids
   - Categories: product_categories field
5. Usage limits tab:
   - Usage limit per coupon: #usage_limit
   - Usage limit per user: #usage_limit_per_user
6. Click "Publish" (#publish)
```

### Edit a Coupon
```
1. Navigate to: {site_url}/wp-admin/edit.php?post_type=shop_coupon
2. Find the coupon in the list or search
3. Click to edit
4. Modify fields as above
5. Click "Update"
```

## CSV Product Import

### Import Products from CSV
```
1. Navigate to: {site_url}/wp-admin/edit.php?post_type=product&page=product_importer
2. Click "Choose File" to upload CSV
3. Click "Continue"
4. Column mapping screen:
   - Map CSV columns to WooCommerce fields
   - Common mappings: Name, SKU, Regular price, Sale price, Categories, Images, Description
5. Click "Run the importer"
6. Wait for import to complete
7. Review results: imported, updated, skipped, failed counts
```

### CSV Format
Standard WooCommerce CSV columns:
- `Name` — Product name
- `SKU` — Unique identifier
- `Regular price` — Full price
- `Sale price` — Discounted price (optional)
- `Categories` — Category names, comma-separated
- `Images` — Image URLs, comma-separated
- `Short description` — Brief description
- `Description` — Full description
- `Stock` — Quantity
- `Type` — simple, variable, grouped, external

## Settings

### General Settings
```
Navigate to: {site_url}/wp-admin/admin.php?page=wc-settings
- Store address, currency, selling locations
- Click "Save changes"
```

### Shipping
```
Navigate to: {site_url}/wp-admin/admin.php?page=wc-settings&tab=shipping
- Shipping zones: add/edit zones
- Shipping methods per zone: flat rate, free shipping, local pickup
- Click "Save changes"
```

### Payments
```
Navigate to: {site_url}/wp-admin/admin.php?page=wc-settings&tab=checkout
- Enable/disable payment gateways
- Configure gateway settings
- Click "Save changes"
```

## Sales & Promotions

### Set a Product on Sale
```
1. Edit the product
2. Set #_sale_price (must be less than #_regular_price)
3. Optionally set sale schedule: click "Schedule" link
   - Sale start date: #_sale_price_dates_from
   - Sale end date: #_sale_price_dates_to
4. Update the product
```

### Bulk Edit Products
```
1. Navigate to Products list
2. Check boxes for products to edit
3. Select "Edit" from Bulk Actions dropdown
4. Click "Apply"
5. Modify: price, category, stock status, etc.
6. Click "Update"
```

## Common Issues

### Product Not Showing on Frontend
- Check: Is the product published? (not draft)
- Check: Is it in stock?
- Check: Is the catalog visibility set to "Shop and search results"?
- Check: Is it assigned to a category that's displayed?

### Coupon Not Working
- Check: Is the coupon published?
- Check: Has it expired?
- Check: Usage limit reached?
- Check: Minimum spend met?
- Check: Product/category restrictions match the cart?

### Import Failures
- Check CSV encoding (UTF-8 with BOM for Hebrew)
- Check column headers match WooCommerce expected names
- Check image URLs are accessible
- Check for duplicate SKUs
