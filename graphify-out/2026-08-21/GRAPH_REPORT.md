# Graph Report - repo  (2026-08-21)

## Corpus Check
- 456 files · ~825,321 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2332 nodes · 5290 edges · 206 communities (137 shown, 69 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 59 edges (avg confidence: 0.81)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `2a43200a`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- table-display.tsx
- home.tsx
- test_main.py
- table-actions.server.ts
- table-loader.ts
- getAdminSupabaseClient
- isRoleAtLeast
- suspicious-signals.server.ts
- provision.server.ts
- workshop-enrollment.tsx
- gift-cards/runner.server.ts
- email-drafts.$draftId.tsx
- button.tsx
- zoom-jobs/runner.server.ts
- index.ts
- exports.tsx
- enroll.tsx
- table-filter-options.ts
- devDependencies
- geoip.server.ts
- release.server.ts
- compilerOptions
- createClient
- class-attendance-enrichment.server.ts
- workshop-enrollment-query.server.ts
- table-filtering.server.ts
- dependencies
- admin-form-answers.server.ts
- validateInternalRunnerRequest
- forecast.server.ts
- family-context.server.ts
- renderer.server.ts
- table-filter-params.ts
- class-attendance.tsx
- my-forms.tsx
- sign-up-details.tsx
- components.json
- workshop.setup.tsx
- send-email.server.ts
- login.tsx
- class-zoom-participant.tsx
- requireAuth
- process-upload.server.ts
- riding-lookup.tsx
- gift-cards.tsx
- dependencies
- email-change.server.ts
- ip-evidence-recompute.server.ts
- resolveIpGeolocation
- post-program-survey/runner.server.ts
- workshop-enrollment-enrichment.server.ts
- common.sh
- exports/runner.server.ts
- form.$id.answers.tsx
- audit.server.ts
- BaseModel
- main.py
- ZoomClient
- database.types.ts
- family-multi-approved.tsx
- federal-electoral-district.enrichment.ts
- team.tsx
- _as_http_exception
- federal-electoral-district-snapshot.server.ts
- onboarding.server.ts
- zoom-api.client.server.ts
- email-message.tsx
- semester-surveys.post.tsx
- federal-electoral-district.tsx
- person.tsx
- post-program-survey.spec.ts
- table-definitions.ts
- list_past_meetings
- dispatch.server.ts
- runGiftCardInventoryAlerts
- Supabase
- team-members.tsx
- form-submission.tsx
- glr.$token.ts
- Program Impact Reconciliation
- reset.server.ts
- provider.server.ts
- semester.tsx
- class.tsx
- class-attendance-mismatch.tsx
- class-zoom-registrant.tsx
- form.$id.tsx
- adminClient.ts
- scripts
- workshop-enrollment-export-row.server.ts
- forgot-password.tsx
- generate-profile-seed.js
- form-answer.tsx
- class-attendance-raw.tsx
- manage/profile.tsx
- FastAPI Zoom REST API
- list_hosts
- Post-program survey
- forms.tsx
- workshop-capacity.ts
- class-zoom-meeting.tsx
- sign-up-terms.new.tsx
- test_transforms.py
- Scheduler crontab
- zoom-job-run.tsx
- createLoaderProfile
- profileLabel
- sign-up-terms.$termId.edit.tsx
- Graphify Incremental Update
- Issue 445 Investigation Plan
- riding-lookup.server.ts
- zlr.$token.ts
- families.tsx
- gift-cards.upload.tsx
- form.tsx
- workshop.tsx
- Salad on Plate Sticker
- opencode.json
- App bootstrap seeds
- class-attendance-audit.tsx
- combobox.tsx
- web/package.json
- vite-env.d.ts
- Family Context Resolver
- graphify.js
- run-selected-jobs.sh
- Password Change Confirmation
- Magic Link Sign In
- welcome.tsx
- Cut Pear Illustration
- Incident Observability
- react
- react-dom
- @react-router/fs-routes
- @supabase/ssr
- Account invitation
- MFA Enrollment Notification
- SummerLunch Plus Dark Logo
- class-attendance-card-data.ts
- lucide-react
- @xyflow/react
- Envelope Sticker
- Graphify Add and Watch
- Graphify Exports
- Graphify Hooks
- Summerlunch Class Management
- Email confirmation
- Email change confirmation
- Email address update notification
- Linked sign-in identity
- Unlinked sign-in identity
- Magic-link sign-in
- MFA enrollment
- MFA removal
- Password change
- Phone number update
- Identity verification
- Password recovery
- Email confirmation
- Email change confirmation
- Email address update notification
- Linked sign-in identity
- Phone Change Notification
- Pink Sun Favicon
- Sun Icon
- Apple Sticker Illustration
- Apple Bag Sticker
- Blue Fork Sticker
- Blue-Haired Pink Girl Sticker
- Camcorder Sticker
- Checklist illustration
- Cut Lemon Sticker
- Eggplant Sticker
- Apple
- Carrot
- Garden Illustration
- Garden Rows
- Leafy Greens
- Gear Icon
- Pomegranate illustration
- Green-Haired Orange Girl Sticker
- Green Slotted Spoon
- Hijabi Girl Sticker
- Pink-Haired Blue Boy Sticker
- Pink Lemon Sticker
- Pink Spatula Sticker
- Plantain Sticker
- Radish Sticker
- Red Spoon Sticker
- Stock Market Growth Chart
- Watermelon Sticker
- Swagger UI Developer Portal
- sign-up-terms.tsx
- gift-cards.table-data.ts
- form-submission-answers.server.ts
- exports.$jobId.download.ts
- invites.tsx
- clsx

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 119 edges
2. `requireAuth()` - 116 edges
3. `isRoleAtLeast()` - 114 edges
4. `TableDisplay()` - 67 edges
5. `adminClient` - 60 edges
6. `createTableLoader()` - 53 edges
7. `Button()` - 40 edges
8. `enforceOnboardingGuard()` - 31 edges
9. `cn()` - 31 edges
10. `createTableAction()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `RLS and Permissions` --conceptually_related_to--> `Supabase`  [EXTRACTED]
  CODE_STANDARDS.md → AGENTS.md
- `Tests Workflow` --references--> `Supabase`  [EXTRACTED]
  .github/workflows/tests.yml → AGENTS.md
- `Discrepancy Rollout` --references--> `Supabase`  [EXTRACTED]
  docs/discrepancy-rollout-checklist.md → AGENTS.md
- `Post-program evaluation` --references--> `Post-program survey`  [EXTRACTED]
  post-program-email-templates.md → post-program-survey.md
- `IconButton()` --calls--> `cn()`  [EXTRACTED]
  web/app/components/navbar.tsx → web/app/lib/utils.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Extraction and Navigation** — _opencode_skills_graphify_skill_graphify, _opencode_skills_graphify_references_extraction_spec_extraction_spec, _opencode_skills_graphify_references_query_query [EXTRACTED 1.00]
- **Post-program outcome domains** — post_program_survey_cooking_skills, post_program_survey_nutrition_knowledge, post_program_survey_food_affordability, post_program_survey_school_readiness, post_program_survey_family_engagement [EXTRACTED 1.00]
- **Scheduled internal job routes** — scheduler_readme_zoom_jobs_route, scheduler_readme_gift_card_jobs_route, scheduler_readme_export_jobs_route [EXTRACTED 1.00]
- **Survey Delivery Controls** — concept_post_program_survey_campaign, concept_gift_card_guard, concept_email_draft_migration [EXTRACTED 1.00]
- **Garden Scene Elements** — web_public_stickers_garden_garden_illustration, web_public_stickers_garden_apple, web_public_stickers_garden_carrot, web_public_stickers_garden_leafy_greens, web_public_stickers_garden_garden_rows [EXTRACTED 1.00]
- **Authenticated Zoom Request Flow** — zoom_api_plan_request_lifecycle, zoom_api_plan_api_key_authentication, zoom_api_plan_ttl_cache, zoom_api_plan_fastapi_zoom_rest_api [EXTRACTED 1.00]
- **Gift Card Operations** — concept_gift_card_processing, concept_gift_card_inventory_alerts, concept_gift_card_guard [INFERRED 0.85]
- **Authentication Email Flows** — templates_invite_invitation_email, templates_magic_link_magic_link_sign_in, templates_reauthentication_reauthentication_code, templates_recovery_password_recovery [INFERRED 0.85]

## Communities (206 total, 69 thin omitted)

### Community 0 - "table-display.tsx"
Cohesion: 0.04
Nodes (76): toLocalDateTimeInputValue(), filterClauseSignature(), DeferredTableDisplay(), DeferredTableDisplayProps, AllocateGiftCardActionResult, areNumberMapsEqual(), AttendancePhotoResource, AttendancePhotoResponse (+68 more)

### Community 1 - "home.tsx"
Cohesion: 0.14
Nodes (16): ActionProfileCheckpoint, createActionProfile(), shouldLogActionProfile(), ActionData, ClassRow, EnrollmentRow, FamilyProfile, formatDate() (+8 more)

### Community 2 - "test_main.py"
Cohesion: 0.08
Nodes (25): patch, ok(), test_create_meeting_normalizes_offset_to_utc(), test_create_meeting_success(), test_create_meeting_with_host_success(), test_delete_meeting_success(), test_get_participants_400_non_report_error_stays_400(), test_get_participants_cache_hit() (+17 more)

### Community 3 - "table-actions.server.ts"
Cohesion: 0.06
Nodes (23): action, loader(), action, baseLoader, loader(), SyncRow, action, loader (+15 more)

### Community 4 - "table-loader.ts"
Cohesion: 0.11
Nodes (26): loader, loader, loader, applyClauseToSupabaseQuery(), chunkArray(), createTableLoader(), fetchAllRowsInBatches(), ForeignKeyOption (+18 more)

### Community 5 - "getAdminSupabaseClient"
Cohesion: 0.13
Nodes (29): ensureRoleAccount(), findAuthUserByEmail(), assertGuardianProfileName(), getLatestEnrollmentForGuardian(), guardianSignupAndRequestEnrollment(), waitForAcceptedEmailLog(), waitForEnrollmentRecordStatus(), waitForEnrollmentStatus() (+21 more)

### Community 6 - "isRoleAtLeast"
Cohesion: 0.10
Nodes (18): listDrafts, previewGeoipBackfill(), isRoleAtLeast(), action(), loader(), normalizeDraftKey(), ActionData, loader() (+10 more)

### Community 7 - "suspicious-signals.server.ts"
Cohesion: 0.10
Nodes (37): AddressProfile, CANADIAN_PROVINCE_CODES, canonicalProvince(), computeSignalPriority(), detectAddressMismatchSignal(), detectCrossFamilyExactAddressSignal(), detectIpProfileLocationMismatchSignal(), detectNetworkDistanceSignal() (+29 more)

### Community 8 - "provision.server.ts"
Cohesion: 0.09
Nodes (37): appendZoomJobAttemptEvent(), nonEmpty(), startZoomJobAttemptAudit(), AcquireZoomClassLockArgs, AcquireZoomClassLockResult, LockPayload, parseLockPayload(), releaseZoomClassLock() (+29 more)

### Community 9 - "workshop-enrollment.tsx"
Cohesion: 0.31
Nodes (6): resolveFamilyContactsByProfileId(), transitionWorkshopEnrollmentStatus(), action(), isLikelyEmail(), loader(), parseEnrollmentField()

### Community 10 - "gift-cards/runner.server.ts"
Cohesion: 0.09
Nodes (34): AllocationSummary, backfillQualifiedAvailabilityStates(), chunkArray(), currentTorontoMealKitReminderSlotIso(), currentTorontoReminderSlotIso(), emptyScanCounters(), ensureOrigin(), GiftCardJobResult (+26 more)

### Community 11 - "email-drafts.$draftId.tsx"
Cohesion: 0.17
Nodes (25): createEmailDraft(), createEmailDraftVersion(), DraftListFilters, getEmailDraftById(), getEmailDraftByKey(), getEmailDraftVersionById(), getEmailDraftVersions(), listEmailDrafts() (+17 more)

### Community 12 - "button.tsx"
Cohesion: 0.09
Nodes (36): Button(), buttonVariants, Card(), CardAction(), CardContent(), CardDescription(), CardFooter(), CardHeader() (+28 more)

### Community 13 - "zoom-jobs/runner.server.ts"
Cohesion: 0.15
Nodes (34): finishZoomJobAttemptAudit(), finishZoomJobRunAudit(), nowIso(), startZoomJobRunAudit(), getClassesInWindow(), addMinutes(), backfillAttendanceRowsCoverage(), chunkArray() (+26 more)

### Community 14 - "index.ts"
Cohesion: 0.11
Nodes (22): ClassCameraOrPhotoFollowupTemplateData, renderClassCameraOrPhotoFollowupEmail(), ClassReminderLoginTemplateData, escapeHtml(), renderClassReminderLoginEmail(), escapeHtml(), FamilyEnrollmentAcceptedTemplateData, renderFamilyEnrollmentAcceptedEmail() (+14 more)

### Community 15 - "exports.tsx"
Cohesion: 0.17
Nodes (16): createExportJob(), insertExportJobRows(), listExportJobs(), setExportJobStatus(), action(), ActionData, DownloadActionData, EXPORT_CONFIG (+8 more)

### Community 16 - "enroll.tsx"
Cohesion: 0.12
Nodes (24): legacyKindFor(), resolveSemesterSurveyForm(), SemesterSurveyForm, SemesterSurveyKind, getWorkshopEnrollmentAction(), action(), ActionData, ACTIVE_ENROLLMENT_STATUSES (+16 more)

### Community 17 - "table-filter-options.ts"
Cohesion: 0.25
Nodes (14): parseFilterClausesFromSearchParams(), applyClauseToSupabaseQuery(), CLASS_ENROLLMENT_FAMILY_CONTEXT_COLUMNS, CLASS_ENROLLMENT_WORKSHOP_ENRICHMENT_COLUMNS, filterOptionPriority(), fromQualifiedTable(), hydrateClassEnrollmentRows(), loadAllRowsViaTableLoader() (+6 more)

### Community 18 - "devDependencies"
Cohesion: 0.07
Nodes (29): dotenv, @playwright/test, @react-router/dev, supabase, @types/dagre, @types/node, @types/react, @types/react-dom (+21 more)

### Community 19 - "geoip.server.ts"
Cohesion: 0.12
Nodes (27): BackfillCandidateOptions, BackfillFailureReason, BackfillLookupResult, chunkArray(), collectGeoipBackfillCandidates(), firstForwardedToken(), GEOIP_CACHE_TTL_DAYS, GEOIP_TIMEOUT_MS (+19 more)

### Community 20 - "release.server.ts"
Cohesion: 0.14
Nodes (25): addDaysToDateParts(), classWeekFridayNoonTorontoIso(), eligibleAfterIso(), GiftCardReleaseMetadata, isEligibilityTimingEnabled(), isGiftCardReleasedNow(), isReleaseReadyNow(), legacyEffectiveReleaseAtIso() (+17 more)

### Community 21 - "compilerOptions"
Cohesion: 0.08
Nodes (26): **/*, **/.client/**/*, DOM, DOM.Iterable, ES2022, node, .react-router/types/**/*, **/.server/**/* (+18 more)

### Community 22 - "createClient"
Cohesion: 0.12
Nodes (26): enforceOnboardingGuard(), resolveFamilyGraph(), createClient(), loader(), loader(), resolveStudentProfile(), action(), loader() (+18 more)

### Community 23 - "class-attendance-enrichment.server.ts"
Cohesion: 0.11
Nodes (24): buildClassAttendanceEnrichmentFoundation(), chunkArray(), CLASS_ATTENDANCE_ENRICHMENT_LANES, ClassAttendanceEnrichment, ClassAttendanceEnrichmentFoundation, ClassAttendanceEnrichmentOptions, fallbackProfileHoverContext, flagEmojiForCountryCode() (+16 more)

### Community 24 - "workshop-enrollment-query.server.ts"
Cohesion: 0.22
Nodes (14): ConcernBand, concernBandForScore(), concernBandForSignals(), concernRowClass(), scoreConcernSignals(), SEVERITY_MULTIPLIER, SIGNAL_BASE_POINTS, SignalInput (+6 more)

### Community 25 - "table-filtering.server.ts"
Cohesion: 0.15
Nodes (22): buildClassAttendanceSnapshot(), buildEmailMessageSnapshot(), buildPagedRequest(), buildFormIdAnswersSnapshot(), applyFiltersAndSort(), formatDateOnly(), formatTimestamp(), getCellValue() (+14 more)

### Community 26 - "dependencies"
Cohesion: 0.08
Nodes (25): csv-parse, dagre, i, isbot, pdf-lib, radix-ui, react-router, @react-router/node (+17 more)

### Community 27 - "admin-form-answers.server.ts"
Cohesion: 0.22
Nodes (13): ADMIN_EDITABLE_FAMILY_QUESTION_CODES, chunkArray(), FamilyGraph, GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE, loadCandidateProfileIds(), loadEditableQuestionOptions(), loadFamilyGraph(), normalizeOptionValue() (+5 more)

### Community 28 - "validateInternalRunnerRequest"
Cohesion: 0.17
Nodes (17): cleanupExpiredExports(), claimNextExportJob(), failStaleRunningJobs(), listExpiredCompletedExportJobs(), markExportJobExpired(), processNextExportJob(), SecretCheckOptions, SecretCheckResult (+9 more)

### Community 29 - "forecast.server.ts"
Cohesion: 0.13
Nodes (23): addDays(), allocationKey(), AllocationRow, AttendanceRow, buildGiftCardWeekRanges(), chunkArray(), ClassRow, emptyCounts() (+15 more)

### Community 30 - "family-context.server.ts"
Cohesion: 0.13
Nodes (24): ADDRESS_QUESTION_TO_FIELD, AddressDraft, AddressField, chunkArray(), FamilyContextEnrichment, flagEmojiForCountryCode(), FormAnswerRow, formatAddress() (+16 more)

### Community 31 - "renderer.server.ts"
Cohesion: 0.20
Nodes (15): collectPlaceholders(), escapeHtml(), interpolate(), markdownToHtml(), markdownToText(), readVariable(), renderEmailDraft(), renderInlineMarkdown() (+7 more)

### Community 32 - "table-filter-params.ts"
Cohesion: 0.23
Nodes (11): decodeValue(), encodeValue(), FILTER_EMPTY_TOKEN, FilterClause, parseFilterClauseValues(), serializeFilterClause(), baseLoader, isParticipantRole() (+3 more)

### Community 33 - "class-attendance.tsx"
Cohesion: 0.12
Nodes (18): AttendancePhotoRow, AttendanceRow, chunkArray(), ClassRow, displayName(), displayNameOrId(), fallbackProfileHoverContext, GiftCardAllocationRow (+10 more)

### Community 34 - "my-forms.tsx"
Cohesion: 0.25
Nodes (13): Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow (+5 more)

### Community 35 - "sign-up-details.tsx"
Cohesion: 0.18
Nodes (20): action(), Condition, districtMealKitFlag(), ensureGuardianChildLink(), FormStep, getProfileFieldValue(), isConditionMet(), isQuestionHiddenForRole() (+12 more)

### Community 36 - "components.json"
Cohesion: 0.10
Nodes (20): aliases, components, hooks, lib, ui, utils, iconLibrary, registries (+12 more)

### Community 37 - "workshop.setup.tsx"
Cohesion: 0.17
Nodes (17): getOffsetMinutesForLocalDateTime(), action(), ActionData, buildRecurringClassStarts(), ByDay, BYDAY_VALUES, byDayToWeekday, FALLBACK_TIMEZONES (+9 more)

### Community 38 - "send-email.server.ts"
Cohesion: 0.16
Nodes (22): resolvePublishedDraftByKey(), compareRenderedEmail(), legacyMigrationFlagEnvKey(), migrationModeEnvKey(), normalizeFlagValue(), normalizeHtml(), normalizeText(), parseTemplateMigrationMode() (+14 more)

### Community 39 - "login.tsx"
Cohesion: 0.13
Nodes (17): IconButton(), IconButtonProps, Navbar(), NavbarProps, FetcherRun, instrumentationEnabled(), logEvent(), useRouterInstrumentation() (+9 more)

### Community 40 - "class-zoom-participant.tsx"
Cohesion: 0.36
Nodes (6): action, baseLoader, classLabel(), classTimestamp(), loader(), ParticipantRow

### Community 41 - "requireAuth"
Cohesion: 0.12
Nodes (22): authPermissionDriftWebhookUrl, emitPermissionDriftAlert(), getCachedSignUpDetailsStatus(), getOnboardingMode(), ONBOARDING_GUARD_TIMEOUT_MS, onboardingStatusCache, requireAuth(), sortedPermissions() (+14 more)

### Community 42 - "process-upload.server.ts"
Cohesion: 0.17
Nodes (17): GiftCardCsvAsset, GiftCardCsvColumnMapping, GiftCardCsvParseResult, normalizeHeader(), parseGiftCardCsv(), ParseOptions, parseProvider(), REQUIRED_HEADERS (+9 more)

### Community 43 - "riding-lookup.tsx"
Cohesion: 0.24
Nodes (12): action(), ActionData, loader(), MissingRidingProfile, normalizePostcode(), profileLabel(), refreshProfileRiding(), resolveCandidates() (+4 more)

### Community 44 - "gift-cards.tsx"
Cohesion: 0.33
Nodes (6): GiftCardAllocationForecastSnapshot, emptyTableData, formatWeekLabel(), GiftCardsPage(), loader(), providers

### Community 45 - "dependencies"
Cohesion: 0.11
Nodes (17): dependencies, class-variance-authority, clsx, lucide-react, shadcn, tailwind-merge, tailwindcss, @tailwindcss/vite (+9 more)

### Community 46 - "email-change.server.ts"
Cohesion: 0.16
Nodes (17): changeEmailForProfileByAdmin(), ChangeEmailForProfileByAdminInput, ChangeEmailForProfileByAdminResult, ClassSyncResult, EmailChangeDetails, EmailChangeStage, EmailChangeStatus, findAuthUserByEmail() (+9 more)

### Community 47 - "ip-evidence-recompute.server.ts"
Cohesion: 0.07
Nodes (47): ClassifyArgs, classifyIpEvidence(), classifyReasonText(), IP_CLASSIFIER_VERSION, IpCandidate, IpClassification, IpClassificationResult, IpConfidenceLevel (+39 more)

### Community 48 - "resolveIpGeolocation"
Cohesion: 0.43
Nodes (5): cacheToLocation(), resolveIpGeolocation(), baseLoader, flagEmojiForCountryCode(), loader()

### Community 49 - "post-program-survey/runner.server.ts"
Cohesion: 0.18
Nodes (16): chunk(), POST_PROGRAM_SURVEY_BATCH_SIZE, CampaignClient, ensurePostProgramSurveyCampaign(), loadIncompletePostProgramSurveyCampaignsForCurrentProfile(), loadPostProgramSurveyCampaignForCurrentProfile(), PostProgramSurveyCampaign, ClaimedEvent (+8 more)

### Community 50 - "workshop-enrollment-enrichment.server.ts"
Cohesion: 0.16
Nodes (17): loader(), chunkArray(), flagEmojiForCountryCode(), FormAnswerRow, formatGeoLabel(), FormSubmissionRow, GuardianChildEdge, loadWorkshopEnrollmentEnrichment() (+9 more)

### Community 51 - "common.sh"
Cohesion: 0.16
Nodes (8): require_env(), common.sh script, export-cleanup.sh script, export-jobs.sh script, gift-card-inventory-alerts.sh script, gift-card-jobs.sh script, post-program-survey-jobs.sh script, zoom-jobs.sh script

### Community 52 - "exports/runner.server.ts"
Cohesion: 0.12
Nodes (26): buildCsv(), escapeCsvValue(), AnyClient, claimExportJobById(), completeExportJob(), ExportJobRecord, failExportJob(), listExportJobRows() (+18 more)

### Community 53 - "form.$id.answers.tsx"
Cohesion: 0.08
Nodes (30): buildMember(), FamilyContact, FamilyGraph, FamilyMember, GuardianChildRow, ProfileRow, resolveConnectedProfileIds(), addRelated() (+22 more)

### Community 54 - "audit.server.ts"
Cohesion: 0.20
Nodes (9): AttemptFinishInput, AttemptStartInput, AttemptStatus, JsonRecord, RunFinishInput, RunStartInput, TriggerKind, TriggerSource (+1 more)

### Community 55 - "BaseModel"
Cohesion: 0.15
Nodes (13): BaseModel, field_validator, model_validator, create_meeting(), CreateMeetingRequest, CreateMeetingResponse, ParticipantReportRow, PastMeeting (+5 more)

### Community 56 - "main.py"
Cohesion: 0.17
Nodes (12): BaseSettings, Exception, HTTPAuthorizationCredentials, HTTPException, on_event, get_api_key(), Settings, get_participants() (+4 more)

### Community 58 - "database.types.ts"
Cohesion: 0.22
Nodes (8): CompositeTypes, Constants, DatabaseWithoutInternals, DefaultSchema, Enums, Tables, TablesInsert, TablesUpdate

### Community 59 - "family-multi-approved.tsx"
Cohesion: 0.22
Nodes (14): buildWindowSummary(), chunkArray(), EnrollmentRow, FamilyEdgeRow, FamilyWindowRow, FamilyWindowSummary, loadApprovedEnrollmentsByProfile(), loader() (+6 more)

### Community 60 - "federal-electoral-district.enrichment.ts"
Cohesion: 0.19
Nodes (15): canonicalRiding(), chunk(), ENROLLMENT_STATUSES, FamilyEdgeRow, firstRidingFromLinks(), FormAnswerRow, FormSubmissionRow, GiftCardBucket (+7 more)

### Community 61 - "team.tsx"
Cohesion: 0.18
Nodes (14): ManageNavItem, ManageNavSection, manageSections, overviewPage, teamPages, isTeamAllowedManagePath(), loader(), logManageTeamServerEvent() (+6 more)

### Community 62 - "_as_http_exception"
Cohesion: 0.18
Nodes (15): delete, HTTPStatusError, post, _as_http_exception(), delete_meeting(), Validates the configured Zoom Server-to-Server OAuth credentials by calling the…, Deletes a scheduled Zoom meeting., Bulk-registers a list of participants for a scheduled meeting. Use the numeric… (+7 more)

### Community 63 - "federal-electoral-district-snapshot.server.ts"
Cohesion: 0.43
Nodes (6): buildFederalElectoralDistrictSnapshot(), buildPagedRequest(), DistrictCounts, EXPORT_COLUMNS, loadCountsByRiding(), action()

### Community 64 - "onboarding.server.ts"
Cohesion: 0.23
Nodes (12): getMaskedEmailHint(), Condition, getCachedSignUpFlowEntries(), getProfileSignUpCompletion(), getProfileSignUpCompletionWithContext(), getSignUpDetailsStatus(), isConditionMet(), isSignUpDetailsRole() (+4 more)

### Community 65 - "zoom-api.client.server.ts"
Cohesion: 0.22
Nodes (12): hasScheme(), normalizeZoomApiEndpoint(), shouldDefaultToHttp(), trimTrailingSlash(), getConfig(), parsePayload(), requestJson(), zoomApiClient (+4 more)

### Community 66 - "email-message.tsx"
Cohesion: 0.22
Nodes (11): ActionData, baseLoader, bodyTextToHtml(), buildEmailMessageTableData(), escapeHtml(), isValidEmail(), loader(), normalizeEmail() (+3 more)

### Community 67 - "semester-surveys.post.tsx"
Cohesion: 0.08
Nodes (35): AGREEMENT_OPTIONS, FormQuestion(), FormQuestionData, FormQuestionProps, LabelWithRequired(), normalizeOptions(), parseInlineMarkdown(), renderPromptMarkdown() (+27 more)

### Community 68 - "federal-electoral-district.tsx"
Cohesion: 0.33
Nodes (4): action, baseLoader, enrollmentStatusOptions, loader()

### Community 69 - "person.tsx"
Cohesion: 0.18
Nodes (14): action(), classificationLabel, geoStatusLabel, geoStatusReasonFor(), headerValue(), loader(), loadFamilyGraph(), normalizeIp() (+6 more)

### Community 70 - "post-program-survey.spec.ts"
Cohesion: 0.35
Nodes (8): escapeHtml(), PostProgramSurveyTemplateData, renderPostProgramSurveyEmail(), renderPostProgramSurveyGiftCardEmail(), renderPostProgramSurveyInitialEmail(), renderPostProgramSurveyReminderEmail(), assertPostProgramSurveySchedule(), POST_PROGRAM_SURVEY_SCHEDULE

### Community 71 - "table-definitions.ts"
Cohesion: 0.29
Nodes (6): EditorFieldConfig, EditorFieldType, LookupMapping, TABLE_DEFINITIONS, TableDefinition, TableEditorConfig

### Community 72 - "list_past_meetings"
Cohesion: 0.21
Nodes (10): fixture, TTLCache, get_cached(), set_cached(), list_past_meetings(), PastMeetingsResponse, Returns a list of past meetings for the authenticated Zoom user within the…, clear_caches() (+2 more)

### Community 73 - "dispatch.server.ts"
Cohesion: 0.60
Nodes (5): internalEndpointFor(), internalSecretForRunner(), InternalTriggerResult, triggerExportCleanup(), triggerExportRunner()

### Community 74 - "runGiftCardInventoryAlerts"
Cohesion: 0.31
Nodes (8): giftCardInventoryAlertEventKey(), GiftCardShortfall, hasGiftCardShortfall(), resolveGiftCardShortfall(), resolveGiftCardShortfallForProvider(), formatTorontoWeekLabel(), runGiftCardInventoryAlerts(), action()

### Community 75 - "Supabase"
Cohesion: 0.18
Nodes (12): Tests Workflow, Repository Instructions, Code Standards, Transactional Email Draft Migration, Final Gift Card Guard, Playwright Tests, Post Program Survey Campaign, RLS and Permissions (+4 more)

### Community 76 - "team-members.tsx"
Cohesion: 0.23
Nodes (11): ALLOWED_EMAIL_DOMAIN_TEXT, ALLOWED_EMAIL_PATTERN, getEmailDomainHint, isAllowedEmailDomain(), normalizeEmail(), action(), ActionData, allowedInviteRolesFor() (+3 more)

### Community 77 - "form-submission.tsx"
Cohesion: 0.47
Nodes (4): action, baseLoader, flagEmojiForCountryCode(), loader()

### Community 78 - "glr.$token.ts"
Cohesion: 0.32
Nodes (8): resolveGiftCardRelease(), hashGlrToken(), isLastWorkshopClass(), getPostProgramSurveyHold(), PostProgramSurveyHold, homeMessageRedirect(), invalidLink(), loader()

### Community 79 - "Program Impact Reconciliation"
Cohesion: 0.25
Nodes (7): Commands, Exceptions, Program Impact Reconciliation, Reconciliation Results, Result, Sanitization Results, Scope

### Community 80 - "reset.server.ts"
Cohesion: 0.28
Nodes (10): addMinutes(), chunkArray(), countByIds(), listClassIdsInScope(), nowMs(), resetZoomProcessingState(), toIso(), ZoomApiError (+2 more)

### Community 81 - "provider.server.ts"
Cohesion: 0.24
Nodes (10): addCandidate(), chunkArray(), FamilyEdgeRow, FormAnswerRow, FormSubmissionRow, fulfillmentFromAnswer(), GiftCardFulfillmentType, GiftCardProvider (+2 more)

### Community 82 - "semester.tsx"
Cohesion: 0.21
Nodes (14): isValidDateParts(), isValidTimeParts(), localDateTimeToUtcIso(), localDateToUtcIso(), parseOffsetMinutes(), action(), baseLoader, kindCandidatesFor() (+6 more)

### Community 83 - "class.tsx"
Cohesion: 0.25
Nodes (7): action(), ActionData, baseAction, baseLoader, chunkArray(), ClassRow, loader()

### Community 84 - "class-attendance-mismatch.tsx"
Cohesion: 0.25
Nodes (9): action(), ActionData, AttendanceRow, chunkArray(), EnrollmentRow, loader(), MismatchRow, profileDisplay() (+1 more)

### Community 85 - "class-zoom-registrant.tsx"
Cohesion: 0.25
Nodes (9): action, baseLoader, chunkArray(), classLabel(), classTimestamp(), loader(), RegistrantRow, UNSUPPORTED_FILTER_COLUMNS (+1 more)

### Community 86 - "form.$id.tsx"
Cohesion: 0.25
Nodes (10): action(), FormQuestionMapItem, getConditionDependencies(), loader(), LoaderData, makeLayout(), ManageFormFlowEditorPage(), NodeData (+2 more)

### Community 87 - "adminClient.ts"
Cohesion: 0.08
Nodes (29): GiftCardHouseholdImpact, loadGiftCardHouseholdImpact(), ImpactRow, loadProgramImpact(), ProgramImpactResult, ProgramImpactSummary, sumSummary(), adminClient (+21 more)

### Community 88 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, build, dev, start, test, test:e2e, test:e2e:headed, test:headed (+3 more)

### Community 89 - "workshop-enrollment-export-row.server.ts"
Cohesion: 0.31
Nodes (9): buildProfileSplitData(), chunkArray(), fallbackWorkshopEnrollmentEnrichment, GuardianChildEdge, materializeWorkshopEnrollmentExportRows(), normalizeText(), pickPreferred(), PROFILE_SPLIT_COLUMNS (+1 more)

### Community 90 - "forgot-password.tsx"
Cohesion: 0.20
Nodes (9): AuthStickerBackground(), AuthStickerBackgroundProps, createDenseStickers(), DENSE_STICKER_SOURCES, STICKERS, StickerSpec, action(), resolveSiteOrigin() (+1 more)

### Community 91 - "generate-profile-seed.js"
Cohesion: 0.20
Nodes (6): csvContent, csvPath, __dirname, outputPath, rows, scriptLines

### Community 92 - "form-answer.tsx"
Cohesion: 0.31
Nodes (6): buildFormAnswerSnapshot(), buildPagedRequest(), EXPORT_TYPE_FORM_ANSWER_CSV, action, baseLoader, loader()

### Community 93 - "class-attendance-raw.tsx"
Cohesion: 0.31
Nodes (7): action, chunkArray(), displayName(), displayNameOrId(), loader(), ProfileLookupRow, RawAttendanceRow

### Community 94 - "manage/profile.tsx"
Cohesion: 0.33
Nodes (7): baseLoader, chunkArray(), formatProfileLabel(), getPreferredRelatedId(), GuardianChildRow, loader(), ProfileRow

### Community 95 - "FastAPI Zoom REST API"
Cohesion: 0.22
Nodes (9): Zoom API Service, API Key Authentication, FastAPI Zoom REST API, HTTPBearer Authentication, Zoom Request Lifecycle, In-Memory TTL Cache, Zoom Attendance Reporting, Zoom Server-to-Server OAuth (+1 more)

### Community 96 - "list_hosts"
Cohesion: 0.25
Nodes (8): get, health(), healthz(), HostsResponse, list_hosts(), Unauthenticated liveness check. Returns `{"status": "ok"}` if the server is…, Authenticated readiness check. Returns `{"status": "ok"}` if the server is…, Lists active users in the connected Zoom account for host selection.

### Community 97 - "Post-program survey"
Cohesion: 0.25
Nodes (8): Post-program evaluation, Week 8 grocery gift card, Cooking skills, Family engagement, Food affordability, Nutrition knowledge, Post-program survey, School readiness

### Community 98 - "forms.tsx"
Cohesion: 0.29
Nodes (5): getOffsetMinutesForLocalDate(), ALL_ROLES, CreateFormCard(), FormRow, LoaderData

### Community 99 - "workshop-capacity.ts"
Cohesion: 0.32
Nodes (7): buildWorkshopCapacityMap(), emptySnapshot(), toNonNegativeInteger(), WorkshopCapacitySnapshot, WorkshopCapacitySource, WorkshopEnrollmentAction, WorkshopEnrollmentSource

### Community 100 - "class-zoom-meeting.tsx"
Cohesion: 0.36
Nodes (6): action, baseLoader, classLabel(), classTimestamp(), loader(), MeetingRow

### Community 101 - "sign-up-terms.new.tsx"
Cohesion: 0.32
Nodes (6): action(), ActionData, baseSlugFromTitle(), getInsertErrorMessage(), loader(), LoaderData

### Community 102 - "test_transforms.py"
Cohesion: 0.46
Nodes (6): transform_meetings(), transform_participants(), test_transform_meetings_empty(), test_transform_meetings_passthrough(), test_transform_participants_empty(), test_transform_participants_passthrough()

### Community 103 - "Scheduler crontab"
Cohesion: 0.29
Nodes (7): Scheduler crontab, Export jobs routes, Gift-card jobs route, Internal runner secret, Scheduler service, Web service, Zoom jobs route

### Community 104 - "zoom-job-run.tsx"
Cohesion: 0.36
Nodes (6): action, actorDisplay(), baseLoader, loader(), RunRow, toOutcomeMessage()

### Community 105 - "createLoaderProfile"
Cohesion: 0.29
Nodes (8): createLoaderProfile(), LoaderProfileCheckpoint, shouldLogLoaderProfile(), ClassAttendanceCatalog, FlowStep, formatClassDateTime(), loader(), TeamOverviewPage()

### Community 106 - "profileLabel"
Cohesion: 0.21
Nodes (14): ManagePersonAttendancePage(), ManagePersonDiscrepanciesPage(), severityClassName(), toRecord(), hasSignalForProfile(), ManagePersonEnrollmentsPage(), ManagePersonFamilyPage(), ManagePersonFormSubmissionsPage() (+6 more)

### Community 107 - "sign-up-terms.$termId.edit.tsx"
Cohesion: 0.33
Nodes (5): action(), ActionData, baseSlugFromTitle(), loader(), LoaderData

### Community 108 - "Graphify Incremental Update"
Cohesion: 0.33
Nodes (6): Extraction Specification, Graphify GitHub and Merge, Graphify Query, Graphify Transcription, Graphify Incremental Update, Graphify Skill

### Community 109 - "Issue 445 Investigation Plan"
Cohesion: 0.33
Nodes (6): Gift Card Inventory Alerts, Gift Card Processing, Keyset Pagination, Gift Card Upload Plan, Issue 445 Investigation Plan, Issue 453 Coverage Report

### Community 110 - "riding-lookup.server.ts"
Cohesion: 0.29
Nodes (3): opennorthProvider, ridingLookupProvider, RidingLookupResult

### Community 111 - "zlr.$token.ts"
Cohesion: 0.53
Nodes (7): hashZlrToken(), homeMessageRedirect(), invalidLink(), loader(), tooEarlyLink(), tooLateLink(), unavailableLink()

### Community 113 - "gift-cards.upload.tsx"
Cohesion: 0.31
Nodes (8): action(), autoMatchHeader(), ExpectedColumnKey, expectedColumns, GiftCardCsvColumnMapping, GiftCardsUploadPage(), normalizeHeader(), parseCsvHeaderLine()

### Community 114 - "form.tsx"
Cohesion: 0.50
Nodes (3): action, baseLoader, loader()

### Community 115 - "workshop.tsx"
Cohesion: 0.50
Nodes (3): action, baseLoader, loader()

### Community 116 - "Salad on Plate Sticker"
Cohesion: 0.40
Nodes (5): Fork and Spoon, Leafy Salad, Plate, Salad on Plate Sticker, Watermelon Slice

### Community 117 - "opencode.json"
Cohesion: 0.50
Nodes (3): plugin, $schema, .opencode/plugins/graphify.js

### Community 118 - "App bootstrap seeds"
Cohesion: 0.50
Nodes (4): Static/bootstrap tables, App bootstrap seeds, Production snapshot, Operational runtime data

### Community 120 - "combobox.tsx"
Cohesion: 0.43
Nodes (6): Combobox(), ComboboxOption, ComboboxProps, fuzzyMatch(), normalize(), optionLabel()

### Community 121 - "web/package.json"
Cohesion: 0.50
Nodes (3): name, private, type

### Community 122 - "vite-env.d.ts"
Cohesion: 0.50
Nodes (3): ImportMeta, ImportMetaEnv, OnboardingMode

### Community 123 - "Family Context Resolver"
Cohesion: 0.67
Nodes (3): Family Context Resolver, Issue 299 Phase 1 Validation, Family Context Issues Plan

### Community 127 - "Password Change Confirmation"
Cohesion: 0.67
Nodes (3): Identity Unlinked Notification, Password Change Confirmation, Password Recovery

### Community 128 - "Magic Link Sign In"
Cohesion: 0.67
Nodes (3): Family Invitation Email, Magic Link Sign In, Reauthentication Code

### Community 131 - "Cut Pear Illustration"
Cohesion: 0.67
Nodes (3): Cut Pear Illustration, Fruit Cross-Section, Pear Fruit

### Community 141 - "class-attendance-card-data.ts"
Cohesion: 0.33
Nodes (6): getWeekdayKeyFromWorkshopDescription(), loader(), WEEKDAY_DEFS, WEEKDAY_LABEL_BY_KEY, WEEKDAY_ORDER, WeekdayKey

### Community 199 - "sign-up-terms.tsx"
Cohesion: 0.33
Nodes (6): action(), ActionData, formatDateTime(), loader(), SignUpTermsTablePage(), TermsRow

### Community 200 - "gift-cards.table-data.ts"
Cohesion: 0.47
Nodes (5): GiftCardAssetRow, loader(), mask(), profileDisplay(), ProfileRow

### Community 201 - "form-submission-answers.server.ts"
Cohesion: 0.50
Nodes (4): chunkArray(), FormAnswerRow, loadSubmissionAnswerState(), SubmissionRow

### Community 202 - "exports.$jobId.download.ts"
Cohesion: 0.83
Nodes (3): createExportDownloadSignedUrl(), getExportJobById(), action()

## Knowledge Gaps
- **693 isolated node(s):** `$schema`, `.opencode/plugins/graphify.js`, `@tailwindcss/vite`, `class-variance-authority`, `clsx` (+688 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **69 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `adminClient` connect `adminClient.ts` to `home.tsx`, `suspicious-signals.server.ts`, `provision.server.ts`, `workshop-enrollment.tsx`, `gift-cards/runner.server.ts`, `email-drafts.$draftId.tsx`, `button.tsx`, `zoom-jobs/runner.server.ts`, `class-attendance-card-data.ts`, `enroll.tsx`, `geoip.server.ts`, `createClient`, `class-attendance-enrichment.server.ts`, `workshop-enrollment-query.server.ts`, `admin-form-answers.server.ts`, `validateInternalRunnerRequest`, `forecast.server.ts`, `family-context.server.ts`, `class-attendance.tsx`, `sign-up-details.tsx`, `send-email.server.ts`, `requireAuth`, `riding-lookup.tsx`, `email-change.server.ts`, `ip-evidence-recompute.server.ts`, `post-program-survey/runner.server.ts`, `workshop-enrollment-enrichment.server.ts`, `exports/runner.server.ts`, `form.$id.answers.tsx`, `audit.server.ts`, `family-multi-approved.tsx`, `onboarding.server.ts`, `semester-surveys.post.tsx`, `person.tsx`, `team-members.tsx`, `glr.$token.ts`, `reset.server.ts`, `provider.server.ts`, `class.tsx`, `class-attendance-mismatch.tsx`, `workshop-enrollment-export-row.server.ts`, `class-attendance-raw.tsx`, `zlr.$token.ts`?**
  _High betweenness centrality (0.107) - this node is a cross-community bridge._
- **Why does `createClient()` connect `createClient` to `home.tsx`, `table-actions.server.ts`, `table-loader.ts`, `workshop-enrollment.tsx`, `button.tsx`, `exports.tsx`, `enroll.tsx`, `table-filter-options.ts`, `release.server.ts`, `class-attendance.tsx`, `my-forms.tsx`, `sign-up-details.tsx`, `workshop.setup.tsx`, `login.tsx`, `class-zoom-participant.tsx`, `requireAuth`, `form.$id.answers.tsx`, `federal-electoral-district.enrichment.ts`, `semester-surveys.post.tsx`, `sign-up-terms.tsx`, `gift-cards.table-data.ts`, `exports.$jobId.download.ts`, `semester.tsx`, `class-attendance-mismatch.tsx`, `class-zoom-registrant.tsx`, `form.$id.tsx`, `forgot-password.tsx`, `manage/profile.tsx`, `forms.tsx`, `class-zoom-meeting.tsx`, `sign-up-terms.new.tsx`, `zoom-job-run.tsx`, `sign-up-terms.$termId.edit.tsx`, `gift-cards.upload.tsx`, `form.tsx`, `workshop.tsx`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `requireAuth()` connect `requireAuth` to `table-actions.server.ts`, `isRoleAtLeast`, `workshop-enrollment.tsx`, `email-drafts.$draftId.tsx`, `button.tsx`, `class-attendance-card-data.ts`, `exports.tsx`, `enroll.tsx`, `geoip.server.ts`, `release.server.ts`, `createClient`, `workshop-enrollment-query.server.ts`, `family-context.server.ts`, `class-attendance.tsx`, `workshop.setup.tsx`, `send-email.server.ts`, `riding-lookup.tsx`, `gift-cards.tsx`, `workshop-enrollment-enrichment.server.ts`, `form.$id.answers.tsx`, `family-multi-approved.tsx`, `federal-electoral-district.enrichment.ts`, `team.tsx`, `onboarding.server.ts`, `email-message.tsx`, `person.tsx`, `sign-up-terms.tsx`, `gift-cards.table-data.ts`, `exports.$jobId.download.ts`, `invites.tsx`, `team-members.tsx`, `semester.tsx`, `class.tsx`, `class-attendance-mismatch.tsx`, `form.$id.tsx`, `adminClient.ts`, `class-attendance-raw.tsx`, `sign-up-terms.new.tsx`, `sign-up-terms.$termId.edit.tsx`, `gift-cards.upload.tsx`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `$schema`, `.opencode/plugins/graphify.js`, `@tailwindcss/vite` to the rest of the system?**
  _693 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `table-display.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.04057124310288867 - nodes in this community are weakly interconnected._
- **Should `home.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.1437908496732026 - nodes in this community are weakly interconnected._
- **Should `test_main.py` be split into smaller, more focused modules?**
  _Cohesion score 0.08156028368794327 - nodes in this community are weakly interconnected._