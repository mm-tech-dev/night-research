# Safety Guardrails — Production Sites

These rules are NON-NEGOTIABLE. Every agent must follow them.

## Core Rules

### 1. Screenshot Everything
- **BEFORE** making any change: screenshot the current state
- **AFTER** making the change: screenshot the result
- **VERIFY** on the live frontend: screenshot what the public sees
- Save all screenshots to `reports/YYYY-MM-DD/evidence/{record_id}/`

### 2. Deletion Rules
**NEVER delete these — always mark as `NEEDS_HUMAN`:**
- ❌ Posts, pages, or custom post types
- ❌ Products or product variations
- ❌ Media files (images, videos, documents)
- ❌ Plugins (deactivate only, never delete)
- ❌ Users
- ❌ WooCommerce orders
- ❌ Product categories
- ❌ Database tables

**ALLOWED to delete for `SEASONAL_CLEANUP` tasks only:**
- ✅ A specific slide/banner from a carousel/slider
- ✅ A menu item from navigation (Appearance → Menus)
- ✅ A promotional section/widget from an Elementor page

**Safety rules for allowed deletions:**
- Screenshot BEFORE deleting
- Only delete the specific item mentioned in the request
- Never delete the entire slider, menu, or page — only the specific item inside it
- If deleting would leave a carousel empty (0 slides), STOP and report to client
- Verify on frontend after deletion

### 3. One Task Per Site
- Never run two executor agents on the same WordPress site simultaneously
- The orchestrator ensures this by batching: different sites per batch
- If two requests target the same site, they run in separate batches

### 4. Claim Before Work
- PATCH Airtable status to `בטיפול` BEFORE dispatching the executor agent
- This prevents duplicate processing if another cycle starts
- If the PATCH fails, skip that request (someone else may have claimed it)

### 5. Escalate, Don't Guess
Mark as `NEEDS_HUMAN` and WhatsApp the user when:
- The request is unclear or ambiguous
- The task requires creative design decisions
- The task requires deleting content
- The executor agent encounters an unexpected error
- The site has 2FA or unusual login flow
- The change can't be verified on the frontend
- The task type is `FULL_DESIGN` or `CLIENT_CALL`

### 6. Log Everything
Every action must be logged with:
- What was done (specific steps)
- What changed (before → after)
- How to undo it (specific reversal steps)

### 7. Respect Deadlines
Process requests in priority order:
1. `דחיפות: גבוה` (high priority) first
2. Then by nearest `דד ליין` (deadline)
3. Then by request number (oldest first)

### 8. Dry-Run Mode
When `DRY_RUN=true`:
- Fetch and triage requests normally
- Do NOT execute any changes
- Do NOT claim requests (don't PATCH status)
- Generate triage reports only

## What Can Go Wrong

| Risk | Mitigation |
|------|-----------|
| Wrong page edited | Always verify page title matches before editing |
| Elementor breaks layout | Screenshot before, check after. If broken, undo |
| Plugin conflicts | After installing a plugin, check the site loads |
| Cache shows old content | Note in verification that cache may need clearing |
| Site goes down | If any 500 error, STOP immediately and escalate |
| Login fails | Try once more, then escalate |
| Concurrent editing | One-task-per-site rule prevents this |

## Undo Patterns

### Content Change
- Note the original text before changing
- To undo: edit the same element and restore original text

### Plugin Installation
- To undo: deactivate the plugin (don't delete)

### Coupon Creation
- To undo: set coupon to Draft status

### Product Price Change
- Note the original price before changing
- To undo: set price back to original value

### Image/Media Change
- Note the original image URL before changing
- To undo: set image back to original URL (old media still exists)
