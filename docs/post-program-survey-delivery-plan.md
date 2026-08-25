# Post-Program Survey Delivery Plan

## Goal

Send a post-program survey request to each accepted family. Show a bright survey button while the family must respond. Stop all survey messages and hide the button after one valid response. Do not release the last gift card for a workshop until the family responds.

## Decisions

- The scope is one survey per accepted family and semester. A response satisfies every accepted workshop for that family in that semester.
- All email times use `America/Toronto` time.
- Make campaigns visible as soon as the scheduler creates them.
- Send the initial template on Friday, August 14, 2026 at 9:00 AM.
- Send the regular reminder template on Tuesday, August 18 and Thursday, August 20, 2026 at 9:00 PM.
- Send the gift-card template on Tuesday, August 25; Thursday, August 27; Tuesday, September 1; and Thursday, September 3, 2026 at 9:00 PM.
- Do not send any later scheduled message after a valid campaign completion.
- The last card means the card for the class with the latest `ends_at` value in an accepted workshop.
- The first message sends when the post-program survey becomes available. The program owner must choose and store this time before development starts.
- Send the messages to every guardian email in the family. Deduplicate equal email addresses. Do not send to student email addresses for this flow.

## Existing System

- The live form model uses `form`, `form_question`, `form_question_map`, `form_submission`, and `form_answer`.
- Each semester already has one active post-survey mapping in `semester_form_requirement`.
- The canonical seed creates `Post-Semester Survey - <semester id>` and maps 33 `post_*` questions in `supabase/seeds/app-data/07_semester-surveys.sql`.
- `post-program-survey.md` is source copy. The application does not load it.
- The app has a pre-survey route at `/semester-surveys/:semesterId/pre-program`. It has no post-survey route.
- `person_guardian_child` is a graph. The database has no permanent family record.
- Gift-card allocation can occur through the automated runner and through the manual class-attendance action. Gift-card sending is a separate runner stage.
- `email_message` records sent mail. `event_key` plus recipient email prevents duplicate sends.

## Survey Form Decision

Update the existing mapped post-survey form. Do not replace it for this release.

The supplied question document and the current seed use the same survey structure. The data release must compare each question, option, required flag, and order before it changes anything.

- Use `form_question_map` overrides for a form-specific text or option change.
- Add a new `form_question` code only for a new question.
- Do not rename or delete an existing question code. Historical `form_answer` rows use that code.
- Do not change an answer type after production responses exist.
- If a later release needs a material change, create a new form, map it as active, deactivate the old mapping, and retain old responses for reports.

The normal seed uses `ON CONFLICT DO NOTHING`. It cannot update the existing production form. Add a reviewed, idempotent data-release SQL script. It must:

1. Resolve the active post-survey form by `semester_form_requirement`, semester, and kind.
2. Upsert only the required question-map text, options, metadata, and position.
3. Add only missing question codes and maps.
4. Validate the final map has the approved 33 questions in the approved order.
5. Update `supabase/seeds/app-data/07_semester-surveys.sql` to match the released form.

Run this release with a production database credential. Do not ask staff to edit the form in the manager UI.

## Campaign Model

Add a durable post-program survey campaign. Do not infer message state from email history at each run.

The campaign stores:

- Semester, active post-survey form, and a fixed survey profile.
- A fixed family scope. Use the sorted connected profile IDs at creation time and store a deterministic anchor profile ID.
- The accepted workshop enrollments that belong to this campaign.
- First-message time, last normal-reminder time, gift-card message time, and completion time.
- The submission ID that completed the campaign.

Add a campaign-enrollment join table. It gives each accepted enrollment one campaign. It prevents two concurrent scheduler runs from making duplicate campaigns for the same family group.

The family scope is fixed when the campaign starts. A later guardian-child graph change does not split or merge an active campaign. This makes audit data stable. Staff need a small manager action to view a campaign and mark it complete only with a recorded reason. This action is for recovery, not normal work.

## Completion Rule

The post-survey route must use the campaign survey profile. It must not use the current viewer profile without checking campaign membership.

A valid submission:

1. Validates all required mapped questions.
2. Inserts one `form_submission` and its `form_answer` rows.
3. Marks the campaign complete in the same database transaction or with an idempotent completion operation.
4. Stops all later normal and gift-card survey messages.
5. Hides the home button for every current member of the campaign family scope.
6. Makes the final gift-card predicate true for every campaign enrollment.

The route must allow a guardian or enrolled student in the campaign family scope to respond. It must reject a user outside that scope. It must show a completed state instead of a blank survey after completion.

## Home Button

Add `/semester-surveys/:semesterId/post-program` to `web/app/routes.ts`.

The home loader must resolve incomplete campaigns for the signed-in family. Return one survey link per incomplete semester. Do not query full answers in the home loader.

Show a large, high-contrast button in the existing home navigation row. Use direct text such as `Complete post-program survey`. It must:

- Show only when an incomplete campaign is visible to the family.
- Link to the correct campaign and semester survey.
- Work on mobile and desktop.
- Disappear after a valid submission without a later manual step.

## Email Sequence

Add a dedicated internal post-program survey job. It must not be hidden in the gift-card runner. Add an authenticated internal route, scheduler shell script, smoke command, and cron entry.

The runner checks each incomplete campaign:

1. Create the campaign immediately for each accepted family so the CTA is visible.
2. Send the initial template once.
3. Send the regular reminder only on August 18 and August 20 at 9:00 PM Toronto time when the campaign is incomplete.
4. Send the gift-card template only on August 25, August 27, September 1, and September 3 at 9:00 PM Toronto time when the campaign is incomplete.
5. Record a stable event key for every campaign, stage, workshop, and recipient. A retry must not duplicate mail.
6. Link each `email_message` row to the campaign profile and workshop enrollment when available.

Create three transactional templates from `post-program-email-templates.md`:

- `post_program_survey_initial_v1`
- `post_program_survey_reminder_v1`
- `post_program_survey_gift_card_v1`

Each template includes the secure in-app survey link. The gift-card template states that the final workshop card is held until the survey is complete.

Use the existing template registration, email-draft seed functions, published-draft migration mode, and `sendTemplateEmail` flow. Do not call Resend directly from the survey runner.

## Gift-Card Guard

Create one shared predicate with explicit inputs:

- accepted enrollment profile and workshop;
- class ID and workshop last-class status;
- active post-survey campaign and completion state.

It returns true unless the card is for a last class and its campaign is incomplete. It returns false for the held final card.

Use this predicate in all three places:

1. Automated allocation before an asset claim in `web/app/lib/gift-cards/runner.server.ts`.
2. Manual allocation before an asset claim in `web/app/routes/manage/class-attendance.tsx`.
3. Automated card email/release before token generation and status change in `web/app/lib/gift-cards/runner.server.ts`.

The release check is required for cards allocated before this change or allocated by a race. The public gift-card link must also reject an unreleased held allocation.

The guard must not set the existing generic `blocked` field. That field means a staff or attendance block. Store the survey hold as an explicit reason or derive it from the campaign predicate. Staff must see `Post-program survey required` in the manager view.

## Data and Security

- Add declarative SQL under `supabase/schemas/`, then generate a migration. Do not edit an existing migration.
- Enable RLS and add policies for the campaign tables.
- Add required app permissions and role mappings if a staff campaign page uses direct table access.
- Regenerate `web/app/lib/database.types.ts` after the schema change.
- Do not place raw production snapshot data in Git.
- Use database transactions or unique constraints for campaign creation, completion, and final-card release checks.

## Tests

Add Playwright tests for:

- post-survey access for a guardian and an enrolled student;
- rejected access for a user outside the campaign scope;
- required-question validation and one successful response;
- button visible before completion and absent after completion.

Add unit or mocked-runner tests for:

- family recipient selection and email deduplication;
- all six fixed Toronto message slots;
- one send per recipient and scheduled slot despite retries;
- no messages after completion;
- final-class detection for a workshop;
- automated allocation, manual allocation, and release all hold the final card;
- release after a valid submission;
- a pre-existing final allocation cannot send before completion;
- template render and draft validation for all three messages.

Run `npm run typecheck` and the focused Playwright tests from `web/`. Run the scheduler smoke command with the new job and matching internal secret.

## Delivery Order

1. Verify and release the existing survey form data.
2. Add campaign tables, RLS, types, and shared completion and final-card predicates.
3. Add the post-survey route and home button.
4. Add templates, internal job, scheduler entry, and message audit data.
5. Add all gift-card guard points.
6. Add tests, deploy to a non-production environment, and run a controlled campaign with test families.

## Issue Implementation Steps

### #537: Release the Approved Survey Form

Change these files:

- Add `supabase/scripts/data-releases/post-program-survey-2026.sql`.
- Update `supabase/seeds/app-data/07_semester-surveys.sql`.
- Update `post-program-survey.md` only when the approved copy changes.

Implement the data-release script as one transaction. It must resolve every active `post_survey` mapping from `semester_form_requirement`. It must not use a saved form UUID.

The script must compare and upsert rows in this order:

1. Insert missing `form_question` rows by question code.
2. Upsert each `form_question_map` row for the active form. Set position, prompt override, options override, and `metadata.optional`.
3. Check that the active map contains only the approved question codes and that all positions are unique.
4. Fail before commit when a stored question has a different type from the approved type.

Use map overrides for text and option changes. Do not update global question text unless every form that uses the code must change. The release must print the changed row count and a final ordered question list. Add a dry-run query for production review.

Do not use `ON CONFLICT DO NOTHING` for changed map data. Keep the seed as the fresh-database source. The seed and data-release values must stay equal.

### #538: Add Campaign State and Shared Predicates

Add `supabase/schemas/18_post_program_survey_campaigns.sql`. Generate a new migration and regenerate `web/app/lib/database.types.ts`.

Add these tables:

- `post_program_survey_campaign`: campaign ID, semester ID, form ID, canonical family anchor profile ID, survey profile ID, initial message time, last normal reminder time, completion time, completion submission ID, timestamps, and a unique `(semester_id, family_anchor_profile_id)` key.
- `post_program_survey_campaign_member`: campaign ID and fixed profile ID membership.
- `post_program_survey_campaign_enrollment`: campaign ID, `workshop_enrollment` ID, and the per-workshop gift-card message time.

Use foreign keys to `semester`, `form`, `profile`, `form_submission`, and `workshop_enrollment`. Add indexes for incomplete campaigns, campaign membership lookup, and enrollment lookup. Enable RLS. Add a new permission only for the staff recovery view. The family route and scheduler use server-side `adminClient` access.

Add two database functions in the same schema file:

- `ensure_post_program_survey_campaign(...)`: lock or upsert the campaign by semester and canonical anchor. Insert missing member and accepted-enrollment rows. Return the campaign ID.
- `complete_post_program_survey_campaign(...)`: lock the campaign. Reject a user outside its fixed member list. Insert the submission and answers. Set `completed_submission_id` and `completed_at` once. Return the existing completion when a second request arrives.

The application must calculate the canonical anchor as the first sorted profile ID from `resolveConnectedProfileIds`. The database unique key makes concurrent scheduler runs safe. The member table keeps the scope stable when guardian-child links change later.

Add these server files:

- `web/app/lib/post-program-survey/campaign.server.ts`: load current family campaigns, call the ensure RPC, and load visible campaigns for the home route.
- `web/app/lib/post-program-survey/submission.server.ts`: validate campaign access and call the completion RPC.
- `web/app/lib/post-program-survey/gift-card-guard.server.ts`: return final-card hold state for a batch of class/profile pairs and for one manual or public-link request.

Do not copy campaign SQL logic into `home.tsx`, the scheduler runner, or the gift-card runner.

### #539: Add the Family Survey Route and Home Button

Change these files:

- Add `web/app/routes/semester-surveys.post.tsx`.
- Add the route in `web/app/routes.ts`.
- Change `web/app/routes/home.tsx`.
- Add focused tests under `web/tests/`.

Base the new route on `semester-surveys.pre.tsx`. Do not use `my-forms.$formId.tsx`. The generic route currently reads a different field name from the shared form component.

The post route loader must:

1. Authenticate with `enforceOnboardingGuard`.
2. Resolve the current profile and family graph.
3. Load an incomplete campaign for the requested semester where the current profile is a fixed member.
4. Load the campaign form map in position order.
5. Return a completed result if the campaign already has a completion row.

The action must parse `question_<question_code>` fields like the pre-survey route. It must validate each required field. It must call `complete_post_program_survey_campaign` instead of inserting directly into `form_submission`.

Extend `LoaderData` in `home.tsx` with a small list of incomplete campaign links. Load it after `resolveFamilyGraph`. Return the same empty list from the early no-enrollment response. Add the large button to the existing navigation row at lines 1246-1256. Render one button per incomplete semester. Do not load question or answer data in this loader.

After a successful response, redirect to `/home`. The next loader response must not include the campaign button.

### #540: Add Templates and the Scheduled Email Job

Add these files:

- `web/app/lib/email/templates/post-program-survey-initial.ts`.
- `web/app/lib/email/templates/post-program-survey-reminder.ts`.
- `web/app/lib/email/templates/post-program-survey-gift-card.ts`.
- `web/app/lib/post-program-survey/runner.server.ts`.
- `web/app/routes/internal/post-program-survey-jobs.run.ts`.
- `scheduler/scripts/post-program-survey-jobs.sh`.

Change these files:

- `web/app/lib/email/templates/index.ts`.
- `supabase/schemas/12_email_drafts.sql`.
- `web/app/routes.ts`.
- `scheduler/crontab`.
- `scheduler/Makefile`.

Add these template keys to `EmailTemplateMap`:

- `post_program_survey_initial_v1`.
- `post_program_survey_reminder_v1`.
- `post_program_survey_gift_card_v1`.

Each template data type needs only safe values: first name, survey URL, workshop name when applicable, and support URL. Do not put a gift-card token or asset URL in the survey email.

Add one `ensure_*_email_draft()` SQL function per template in `12_email_drafts.sql`. Follow the existing email-draft version and publish pattern. Register each renderer in `index.ts`. Use `sendTemplateEmail`, not direct Resend calls.

The new runner must run every five minutes. It checks the fixed Toronto timestamps in this plan. It does not need a separate cron expression per message slot.

Runner steps:

1. Query accepted workshop enrollments with an active post-survey form.
2. Resolve or create campaigns through `ensure_post_program_survey_campaign`.
3. Skip completed campaigns.
4. Send the initial template on August 14, 2026 at 9:00 AM Toronto time.
5. Send the regular template on August 18 and August 20, 2026 at 9:00 PM Toronto time.
6. Send the gift-card template on August 25, August 27, September 1, and September 3, 2026 at 9:00 PM Toronto time.
7. Use event keys such as `post-program-survey:<campaign-id>:initial:<email>`, `...:regular:<YYYY-MM-DD>:<email>`, and `...:gift-card:<YYYY-MM-DD>:<email>`.

Use `resolveFamilyContactsByProfileId` only as a starting point. Filter to guardian profiles and non-empty email addresses. Sort and deduplicate the result before sends.

The internal route must copy the request-method and `validateInternalRunnerRequest` checks from `internal/gift-card-jobs.run.ts`. The shell script must copy the `common.sh` request pattern. Add `make smoke-post-program-survey` and include it in `make smoke-all`. Add one `*/5 * * * *` cron line.

### #541: Guard Final Gift Cards in Every Path

Change these files:

- `web/app/lib/gift-cards/runner.server.ts`.
- `web/app/routes/manage/class-attendance.tsx`.
- `web/app/routes/glr.$token.ts`.
- `web/app/lib/post-program-survey/gift-card-guard.server.ts`.

Add a batch guard call in `allocateGiftCards`. Load all class and profile hold states for a page before the row loop. Do not run one campaign query per attendance row. Skip a final-class row with an incomplete campaign before `providerBucket.shift()` and before the asset update at lines 735-746.

In `class-attendance.tsx`, call the one-row guard after the class and attendance checks and before `pickAvailableAsset` at line 1487. Return HTTP 409 with `Post-program survey is required before this final gift card can be allocated.`

In `sendDueReminders`, check the batch guard after the allocation lock and before release state updates, token generation, and `sendTemplateEmail`. This protects existing allocations and race cases.

In `glr.$token.ts`, load the guard after allocation lookup and before the asset redirect. Treat a held card as unavailable. Do not change `gift_card_allocation.blocked`. That field remains a staff or attendance block.

The guard finds the class workshop, verifies that the class has the greatest `ends_at` for that workshop, finds the accepted enrollment for the allocation profile and semester, then checks the linked campaign completion state. It returns not held when no active post-survey mapping exists. This preserves prior semester behavior.

### #542: Add Staff Support and Recovery

Change these files:

- Add `web/app/routes/manage/post-program-surveys.tsx`.
- Add the route in `web/app/routes.ts`.
- Add the staff path to `TEAM_ALLOWED_MANAGE_PATHS` only if staff users need it. Otherwise allow manager and admin only.
- Change `supabase/schemas/18_post_program_survey_campaigns.sql` for the staff permission and RLS policy.

The loader must show campaign semester, survey profile, fixed members, accepted workshops, message times, completion state, final-card hold state, and linked `email_message` rows. Do not show raw form answers on this page.

The action must support one recovery operation: complete a campaign with a required staff reason. It calls a dedicated RPC. The RPC writes the staff user ID, reason, and time to campaign audit metadata. It must not fabricate a survey submission.

Use a separate permission such as `post_program_survey.manage`. Map it to admin and manager. Do not grant it to staff unless operations need this access.

### #536: Test and Roll Out

Add these focused tests:

- `web/tests/unit/post-program-survey-campaign.spec.ts` for canonical anchors, campaign state, final-class detection, and hold predicates.
- `web/tests/unit/post-program-survey-runner.spec.ts` for all six fixed slots, event keys, recipient deduplication, retries, and completion skips.
- `web/tests/unit/post-program-survey-email.spec.ts` for all three legacy renderers and published-draft validation.
- `web/tests/e2e/post-program-survey.spec.ts` for button visibility, access rules, required validation, completion, and held-card release.

The E2E setup must create an active post-survey mapping, accepted enrollment, workshop classes, and available gift-card assets. Use fixed Toronto timestamps. Cover a last-class allocation before and after a submission. Cover the manual allocation action and the public card-link rejection.

Run these commands from `web/`:

1. `npm run typecheck`.
2. `npm run test -- tests/unit/post-program-survey-campaign.spec.ts`.
3. `npm run test -- tests/unit/post-program-survey-runner.spec.ts`.
4. `npm run test -- tests/e2e/post-program-survey.spec.ts`.

Run `make smoke-post-program-survey` from `scheduler/` with a test app URL and matching `INTERNAL_RUNNER_SECRET`. Before production enablement, run the job against test families and inspect `email_message`, campaign tables, allocations, and asset status after each stage.

## Risks

- There is no permanent family ID. The campaign must save its initial family scope for stable audit behavior.
- A family can have several workshops. The campaign is semester-wide, but the card hold is workshop-specific.
- The current generic `/my-forms` submit route reads the wrong input field prefix. Do not use it for this survey. Base the post route on the working semester pre-survey route.
- The survey-kind enum source and generated types still use legacy values. Keep the existing compatibility lookup until a separate enum migration is complete.

## Audit Appendix

### Implementation Status

Only issue `#537` is implemented.

- The active post-survey form has an approved SQL Editor release snippet.
- The canonical local seed uses the approved post-survey copy.
- The semester manager now reads legacy and current survey-kind values.

The repository does not yet contain a campaign table, post-survey route, home button, post-survey email template, scheduler job, final-card hold, staff recovery page, generated migration, generated database types, or tests for this feature.

### Authoritative Data Model

Use the campaign model in this document. Do not add a second final-award model. The existing `gift_card_allocation` table remains the record for a card asset. The campaign is the record for survey state and the reason that a final allocation is held.

Add these tables in `supabase/schemas/18_post_program_survey_campaigns.sql`.

`post_program_survey_campaign` must contain:

- `id` UUID primary key.
- `semester_id` and `form_id`.
- `family_anchor_profile_id`. This is the first sorted profile ID in the family graph at campaign creation.
- `survey_profile_id`. This is the enrolled profile that owns the `form_submission`.
- `available_at`. This controls the first message.
- `initial_sent_at`.
- `last_normal_reminder_on` as a Toronto calendar date.
- `completed_at`.
- `completed_submission_id`, unique and nullable.
- `manually_completed_at`, `manually_completed_by_user_id`, and `manual_completion_reason` for staff recovery.
- `created_at` and `updated_at`.

Add a unique key on `(semester_id, family_anchor_profile_id)`. Add checks that allow exactly one completion source: a real submission or a manual completion, never both.

`post_program_survey_campaign_member` must contain `campaign_id` and `profile_id` as its primary key. It freezes the family graph that may access the campaign.

`post_program_survey_campaign_enrollment` must contain `campaign_id` and `workshop_enrollment_id` as its primary key. It must also have a unique key on `workshop_enrollment_id`. It stores `gift_card_notice_sent_at` because a family campaign can cover several workshops and each workshop has one final-card notice.

`post_program_survey_campaign_audit` must be append-only. It records `created`, `completed_submission`, and `completed_manual` events with actor, source, details, and time. Do not store this history only in mutable JSON metadata.

Add these indexes:

- Incomplete campaigns by `(available_at, id)`.
- Campaign members by `(profile_id, campaign_id)`.
- Campaign enrollments by campaign ID and workshop enrollment ID.
- Audit rows by `(campaign_id, created_at desc)`.

### Database Authorization

Enable RLS on every campaign table.

- A family user may read a campaign only when their profile is a fixed campaign member.
- A family user may not insert, update, or delete campaign rows directly.
- A manager or admin may read campaign, member, enrollment, and audit data through `post_program_survey.manage`.
- Only the server service role may ensure campaigns and run the message job.
- Audit rows have no application write policy.

Add `post_program_survey.manage` to `app_permissions` in `supabase/schemas/00_roles.sql`. Grant it to admin and manager. Do not grant it to staff by default.

The normal form policies are not enough. A guardian can submit on behalf of the fixed enrolled child profile. The submission must use a controlled RPC that checks the campaign member list. Do not use `adminClient` for the user submission path because it bypasses `auth.uid()` authorization.

### Required RPCs

Add `ensure_post_program_survey_campaign` as `SECURITY DEFINER` with an explicit `search_path`. It accepts:

- Semester ID and active post-survey form ID.
- Canonical family anchor and survey profile ID.
- Fixed member profile IDs.
- Accepted workshop enrollment IDs.
- `available_at`.

It must validate all input in the database:

1. The form is the active post-survey form for the semester.
2. The anchor and survey profile are in the member list.
3. Every enrollment is approved, belongs to the semester, and belongs to a member profile.
4. The unique campaign key is locked or upserted.
5. Existing campaign scope, form, and availability are never changed by a retry.
6. Missing member and enrollment rows are inserted.

It returns the campaign ID. Grant execution only to the server execution role.

Add `complete_post_program_survey_campaign` as `SECURITY DEFINER`. It accepts a campaign ID, answer JSON, and request metadata. It must run in one transaction:

1. Lock the campaign row with `FOR UPDATE`.
2. Read `auth.uid()` and confirm its profile is a fixed campaign member.
3. Return the existing completion without a second submission when already complete.
4. Read the current mapped questions for the campaign form.
5. Validate required values, choice values, and answer shapes in SQL.
6. Insert one `form_submission` for `survey_profile_id` and one `form_answer` per answer.
7. Set `completed_submission_id` and `completed_at`.
8. Insert an immutable audit event.

Grant this RPC to `authenticated`, not `anon`. The route must call it with the request-bound Supabase client.

Add `manually_complete_post_program_survey_campaign`. It requires `authorize('post_program_survey.manage')`, locks the campaign, requires a non-empty reason, and writes a manual completion plus audit event. It must not fabricate survey answers.

### Campaign Creation Contract

Implement `web/app/lib/post-program-survey/campaign.server.ts`.

For an approved enrollment:

1. Call `resolveConnectedProfileIds(adminClient, [enrollment.profile_id])`.
2. Sort and deduplicate the result.
3. Use the first ID as the family anchor.
4. Use the enrolled profile as `survey_profile_id`.
5. Query all approved enrollments in the same semester whose profile is in the fixed family member set.
6. Resolve the active `post_program_survey` form with the existing compatibility helper.
7. Call `ensure_post_program_survey_campaign`.

Do not recompute the family graph after campaign creation to decide survey access or card release. A later guardian-child change must not create new access, merge campaigns, or split campaigns.

### Post-Survey Route Contract

Add `web/app/routes/semester-surveys.post.tsx`. Register it in `web/app/routes.ts`.

The loader must:

1. Run `enforceOnboardingGuard`.
2. Resolve the logged-in profile.
3. Load a campaign for the requested semester where the profile is a fixed member.
4. Return 404 or redirect when no campaign is visible.
5. Return a completed state when the campaign is complete.
6. Load only the campaign form map and latest saved answers when the survey is open.

The action must parse `question_<question_code>` fields. It must pass normalized answers and request metadata to `complete_post_program_survey_campaign`. It must redirect to `/home` after success.

Do not copy the generic `/my-forms/:formId` action. It uses a field-name convention that differs from the shared form component and it does not provide campaign authorization or atomic completion.

Change `web/app/routes/home.tsx` so its loader returns only incomplete campaign IDs, semester IDs, and survey links for the current fixed member. Add the bright button to the existing navigation row. It must disappear when `completed_at` is set. Do not load answer data in the home loader.

### Email Job State Machine

Use a dedicated runner in `web/app/lib/post-program-survey/runner.server.ts`. Do not add post-survey behavior to `runGiftCardJobs`.

Add a job state table only if campaign columns cannot safely represent all recipient retries. Preferred design: add `post_program_survey_email_event` with campaign ID, workshop enrollment ID when applicable, stage, normalized recipient email, due time, lease time, sent time, email message ID, attempt count, and last error. Use a unique key on `(campaign_id, workshop_enrollment_id, stage, recipient_email)`, with a null-safe key for campaign-wide stages.

The runner must claim due rows with `FOR UPDATE SKIP LOCKED`. It sets a lease with an expiry, sends email outside the transaction, then marks success or failure. A failed event must become retryable after backoff.

Do not use `email_message` alone as the job state. `sendTransactionalEmail` treats an existing event key as already processed even when its send status is `failed`. The campaign event table is the retry authority.

Runner order:

1. Keyset-page approved enrollments and call the ensure RPC.
2. Create the initial event for August 14, 2026 at 9:00 AM Toronto time.
3. Create regular reminder events for August 18 and August 20, 2026 at 9:00 PM Toronto time.
4. Create gift-card events for August 25, August 27, September 1, and September 3, 2026 at 9:00 PM Toronto time.
6. Claim, render, send, and record event outcomes.

Use three templates:

- `post_program_survey_initial_v1`.
- `post_program_survey_reminder_v1`.
- `post_program_survey_gift_card_v1`.

Add renderers in `web/app/lib/email/templates/`, add keys to `index.ts`, and add published draft functions in `supabase/schemas/12_email_drafts.sql`. Use `sendTemplateEmail`. Never call Resend from the runner.

Normalize, sort, and deduplicate guardian email addresses before event creation. Do not send this flow to student addresses.

Add `web/app/routes/internal/post-program-survey-jobs.run.ts`, `scheduler/scripts/post-program-survey-jobs.sh`, a five-minute `scheduler/crontab` entry, and `make smoke-post-program-survey`.

### Final Gift-Card Guard Contract

Implement `web/app/lib/post-program-survey/gift-card-guard.server.ts` with batch and one-row functions.

For each class/profile pair, it must:

1. Load the class workshop and semester.
2. Check whether the class has the greatest `ends_at` in that workshop.
3. Find the approved enrollment for the profile, workshop, and semester.
4. Find the linked campaign enrollment.
5. Return held only when the campaign is incomplete.
6. Return not held when no active post-survey mapping exists.

The batch API accepts all class IDs and profile IDs from one runner page. It must return a map keyed by `class_id:profile_id`. Do not issue one campaign query per attendance row.

Apply the guard in all paths:

- Before asset claim in `allocateGiftCards` in `web/app/lib/gift-cards/runner.server.ts`.
- Before `pickAvailableAsset` in the manual allocation action in `web/app/routes/manage/class-attendance.tsx`.
- After the allocation lock but before release state updates, token generation, and mail send in `sendDueReminders`.
- Before redirecting an asset URL in `web/app/routes/glr.$token.ts`.
- In `web/app/routes/home.tsx` before showing an existing card link.

Do not set `gift_card_allocation.blocked` for a survey hold. That field means a staff or attendance block. Show the survey-hold reason as derived state in manager UI.

The existing runner uses conditional asset claims and a compensation update after failed allocation insertion. The final-card guard must run before that claim. The submission completion must allow the ordinary runner to allocate on its next pass. Do not create a second asset allocation flow unless requirements add a separate final reward.

### Staff Recovery Contract

Add `web/app/routes/manage/post-program-surveys.tsx` and register it in `web/app/routes.ts`.

The page must show campaign state, fixed members, accepted workshops, message events, completion source, held final cards, and audit rows. It must not expose raw answers.

The only recovery action is manual campaign completion with a required reason. The route uses the staff RPC. It must require manager or admin access. Add it to `TEAM_ALLOWED_MANAGE_PATHS` only when staff users also need the page.

### Test and CI Contract

Add these files:

- `web/tests/unit/post-program-survey-campaign.spec.ts`.
- `web/tests/unit/post-program-survey-runner.spec.ts`.
- `web/tests/unit/post-program-survey-email.spec.ts`.
- `web/tests/e2e/post-program-survey.spec.ts`.

Unit coverage must test campaign uniqueness, frozen membership, completion idempotency, manual completion audit, all six Toronto message slots, final-class selection, recipient deduplication, retry after send failure, event lease recovery, and the four final-card guard paths.

E2E coverage must create its own semester, workshop, class, form map, family, enrollment, and gift-card asset fixtures. It must not assume production snapshot data. It must cover visible and hidden home buttons, authorized and rejected form access, required answer validation, successful completion, held allocation, held public link, and release after completion.

The current CI failures prove this requirement. Existing tests assume a snapshot has an open workshop, pre-survey mapping, and existing enrollment. This data is not stable. New post-program tests must use explicit fixtures and should become the pattern for fixing those existing tests.

### Message Schedule

Store campaign availability as August 14, 2026 at 9:00 AM Toronto time. Send the regular template on August 18 and August 20 at 9:00 PM. Send the gift-card template on August 25, August 27, September 1, and September 3 at 9:00 PM. Completion suppresses every later scheduled event.
