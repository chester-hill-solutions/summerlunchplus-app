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

  const enrichedRows: Array<Record<string, unknown>> = rows.map(row => {
    const workshopId = typeof row.workshop_id === 'string' ? row.workshop_id : ''
    const approved = workshopId ? approvedByWorkshopId.get(workshopId) ?? 0 : 0
    const capacity = workshopId ? workshopCapacityById.get(workshopId) ?? null : null

    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    const profileSignals = profileId ? openSignalsByProfileId.get(profileId) ?? [] : []

    const baseRow = {
      ...row,
      enrolled_capacity: capacity === null ? `${approved}/-` : `${approved}/${capacity}`,
      riding_display: '...',
      giftcard_display: '...',
      prior_participation_display: '...',
      profile_hover_name: '',
      profile_hover_email: '',
      profile_hover_parent_email: '',
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

  if (!columns.includes('prior_participation_display')) {
    const giftcardIndex = columns.indexOf('giftcard_display')
    if (giftcardIndex >= 0) {
      columns = [
        ...columns.slice(0, giftcardIndex + 1),
        'prior_participation_display',
        ...columns.slice(giftcardIndex + 1),
      ]
    } else {
      const profileIndex = columns.indexOf('profile_display')
      if (profileIndex >= 0) {
        columns = [...columns.slice(0, profileIndex + 1), 'prior_participation_display', ...columns.slice(profileIndex + 1)]
      } else {
        columns = [...columns, 'prior_participation_display']
      }
    }
  }

  if (columns.includes('semester_range')) {
    columns = [...columns.filter(column => column !== 'semester_range'), 'semester_range']
  }

  const baseColumnMeta = (base.columnMeta ?? {}) as Record<
    string,
    {
      label?: string
      truncate?: boolean
      filterable?: boolean
      numeric?: boolean
      maxChars?: number
      hoverCard?: unknown
    }
  >

  return {
    ...base,
    columns,
    rows: enrichedRows,
    columnMeta: {
      ...baseColumnMeta,
      profile_display: {
        ...(baseColumnMeta.profile_display ?? {}),
        hoverCard: {
          titleField: 'profile_hover_name',
          titleFallback: 'N/A',
          fields: [
            { label: 'Email', field: 'profile_hover_email', fallback: 'N/A' },
            { label: 'Parent Email', field: 'profile_hover_parent_email', fallback: 'N/A' },
          ],
        },
      },
      enrolled_capacity: {
        label: 'enrolled/capacity',
      },
      riding_display: {
        label: 'riding',
      },
      giftcard_display: {
        label: 'giftcard',
        maxChars: 6,
      },
      prior_participation_display: {
        label: 'been before?',
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
