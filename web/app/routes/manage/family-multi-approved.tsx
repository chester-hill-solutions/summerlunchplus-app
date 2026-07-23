import { useLoaderData } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'

import type { Route } from './+types/family-multi-approved'

const IN_CLAUSE_BATCH_SIZE = 10
const RELATIONSHIP_BATCH_SIZE = 10

type FamilyEdgeRow = {
  guardian_profile_id: string
  child_profile_id: string
}

type EnrollmentRow = {
  profile_id: string | null
}

type ProfileRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
  role: string | null
}

type FamilyWindowRow = {
  familyId: string
  approvedProfileCount: number
  approvedEnrollmentCount: number
  profiles: Array<{
    id: string
    display: string
    role: string
  }>
}

type FamilyWindowSummary = {
  days: 7 | 14
  approvedProfileTotal: number
  familiesWithApproved: number
  familiesWithMultipleApproved: number
  rows: FamilyWindowRow[]
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0 || !items.length) return []
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const unique = <T,>(items: T[]) => Array.from(new Set(items))

const profileDisplay = (profile: ProfileRow | null, fallbackId: string) => {
  const first = (profile?.firstname ?? '').trim()
  const last = (profile?.surname ?? '').trim()
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  if (profile?.email?.trim()) return profile.email.trim()
  return `Profile ${fallbackId.slice(0, 8)}`
}

const loadWindowWorkshopIds = async (days: 7 | 14) => {
  const now = new Date()
  const horizon = new Date(now)
  horizon.setUTCDate(horizon.getUTCDate() + days)

  const { data, error } = await adminClient
    .from('class')
    .select('workshop_id')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', horizon.toISOString())

  if (error) {
    throw new Error(`Failed to load classes for ${days} day window: ${error.message}`)
  }

  return unique((data ?? []).map(row => row.workshop_id).filter((id): id is string => Boolean(id)))
}

const loadApprovedEnrollmentsByProfile = async (workshopIds: string[]) => {
  const enrollmentCountByProfileId = new Map<string, number>()
  if (!workshopIds.length) return enrollmentCountByProfileId

  for (const chunk of chunkArray(workshopIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('workshop_enrollment')
      .select('profile_id')
      .in('workshop_id', chunk)
      .eq('status', 'approved')

    if (error) {
      throw new Error(`Failed to load approved enrollments: ${error.message}`)
    }

    for (const row of (data ?? []) as EnrollmentRow[]) {
      if (!row.profile_id) continue
      enrollmentCountByProfileId.set(row.profile_id, (enrollmentCountByProfileId.get(row.profile_id) ?? 0) + 1)
    }
  }

  return enrollmentCountByProfileId
}

const loadFamilyIdByProfileId = async (profileIds: string[]) => {
  const normalized = unique(profileIds.filter(Boolean))
  const familyIdByProfileId = new Map<string, string>()
  if (!normalized.length) return familyIdByProfileId

  const seen = new Set<string>(normalized)
  const queue = [...normalized]
  const edgeByKey = new Map<string, FamilyEdgeRow>()

  while (queue.length) {
    const batch = queue.splice(0, Math.min(queue.length, RELATIONSHIP_BATCH_SIZE))
    if (!batch.length) continue

    const [guardianRowsResult, childRowsResult] = await Promise.all([
      adminClient
        .from('person_guardian_child')
        .select('guardian_profile_id, child_profile_id')
        .in('guardian_profile_id', batch),
      adminClient
        .from('person_guardian_child')
        .select('guardian_profile_id, child_profile_id')
        .in('child_profile_id', batch),
    ])

    if (guardianRowsResult.error) {
      throw new Error(`Failed to load family edges by guardian: ${guardianRowsResult.error.message}`)
    }
    if (childRowsResult.error) {
      throw new Error(`Failed to load family edges by child: ${childRowsResult.error.message}`)
    }

    for (const edge of ([...(guardianRowsResult.data ?? []), ...(childRowsResult.data ?? [])] as FamilyEdgeRow[])) {
      const edgeKey = `${edge.guardian_profile_id}::${edge.child_profile_id}`
      if (edgeByKey.has(edgeKey)) continue
      edgeByKey.set(edgeKey, edge)

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

  const adjacency = new Map<string, Set<string>>()
  for (const id of seen) adjacency.set(id, new Set())
  for (const edge of edgeByKey.values()) {
    adjacency.get(edge.guardian_profile_id)?.add(edge.child_profile_id)
    adjacency.get(edge.child_profile_id)?.add(edge.guardian_profile_id)
  }

  const visited = new Set<string>()
  for (const id of seen) {
    if (visited.has(id)) continue

    const component: string[] = []
    const bfs = [id]
    visited.add(id)

    while (bfs.length) {
      const current = bfs.shift() as string
      component.push(current)
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor)
          bfs.push(neighbor)
        }
      }
    }

    component.sort((left, right) => left.localeCompare(right))
    const familyId = component[0]
    for (const memberId of component) {
      familyIdByProfileId.set(memberId, familyId)
    }
  }

  for (const profileId of normalized) {
    if (!familyIdByProfileId.has(profileId)) familyIdByProfileId.set(profileId, profileId)
  }

  return familyIdByProfileId
}

const loadProfilesById = async (profileIds: string[]) => {
  const byId = new Map<string, ProfileRow>()
  for (const chunk of chunkArray(unique(profileIds), IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, firstname, surname, email, role')
      .in('id', chunk)

    if (error) {
      throw new Error(`Failed to load profile details: ${error.message}`)
    }

    for (const row of (data ?? []) as ProfileRow[]) {
      byId.set(row.id, row)
    }
  }
  return byId
}

const buildWindowSummary = async (days: 7 | 14): Promise<FamilyWindowSummary> => {
  const workshopIds = await loadWindowWorkshopIds(days)
  const enrollmentCountByProfileId = await loadApprovedEnrollmentsByProfile(workshopIds)
  const approvedProfileIds = Array.from(enrollmentCountByProfileId.keys())

  if (!approvedProfileIds.length) {
    return {
      days,
      approvedProfileTotal: 0,
      familiesWithApproved: 0,
      familiesWithMultipleApproved: 0,
      rows: [],
    }
  }

  const familyIdByProfileId = await loadFamilyIdByProfileId(approvedProfileIds)
  const profileById = await loadProfilesById(approvedProfileIds)

  const familyProfileIds = new Map<string, Set<string>>()
  const familyEnrollmentCounts = new Map<string, number>()

  for (const profileId of approvedProfileIds) {
    const familyId = familyIdByProfileId.get(profileId) ?? profileId
    const profileSet = familyProfileIds.get(familyId) ?? new Set<string>()
    profileSet.add(profileId)
    familyProfileIds.set(familyId, profileSet)
    familyEnrollmentCounts.set(familyId, (familyEnrollmentCounts.get(familyId) ?? 0) + (enrollmentCountByProfileId.get(profileId) ?? 0))
  }

  const rows: FamilyWindowRow[] = []
  for (const [familyId, profileIdSet] of familyProfileIds.entries()) {
    const approvedProfileCount = profileIdSet.size
    const approvedEnrollmentCount = familyEnrollmentCounts.get(familyId) ?? 0
    if (approvedProfileCount <= 1 && approvedEnrollmentCount <= 1) continue

    const profiles = Array.from(profileIdSet)
      .sort((left, right) => left.localeCompare(right))
      .map(profileId => {
        const profile = profileById.get(profileId) ?? null
        return {
          id: profileId,
          display: profileDisplay(profile, profileId),
          role: profile?.role ?? 'unknown',
        }
      })

    rows.push({
      familyId,
      approvedProfileCount,
      approvedEnrollmentCount,
      profiles,
    })
  }

  rows.sort((left, right) => {
    if (right.approvedProfileCount !== left.approvedProfileCount) return right.approvedProfileCount - left.approvedProfileCount
    if (right.approvedEnrollmentCount !== left.approvedEnrollmentCount) return right.approvedEnrollmentCount - left.approvedEnrollmentCount
    return left.familyId.localeCompare(right.familyId)
  })

  return {
    days,
    approvedProfileTotal: approvedProfileIds.length,
    familiesWithApproved: familyProfileIds.size,
    familiesWithMultipleApproved: rows.length,
    rows,
  }
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    throw new Response('Forbidden', { status: 403, headers: auth.headers })
  }

  const [window7, window14] = await Promise.all([buildWindowSummary(7), buildWindowSummary(14)])
  return {
    generatedAt: new Date().toISOString(),
    windows: [window7, window14],
  }
}

export default function FamilyMultiApprovedPage() {
  const data = useLoaderData<typeof loader>()

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Families with multiple approved enrollments</h1>
        <p className="text-sm text-muted-foreground">Find families where more than one profile is approved (or the same profile has multiple approved enrollments) in upcoming class windows.</p>
        <p className="text-xs text-muted-foreground">Generated: {new Date(data.generatedAt).toLocaleString()}</p>
      </header>

      {data.windows.map(window => (
        <section key={window.days} className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <h2 className="text-lg font-semibold">Next {window.days} days</h2>
            <span className="rounded border px-2 py-1">approved profiles: {window.approvedProfileTotal}</span>
            <span className="rounded border px-2 py-1">families with approved: {window.familiesWithApproved}</span>
            <span className="rounded border px-2 py-1">families matching filter: {window.familiesWithMultipleApproved}</span>
          </div>

          {!window.rows.length ? (
            <p className="text-sm text-muted-foreground">No families in this window have multiple approved profiles/enrollments.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-2 py-2">Family ID</th>
                    <th className="px-2 py-2">Approved profiles</th>
                    <th className="px-2 py-2">Approved enrollments</th>
                    <th className="px-2 py-2">Profiles</th>
                  </tr>
                </thead>
                <tbody>
                  {window.rows.map(row => (
                    <tr key={`${window.days}-${row.familyId}`} className="border-b align-top">
                      <td className="px-2 py-2 font-mono text-xs">{row.familyId}</td>
                      <td className="px-2 py-2">{row.approvedProfileCount}</td>
                      <td className="px-2 py-2">{row.approvedEnrollmentCount}</td>
                      <td className="px-2 py-2">
                        <div className="space-y-1">
                          {row.profiles.map(profile => (
                            <div key={profile.id}>
                              <span className="font-medium">{profile.display}</span>{' '}
                              <span className="text-muted-foreground">({profile.role})</span>{' '}
                              <span className="font-mono text-xs text-muted-foreground">{profile.id.slice(0, 8)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </div>
  )
}
