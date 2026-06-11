import type { Database } from '@/lib/database.types'
import { requireAuth } from '@/lib/auth.server'
import { createClient } from '@/lib/supabase/server'
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

const chunk = <T,>(items: T[], size: number) => {
  if (!items.length || size <= 0) return [] as T[][]
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

export async function loader({ request }: { request: Request }) {
  const auth = await requireAuth(request)
  const { supabase } = createClient(request)
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

  const { data: enrollmentRows, error: enrollmentError } = await supabase
    .from('workshop_enrollment')
    .select('profile_id, status')
    .not('profile_id', 'is', null)

  if (enrollmentError) {
    console.error('[federal-electoral-district] failed to load enrollment rows', enrollmentError)
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const profileIds = Array.from(
    new Set(
      (enrollmentRows ?? [])
        .map(enrollment => enrollment.profile_id)
        .filter((profileId): profileId is string => typeof profileId === 'string' && Boolean(profileId))
    )
  )

  if (!profileIds.length) {
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const profileRows: Array<{ id: string; federal_electoral_district_name: string | null }> = []
  for (const profileChunk of chunk(profileIds, 500)) {
    const { data, error } = await supabase
      .from('profile')
      .select('id, federal_electoral_district_name')
      .in('id', profileChunk)

    if (error) {
      console.error('[federal-electoral-district] failed to load profile riding map', error)
      return Response.json({ byRiding }, { headers: auth.headers })
    }

    profileRows.push(...((data ?? []) as Array<{ id: string; federal_electoral_district_name: string | null }>))
  }

  const lookupRidingNames = Array.from(
    new Set(
      ridingNames.flatMap(riding => ridingNameVariants(riding)).map(canonicalRiding)
    )
  )
  const lookupRidingNameSet = new Set(lookupRidingNames)

  const matchingProfileIds = new Set(
    profileRows
      .filter(row => {
        if (!row.federal_electoral_district_name) return false
        return lookupRidingNameSet.has(canonicalRiding(row.federal_electoral_district_name))
      })
      .map(row => row.id)
  )

  if (!matchingProfileIds.size) {
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const scopedEnrollmentRows = (enrollmentRows ?? []).filter(enrollment => {
    if (typeof enrollment.profile_id !== 'string') return false
    return matchingProfileIds.has(enrollment.profile_id)
  })

  const scopedProfileIds = Array.from(
    new Set(
      scopedEnrollmentRows
        .map(enrollment => enrollment.profile_id)
    .filter((profileId): profileId is string => typeof profileId === 'string' && Boolean(profileId))
    )
  )
  const scopedProfileIdSet = new Set(scopedProfileIds)

  if (!scopedProfileIds.length) {
    return Response.json({ byRiding }, { headers: auth.headers })
  }

  const requestedRidingByProfileId = new Map(
    profileRows
      .filter(row => scopedProfileIdSet.has(row.id) && typeof row.federal_electoral_district_name === 'string')
      .map(row => {
        const ridingName = row.federal_electoral_district_name ?? ''
        const requested = requestedRidingByCanonical.get(canonicalRiding(ridingName))
        return [row.id, requested ?? null]
      })
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  )

  for (const enrollment of scopedEnrollmentRows) {
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
