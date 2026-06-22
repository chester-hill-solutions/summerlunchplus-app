import { loadWorkshopEnrollmentData } from '@/routes/manage/workshop-enrollment'

import { applyFiltersAndSort, getCellValue, parseFiltersFromSearchParams } from './table-filtering.server'
import { EXPORT_MAX_ROWS } from './types'

export const buildWorkshopEnrollmentSnapshot = async ({
  request,
}: {
  request: Request
}) => {
  const tableData = await loadWorkshopEnrollmentData(request)
  const columns = (tableData.columns ?? []) as string[]
  const baseRows = (tableData.rows ?? []) as Array<Record<string, unknown>>
  const url = new URL(request.url)
  const sortColumn = url.searchParams.get('sort')
  const sortDirRaw = url.searchParams.get('dir')
  const sortDir = sortDirRaw === 'asc' || sortDirRaw === 'desc' ? sortDirRaw : null
  const filters = parseFiltersFromSearchParams(url.searchParams, columns)

  const filteredRows = applyFiltersAndSort({
    rows: baseRows,
    columns,
    filters,
    sortColumn,
    sortDir,
    tableName: 'class-enrollment',
  })

  if (filteredRows.length > EXPORT_MAX_ROWS) {
    throw new Error(`Export limit exceeded (${filteredRows.length} rows > ${EXPORT_MAX_ROWS}).`)
  }

  const snapshotRows = filteredRows.map(row => {
    return columns.reduce<Record<string, unknown>>((acc, column) => {
      acc[column] = getCellValue(column, row, 'class-enrollment')
      return acc
    }, {})
  })

  return {
    columns,
    rows: snapshotRows,
    filters,
    sort: {
      column: sortColumn,
      dir: sortDir,
    },
    queryParams: Object.fromEntries(url.searchParams.entries()),
  }
}
