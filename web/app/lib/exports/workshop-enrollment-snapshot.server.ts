import { loadWorkshopEnrollmentData } from '@/lib/exports/workshop-enrollment-query.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { loadWorkshopEnrollmentEnrichment } from '@/routes/manage/workshop-enrollment-enrichment.server'

import { applyFiltersAndSort, getCellValue, parseFiltersFromSearchParams } from './table-filtering.server'
import { EXPORT_MAX_ROWS } from './types'

const PROFILE_SPLIT_COLUMNS = [
  'student_firstname',
  'student_lastname',
  'student_email',
  'guardian_firstname',
  'guardian_lastname',
  'guardian_email',
] as const

type ProfileRow = {
  id: string
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
}

type GuardianChildEdge = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (!items.length || size <= 0) return []
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const pickPreferred = (items: Array<{ profileId: string; primary: boolean }>) => {
  if (!items.length) return null
  const sorted = [...items].sort((left, right) => {
    const primaryDiff = Number(right.primary) - Number(left.primary)
    if (primaryDiff !== 0) return primaryDiff
    return left.profileId.localeCompare(right.profileId)
  })
  return sorted[0]?.profileId ?? null
}

const fallbackWorkshopEnrollmentEnrichment = {
  riding_display: '',
  geo_locations_display: 'N/A',
  giftcard_display: 'N/A',
  prior_participation_display: 'N/A',
  profile_hover_top_discrepancy: '',
  profile_hover_more_discrepancies: '',
  profile_hover_name: 'N/A',
  profile_hover_email: 'N/A',
  profile_hover_parent_email: 'N/A',
  profile_hover_latest_ip: 'N/A',
  profile_hover_latest_ip_geo: 'N/A',
}

const buildProfileSplitData = async ({
  rows,
}: {
  rows: Array<Record<string, unknown>>
}) => {
  const enrollmentProfileIds = Array.from(
    new Set(rows.map(row => normalizeText(row.profile_id)).filter(Boolean))
  )

  const splitByProfileId = new Map<string, Record<string, string>>()
  if (!enrollmentProfileIds.length) {
    return splitByProfileId
  }

  const edgeRows: GuardianChildEdge[] = []
  for (const chunk of chunkArray(enrollmentProfileIds, 250)) {
    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${chunk.join(',')}),child_profile_id.in.(${chunk.join(',')})`)

    if (error) {
      throw new Error(`Unable to load guardian relationships: ${error.message}`)
    }
    edgeRows.push(...((data ?? []) as GuardianChildEdge[]))
  }

  const allRelatedIds = new Set<string>(enrollmentProfileIds)
  const guardiansByChild = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const childrenByGuardian = new Map<string, Array<{ profileId: string; primary: boolean }>>()

  for (const edge of edgeRows) {
    allRelatedIds.add(edge.guardian_profile_id)
    allRelatedIds.add(edge.child_profile_id)

    const guardians = guardiansByChild.get(edge.child_profile_id) ?? []
    guardians.push({ profileId: edge.guardian_profile_id, primary: edge.primary_child })
    guardiansByChild.set(edge.child_profile_id, guardians)

    const children = childrenByGuardian.get(edge.guardian_profile_id) ?? []
    children.push({ profileId: edge.child_profile_id, primary: edge.primary_child })
    childrenByGuardian.set(edge.guardian_profile_id, children)
  }

  const profileRows: ProfileRow[] = []
  for (const chunk of chunkArray(Array.from(allRelatedIds), 250)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, role, firstname, surname, email')
      .in('id', chunk)

    if (error) {
      throw new Error(`Unable to load export profile details: ${error.message}`)
    }
    profileRows.push(...((data ?? []) as ProfileRow[]))
  }

  const profileById = new Map(profileRows.map(profile => [profile.id, profile]))

  for (const enrollmentProfileId of enrollmentProfileIds) {
    const enrollmentProfile = profileById.get(enrollmentProfileId)
    const enrollmentRole = normalizeText(enrollmentProfile?.role).toLowerCase()

    let studentProfileId: string | null = null
    let guardianProfileId: string | null = null

    if (enrollmentRole === 'student') {
      studentProfileId = enrollmentProfileId
      guardianProfileId = pickPreferred(guardiansByChild.get(enrollmentProfileId) ?? [])
    } else if (enrollmentRole === 'guardian') {
      guardianProfileId = enrollmentProfileId
      studentProfileId = pickPreferred(childrenByGuardian.get(enrollmentProfileId) ?? [])
    } else {
      studentProfileId =
        pickPreferred(childrenByGuardian.get(enrollmentProfileId) ?? []) ??
        (enrollmentProfile ? enrollmentProfileId : null)
      guardianProfileId =
        (studentProfileId ? pickPreferred(guardiansByChild.get(studentProfileId) ?? []) : null) ??
        pickPreferred(guardiansByChild.get(enrollmentProfileId) ?? [])
    }

    const studentProfile = studentProfileId ? profileById.get(studentProfileId) : null
    const guardianProfile = guardianProfileId ? profileById.get(guardianProfileId) : null

    splitByProfileId.set(enrollmentProfileId, {
      student_firstname: normalizeText(studentProfile?.firstname),
      student_lastname: normalizeText(studentProfile?.surname),
      student_email: normalizeText(studentProfile?.email),
      guardian_firstname: normalizeText(guardianProfile?.firstname),
      guardian_lastname: normalizeText(guardianProfile?.surname),
      guardian_email: normalizeText(guardianProfile?.email),
    })
  }

  return splitByProfileId
}

export const buildWorkshopEnrollmentSnapshot = async ({
  request,
}: {
  request: Request
}) => {
  const tableData = await loadWorkshopEnrollmentData(request)
  const baseColumns = (tableData.columns ?? []) as string[]
  const baseRows = (tableData.rows ?? []) as Array<Record<string, unknown>>

  const enrichmentProfileIds = Array.from(
    new Set(baseRows.map(row => normalizeText(row.profile_id)).filter(Boolean))
  )
  const enrichmentByProfileId = enrichmentProfileIds.length
    ? await loadWorkshopEnrollmentEnrichment(enrichmentProfileIds)
    : {}

  const enrichedRows = baseRows.map(row => {
    const profileId = normalizeText(row.profile_id)
    const enrichment = profileId
      ? (enrichmentByProfileId[profileId] ?? fallbackWorkshopEnrollmentEnrichment)
      : fallbackWorkshopEnrollmentEnrichment
    return {
      ...row,
      ...enrichment,
    }
  })

  const profileSplitByProfileId = await buildProfileSplitData({ rows: enrichedRows })

  const exportColumns = baseColumns.flatMap(column =>
    column === 'profile_display' ? [...PROFILE_SPLIT_COLUMNS] : [column]
  )
  const url = new URL(request.url)
  const sortColumn = url.searchParams.get('sort')
  const sortDirRaw = url.searchParams.get('dir')
  const sortDir = sortDirRaw === 'asc' || sortDirRaw === 'desc' ? sortDirRaw : null
  const filters = parseFiltersFromSearchParams(url.searchParams, baseColumns)

  const filteredRows = applyFiltersAndSort({
    rows: enrichedRows,
    columns: baseColumns,
    filters,
    sortColumn,
    sortDir,
    tableName: 'class-enrollment',
  })

  if (filteredRows.length > EXPORT_MAX_ROWS) {
    throw new Error(`Export limit exceeded (${filteredRows.length} rows > ${EXPORT_MAX_ROWS}).`)
  }

  const snapshotRows = filteredRows.map(row => {
    const profileId = normalizeText(row.profile_id)
    const split = profileSplitByProfileId.get(profileId) ?? null

    return exportColumns.reduce<Record<string, unknown>>((acc, column) => {
      if (column in (split ?? {})) {
        acc[column] = split?.[column] ?? ''
        return acc
      }
      acc[column] = getCellValue(column, row, 'class-enrollment')
      return acc
    }, {})
  })

  return {
    columns: exportColumns,
    rows: snapshotRows,
    filters,
    sort: {
      column: sortColumn,
      dir: sortDir,
    },
    queryParams: Object.fromEntries(url.searchParams.entries()),
  }
}
