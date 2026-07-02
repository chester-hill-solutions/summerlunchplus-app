import { createClient } from '@/lib/supabase/server'
import { TABLE_DEFINITIONS } from './table-definitions'
import type { LoaderFunctionArgs } from 'react-router'

const FETCH_BATCH_SIZE = 1000
const FILTER_EMPTY_TOKEN = '__none__'

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
    return Response.json(
      { status: 'unsupported', allOptions: [], totalCount: 0 },
      { headers }
    )
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
