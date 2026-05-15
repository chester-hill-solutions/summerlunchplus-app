import { requireAuth } from '@/lib/auth.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { Constants, type Database } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/workshop-enrollment'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-enrollment')

export async function loader(args: Route.LoaderArgs) {
  const auth = await requireAuth(args.request)
  const base = await baseLoader(args)

  const rows = (base.rows ?? []) as Array<Record<string, unknown>>
  const profileIds = Array.from(
    new Set(rows.map(row => (typeof row.profile_id === 'string' ? row.profile_id : '')).filter(Boolean))
  )

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

  const enrichedRows = rows.map(row => {
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    const profileSignals = profileId ? openSignalsByProfileId.get(profileId) ?? [] : []
    if (!profileSignals.length) {
      return row
    }

    const hasHigh = profileSignals.some(signal => signal.severity === 'high')
    const primarySignal = profileSignals[0]
    const countLabel = profileSignals.length === 1 ? '1 open signal' : `${profileSignals.length} open signals`

    return {
      ...row,
      _row_class: hasHigh ? 'bg-amber-50' : 'bg-amber-50/70',
      _row_signal_summary: `${countLabel}: ${primarySignal.summary}`,
    }
  })

  return {
    ...base,
    rows: enrichedRows,
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
  const { error } = await supabase
    .from('workshop_enrollment')
    .update({ status, decided_by: auth.user.id })
    .eq('id', enrollmentId)

  if (error) {
    return new Response(error.message, { status: 500, headers: auth.headers })
  }

  return { ok: true }
}

export default function WorkshopEnrollmentPage() {
  return <TableDisplay />
}
