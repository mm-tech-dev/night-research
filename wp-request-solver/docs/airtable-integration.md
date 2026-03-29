# Airtable Integration Guide

API reference for the orchestrator's Airtable interactions.

## Connection Details

- **Base ID**: `app0ZP7QIJFt8KEAE`
- **Table ID**: `tbl03dHmbFXsinc5H`
- **View ID**: `viwTOfib6NRerNXGN` (pre-filtered for pending requests)
- **Auth**: Personal Access Token (Bearer token)

## Fetch Pending Requests

```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}?view=${AIRTABLE_VIEW}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}"
```

### Response Structure

```json
{
  "records": [
    {
      "id": "recXXXXXXXXXXXXXX",
      "fields": {
        "שם פניה": "Request title",
        "תוכן פנייה": "Full description (Hebrew)",
        "אתר": {"label": "עבור לאתר", "url": "https://example.com"},
        "פתח אתר": ["https://example.com"],
        "סטטוס פנייה": "ממתין לביצוע",
        "דחיפות": "בינוני",
        "שם לקוח": ["Client Name"],
        "דד ליין": "2025-12-29",
        "סיכום": "Summary text...",
        "דרייב": {"label": "פתח דרייב", "url": "https://drive.google.com/..."},
        "#": 12624,
        "recId": "recXXXXXXXXXXXXXX"
      }
    }
  ],
  "offset": "itr..." 
}
```

### Pagination

If `offset` is present, fetch next page:
```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}?view=${AIRTABLE_VIEW}&offset=${OFFSET}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}"
```

Repeat until no `offset` in response.

### Extracting Website URL

The site URL can be in two fields:
1. `אתר` — object: `{"label": "...", "url": "https://example.com"}` → use `.url`
2. `פתח אתר` — array: `["https://example.com"]` → use `[0]`

Prefer `אתר.url`, fall back to `פתח אתר[0]`.

## Field Reference

### Key Fields for Processing

| Field (Hebrew) | English | Type | Notes |
|----------------|---------|------|-------|
| `שם פניה` | Request name | string | Title with assignee + client + type |
| `תוכן פנייה` | Request content | string | **Primary**: what the client wants |
| `אתר` | Website | url object | `{label, url}` |
| `פתח אתר` | Open website | string[] | Plain URL |
| `סטטוס פנייה` | Request status | string | Status field |
| `דחיפות` | Urgency | string | `גבוה`/`בינוני`/`נמוך` |
| `רמת פנייה` | Request level | string | `❗ רגיל` etc. |
| `שם לקוח` | Client name | string[] | Linked record |
| `דד ליין` | Deadline | date string | `YYYY-MM-DD` |
| `סיכום` | Summary | string | Auto-generated summary |
| `דרייב` | Drive | url object | Google Drive attachments |
| `#` | Number | int | Request number |
| `recId` | Record ID | string | Airtable record ID |
| `מחלקה` | Department | string[] | e.g., `תחזוקת אתרים` |
| `נושא הפנייה` | Topic | string[] | Linked record |
| `הוכחת ביצוע` | Proof of execution | attachment[] | Upload evidence screenshots here |
| `הערות אישיות פנייה` | Personal notes | string (long text) | Append Hebrew summary of what was done |

### Status Values

| Hebrew | English | Meaning |
|--------|---------|---------|
| `ממתין לביצוע` | Waiting for execution | **Pick up these** |
| `בטיפול` | In progress | Claimed by orchestrator |
| `בוצע` | Completed | Successfully done |
| `נכשל` | Failed | Execution failed |
| `דורש אישור אנושי` | Needs human approval | Escalated |

## Claim a Request (PATCH Status)

```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"סטטוס פנייה": "בטיפול"}}'
```

## Update Status After Execution

### Success
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"סטטוס פנייה": "בוצע"}}'
```

### Failure
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"סטטוס פנייה": "נכשל"}}'
```

### Needs Human
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"סטטוס פנייה": "דורש אישור אנושי"}}'
```

## Upload Evidence to `הוכחת ביצוע` (Attachments)

**MANDATORY for every outcome** (success, failure, needs_human). Upload all screenshots to the Airtable attachment field.

Airtable attachments require **publicly accessible URLs**. The PATCH call includes both status update and attachments:

```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "סטטוס פנייה": "בוצע",
      "הוכחת ביצוע": [
        {"url": "https://PUBLIC_URL/before.png", "filename": "before.png"},
        {"url": "https://PUBLIC_URL/after.png", "filename": "after.png"},
        {"url": "https://PUBLIC_URL/verify.png", "filename": "verify.png"}
      ]
    }
  }'
```

**If files are local only** (no public URL), just update the status without attachments:
```bash
curl -s -X PATCH "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields": {"סטטוס פנייה": "בוצע"}}'
```

## Append Notes to `הערות אישיות פנייה`

**MANDATORY for every outcome.** This field is a long text field. You must **append** to the existing value, never overwrite.

### Step 1: Fetch current value
```bash
curl -s "https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${RECORD_ID}?fields%5B%5D=%D7%94%D7%A2%D7%A8%D7%95%D7%AA%20%D7%90%D7%99%D7%A9%D7%99%D7%95%D7%AA%20%D7%A4%D7%A0%D7%99%D7%99%D7%94" \
  -H "Authorization: Bearer ${AIRTABLE_TOKEN}"
```

Extract `fields.הערות אישיות פנייה` from the response (may be null/empty).

### Step 2: Build appended value

Append a separator and the new summary:
```
[existing text]

--- טיפול אוטומטי (YYYY-MM-DD) ---
[✅/❌/🔴] [סטטוס]

מה בוצע:
- [פעולה 1]
- [פעולה 2]

פרטים:
- לקוח: [name]
- אתר: [url]
- סוג משימה: [type]
- צילומי מסך הועלו לשדה הוכחת ביצוע
```

### Step 3: Include in PATCH call

Include the full appended text in the same PATCH call as status and evidence:
```json
{
  "fields": {
    "סטטוס פנייה": "בוצע",
    "הוכחת ביצוע": [{"url": "..."}],
    "הערות אישיות פנייה": "FULL_APPENDED_TEXT"
  }
}
```

## WhatsApp Notifications

Send notifications via HTTP GET to the Morevision WhatsApp endpoint.

**Endpoint:**
```
https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=URL_ENCODED_MSG
```

**URL-encode the message** using python3:
```bash
MSG="ההודעה בעברית"
ENCODED_MSG=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$MSG'))")
curl -s "https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=${ENCODED_MSG}"
```

**Message templates:**

| Outcome | Emoji | Message |
|---------|-------|---------|
| Success | ✅ | `פנייה #NNN בוצעה בהצלחה` + לקוח + אתר + מה בוצע |
| Failure | ❌ | `פנייה #NNN נכשלה` + לקוח + אתר + סיבה |
| Needs human | 🔴 | `פנייה #NNN דורשת טיפול אנושי` + לקוח + אתר + סיבה |
| Cycle summary | 📊 | `סיכום מחזור` + סה"כ עובדו/הצלחה/נכשל/אנושי |

All messages must be in **Hebrew**.

## Rate Limits

Airtable API rate limit: **5 requests per second per base**.

The orchestrator should:
- Add a small delay between PATCH calls (200ms)
- Not fetch more than 100 records per page (Airtable default)
- Handle 429 (rate limit) responses by waiting and retrying
