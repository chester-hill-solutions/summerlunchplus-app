import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { useFetcher, useLoaderData, useSearchParams } from 'react-router'

import { Combobox } from '@/components/ui/combobox'
import { Constants, type Database } from '@/lib/database.types'

type TimestampLabelValue = {
  timestamp: unknown
  label: unknown
  order?: unknown
}

type EditorField = {
  label?: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'foreign_key' | 'enum' | 'json'
  required?: boolean
  nullable?: boolean
  enumValues?: string[]
}

type EditorConfig = {
  primaryKey: string[]
  allowInsert: boolean
  allowUpdate: boolean
  fields: Record<string, EditorField>
}

type ForeignKeyOption = {
  value: string
  label: string
}

type LoaderData = {
  columns: string[]
  rows: Record<string, unknown>[]
  label: string
  tableName: string
  canEditStatus?: boolean
  editorConfig?: EditorConfig
  foreignKeyOptions?: Record<string, ForeignKeyOption[]>
}

const timestampColumns = new Set(['starts_at', 'ends_at', 'submitted_at'])

const isTimestampColumn = (column: string) => column.endsWith('_at') || timestampColumns.has(column)

const displayTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'

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

const getCellValue = (column: string, row: Record<string, unknown>, tableName?: string) => {
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

const getDirectionIndicator = (stage: 0 | 1 | 2) => {
  if (stage === 1) return '↓'
  if (stage === 2) return '↑'
  return ''
}

const toLocalDateTimeValue = (value: unknown) => {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value.slice(0, 16)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const toDateValue = (value: unknown) => {
  if (typeof value !== 'string' || !value) return ''
  return value.slice(0, 10)
}

const rowKeyFor = (row: Record<string, unknown>, editorConfig?: EditorConfig) => {
  if (!editorConfig?.primaryKey.length) return ''
  return editorConfig.primaryKey.map(key => String(row[key] ?? '')).join('::')
}

type TableDisplayProps = {
  headerActions?: ReactNode
}

export default function TableDisplay({ headerActions }: TableDisplayProps = {}) {
  const {
    columns = [],
    rows = [],
    label = 'Table',
    tableName = '',
    canEditStatus,
    editorConfig,
    foreignKeyOptions = {},
  } = useLoaderData() as LoaderData

  const statusFetcher = useFetcher()
  const editorFetcher = useFetcher<{ error?: string; success?: boolean }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortStage, setSortStage] = useState<0 | 1 | 2>(0)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [createValues, setCreateValues] = useState<Record<string, string>>({})
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

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

  useEffect(() => {
    if (!editorFetcher.data?.success) return
    setShowCreate(false)
    setCreateValues({})
    setEditingRowKey(null)
    setEditValues({})
  }, [editorFetcher.data])

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
    let adjustedRows = [...rows]
    adjustedRows = adjustedRows.filter(row =>
      columns.every(column => {
        const filter = filters[column]
        if (!filter) return true
        const tokens = filter
          .split(',')
          .map(token => token.trim())
          .filter(Boolean)
        if (!tokens.length) return true
        const cellValue = getCellValue(column, row, tableName).toLowerCase()
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
  }, [rows, columns, filters, sortColumn, sortStage, tableName])

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
  const isWorkshopEnrollment = tableName === 'class-enrollment'
  const canInlineInsert = Boolean(editorConfig?.allowInsert)
  const canInlineUpdate = Boolean(editorConfig?.allowUpdate)

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
    statusFetcher.submit(formData, { method: 'post' })
  }

  const updateWorkshopEnrollmentStatus = (row: Record<string, unknown>, value: string) => {
    if (!isWorkshopEnrollment || !canEditStatus || !value) return
    const enrollmentId = typeof row.id === 'string' ? row.id : ''
    if (!enrollmentId) return

    const formData = new FormData()
    formData.set('intent', 'update-status')
    formData.set('enrollment_id', enrollmentId)
    formData.set('status', value)
    statusFetcher.submit(formData, { method: 'post' })
  }

  const fieldKeys = editorConfig ? Object.keys(editorConfig.fields) : []
  const isNumericColumn = (column: string) => editorConfig?.fields[column]?.type === 'number'

  const beginEdit = (row: Record<string, unknown>) => {
    if (!editorConfig) return
    const nextValues: Record<string, string> = {}
    for (const [fieldName, fieldConfig] of Object.entries(editorConfig.fields)) {
      const value = row[fieldName]
      if (fieldConfig.type === 'datetime') {
        nextValues[fieldName] = toLocalDateTimeValue(value)
      } else if (fieldConfig.type === 'date') {
        nextValues[fieldName] = toDateValue(value)
      } else if (fieldConfig.type === 'boolean') {
        nextValues[fieldName] = value ? 'true' : 'false'
      } else if (fieldConfig.type === 'json') {
        if (typeof value === 'string') {
          nextValues[fieldName] = value
        } else if (value == null) {
          nextValues[fieldName] = ''
        } else {
          nextValues[fieldName] = JSON.stringify(value)
        }
      } else {
        nextValues[fieldName] = value == null ? '' : String(value)
      }
    }
    setEditValues(nextValues)
    setEditingRowKey(rowKeyFor(row, editorConfig))
  }

  const submitCreate = () => {
    if (!editorConfig) return
    const formData = new FormData()
    formData.set('intent', 'insert-row')
    for (const fieldName of fieldKeys) {
      formData.set(`field_${fieldName}`, createValues[fieldName] ?? '')
    }
    editorFetcher.submit(formData, { method: 'post' })
  }

  const submitUpdate = (row: Record<string, unknown>) => {
    if (!editorConfig) return
    const formData = new FormData()
    formData.set('intent', 'update-row')
    for (const fieldName of fieldKeys) {
      formData.set(`field_${fieldName}`, editValues[fieldName] ?? '')
    }
    for (const keyColumn of editorConfig.primaryKey) {
      formData.set(`pk_${keyColumn}`, String(row[keyColumn] ?? ''))
    }
    editorFetcher.submit(formData, { method: 'post' })
  }

  const renderField = (
    fieldName: string,
    field: EditorField,
    values: Record<string, string>,
    setValues: Dispatch<SetStateAction<Record<string, string>>>
  ) => {
    const value = values[fieldName] ?? ''
    const commonLabel = field.label ?? fieldName.replace(/_/g, ' ')

    if (field.type === 'foreign_key') {
      return (
        <label key={fieldName} className="grid gap-1 text-xs">
          <span className="text-muted-foreground">{commonLabel}</span>
          <Combobox
            value={value}
            options={foreignKeyOptions[fieldName] ?? []}
            onChange={nextValue => {
              setValues(prev => ({ ...prev, [fieldName]: nextValue }))
            }}
            placeholder="Search..."
          />
        </label>
      )
    }

    if (field.type === 'boolean') {
      return (
        <label key={fieldName} className="grid gap-1 text-xs">
          <span className="text-muted-foreground">{commonLabel}</span>
          <select
            value={value}
            onChange={event => {
              const nextValue = event.target.value
              setValues(prev => ({ ...prev, [fieldName]: nextValue }))
            }}
            className="h-9 rounded border border-input bg-background px-2"
          >
            {field.nullable ? <option value="">(none)</option> : null}
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </label>
      )
    }

    if (field.type === 'enum') {
      return (
        <label key={fieldName} className="grid gap-1 text-xs">
          <span className="text-muted-foreground">{commonLabel}</span>
          <select
            value={value}
            onChange={event => {
              const nextValue = event.target.value
              setValues(prev => ({ ...prev, [fieldName]: nextValue }))
            }}
            className="h-9 rounded border border-input bg-background px-2"
          >
            {field.nullable ? <option value="">(none)</option> : null}
            {(field.enumValues ?? []).map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      )
    }

    if (field.type === 'json') {
      return (
        <label key={fieldName} className="grid gap-1 text-xs md:col-span-2 lg:col-span-3">
          <span className="text-muted-foreground">{commonLabel}</span>
          <textarea
            required={field.required}
            value={value}
            onChange={event => {
              const nextValue = event.target.value
              setValues(prev => ({ ...prev, [fieldName]: nextValue }))
            }}
            className="min-h-24 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
          />
        </label>
      )
    }

    const inputType = field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'datetime' ? 'datetime-local' : 'text'
    const fieldLabel = field.type === 'datetime' ? `${commonLabel} (${displayTimeZone})` : commonLabel
    const inputClassName =
      field.type === 'number'
        ? 'h-9 w-28 rounded border border-input bg-background px-2'
        : 'h-9 rounded border border-input bg-background px-2'

    return (
      <label key={fieldName} className="grid gap-1 text-xs">
        <span className="text-muted-foreground">{fieldLabel}</span>
        <input
          type={inputType}
          required={field.required}
          value={value}
          onChange={event => {
            const nextValue = event.target.value
            setValues(prev => ({ ...prev, [fieldName]: nextValue }))
          }}
          className={inputClassName}
        />
      </label>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{label}</h1>
          <p className="text-sm text-muted-foreground">Showing live entries from the {label.toLowerCase()} table ({derivedRows.length} rows).</p>
          <p className="text-xs text-muted-foreground">Time values shown in {displayTimeZone}.</p>
        </div>
        {headerActions ? <div className="ml-auto">{headerActions}</div> : null}
      </div>

      {canInlineInsert ? (
        <section className="relative z-30 overflow-visible rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Add row</h2>
            <button
              type="button"
              onClick={() => setShowCreate(prev => !prev)}
              className="rounded border border-input px-2 py-1 text-xs"
            >
              {showCreate ? 'Hide' : 'New row'}
            </button>
          </div>
          {showCreate ? (
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {fieldKeys.map(fieldName =>
                  editorConfig
                    ? renderField(fieldName, editorConfig.fields[fieldName], createValues, setCreateValues)
                    : null
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitCreate}
                  disabled={editorFetcher.state === 'submitting'}
                  className="rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                >
                  {editorFetcher.state === 'submitting' ? 'Saving...' : 'Create'}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {editorFetcher.data?.error ? <p className="text-sm text-destructive">{editorFetcher.data.error}</p> : null}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full table-auto text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              {columns.map(column => (
                <th
                  key={`head-${column}`}
                  className={isNumericColumn(column) ? 'w-24 px-4 py-2 text-left' : 'px-4 py-2 text-left'}
                >
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
              {canInlineUpdate ? <th className="px-4 py-2 text-left">actions</th> : null}
            </tr>
            <tr className="bg-muted/10">
              {columns.map(column => (
                <th key={`filter-${column}`} className="px-4 py-1">
                  <div className="relative">
                    <input
                      type="text"
                      value={filters[column] ?? ''}
                      onChange={event => updateFilter(column, event.target.value)}
                      placeholder="Filter"
                      className={
                        isNumericColumn(column)
                          ? 'w-full max-w-24 rounded border border-border px-2 py-1 pr-7 text-xs'
                          : 'w-full rounded border border-border px-2 py-1 pr-7 text-xs'
                      }
                    />
                    {filters[column] ? (
                      <button
                        type="button"
                        onClick={() => updateFilter(column, '')}
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded px-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Clear ${column} filter`}
                      >
                        x
                      </button>
                    ) : null}
                  </div>
                </th>
              ))}
              {canInlineUpdate ? <th className="px-4 py-1" /> : null}
            </tr>
          </thead>
          <tbody>
            {derivedRows.map((row, rowIndex) => {
              const rowKey = rowKeyFor(row, editorConfig)
              const isEditing = Boolean(canInlineUpdate && editingRowKey === rowKey)

              return (
                <Fragment key={`fragment-${rowKey || rowIndex}`}>
                  <tr key={`row-${rowIndex}`} className={rowIndex % 2 === 0 ? 'bg-card' : ''}>
                    {columns.map(column => {
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

                      if (isWorkshopEnrollment && column === 'status' && canEditStatus) {
                        const statusValue = typeof row.status === 'string' ? row.status : ''
                        return (
                          <td key={`cell-${rowIndex}-${column}`} className="px-4 py-2 font-mono">
                            <select
                              value={statusValue}
                              onChange={event => updateWorkshopEnrollmentStatus(row, event.target.value)}
                              className="h-8 w-full rounded border border-input bg-background px-2 text-xs"
                            >
                              {Constants.public.Enums.workshop_enrollment_status.map((status: Database['public']['Enums']['workshop_enrollment_status']) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </td>
                        )
                      }

                      return (
                        <td
                          key={`cell-${rowIndex}-${column}`}
                          className={
                            isNumericColumn(column)
                              ? 'w-24 cursor-pointer whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums hover:bg-muted/30'
                              : 'max-w-xs cursor-pointer truncate px-4 py-2 font-mono hover:bg-muted/30'
                          }
                          onClick={() => appendFilter(column, getCellValue(column, row, tableName))}
                        >
                          {getCellValue(column, row, tableName)}
                        </td>
                      )
                    })}
                    {canInlineUpdate ? (
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          className="rounded border border-input px-2 py-1 text-xs"
                          onClick={() => {
                            if (isEditing) {
                              setEditingRowKey(null)
                              setEditValues({})
                              return
                            }
                            beginEdit(row)
                          }}
                        >
                          {isEditing ? 'Cancel' : 'Edit'}
                        </button>
                      </td>
                    ) : null}
                  </tr>

                  {isEditing && editorConfig ? (
                    <tr key={`edit-${rowKey}`} className="border-t bg-muted/10">
                      <td colSpan={columns.length + (canInlineUpdate ? 1 : 0)} className="px-4 py-3">
                        <div className="space-y-3">
                          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {fieldKeys.map(fieldName => renderField(fieldName, editorConfig.fields[fieldName], editValues, setEditValues))}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => submitUpdate(row)}
                              disabled={editorFetcher.state === 'submitting'}
                              className="rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                            >
                              {editorFetcher.state === 'submitting' ? 'Saving...' : 'Save changes'}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
