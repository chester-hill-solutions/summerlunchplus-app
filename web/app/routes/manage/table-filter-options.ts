import { createClient } from '@/lib/supabase/server'
import { loadFamilyContextByProfileIds } from '@/lib/family-context.server'
import { TABLE_DEFINITIONS } from './table-definitions'
import { createTableLoader } from './table-loader'
import { loadWorkshopEnrollmentEnrichment } from './workshop-enrollment-enrichment.server'
import type { LoaderFunctionArgs } from 'react-router'

const FETCH_BATCH_SIZE = 1000
const FILTER_EMPTY_TOKEN = '__none__'
const CLASS_ENROLLMENT_WORKSHOP_ENRICHMENT_COLUMNS = new Set([
  'riding_display',
  'geo_locations_display',
  'giftcard_display',
  'prior_participation_display',
])
const CLASS_ENROLLMENT_FAMILY_CONTEXT_COLUMNS = new Set([
  'prior_participation_display',
  'profile_hover_top_discrepancy',
  'profile_hover_more_discrepancies',
  'profile_hover_name',
  'profile_hover_parent_name',
  'profile_hover_email',
  'profile_hover_student_phone',
  'profile_hover_parent_email',
  'profile_hover_parent_phone',
  'profile_hover_student_geo',
  'profile_hover_parent_geo',
  'profile_hover_student_submitted_address',
  'profile_hover_parent_address',
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

const parseFiltersFromSearch = (columns: string[], searchParams: URLSearchParams): Record<string, ParsedFilter> => {
  return columns.reduce<Record<string, ParsedFilter>>((acc, column) => {
    const values = Array.from(new Set(searchParams.getAll(`f_${column}`)))
    if (!values.length) return acc

    const includeEmpty = values.includes(FILTER_EMPTY_TOKEN)
    const explicitValues = values.filter(value => value !== FILTER_EMPTY_TOKEN)
    acc[column] = {
      values: explicitValues,
      includeEmpty,
    }
    return acc
  }, {})
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

const hydrateClassEnrollmentRows = async (
  rows: Record<string, unknown>[],
  requestedColumns: Set<string>
) => {
  const profileIds = Array.from(
    new Set(
      rows
        .map(row => (typeof row.profile_id === 'string' ? row.profile_id : ''))
        .filter(Boolean)
    )
  )
  if (!profileIds.length) {
    return rows
  }

  const shouldLoadWorkshopEnrichment = Array.from(requestedColumns).some(column =>
    CLASS_ENROLLMENT_WORKSHOP_ENRICHMENT_COLUMNS.has(column)
  )
  const shouldLoadFamilyContext = Array.from(requestedColumns).some(column =>
    CLASS_ENROLLMENT_FAMILY_CONTEXT_COLUMNS.has(column)
  )

  const [workshopEnrichmentByProfileId, familyContextByProfileId] = await Promise.all([
    shouldLoadWorkshopEnrichment
      ? loadWorkshopEnrollmentEnrichment(profileIds)
      : Promise.resolve({} as Awaited<ReturnType<typeof loadWorkshopEnrollmentEnrichment>>),
    shouldLoadFamilyContext
      ? loadFamilyContextByProfileIds(profileIds)
      : Promise.resolve({} as Awaited<ReturnType<typeof loadFamilyContextByProfileIds>>),
  ])

  return rows.map(row => {
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!profileId) {
      return row
    }

    const workshopValues = workshopEnrichmentByProfileId[profileId] ?? {
      riding_display: 'Not looked up',
      geo_locations_display: 'N/A',
      giftcard_display: 'N/A',
      prior_participation_display: 'N/A',
    }
    const familyValues = familyContextByProfileId[profileId] ?? {}

    return {
      ...row,
      ...workshopValues,
      ...familyValues,
    }
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

  if (!definition.columns.includes(column)) {
    return Response.json({ status: 'invalid_column', allOptions: [], totalCount: 0 }, { status: 400 })
  }

  const { supabase, headers } = createClient(request)
  const selectableColumns = new Set(parseTopLevelSelectColumns(definition.select))
  const parsedFilters = parseFiltersFromSearch(definition.columns, url.searchParams)

  const hasUnsupportedFilter = Object.keys(parsedFilters).some(
    filterColumn => filterColumn !== column && !selectableColumns.has(filterColumn)
  )
  const hasMixedEmptyAndExplicit = Object.values(parsedFilters).some(
    filter => filter.includeEmpty && filter.values.length > 0
  )
  const isSelectableColumn = selectableColumns.has(column)

  if (hasUnsupportedFilter || hasMixedEmptyAndExplicit || !isSelectableColumn) {
    try {
      let rows = await loadAllRowsViaTableLoader(request, tableName)
      if (tableName === 'class-enrollment') {
        const requestedColumns = new Set<string>([
          column,
          ...Object.keys(parsedFilters),
        ])
        const needsHydration = Array.from(requestedColumns).some(
          requestedColumn =>
            CLASS_ENROLLMENT_WORKSHOP_ENRICHMENT_COLUMNS.has(requestedColumn) ||
            CLASS_ENROLLMENT_FAMILY_CONTEXT_COLUMNS.has(requestedColumn)
        )
        if (needsHydration) {
          rows = await hydrateClassEnrollmentRows(rows, requestedColumns)
        }
      }
      const options = sortFilterOptions(
        rows
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
