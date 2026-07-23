import { loader as formAnswersLoader } from '@/routes/manage/form.$id.answers'

import { applyFiltersAndSort, parseFiltersFromSearchParams } from './table-filtering.server'
import { EXPORT_MAX_ROWS } from './types'

export const buildFormIdAnswersSnapshot = async ({ request }: { request: Request }) => {
  const url = new URL(request.url)
  const match = /^\/manage\/form\/([^/]+)\/answers$/.exec(url.pathname)
  const formID = match?.[1]
  if (!formID) {
    throw new Error('Invalid form answers export path.')
  }

  const tableData = await formAnswersLoader({
    request,
    params: { formID },
  } as unknown as Parameters<typeof formAnswersLoader>[0])
  const columns = Array.isArray(tableData.columns) ? tableData.columns : []
  const baseRows = Array.isArray(tableData.rows) ? tableData.rows : []
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
    tableName: 'form-answers',
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
