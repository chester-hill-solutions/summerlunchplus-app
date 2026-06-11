import type { Database } from '@/lib/database.types'
import { requireAuth } from '@/lib/auth.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { isRoleAtLeast } from '@/lib/roles'

const statusBucketFor = (status: Database['public']['Enums']['workshop_enrollment_status']) => {
  if (status === 'approved') return 'accepted'
  if (status === 'pending') return 'pending'
  if (status === 'waitlisted') return 'waitlisted'
  if (status === 'rejected' || status === 'revoked') return 'declined'
  return null
}

export async function loader({ request }: { request: Request }) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const url = new URL(request.url)
  const ridingNames = Array.from(
    new Set(
      url.searchParams
        .getAll('riding')
        .map(value => value.trim())
        .filter(Boolean)
    )
  )

  if (!ridingNames.length) {
    return Response.json({ byRiding: {} }, { headers: auth.headers })
  }

  const byRiding = ridingNames.reduce<Record<string, { accepted: number; pending: number; waitlisted: number; declined: number }>>(
    (acc, riding) => {
      acc[riding] = { accepted: 0, pending: 0, waitlisted: 0, declined: 0 }
      return acc
    },
    {}
  )

  const { data: profileRows, error: profileError } = await adminClient
    .from('profile')
    .select('id, federal_electoral_district_name')
    .in('federal_electoral_district_name', ridingNames)

  if (profileError) {
    console.error('[federal-electoral-district] failed to load profile riding map', profileError)
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const profileIds = (profileRows ?? [])
    .map(profile => profile.id)
    .filter((profileId): profileId is string => typeof profileId === 'string' && Boolean(profileId))

  if (!profileIds.length) {
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const ridingByProfileId = new Map(
    (profileRows ?? [])
      .filter(row => typeof row.id === 'string' && typeof row.federal_electoral_district_name === 'string')
      .map(row => [row.id, row.federal_electoral_district_name])
  )

  const { data: enrollmentRows, error: enrollmentError } = await adminClient
    .from('workshop_enrollment')
    .select('profile_id, status')
    .in('profile_id', profileIds)

  if (enrollmentError) {
    console.error('[federal-electoral-district] failed to load enrollment status counts', enrollmentError)
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  for (const enrollment of enrollmentRows ?? []) {
    const profileId = typeof enrollment.profile_id === 'string' ? enrollment.profile_id : ''
    if (!profileId) continue

    const riding = ridingByProfileId.get(profileId)
    if (!riding) continue

    const status = enrollment.status as Database['public']['Enums']['workshop_enrollment_status']
    const bucket = statusBucketFor(status)
    if (!bucket) continue

    byRiding[riding][bucket] += 1
  }

  return Response.json({ byRiding }, { headers: auth.headers })
}
