# WP Request Solver — Autonomous Orchestrator

An autonomous multi-agent system built on [Claude Code](https://claude.ai/claude-code) that polls Airtable for pending client requests and solves them on production WordPress/WooCommerce/Elementor sites using Playwright browser automation. Runs continuously — every hour it picks up new tasks, triages them, executes via browser, verifies, and reports back.

## How It Works

```
Main Orchestrator (runs continuously, hourly cycles)
│
├── Fetch — curl Airtable API → pending requests (ממתין לביצוע)
├── Claim — PATCH status → בטיפול (prevents duplicates)
├── Triage — 1 agent per request (batches of 3, max_turns:15)
│   └── classify type + build execution plan
├── Execute — 1 agent per request (batches of 3, max_turns:30)
│   └── Playwright: login → screenshot → act → screenshot → verify
├── Report — PATCH Airtable → בוצע / נכשל / דורש אישור אנושי
│   └── WhatsApp for escalations
└── Sleep 1 hour → repeat
```

**Parallel by site** — multiple sites worked simultaneously, but only ONE task per site at a time.

## Usage

Open Claude Code in this directory and say:

```
run the wp request solver
```

For a single cycle: `run one cycle of the wp request solver`
For dry-run (triage only): `dry-run the wp request solver`

## Project Structure

```
wp-request-solver/
├── CLAUDE.md                      # Orchestration rules (loaded into context)
├── execution-guide.md             # Full pipeline steps (read at runtime)
├── prompts/
│   ├── triage-agent.md            # Phase 1: classify request + plan
│   ├── executor-agent.md          # Phase 2: execute via Playwright
│   └── verify-agent.md            # Phase 2b: verify on live site
├── templates/
│   ├── request-report.md          # Per-request evidence report
│   └── run-report.md              # Full cycle summary
├── docs/
│   ├── wp-admin-guide.md          # WP Admin navigation for Playwright
│   ├── elementor-guide.md         # Elementor editor automation
│   ├── woocommerce-guide.md       # WooCommerce admin patterns
│   ├── airtable-integration.md    # Airtable API + field mapping
│   └── safety-guardrails.md       # Production safety rules
├── .env                           # Credentials (gitignored)
├── .env.example                   # Template
├── .gitignore
└── reports/                       # Generated output (gitignored)
    └── YYYY-MM-DD/
        ├── requests.json          # Fetched requests
        ├── triage/                # Triage results per request
        ├── evidence/              # Before/after screenshots
        └── run-report.md          # Cycle summary
```

## Requirements

- [Claude Code CLI](https://claude.ai/claude-code)
- Playwright (used by Claude Code for browser automation)
- WhatsApp skill configured (for escalation, optional)

## Safety

- Screenshots before AND after every change
- Never deletes anything (posts, pages, products, plugins)
- One task per site — no concurrent edits
- Escalates to human via WhatsApp when unsure
- Dry-run mode for testing

## License

MIT
