import { loader as emailMessageLoader } from '@/routes/manage/email-message'

import { parseFiltersFromSearchParams } from './table-filtering.server'
import { EXPORT_MAX_ROWS } from './types'

const EXPORT_PAGE_SIZE = 1500

const buildPagedRequest = ({ request, page }: { request: Request; page: number }) => {
  const url = new URL(request.url)
  url.searchParams.set('page', String(page))
  url.searchParams.set('pageSize', String(EXPORT_PAGE_SIZE))
  return new Request(url.toString(), request)
}

export const buildEmailMessageSnapshot = async ({ request }: { request: Request }) => {
  const rows: Array<Record<string, unknown>> = []
  let columns: string[] = []
  let totalRows = 0

  for (let page = 1; ; page += 1) {
    const pageRequest = buildPagedRequest({ request, page })
    const pageData = await emailMessageLoader({ request: pageRequest } as Parameters<typeof emailMessageLoader>[0])
    const pageColumns = Array.isArray(pageData.columns) ? pageData.columns : []
    const pageRows = Array.isArray(pageData.rows) ? pageData.rows : []

    if (!columns.length) {
      columns = pageColumns
      totalRows = typeof pageData.totalRows === 'number' ? pageData.totalRows : pageRows.length
    }

    rows.push(...pageRows)
    if (rows.length > EXPORT_MAX_ROWS) {
      throw new Error(`Export limit exceeded (${rows.length} rows > ${EXPORT_MAX_ROWS}).`)
    }

    if (!pageRows.length || rows.length >= totalRows) {
      break
    }
  }

  const url = new URL(request.url)
  const sortColumn = url.searchParams.get('sort')
  const sortDirRaw = url.searchParams.get('dir')
  const sortDir = sortDirRaw === 'asc' || sortDirRaw === 'desc' ? sortDirRaw : null

  return {
    columns,
    rows,
    filters: parseFiltersFromSearchParams(url.searchParams, columns),
    sort: {
      column: sortColumn,
      dir: sortDir,
    },
    queryParams: Object.fromEntries(url.searchParams.entries()),
  }
}
