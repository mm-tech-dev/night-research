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

## Step 6: Phase 2 — Executor Agents

For each triaged request (that isn't flagged for human) → subagent via Task tool.

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

### 7d. Send WhatsApp

```bash
# Success
MSG="✅ פנייה #${REQUEST_NUMBER} בוצעה בהצלחה\n\nלקוח: ${CLIENT_NAME}\nאתר: ${SITE_URL}\nמה בוצע: [summary]\n\nצילומי מסך והערות עודכנו באיירטייבל"

# Failure
MSG="❌ פנייה #${REQUEST_NUMBER} נכשלה\n\nלקוח: ${CLIENT_NAME}\nאתר: ${SITE_URL}\nסיבה: [reason]\n\nנדרש טיפול ידני"

# Needs human
MSG="🔴 פנייה #${REQUEST_NUMBER} דורשת טיפול אנושי\n\nלקוח: ${CLIENT_NAME}\nאתר: ${SITE_URL}\nסיבה: [reason]\n\nתיאור: ${REQUEST_TITLE}"

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
