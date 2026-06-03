import { requireAuth } from '@/lib/auth.server'
import { localDateTimeToUtcIso, parseOffsetMinutes } from '@/lib/datetime'
import { sendTemplateEmail } from '@/lib/email/send-email.server'
import { resolveFamilyContactsByProfileId } from '@/lib/family.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { Constants, type Database } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { TABLE_DEFINITIONS } from './table-definitions'

import type { Route } from './+types/workshop-enrollment'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-enrollment')

const ENROLLMENT_STATUS_ORDER: Record<Database['public']['Enums']['workshop_enrollment_status'], number> = {
  pending: 0,
  waitlisted: 1,
  revoked: 2,
  approved: 3,
  rejected: 4,
}

const GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE = 'gift_card_store_preference'

const toTime = (value: unknown) => {
  if (typeof value !== 'string' || !value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed
}

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const parseEnrollmentField = (
  formData: FormData,
  fieldName: string,
  fieldType: string,
  nullable?: boolean
) => {
  const rawValue = formData.get(`field_${fieldName}`)
  if (rawValue === null) return { value: null as unknown, valid: true }

  const value = String(rawValue).trim()
  if (!value) {
    return { value: nullable ? null : '', valid: true }
  }

  if (fieldType === 'datetime') {
    const offset = parseOffsetMinutes(String(formData.get(`field_${fieldName}__tz_offset`) ?? ''))
    if (offset === null) return { value: null as unknown, valid: false }
    const utcIso = localDateTimeToUtcIso(value, offset)
    if (!utcIso) return { value: null as unknown, valid: false }
    return { value: utcIso, valid: true }
  }

  return { value, valid: true }
}

type RidingProfileRow = {
  id: string
  role: string | null
  federal_electoral_district_name: string | null
}

type GuardianChildEdge = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

type FormSubmissionRow = {
  id: string
  profile_id: string | null
  submitted_at: string | null
}

type FormAnswerRow = {
  submission_id: string
  value: unknown
}

const normalizeRiding = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const pushEdge = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string,
  profileId: string,
  primary: boolean
) => {
  const current = map.get(key) ?? []
  if (!current.some(item => item.profileId === profileId)) {
    current.push({ profileId, primary })
    current.sort((left, right) => Number(right.primary) - Number(left.primary))
    map.set(key, current)
  }
}

const preferredRelatedProfileId = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string
) => map.get(key)?.[0]?.profileId ?? null

export async function loader(args: Route.LoaderArgs) {
  const auth = await requireAuth(args.request)
  const base = await baseLoader(args)
  const canManageEnrollments = isRoleAtLeast(auth.claims.role, 'admin')

  const rows = (base.rows ?? []) as Array<Record<string, unknown>>
  const workshopIds = Array.from(
    new Set(rows.map(row => (typeof row.workshop_id === 'string' ? row.workshop_id : '')).filter(Boolean))
  )
  const profileIds = Array.from(
    new Set(rows.map(row => (typeof row.profile_id === 'string' ? row.profile_id : '')).filter(Boolean))
  )

  const approvedByWorkshopId = rows.reduce((acc, row) => {
    const workshopId = typeof row.workshop_id === 'string' ? row.workshop_id : ''
    const status = typeof row.status === 'string' ? row.status : ''
    if (!workshopId || status !== 'approved') {
      return acc
    }
    acc.set(workshopId, (acc.get(workshopId) ?? 0) + 1)
    return acc
  }, new Map<string, number>())

  let workshopCapacityById = new Map<string, number>()
  if (workshopIds.length) {
    const { data: workshopRows, error: workshopError } = await adminClient
      .from('workshop')
      .select('id, capacity')
      .in('id', workshopIds)

    if (!workshopError) {
      workshopCapacityById = (workshopRows ?? []).reduce((acc, workshop) => {
        if (!workshop.id) {
          return acc
        }
        acc.set(workshop.id, workshop.capacity)
        return acc
      }, new Map<string, number>())
    }
  }

  let openSignalsByProfileId = new Map<string, Array<{ severity: string; summary: string }>>()

  if (profileIds.length) {
    const { data: openSignals, error: openSignalsError } = await adminClient
      .from('suspicious_signal')
      .select('family_profile_ids, severity, summary')
      .eq('status', 'open')

    if (!openSignalsError) {
      openSignalsByProfileId = (openSignals ?? []).reduce(
        (acc, signal) => {
          for (const profileId of signal.family_profile_ids ?? []) {
            if (!profileIds.includes(profileId)) continue
            const existing = acc.get(profileId) ?? []
            existing.push({ severity: signal.severity, summary: signal.summary })
            acc.set(profileId, existing)
          }
          return acc
        },
        new Map<string, Array<{ severity: string; summary: string }>>()
      )
    }
  }

  let profileById = new Map<string, RidingProfileRow>()
  let guardiansByChildId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  let childrenByGuardianId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  let familyProfileIdsByProfileId = new Map<string, string[]>()
  let mealKitByProfileId = new Map<string, boolean>()
  let giftCardPreferenceByProfileId = new Map<string, string>()

  if (profileIds.length) {
    const seen = new Set<string>(profileIds)
    const queue = [...profileIds]
    const familyEdges: GuardianChildEdge[] = []

    while (queue.length) {
      const batch = queue.splice(0, queue.length)
      const { data: batchEdges, error: familyEdgesError } = await adminClient
        .from('person_guardian_child')
        .select('guardian_profile_id, child_profile_id, primary_child')
        .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)

      if (familyEdgesError) {
        break
      }

      for (const edge of (batchEdges ?? []) as GuardianChildEdge[]) {
        familyEdges.push(edge)
        if (!seen.has(edge.guardian_profile_id)) {
          seen.add(edge.guardian_profile_id)
          queue.push(edge.guardian_profile_id)
        }
        if (!seen.has(edge.child_profile_id)) {
          seen.add(edge.child_profile_id)
          queue.push(edge.child_profile_id)
        }
      }
    }

    for (const edge of familyEdges) {
      pushEdge(guardiansByChildId, edge.child_profile_id, edge.guardian_profile_id, edge.primary_child)
      pushEdge(childrenByGuardianId, edge.guardian_profile_id, edge.child_profile_id, edge.primary_child)
    }

    const profileScope = Array.from(seen)
    const familyAdjacency = new Map<string, Set<string>>()
    for (const profileId of profileScope) {
      if (!familyAdjacency.has(profileId)) {
        familyAdjacency.set(profileId, new Set())
      }
    }

    for (const edge of familyEdges) {
      if (!familyAdjacency.has(edge.guardian_profile_id)) {
        familyAdjacency.set(edge.guardian_profile_id, new Set())
      }
      if (!familyAdjacency.has(edge.child_profile_id)) {
        familyAdjacency.set(edge.child_profile_id, new Set())
      }
      familyAdjacency.get(edge.guardian_profile_id)?.add(edge.child_profile_id)
      familyAdjacency.get(edge.child_profile_id)?.add(edge.guardian_profile_id)
    }

    const { data: profileRows, error: profileRowsError } = await adminClient
      .from('profile')
      .select('id, role, federal_electoral_district_name')
      .in('id', profileScope)

    if (!profileRowsError) {
      profileById = new Map(
        ((profileRows ?? []) as RidingProfileRow[])
          .filter(profile => typeof profile.id === 'string' && profile.id)
          .map(profile => [profile.id, profile])
      )

      const visited = new Set<string>()
      for (const rootProfileId of profileScope) {
        if (visited.has(rootProfileId)) continue

        const familyIds: string[] = []
        const bfsQueue = [rootProfileId]
        visited.add(rootProfileId)

        while (bfsQueue.length) {
          const currentProfileId = bfsQueue.shift()
          if (!currentProfileId) continue
          familyIds.push(currentProfileId)

          for (const neighbor of familyAdjacency.get(currentProfileId) ?? []) {
            if (visited.has(neighbor)) continue
            visited.add(neighbor)
            bfsQueue.push(neighbor)
          }
        }

        familyIds.sort((left, right) => left.localeCompare(right))
        for (const familyProfileId of familyIds) {
          familyProfileIdsByProfileId.set(familyProfileId, familyIds)
        }
      }

      const ridingNames = Array.from(
        new Set(
          (profileRows ?? [])
            .map(profile => normalizeRiding(profile.federal_electoral_district_name))
            .filter((riding): riding is string => Boolean(riding))
        )
      )

      const mealKitByRidingName = new Map<string, boolean>()
      if (ridingNames.length) {
        const { data: ridingRows, error: ridingRowsError } = await adminClient
          .from('federal_electoral_district')
          .select('name, meal_kit')
          .in('name', ridingNames)

        if (!ridingRowsError) {
          for (const riding of ridingRows ?? []) {
            if (typeof riding.name !== 'string') continue
            mealKitByRidingName.set(riding.name, riding.meal_kit === true)
          }
        }
      }

      for (const profile of profileById.values()) {
        const ridingName = normalizeRiding(profile.federal_electoral_district_name)
        if (!ridingName) {
          mealKitByProfileId.set(profile.id, false)
          continue
        }

        mealKitByProfileId.set(profile.id, mealKitByRidingName.get(ridingName) === true)
      }

      const { data: submissionRows, error: submissionRowsError } = await adminClient
        .from('form_submission')
        .select('id, profile_id, submitted_at')
        .in('profile_id', profileScope)
        .order('submitted_at', { ascending: false })

      if (!submissionRowsError) {
        const submissions = (submissionRows ?? []) as FormSubmissionRow[]
        const submissionIds = submissions
          .map(submission => submission.id)
          .filter((submissionId): submissionId is string => Boolean(submissionId))

        if (submissionIds.length) {
          const { data: answerRows, error: answerRowsError } = await adminClient
            .from('form_answer')
            .select('submission_id, value')
            .eq('question_code', GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE)
            .in('submission_id', submissionIds)

          if (!answerRowsError) {
            const submissionById = new Map(submissions.map(submission => [submission.id, submission]))
            const latestGiftCardByProfileId = new Map<string, { value: string; submittedAt: number }>()

            for (const answer of (answerRows ?? []) as FormAnswerRow[]) {
              const submission = submissionById.get(answer.submission_id)
              const profileId = submission?.profile_id
              if (!profileId) continue

              const value = typeof answer.value === 'string' ? answer.value.trim() : ''
              if (!value) continue

              const submittedAt = Date.parse(submission?.submitted_at ?? '')
              const submittedAtTime = Number.isNaN(submittedAt) ? 0 : submittedAt
              const existing = latestGiftCardByProfileId.get(profileId)

              if (!existing || submittedAtTime > existing.submittedAt) {
                latestGiftCardByProfileId.set(profileId, {
                  value,
                  submittedAt: submittedAtTime,
                })
              }
            }

            giftCardPreferenceByProfileId = new Map(
              Array.from(latestGiftCardByProfileId.entries()).map(([profileId, entry]) => [profileId, entry.value])
            )
          }
        }
      }
    }
  }

  const enrichedRows: Array<Record<string, unknown>> = rows.map(row => {
    const workshopId = typeof row.workshop_id === 'string' ? row.workshop_id : ''
    const approved = workshopId ? approvedByWorkshopId.get(workshopId) ?? 0 : 0
    const capacity = workshopId ? workshopCapacityById.get(workshopId) ?? null : null

    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    const profileSignals = profileId ? openSignalsByProfileId.get(profileId) ?? [] : []
    const enrollmentProfile = profileId ? profileById.get(profileId) ?? null : null

    const inferredStudentProfileId = (() => {
      if (!profileId) return null
      if (enrollmentProfile?.role === 'student') return profileId
      if (enrollmentProfile?.role === 'guardian') {
        return preferredRelatedProfileId(childrenByGuardianId, profileId)
      }

      const directChild = preferredRelatedProfileId(childrenByGuardianId, profileId)
      if (directChild) return directChild
      return profileId
    })()

    const studentRiding = inferredStudentProfileId
      ? normalizeRiding(profileById.get(inferredStudentProfileId)?.federal_electoral_district_name)
      : null

    const inferredParentProfileId = (() => {
      if (!profileId) return null
      if (inferredStudentProfileId) {
        const guardianId = preferredRelatedProfileId(guardiansByChildId, inferredStudentProfileId)
        if (guardianId) return guardianId
      }
      if (enrollmentProfile?.role === 'guardian') return profileId
      return preferredRelatedProfileId(guardiansByChildId, profileId)
    })()

    const parentRiding = inferredParentProfileId
      ? normalizeRiding(profileById.get(inferredParentProfileId)?.federal_electoral_district_name)
      : null

    const ridingDisplay = studentRiding ?? parentRiding ?? normalizeRiding(enrollmentProfile?.federal_electoral_district_name) ?? ''

    const candidateProfileIds: string[] = []
    const addCandidate = (candidateId: string | null) => {
      if (!candidateId || candidateProfileIds.includes(candidateId)) return
      candidateProfileIds.push(candidateId)
    }

    addCandidate(inferredStudentProfileId)
    addCandidate(inferredParentProfileId)

    for (const familyProfileId of familyProfileIdsByProfileId.get(profileId) ?? []) {
      addCandidate(familyProfileId)
    }

    addCandidate(profileId || null)

    const giftcardDisplay = (() => {
      for (const candidateProfileId of candidateProfileIds) {
        if (mealKitByProfileId.get(candidateProfileId) === true) {
          return 'Meal Kit'
        }

        const giftCardChoice = giftCardPreferenceByProfileId.get(candidateProfileId)
        if (giftCardChoice) {
          return giftCardChoice
        }
      }

      return 'N/A'
    })()

    const baseRow = {
      ...row,
      enrolled_capacity: capacity === null ? `${approved}/-` : `${approved}/${capacity}`,
      riding_display: ridingDisplay,
      giftcard_display: giftcardDisplay,
    }

    if (!profileSignals.length) {
      return baseRow
    }

    const hasHigh = profileSignals.some(signal => signal.severity === 'high')
    const primarySignal = profileSignals[0]
    const countLabel = profileSignals.length === 1 ? '1 open signal' : `${profileSignals.length} open signals`

    return {
      ...baseRow,
      _row_class: hasHigh ? 'bg-amber-50' : 'bg-amber-50/70',
      _row_signal_summary: `${countLabel}: ${primarySignal.summary}`,
    }
  })

  enrichedRows.sort((left, right) => {
    const leftStatus =
      typeof left.status === 'string'
        ? (left.status as Database['public']['Enums']['workshop_enrollment_status'])
        : 'rejected'
    const rightStatus =
      typeof right.status === 'string'
        ? (right.status as Database['public']['Enums']['workshop_enrollment_status'])
        : 'rejected'

    const statusDiff = ENROLLMENT_STATUS_ORDER[leftStatus] - ENROLLMENT_STATUS_ORDER[rightStatus]
    if (statusDiff !== 0) {
      return statusDiff
    }

    const timeDiff = toTime(left.requested_at) - toTime(right.requested_at)
    if (timeDiff !== 0) {
      return timeDiff
    }

    const leftId = typeof left.id === 'string' ? left.id : ''
    const rightId = typeof right.id === 'string' ? right.id : ''
    return leftId.localeCompare(rightId)
  })

  let columns = base.columns.includes('enrolled_capacity')
    ? base.columns
    : [...base.columns.slice(0, 2), 'enrolled_capacity', ...base.columns.slice(2)]

  if (!columns.includes('riding_display')) {
    const profileIndex = columns.indexOf('profile_display')
    if (profileIndex >= 0) {
      columns = [...columns.slice(0, profileIndex + 1), 'riding_display', ...columns.slice(profileIndex + 1)]
    } else {
      columns = [...columns, 'riding_display']
    }
  }

  if (!columns.includes('giftcard_display')) {
    const ridingIndex = columns.indexOf('riding_display')
    if (ridingIndex >= 0) {
      columns = [...columns.slice(0, ridingIndex + 1), 'giftcard_display', ...columns.slice(ridingIndex + 1)]
    } else {
      const profileIndex = columns.indexOf('profile_display')
      if (profileIndex >= 0) {
        columns = [...columns.slice(0, profileIndex + 1), 'giftcard_display', ...columns.slice(profileIndex + 1)]
      } else {
        columns = [...columns, 'giftcard_display']
      }
    }
  }

  if (columns.includes('semester_range')) {
    columns = [...columns.filter(column => column !== 'semester_range'), 'semester_range']
  }

  return {
    ...base,
    columns,
    rows: enrichedRows,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      enrolled_capacity: {
        label: 'enrolled/capacity',
      },
      riding_display: {
        label: 'riding',
      },
      giftcard_display: {
        label: 'giftcard',
      },
    },
    canEditStatus: isRoleAtLeast(auth.claims.role, 'staff'),
    editorConfig: canManageEnrollments ? base.editorConfig : undefined,
    foreignKeyOptions: canManageEnrollments ? base.foreignKeyOptions : undefined,
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)

  const formData = await request.formData()
  const intent = formData.get('intent') as string | null

  if (intent === 'update-status') {
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const enrollmentId = formData.get('enrollment_id') as string
    const status = formData.get('status') as string | null
    if (!enrollmentId || !status) {
      return new Response('Missing enrollment data', { status: 400, headers: auth.headers })
    }

    if (
      !Constants.public.Enums.workshop_enrollment_status.includes(
        status as Database['public']['Enums']['workshop_enrollment_status']
      )
    ) {
      return new Response('Invalid status', { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const { data: existingEnrollment, error: existingEnrollmentError } = await supabase
      .from('workshop_enrollment')
      .select('id, profile_id, workshop_id, status')
      .eq('id', enrollmentId)
      .single()

    if (existingEnrollmentError || !existingEnrollment) {
      return new Response(existingEnrollmentError?.message ?? 'Enrollment not found', {
        status: 404,
        headers: auth.headers,
      })
    }

    const { error } = await supabase
      .from('workshop_enrollment')
      .update({ status, decided_by: auth.user.id })
      .eq('id', enrollmentId)

    if (error) {
      return new Response(error.message, { status: 500, headers: auth.headers })
    }

    const transitionedToApproved = existingEnrollment.status !== 'approved' && status === 'approved'
    if (transitionedToApproved && existingEnrollment.profile_id) {
      try {
        const familyContacts = await resolveFamilyContactsByProfileId(adminClient, existingEnrollment.profile_id)
        const { data: workshopRow } = await adminClient
          .from('workshop')
          .select('description')
          .eq('id', existingEnrollment.workshop_id)
          .single()

        const workshopName = workshopRow?.description?.trim() || 'selected workshop'
        const recipientEmails = Array.from(
          new Set(
            familyContacts
              .map(contact => contact.email?.trim().toLowerCase())
              .filter((value): value is string => Boolean(value && isLikelyEmail(value)))
          )
        )

        const eventKey = `workshop_enrollment:${enrollmentId}:family_accepted:v1`

        await Promise.all(
          recipientEmails.map(async email => {
            const recipient = familyContacts.find(contact => contact.email?.trim().toLowerCase() === email) ?? null
            return sendTemplateEmail({
              toEmail: email,
              templateKey: 'family_enrollment_accepted_v1',
              templateData: {
                workshopName,
              },
              eventKey,
              triggeredByUserId: auth.user.id,
              recipientUserId: recipient?.user_id ?? null,
              profileId: recipient?.id ?? null,
              familyProfileId: existingEnrollment.profile_id,
              workshopEnrollmentId: enrollmentId,
            })
          })
        )
      } catch (notificationError) {
        console.error('[workshop enrollment] accepted notification failed', {
          enrollmentId,
          error: notificationError,
        })
      }
    }

    return { ok: true }
  }

  if (intent !== 'insert-row' && intent !== 'update-row') {
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const definition = TABLE_DEFINITIONS['class-enrollment']
  if (!definition?.editor) {
    return { error: 'Editing is not enabled for workshop enrollments.' }
  }

  const payload: Record<string, unknown> = {}
  for (const [fieldName, fieldConfig] of Object.entries(definition.editor.fields)) {
    const parsed = parseEnrollmentField(formData, fieldName, fieldConfig.type, fieldConfig.nullable)
    if (!parsed.valid) {
      return { error: `Invalid value for ${fieldConfig.label ?? fieldName}.` }
    }
    if (
      fieldConfig.required &&
      (parsed.value === '' || parsed.value === null || parsed.value === undefined)
    ) {
      return { error: `${fieldConfig.label ?? fieldName} is required.` }
    }
    payload[fieldName] = parsed.value === '' ? null : parsed.value
  }

  const { supabase } = createClient(request)

  if (intent === 'insert-row') {
    const { error: insertError } = await supabase
      .from('workshop_enrollment')
      .insert(payload)

    if (insertError) {
      return { error: insertError.message }
    }

    return { success: true }
  }

  const enrollmentId = String(formData.get('pk_id') ?? '')
  if (!enrollmentId) {
    return { error: 'Missing key field id.' }
  }

  const { error: updateError } = await supabase
    .from('workshop_enrollment')
    .update(payload)
    .eq('id', enrollmentId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { success: true }
}

export default function WorkshopEnrollmentPage() {
  return <TableDisplay />
}
