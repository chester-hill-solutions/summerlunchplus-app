import { loader as classAttendanceLoader } from '@/routes/manage/class-attendance'

import { applyFiltersAndSort, parseFiltersFromSearchParams } from './table-filtering.server'
import { EXPORT_MAX_ROWS } from './types'

export const buildClassAttendanceSnapshot = async ({ request }: { request: Request }) => {
  const tableData = await classAttendanceLoader({ request } as Parameters<typeof classAttendanceLoader>[0])
  const columns = Array.isArray(tableData.columns) ? tableData.columns : []
  const baseRows = Array.isArray(tableData.rows) ? tableData.rows : []
  const url = new URL(request.url)
  const sortColumn = url.searchParams.get('sort')
  const sortDirRaw = url.searchParams.get('dir')
  const sortDir = sortDirRaw === 'asc' || sortDirRaw === 'desc' ? sortDirRaw : null
  const filters = parseFiltersFromSearchParams(url.searchParams, columns)

  const rows = applyFiltersAndSort({
    rows: baseRows,
    columns,
    filters,
    sortColumn,
    sortDir,
    tableName: 'class-attendance',
  })

  if (rows.length > EXPORT_MAX_ROWS) {
    throw new Error(`Export limit exceeded (${rows.length} rows > ${EXPORT_MAX_ROWS}).`)
  }

  return {
    columns,
    rows,
    filters,
    sort: {
      column: sortColumn,
      dir: sortDir,
    },
    queryParams: Object.fromEntries(url.searchParams.entries()),
  }
}
