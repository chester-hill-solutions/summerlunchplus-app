import { loader as federalElectoralDistrictEnrichmentLoader } from '@/routes/manage/federal-electoral-district.enrichment'
import { loader as federalElectoralDistrictLoader } from '@/routes/manage/federal-electoral-district'

import { parseFiltersFromSearchParams } from './table-filtering.server'
import { EXPORT_MAX_ROWS } from './types'

const EXPORT_PAGE_SIZE = 1500
const EXPORT_COLUMNS = [
  'code',
  'name',
  'whitelist',
  'meal_kit',
  'total',
  'accepted',
  'pending',
  'waitlisted',
  'declined',
  'giftcard_pc',
  'giftcard_sobeys',
  'giftcard_meal_kit',
  'household_count',
  'household_child_count',
]

type DistrictCounts = {
  total: number
  accepted: number
  pending: number
  waitlisted: number
  declined: number
  giftcard_pc: number
  giftcard_sobeys: number
  giftcard_meal_kit: number
  household_count: number
  household_child_count: number
}

const buildPagedRequest = ({ request, page }: { request: Request; page: number }) => {
  const url = new URL(request.url)
  url.searchParams.set('page', String(page))
  url.searchParams.set('pageSize', String(EXPORT_PAGE_SIZE))
  return new Request(url.toString(), request)
}

const loadCountsByRiding = async ({
  request,
  ridingNames,
}: {
  request: Request
  ridingNames: string[]
}) => {
  if (!ridingNames.length) {
    return {} as Record<string, DistrictCounts>
  }

  const url = new URL('/manage/federal-electoral-district/enrichment', request.url)
  for (const ridingName of ridingNames) {
    url.searchParams.append('riding', ridingName)
  }

  const enrichmentRequest = new Request(url.toString(), {
    method: 'GET',
    headers: request.headers,
  })
  const enrichmentResponse = await federalElectoralDistrictEnrichmentLoader({
    request: enrichmentRequest,
  } as Parameters<typeof federalElectoralDistrictEnrichmentLoader>[0])

  if (!(enrichmentResponse instanceof Response) || !enrichmentResponse.ok) {
    return {} as Record<string, DistrictCounts>
  }

  const payload = (await enrichmentResponse.json()) as {
    byRiding?: Record<string, DistrictCounts>
  }
  return payload.byRiding ?? {}
}

export const buildFederalElectoralDistrictSnapshot = async ({ request }: { request: Request }) => {
  const rows: Array<Record<string, unknown>> = []
  let totalRows = 0

  for (let page = 1; ; page += 1) {
    const pageRequest = buildPagedRequest({ request, page })
    const pageData = await federalElectoralDistrictLoader({
      request: pageRequest,
    } as Parameters<typeof federalElectoralDistrictLoader>[0])
    const pageRows = Array.isArray(pageData.rows) ? pageData.rows : []

    if (page === 1) {
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

  const ridingNames = Array.from(
    new Set(
      rows
        .map(row => (typeof row.name === 'string' ? row.name.trim() : ''))
        .filter(Boolean)
    )
  )
  const countsByRiding = await loadCountsByRiding({ request, ridingNames })

  const exportRows = rows.map(row => {
    const name = typeof row.name === 'string' ? row.name : ''
    const counts = countsByRiding[name] ?? {
      total: 0,
      accepted: 0,
      pending: 0,
      waitlisted: 0,
      declined: 0,
      giftcard_pc: 0,
      giftcard_sobeys: 0,
      giftcard_meal_kit: 0,
      household_count: 0,
      household_child_count: 0,
    }
    return {
      code: row.code,
      name,
      whitelist: row.whitelist,
      meal_kit: row.meal_kit,
      total: counts.total,
      accepted: counts.accepted,
      pending: counts.pending,
      waitlisted: counts.waitlisted,
      declined: counts.declined,
      giftcard_pc: counts.giftcard_pc,
      giftcard_sobeys: counts.giftcard_sobeys,
      giftcard_meal_kit: counts.giftcard_meal_kit,
      household_count: counts.household_count,
      household_child_count: counts.household_child_count,
    }
  })

  const url = new URL(request.url)
  const sortColumn = url.searchParams.get('sort')
  const sortDirRaw = url.searchParams.get('dir')
  const sortDir = sortDirRaw === 'asc' || sortDirRaw === 'desc' ? sortDirRaw : null

  return {
    columns: EXPORT_COLUMNS,
    rows: exportRows,
    filters: parseFiltersFromSearchParams(url.searchParams, EXPORT_COLUMNS),
    sort: {
      column: sortColumn,
      dir: sortDir,
    },
    queryParams: Object.fromEntries(url.searchParams.entries()),
  }
}
