# WP Request Solver — Cycle Report {{DATE}}

## Summary

| Metric | Count |
|--------|-------|
| Total Processed | {{TOTAL}} |
| ✅ Success | {{SUCCESS}} |
| ❌ Failed | {{FAILED}} |
| ⚠️ Escalated | {{ESCALATED}} |
| ⏭️ Skipped (dry-run) | {{SKIPPED}} |

## Requests

### ✅ Completed

{{FOR_EACH_SUCCESS}}
- **#{{REQUEST_NUMBER}}** — {{REQUEST_TITLE}} — {{SITE_URL}}
  - Task: {{TASK_TYPE}} | Evidence: `evidence/{{RECORD_ID}}/`
{{END_FOR_EACH}}

### ❌ Failed

{{FOR_EACH_FAILED}}
- **#{{REQUEST_NUMBER}}** — {{REQUEST_TITLE}} — {{SITE_URL}}
  - Reason: {{FAILURE_REASON}}
{{END_FOR_EACH}}

### ⚠️ Escalated (Needs Human)

{{FOR_EACH_ESCALATED}}
- **#{{REQUEST_NUMBER}}** — {{REQUEST_TITLE}} — {{SITE_URL}}
  - Reason: {{ESCALATION_REASON}}
{{END_FOR_EACH}}

## Timing

- Cycle started: {{START_TIME}}
- Cycle ended: {{END_TIME}}
- Duration: {{DURATION}}
