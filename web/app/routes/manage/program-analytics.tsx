import { adminClient } from '@/lib/supabase/adminClient'

import TableDisplay from './table-display'

import type { Route } from './+types/program-analytics'

type ProgramKey = 'sobeys' | 'pc' | 'meal_kit'

const PROGRAM_ROWS: Array<{ key: ProgramKey; label: string }> = [
  { key: 'sobeys', label: 'Sobeys' },
  { key: 'pc', label: 'PC' },
  { key: 'meal_kit', label: 'Meal Kit' },
]

const normalizePartnerProgram = (value: unknown) =>
  typeof value === 'string' ? value.trim().toLowerCase() : ''

const partnerProgramCategory = (value: unknown): ProgramKey | null => {
  const normalized = normalizePartnerProgram(value)
  if (!normalized) return null
  if (normalized.includes('sobeys')) return 'sobeys'
  if (normalized.includes('pc') || normalized.includes('president') || normalized.includes('loblaw')) return 'pc'
  return null
}

type EnrollmentStatus = 'pending' | 'waitlisted' | 'approved' | 'rejected' | 'revoked'

const ENROLLMENT_STATUSES: EnrollmentStatus[] = ['pending', 'waitlisted', 'approved', 'rejected', 'revoked']

type ProgramStatusSets = {
  enrolled: Set<string>
  pending: Set<string>
  waitlisted: Set<string>
  approved: Set<string>
  rejected: Set<string>
  revoked: Set<string>
}

const createProgramStatusSets = (): ProgramStatusSets => ({
  enrolled: new Set<string>(),
  pending: new Set<string>(),
  waitlisted: new Set<string>(),
  approved: new Set<string>(),
  rejected: new Set<string>(),
  revoked: new Set<string>(),
})

export async function loader(_: Route.LoaderArgs) {
  const [{ data: profiles }, { data: enrollments }, { data: districts }] = await Promise.all([
    adminClient.from('profile').select('id, partner_program, federal_electoral_district_name'),
    adminClient.from('workshop_enrollment').select('profile_id, status').not('profile_id', 'is', null),
    adminClient.from('federal_electoral_district').select('name, meal_kit').eq('meal_kit', true),
  ])

  const mealKitRidingNames = new Set(
    (districts ?? [])
      .map(row => (typeof row.name === 'string' ? row.name.trim() : ''))
      .filter(Boolean)
  )

  const programKeysByProfileId = new Map<string, Set<ProgramKey>>()
  for (const profile of profiles ?? []) {
    const profileId = typeof profile.id === 'string' ? profile.id : ''
    if (!profileId) continue

    const programKeys = new Set<ProgramKey>()
    const partnerCategory = partnerProgramCategory(profile.partner_program)
    if (partnerCategory) {
      programKeys.add(partnerCategory)
    }

    const ridingName =
      typeof profile.federal_electoral_district_name === 'string'
        ? profile.federal_electoral_district_name.trim()
        : ''
    if (ridingName && mealKitRidingNames.has(ridingName)) {
      programKeys.add('meal_kit')
    }

    if (programKeys.size) {
      programKeysByProfileId.set(profileId, programKeys)
    }
  }

  const countsByProgram = new Map<ProgramKey, ProgramStatusSets>(
    PROGRAM_ROWS.map(({ key }) => [key, createProgramStatusSets()])
  )

  for (const enrollment of enrollments ?? []) {
    const profileId = typeof enrollment.profile_id === 'string' ? enrollment.profile_id : ''
    if (!profileId) continue

    const status = typeof enrollment.status === 'string' ? enrollment.status : ''
    if (!ENROLLMENT_STATUSES.includes(status as EnrollmentStatus)) continue

    const programKeys = programKeysByProfileId.get(profileId)
    if (!programKeys?.size) continue

    for (const programKey of programKeys) {
      const programCounts = countsByProgram.get(programKey)
      if (!programCounts) continue

      programCounts.enrolled.add(profileId)
      programCounts[status as EnrollmentStatus].add(profileId)
    }
  }

  const rows = PROGRAM_ROWS.map(({ key, label }) => {
    const counts = countsByProgram.get(key) ?? createProgramStatusSets()
    return {
      program: label,
      enrolled: counts.enrolled.size,
      accepted: counts.approved.size,
      pending: counts.pending.size,
      waitlisted: counts.waitlisted.size,
      rejected: counts.rejected.size,
      revoked: counts.revoked.size,
    }
  })

  return {
    label: 'Program Enrollment Analytics',
    tableName: 'program-analytics',
    columns: ['program', 'enrolled', 'accepted', 'pending', 'waitlisted', 'rejected', 'revoked'],
    rows,
    columnMeta: {
      program: { label: 'Program', filterable: false },
      enrolled: { label: 'Enrolled', numeric: true, filterable: false },
      accepted: { label: 'Accepted', numeric: true, filterable: false },
      pending: { label: 'Pending', numeric: true, filterable: false },
      waitlisted: { label: 'Waitlisted', numeric: true, filterable: false },
      rejected: { label: 'Rejected', numeric: true, filterable: false },
      revoked: { label: 'Revoked', numeric: true, filterable: false },
    },
  }
}

export default function ProgramAnalyticsPage() {
  return <TableDisplay />
}
