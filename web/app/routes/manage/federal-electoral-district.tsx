import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'

import type { Route } from './+types/federal-electoral-district'

const baseLoader = createTableLoader('federal-electoral-district')

type EnrollmentRow = {
  profile_id: string | null
  status: Database['public']['Enums']['workshop_enrollment_status']
}

type ProfileRidingRow = {
  id: string
  role: Database['public']['Enums']['app_role'] | null
  federal_electoral_district_name: string | null
}

type FamilyEdgeRow = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

type RidingCounts = {
  total: number
  accepted: number
  pending: number
  waitlisted: number
  declined: number
}

const PROFILE_IN_BATCH_SIZE = 80
const FAMILY_EDGE_IN_BATCH_SIZE = 40
const RELATED_PROFILE_IN_BATCH_SIZE = 80

const chunk = <T,>(items: T[], size: number) => {
  if (!items.length || size <= 0) return [] as T[][]
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}

const canonicalRiding = (value: string) =>
  value
    .normalize('NFKC')
    .trim()
    .replace(/[—–−]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()

const statusBucketFor = (status: Database['public']['Enums']['workshop_enrollment_status']) => {
  if (status === 'approved') return 'accepted'
  if (status === 'pending') return 'pending'
  if (status === 'waitlisted') return 'waitlisted'
  if (status === 'rejected' || status === 'revoked') return 'declined'
  return null
}

const emptyCounts = (): RidingCounts => ({
  total: 0,
  accepted: 0,
  pending: 0,
  waitlisted: 0,
  declined: 0,
})

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

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const { supabase } = createClient(args.request)

  const baseRows = (base.rows ?? []) as Array<Record<string, unknown>>
  const ridingNames = Array.from(
    new Set(
      baseRows
        .map(row => (typeof row.name === 'string' ? row.name.trim() : ''))
        .filter(Boolean)
    )
  )

  const requestedRidingByCanonical = new Map(ridingNames.map(riding => [canonicalRiding(riding), riding]))
  const byRiding = ridingNames.reduce<Record<string, RidingCounts>>((acc, riding) => {
    acc[riding] = emptyCounts()
    return acc
  }, {})

  const { data: enrollmentRowsRaw, error: enrollmentError } = await supabase
    .from('workshop_enrollment')
    .select('profile_id, status')
    .not('profile_id', 'is', null)

  if (enrollmentError) {
    throw new Response(enrollmentError.message, { status: 500 })
  }

  const enrollmentRows = (enrollmentRowsRaw ?? []) as EnrollmentRow[]
  const profileIds = Array.from(
    new Set(
      enrollmentRows
        .map(row => row.profile_id)
        .filter((profileId): profileId is string => typeof profileId === 'string' && Boolean(profileId))
    )
  )

  const profileRows: ProfileRidingRow[] = []
  for (const profileChunk of chunk(profileIds, PROFILE_IN_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('profile')
      .select('id, role, federal_electoral_district_name')
      .in('id', profileChunk)

    if (error) {
      console.error('[federal-electoral-district] failed loading profile ridings for enrolled profiles', {
        chunkSize: profileChunk.length,
        error: error.message,
      })
      throw new Response(error.message, { status: 500 })
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
  const familyEdgeKeys = new Set<string>()

  for (const profileChunk of chunk(profileIds, FAMILY_EDGE_IN_BATCH_SIZE)) {
    const [{ data: guardianEdges, error: guardianEdgesError }, { data: childEdges, error: childEdgesError }] =
      await Promise.all([
        supabase
          .from('person_guardian_child')
          .select('guardian_profile_id, child_profile_id, primary_child')
          .in('guardian_profile_id', profileChunk),
        supabase
          .from('person_guardian_child')
          .select('guardian_profile_id, child_profile_id, primary_child')
          .in('child_profile_id', profileChunk),
      ])

    if (guardianEdgesError) {
      console.error('[federal-electoral-district] failed loading guardian edges', {
        chunkSize: profileChunk.length,
        error: guardianEdgesError.message,
      })
      throw new Response(guardianEdgesError.message, { status: 500 })
    }
    if (childEdgesError) {
      console.error('[federal-electoral-district] failed loading child edges', {
        chunkSize: profileChunk.length,
        error: childEdgesError.message,
      })
      throw new Response(childEdgesError.message, { status: 500 })
    }

    for (const edge of [...(guardianEdges ?? []), ...(childEdges ?? [])] as FamilyEdgeRow[]) {
      const edgeKey = `${edge.guardian_profile_id}:${edge.child_profile_id}`
      if (familyEdgeKeys.has(edgeKey)) continue
      familyEdgeKeys.add(edgeKey)
      pushFamilyLink(childrenByGuardian, edge.guardian_profile_id, edge.child_profile_id, edge.primary_child)
      pushFamilyLink(guardiansByChild, edge.child_profile_id, edge.guardian_profile_id, edge.primary_child)
    }
  }

  const relatedProfileIds = Array.from(
    new Set(
      Array.from(familyEdgeKeys).flatMap(edgeKey => edgeKey.split(':')).filter(profileId => !profileById.has(profileId))
    )
  )

  for (const relatedChunk of chunk(relatedProfileIds, RELATED_PROFILE_IN_BATCH_SIZE)) {
    const { data: relatedProfiles, error: relatedProfilesError } = await supabase
      .from('profile')
      .select('id, federal_electoral_district_name')
      .in('id', relatedChunk)

    if (relatedProfilesError) {
      console.error('[federal-electoral-district] failed loading related profile ridings', {
        chunkSize: relatedChunk.length,
        error: relatedProfilesError.message,
      })
      throw new Response(relatedProfilesError.message, { status: 500 })
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

  for (const enrollment of enrollmentRows) {
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

    const bucket = statusBucketFor(enrollment.status)
    if (!bucket) continue

    byRiding[requestedRiding].total += 1
    byRiding[requestedRiding][bucket] += 1
  }

  const columns = base.columns.includes('accepted')
    ? base.columns
    : ['code', 'name', 'total', 'accepted', 'pending', 'waitlisted', 'declined', ...base.columns.filter(column => !['code', 'name'].includes(column))]

  const rows = baseRows.map(row => {
    const ridingName = typeof row.name === 'string' ? row.name.trim() : ''
    const counts = ridingName ? byRiding[ridingName] ?? emptyCounts() : emptyCounts()
    return {
    ...row,
    total: counts.total,
    accepted: counts.accepted,
    pending: counts.pending,
    waitlisted: counts.waitlisted,
    declined: counts.declined,
  }
  })

  return {
    ...base,
    columns,
    rows,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      total: { label: 'total', numeric: true },
      accepted: { label: 'accepted', numeric: true },
      pending: { label: 'pending', numeric: true },
      waitlisted: { label: 'waitlisted', numeric: true },
      declined: { label: 'declined', numeric: true },
    },
  }
}

export const action = createTableAction('federal-electoral-district')

export default function FederalElectoralDistrictTablePage() {
  return <TableDisplay />
}
