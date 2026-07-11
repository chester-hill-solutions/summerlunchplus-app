# Issue #453 Coverage Report

Issue: https://github.com/chester-hill-solutions/summerlunchplus-app/issues/453
Date: 2026-07-10

## Scope reviewed
- `web/app/lib/gift-cards/runner.server.ts`
- `web/app/routes/internal/gift-card-jobs.run.ts`
- `web/tests/**/*` (search for runner-related tests)

## Acceptance criteria coverage

| Acceptance criterion | Status | Evidence | Notes |
|---|---|---|---|
| Runner processes all eligible attendance/allocation rows regardless of dataset size under API row caps | Mostly covered in code | `allocateGiftCards()` and `sendDueReminders()` both use keyset paging with `.order('id', { ascending: true })`, `.limit(PAGE_SIZE)`, and `gt('id', lastId)` loops | `PAGE_SIZE` is `500`, below current Supabase API cap (`1000`) |
| No silent truncation when candidate count exceeds default PostgREST limits | Covered in code | Both loops continue until page size drops below batch size; no single unbounded fetch for attendance/allocation candidate scans | Behavior now avoids one-shot capped reads for these phases |
| Job output includes page/scan counters for troubleshooting | Partially covered | Counters (`pagesRead`, `rowsScanned`) are logged via `console.info` in allocate/reminder phases | Counters are not returned in route JSON response (`runGiftCardJobs` result) |

## Proposed fix checklist coverage

| Proposed item from issue | Status | Evidence |
|---|---|---|
| Deterministic pagination for runner scans | Covered | Keyset pagination added in both allocation and reminder scans |
| Stable ordering per page | Covered | `.order('id', { ascending: true })` in scan queries |
| Bounded batches | Covered | `const PAGE_SIZE = 500` and `.limit(PAGE_SIZE)` |
| Observability counters | Partially covered | Counters exist in logs but not in structured job return payload |
| Regression tests with > row-cap datasets | Not covered | No tests found for `runGiftCardJobs`, `allocateGiftCards`, or `sendDueReminders` |
| Optional DB-side reminder narrowing | Partially covered | Reminder query already filters by `status='allocated'` and `reminder_sent_at is null`; additional narrowing not present |

## Test coverage findings
- No unit or e2e tests currently exercise gift-card runner paging behavior.
- Existing gift-card test coverage appears limited to release logic (`web/tests/unit/gift-card-release.spec.ts`).
- This leaves paging correctness, loop termination, and large-dataset behavior unverified in automated tests.

## Gaps and risk
1. **Primary gap:** missing regression tests for pagination across pages and >1000 candidate rows.
2. **Observability gap:** counters are log-only, not included in the internal runner API response payload.
3. **Residual risk:** future refactors could regress pagination silently without tests.

## Recommended follow-up
1. Add runner-focused unit/integration tests that mock paged Supabase responses and assert all pages are processed.
2. Add at least one high-volume test fixture (>1000 attendance rows and >1000 due allocations).
3. Extend `GiftCardJobResult` to include phase-level scan counters (for example `allocationPagesRead`, `allocationRowsScanned`, `reminderPagesRead`, `reminderRowsScanned`) in JSON response, not just logs.
