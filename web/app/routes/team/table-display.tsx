import { useMemo, useState } from 'react'
import { useLoaderData } from 'react-router'

const getCellValue = (column: string, row: Record<string, unknown>) => {
  const value = row[column]
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value)
  }
  return (value ?? '').toString()
}

const getDirectionIndicator = (direction: 'asc' | 'desc') => (direction === 'asc' ? '↑' : '↓')

export default function TableDisplay() {
  const { columns, rows, label } = useLoaderData()
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filters, setFilters] = useState<Record<string, string>>({})

  const derivedRows = useMemo(() => {
    let adjustedRows = [...(rows as Record<string, unknown>[])]
    adjustedRows = adjustedRows.filter(row =>
      columns.every((column: string) => {
        const filter = filters[column]
        if (!filter) return true
        return getCellValue(column, row).toLowerCase().includes(filter.toLowerCase())
      })
    )
    if (sortColumn) {
      adjustedRows.sort((a, b) => {
        const aValue = getCellValue(sortColumn, a)
        const bValue = getCellValue(sortColumn, b)
        if (aValue === bValue) return 0
        const order = sortDirection === 'asc' ? 1 : -1
        return aValue.localeCompare(bValue) * order
      })
    }
    return adjustedRows
  }, [rows, columns, filters, sortColumn, sortDirection])

  const updateSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortColumn(column)
    setSortDirection('asc')
  }

  const updateFilter = (column: string, value: string) => {
    setFilters(prev => ({ ...prev, [column]: value }))
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
                    {sortColumn === column ? getDirectionIndicator(sortDirection) : '↕'}
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
              {columns.map((column: string) => (
                  <td key={`cell-${rowIndex}-${column}`} className="px-4 py-2 font-mono">{getCellValue(column, row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
