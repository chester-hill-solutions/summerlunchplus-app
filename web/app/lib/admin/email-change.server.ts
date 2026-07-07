import { isAllowedEmailDomain, normalizeEmail } from '@/lib/email-domain'
import { adminClient } from '@/lib/supabase/adminClient'
import { runZoomJobsForClass } from '@/lib/zoom-jobs/runner.server'

type EmailChangeStage =
  | 'validate'
  | 'preflight'
  | 'auth_update'
  | 'profile_update'
  | 'invite_migration'
  | 'zoom_sync'
  | 'finalize'

type EmailChangeStatus = 'pending' | 'applied' | 'partial' | 'failed'

type StageEntry = {
  stage: EmailChangeStage
  ok: boolean
  message?: string
  error?: string
  meta?: Record<string, unknown>
  at: string
}

type EmailChangeDetails = {
  stages: StageEntry[]
  preflight?: {
    profileConflictId?: string
    authConflictUserId?: string
    inviteConflictId?: string
  }
  inviteMigration?: {
    updatedCount: number
  }
  zoom?: {
    impactedClassIds: string[]
    results: Array<{
      classId: string
      ok: boolean
      error?: string
      summary?: {
        meetingCreated?: boolean
        meetingRecreated?: boolean
        registrantsCreated?: number
        registrantsUpdated?: number
        registrantsRemoved?: number
        registrantsSkipped?: number
      }
    }>
  }
  compensation?: {
    attemptedAuthRevert?: boolean
    authRevertOk?: boolean
    authRevertError?: string
  }
}

type ProfileRow = {
  id: string
  user_id: string | null
  role: string | null
  email: string | null
}

type PreflightResult = {
  ok: boolean
  error?: string
  conflict?: {
    profileConflictId?: string
    authConflictUserId?: string
    inviteConflictId?: string
  }
}

type ClassSyncResult = {
  classId: string
  ok: boolean
  error?: string
  summary?: {
    meetingCreated?: boolean
    meetingRecreated?: boolean
    registrantsCreated?: number
    registrantsUpdated?: number
    registrantsRemoved?: number
    registrantsSkipped?: number
  }
}

export type ChangeEmailForProfileByAdminInput = {
  profileId: string
  newEmailRaw: string
  actorUserId: string
  reason: string
  appOrigin: string
  triggerZoomSync?: boolean
}

export type ChangeEmailForProfileByAdminResult = {
  ok: boolean
  error?: string
  logId: string | null
  status: 'applied' | 'partial' | 'failed'
  profileId: string
  userId: string | null
  oldEmail: string
  newEmail: string
  authUpdated: boolean
  profileUpdated: boolean
  invitesUpdated: boolean
  inviteRowsUpdated: number
  classSync: {
    attempted: boolean
    impactedClassIds: string[]
    results: ClassSyncResult[]
  }
  stages: StageEntry[]
}

const nowIso = () => new Date().toISOString()

const findAuthUserByEmail = async (email: string) => {
  let page = 1

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 200 })
    if (error) {
      return { userId: null as string | null, error: error.message }
    }

    const users = data?.users ?? []
    const matched = users.find(user => normalizeEmail(user.email ?? '') === email)
    if (matched?.id) {
      return { userId: matched.id, error: null }
    }

    if (users.length < 200) {
      break
    }

    page += 1
  }

  return { userId: null as string | null, error: null }
}

const preflightEmailChange = async ({
  profileId,
  oldEmail,
  newEmail,
  userId,
}: {
  profileId: string
  oldEmail: string
  newEmail: string
  userId: string | null
}): Promise<PreflightResult> => {
  const conflict: PreflightResult['conflict'] = {}

  const { data: profileConflict, error: profileConflictError } = await adminClient
    .from('profile')
    .select('id')
    .eq('email', newEmail)
    .neq('id', profileId)
    .maybeSingle()

  if (profileConflictError) {
    return { ok: false, error: profileConflictError.message }
  }

  if (profileConflict?.id) {
    conflict.profileConflictId = profileConflict.id
  }

  const { userId: authConflictUserId, error: authLookupError } = await findAuthUserByEmail(newEmail)
  if (authLookupError) {
    return { ok: false, error: authLookupError }
  }

  if (authConflictUserId && authConflictUserId !== userId) {
    conflict.authConflictUserId = authConflictUserId
  }

  const { data: inviteConflict, error: inviteConflictError } = await adminClient
    .from('invites')
    .select('id, invitee_user_id')
    .eq('invitee_email', newEmail)
    .maybeSingle()

  if (inviteConflictError) {
    return { ok: false, error: inviteConflictError.message }
  }

  if (inviteConflict?.id) {
    const isOwnedInvite = Boolean(userId && inviteConflict.invitee_user_id && inviteConflict.invitee_user_id === userId)
    if (!isOwnedInvite) {
      conflict.inviteConflictId = inviteConflict.id
    }
  }

  if (conflict.profileConflictId || conflict.authConflictUserId || conflict.inviteConflictId) {
    return {
      ok: false,
      error: 'Email is already in use by another account or invite.',
      conflict,
    }
  }

  if (oldEmail === newEmail) {
    return {
      ok: false,
      error: 'New email matches current email.',
    }
  }

  return { ok: true }
}

const updateAuthEmailIfLinked = async ({ userId, newEmail }: { userId: string | null; newEmail: string }) => {
  if (!userId) {
    return { ok: true, updated: false }
  }

  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  })

  if (error) {
    return { ok: false, updated: false, error: error.message }
  }

  return { ok: true, updated: true }
}

const migrateInviteEmails = async ({
  userId,
  oldEmail,
  newEmail,
}: {
  userId: string | null
  oldEmail: string
  newEmail: string
}) => {
  const { data: byEmailRows, error: byEmailError } = await adminClient
    .from('invites')
    .select('id')
    .eq('invitee_email', oldEmail)

  if (byEmailError) {
    return { ok: false, updatedCount: 0, error: byEmailError.message }
  }

  const ids = new Set((byEmailRows ?? []).map(row => row.id).filter(Boolean))

  if (userId) {
    const { data: byUserRows, error: byUserError } = await adminClient
      .from('invites')
      .select('id')
      .eq('invitee_user_id', userId)

    if (byUserError) {
      return { ok: false, updatedCount: 0, error: byUserError.message }
    }

    for (const row of byUserRows ?? []) {
      if (row.id) ids.add(row.id)
    }
  }

  const rowIds = Array.from(ids)
  if (!rowIds.length) {
    return { ok: true, updatedCount: 0 }
  }

  const { error: updateError } = await adminClient
    .from('invites')
    .update({ invitee_email: newEmail })
    .in('id', rowIds)

  if (updateError) {
    return { ok: false, updatedCount: 0, error: updateError.message }
  }

  return { ok: true, updatedCount: rowIds.length }
}

const resolveImpactedClassIds = async ({
  profileId,
  role,
}: {
  profileId: string
  role: string | null
}) => {
  const targetProfileIds = new Set<string>()

  if (role === 'student') {
    targetProfileIds.add(profileId)
  } else if (role === 'guardian') {
    const { data: childEdges } = await adminClient
      .from('person_guardian_child')
      .select('child_profile_id')
      .eq('guardian_profile_id', profileId)

    for (const edge of childEdges ?? []) {
      if (edge.child_profile_id) {
        targetProfileIds.add(edge.child_profile_id)
      }
    }
  } else {
    targetProfileIds.add(profileId)
  }

  if (!targetProfileIds.size) {
    return [] as string[]
  }

  const targetIds = Array.from(targetProfileIds)
  const { data: enrollments, error: enrollmentError } = await adminClient
    .from('workshop_enrollment')
    .select('workshop_id')
    .in('profile_id', targetIds)
    .eq('status', 'approved')
    .not('workshop_id', 'is', null)

  if (enrollmentError) {
    throw new Error(enrollmentError.message)
  }

  const workshopIds = Array.from(
    new Set((enrollments ?? []).map(row => row.workshop_id).filter((id): id is string => Boolean(id)))
  )

  if (!workshopIds.length) {
    return [] as string[]
  }

  const { data: classes, error: classError } = await adminClient
    .from('class')
    .select('id')
    .in('workshop_id', workshopIds)
    .gte('ends_at', new Date(Date.now() - 60 * 60_000).toISOString())

  if (classError) {
    throw new Error(classError.message)
  }

  return Array.from(new Set((classes ?? []).map(row => row.id).filter(Boolean)))
}

const syncImpactedClasses = async ({
  classIds,
  appOrigin,
}: {
  classIds: string[]
  appOrigin: string
}) => {
  const results: ClassSyncResult[] = []

  for (const classId of classIds) {
    try {
      const syncResult = await runZoomJobsForClass({
        classId,
        appOrigin,
        runId: `email-change-${Date.now().toString(36)}`,
      })

      results.push({
        classId,
        ok: true,
        summary: {
          meetingCreated: syncResult.provision?.meetingCreated,
          meetingRecreated: syncResult.provision?.meetingRecreated,
          registrantsCreated: syncResult.provision?.registrantsCreated,
          registrantsUpdated: syncResult.provision?.registrantsUpdated,
          registrantsRemoved: syncResult.provision?.registrantsRemoved,
          registrantsSkipped: syncResult.provision?.registrantsSkipped,
        },
      })
    } catch (error) {
      results.push({
        classId,
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown class sync error',
      })
    }
  }

  return results
}

export async function changeEmailForProfileByAdmin({
  profileId,
  newEmailRaw,
  actorUserId,
  reason,
  appOrigin,
  triggerZoomSync = true,
}: ChangeEmailForProfileByAdminInput): Promise<ChangeEmailForProfileByAdminResult> {
  const details: EmailChangeDetails = { stages: [] }
  const pushStage = (stage: Omit<StageEntry, 'at'>) => {
    details.stages.push({ ...stage, at: nowIso() })
  }

  let logId: string | null = null
  let oldEmail = ''
  let newEmail = normalizeEmail(newEmailRaw)
  let userId: string | null = null
  let authUpdated = false
  let profileUpdated = false
  let invitesUpdated = false
  let inviteRowsUpdated = 0
  let status: 'applied' | 'partial' | 'failed' = 'failed'
  let impactedClassIds: string[] = []
  let classSyncResults: ClassSyncResult[] = []

  const syncLog = async (patch?: {
    status?: EmailChangeStatus
    zoomSyncStartedAt?: string | null
    zoomSyncCompletedAt?: string | null
  }) => {
    if (!logId) return

    await adminClient
      .from('email_change_log' as any)
      .update({
        ...(patch?.status ? { status: patch.status } : {}),
        auth_updated: authUpdated,
        profile_updated: profileUpdated,
        invites_updated: invitesUpdated,
        invite_rows_updated: inviteRowsUpdated,
        ...(patch?.zoomSyncStartedAt !== undefined
          ? { zoom_sync_started_at: patch.zoomSyncStartedAt }
          : {}),
        ...(patch?.zoomSyncCompletedAt !== undefined
          ? { zoom_sync_completed_at: patch.zoomSyncCompletedAt }
          : {}),
        details,
      })
      .eq('id', logId)
  }

  try {
    const trimmedReason = reason.trim()
    if (!newEmail) {
      pushStage({ stage: 'validate', ok: false, error: 'Email is required.' })
      throw new Error('Email is required.')
    }
    if (!isAllowedEmailDomain(newEmail)) {
      pushStage({ stage: 'validate', ok: false, error: 'Email domain is not allowed.' })
      throw new Error('Email domain is not allowed.')
    }
    if (!trimmedReason) {
      pushStage({ stage: 'validate', ok: false, error: 'Reason is required.' })
      throw new Error('Reason is required.')
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profile')
      .select('id, user_id, role, email')
      .eq('id', profileId)
      .maybeSingle<ProfileRow>()

    if (profileError || !profile?.id || !profile.email) {
      pushStage({ stage: 'validate', ok: false, error: profileError?.message ?? 'Profile not found.' })
      throw new Error(profileError?.message ?? 'Profile not found.')
    }

    oldEmail = normalizeEmail(profile.email)
    userId = profile.user_id ?? null

    const { data: logRow, error: logError } = await adminClient
      .from('email_change_log' as any)
      .insert({
        profile_id: profile.id,
        user_id: userId,
        old_email: oldEmail,
        new_email: newEmail,
        changed_by: actorUserId,
        reason: trimmedReason,
        status: 'pending',
        auth_updated: false,
        profile_updated: false,
        invites_updated: false,
        invite_rows_updated: 0,
        details,
      })
      .select('id')
      .single<{ id: string }>()

    if (logError || !logRow?.id) {
      throw new Error(logError?.message ?? 'Unable to create email change log entry.')
    }

    logId = logRow.id

    pushStage({
      stage: 'validate',
      ok: true,
      message: 'Validated request and loaded profile.',
      meta: { profileId, userId },
    })
    await syncLog()

    if (oldEmail === newEmail) {
      pushStage({
        stage: 'finalize',
        ok: true,
        message: 'No-op: email already set to requested value.',
        meta: { status: 'applied' },
      })
      status = 'applied'
      await syncLog({ status })

      return {
        ok: true,
        logId,
        status,
        profileId,
        userId,
        oldEmail,
        newEmail,
        authUpdated,
        profileUpdated,
        invitesUpdated,
        inviteRowsUpdated,
        classSync: {
          attempted: false,
          impactedClassIds: [],
          results: [],
        },
        stages: details.stages,
      }
    }

    const preflight = await preflightEmailChange({
      profileId,
      oldEmail,
      newEmail,
      userId,
    })

    if (!preflight.ok) {
      details.preflight = preflight.conflict
      pushStage({
        stage: 'preflight',
        ok: false,
        error: preflight.error ?? 'Preflight checks failed.',
        meta: preflight.conflict,
      })
      await syncLog({ status: 'failed' })
      throw new Error(preflight.error ?? 'Preflight checks failed.')
    }

    pushStage({ stage: 'preflight', ok: true, message: 'Preflight checks passed.' })
    await syncLog()

    const authUpdate = await updateAuthEmailIfLinked({ userId, newEmail })
    if (!authUpdate.ok) {
      pushStage({ stage: 'auth_update', ok: false, error: authUpdate.error ?? 'Auth email update failed.' })
      await syncLog({ status: 'failed' })
      throw new Error(authUpdate.error ?? 'Auth email update failed.')
    }

    authUpdated = authUpdate.updated
    pushStage({
      stage: 'auth_update',
      ok: true,
      message: authUpdated ? 'Updated auth email.' : 'Skipped auth update (profile has no user_id).',
    })
    await syncLog()

    const { error: profileUpdateError } = await adminClient
      .from('profile')
      .update({ email: newEmail })
      .eq('id', profileId)

    if (profileUpdateError) {
      pushStage({ stage: 'profile_update', ok: false, error: profileUpdateError.message })
      await syncLog({ status: authUpdated ? 'partial' : 'failed' })
      throw new Error(profileUpdateError.message)
    }

    profileUpdated = true
    pushStage({ stage: 'profile_update', ok: true, message: 'Updated profile email.' })
    await syncLog()

    const inviteUpdate = await migrateInviteEmails({
      userId,
      oldEmail,
      newEmail,
    })

    if (!inviteUpdate.ok) {
      pushStage({
        stage: 'invite_migration',
        ok: false,
        error: inviteUpdate.error ?? 'Invite migration failed.',
      })
      await syncLog({ status: 'partial' })
      throw new Error(inviteUpdate.error ?? 'Invite migration failed.')
    }

    invitesUpdated = inviteUpdate.updatedCount > 0
    inviteRowsUpdated = inviteUpdate.updatedCount
    details.inviteMigration = { updatedCount: inviteRowsUpdated }
    pushStage({
      stage: 'invite_migration',
      ok: true,
      message: 'Invite migration complete.',
      meta: { updatedCount: inviteRowsUpdated },
    })
    await syncLog()

    if (triggerZoomSync) {
      await syncLog({ zoomSyncStartedAt: nowIso() })
      impactedClassIds = await resolveImpactedClassIds({ profileId, role: profile.role ?? null })
      classSyncResults = await syncImpactedClasses({ classIds: impactedClassIds, appOrigin })
      details.zoom = {
        impactedClassIds,
        results: classSyncResults,
      }
      const failedClassSync = classSyncResults.filter(result => !result.ok).length
      pushStage({
        stage: 'zoom_sync',
        ok: failedClassSync === 0,
        message:
          failedClassSync === 0
            ? `Synced ${classSyncResults.length} impacted classes.`
            : `Synced with ${failedClassSync} class sync failures.`,
        meta: {
          impactedClasses: impactedClassIds.length,
          failedClassSync,
        },
      })
      await syncLog({ zoomSyncCompletedAt: nowIso() })
    } else {
      pushStage({ stage: 'zoom_sync', ok: true, message: 'Zoom sync skipped by request.' })
      await syncLog()
    }

    const hasClassSyncFailures = classSyncResults.some(result => !result.ok)
    status = hasClassSyncFailures ? 'partial' : 'applied'
    pushStage({
      stage: 'finalize',
      ok: true,
      message: status === 'applied' ? 'Email change applied.' : 'Email change applied with follow-up needed.',
      meta: { status },
    })
    await syncLog({ status })

    return {
      ok: true,
      logId,
      status,
      profileId,
      userId,
      oldEmail,
      newEmail,
      authUpdated,
      profileUpdated,
      invitesUpdated,
      inviteRowsUpdated,
      classSync: {
        attempted: triggerZoomSync,
        impactedClassIds,
        results: classSyncResults,
      },
      stages: details.stages,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected email change error.'

    if (authUpdated && !profileUpdated && userId && oldEmail) {
      details.compensation = {
        ...(details.compensation ?? {}),
        attemptedAuthRevert: true,
      }

      const { error: authRevertError } = await adminClient.auth.admin.updateUserById(userId, {
        email: oldEmail,
        email_confirm: true,
      })

      if (authRevertError) {
        details.compensation = {
          ...(details.compensation ?? {}),
          attemptedAuthRevert: true,
          authRevertOk: false,
          authRevertError: authRevertError.message,
        }
      } else {
        authUpdated = false
        details.compensation = {
          ...(details.compensation ?? {}),
          attemptedAuthRevert: true,
          authRevertOk: true,
        }
      }
    }

    if (!details.stages.some(entry => entry.stage === 'finalize')) {
      pushStage({
        stage: 'finalize',
        ok: false,
        error: message,
      })
    }

    status = authUpdated || profileUpdated || invitesUpdated ? 'partial' : 'failed'
    await syncLog({ status })

    return {
      ok: false,
      error: message,
      logId,
      status,
      profileId,
      userId,
      oldEmail,
      newEmail,
      authUpdated,
      profileUpdated,
      invitesUpdated,
      inviteRowsUpdated,
      classSync: {
        attempted: triggerZoomSync,
        impactedClassIds,
        results: classSyncResults,
      },
      stages: details.stages,
    }
  }
}
