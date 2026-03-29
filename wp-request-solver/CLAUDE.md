# WP Request Solver — Autonomous Orchestrator

Autonomous multi-agent system. Polls Airtable every hour for pending client requests (`ממתין לביצוע`), solves them on production WordPress/WooCommerce/Elementor sites using Playwright browser automation, and reports back.

## Architecture

```
Main Orchestrator (runs continuously, hourly cycles)
├── Step 1: Fetch — curl Airtable API → pending requests
├── Step 2: Claim — PATCH status → בטיפול (prevents duplicates)
├── Phase 1: Triage (1 agent per request, batches of 3, max_turns:15)
│   └── classify type + build execution plan
├── Phase 2: Execute (1 agent per request, batches of 3, max_turns:30)
│   └── Playwright: login → screenshot → act → screenshot → verify
├── Phase 3: Report Back
│   ├── PATCH Airtable → בוצע / נכשל / דורש אישור אנושי
│   └── WhatsApp for escalations
└── Sleep 1 hour → repeat
```

## Rules

1. **PRODUCTION SITES** — Every action screenshots before AND after. Never delete anything
2. **Claim before work** — PATCH `סטטוס פנייה` → `בטיפול` BEFORE dispatching agents
3. **Batching** — Triage: 3/batch. Execute: 3/batch (one per site). Wait per batch
4. **One task per site** — Never run two agents on the same WordPress site simultaneously
5. **Output → reports/** — All evidence in `reports/YYYY-MM-DD/{record_id}/`
6. **No nesting** — Main orchestrates all phases directly
7. **max_turns** — Always set on Task calls (15 triage, 30 execute) to prevent context blowout
8. **Save to disk after every batch** — NEVER hold results only in context memory
9. **Check for existing run first** — Resume partial runs, don't restart
10. **Re-run empty agents** — If a Task returns only agentId with no text, re-run immediately
11. **Escalate, don't guess** — If unsure, mark as `דורש אישור אנושי` and WhatsApp the user
12. **WhatsApp ALWAYS** — Send WhatsApp for every outcome: success, failure, and escalation
13. **Evidence to Airtable ALWAYS** — Upload ALL screenshots to `הוכחת ביצוע` for every outcome (not just success)
14. **Notes to Airtable ALWAYS** — Append Hebrew summary to `הערות אישיות פנייה` (don't overwrite — fetch current value first, then append)

## How to Run

### Full cycle (all pending requests)
Say "run the wp request solver" → read `execution-guide.md` and follow all steps.

### Single cycle (one pass, then stop)
"run one cycle of the wp request solver"

### Dry-run (triage only, no execution)
"dry-run the wp request solver"

### Single request by Airtable record ID
"execute request recXXXXXXXXXXXXXX" → read `prompts/run-single-request.md` and follow all steps.

### Single request by request number
"execute request #13775" → read `prompts/run-single-request.md` and follow all steps.

### Execute an existing triage
"execute triage reports/YYYY-MM-DD/triage/recXXXXXXXXXXXXXX.md" → read `prompts/run-single-request.md`, skip to Step 5.

## Key Files

| File | Purpose |
|------|---------|
| `execution-guide.md` | Full pipeline steps (read at runtime) |
| `prompts/run-single-request.md` | Execute ONE specific request end-to-end |
| `prompts/triage-agent.md` | Phase 1: classify request + plan |
| `prompts/executor-agent.md` | Phase 2: execute via Playwright |
| `prompts/verify-agent.md` | Phase 2b: verify on live site |
| `templates/request-report.md` | Per-request evidence report |
| `templates/run-report.md` | Full cycle summary |
| `docs/` | WP Admin, Elementor, WooCommerce guides |

## Credentials

Loaded from `.env` at runtime:
- `AIRTABLE_TOKEN` — Airtable Personal Access Token
- `WP_USERNAME` / `WP_PASSWORD` — Master WP login for all sites
- Airtable Base/Table/View IDs

## WhatsApp Notifications

Send via HTTP GET (URL-encode the message):
```
https://mgmt1.mrvsn.com/sendWhatsappMoresend.php?phone=ae8482e2-cfcd-4464-a81c-cee335415a7c&msg=ENCODED_MSG
```

Send for:
- ✅ **Success**: "פנייה #NNN בוצעה בהצלחה" + what was done
- ❌ **Failure**: "פנייה #NNN נכשלה" + reason
- 🔴 **Needs human**: "פנייה #NNN דורשת טיפול אנושי" + reason

All messages in Hebrew. Include: client name, site URL, what was done/why it failed.

## Airtable Updates (EVERY outcome)

Every PATCH call must include ALL THREE fields:
1. `סטטוס פנייה` — status (בוצע / נכשל / דורש אישור אנושי)
2. `הוכחת ביצוע` — ALL evidence screenshots as attachments
3. `הערות אישיות פנייה` — Hebrew summary APPENDED to existing value

See `docs/airtable-integration.md` for API details.
