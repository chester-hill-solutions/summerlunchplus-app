import { useEffect, useMemo, useState } from 'react'
import { useFetcher, useLoaderData, useSearchParams } from 'react-router'

const timestampColumns = new Set(['starts_at', 'ends_at', 'submitted_at'])

const isTimestampColumn = (column: string) => column.endsWith('_at') || timestampColumns.has(column)

const formatTimestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const getCellValue = (column: string, row: Record<string, unknown>) => {
  const value = row[column]
  if (value && typeof value === 'object') {
    if ('start' in value && 'end' in value) {
      const start = typeof value.start === 'string' ? formatTimestamp(value.start) : ''
      const end = typeof value.end === 'string' ? formatTimestamp(value.end) : ''
      return [start, end].filter(Boolean).join(' - ')
    }
    if ('timestamp' in value && 'label' in value) {
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
    return formatTimestamp(value)
  }
  return (value ?? '').toString()
}

const getDirectionIndicator = (stage: 0 | 1 | 2) => {
  if (stage === 1) return '↓'
  if (stage === 2) return '↑'
  return ''
}

export default function TableDisplay() {
  const { columns, rows, label, tableName, canEditStatus } = useLoaderData()
  const fetcher = useFetcher()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortStage, setSortStage] = useState<0 | 1 | 2>(0)
  const [filters, setFilters] = useState<Record<string, string>>({})

  useEffect(() => {
    const nextSort = searchParams.get('sort')
    const nextDir = searchParams.get('dir')
    const nextFilters = Array.from(searchParams.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
      if (key.startsWith('f_')) {
        acc[key.slice(2)] = value
      }
      return acc
    }, {})

    setSortColumn(nextSort)
    setSortStage(nextSort ? (nextDir === 'asc' ? 2 : 1) : 0)
    setFilters(nextFilters)
  }, [searchParams])

  const syncSearch = (nextFilters: Record<string, string>, nextSortColumn: string | null, nextSortStage: 0 | 1 | 2) => {
    const next = new URLSearchParams()
    if (nextSortColumn && nextSortStage > 0) {
      next.set('sort', nextSortColumn)
      next.set('dir', nextSortStage === 2 ? 'asc' : 'desc')
    }
    for (const [column, value] of Object.entries(nextFilters)) {
      if (value) {
        next.set(`f_${column}`, value)
      }
    }
    setSearchParams(next, { replace: true })
  }

  const derivedRows = useMemo(() => {
    let adjustedRows = [...(rows as Record<string, unknown>[])]
    adjustedRows = adjustedRows.filter(row =>
      columns.every((column: string) => {
        const filter = filters[column]
        if (!filter) return true
        const tokens = filter
          .split(',')
          .map(token => token.trim())
          .filter(Boolean)
        if (!tokens.length) return true
        const cellValue = getCellValue(column, row).toLowerCase()
        return tokens.some(token => cellValue.includes(token.toLowerCase()))
      })
    )
    if (sortColumn && sortStage > 0) {
      adjustedRows.sort((a, b) => {
        const aValue = getCellValue(sortColumn, a)
        const bValue = getCellValue(sortColumn, b)
        if (aValue === bValue) return 0
        const order = sortStage === 2 ? 1 : -1
        return aValue.localeCompare(bValue) * order
      })
    }
    return adjustedRows
  }, [rows, columns, filters, sortColumn, sortStage])

  const updateSort = (column: string) => {
    if (sortColumn !== column) {
      const nextStage: 0 | 1 | 2 = 1
      setSortColumn(column)
      setSortStage(nextStage)
      syncSearch(filters, column, nextStage)
      return
    }
    setSortStage(prev => {
      const next = prev + 1
      if (next > 2) {
        setSortColumn(null)
        syncSearch(filters, null, 0)
        return 0
      }
      syncSearch(filters, column, next as 0 | 1 | 2)
      return next as 0 | 1 | 2
    })
  }

  const updateFilter = (column: string, value: string) => {
    setFilters(prev => {
      const next = { ...prev, [column]: value }
      syncSearch(next, sortColumn, sortStage)
      return next
    })
  }

  const appendFilter = (column: string, value: string) => {
    if (!value) return
    setFilters(prev => {
      const current = prev[column] ?? ''
      if (current.toLowerCase().includes(value.toLowerCase())) {
        return prev
      }
      const nextValue = current ? `${current}, ${value}` : value
      const next = { ...prev, [column]: nextValue }
      syncSearch(next, sortColumn, sortStage)
      return next
    })
  }

  const isClassAttendance = tableName === 'class-attendance'

  const updateAttendanceStatus = (row: Record<string, unknown>, value: string) => {
    if (!isClassAttendance || !canEditStatus) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return
    const formData = new FormData()
    formData.set('intent', 'update-status')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    formData.set('status', value)
    fetcher.submit(formData, { method: 'post' })
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{label}</h1>
        <p className="text-sm text-muted-foreground">Showing live entries from the {label.toLowerCase()} table ({derivedRows.length} rows).</p>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full table-fixed text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              {columns.map((column: string) => (
                <th key={`head-${column}`} className="px-4 py-2 text-left">
                  <button
                    type="button"
                    onClick={() => updateSort(column)}
                    className="flex items-center gap-1 font-semibold"
                  >
                    {column.replace(/_/g, ' ')}
                    {getDirectionIndicator(sortColumn === column ? sortStage : 0)}
                  </button>
                </th>
              ))}
            </tr>
            <tr className="bg-muted/10">
              {columns.map((column: string) => (
                <th key={`filter-${column}`} className="px-4 py-1">
                  <input
                    type="text"
                    value={filters[column] ?? ''}
                    onChange={event => updateFilter(column, event.target.value)}
                    placeholder="Filter"
                    className="w-full rounded border border-border px-2 py-1 text-xs"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {derivedRows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`} className={rowIndex % 2 === 0 ? 'bg-card' : ''}>
                {columns.map((column: string) => {
                  if (isClassAttendance && column === 'status' && canEditStatus) {
                    const statusValue = typeof row.status === 'string' ? row.status : ''
                    return (
                      <td key={`cell-${rowIndex}-${column}`} className="px-4 py-2 font-mono">
                        <select
                          value={statusValue}
                          onChange={event => updateAttendanceStatus(row, event.target.value)}
                          className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                        >
                          <option value="">(none)</option>
                          <option value="unknown">unknown</option>
                          <option value="present">present</option>
                          <option value="absent">absent</option>
                        </select>
                      </td>
                    )
                  }

                  return (
                    <td
                      key={`cell-${rowIndex}-${column}`}
                      className="px-4 py-2 font-mono hover:bg-muted/30 cursor-pointer"
                      onClick={() => appendFilter(column, getCellValue(column, row))}
                    >
                      {getCellValue(column, row)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
