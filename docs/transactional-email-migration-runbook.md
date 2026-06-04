# Transactional Email Migration Runbook

This runbook covers rollout from legacy inline templates to `email_draft`-backed transactional templates.

## Current transactional template keys
- `family_enrollment_requested_v1`
- `family_enrollment_accepted_v1`

## Env flags
- Mode (preferred): `EMAIL_DRAFT_MODE_<TEMPLATE_KEY_NORMALIZED>` where value is `legacy`, `shadow`, or `draft`.
- Backward-compatible boolean (temporary): `EMAIL_DRAFT_USE_<TEMPLATE_KEY_NORMALIZED>=true` to force `draft` mode.
- Fallback policy: `EMAIL_DRAFT_FALLBACK_POLICY=fallback-legacy|fail-closed`.

Example normalized keys:
- `EMAIL_DRAFT_MODE_FAMILY_ENROLLMENT_REQUESTED_V1`
- `EMAIL_DRAFT_MODE_FAMILY_ENROLLMENT_ACCEPTED_V1`

## Migration modes
- `legacy`: send using legacy renderer only.
- `shadow`: send legacy email, but also render draft and log parity (`match`/`mismatch`).
- `draft`: send using published draft when available.

## Rollout plan
1. Verify both transactional drafts exist and are published in manage > email drafts.
2. Set both templates to `shadow` mode.
3. Trigger real enrollment requested/accepted flows in staging.
4. Check logs for parity output:
   - `[email][migration][shadow][match]`
   - `[email][migration][shadow][mismatch]`
   - `[email][migration][shadow][draft-missing]`
5. Fix mismatches or missing drafts, then re-run checks.
6. Move one template to `draft` mode, keep the other in `shadow`.
7. Monitor send outcomes in `email_message` and logs for at least one business cycle.
8. Move the second template to `draft` mode.

## Fallback and rollback
- If draft content is missing in `draft` mode:
  - `fallback-legacy` sends legacy content and records fallback metadata.
  - `fail-closed` fails send with explicit error.
- Emergency rollback: set template mode to `legacy` and redeploy.

## Verification checklist
- New sends include migration metadata in `email_message.template_data`:
  - `_migration_mode`
  - `_template_source`
  - optional `_parity_check`
  - optional `_fallback_applied`, `_fallback_reason`
- `resendEmailMessageById` behavior:
  - uses draft rendering when mode is not `legacy` and draft exists
  - falls back to legacy rendering otherwise
- Unit coverage includes:
  - mode parsing (`legacy|shadow|draft` + boolean compatibility)
  - parity checks for requested/accepted templates
