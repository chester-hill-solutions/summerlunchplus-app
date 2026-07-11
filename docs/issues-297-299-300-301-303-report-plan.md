# Family Context Issues Report and Plan

Date: 2026-07-10
Scope: #297, #299, #300, #301, #303

## Executive view
- `#300` is implemented and closed (shared `family-context` utility + route exist).
- `#299` is complete after Phase 1 validation (hover route contract, discrepancy lines, and fallback safety verified).
- `#301` is not complete (person/manage and enrollment notification flows still use direct family traversal helpers).
- `#303` is not complete (federal district enrichment still contains route-local family traversal/fallback logic).
- `#297` (epic) is partially complete and should remain open until `#301` and `#303` are done.

## Issue-by-issue status

## #300 (closed): Build family-context utility and enrichment route
Status: Complete

Evidence:
- Shared resolver exists: `web/app/lib/family-context.server.ts`
- Manage enrichment route exists: `web/app/routes/manage/family-context.enrichment.ts`
- Route is permission-gated with `requireAuth` + staff check.

Residual notes:
- Contract currently returns hover-oriented fields and prior participation.
- Some downstream consumers still duplicate family traversal instead of consuming the shared resolver (tracked by #301/#303).

## #299 (open): Migrate workshop profile hover to family-context route
Status: Complete (implementation + validation)

Evidence:
- Workshop hover/family context fetch path in table UI calls `/manage/family-context/enrichment`:
  - `web/app/routes/manage/table-display.tsx:1986`
- Hover fields in use include:
  - `profile_hover_parent_geo`
  - `profile_hover_parent_phone`
  - `profile_hover_student_submitted_address`
  - `profile_hover_parent_address`
- No hover field for raw latest IP in current contract.
- Discrepancy lines remain in hover card config (`Top Discrepancy`, `More Open`):
  - `web/app/lib/exports/workshop-enrollment-query.server.ts:296`
- Typecheck passes after verification: `npm run typecheck` (run in `web/`).

Validation artifacts:
- Phase 1 closeout notes in `docs/issue-299-phase1-validation.md`.

## #301 (open): Consolidate person + notification family lookups on shared resolver
Status: Not complete

Current blockers:
- `web/app/routes/manage/person.tsx` defines and uses local `loadFamilyGraph()` with direct `person_guardian_child` traversal.
- `web/app/routes/manage/workshop-enrollment.tsx` still uses `resolveFamilyContactsByProfileId` from `web/app/lib/family.server.ts`.
- `web/app/lib/family.server.ts` itself performs direct BFS traversal and is separate from family-context contract.

Impact:
- Family derivation logic remains duplicated in high-risk flows (person view + enrollment notification).

## #303 (open): Migrate federal-district enrichment to family-context resolver
Status: Not complete

Current blockers:
- `web/app/routes/manage/federal-electoral-district.enrichment.ts` contains route-local family graph traversal and riding fallback logic.
- Direct `person_guardian_child` queries and household graph construction remain in-route.

Impact:
- Riding fallback precedence and household derivation are not yet standardized on one shared family-context path.

## #297 (open): Epic unified family context route for manage and exports
Status: In progress

Completed under epic:
- Shared family-context utility and route shipped (#300 foundation).
- Table hover integration largely migrated for workshop/class-attendance UI paths (#299 mostly).

Remaining for epic completion:
- Finish consolidation of person + notification flows (#301).
- Finish federal district enrichment migration (#303).
- Optionally migrate other duplicated family traversal hotspots to shared primitives.

## Implementation plan

Phase 1: Close #299 with targeted verification
1. Completed: verified workshop hover path fetches family-context route for hover hydration.
2. Completed: verified discrepancy lines are still present in hover card config.
3. Completed: verified fallback values remain safe and typecheck passes.

Phase 2: Implement #301 consolidation
1. Introduce a shared family graph/contact resolver in `app/lib` (or extend `family-context.server.ts`) that supports:
   - family profile closure,
   - guardian/child priority relationships,
   - contact extraction (email/user/profile linkage).
2. Replace local `loadFamilyGraph()` in `web/app/routes/manage/person.tsx` with shared resolver.
3. Replace `resolveFamilyContactsByProfileId` usage in `web/app/routes/manage/workshop-enrollment.tsx` with shared resolver output.
4. Keep batching constraints and verify no behavior change in person tabs + enrollment accepted notifications.

Phase 3: Implement #303 migration
1. Extract riding fallback precedence into shared family-context helper(s).
2. Refactor `web/app/routes/manage/federal-electoral-district.enrichment.ts` to consume shared outputs instead of direct family traversal.
3. Preserve existing aggregate counters (`total`, status buckets, gift card buckets, household counts) and compare before/after with fixture snapshots.

Phase 4: Epic completion hardening (#297)
1. Inventory remaining direct `person_guardian_child` traversals in manage/export code and classify as in-scope vs intentional.
2. Add regression tests for:
   - role-based student/guardian fallback precedence,
   - contact/address/geo contract stability,
   - federal district aggregate parity.
3. Close #297 after #299/#301/#303 acceptance checks pass.

## Suggested execution order
1. #299 validation closeout (lowest-risk confirmation).
2. #301 shared resolver consolidation (establish canonical APIs used by consumers).
3. #303 migration onto shared resolver.
4. #297 epic close with final parity checks.
