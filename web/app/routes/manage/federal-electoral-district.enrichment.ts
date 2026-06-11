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

const canonicalRiding = (value: string) =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/[—–−]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()

const ridingNameVariants = (value: string) => {
  const trimmed = value.trim()
  const variants = new Set<string>([trimmed])
  variants.add(trimmed.replace(/[—–−]/g, '-'))
  variants.add(trimmed.replace(/-/g, '—'))
  return Array.from(variants)
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

  const requestedRidingByCanonical = new Map(
    ridingNames.map(riding => [canonicalRiding(riding), riding])
  )

  const lookupRidingNames = Array.from(
    new Set(
      ridingNames.flatMap(riding => ridingNameVariants(riding))
    )
  )

  const { data: profileRows, error: profileError } = await adminClient
    .from('profile')
    .select('id, federal_electoral_district_name')
    .in('federal_electoral_district_name', lookupRidingNames)

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

  const requestedRidingByProfileId = new Map(
    (profileRows ?? [])
      .filter(row => typeof row.id === 'string' && typeof row.federal_electoral_district_name === 'string')
      .map(row => {
        const requested = requestedRidingByCanonical.get(canonicalRiding(row.federal_electoral_district_name))
        return [row.id, requested ?? null]
      })
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
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

    const riding = requestedRidingByProfileId.get(profileId)
    if (!riding) continue

    const status = enrollment.status as Database['public']['Enums']['workshop_enrollment_status']
    const bucket = statusBucketFor(status)
    if (!bucket) continue

    byRiding[riding][bucket] += 1
  }

  return Response.json({ byRiding }, { headers: auth.headers })
}
