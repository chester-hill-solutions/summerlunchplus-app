# Issue #445 Investigation and Implementation Plan

Issue: https://github.com/chester-hill-solutions/summerlunchplus-app/issues/445
Date: 2026-07-10
Status: Investigation complete, implementation not started

## Current state (what already exists)

- Inventory source of truth exists in `public.gift_card_asset` with provider and status enums (`available`, `allocated`, `sent`, `opened`, `used`, `invalid`) in `supabase/schemas/06_gift_cards.sql`.
- Manage UI already renders status totals from `gift_card_asset` in `web/app/routes/manage/gift-cards.tsx`.
- Gift-card automation already runs every 5 minutes through:
  - scheduler cron (`scheduler/crontab` + `scheduler/scripts/gift-card-jobs.sh`)
  - web internal route `POST /internal/gift-card-jobs/run` (`web/app/routes/internal/gift-card-jobs.run.ts`)
  - runner orchestration (`web/app/lib/gift-cards/runner.server.ts`)
- Email pipeline already supports idempotent sends via `eventKey` and persisted `email_message` records in `web/app/lib/email/send-email.server.ts`.
- Published markdown drafts are already resolved by template key, and transactional drafts already exist for related reminders.

## Gaps against issue #445

1. No near-term/upcoming demand projection is computed or shown.
2. No low-inventory threshold configuration exists (env or DB settings).
3. No scheduler-run low-inventory alert step exists.
4. No "state-change" dedupe layer exists for low-inventory alerts (only one-shot dedupe by exact `eventKey`).
5. No dedicated docs for threshold configuration/testing.

## Recommended design decisions

### 1) Demand model

Use two demand buckets per provider:

- `near_term_demand` (high confidence):
  - attendance rows that are already gift-card-eligible (`camera_on=true` or `photo_status in ('accepted','uploaded')`), not blocked, and do not yet have a `gift_card_allocation`.
  - This aligns with current allocation rules in `allocateGiftCards()`.
- `upcoming_demand` (planning):
  - approved enrollments tied to workshops/classes in a bounded horizon (recommended: next 14 days), excluding profiles already counted in near-term.

Provider split should follow the same preference resolver used by runner logic (`loadWorkshopEnrollmentEnrichment` + `giftcard_display` mapping):

- `Sobeys` -> Sobeys
- `PC` or unknown -> PC
- `Meal Kit` -> excluded from gift-card demand

### 2) Threshold configuration

Recommended phase-1 approach: env-based thresholds (fastest, no UI/editor dependency).

- `GIFT_CARD_LOW_THRESHOLD_PC`
- `GIFT_CARD_LOW_THRESHOLD_SOBEYS`

Optional phase-2: migrate to DB-backed settings if non-developer runtime edits are required.

### 3) Alert dedupe semantics (state transition)

Issue requires "duplicate alerts prevented unless state changes." The safest implementation is explicit state tracking.

Add table (schema source file) with one row per provider:

- `provider` (PK)
- `is_low` (bool)
- `last_inventory_count`
- `last_threshold`
- `last_alerted_at`
- `last_recovered_at`
- `updated_at`

Send alert only when transition is `false -> true`. Do not send on repeated low runs. When counts recover (`true -> false`), persist recovery state so a later drop can alert again.

## Implementation plan

## A. Inventory + demand summary for admin view

1. Add server-side helper in `web/app/lib/gift-cards/` (new module) to compute:
   - inventory counts by provider/status
   - low-threshold status per provider
   - near-term and upcoming demand per provider
2. Update `web/app/routes/manage/gift-cards.tsx` loader to call helper and expose:
   - inventory totals
   - demand projection totals
   - "below threshold" indicators
3. Keep existing table rows intact; add a compact summary panel above the table.

## B. Scheduler/runner alert step

1. Add a new runner phase in `runGiftCardJobs()` after allocation/backfill/reminders:
   - compute current provider inventory (`available` count at minimum)
   - compare against thresholds
   - load/update provider alert state table
2. On low transition, send email via `sendTemplateEmail` using a new template key (for draft migration compatibility):
   - suggested key: `gift_card_inventory_low_v1`
   - include provider, available count, threshold, near-term demand, upcoming demand
3. Use deterministic event key for the transition event, for example:
   - `gift-card-inventory-low:${provider}:${threshold}:${stateChangedAtIso}`
   - state table drives transition detection; `eventKey` still guards retry duplicate sends.

## C. Email template/draft coverage

1. Add legacy template renderer file under `web/app/lib/email/templates/`.
2. Register the template in `web/app/lib/email/templates/index.ts`.
3. Add seeded email draft function in `supabase/schemas/12_email_drafts.sql`:
   - `ensure_gift_card_inventory_low_email_draft()`
   - `draft_key='gift_card_inventory_low_v1'`
   - transactional channel, system draft, published v1 default content.
4. Include schema migration generated from schema source updates (`supabase db diff -f ...`).

## D. Recipient resolution

Recommended default: send to active admin/manager/staff profiles with valid email.

- Query pattern: `profile` joined by `user_id` to `user_roles` where role in (`admin`,`manager`,`staff`).
- Dedupe by normalized email before sending.
- Optional env override for emergency routing (`GIFT_CARD_ALERT_RECIPIENTS`) can be added later.

## Query outlines (for implementation)

### Inventory summary

`gift_card_asset` grouped by `(provider, status)`.

Primary low-inventory comparator:

- `available_count_by_provider` vs threshold per provider.

Optional supporting metric:

- `available_plus_allocated_unsent` for operational context (not threshold trigger).

### Near-term demand

- Source: `class_attendance` joined to `class`, filtered to eligible evidence and not blocked.
- Exclude rows with existing `gift_card_allocation` by `(class_id, profile_id)`.
- Map profiles to provider preference via existing enrichment helper.

### Upcoming demand

- Source: approved `workshop_enrollment` joined to `class` via workshop, bounded by upcoming date window.
- Roll up unique profile/workshop needs by provider preference.
- Exclude profiles already represented in near-term demand to avoid double-counting.

## Testing plan

## Unit tests

- New helper tests for:
  - threshold parsing and defaults
  - provider bucketing from gift-card preference labels
  - state transition matrix (`ok->low`, `low->low`, `low->ok`)

## Runner tests

- Add/extend tests for low-inventory phase:
  - sends once on first low transition
  - does not resend while still low
  - sends again after recovery then new drop
  - captures send failures in runner `errors` without crashing the whole job

## Manual verification (local)

1. Seed a small number of available cards for one provider.
2. Set low threshold above that count.
3. Trigger `/internal/gift-card-jobs/run` twice:
   - first run should send alert
   - second run should not send duplicate
4. Increase available count above threshold and rerun (recovery state).
5. Drop below threshold again and rerun (new alert should send).
6. Confirm admin gift-card page shows counts + low-state indicator.

## Rollout notes

- Keep the alert phase non-fatal in runner (collect errors in `errors[]`, continue returning run payload).
- Log provider inventory snapshot and threshold decision each run for scheduler observability.
- Document new env vars in `web/.env.template` and issue docs.

## Proposed task breakdown

1. Add inventory/demand summary helper and UI exposure in manage page.
2. Add threshold env parsing and runner low-inventory phase.
3. Add alert-state table + migration.
4. Add `gift_card_inventory_low_v1` legacy template + seeded draft.
5. Add tests for transition/idempotency behavior.
6. Update docs (`web/.env.template`, issue report notes).
