import { requireAuth } from '@/lib/auth.server'
import { sendTemplateEmail } from '@/lib/email/send-email.server'
import { resolveFamilyContactsByProfileId } from '@/lib/family.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { Constants, type Database } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

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

export async function loader(args: Route.LoaderArgs) {
  const auth = await requireAuth(args.request)
  const base = await baseLoader(args)

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

  const columns = base.columns.includes('enrolled_capacity')
    ? base.columns
    : [
        ...base.columns.slice(0, 2),
        'enrolled_capacity',
        ...base.columns.slice(2),
      ]

  return {
    ...base,
    columns,
    rows: enrichedRows,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      enrolled_capacity: {
        label: 'enrolled/capacity',
      },
    },
    canEditStatus: isRoleAtLeast(auth.claims.role, 'staff'),
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = formData.get('intent') as string | null
  if (intent !== 'update-status') {
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
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
    return new Response(existingEnrollmentError?.message ?? 'Enrollment not found', { status: 404, headers: auth.headers })
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

export default function WorkshopEnrollmentPage() {
  return <TableDisplay />
}
