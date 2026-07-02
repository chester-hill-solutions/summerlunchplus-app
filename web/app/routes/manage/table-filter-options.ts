import { createClient } from '@/lib/supabase/server'
import { TABLE_DEFINITIONS } from './table-definitions'
import { createTableLoader } from './table-loader'
import { loadWorkshopEnrollmentEnrichment } from './workshop-enrollment-enrichment.server'
import type { LoaderFunctionArgs } from 'react-router'

const FETCH_BATCH_SIZE = 1000
const FILTER_EMPTY_TOKEN = '__none__'
const WORKSHOP_ENRICHMENT_COLUMNS = new Set([
  'riding_display',
  'geo_locations_display',
  'giftcard_display',
  'prior_participation_display',
])

type ParsedFilter = {
  values: string[]
  includeEmpty: boolean
}

const parseTopLevelSelectColumns = (select: string) => {
  const columns: string[] = []
  let depth = 0
  let token = ''

  const pushToken = () => {
    const trimmed = token.trim()
    token = ''
    if (!trimmed) return
    if (trimmed.includes('(')) return
    const [left] = trimmed.split(':')
    const column = left.trim()
    if (!column || column === '*') return
    columns.push(column)
  }

  for (const char of select) {
    if (char === '(') {
      depth += 1
      token += char
      continue
    }
    if (char === ')') {
      depth = Math.max(0, depth - 1)
      token += char
      continue
    }
    if (char === ',' && depth === 0) {
      pushToken()
      continue
    }
    token += char
  }
  pushToken()

  return Array.from(new Set(columns))
}

const parseFiltersFromSearch = (searchParams: URLSearchParams): Record<string, ParsedFilter> => {
  const parsed: Record<string, ParsedFilter> = {}

  for (const key of Array.from(new Set(Array.from(searchParams.keys())))) {
    if (!key.startsWith('f_')) continue
    const column = key.slice(2)
    if (!column) continue

    const values = Array.from(new Set(searchParams.getAll(key)))
    if (!values.length) continue

    const includeEmpty = values.includes(FILTER_EMPTY_TOKEN)
    const explicitValues = values.filter(value => value !== FILTER_EMPTY_TOKEN)
    parsed[column] = {
      values: explicitValues,
      includeEmpty,
    }
  }

  return parsed
}

const fromQualifiedTable = (supabase: ReturnType<typeof createClient>['supabase'], qualifiedTable: string) => {
  const [schema, table, ...rest] = qualifiedTable.split('.')
  if (schema && table && rest.length === 0) {
    return supabase.schema(schema).from(table)
  }
  return supabase.from(qualifiedTable)
}

const toOptionValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(value)
}

const filterOptionPriority = (value: string) => {
  if (value === '') return 0
  if (value === 'NULL') return 1
  if (value === '...') return 2
  return 3
}

const sortFilterOptions = (values: string[]) => {
  const deduped = Array.from(new Set(values))
  deduped.sort((left, right) => {
    const leftPriority = filterOptionPriority(left)
    const rightPriority = filterOptionPriority(right)
    if (leftPriority !== rightPriority) return leftPriority - rightPriority
    return left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' })
  })
  return deduped
}

const rowMatchesFilters = (
  row: Record<string, unknown>,
  parsedFilters: Record<string, ParsedFilter>,
  excludedColumn: string
) => {
  for (const [filterColumn, filter] of Object.entries(parsedFilters)) {
    if (filterColumn === excludedColumn) continue
    const rowValue = toOptionValue(row[filterColumn])
    if (filter.includeEmpty && filter.values.length === 0) {
      if (rowValue !== '') return false
      continue
    }
    if (filter.values.length > 0 && !filter.values.includes(rowValue)) {
      return false
    }
  }
  return true
}

const loadAllRowsViaTableLoader = async (
  request: Request,
  tableName: string
): Promise<Record<string, unknown>[]> => {
  const forcedUrl = new URL(request.url)
  forcedUrl.searchParams.delete('page')
  forcedUrl.searchParams.delete('pageSize')
  forcedUrl.searchParams.set('sort', '__full_scan__')
  forcedUrl.searchParams.delete('dir')

  const forcedRequest = new Request(forcedUrl.toString(), request)
  const loader = createTableLoader(tableName)
  const payload = await loader(
    {
      request: forcedRequest,
      context: undefined,
      params: {},
    } as LoaderFunctionArgs,
    { includeForeignKeyOptions: false }
  )

  return payload.rows as Record<string, unknown>[]
}

const maybeEnrichWorkshopEnrollmentRows = async ({
  tableName,
  rows,
  requiredColumns,
}: {
  tableName: string
  rows: Record<string, unknown>[]
  requiredColumns: Set<string>
}) => {
  if (tableName !== 'class-enrollment') return rows
  const needsEnrichment = Array.from(requiredColumns).some(column => WORKSHOP_ENRICHMENT_COLUMNS.has(column))
  if (!needsEnrichment) return rows

  const profileIds = Array.from(
    new Set(
      rows
        .map(row => (typeof row.profile_id === 'string' ? row.profile_id : ''))
        .filter(Boolean)
    )
  )
  if (!profileIds.length) return rows

  const byProfileId = await loadWorkshopEnrollmentEnrichment(profileIds)
  return rows.map(row => {
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!profileId) return row
    const enrichment = byProfileId[profileId]
    return enrichment ? { ...row, ...enrichment } : row
  })
}

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url)
  const tableName = (url.searchParams.get('table') ?? '').trim()
  const column = (url.searchParams.get('column') ?? '').trim()

  if (!tableName || !column) {
    return Response.json({ status: 'invalid', allOptions: [], totalCount: 0 }, { status: 400 })
  }

  const definition = TABLE_DEFINITIONS[tableName]
  if (!definition) {
    return Response.json({ status: 'not_found', allOptions: [], totalCount: 0 }, { status: 404 })
  }

  const validBaseColumn = definition.columns.includes(column)
  const validWorkshopDerivedColumn = tableName === 'class-enrollment' && WORKSHOP_ENRICHMENT_COLUMNS.has(column)

  if (!validBaseColumn && !validWorkshopDerivedColumn) {
    return Response.json({ status: 'invalid_column', allOptions: [], totalCount: 0 }, { status: 400 })
  }

  const { supabase, headers } = createClient(request)
  const selectableColumns = new Set(parseTopLevelSelectColumns(definition.select))
  const parsedFilters = parseFiltersFromSearch(url.searchParams)

  const hasUnsupportedFilter = Object.keys(parsedFilters).some(
    filterColumn => filterColumn !== column && !selectableColumns.has(filterColumn)
  )
  const hasMixedEmptyAndExplicit = Object.values(parsedFilters).some(
    filter => filter.includeEmpty && filter.values.length > 0
  )
  const isSelectableColumn = selectableColumns.has(column)

  if (hasUnsupportedFilter || hasMixedEmptyAndExplicit || !isSelectableColumn) {
    try {
      const rows = await loadAllRowsViaTableLoader(request, tableName)
      const requiredColumns = new Set<string>([column, ...Object.keys(parsedFilters)])
      const enrichedRows = await maybeEnrichWorkshopEnrollmentRows({
        tableName,
        rows,
        requiredColumns,
      })
      const options = sortFilterOptions(
        enrichedRows
          .filter(row => rowMatchesFilters(row, parsedFilters, column))
          .map(row => toOptionValue(row[column]))
      )

      return Response.json(
        {
          status: 'loaded',
          allOptions: options,
          totalCount: options.length,
        },
        { headers }
      )
    } catch (error) {
      const message = error instanceof Response ? await error.text() : 'Unable to load filter options'
      return Response.json({ status: 'error', allOptions: [], totalCount: 0, error: message }, { status: 500, headers })
    }
  }

  const unique = new Set<string>()

  for (let offset = 0; ; offset += FETCH_BATCH_SIZE) {
    let query = fromQualifiedTable(supabase, definition.table)
      .select(column)
      .order(column, { ascending: true })
      .range(offset, offset + FETCH_BATCH_SIZE - 1)

    for (const [filterColumn, filter] of Object.entries(parsedFilters)) {
      if (filterColumn === column) continue
      if (!selectableColumns.has(filterColumn)) continue
      if (filter.includeEmpty && filter.values.length === 0) {
        query = query.is(filterColumn, null)
        continue
      }
      if (filter.values.length === 1) {
        query = query.eq(filterColumn, filter.values[0])
        continue
      }
      if (filter.values.length > 1) {
        query = query.in(filterColumn, filter.values)
      }
    }

    const { data, error } = await query
    if (error) {
      return Response.json({ status: 'error', allOptions: [], totalCount: 0, error: error.message }, { status: 500, headers })
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    for (const row of rows) {
      unique.add(toOptionValue(row[column]))
    }

    if (rows.length < FETCH_BATCH_SIZE) {
      break
    }
  }

  const allOptions = sortFilterOptions(Array.from(unique))
  return Response.json(
    {
      status: 'loaded',
      allOptions,
      totalCount: allOptions.length,
    },
    { headers }
  )
}
