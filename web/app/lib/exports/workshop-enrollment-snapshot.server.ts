import { loadWorkshopEnrollmentData } from '@/lib/exports/workshop-enrollment-query.server'
import { loadWorkshopEnrollmentEnrichment } from '@/routes/manage/workshop-enrollment-enrichment.server'

import { applyFiltersAndSort, parseFiltersFromSearchParams } from './table-filtering.server'
import { EXPORT_MAX_ROWS } from './types'

const PROFILE_SPLIT_COLUMNS = [
  'student_firstname',
  'student_lastname',
  'student_email',
  'guardian_firstname',
  'guardian_lastname',
  'guardian_email',
] as const

const GENERATED_WORKSHOP_COLUMNS = new Set([
  'riding_display',
  'geo_locations_display',
  'giftcard_display',
  'prior_participation_display',
])

const normalizeText = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

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

export const buildWorkshopEnrollmentSnapshot = async ({
  request,
}: {
  request: Request
}) => {
  const tableData = await loadWorkshopEnrollmentData(request)
  const baseColumns = (tableData.columns ?? []) as string[]
  const baseRows = (tableData.rows ?? []) as Array<Record<string, unknown>>
  const url = new URL(request.url)
  const sortColumn = url.searchParams.get('sort')
  const sortDirRaw = url.searchParams.get('dir')
  const sortDir = sortDirRaw === 'asc' || sortDirRaw === 'desc' ? sortDirRaw : null
  const filters = parseFiltersFromSearchParams(url.searchParams, baseColumns)

  const filterColumns = Object.keys(filters)
  const needsGeneratedValues =
    (sortColumn !== null && GENERATED_WORKSHOP_COLUMNS.has(sortColumn)) ||
    filterColumns.some(column => GENERATED_WORKSHOP_COLUMNS.has(column))

  const rowsForFiltering = needsGeneratedValues
    ? await (async () => {
        const enrichmentProfileIds = Array.from(
          new Set(baseRows.map(row => normalizeText(row.profile_id)).filter(Boolean))
        )
        const enrichmentByProfileId = enrichmentProfileIds.length
          ? await loadWorkshopEnrollmentEnrichment(enrichmentProfileIds)
          : {}

        return baseRows.map(row => {
          const profileId = normalizeText(row.profile_id)
          const enrichment = profileId
            ? (enrichmentByProfileId[profileId] ?? fallbackWorkshopEnrollmentEnrichment)
            : fallbackWorkshopEnrollmentEnrichment
          return {
            ...row,
            ...enrichment,
          }
        })
      })()
    : baseRows

  const filteredRows = applyFiltersAndSort({
    rows: rowsForFiltering,
    columns: baseColumns,
    filters,
    sortColumn,
    sortDir,
    tableName: 'class-enrollment',
  })

  if (filteredRows.length > EXPORT_MAX_ROWS) {
    throw new Error(`Export limit exceeded (${filteredRows.length} rows > ${EXPORT_MAX_ROWS}).`)
  }

  const exportColumns = baseColumns.flatMap(column =>
    column === 'profile_display' ? [...PROFILE_SPLIT_COLUMNS] : [column]
  )

  const snapshotRows = filteredRows.map(row => ({ ...row }))

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
