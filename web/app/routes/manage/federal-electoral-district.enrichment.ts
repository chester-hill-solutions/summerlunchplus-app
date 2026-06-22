import type { Database } from '@/lib/database.types'
import { requireAuth } from '@/lib/auth.server'
import { createClient } from '@/lib/supabase/server'
import { isRoleAtLeast } from '@/lib/roles'

type FamilyEdgeRow = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

type ProfileRidingRow = {
  id: string
  role: Database['public']['Enums']['app_role'] | null
  federal_electoral_district_name: string | null
}

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

const chunk = <T,>(items: T[], size: number) => {
  if (!items.length || size <= 0) return [] as T[][]
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

const pushFamilyLink = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string,
  profileId: string,
  primary: boolean
) => {
  const entries = map.get(key) ?? []
  if (entries.some(entry => entry.profileId === profileId)) return
  entries.push({ profileId, primary })
  entries.sort((left, right) => Number(right.primary) - Number(left.primary) || left.profileId.localeCompare(right.profileId))
  map.set(key, entries)
}

const firstRidingFromLinks = (
  links: Array<{ profileId: string; primary: boolean }> | undefined,
  ridingByProfileId: Map<string, string>
) => {
  if (!links?.length) return null
  for (const link of links) {
    const riding = ridingByProfileId.get(link.profileId)
    if (riding) return riding
  }
  return null
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

  const byRiding = ridingNames.reduce<Record<string, { total: number; accepted: number; pending: number; waitlisted: number; declined: number }>>(
    (acc, riding) => {
      acc[riding] = { total: 0, accepted: 0, pending: 0, waitlisted: 0, declined: 0 }
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

  const profileRows: ProfileRidingRow[] = []
  for (const profileChunk of chunk(profileIds, 500)) {
    const { data, error } = await supabase
      .from('profile')
      .select('id, role, federal_electoral_district_name')
      .in('id', profileChunk)

    if (error) {
      console.error('[federal-electoral-district] failed to load profile riding map', error)
      return Response.json({ byRiding }, { headers: auth.headers })
    }

    profileRows.push(...((data ?? []) as ProfileRidingRow[]))
  }

  const profileById = new Map(profileRows.map(row => [row.id, row]))
  const ridingByProfileId = new Map(
    profileRows
      .map(row => [row.id, typeof row.federal_electoral_district_name === 'string' ? row.federal_electoral_district_name.trim() : ''] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
  )

  const childrenByGuardian = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const guardiansByChild = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const relatedProfileIds = new Set<string>()

  for (const profileChunk of chunk(profileIds, 200)) {
    const { data: edges, error: edgesError } = await supabase
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${profileChunk.join(',')}),child_profile_id.in.(${profileChunk.join(',')})`)

    if (edgesError) {
      console.error('[federal-electoral-district] failed to load family edges', edgesError)
      return Response.json({ byRiding }, { headers: auth.headers })
    }

    for (const edge of (edges ?? []) as FamilyEdgeRow[]) {
      pushFamilyLink(childrenByGuardian, edge.guardian_profile_id, edge.child_profile_id, edge.primary_child)
      pushFamilyLink(guardiansByChild, edge.child_profile_id, edge.guardian_profile_id, edge.primary_child)
      relatedProfileIds.add(edge.guardian_profile_id)
      relatedProfileIds.add(edge.child_profile_id)
    }
  }

  const missingRelatedProfileIds = Array.from(relatedProfileIds).filter(profileId => !profileById.has(profileId))
  for (const relatedChunk of chunk(missingRelatedProfileIds, 500)) {
    const { data: relatedProfiles, error: relatedProfilesError } = await supabase
      .from('profile')
      .select('id, federal_electoral_district_name')
      .in('id', relatedChunk)

    if (relatedProfilesError) {
      console.error('[federal-electoral-district] failed to load related profile ridings', relatedProfilesError)
      return Response.json({ byRiding }, { headers: auth.headers })
    }

    for (const related of relatedProfiles ?? []) {
      const relatedId = typeof related.id === 'string' ? related.id : ''
      const relatedRiding =
        typeof related.federal_electoral_district_name === 'string'
          ? related.federal_electoral_district_name.trim()
          : ''
      if (!relatedId || !relatedRiding) continue
      ridingByProfileId.set(relatedId, relatedRiding)
    }
  }

  for (const enrollment of enrollmentRows ?? []) {
    const profileId = typeof enrollment.profile_id === 'string' ? enrollment.profile_id : ''
    if (!profileId) continue

    const enrolledProfile = profileById.get(profileId)
    const enrolledRole = enrolledProfile?.role

    const enrolledRiding = ridingByProfileId.get(profileId) ?? null
    const primaryChildRiding = firstRidingFromLinks(childrenByGuardian.get(profileId), ridingByProfileId)
    const primaryGuardianRiding = firstRidingFromLinks(guardiansByChild.get(profileId), ridingByProfileId)
    const anyFamilyRiding =
      firstRidingFromLinks(childrenByGuardian.get(profileId), ridingByProfileId) ??
      firstRidingFromLinks(guardiansByChild.get(profileId), ridingByProfileId)

    const effectiveRiding =
      enrolledRiding ??
      (enrolledRole === 'guardian' ? primaryChildRiding : null) ??
      (enrolledRole === 'student' ? primaryGuardianRiding : null) ??
      primaryChildRiding ??
      primaryGuardianRiding ??
      anyFamilyRiding

    if (!effectiveRiding) continue

    const requestedRiding = requestedRidingByCanonical.get(canonicalRiding(effectiveRiding))
    if (!requestedRiding) continue

    const status = enrollment.status as Database['public']['Enums']['workshop_enrollment_status']
    const bucket = statusBucketFor(status)
    if (!bucket) continue

    byRiding[requestedRiding].total += 1
    byRiding[requestedRiding][bucket] += 1
  }

  return Response.json({ byRiding }, { headers: auth.headers })
}
