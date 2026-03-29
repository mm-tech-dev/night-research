# Execution Guide

Step-by-step pipeline. Read by orchestrator at runtime, not loaded into context by default.

## Step 0: Load Configuration

Read credentials from `.env`:

```bash
cat wp-request-solver/.env
```

Extract these values:
- `AIRTABLE_TOKEN` — for API calls
- `AIRTABLE_BASE`, `AIRTABLE_TABLE`, `AIRTABLE_VIEW` — Airtable identifiers
- `WP_USERNAME`, `WP_PASSWORD` — WordPress login
- `MAX_PARALLEL_WORKERS` — how many agents per batch (default 3)
- `DRY_RUN` — if true, triage only, don't execute

## Step 1: Check for Previous Run (Recovery)

Before starting, check if a partial run exists for today:

```bash
DATE=$(date +%Y-%m-%d)
ls wp-request-solver/reports/$DATE/triage/ 2>/dev/null | wc -l
ls wp-request-solver/reports/$DATE/evidence/ 2>/dev/null | wc -l
```

If files exist, **resume from where it stopped** — don't re-process completed requests:
- `triage/{record_id}.md` exists → skip that request in Phase 1
- `evidence/{record_id}/after.png` exists → skip that request in Phase 2
- Check `triage/{record_id}.md` for status to know what was already reported back

## Step 2: Fetch Pending Requests from Airtable

```bash
DATE=$(date +%Y-%m-%d)
mkdir -p wp-request-solver/reports/$DATE/{triage,evidence}

curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}?view=${AIRTABLE_VIEW}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  > wp-request-solver/reports/$DATE/requests.json
```

Parse the JSON response. For each record, extract:
- `id` — Airtable record ID (for PATCH calls)
- `fields.שם פניה` — request title
- `fields.תוכן פנייה` — **full description** (what the client wants)
- `fields.אתר` — website URL (object with `.url` property)
- `fields.פתח אתר` — website URL (plain string list, fallback)
- `fields.סטטוס פנייה` — status (should be `ממתין לביצוע`)
- `fields.דחיפות` — priority (`גבוה`/`בינוני`/`נמוך`)
- `fields.שם לקוח` — client name
- `fields.דד ליין` — deadline
- `fields.סיכום` — summary
- `fields.דרייב` — Google Drive link (may have attachments)
- `fields.#` — request number

**Handle pagination**: If `offset` is present in response, fetch next page:
```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}?view=${AIRTABLE_VIEW}&offset=${OFFSET}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}"
```

**Sort by priority**: Process `דחיפות: גבוה` first, then by nearest `דד ליין`.

## Step 3: Claim Requests

For each request to process, **immediately** PATCH status to `בטיפול`:

```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"סטטוס פנייה": "בטיפול"}}'
```

This prevents other orchestrator cycles (or human workers) from picking up the same request.

**IMPORTANT**: Only claim requests you're about to process in this cycle. Don't claim all at once.

## Step 4: Read Prompt Templates

- `wp-request-solver/prompts/triage-agent.md`
- `wp-request-solver/prompts/executor-agent.md`
- `wp-request-solver/prompts/verify-agent.md`
- `wp-request-solver/docs/wp-admin-guide.md`
- `wp-request-solver/docs/elementor-guide.md`
- `wp-request-solver/docs/woocommerce-guide.md`

## Step 5: Phase 1 — Triage Agents

For each request → subagent via Task tool.
- Substitute `{{REQUEST_TITLE}}`, `{{REQUEST_CONTENT}}`, `{{SITE_URL}}`, `{{CLIENT_NAME}}`, `{{REQUEST_NUMBER}}`, `{{RECORD_ID}}` in triage-agent.md
- **Batch 3 at a time**, wait per batch
- **max_turns: 15** per agent
- Parse returned text: extract task type + execution plan + risk level

### CRITICAL: Save after EVERY batch

After each batch returns, **immediately** write each agent's output to:
`wp-request-solver/reports/YYYY-MM-DD/triage/{record_id}.md`

### Handling empty agent output

If an agent returns only an agentId with no text content, re-run immediately.

### DRY_RUN stops here

If `DRY_RUN=true`, skip Phase 2. Generate triage summary and stop.

## Step 5.5: Human Approval Gate (WhatsApp + Airtable Mobile)

**CRITICAL: NEVER skip this step. No request proceeds to execution without explicit user approval.**

This step uses a **mobile-friendly approval flow**: the agent writes the plan to Airtable, sends a WhatsApp notification, and polls Airtable until the user approves from the Airtable mobile app.

### 5.5a: Write triage plan to Airtable

For each triaged request, PATCH the record with the execution plan in `הערות אישיות פנייה` and set status to `ממתין לאישור תוכנית`:

```bash
# Build the plan summary in Hebrew
PLAN_TEXT="--- תוכנית ביצוע אוטומטית (${DATE}) ---

📋 פנייה #${REQUEST_NUMBER} — ${REQUEST_TITLE}

👤 לקוח: ${CLIENT_NAME}
🌐 אתר: ${SITE_URL}
⚡ דחיפות: ${PRIORITY}
📅 דד ליין: ${DEADLINE}

📝 מה הלקוח מבקש:
${REQUEST_CONTENT}

🔍 ניתוח:
- סוג משימה: ${TASK_TYPE}
- רמת סיכון: ${RISK_LEVEL}

📐 תוכנית ביצוע:
${STEP_BY_STEP_PLAN}

⚠️ הערות: ${NOTES}

---
✅ לאישור → שנה סטטוס ל'מאושר לביצוע' באיירטייבל
❌ לדחייה → שנה סטטוס ל'ממתין לביצוע'"

# First fetch existing notes
CURRENT_NOTES=$(curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}?fields%5B%5D=%D7%94%D7%A2%D7%A8%D7%95%D7%AA%20%D7%90%D7%99%D7%A9%D7%99%D7%95%D7%AA%20%D7%A4%D7%A0%D7%99%D7%99%D7%94" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}")

# PATCH: set status + append plan to notes
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "סטטוס פנייה": "ממתין לאישור תוכנית",
      "הערות אישיות פנייה": "EXISTING_NOTES + PLAN_TEXT"
    }
  }'
```

### 5.5b: Send notification (Discord + WhatsApp)

Send a notification with the plan summary. Check `.env` for which channels are enabled.

**Discord (primary — if `DISCORD_ENABLED=true`):**

**IMPORTANT: On Windows, Hebrew in Discord requires writing JSON to a UTF-8 file first, then sending with `--data-binary @file`.**

```python
# Step 1: Build message and write to temp file
import json
msg = f"""🔔 **תוכנית ביצוע לפנייה #{REQUEST_NUMBER}**

👤 {CLIENT_NAME} | 🌐 {SITE_URL}

📝 **מה הלקוח מבקש:**
{REQUEST_CONTENT_SHORT}

📐 **תוכנית ביצוע:**
{PLAN_STEPS_SHORT}

⚠️ סיכון: {RISK_LEVEL}

✅ **לאישור** → שנה סטטוס ל **מאושר לביצוע** באיירטייבל
❌ **לדחייה** → שנה סטטוס ל **ממתין לביצוע**"""

payload = json.dumps({"content": msg}, ensure_ascii=False)
with open('/tmp/discord_msg.json', 'w', encoding='utf-8') as f:
    f.write(payload)
```

```bash
# Step 2: Send with curl
curl -s -X POST "${DISCORD_WEBHOOK}" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @/tmp/discord_msg.json
```

**WhatsApp (fallback — if `WHATSAPP_ENABLED=true`):**
```bash
MSG="🔔 תוכנית ביצוע לפנייה #${REQUEST_NUMBER}\n\n👤 ${CLIENT_NAME}\n🌐 ${SITE_URL}\n\n📝 ${REQUEST_CONTENT_SHORT}\n\n📐 תוכנית:\n${PLAN_STEPS_SHORT}\n\n⚠️ סיכון: ${RISK_LEVEL}\n\n✅ לאישור — שנה סטטוס ל'מאושר לביצוע' באיירטייבל\n❌ לדחייה — שנה סטטוס ל'ממתין לביצוע'"
ENCODED_MSG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))")
curl -s "https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=${ENCODED_MSG}"
```

**Keep messages concise** — full details are in Airtable.

### 5.5c: Poll Airtable for approval

Poll the record status every 30 seconds. Wait up to 24 hours (configurable via `APPROVAL_TIMEOUT_HOURS` in .env, default 24).

```bash
# Poll loop
while true; do
  STATUS=$(curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}?fields%5B%5D=%D7%A1%D7%98%D7%98%D7%95%D7%A1%20%D7%A4%D7%A0%D7%99%D7%99%D7%94" \
    -H "Authorization: Bearer ${AIRTABLE_TOKEN}" | python3 -c "import sys,json; print(json.load(sys.stdin)['fields'].get('סטטוס פנייה',''))")

  case "$STATUS" in
    "מאושר לביצוע")
      echo "✅ Approved — proceeding to execution"
      break
      ;;
    "ממתין לביצוע")
      echo "❌ Rejected — skipping request"
      # Request was rejected, skip execution
      break
      ;;
    "ממתין לאישור תוכנית")
      # Still waiting, sleep 30 seconds
      sleep 30
      ;;
    *)
      echo "⚠️ Unexpected status: $STATUS"
      break
      ;;
  esac
done
```

### Handling approval responses:

| Airtable Status | Action |
|----------------|--------|
| `מאושר לביצוע` | Add to approved list → proceed to Phase 2 |
| `ממתין לביצוע` | User rejected → skip this request, do NOT execute |
| `ממתין לאישור תוכנית` (timeout) | After 24h → send WhatsApp reminder, then PATCH back to `ממתין לביצוע` |

### Multiple requests:

When processing multiple requests in a batch:
1. Write ALL triage plans to Airtable simultaneously (5.5a for all)
2. Send ONE Discord/WhatsApp summary with all pending approvals
3. Poll ALL pending records together (single API call with multiple record IDs)
4. As each is approved, queue it for Phase 2
5. Start executing approved requests while still polling for remaining approvals

### Fallback: CLI approval

If the orchestrator detects it's running interactively (not in continuous mode), also display the plan in the terminal and accept CLI approval ("אשר" / "דלג"). This allows approval from either Airtable mobile OR the terminal.

### Saving approval status:

After approval, append to the triage file:
```
=== APPROVAL ===
Status: APPROVED / REJECTED / TIMEOUT
Source: airtable / cli
Approved at: YYYY-MM-DD HH:MM
```

## Step 6: Phase 2 — Executor Agents

**Only execute requests that were approved in Step 5.5.**

For each **approved** triaged request (that isn't flagged for human and was approved in Step 5.5) → subagent via Task tool.

**CRITICAL: One agent per site at a time.** If two requests target the same site, process them sequentially, not in the same batch.

- Substitute all variables in executor-agent.md
- Include the triage output (task type + execution plan) from Phase 1
- Include relevant docs (wp-admin-guide, elementor-guide, or woocommerce-guide based on task type)
- **Batch up to 3 at a time** (different sites only), wait per batch
- **max_turns: 30** per agent (browser automation needs more turns)

Each executor agent will:
1. Navigate to `{site_url}/wp-admin/`
2. Login with WP credentials
3. Take BEFORE screenshot → save to `reports/YYYY-MM-DD/evidence/{record_id}/before.png`
4. Execute the task per the triage plan
5. Take AFTER screenshot → save to `reports/YYYY-MM-DD/evidence/{record_id}/after.png`
6. Navigate to the live frontend page
7. Take VERIFY screenshot → save to `reports/YYYY-MM-DD/evidence/{record_id}/verify.png`

### CRITICAL: Save after EVERY batch

After each batch returns, **immediately** write each agent's execution log to:
`wp-request-solver/reports/YYYY-MM-DD/evidence/{record_id}/log.md`

### Handling failures

If an executor agent reports failure or uncertainty:
- Save the error details to `evidence/{record_id}/log.md`
- Mark for escalation (don't update Airtable to בוצע)

## Step 7: Report Back to Airtable

For each completed request, do ALL of the following (regardless of outcome):

### 7a. Upload ALL evidence to `הוכחת ביצוע`

MANDATORY for every outcome. Upload all screenshots from `reports/YYYY-MM-DD/evidence/{record_id}/` to the Airtable attachment field. Airtable requires publicly accessible URLs — upload to a hosting service first.

### 7b. Append summary to `הערות אישיות פנייה`

First fetch the current value so you can append (not overwrite):
```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}?fields%5B%5D=%D7%94%D7%A2%D7%A8%D7%95%D7%AA%20%D7%90%D7%99%D7%A9%D7%99%D7%95%D7%AA%20%D7%A4%D7%A0%D7%99%D7%99%D7%94" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}"
```

Build a Hebrew summary to append:
- On SUCCESS: `--- טיפול אוטומטי (DATE) ---\n✅ בוצע בהצלחה\nמה בוצע: [actions]\nפרטים: לקוח, אתר, סוג משימה\nצילומי מסך הועלו לשדה הוכחת ביצוע`
- On FAILED: `--- טיפול אוטומטי (DATE) ---\n❌ נכשל\nסיבת הכשלון: [reason]\nפעולות שבוצעו: [actions]\nנדרש טיפול ידני`
- On NEEDS_HUMAN: `--- טיפול אוטומטי (DATE) ---\n🔴 דורש טיפול אנושי\nסיבה: [reason]\nניתוח המשימה: [triage summary]`

### 7c. PATCH Airtable — single call with status + evidence + notes

**Success:**
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "סטטוס פנייה": "בוצע",
      "הוכחת ביצוע": [
        {"url": "URL_BEFORE", "filename": "before.png"},
        {"url": "URL_AFTER", "filename": "after.png"},
        {"url": "URL_VERIFY", "filename": "verify.png"}
      ],
      "הערות אישיות פנייה": "APPENDED_SUMMARY"
    }
  }'
```

**Failure:**
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "סטטוס פנייה": "נכשל",
      "הוכחת ביצוע": [{"url": "URL_BEFORE", "filename": "before.png"}],
      "הערות אישיות פנייה": "APPENDED_SUMMARY"
    }
  }'
```

**Needs human:**
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "סטטוס פנייה": "דורש אישור אנושי",
      "הוכחת ביצוע": [{"url": "URL_SCREENSHOT", "filename": "screenshot.png"}],
      "הערות אישיות פנייה": "APPENDED_SUMMARY"
    }
  }'
```

### 7d. Send Notifications (Discord + WhatsApp)

**Discord (primary):** Write JSON to UTF-8 file, then send:
```python
import json
# Build message per outcome (SUCCESS/FAILED/NEEDS_HUMAN)
msg = f"✅ **פנייה #{REQUEST_NUMBER} בוצעה בהצלחה**\n\n👤 {CLIENT_NAME} | 🌐 {SITE_URL}\n\n📝 {SUMMARY}\n\nצילומי מסך והערות עודכנו באיירטייבל"
payload = json.dumps({"content": msg}, ensure_ascii=False)
with open('/tmp/discord_msg.json', 'w', encoding='utf-8') as f:
    f.write(payload)
```
```bash
curl -s -X POST "${DISCORD_WEBHOOK}" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data-binary @/tmp/discord_msg.json
```

**WhatsApp (fallback):**
```bash
ENCODED_MSG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))")
curl -s "https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=${ENCODED_MSG}"
```

## Step 8: Generate Cycle Report

Write a summary to `wp-request-solver/reports/YYYY-MM-DD/run-report.md` using `templates/run-report.md`.

Include:
- Total requests processed
- Success / Failed / Escalated counts
- Per-request summary (title, site, outcome)
- Links to evidence screenshots

## Step 9: WhatsApp Cycle Summary

After all requests are processed, send a WhatsApp cycle summary:

```bash
MSG="📊 סיכום מחזור WP Request Solver\n\nעובדו: ${TOTAL} פניות\n✅ הצלחה: ${SUCCESS}\n❌ נכשל: ${FAILED}\n🔴 דורש אדם: ${ESCALATED}\n\n[פירוט פניות שדורשות טיפול]"
ENCODED_MSG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))")
curl -s "https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=${ENCODED_MSG}"
```

Note: Individual per-request WhatsApp messages are already sent in Step 7. This is the cycle-level summary.

## Step 10: Sleep and Repeat

Wait for `POLL_INTERVAL_MS` (default 1 hour), then go back to Step 1.

If `RUN_ONCE=true`, stop after one cycle.

**Between cycles**: The main orchestrator session stays alive. It simply waits and then re-reads from Airtable. New requests that appeared since last cycle will be picked up.
