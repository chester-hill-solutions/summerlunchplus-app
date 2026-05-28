# Performance Incident Template

Use this template whenever a user reports slowness, timeouts, or failed submissions.

## 1) Intake
- Reporter:
- User/account identifier:
- Environment: `production` / `staging`
- Timestamp (with timezone):
- Route/page where issue occurred:
- Action taken (button clicked / form submitted):
- Error message shown to user:
- Related identifiers (if available): `request_id`, `profile_id`, `workshop_id`, `semester_id`, `form_id`

## 2) Quick Triage
- Is this reproducible right now? `yes/no`
- Is impact broad or isolated? `single user / cohort / global`
- Severity: `low / medium / high / critical`

## 3) Router Instrumentation Review
Search logs for `[router-instrumentation]` in the incident time window.

Capture:
- `navigation_start` and `navigation_end`
- `fetcher_start` and `fetcher_end`
- `root_loader`

Record:
- Longest `fetcher_end` duration (ms):
- Longest `navigation_end` duration (ms):
- Longest `root_loader` duration (ms):

Initial classification:
- `POST/action slow`
- `redirect/loader slow`
- `both`
- `likely client/network`

## 4) Database Checks (same time window)
Run and attach outputs for:
- `pg_stat_statements` hot queries
- `pg_stat_activity` active/waiting sessions
- lock blocker query

Record:
- Slowest query fingerprint:
- Mean/max execution times:
- Any lock waits/blockers: `yes/no`
- Any statement timeouts: `yes/no`

DB classification:
- `query cost/plan`
- `lock/concurrency`
- `unclear`

## 5) Duplicate Submission Check
- Was more than one mutation request sent from one user click? `yes/no`
- Did submit lock hold for full transition (`submitting + loading`)? `yes/no`
- Any duplicate rows created? `yes/no`

## 6) Recoverability
- Is the user interaction recoverable now? `yes/no`
- Intended action:
- Did write commit? `yes/no/unknown`
- Manual remediation completed? `yes/no`
- Remediation details:

## 7) Root Cause Summary
- Primary cause:
- Contributing factors:
- Why this escaped earlier detection:

## 8) Fix Plan (map to issues)
- Immediate mitigation:
- Permanent fix:
- Related issue IDs:
  - `#199` submit lock
  - `#200` async side effects
  - `#201` index hardening
  - `#202` request correlation
  - `#203` global instrumentation
  - `#204` stage timing
  - `#205` DB observability
  - `#206` recoverability ledger
  - `#207` idempotency
  - `#208` revalidation optimization
  - `#209` network/region diagnostics
  - `#210` growth regression guardrails

## 9) Verification
- Commands/tests run:
- Before vs after timings:
- Confirmed resolved for reporter: `yes/no`

## 10) Follow-ups
- Add/update alerts:
- Add/update dashboards:
- Update docs (`AGENTS.md`, runbooks):
- Owner:
- Target date:
