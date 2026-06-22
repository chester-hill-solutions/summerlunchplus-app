type TimestampLabelValue = {
  timestamp: unknown
  label: unknown
  order?: unknown
}

export const FILTER_EMPTY_TOKEN = '__none__'

const timestampColumns = new Set(['starts_at', 'ends_at', 'submitted_at'])

const isTimestampColumn = (column: string) => column.endsWith('_at') || timestampColumns.has(column)

const formatTimestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(date)
}

const formatDateOnly = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

const isTimestampLabelValue = (value: unknown): value is TimestampLabelValue => {
  if (!value || typeof value !== 'object') return false
  return 'timestamp' in value && 'label' in value
}

export const getCellValue = (column: string, row: Record<string, unknown>, tableName?: string) => {
  const value = row[column]
  if (value && typeof value === 'object') {
    if ('start' in value && 'end' in value) {
      const start = typeof value.start === 'string' ? formatDateOnly(value.start) : ''
      const end = typeof value.end === 'string' ? formatDateOnly(value.end) : ''
      return [start, end].filter(Boolean).join(' - ')
    }
    if (isTimestampLabelValue(value)) {
      const timestamp = typeof value.timestamp === 'string' ? formatTimestamp(value.timestamp) : ''
      const label = typeof value.label === 'string' ? value.label : ''
      const order = typeof value.order === 'string' ? value.order : 'timestamp_first'
      return order === 'label_first'
        ? [label, timestamp].filter(Boolean).join(' ')
        : [timestamp, label].filter(Boolean).join(' ')
    }
    return JSON.stringify(value)
  }
  if (typeof value === 'string' && isTimestampColumn(column)) {
    if (tableName === 'semester' && (column === 'starts_at' || column === 'ends_at')) {
      return formatDateOnly(value)
    }
    return formatTimestamp(value)
  }
  return (value ?? '').toString()
}

const normalizeFilterValues = (values: string[]) =>
  Array.from(new Set(values.filter(value => value !== undefined)))

export const parseFiltersFromSearchParams = (searchParams: URLSearchParams, columns: string[]) => {
  return columns.reduce<Record<string, string[]>>((acc, column) => {
    const values = normalizeFilterValues(searchParams.getAll(`f_${column}`))
    if (!values.length) {
      return acc
    }
    const explicitValues = values.filter(value => value !== FILTER_EMPTY_TOKEN)
    const hasEmptySelection = values.includes(FILTER_EMPTY_TOKEN)
    if (hasEmptySelection && !explicitValues.length) {
      acc[column] = []
    } else if (explicitValues.length) {
      acc[column] = explicitValues
    }
    return acc
  }, {})
}

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

const rowMatchesFilters = (
  row: Record<string, unknown>,
  columns: string[],
  filters: Record<string, string[]>,
  tableName?: string
) =>
  columns.every(column => {
    if (!hasOwn(filters, column)) return true
    const selectedValues = filters[column] ?? []
    if (!selectedValues.length) return false
    const cellValue = getCellValue(column, row, tableName)
    return selectedValues.includes(cellValue)
  })

export const applyFiltersAndSort = ({
  rows,
  columns,
  filters,
  sortColumn,
  sortDir,
  tableName,
}: {
  rows: Record<string, unknown>[]
  columns: string[]
  filters: Record<string, string[]>
  sortColumn: string | null
  sortDir: 'asc' | 'desc' | null
  tableName?: string
}) => {
  const filtered = rows.filter(row => rowMatchesFilters(row, columns, filters, tableName))
  if (!sortColumn || !sortDir) {
    return filtered
  }

  const order = sortDir === 'asc' ? 1 : -1
  filtered.sort((a, b) => {
    const aValue = getCellValue(sortColumn, a, tableName)
    const bValue = getCellValue(sortColumn, b, tableName)
    if (aValue === bValue) return 0
    return aValue.localeCompare(bValue) * order
  })

  return filtered
}
