# Run Single Request

Execute one specific client request. Use this when you want to process a single Airtable request instead of running a full cycle.

## Usage (say one of these in Claude Code CLI)

### Option A: Execute a specific Airtable record by ID
```
execute request recXXXXXXXXXXXXXX
```

### Option B: Execute from an existing triage file
```
execute triage reports/YYYY-MM-DD/triage/recXXXXXXXXXXXXXX.md
```

### Option C: Fetch and execute a specific request number
```
execute request #13775
```

---

## When you hear "execute request {RECORD_ID}" or "execute request #{NUMBER}"

Follow these steps:

### Step 1: Load credentials
```bash
cat .env
```

### Step 2: Fetch the request from Airtable (skip if triage file provided)

**By record ID:**
```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}"
```

**By request number** (search all records for matching `#` field):
```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}?filterByFormula=%7B%23%7D%3D${REQUEST_NUMBER}&view=${AIRTABLE_VIEW}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}"
```

Extract from the response:
- `id` → record ID
- `fields.תוכן פנייה` → what the client wants
- `fields.אתר.url` or `fields.פתח אתר[0]` → site URL
- `fields.שם לקוח` → client name
- `fields.#` → request number
- `fields.דחיפות` → priority
- `fields.דד ליין` → deadline
- `fields.סיכום` → summary
- `fields.דרייב.url` → drive link (attachments)

### Step 3: Claim the request
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"סטטוס פנייה": "בטיפול"}}'
```

### Step 4: Triage (skip if triage file provided)

Read `prompts/triage-agent.md`. Substitute the variables and classify the request:
- Task type (CONTENT_UPDATE, TECH_FIX, SEO_UPDATE, etc.)
- Risk level (LOW/MEDIUM/HIGH)
- Step-by-step execution plan

Save triage to:
```bash
DATE=$(date +%Y-%m-%d)
mkdir -p reports/$DATE/triage
# Write triage result to reports/$DATE/triage/${RECORD_ID}.md
```

### Step 5: Check if automatable

If triage says `Automatable: NO` or `Risk Level: HIGH`:
- PATCH Airtable status → `דורש אישור אנושי`
- **Send WhatsApp escalation:**
```bash
MSG="🔴 פנייה #${REQUEST_NUMBER} דורשת טיפול אנושי\n\nלקוח: ${CLIENT_NAME}\nאתר: ${SITE_URL}\nסיבה: [reason from triage]\n\nתיאור: ${REQUEST_TITLE}"
ENCODED_MSG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))")
curl -s "https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=${ENCODED_MSG}"
```
- STOP — do not execute

### Step 6: Execute

Read `prompts/executor-agent.md` and the relevant docs:
- `docs/wp-admin-guide.md` (always)
- `docs/elementor-guide.md` (if task involves Elementor)
- `docs/woocommerce-guide.md` (if task involves WooCommerce)

Then:
```bash
DATE=$(date +%Y-%m-%d)
mkdir -p reports/$DATE/evidence/${RECORD_ID}
```

1. **Login** to `{site_url}/wp-admin/` with credentials from .env
2. **Screenshot BEFORE** → `reports/$DATE/evidence/${RECORD_ID}/before.png`
3. **Execute** the triage plan step by step
4. **Screenshot AFTER** → `reports/$DATE/evidence/${RECORD_ID}/after.png`
5. **Verify** on live site → `reports/$DATE/evidence/${RECORD_ID}/verify.png`

Save execution log to `reports/$DATE/evidence/${RECORD_ID}/log.md`

### Step 7: Report back to Airtable

**ALWAYS do all 3 sub-steps regardless of outcome (success/fail/needs_human).**

#### 7a. Upload ALL evidence files to `הוכחת ביצוע` attachment field

This is MANDATORY for every outcome. Collect all files from `reports/$DATE/evidence/${RECORD_ID}/` (before.png, after.png, verify.png, and any other screenshots taken during execution).

Airtable attachments require publicly accessible URLs. Upload evidence files to a hosting service first, then include the URLs in the PATCH call.

#### 7b. Build the summary note for `הערות אישיות פנייה`

Write a Hebrew summary of what happened. This gets **appended** to the existing field value (don't overwrite).

First, fetch the current value of `הערות אישיות פנייה`:
```bash
CURRENT=$(curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}?fields%5B%5D=%D7%94%D7%A2%D7%A8%D7%95%D7%AA%20%D7%90%D7%99%D7%A9%D7%99%D7%95%D7%AA%20%D7%A4%D7%A0%D7%99%D7%99%D7%94" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}")
```

Then build the new value by appending:

**On SUCCESS:**
```
SUMMARY="[existing value]\n\n--- טיפול אוטומטי (${DATE}) ---\n✅ בוצע בהצלחה\n\nמה בוצע:\n[list each action taken in Hebrew]\n\nפרטים:\n- לקוח: ${CLIENT_NAME}\n- אתר: ${SITE_URL}\n- סוג משימה: ${TASK_TYPE}\n- צילומי מסך הועלו לשדה הוכחת ביצוע"
```

**On FAILED:**
```
SUMMARY="[existing value]\n\n--- טיפול אוטומטי (${DATE}) ---\n❌ נכשל\n\nסיבת הכשלון:\n[reason in Hebrew]\n\nפעולות שבוצעו לפני הכשלון:\n[list actions]\n\nנדרש טיפול ידני"
```

**On NEEDS_HUMAN:**
```
SUMMARY="[existing value]\n\n--- טיפול אוטומטי (${DATE}) ---\n🔴 דורש טיפול אנושי\n\nסיבה:\n[why it needs human in Hebrew]\n\nניתוח המשימה:\n[triage summary]"
```

#### 7c. PATCH Airtable — status + evidence + notes (single call)

**On SUCCESS:**
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "סטטוס פנייה": "בוצע",
      "הוכחת ביצוע": [
        {"url": "PUBLIC_URL_TO_BEFORE_PNG", "filename": "before.png"},
        {"url": "PUBLIC_URL_TO_AFTER_PNG", "filename": "after.png"},
        {"url": "PUBLIC_URL_TO_VERIFY_PNG", "filename": "verify.png"}
      ],
      "הערות אישיות פנייה": "APPENDED_SUMMARY_TEXT"
    }
  }'
```

**On FAILED:**
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "סטטוס פנייה": "נכשל",
      "הוכחת ביצוע": [
        {"url": "PUBLIC_URL_TO_BEFORE_PNG", "filename": "before.png"},
        {"url": "PUBLIC_URL_TO_AFTER_PNG", "filename": "after.png"}
      ],
      "הערות אישיות פנייה": "APPENDED_SUMMARY_TEXT"
    }
  }'
```

**On NEEDS_HUMAN:**
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "סטטוס פנייה": "דורש אישור אנושי",
      "הוכחת ביצוע": [
        {"url": "PUBLIC_URL_TO_SCREENSHOT", "filename": "screenshot.png"}
      ],
      "הערות אישיות פנייה": "APPENDED_SUMMARY_TEXT"
    }
  }'
```

#### 7d. Send WhatsApp notification

**On SUCCESS:**
```bash
MSG="✅ פנייה #${REQUEST_NUMBER} בוצעה בהצלחה\n\nלקוח: ${CLIENT_NAME}\nאתר: ${SITE_URL}\nמה בוצע: [one-line Hebrew summary]\n\nצילומי מסך והערות עודכנו באיירטייבל"
ENCODED_MSG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))")
curl -s "https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=${ENCODED_MSG}"
```

**On FAILED:**
```bash
MSG="❌ פנייה #${REQUEST_NUMBER} נכשלה\n\nלקוח: ${CLIENT_NAME}\nאתר: ${SITE_URL}\nסיבה: [reason in Hebrew]\n\nנדרש טיפול ידני"
ENCODED_MSG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))")
curl -s "https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=${ENCODED_MSG}"
```

**On NEEDS_HUMAN:**
```bash
MSG="🔴 פנייה #${REQUEST_NUMBER} דורשת טיפול אנושי\n\nלקוח: ${CLIENT_NAME}\nאתר: ${SITE_URL}\nסיבה: [reason in Hebrew]\n\nתיאור: ${REQUEST_TITLE}"
ENCODED_MSG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))")
curl -s "https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=${ENCODED_MSG}"
```

### Step 8: Summary

Print a summary:
```
✅ Request #XXXXX — [title]
Site: [url]
Task: [type]
Status: SUCCESS/FAILED/NEEDS_HUMAN
Evidence: reports/YYYY-MM-DD/evidence/{record_id}/
Airtable: evidence uploaded ✓ | notes appended ✓ | status updated ✓
WhatsApp: sent ✓
```

---

## When you hear "execute triage {PATH}"

Skip Steps 2-4. Read the triage file directly and jump to Step 5 (check automatable) → Step 6 (execute).

The triage file contains the record ID, site URL, task type, and execution plan.

---

## Safety Reminders

- **PRODUCTION SITE** — screenshot before every change
- **Never delete** anything
- **If unsure, STOP** — mark as needs human, don't guess
- Read `docs/safety-guardrails.md` if needed
