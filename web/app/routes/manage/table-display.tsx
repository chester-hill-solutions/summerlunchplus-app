import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Link, useFetcher, useLoaderData, useLocation, useSearchParams } from 'react-router'
import { Filter } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Constants, type Database } from '@/lib/database.types'
import { getOffsetMinutesForLocalDateTime, toLocalDateTimeInputValue } from '@/lib/datetime'

type TimestampLabelValue = {
  timestamp: unknown
  label: unknown
  order?: unknown
}

type EditorField = {
  label?: string
  type: 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'foreign_key' | 'enum' | 'json' | 'timezone'
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

type HoverCardField = {
  label: string
  field: string
  fallback?: string
}

type HoverCardConfig = {
  titleField?: string
  titleFallback?: string
  fields: HoverCardField[]
  columns?: {
    leftTitle?: string
    rightTitle?: string
    rightTitleField?: string
    rightTitleFallback?: string
    left: HoverCardField[]
    right: HoverCardField[]
  }
}

type WorkshopEnrollmentEnrichment = {
  riding_display: string
  geo_locations_display: string
  giftcard_display: string
  prior_participation_display: string
  profile_hover_top_discrepancy: string
  profile_hover_more_discrepancies: string
  profile_hover_name: string
  profile_hover_parent_name: string
  profile_hover_email: string
  profile_hover_student_phone: string
  profile_hover_parent_email: string
  profile_hover_parent_phone: string
  profile_hover_student_geo: string
  profile_hover_parent_geo: string
  profile_hover_student_submitted_address: string
  profile_hover_parent_address: string
}

type WorkshopEnrollmentOnlyEnrichment = Pick<
  WorkshopEnrollmentEnrichment,
  'riding_display' | 'geo_locations_display' | 'giftcard_display' | 'prior_participation_display'
>

type WorkshopEnrollmentEnrichmentResponse = {
  byProfileId: Record<string, WorkshopEnrollmentOnlyEnrichment>
}

type FamilyContextEnrichment = Pick<
  WorkshopEnrollmentEnrichment,
  | 'prior_participation_display'
  | 'profile_hover_top_discrepancy'
  | 'profile_hover_more_discrepancies'
  | 'profile_hover_name'
  | 'profile_hover_parent_name'
  | 'profile_hover_email'
  | 'profile_hover_student_phone'
  | 'profile_hover_parent_email'
  | 'profile_hover_parent_phone'
  | 'profile_hover_student_geo'
  | 'profile_hover_parent_geo'
  | 'profile_hover_student_submitted_address'
  | 'profile_hover_parent_address'
>

type FamilyContextEnrichmentResponse = {
  byProfileId: Record<string, FamilyContextEnrichment>
}

type FederalDistrictCounts = {
  total: number
  accepted: number
  pending: number
  waitlisted: number
  declined: number
}

type FederalDistrictEnrichmentResponse = {
  byRiding: Record<string, FederalDistrictCounts>
}

type LoaderData = {
  columns: string[]
  rows: Record<string, unknown>[]
  label: string
  tableName: string
  tableVariant?: 'default' | 'pivot'
  enableCellClickFilter?: boolean
  columnMeta?: Record<string, {
    label?: string
    truncate?: boolean
    filterable?: boolean
    numeric?: boolean
    maxChars?: number
    minWidth?: number
    preferredWidth?: number
    fitContentOnLoad?: boolean
    hoverCard?: HoverCardConfig
  }>
  canEditStatus?: boolean
  editorConfig?: EditorConfig
  foreignKeyOptions?: Record<string, ForeignKeyOption[]>
}

type RegisterStudentActionResult = {
  ok: boolean
  intent: 'register-student'
  class_id: string
  profile_id: string
  zoom_join_url?: string
  message?: string
  error?: string
}

const timestampColumns = new Set(['starts_at', 'ends_at', 'submitted_at'])
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500, 1000, 1500] as const
const FILTER_EMPTY_TOKEN = '__none__'
const FILTER_POPOVER_WIDTH = 256
const FILTER_POPOVER_MARGIN = 8
const FILTER_POPOVER_ESTIMATED_HEIGHT = 340
const HOVER_CARD_WIDTH_PX = 480
const HOVER_CARD_MARGIN_PX = 8
const HOVER_CARD_OFFSET_PX = 4
const HOVER_CARD_ESTIMATED_HEIGHT_PX = 260
const FILTER_LOAD_CHUNK_SIZE = 300
const FILTER_CACHE_MAX_ENTRIES = 40
const FILTER_CACHE_TTL_MS = 5 * 60 * 1000
const FILTER_OPTION_MAX_VISIBLE_LIST = 1500
const FILTER_EMPTY_LABEL = '(empty)'
const ENABLE_PERSISTED_COLUMN_WIDTHS = false
const WORKSHOP_ENRICHMENT_BATCH_SIZE = 40
const WORKSHOP_ENRICHMENT_FILTER_BOOTSTRAP_BATCH_SIZE = 200
const FALLBACK_TIMEZONES = ['America/New_York', 'America/Toronto', 'America/Vancouver', 'UTC'] as const
const WORKSHOP_ENRICHMENT_COLUMNS = new Set([
  'riding_display',
  'geo_locations_display',
  'giftcard_display',
  'prior_participation_display',
])
const FAMILY_CONTEXT_COLUMNS = new Set([
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
const WORKSHOP_FILTER_ENRICHMENT_COLUMNS = new Set([
  ...Array.from(WORKSHOP_ENRICHMENT_COLUMNS),
  ...Array.from(FAMILY_CONTEXT_COLUMNS),
])

const hasHydratedFamilyContext = (enrichment?: WorkshopEnrollmentEnrichment) =>
  Boolean(
    enrichment?.profile_hover_name ||
      enrichment?.profile_hover_parent_name ||
      enrichment?.profile_hover_email ||
      enrichment?.profile_hover_parent_email ||
      enrichment?.profile_hover_student_geo ||
      enrichment?.profile_hover_parent_geo ||
      enrichment?.profile_hover_top_discrepancy ||
      enrichment?.profile_hover_more_discrepancies
  )
const DEFAULT_COLUMN_WIDTH = 180
const DEFAULT_NUMERIC_COLUMN_WIDTH = 120
const ACTIONS_COLUMN_WIDTH = 120
const MIN_COLUMN_WIDTH = 90
const MAX_COLUMN_WIDTH = 720
const MAX_COLUMN_WIDTH_VW_RATIO = 0.45
const TARGET_TABLE_WIDTH_VW_RATIO = 0.96
const ESTIMATED_CHAR_WIDTH_PX = 8
const CELL_HORIZONTAL_PADDING_PX = 32
const HEADER_CONTROL_ALLOWANCE_PX = 30
const MAX_ROWS_FOR_WIDTH_ESTIMATION = 1500
const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key)

type FilterOptionsStatus = 'idle' | 'loading' | 'loaded' | 'error'

type FilterOptionsCacheEntry = {
  status: FilterOptionsStatus
  allOptions: string[]
  totalCount: number
  updatedAt: number
  error?: string
}

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

const normalizeHoverCardValue = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

const hoverCardDataForCell = (row: Record<string, unknown>, config?: HoverCardConfig) => {
  if (!config) return null

  const hasListFields = config.fields.length > 0
  const hasColumns = Boolean(config.columns)
  if (!hasListFields && !hasColumns) return null

  const titleRaw = config.titleField ? normalizeHoverCardValue(row[config.titleField]) : ''
  const profileDisplayFallback =
    config.titleField === 'profile_hover_name' ? normalizeHoverCardValue(row.profile_display) : ''
  const title = titleRaw || profileDisplayFallback || config.titleFallback || ''
  const normalizeField = (field: HoverCardField) => {
    const rawValue = normalizeHoverCardValue(row[field.field])
    return {
      label: field.label,
      value: rawValue || field.fallback || '',
      visible: Boolean(rawValue) || Boolean(field.fallback),
    }
  }

  const fields = config.fields.map(normalizeField).filter(field => field.visible)

  const columnLayout = config.columns
    ? {
        leftTitle: config.columns.leftTitle,
        rightTitle:
          (config.columns.rightTitleField
            ? normalizeHoverCardValue(row[config.columns.rightTitleField])
            : '') ||
          config.columns.rightTitle ||
          config.columns.rightTitleFallback ||
          '',
        left: config.columns.left.map(normalizeField),
        right: config.columns.right.map(normalizeField),
      }
    : null

  const hasValue =
    Boolean(title) ||
    fields.some(field => Boolean(field.value)) ||
    Boolean(
      columnLayout &&
        (columnLayout.left.some(field => Boolean(field.value)) ||
          columnLayout.right.some(field => Boolean(field.value)))
    )

  return hasValue
    ? {
        title,
        fields,
        columns: columnLayout,
      }
    : null
}

const getDirectionIndicator = (stage: 0 | 1 | 2) => {
  if (stage === 1) return '↓'
  if (stage === 2) return '↑'
  return ''
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value)

const FORM_SELECT_CLASS_NAME = 'h-9 rounded border border-input bg-background px-2 pr-8'
const TABLE_SELECT_CLASS_NAME =
  'block h-8 w-full min-w-0 max-w-full rounded border border-input bg-background px-2 pr-8 text-xs'

const normalizeFilterValues = (values: string[]) =>
  Array.from(new Set(values.filter(value => value !== undefined)))

const displayFilterOption = (value: string) =>
  value === '' ? FILTER_EMPTY_LABEL : value

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

const filterKeySignature = (input: Record<string, string[]>, excludedColumn: string) => {
  const keys = Object.keys(input)
    .filter(key => key !== excludedColumn)
    .sort((left, right) => left.localeCompare(right))
  return keys
    .map(key => `${key}:${(input[key] ?? []).slice().sort((a, b) => a.localeCompare(b)).join('|')}`)
    .join(';')
}

const toLocalDateTimeValue = (value: unknown) =>
  typeof value === 'string' && value ? toLocalDateTimeInputValue(value) : ''

const toDateValue = (value: unknown) => {
  if (typeof value !== 'string' || !value) return ''
  return value.slice(0, 10)
}

const rowKeyFor = (row: Record<string, unknown>, editorConfig?: EditorConfig) => {
  if (!editorConfig?.primaryKey.length) return ''
  return editorConfig.primaryKey.map(key => String(row[key] ?? '')).join('::')
}

const attendanceRowKey = (row: Record<string, unknown>) => {
  const classId = typeof row.class_id === 'string' ? row.class_id : ''
  const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
  return classId && profileId ? `${classId}::${profileId}` : ''
}

const personLinkForCell = (
  tableName: string,
  column: string,
  row: Record<string, unknown>,
  returnTo: string
) => {
  const withReturnTo = (pathname: string, params: Record<string, string>) => {
    const search = new URLSearchParams(params)
    search.set('returnTo', returnTo)
    return `${pathname}?${search.toString()}`
  }

  const profileId =
    (typeof row.profile_id === 'string' && row.profile_id) ||
    (typeof row.id === 'string' && (tableName === 'profile' || tableName === 'participants') ? row.id : '')

  if (column === 'profile_display' && profileId) {
    return withReturnTo('/manage/person', { profileId })
  }
  if (tableName === 'class-attendance' && column === 'class_display' && typeof row.class_id === 'string' && row.class_id) {
    return withReturnTo('/manage/class', { f_id: row.class_id })
  }
  if (
    tableName === 'class' &&
    ['workshop_description', 'starts_at', 'ends_at', 'zoom_host_email'].includes(column)
  ) {
    const workshopDescription = typeof row.workshop_description === 'string' ? row.workshop_description : ''
    const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
    const endsAt = typeof row.ends_at === 'string' ? row.ends_at : ''
    return withReturnTo('/manage/class-attendance', {
      ...(workshopDescription ? { f_workshop_description: workshopDescription } : {}),
      ...(startsAt ? { f_class_starts_at: formatTimestamp(startsAt) } : {}),
      ...(endsAt ? { f_class_ends_at: formatTimestamp(endsAt) } : {}),
    })
  }
  if (tableName === 'class' && column === 'step_meeting' && typeof row.id === 'string' && row.id) {
    const workshopDescription = typeof row.workshop_description === 'string' ? row.workshop_description : ''
    const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
    const endsAt = typeof row.ends_at === 'string' ? row.ends_at : ''
    return withReturnTo('/manage/class-zoom-meeting', {
      ...(workshopDescription ? { f_workshop_description: workshopDescription } : {}),
      ...(startsAt ? { f_class_starts_at: formatTimestamp(startsAt) } : {}),
      ...(endsAt ? { f_class_ends_at: formatTimestamp(endsAt) } : {}),
    })
  }
  if (tableName === 'class' && column === 'step_registrants' && typeof row.id === 'string' && row.id) {
    const workshopDescription = typeof row.workshop_description === 'string' ? row.workshop_description : ''
    const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
    return withReturnTo('/manage/class-attendance', {
      ...(workshopDescription ? { f_workshop_description: workshopDescription } : {}),
      ...(startsAt ? { f_class_starts_at: formatTimestamp(startsAt) } : {}),
      ...(typeof row.ends_at === 'string' && row.ends_at ? { f_class_ends_at: formatTimestamp(row.ends_at) } : {}),
    })
  }
  if (tableName === 'class' && column === 'step_reminder') {
    const workshopDescription = typeof row.workshop_description === 'string' ? row.workshop_description : ''
    const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
    const endsAt = typeof row.ends_at === 'string' ? row.ends_at : ''
    return withReturnTo('/manage/class-zoom-registrant', {
      ...(workshopDescription ? { f_workshop_description: workshopDescription } : {}),
      ...(startsAt ? { f_class_starts_at: formatTimestamp(startsAt) } : {}),
      ...(endsAt ? { f_class_ends_at: formatTimestamp(endsAt) } : {}),
    })
  }
  if (tableName === 'class' && column === 'step_attendance') {
    const workshopDescription = typeof row.workshop_description === 'string' ? row.workshop_description : ''
    const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
    const endsAt = typeof row.ends_at === 'string' ? row.ends_at : ''
    return withReturnTo('/manage/class-zoom-participant-sync', {
      ...(workshopDescription ? { f_workshop_description: workshopDescription } : {}),
      ...(startsAt ? { f_class_starts_at: formatTimestamp(startsAt) } : {}),
      ...(endsAt ? { f_class_ends_at: formatTimestamp(endsAt) } : {}),
    })
  }
  if (column === 'subject_profile_display' && typeof row.subject_profile_id === 'string') {
    return withReturnTo('/manage/person', { profileId: row.subject_profile_id })
  }
  if (column === 'suspicious_signal' && profileId) {
    return withReturnTo('/manage/person/discrepancies', { profileId })
  }
  if (column === 'guardian_display' && typeof row.guardian_profile_id === 'string') {
    return withReturnTo('/manage/person', { profileId: row.guardian_profile_id })
  }
  if (column === 'child_display' && typeof row.child_profile_id === 'string') {
    return withReturnTo('/manage/person', { profileId: row.child_profile_id })
  }
  if ((tableName === 'profile' || tableName === 'participants') && ['email', 'firstname', 'surname', 'role', 'is_user'].includes(column) && profileId) {
    return withReturnTo('/manage/person', { profileId })
  }

  const userIdColumns: Record<string, string> = {
    user_email: 'user_id',
    assigned_by_email: 'assigned_by',
    recorded_by_email: 'recorded_by',
    decided_by_email: 'decided_by',
    inviter_user_email: 'inviter_user_id',
    invitee_user_email: 'invitee_user_id',
  }
  const userIdColumn = userIdColumns[column]
  if (userIdColumn && typeof row[userIdColumn] === 'string' && row[userIdColumn]) {
    return withReturnTo('/manage/person', { userId: String(row[userIdColumn]) })
  }

  return null
}

type TableDisplayProps = {
  headerActions?: ReactNode
  paginationActions?: ReactNode
  data?: LoaderData
}

type ResizeState = {
  column: string
  startX: number
  startWidth: number
}

const columnWidthStorageKey = (tableName: string) => `manage-table-column-widths:${tableName || 'unknown'}`

const clampColumnWidth = (value: number) => Math.max(MIN_COLUMN_WIDTH, Math.min(MAX_COLUMN_WIDTH, Math.round(value)))
const clampColumnWidthWithMin = (value: number, minWidth: number) => Math.max(minWidth, Math.min(MAX_COLUMN_WIDTH, Math.round(value)))

const estimateHeaderMinWidth = (label: string, numeric: boolean) => {
  const headerEstimate = label.length * ESTIMATED_CHAR_WIDTH_PX + CELL_HORIZONTAL_PADDING_PX + HEADER_CONTROL_ALLOWANCE_PX
  return Math.max(numeric ? DEFAULT_NUMERIC_COLUMN_WIDTH : MIN_COLUMN_WIDTH, Math.round(headerEstimate))
}

const estimateContentWidth = ({
  column,
  label,
  rows,
  tableName,
  numeric,
}: {
  column: string
  label: string
  rows: Record<string, unknown>[]
  tableName: string
  numeric: boolean
}) => {
  let maxLength = Math.max(1, label.length)
  const rowsToMeasure = rows.slice(0, MAX_ROWS_FOR_WIDTH_ESTIMATION)
  for (const row of rowsToMeasure) {
    const cellValueLength = getCellValue(column, row, tableName).length
    if (cellValueLength > maxLength) {
      maxLength = cellValueLength
    }
  }

  const estimatedWidth = maxLength * ESTIMATED_CHAR_WIDTH_PX + CELL_HORIZONTAL_PADDING_PX + HEADER_CONTROL_ALLOWANCE_PX
  return Math.max(estimatedWidth, numeric ? DEFAULT_NUMERIC_COLUMN_WIDTH : MIN_COLUMN_WIDTH)
}

const fitWidthsToViewport = ({
  columns,
  widths,
  minWidths,
  viewportWidth,
}: {
  columns: string[]
  widths: Record<string, number>
  minWidths: Record<string, number>
  viewportWidth: number
}) => {
  const minimumTotal = columns.reduce((sum, column) => sum + (minWidths[column] ?? MIN_COLUMN_WIDTH), 0)
  const targetTotal = Math.max(minimumTotal, Math.floor(viewportWidth * TARGET_TABLE_WIDTH_VW_RATIO))
  let totalWidth = columns.reduce((sum, column) => sum + (widths[column] ?? (minWidths[column] ?? MIN_COLUMN_WIDTH)), 0)
  if (totalWidth <= targetTotal) return widths

  let remainingOverflow = totalWidth - targetTotal
  let madeProgress = true
  while (remainingOverflow > 0 && madeProgress) {
    madeProgress = false
    const shrinkableColumns = columns.filter(column => {
      const minWidth = minWidths[column] ?? MIN_COLUMN_WIDTH
      return (widths[column] ?? minWidth) > minWidth
    })
    if (!shrinkableColumns.length) break

    const shrinkPerColumn = Math.max(1, Math.ceil(remainingOverflow / shrinkableColumns.length))
    for (const column of shrinkableColumns) {
      if (remainingOverflow <= 0) break
      const minWidth = minWidths[column] ?? MIN_COLUMN_WIDTH
      const currentWidth = widths[column] ?? minWidth
      const shrinkAmount = Math.min(currentWidth - minWidth, shrinkPerColumn)
      if (shrinkAmount <= 0) continue
      widths[column] = currentWidth - shrinkAmount
      remainingOverflow -= shrinkAmount
      madeProgress = true
    }
  }

  totalWidth = columns.reduce((sum, column) => sum + (widths[column] ?? (minWidths[column] ?? MIN_COLUMN_WIDTH)), 0)
  if (totalWidth <= targetTotal) return widths

  for (const column of [...columns].sort(
    (a, b) =>
      (widths[b] ?? (minWidths[b] ?? MIN_COLUMN_WIDTH)) - (widths[a] ?? (minWidths[a] ?? MIN_COLUMN_WIDTH))
  )) {
    if (totalWidth <= targetTotal) break
    const minWidth = minWidths[column] ?? MIN_COLUMN_WIDTH
    const currentWidth = widths[column] ?? minWidth
    const reducible = currentWidth - minWidth
    if (reducible <= 0) continue
    const reduction = Math.min(reducible, totalWidth - targetTotal)
    widths[column] = currentWidth - reduction
    totalWidth -= reduction
  }

  return widths
}

const buildAutoColumnWidths = ({
  columns,
  rows,
  tableName,
  columnMeta,
  viewportWidth,
}: {
  columns: string[]
  rows: Record<string, unknown>[]
  tableName: string
  columnMeta: LoaderData['columnMeta']
  viewportWidth: number
}) => {
  const perColumnViewportCap = Math.max(MIN_COLUMN_WIDTH, Math.floor(viewportWidth * MAX_COLUMN_WIDTH_VW_RATIO))
  const minWidths = columns.reduce<Record<string, number>>((acc, column) => {
    const label = (columnMeta?.[column]?.label ?? column).replace(/_/g, ' ')
    const numeric = Boolean(columnMeta?.[column]?.numeric)
    const headerMinWidth = estimateHeaderMinWidth(label, numeric)
    const preferredMinWidth = columnMeta?.[column]?.minWidth
    if (typeof preferredMinWidth === 'number' && Number.isFinite(preferredMinWidth)) {
      acc[column] = Math.max(headerMinWidth, Math.round(preferredMinWidth))
      return acc
    }
    acc[column] = headerMinWidth
    return acc
  }, {})

  const widths = columns.reduce<Record<string, number>>((acc, column) => {
    const label = (columnMeta?.[column]?.label ?? column).replace(/_/g, ' ')
    const minWidth = minWidths[column] ?? MIN_COLUMN_WIDTH
    const fitContentOnLoad = Boolean(columnMeta?.[column]?.fitContentOnLoad)
    const estimated = estimateContentWidth({
      column,
      label,
      rows,
      tableName,
      numeric: Boolean(columnMeta?.[column]?.numeric),
    })
    const preferredWidth = columnMeta?.[column]?.preferredWidth
    const targetWidth =
      !fitContentOnLoad && typeof preferredWidth === 'number' && Number.isFinite(preferredWidth)
        ? Math.round(preferredWidth)
        : estimated
    const cappedWidth = Math.min(clampColumnWidthWithMin(targetWidth, minWidth), Math.max(perColumnViewportCap, minWidth))
    acc[column] = Math.max(minWidth, cappedWidth)
    return acc
  }, {})

  return {
    widths: fitWidthsToViewport({ columns, widths, minWidths, viewportWidth }),
    minWidths,
  }
}

export default function TableDisplay({ headerActions, paginationActions, data }: TableDisplayProps = {}) {
  const routeData = useLoaderData() as LoaderData | undefined
  const source = data ?? routeData
  const {
    columns = [],
    rows = [],
    label = 'Table',
    tableName = '',
    tableVariant = 'default',
    enableCellClickFilter = true,
    columnMeta = {},
    canEditStatus,
    editorConfig,
    foreignKeyOptions = {},
  } = source ?? ({} as LoaderData)
  const location = useLocation()

  const statusFetcher = useFetcher()
  const editorFetcher = useFetcher<{ error?: string; success?: boolean }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortStage, setSortStage] = useState<0 | 1 | 2>(0)
  const [filters, setFilters] = useState<Record<string, string[]>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null)
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({})
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createValues, setCreateValues] = useState<Record<string, string>>({})
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [enrichmentByProfileId, setEnrichmentByProfileId] = useState<Record<string, WorkshopEnrollmentEnrichment>>({})
  const [districtCountsByRiding, setDistrictCountsByRiding] = useState<Record<string, FederalDistrictCounts>>({})
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [columnMinWidths, setColumnMinWidths] = useState<Record<string, number>>({})
  const [resizeState, setResizeState] = useState<ResizeState | null>(null)
  const [pinnedHoverCardCellId, setPinnedHoverCardCellId] = useState<string | null>(null)
  const [hoveredHoverCardCellId, setHoveredHoverCardCellId] = useState<string | null>(null)
  const [activeHoverCard, setActiveHoverCard] = useState<{
    cellId: string
    data: Exclude<ReturnType<typeof hoverCardDataForCell>, null>
  } | null>(null)
  const [hoverCardPosition, setHoverCardPosition] = useState<{ top: number; left: number } | null>(null)
  const loadingEnrichmentProfileIdsRef = useRef<Set<string>>(new Set())
  const loadingDistrictRidingsRef = useRef<Set<string>>(new Set())
  const filterButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const filterPopoverRef = useRef<HTMLDivElement | null>(null)
  const hoverCardPopoverRef = useRef<HTMLDivElement | null>(null)
  const hoverCardTriggerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const filterCacheRef = useRef<Map<string, FilterOptionsCacheEntry>>(new Map())
  const filterCacheLruRef = useRef<string[]>([])
  const filterActiveRequestRef = useRef<Map<string, number>>(new Map())
  const filterRequestCounterRef = useRef(0)
  const openFilterCacheKeyRef = useRef<string | null>(null)
  const [openFilterCacheEntry, setOpenFilterCacheEntry] = useState<FilterOptionsCacheEntry | null>(null)
  const [attendanceJoinUrlOverrides, setAttendanceJoinUrlOverrides] = useState<Record<string, string>>({})
  const [attendanceRegisterFeedback, setAttendanceRegisterFeedback] = useState<
    Record<string, { type: 'success' | 'error'; message: string }>
  >({})
  const isWorkshopEnrollmentTable = tableName === 'class-enrollment'
  const isFederalDistrictTable = tableName === 'federal-electoral-district'
  const debugPerf = searchParams.get('debugPerf') === '1'
  const timezoneOptions = useMemo(() => {
    const supported =
      typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('timeZone')
        : ([] as string[])
    const merged = new Set<string>([...supported, ...FALLBACK_TIMEZONES])
    return Array.from(merged)
      .sort((left, right) => left.localeCompare(right))
      .map(value => ({
        value,
        label: value,
        keywords: [value, value.replaceAll('_', ' '), value.replaceAll('/', ' ')],
      }))
  }, [])

  const rowsWithEnrichment = useMemo(() => {
    return rows.map(row => {
      let nextRow = row

      if (isWorkshopEnrollmentTable) {
        const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
        const enrichment = profileId ? enrichmentByProfileId[profileId] : null
        if (enrichment) {
          nextRow = { ...nextRow, ...enrichment }
        }
      }

      if (isFederalDistrictTable) {
        const ridingName = typeof row.name === 'string' ? row.name.trim() : ''
        const counts = ridingName ? districtCountsByRiding[ridingName] : null
        if (counts) {
          nextRow = { ...nextRow, ...counts }
        } else {
          nextRow = {
            ...nextRow,
            total: '...',
            accepted: '...',
            pending: '...',
            waitlisted: '...',
            declined: '...',
          }
        }
      }

      return nextRow
    })
  }, [districtCountsByRiding, enrichmentByProfileId, isFederalDistrictTable, isWorkshopEnrollmentTable, rows])

  useEffect(() => {
    const nextSort = searchParams.get('sort')
    const nextDir = searchParams.get('dir')
    const nextFilters = columns.reduce<Record<string, string[]>>((acc, column) => {
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
    const nextPageRaw = Number(searchParams.get('page') ?? '1')
    const nextPage = Number.isFinite(nextPageRaw) && nextPageRaw > 0 ? Math.floor(nextPageRaw) : 1
    const nextPageSizeRaw = Number(searchParams.get('pageSize') ?? '50')
    const nextPageSize = PAGE_SIZE_OPTIONS.includes(nextPageSizeRaw as (typeof PAGE_SIZE_OPTIONS)[number])
      ? nextPageSizeRaw
      : 50

    setSortColumn(nextSort)
    setSortStage(nextSort ? (nextDir === 'asc' ? 2 : 1) : 0)
    setFilters(nextFilters)
    setPage(nextPage)
    setPageSize(nextPageSize)
  }, [searchParams, columns])

  useEffect(() => {
    return () => {
      filterActiveRequestRef.current.clear()
      filterCacheRef.current.clear()
      filterCacheLruRef.current = []
    }
  }, [])

  useEffect(() => {
    if (!editorFetcher.data?.success) return
    setShowCreate(false)
    setCreateValues({})
    setEditingRowKey(null)
    setEditValues({})
  }, [editorFetcher.data])

  useEffect(() => {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
    const { widths: nextWidths, minWidths } = buildAutoColumnWidths({
      columns,
      rows,
      tableName,
      columnMeta,
      viewportWidth,
    })

    if (ENABLE_PERSISTED_COLUMN_WIDTHS && typeof window !== 'undefined') {
      try {
        const parsed = JSON.parse(window.localStorage.getItem(columnWidthStorageKey(tableName)) ?? '{}')
        if (parsed && typeof parsed === 'object') {
          for (const column of columns) {
            const value = (parsed as Record<string, unknown>)[column]
            if (typeof value === 'number' && Number.isFinite(value)) {
              const minWidth = minWidths[column] ?? MIN_COLUMN_WIDTH
              nextWidths[column] = Math.max(minWidth, clampColumnWidthWithMin(value, minWidth))
            }
          }
        }
      } catch {
        window.localStorage.removeItem(columnWidthStorageKey(tableName))
      }
    }

    setColumnMinWidths(minWidths)
    setColumnWidths(nextWidths)
  }, [columns, columnMeta, rows, tableName])

  useEffect(() => {
    if (!ENABLE_PERSISTED_COLUMN_WIDTHS || !tableName || !Object.keys(columnWidths).length || typeof window === 'undefined') return
    window.localStorage.setItem(columnWidthStorageKey(tableName), JSON.stringify(columnWidths))
  }, [columnWidths, tableName])

  useEffect(() => {
    const fitColumns = columns.filter(column => Boolean(columnMeta[column]?.fitContentOnLoad))
    if (!fitColumns.length) return
    if (!Object.keys(columnWidths).length) return

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440
    const perColumnViewportCap = Math.max(MIN_COLUMN_WIDTH, Math.floor(viewportWidth * MAX_COLUMN_WIDTH_VW_RATIO))

    setColumnWidths(prev => {
      let changed = false
      const next = { ...prev }

      for (const column of fitColumns) {
        const label = (columnMeta[column]?.label ?? column).replace(/_/g, ' ')
        const minWidth = columnMinWidths[column] ?? estimateHeaderMinWidth(label, Boolean(columnMeta[column]?.numeric))
        const estimated = estimateContentWidth({
          column,
          label,
          rows: rowsWithEnrichment,
          tableName,
          numeric: Boolean(columnMeta[column]?.numeric),
        })
        const cappedWidth = Math.min(
          clampColumnWidthWithMin(estimated, minWidth),
          Math.max(perColumnViewportCap, minWidth)
        )
        const currentWidth = next[column] ?? minWidth
        if (cappedWidth > currentWidth) {
          next[column] = cappedWidth
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [columnMeta, columnMinWidths, columnWidths, columns, rowsWithEnrichment, tableName])

  useEffect(() => {
    if (!resizeState) return

    const onMouseMove = (event: MouseEvent) => {
      const deltaX = event.clientX - resizeState.startX
      const minWidth = columnMinWidths[resizeState.column] ?? MIN_COLUMN_WIDTH
      const nextWidth = Math.max(minWidth, clampColumnWidthWithMin(resizeState.startWidth + deltaX, minWidth))
      setColumnWidths(prev => ({ ...prev, [resizeState.column]: nextWidth }))
    }

    const onMouseUp = () => setResizeState(null)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [columnMinWidths, resizeState])

  useEffect(() => {
    if (!pinnedHoverCardCellId) return

    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      const hovercardRoot = target?.closest('[data-hovercard-cell-id]') as HTMLElement | null
      if (hovercardRoot?.dataset.hovercardCellId === pinnedHoverCardCellId) return
      if (hoverCardPopoverRef.current?.contains(target as Node)) return
      setPinnedHoverCardCellId(null)
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinnedHoverCardCellId(null)
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [pinnedHoverCardCellId])

  const visibleHoverCardCellId = pinnedHoverCardCellId ?? hoveredHoverCardCellId

  const updateHoverCardPosition = () => {
    if (!visibleHoverCardCellId) {
      setHoverCardPosition(null)
      return
    }

    const triggerElement = hoverCardTriggerRefs.current[visibleHoverCardCellId]
    if (!triggerElement) {
      setHoverCardPosition(null)
      return
    }

    const rect = triggerElement.getBoundingClientRect()
    const popoverHeight = hoverCardPopoverRef.current?.offsetHeight ?? HOVER_CARD_ESTIMATED_HEIGHT_PX

    const left = Math.max(
      HOVER_CARD_MARGIN_PX,
      Math.min(rect.left, window.innerWidth - HOVER_CARD_WIDTH_PX - HOVER_CARD_MARGIN_PX)
    )

    let top = rect.bottom + HOVER_CARD_OFFSET_PX
    if (top + popoverHeight > window.innerHeight - HOVER_CARD_MARGIN_PX) {
      top = rect.top - popoverHeight - HOVER_CARD_OFFSET_PX
    }
    if (top < HOVER_CARD_MARGIN_PX) {
      top = HOVER_CARD_MARGIN_PX
    }

    setHoverCardPosition({ top, left })
  }

  useEffect(() => {
    if (!visibleHoverCardCellId) {
      setHoverCardPosition(null)
      return
    }

    updateHoverCardPosition()

    const onWindowChange = () => updateHoverCardPosition()
    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)

    return () => {
      window.removeEventListener('resize', onWindowChange)
      window.removeEventListener('scroll', onWindowChange, true)
    }
  }, [visibleHoverCardCellId])

  useEffect(() => {
    if (!visibleHoverCardCellId) return
    updateHoverCardPosition()
  }, [activeHoverCard, visibleHoverCardCellId])

  const syncSearch = (
    nextFilters: Record<string, string[]>,
    nextSortColumn: string | null,
    nextSortStage: 0 | 1 | 2,
    nextPage: number,
    nextPageSize: number
  ) => {
    const next = new URLSearchParams()
    if (nextSortColumn && nextSortStage > 0) {
      next.set('sort', nextSortColumn)
      next.set('dir', nextSortStage === 2 ? 'asc' : 'desc')
    }
    for (const column of columns) {
      if (!hasOwn(nextFilters, column)) continue
      const values = nextFilters[column] ?? []
      if (!values.length) {
        next.append(`f_${column}`, FILTER_EMPTY_TOKEN)
        continue
      }
      for (const value of values) {
        next.append(`f_${column}`, value)
      }
    }
    if (nextPage > 1) {
      next.set('page', String(nextPage))
    }
    if (nextPageSize !== 50) {
      next.set('pageSize', String(nextPageSize))
    }
    setSearchParams(next, { replace: true })
  }

  const rowMatchesFilters = (
    row: Record<string, unknown>,
    nextFilters: Record<string, string[]>,
    excludedColumn?: string
  ) =>
    columns.every(column => {
      if (column === excludedColumn) return true
      if (!hasOwn(nextFilters, column)) return true
      const selectedValues = nextFilters[column] ?? []
      if (!selectedValues.length) return false
      const cellValue = getCellValue(column, row, tableName)
      return selectedValues.includes(cellValue)
    })

  const filterDataRevision = useMemo(
    () =>
      [
        rowsWithEnrichment.length,
        Object.keys(enrichmentByProfileId).length,
        Object.keys(districtCountsByRiding).length,
      ].join(':'),
    [districtCountsByRiding, enrichmentByProfileId, rowsWithEnrichment.length]
  )

  const openFilterCacheKey = useMemo(() => {
    if (!openFilterColumn) return null
    return [
      tableName || 'unknown',
      openFilterColumn,
      filterDataRevision,
      filterKeySignature(filters, openFilterColumn),
    ].join('::')
  }, [filterDataRevision, filters, openFilterColumn, tableName])

  useEffect(() => {
    openFilterCacheKeyRef.current = openFilterCacheKey
  }, [openFilterCacheKey])

  const touchFilterCacheKey = (key: string) => {
    const nextLru = filterCacheLruRef.current.filter(item => item !== key)
    nextLru.unshift(key)
    filterCacheLruRef.current = nextLru
  }

  const writeFilterCache = (key: string, value: FilterOptionsCacheEntry) => {
    filterCacheRef.current.set(key, value)
    touchFilterCacheKey(key)
    while (filterCacheLruRef.current.length > FILTER_CACHE_MAX_ENTRIES) {
      const evicted = filterCacheLruRef.current.pop()
      if (!evicted) break
      filterCacheRef.current.delete(evicted)
      filterActiveRequestRef.current.delete(evicted)
    }
  }

  const readFilterCache = (key: string) => {
    const cached = filterCacheRef.current.get(key)
    if (!cached) return null
    if (Date.now() - cached.updatedAt > FILTER_CACHE_TTL_MS) {
      filterCacheRef.current.delete(key)
      filterCacheLruRef.current = filterCacheLruRef.current.filter(item => item !== key)
      filterActiveRequestRef.current.delete(key)
      return null
    }
    touchFilterCacheKey(key)
    return cached
  }

  const computeAllOptionsForColumn = (column: string, nextFilters: Record<string, string[]>) => {
    const nextOptions = new Set<string>()
    for (const row of rowsWithEnrichment) {
      if (!rowMatchesFilters(row, nextFilters, column)) continue
      nextOptions.add(getCellValue(column, row, tableName))
    }
    return sortFilterOptions(Array.from(nextOptions))
  }

  useEffect(() => {
    if (!openFilterColumn || !openFilterCacheKey) {
      setOpenFilterCacheEntry(null)
      return
    }

    const cached = readFilterCache(openFilterCacheKey)
    if (cached) {
      setOpenFilterCacheEntry(cached)
      return
    }

    const requestId = filterRequestCounterRef.current + 1
    filterRequestCounterRef.current = requestId
    filterActiveRequestRef.current.set(openFilterCacheKey, requestId)

    const loadingEntry: FilterOptionsCacheEntry = {
      status: 'loading',
      allOptions: [],
      totalCount: 0,
      updatedAt: Date.now(),
    }
    setOpenFilterCacheEntry(loadingEntry)

    void (async () => {
      const activeRequestId = filterActiveRequestRef.current.get(openFilterCacheKey)
      if (activeRequestId !== requestId) return

      let mergedEnrichmentByProfileId = enrichmentByProfileId
      if (
        isWorkshopEnrollmentTable &&
        (WORKSHOP_ENRICHMENT_COLUMNS.has(openFilterColumn) || FAMILY_CONTEXT_COLUMNS.has(openFilterColumn))
      ) {
        const allProfileIds = Array.from(
          new Set(
            rows
              .map(row => (typeof row.profile_id === 'string' ? row.profile_id : ''))
              .filter(profileId => Boolean(profileId) && !mergedEnrichmentByProfileId[profileId])
          )
        )

        if (allProfileIds.length) {
          const fetchedByProfileId: Record<string, WorkshopEnrollmentEnrichment> = {}
          for (let i = 0; i < allProfileIds.length; i += 40) {
            const requestProfileIds = allProfileIds.slice(i, i + 40)
            const query = new URLSearchParams()
            requestProfileIds.forEach(profileId => query.append('profileId', profileId))

            const [workshopPayload, familyPayload] = await Promise.all([
              WORKSHOP_ENRICHMENT_COLUMNS.has(openFilterColumn)
                ? fetch(`/manage/workshop-enrollment/enrichment?${query.toString()}`)
                    .then(async response =>
                      response.ok
                        ? ((await response.json()) as WorkshopEnrollmentEnrichmentResponse)
                        : ({ byProfileId: {} } as WorkshopEnrollmentEnrichmentResponse)
                    )
                : Promise.resolve({ byProfileId: {} } as WorkshopEnrollmentEnrichmentResponse),
              FAMILY_CONTEXT_COLUMNS.has(openFilterColumn)
                ? fetch(`/manage/family-context/enrichment?${query.toString()}`)
                    .then(async response =>
                      response.ok
                        ? ((await response.json()) as FamilyContextEnrichmentResponse)
                        : ({ byProfileId: {} } as FamilyContextEnrichmentResponse)
                    )
                : Promise.resolve({ byProfileId: {} } as FamilyContextEnrichmentResponse),
            ])

            const fallbackEnrichment: WorkshopEnrollmentEnrichment = {
              riding_display: 'Not looked up',
              geo_locations_display: 'N/A',
              giftcard_display: 'N/A',
              prior_participation_display: 'N/A',
              profile_hover_top_discrepancy: '',
              profile_hover_more_discrepancies: '',
              profile_hover_name: '',
              profile_hover_parent_name: '',
              profile_hover_email: '',
              profile_hover_student_phone: '',
              profile_hover_parent_email: '',
              profile_hover_parent_phone: '',
              profile_hover_student_geo: '',
              profile_hover_parent_geo: '',
              profile_hover_student_submitted_address: '',
              profile_hover_parent_address: '',
            }

            requestProfileIds.forEach(profileId => {
              fetchedByProfileId[profileId] = {
                ...fallbackEnrichment,
                ...(workshopPayload?.byProfileId?.[profileId] ?? {}),
                ...(familyPayload?.byProfileId?.[profileId] ?? {}),
              }
            })

            const activeDuringFetch = filterActiveRequestRef.current.get(openFilterCacheKey)
            if (activeDuringFetch !== requestId) return
          }

          mergedEnrichmentByProfileId = {
            ...mergedEnrichmentByProfileId,
            ...fetchedByProfileId,
          }
          setEnrichmentByProfileId(prev => ({
            ...prev,
            ...fetchedByProfileId,
          }))
        }
      }

      const rowsWithFullEnrichment = rows.map(row => {
        if (!isWorkshopEnrollmentTable) return row
        const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
        if (!profileId) return row
        const enrichment = mergedEnrichmentByProfileId[profileId]
        return enrichment ? { ...row, ...enrichment } : row
      })

      const candidateRows = rowsWithFullEnrichment.filter(row => rowMatchesFilters(row, filters, openFilterColumn))
      const unique = new Set<string>()
      let index = 0

      const processChunk = () => {
        const activeChunkRequestId = filterActiveRequestRef.current.get(openFilterCacheKey)
        if (activeChunkRequestId !== requestId) return

        const end = Math.min(index + FILTER_LOAD_CHUNK_SIZE, candidateRows.length)
        for (; index < end; index += 1) {
          unique.add(getCellValue(openFilterColumn, candidateRows[index], tableName))
        }

        if (index < candidateRows.length) {
          window.setTimeout(processChunk, 0)
          return
        }

        const allOptions = sortFilterOptions(Array.from(unique))
        const loadedEntry: FilterOptionsCacheEntry = {
          status: 'loaded',
          allOptions,
          totalCount: allOptions.length,
          updatedAt: Date.now(),
        }
        writeFilterCache(openFilterCacheKey, loadedEntry)
        if (openFilterCacheKeyRef.current === openFilterCacheKey) {
          setOpenFilterCacheEntry(loadedEntry)
        }
        filterActiveRequestRef.current.delete(openFilterCacheKey)
      }

      processChunk()
    })()

    return () => {
      const activeRequestId = filterActiveRequestRef.current.get(openFilterCacheKey)
      if (activeRequestId === requestId) {
        filterActiveRequestRef.current.delete(openFilterCacheKey)
      }
    }
  }, [filters, openFilterCacheKey, openFilterColumn, rowsWithEnrichment, tableName])

  const derivedRows = useMemo(() => {
    let adjustedRows = rowsWithEnrichment.filter(row => rowMatchesFilters(row, filters))
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
  }, [rowsWithEnrichment, columns, filters, sortColumn, sortStage, tableName])

  const totalRows = derivedRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const effectivePage = Math.min(page, totalPages)
  const hasActiveEnrichmentBackedFilters = useMemo(
    () => Object.keys(filters).some(column => WORKSHOP_FILTER_ENRICHMENT_COLUMNS.has(column)),
    [filters]
  )
  const hasActiveFamilyContextFilters = useMemo(
    () => Object.keys(filters).some(column => FAMILY_CONTEXT_COLUMNS.has(column)),
    [filters]
  )
  const baseFiltersForEnrichmentFetch = useMemo(() => {
    const next: Record<string, string[]> = {}
    for (const [column, values] of Object.entries(filters)) {
      if (WORKSHOP_FILTER_ENRICHMENT_COLUMNS.has(column)) continue
      next[column] = values
    }
    return next
  }, [filters])

  useEffect(() => {
    if (effectivePage === page) return
    setPage(effectivePage)
    syncSearch(filters, sortColumn, sortStage, effectivePage, pageSize)
  }, [effectivePage, page, filters, sortColumn, sortStage, pageSize])

  const paginatedRows = useMemo(() => {
    const start = (effectivePage - 1) * pageSize
    return derivedRows.slice(start, start + pageSize)
  }, [derivedRows, effectivePage, pageSize])

  useEffect(() => {
    if (!isWorkshopEnrollmentTable) return

    const shouldLoadWorkshopValues = columns.some(column => WORKSHOP_ENRICHMENT_COLUMNS.has(column))
    const shouldLoadFamilyContext =
      hasActiveFamilyContextFilters || Boolean(openFilterColumn && FAMILY_CONTEXT_COLUMNS.has(openFilterColumn))

    if (!shouldLoadWorkshopValues && !shouldLoadFamilyContext) return

    const enrichmentSeedRows = hasActiveEnrichmentBackedFilters
      ? rows.filter(row => rowMatchesFilters(row, baseFiltersForEnrichmentFetch))
      : paginatedRows

    const missingProfileIds = Array.from(
      new Set(
        enrichmentSeedRows
          .map(row => (typeof row.profile_id === 'string' ? row.profile_id : ''))
          .filter(profileId =>
            Boolean(profileId) &&
            !enrichmentByProfileId[profileId] &&
            !loadingEnrichmentProfileIdsRef.current.has(profileId)
          )
      )
    )

    if (!missingProfileIds.length) return

    const requestBatchSize = hasActiveEnrichmentBackedFilters
      ? WORKSHOP_ENRICHMENT_FILTER_BOOTSTRAP_BATCH_SIZE
      : WORKSHOP_ENRICHMENT_BATCH_SIZE
    const requestProfileIds = missingProfileIds.slice(0, requestBatchSize)
    requestProfileIds.forEach(profileId => loadingEnrichmentProfileIdsRef.current.add(profileId))

    const abortController = new AbortController()
    void (async () => {
      const startedAt = Date.now()
      try {
        const searchParams = new URLSearchParams()
        requestProfileIds.forEach(profileId => searchParams.append('profileId', profileId))
        const [payload, familyPayload] = await Promise.all([
          shouldLoadWorkshopValues
            ? fetch(`/manage/workshop-enrollment/enrichment?${searchParams.toString()}`, {
                signal: abortController.signal,
              }).then(async response =>
                response.ok
                  ? ((await response.json()) as WorkshopEnrollmentEnrichmentResponse)
                  : ({ byProfileId: {} } as WorkshopEnrollmentEnrichmentResponse)
              )
            : Promise.resolve({ byProfileId: {} } as WorkshopEnrollmentEnrichmentResponse),
          shouldLoadFamilyContext
            ? fetch(`/manage/family-context/enrichment?${searchParams.toString()}`, {
                signal: abortController.signal,
              }).then(async response =>
                response.ok
                  ? ((await response.json()) as FamilyContextEnrichmentResponse)
                  : ({ byProfileId: {} } as FamilyContextEnrichmentResponse)
              )
            : Promise.resolve({ byProfileId: {} } as FamilyContextEnrichmentResponse),
        ])
        const fallbackEnrichment: WorkshopEnrollmentEnrichment = {
          riding_display: 'Not looked up',
          geo_locations_display: 'N/A',
          giftcard_display: 'N/A',
          prior_participation_display: 'N/A',
          profile_hover_top_discrepancy: '',
          profile_hover_more_discrepancies: '',
          profile_hover_name: '',
          profile_hover_parent_name: '',
          profile_hover_email: '',
          profile_hover_student_phone: '',
          profile_hover_parent_email: '',
          profile_hover_parent_phone: '',
          profile_hover_student_geo: '',
          profile_hover_parent_geo: '',
          profile_hover_student_submitted_address: '',
          profile_hover_parent_address: '',
        }

        const resolvedByProfileId = requestProfileIds.reduce<Record<string, WorkshopEnrollmentEnrichment>>(
          (acc, profileId) => {
            acc[profileId] = {
              ...fallbackEnrichment,
              ...(payload?.byProfileId?.[profileId] ?? {}),
              ...(familyPayload?.byProfileId?.[profileId] ?? {}),
            }
            return acc
          },
          {}
        )

        setEnrichmentByProfileId(prev => ({
          ...prev,
          ...resolvedByProfileId,
        }))
        if (debugPerf) {
          console.info('[table-display] workshop row enrichment loaded', {
            requestedProfiles: requestProfileIds.length,
            workshopValues: shouldLoadWorkshopValues,
            familyContext: shouldLoadFamilyContext,
            ms: Date.now() - startedAt,
          })
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('[table display] enrichment fetch failed', error)
        }
      } finally {
        requestProfileIds.forEach(profileId => loadingEnrichmentProfileIdsRef.current.delete(profileId))
      }
    })()

    return () => {
      abortController.abort()
    }
  }, [
    baseFiltersForEnrichmentFetch,
    columns,
    enrichmentByProfileId,
    hasActiveFamilyContextFilters,
    hasActiveEnrichmentBackedFilters,
    isWorkshopEnrollmentTable,
    openFilterColumn,
    paginatedRows,
    rows,
  ])

  useEffect(() => {
    if (!isFederalDistrictTable) return

    const missingRidings = Array.from(
      new Set(
        paginatedRows
          .map(row => (typeof row.name === 'string' ? row.name.trim() : ''))
          .filter(
            riding =>
              Boolean(riding) &&
              !districtCountsByRiding[riding] &&
              !loadingDistrictRidingsRef.current.has(riding)
          )
      )
    )

    if (!missingRidings.length) return

    const requestRidings = missingRidings.slice(0, 30)
    requestRidings.forEach(riding => loadingDistrictRidingsRef.current.add(riding))

    const abortController = new AbortController()
    void (async () => {
      try {
        const query = new URLSearchParams()
        requestRidings.forEach(riding => query.append('riding', riding))
        const response = await fetch(`/manage/federal-electoral-district/enrichment?${query.toString()}`, {
          signal: abortController.signal,
        })

        if (!response.ok) return
        const payload = (await response.json()) as FederalDistrictEnrichmentResponse
        const resolved = requestRidings.reduce<Record<string, FederalDistrictCounts>>((acc, riding) => {
          acc[riding] = payload?.byRiding?.[riding] ?? {
            total: 0,
            accepted: 0,
            pending: 0,
            waitlisted: 0,
            declined: 0,
          }
          return acc
        }, {})

        setDistrictCountsByRiding(prev => ({ ...prev, ...resolved }))
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          console.error('[table display] federal district enrichment fetch failed', error)
        }
      } finally {
        requestRidings.forEach(riding => loadingDistrictRidingsRef.current.delete(riding))
      }
    })()

    return () => {
      abortController.abort()
    }
  }, [districtCountsByRiding, isFederalDistrictTable, paginatedRows])

  const updateSort = (column: string) => {
    if (sortColumn !== column) {
      const nextStage: 0 | 1 | 2 = 1
      setSortColumn(column)
      setSortStage(nextStage)
      setPage(1)
      syncSearch(filters, column, nextStage, 1, pageSize)
      return
    }
    setSortStage(prev => {
      const next = prev + 1
      if (next > 2) {
        setSortColumn(null)
        setPage(1)
        syncSearch(filters, null, 0, 1, pageSize)
        return 0
      }
      setPage(1)
      syncSearch(filters, column, next as 0 | 1 | 2, 1, pageSize)
      return next as 0 | 1 | 2
    })
  }

  const updateFilterValues = (
    column: string,
    values: string[],
    allOptionsForColumn: string[],
    emptyBehavior: 'none' | 'all' = 'none'
  ) => {
    setFilters(prev => {
      const next = { ...prev }
      const normalized = normalizeFilterValues(values)
      const isAllSelected = allOptionsForColumn.length > 0 && normalized.length === allOptionsForColumn.length

      if (!normalized.length) {
        if (emptyBehavior === 'all') {
          delete next[column]
        } else {
          next[column] = []
        }
      } else if (isAllSelected) {
        delete next[column]
      } else {
        next[column] = normalized
      }
      setPage(1)
      syncSearch(next, sortColumn, sortStage, 1, pageSize)
      return next
    })
  }

  const appendFilter = (column: string, value: string) => {
    const current = filters[column] ?? []
    if (current.includes(value)) return
    const allOptionsForColumn = computeAllOptionsForColumn(column, filters)
    updateFilterValues(column, [...current, value], allOptionsForColumn)
  }

  const setPageAndSync = (nextPage: number, nextPageSize = pageSize) => {
    const boundedPage = Math.max(1, nextPage)
    setPage(boundedPage)
    if (nextPageSize !== pageSize) {
      setPageSize(nextPageSize)
    }
    syncSearch(filters, sortColumn, sortStage, boundedPage, nextPageSize)
  }

  const requestFamilyContextForProfile = (profileId: string) => {
    if (!isWorkshopEnrollmentTable || !profileId) return
    const existing = enrichmentByProfileId[profileId]
    if (hasHydratedFamilyContext(existing) || loadingEnrichmentProfileIdsRef.current.has(profileId)) return

    loadingEnrichmentProfileIdsRef.current.add(profileId)
    void (async () => {
      const startedAt = Date.now()
      try {
        const query = new URLSearchParams()
        query.append('profileId', profileId)
        const response = await fetch(`/manage/family-context/enrichment?${query.toString()}`)
        if (!response.ok) return
        const payload = (await response.json()) as FamilyContextEnrichmentResponse
        const resolved = payload?.byProfileId?.[profileId] ?? {
          prior_participation_display: 'N/A',
          profile_hover_top_discrepancy: '',
          profile_hover_more_discrepancies: '',
          profile_hover_name: 'N/A',
          profile_hover_parent_name: 'N/A',
          profile_hover_email: 'N/A',
          profile_hover_student_phone: '',
          profile_hover_parent_email: 'N/A',
          profile_hover_parent_phone: 'N/A',
          profile_hover_student_geo: 'N/A',
          profile_hover_parent_geo: 'N/A',
          profile_hover_student_submitted_address: 'N/A',
          profile_hover_parent_address: 'N/A',
        }

        setEnrichmentByProfileId(prev => ({
          ...prev,
          [profileId]: {
            riding_display: prev[profileId]?.riding_display ?? '',
            geo_locations_display: prev[profileId]?.geo_locations_display ?? 'N/A',
            giftcard_display: prev[profileId]?.giftcard_display ?? 'N/A',
            prior_participation_display: prev[profileId]?.prior_participation_display ?? resolved.prior_participation_display,
            profile_hover_top_discrepancy: resolved.profile_hover_top_discrepancy,
            profile_hover_more_discrepancies: resolved.profile_hover_more_discrepancies,
            profile_hover_name: resolved.profile_hover_name,
            profile_hover_parent_name: resolved.profile_hover_parent_name,
            profile_hover_email: resolved.profile_hover_email,
            profile_hover_student_phone: resolved.profile_hover_student_phone,
            profile_hover_parent_email: resolved.profile_hover_parent_email,
            profile_hover_parent_phone: resolved.profile_hover_parent_phone,
            profile_hover_student_geo: resolved.profile_hover_student_geo,
            profile_hover_parent_geo: resolved.profile_hover_parent_geo,
            profile_hover_student_submitted_address: resolved.profile_hover_student_submitted_address,
            profile_hover_parent_address: resolved.profile_hover_parent_address,
          },
        }))
        if (debugPerf) {
          console.info('[table-display] hover family-context loaded', {
            profileId,
            ms: Date.now() - startedAt,
          })
        }
      } catch (error) {
        console.error('[table display] family-context hover fetch failed', error)
      } finally {
        loadingEnrichmentProfileIdsRef.current.delete(profileId)
      }
    })()
  }

  const effectiveSelectedValuesForColumn = (column: string, allOptionsForColumn: string[]) => {
    if (hasOwn(filters, column)) {
      return filters[column] ?? []
    }
    return allOptionsForColumn
  }

  const isClassAttendance = tableName === 'class-attendance'
  const isWorkshopEnrollment = isWorkshopEnrollmentTable
  const canInlineInsert = Boolean(editorConfig?.allowInsert)
  const canInlineUpdate = Boolean(editorConfig?.allowUpdate)

  useEffect(() => {
    if (!isClassAttendance) return
    const result = statusFetcher.data as RegisterStudentActionResult | undefined
    if (!result || result.intent !== 'register-student') return
    const key = `${result.class_id}::${result.profile_id}`
    if (!key) return

    if (result.ok && typeof result.zoom_join_url === 'string' && result.zoom_join_url) {
      setAttendanceJoinUrlOverrides(prev => ({ ...prev, [key]: result.zoom_join_url as string }))
      setAttendanceRegisterFeedback(prev => ({
        ...prev,
        [key]: { type: 'success', message: result.message ?? 'Zoom join link created.' },
      }))
      return
    }

    setAttendanceRegisterFeedback(prev => ({
      ...prev,
      [key]: { type: 'error', message: result.error ?? result.message ?? 'Register failed.' },
    }))
  }, [isClassAttendance, statusFetcher.data])

  const tableWidth = useMemo(() => {
    const totalColumnWidth = columns.reduce(
      (sum, column) => sum + (columnWidths[column] ?? (columnMeta[column]?.numeric ? DEFAULT_NUMERIC_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH)),
      0
    )
    return totalColumnWidth + (canInlineUpdate ? ACTIONS_COLUMN_WIDTH : 0)
  }, [canInlineUpdate, columnMeta, columnWidths, columns])

  const updateFilterPopoverPosition = () => {
    if (!openFilterColumn) {
      setFilterPopoverPosition(null)
      return
    }

    const button = filterButtonRefs.current[openFilterColumn]
    if (!button) return

    const rect = button.getBoundingClientRect()
    const popoverHeight = filterPopoverRef.current?.offsetHeight ?? FILTER_POPOVER_ESTIMATED_HEIGHT
    let left = rect.right - FILTER_POPOVER_WIDTH
    left = Math.max(
      FILTER_POPOVER_MARGIN,
      Math.min(left, window.innerWidth - FILTER_POPOVER_WIDTH - FILTER_POPOVER_MARGIN)
    )

    let top = rect.bottom + 4
    const estimatedBottom = top + popoverHeight
    if (estimatedBottom > window.innerHeight - FILTER_POPOVER_MARGIN) {
      top = Math.max(FILTER_POPOVER_MARGIN, rect.top - popoverHeight - 4)
    }

    setFilterPopoverPosition({ top, left })
  }

  useEffect(() => {
    if (!openFilterColumn) {
      setFilterPopoverPosition(null)
      return
    }

    updateFilterPopoverPosition()

    const onWindowChange = () => updateFilterPopoverPosition()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenFilterColumn(null)
      }
    }
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      const button = filterButtonRefs.current[openFilterColumn]
      const popover = filterPopoverRef.current
      if (button?.contains(target) || popover?.contains(target)) return
      setOpenFilterColumn(null)
    }

    window.addEventListener('resize', onWindowChange)
    window.addEventListener('scroll', onWindowChange, true)
    window.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)

    return () => {
      window.removeEventListener('resize', onWindowChange)
      window.removeEventListener('scroll', onWindowChange, true)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [openFilterColumn])

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

  const updateAttendancePhotoStatus = (row: Record<string, unknown>, value: string) => {
    if (!isClassAttendance || !canEditStatus) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return
    const formData = new FormData()
    formData.set('intent', 'update-photo-status')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    formData.set('photo_status', value)
    statusFetcher.submit(formData, { method: 'post' })
  }

  const updateAttendanceCameraOn = (row: Record<string, unknown>, value: string) => {
    if (!isClassAttendance || !canEditStatus) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return
    const formData = new FormData()
    formData.set('intent', 'update-camera-on')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    formData.set('camera_on', value)
    statusFetcher.submit(formData, { method: 'post' })
  }

  const registerAttendanceStudent = (row: Record<string, unknown>) => {
    if (!isClassAttendance || !canEditStatus) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return
    const formData = new FormData()
    formData.set('intent', 'register-student')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    statusFetcher.submit(formData, { method: 'post' })
  }

  const deleteAttendanceRow = (row: Record<string, unknown>) => {
    if (!isClassAttendance || !canEditStatus) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return
    const formData = new FormData()
    formData.set('intent', 'delete-attendance-row')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
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
  const isNumericColumn = (column: string) =>
    editorConfig?.fields[column]?.type === 'number' || columnMeta[column]?.numeric === true

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
      const value = createValues[fieldName] ?? ''
      formData.set(`field_${fieldName}`, value)
      if (editorConfig.fields[fieldName]?.type === 'datetime') {
        formData.set(`field_${fieldName}__tz_offset`, value ? getOffsetMinutesForLocalDateTime(value) : '')
      }
    }
    editorFetcher.submit(formData, { method: 'post' })
  }

  const submitUpdate = (row: Record<string, unknown>) => {
    if (!editorConfig) return
    const formData = new FormData()
    formData.set('intent', 'update-row')
    for (const fieldName of fieldKeys) {
      const value = editValues[fieldName] ?? ''
      formData.set(`field_${fieldName}`, value)
      if (editorConfig.fields[fieldName]?.type === 'datetime') {
        formData.set(`field_${fieldName}__tz_offset`, value ? getOffsetMinutesForLocalDateTime(value) : '')
      }
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

    if (field.type === 'timezone') {
      const timezoneFieldOptions = timezoneOptions.some(option => option.value === value)
        ? timezoneOptions
        : value
          ? [
              {
                value,
                label: value,
                keywords: [value, value.replaceAll('_', ' '), value.replaceAll('/', ' ')],
              },
              ...timezoneOptions,
            ]
          : timezoneOptions

      return (
        <label key={fieldName} className="grid gap-1 text-xs">
          <span className="text-muted-foreground">{commonLabel}</span>
          <Combobox
            value={value}
            options={timezoneFieldOptions}
            onChange={nextValue => {
              setValues(prev => ({ ...prev, [fieldName]: nextValue }))
            }}
            placeholder="Select timezone..."
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
            className={FORM_SELECT_CLASS_NAME}
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
            className={FORM_SELECT_CLASS_NAME}
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

  const openFilterOptions = openFilterCacheEntry?.allOptions ?? []
  const openFilterSearchInput = openFilterColumn ? filterSearch[openFilterColumn] ?? '' : ''
  const openFilterSearch = openFilterSearchInput
  const visibleFilterOptions = openFilterOptions.filter(option =>
    displayFilterOption(option).toLowerCase().includes(openFilterSearch.toLowerCase())
  )
  const hasFilterSearchQuery = openFilterSearch.trim().length > 0
  const isOpenFilterLoading = !openFilterCacheEntry || openFilterCacheEntry.status === 'loading' || openFilterCacheEntry.status === 'idle'
  const shouldHideOptionsList =
    (openFilterCacheEntry?.totalCount ?? 0) > FILTER_OPTION_MAX_VISIBLE_LIST && !hasFilterSearchQuery
  const canRenderFilterOptionsList = openFilterCacheEntry?.status === 'loaded' && !shouldHideOptionsList
  const openFilterStatusText = isOpenFilterLoading
    ? 'Loading...'
    : shouldHideOptionsList
      ? 'there are over 1500 unique values, search to narrow'
      : `Showing ${visibleFilterOptions.length} of ${openFilterCacheEntry?.totalCount ?? 0} options`
  const openFilterSelectedValues = openFilterColumn
    ? effectiveSelectedValuesForColumn(openFilterColumn, openFilterOptions)
    : []
  const isOpenFilterApplied = openFilterColumn ? hasOwn(filters, openFilterColumn) : false

  const clearOpenFilter = () => {
    if (!openFilterColumn) return
    setFilters(prev => {
      if (!hasOwn(prev, openFilterColumn)) return prev
      const next = { ...prev }
      delete next[openFilterColumn]
      setPage(1)
      syncSearch(next, sortColumn, sortStage, 1, pageSize)
      return next
    })
  }

  const selectVisibleFilterOptions = () => {
    if (!openFilterColumn) return
    const allOptionsForColumn = openFilterOptions
    const current = effectiveSelectedValuesForColumn(openFilterColumn, allOptionsForColumn)
    const next = normalizeFilterValues([...current, ...visibleFilterOptions])
    updateFilterValues(openFilterColumn, next, allOptionsForColumn)
  }

  const clearVisibleFilterOptions = () => {
    if (!openFilterColumn) return
    if (!canRenderFilterOptionsList) {
      clearOpenFilter()
      return
    }
    const allOptionsForColumn = openFilterOptions
    const current = effectiveSelectedValuesForColumn(openFilterColumn, allOptionsForColumn)
    const visibleSet = new Set(visibleFilterOptions)
    const next = current.filter(value => !visibleSet.has(value))
    updateFilterValues(openFilterColumn, next, allOptionsForColumn)
  }

  return (
    <div className="-mx-6 flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6">
        <div>
          <h1 className="text-2xl font-semibold">{label}</h1>
          <p className="text-sm text-muted-foreground">
            Showing live entries from the {label.toLowerCase()} table ({totalRows} rows).
          </p>
          <p className="text-xs text-muted-foreground">Time values shown in {displayTimeZone}.</p>
        </div>
        {headerActions ? <div className="ml-auto">{headerActions}</div> : null}
      </div>

      {canInlineInsert ? (
        <section className="relative z-30 mx-6 overflow-visible rounded-lg border bg-card p-4">
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

      {editorFetcher.data?.error ? <p className="px-6 text-sm text-destructive">{editorFetcher.data.error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 px-6">
        <p className="text-xs text-muted-foreground">
          Page {effectivePage} of {totalPages}
        </p>
        <div className="flex items-center gap-2 text-xs">
          {paginationActions ? <div className="mr-1">{paginationActions}</div> : null}
          <label className="text-muted-foreground" htmlFor="page-size">
            Rows per page
          </label>
          <select
            id="page-size"
            value={pageSize}
            onChange={event => {
              const nextPageSize = Number(event.target.value)
              if (!PAGE_SIZE_OPTIONS.includes(nextPageSize as (typeof PAGE_SIZE_OPTIONS)[number])) return
              setPageAndSync(1, nextPageSize)
            }}
            className="h-8 rounded border border-input bg-background px-2 pr-8"
          >
            {PAGE_SIZE_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setPageAndSync(effectivePage - 1)}
            disabled={effectivePage <= 1}
            className="rounded border border-input px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <button
            type="button"
            onClick={() => setPageAndSync(effectivePage + 1)}
            disabled={effectivePage >= totalPages}
            className="rounded border border-input px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <div className="min-w-0 overflow-auto border-y max-h-[calc(100svh-17rem)]">
        <table className="w-max table-fixed text-sm" style={{ width: `${tableWidth}px`, minWidth: `${tableWidth}px` }}>
          <colgroup>
            {columns.map(column => (
              <col key={`col-${column}`} style={{ width: `${columnWidths[column] ?? (columnMeta[column]?.numeric ? DEFAULT_NUMERIC_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH)}px` }} />
            ))}
            {canInlineUpdate ? <col key="col-actions" style={{ width: `${ACTIONS_COLUMN_WIDTH}px` }} /> : null}
          </colgroup>
          <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
            <tr>
              {columns.map(column => {
                const hasActiveFilter = hasOwn(filters, column)
                return (
                  <th
                    key={`head-${column}`}
                    className={isNumericColumn(column) ? 'relative w-24 px-4 py-2 text-left' : 'relative px-4 py-2 text-left'}
                  >
                    <div className="relative flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateSort(column)}
                        className="flex min-w-0 flex-1 items-center justify-start gap-1 font-semibold hover:underline hover:underline-offset-4"
                      >
                        <span className="truncate">{(columnMeta[column]?.label ?? column).replace(/_/g, ' ')}</span>
                        {getDirectionIndicator(sortColumn === column ? sortStage : 0)}
                      </button>
                      {columnMeta[column]?.filterable === false ? null : (
                        <button
                          type="button"
                          ref={element => {
                            filterButtonRefs.current[column] = element
                          }}
                          onClick={event => {
                            event.stopPropagation()
                            setOpenFilterColumn(prev => (prev === column ? null : column))
                          }}
                          className={`shrink-0 rounded p-1 hover:bg-muted ${hasActiveFilter ? 'text-foreground' : 'text-muted-foreground'}`}
                          aria-label={`Filter ${column}`}
                        >
                          <Filter className={`size-3.5 ${hasActiveFilter ? 'fill-current' : ''}`} />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Resize ${column}`}
                      className="absolute right-0 top-0 h-full w-2 cursor-col-resize opacity-0 transition-opacity hover:bg-border/80 hover:opacity-100 focus:opacity-100"
                      onMouseDown={event => {
                        event.preventDefault()
                        event.stopPropagation()
                        setResizeState({
                          column,
                          startX: event.clientX,
                          startWidth:
                            columnWidths[column] ??
                            (columnMeta[column]?.numeric ? DEFAULT_NUMERIC_COLUMN_WIDTH : DEFAULT_COLUMN_WIDTH),
                        })
                      }}
                    />
                  </th>
                )
              })}
              {canInlineUpdate ? <th className="px-4 py-2 text-left">actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, rowIndex) => {
              const absoluteRowIndex = (effectivePage - 1) * pageSize + rowIndex
              const rowKey = rowKeyFor(row, editorConfig)
              const isEditing = Boolean(canInlineUpdate && editingRowKey === rowKey)

              return (
                <Fragment key={`fragment-${rowKey || absoluteRowIndex}`}>
                  <tr
                    key={`row-${absoluteRowIndex}`}
                    className={
                      typeof row._row_class === 'string'
                        ? row._row_class
                        : absoluteRowIndex % 2 === 0
                          ? 'bg-card'
                          : ''
                    }
                  >
                    {columns.map(column => {
                      if (isClassAttendance && column === 'student_join_url') {
                        const classId = typeof row.class_id === 'string' ? row.class_id : ''
                        const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
                        const key = attendanceRowKey(row)
                        const fetchedOverride = key ? attendanceJoinUrlOverrides[key] : ''
                        const rowJoinUrl = typeof row.student_join_url === 'string' ? row.student_join_url : ''
                        const effectiveJoinUrl = fetchedOverride || rowJoinUrl
                        const isRegistering =
                          statusFetcher.state === 'submitting' &&
                          statusFetcher.formData?.get('intent') === 'register-student' &&
                          statusFetcher.formData?.get('class_id') === classId &&
                          statusFetcher.formData?.get('profile_id') === profileId
                        const feedback = key ? attendanceRegisterFeedback[key] : null

                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2 font-mono" title={effectiveJoinUrl || '(empty)'}>
                            {effectiveJoinUrl ? (
                              <a
                                href={effectiveJoinUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={event => event.stopPropagation()}
                                className="block max-w-full truncate underline decoration-dotted underline-offset-2 hover:text-primary"
                              >
                                {effectiveJoinUrl}
                              </a>
                            ) : canEditStatus ? (
                              <div className="space-y-1">
                                <button
                                  type="button"
                                  disabled={!classId || !profileId || isRegistering}
                                  onClick={event => {
                                    event.stopPropagation()
                                    if (key) {
                                      setAttendanceRegisterFeedback(prev => {
                                        if (!prev[key]) return prev
                                        const next = { ...prev }
                                        delete next[key]
                                        return next
                                      })
                                    }
                                    registerAttendanceStudent(row)
                                  }}
                                  className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isRegistering ? 'Registering...' : 'Register'}
                                </button>
                                {feedback ? (
                                  <p className={`max-w-64 whitespace-normal text-[11px] ${feedback.type === 'error' ? 'text-destructive' : 'text-emerald-700'}`}>
                                    {feedback.message}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">(empty)</span>
                            )}
                          </td>
                        )
                      }

                      if (isClassAttendance && column === 'status' && canEditStatus) {
                        const statusValue = typeof row.status === 'string' ? row.status : ''
                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="overflow-hidden px-4 py-2 font-mono" title={statusValue || '(empty)'}>
                            <select
                              value={statusValue}
                              onChange={event => updateAttendanceStatus(row, event.target.value)}
                              className={TABLE_SELECT_CLASS_NAME}
                            >
                              <option value="">(none)</option>
                              {Constants.public.Enums.class_attendance_status.map(
                                (status: Database['public']['Enums']['class_attendance_status']) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                )
                              )}
                            </select>
                          </td>
                        )
                      }

                      if (isClassAttendance && column === 'photo_status' && canEditStatus) {
                        const photoStatusValue = typeof row.photo_status === 'string' ? row.photo_status : ''
                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="overflow-hidden px-4 py-2 font-mono" title={photoStatusValue || '(empty)'}>
                            <select
                              value={photoStatusValue}
                              onChange={event => updateAttendancePhotoStatus(row, event.target.value)}
                              className={TABLE_SELECT_CLASS_NAME}
                            >
                              <option value="">(none)</option>
                              {Constants.public.Enums.class_attendance_photo_status.map(
                                (photoStatus: Database['public']['Enums']['class_attendance_photo_status']) => (
                                  <option key={photoStatus} value={photoStatus}>
                                    {photoStatus}
                                  </option>
                                )
                              )}
                            </select>
                          </td>
                        )
                      }

                      if (isClassAttendance && column === 'camera_on' && canEditStatus) {
                        const rawCameraOn = row.camera_on
                        const cameraValue =
                          typeof rawCameraOn === 'boolean'
                            ? String(rawCameraOn)
                            : typeof rawCameraOn === 'string' &&
                                (rawCameraOn === 'true' || rawCameraOn === 'false')
                              ? rawCameraOn
                              : ''

                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="overflow-hidden px-4 py-2 font-mono" title={cameraValue || '(empty)'}>
                            <select
                              value={cameraValue}
                              onChange={event => updateAttendanceCameraOn(row, event.target.value)}
                              className={TABLE_SELECT_CLASS_NAME}
                            >
                              <option value="">(none)</option>
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          </td>
                        )
                      }

                      if (isWorkshopEnrollment && column === 'status' && canEditStatus) {
                        const statusValue = typeof row.status === 'string' ? row.status : ''
                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="overflow-hidden px-4 py-2 font-mono" title={statusValue || '(empty)'}>
                            <select
                              value={statusValue}
                              onChange={event => updateWorkshopEnrollmentStatus(row, event.target.value)}
                              className={TABLE_SELECT_CLASS_NAME}
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

                      if (isClassAttendance && column === 'delete_row' && canEditStatus) {
                        const classId = typeof row.class_id === 'string' ? row.class_id : ''
                        const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
                        const isDeleting =
                          statusFetcher.state === 'submitting' &&
                          statusFetcher.formData?.get('intent') === 'delete-attendance-row' &&
                          statusFetcher.formData?.get('class_id') === classId &&
                          statusFetcher.formData?.get('profile_id') === profileId

                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2" title="Delete attendance row">
                            <button
                              type="button"
                              disabled={!classId || !profileId || isDeleting}
                              onClick={event => {
                                event.stopPropagation()
                                if (!window.confirm('Delete this class attendance row?')) return
                                deleteAttendanceRow(row)
                              }}
                              className="rounded border border-destructive/40 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                          </td>
                        )
                      }

                      if (tableName === 'email-message' && column === 'resend') {
                        const emailMessageId = typeof row.id === 'string' ? row.id : ''
                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2" title="Resend email message">
                            <button
                              type="button"
                              disabled={!emailMessageId || statusFetcher.state === 'submitting'}
                              onClick={event => {
                                event.stopPropagation()
                                if (!emailMessageId) return
                                const formData = new FormData()
                                formData.set('intent', 'resend-email')
                                formData.set('email_message_id', emailMessageId)
                                statusFetcher.submit(formData, { method: 'post' })
                              }}
                              className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Resend
                            </button>
                          </td>
                        )
                      }

                      if (tableName === 'person-form-submissions' && column === 'view_answers') {
                        const formId = typeof row.form_id === 'string' ? row.form_id : ''
                        const submissionId = typeof row.id === 'string' ? row.id : ''
                        const returnTo = `${location.pathname}${location.search}`

                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2" title="View form answers">
                            <Button asChild variant="outline" size="xs">
                              <Link
                                to={{
                                  pathname: `/manage/form/${formId}/answers`,
                                  search: new URLSearchParams({
                                    returnTo,
                                    submissionId,
                                  }).toString(),
                                }}
                                onClick={event => event.stopPropagation()}
                              >
                                View answers
                              </Link>
                            </Button>
                          </td>
                        )
                      }

                      if (tableName === 'class' && column === 'sync_class') {
                        const classId = typeof row.id === 'string' ? row.id : ''
                        const isBusy = statusFetcher.state === 'submitting'
                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2" title="Run full sync for this class">
                            <button
                              type="button"
                              disabled={!classId || isBusy}
                              onClick={event => {
                                event.stopPropagation()
                                if (!classId) return
                                const formData = new FormData()
                                formData.set('intent', 'sync-class')
                                formData.set('class_id', classId)
                                statusFetcher.submit(formData, { method: 'post' })
                              }}
                              className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isBusy ? 'Syncing...' : 'Sync'}
                            </button>
                          </td>
                        )
                      }

                      const isFormNameLink = tableName === 'form' && column === 'name' && typeof row.id === 'string'
                      const isFormAnswersLink = tableName === 'form' && column === 'answers' && typeof row.id === 'string'
                      const personLink = personLinkForCell(tableName, column, row, `${location.pathname}${location.search}`)
                      const rawCellValue = row[column]
                      const externalLink =
                        column.includes('join_url') && typeof rawCellValue === 'string' && isHttpUrl(rawCellValue)
                      const shouldTruncate = columnMeta[column]?.truncate ?? tableVariant !== 'pivot'
                      const filterable = columnMeta[column]?.filterable ?? true
                      const canClickFilter = enableCellClickFilter && filterable
                      const cellValue = getCellValue(column, row, tableName)
                      const rowCellClassByColumn =
                        row._cell_class_by_column && typeof row._cell_class_by_column === 'object' && !Array.isArray(row._cell_class_by_column)
                          ? (row._cell_class_by_column as Record<string, unknown>)
                          : null
                      const extraCellClass =
                        rowCellClassByColumn && typeof rowCellClassByColumn[column] === 'string'
                          ? rowCellClassByColumn[column]
                          : ''
                      const maxChars = columnMeta[column]?.maxChars
                      const displayValue =
                        typeof maxChars === 'number' && maxChars > 0 && cellValue.length > maxChars
                          ? `${cellValue.slice(0, maxChars)}...`
                          : cellValue
                      const hoverCardData = hoverCardDataForCell(row, columnMeta[column]?.hoverCard)
                      const hoverCardCellId = `row-${absoluteRowIndex}-col-${column}`

                      const content = isFormNameLink ? (
                        <Link
                          to={{
                            pathname: `/manage/form/${row.id}`,
                            search: new URLSearchParams({
                              returnTo: `${location.pathname}${location.search}`,
                            }).toString(),
                          }}
                          onClick={event => event.stopPropagation()}
                          className="underline decoration-dotted underline-offset-2 hover:text-primary"
                        >
                          <span className={shouldTruncate ? 'block max-w-full truncate' : 'whitespace-normal break-words'}>
                            {displayValue}
                          </span>
                        </Link>
                      ) : isFormAnswersLink ? (
                        <Link
                          to={{
                            pathname: `/manage/form/${row.id}/answers`,
                            search: new URLSearchParams({
                              returnTo: `${location.pathname}${location.search}`,
                            }).toString(),
                          }}
                          onClick={event => event.stopPropagation()}
                          className="underline decoration-dotted underline-offset-2 hover:text-primary"
                        >
                          <span className={shouldTruncate ? 'block max-w-full truncate' : 'whitespace-normal break-words'}>
                            {displayValue}
                          </span>
                        </Link>
                      ) : personLink ? (
                        <Link
                          to={personLink}
                          onClick={event => event.stopPropagation()}
                          className="underline decoration-dotted underline-offset-2 hover:text-primary"
                        >
                          <span className={shouldTruncate ? 'block max-w-full truncate' : 'whitespace-normal break-words'}>
                            {displayValue}
                          </span>
                        </Link>
                      ) : externalLink ? (
                        <a
                          href={rawCellValue as string}
                          target="_blank"
                          rel="noreferrer"
                          onClick={event => event.stopPropagation()}
                          className="underline decoration-dotted underline-offset-2 hover:text-primary"
                        >
                          <span className={shouldTruncate ? 'block max-w-full truncate' : 'whitespace-normal break-words'}>
                            {displayValue}
                          </span>
                        </a>
                      ) : (
                        <span className={shouldTruncate ? 'block max-w-full truncate' : 'whitespace-normal break-words'}>
                          {displayValue}
                        </span>
                      )

                      return (
                        <td
                          key={`cell-${absoluteRowIndex}-${column}`}
                          title={cellValue || '(empty)'}
                          className={
                            isNumericColumn(column)
                              ? `w-24 whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums select-text ${canClickFilter ? 'cursor-pointer hover:bg-muted/30' : ''} ${extraCellClass}`
                              : `px-4 py-2 font-mono select-text ${canClickFilter ? 'cursor-pointer hover:bg-muted/30' : ''} ${extraCellClass}`
                          }
                          onClick={event => {
                            const interactiveTarget = (event.target as HTMLElement | null)?.closest(
                              'a,button,input,select,textarea,label'
                            )
                            if (interactiveTarget) return

                            const selectedText = typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : ''
                            if (selectedText) return

                            if (hoverCardData) {
                              setActiveHoverCard({ cellId: hoverCardCellId, data: hoverCardData })
                              setHoveredHoverCardCellId(hoverCardCellId)
                              setPinnedHoverCardCellId(prev => (prev === hoverCardCellId ? null : hoverCardCellId))
                              return
                            }

                            if (!canClickFilter) return
                            appendFilter(column, cellValue)
                          }}
                          onMouseEnter={() => {
                            if (!isWorkshopEnrollment || column !== 'profile_display') return
                            const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
                            if (!profileId) return
                            requestFamilyContextForProfile(profileId)
                          }}
                        >
                          {hoverCardData ? (
                            <div
                              ref={element => {
                                hoverCardTriggerRefs.current[hoverCardCellId] = element
                              }}
                              className="inline-block max-w-full"
                              data-hovercard-cell-id={hoverCardCellId}
                              onMouseEnter={() => {
                                if (pinnedHoverCardCellId && pinnedHoverCardCellId !== hoverCardCellId) return
                                setHoveredHoverCardCellId(hoverCardCellId)
                                setActiveHoverCard({ cellId: hoverCardCellId, data: hoverCardData })
                              }}
                              onMouseLeave={() => {
                                if (pinnedHoverCardCellId === hoverCardCellId) return
                                setHoveredHoverCardCellId(prev => (prev === hoverCardCellId ? null : prev))
                              }}
                            >
                              {content}
                            </div>
                          ) : (
                            content
                          )}
                        </td>
                      )
                    })}
                    {canInlineUpdate ? (
                      <td className="px-4 py-2" title={isEditing ? 'Cancel editing row' : 'Edit row'}>
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
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => submitUpdate(row)}
                              disabled={editorFetcher.state === 'submitting'}
                              className="rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                            >
                              {editorFetcher.state === 'submitting' ? 'Saving...' : 'Save changes'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingRowKey(null)
                                setEditValues({})
                              }}
                              className="rounded border border-input px-3 py-2 text-xs"
                            >
                              Cancel
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

      {visibleHoverCardCellId &&
      activeHoverCard?.cellId === visibleHoverCardCellId &&
      activeHoverCard.data &&
      hoverCardPosition
        ? createPortal(
            <div
              ref={hoverCardPopoverRef}
              style={{
                position: 'fixed',
                top: `${hoverCardPosition.top}px`,
                left: `${hoverCardPosition.left}px`,
                width: `${HOVER_CARD_WIDTH_PX}px`,
              }}
              className="z-[120] rounded-md border bg-popover p-2 text-left text-xs normal-case text-popover-foreground shadow-lg select-text"
              onMouseEnter={() => {
                if (!pinnedHoverCardCellId) {
                  setHoveredHoverCardCellId(visibleHoverCardCellId)
                }
              }}
              onMouseLeave={() => {
                if (!pinnedHoverCardCellId) {
                  setHoveredHoverCardCellId(null)
                }
              }}
              onClick={event => event.stopPropagation()}
            >
              {activeHoverCard.data.title || activeHoverCard.data.columns?.rightTitle ? (
                <div className="mb-1 grid grid-cols-2 gap-3">
                  <p className="truncate font-semibold text-foreground">{activeHoverCard.data.title || 'N/A'}</p>
                  {activeHoverCard.data.columns?.rightTitle ? (
                    <p className="truncate text-right font-semibold text-foreground">
                      {activeHoverCard.data.columns.rightTitle}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {activeHoverCard.data.columns ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    {Array.from({
                      length: Math.max(
                        activeHoverCard.data.columns.left.length,
                        activeHoverCard.data.columns.right.length
                      ),
                    }).map((_, index) => {
                      const field = activeHoverCard.data.columns?.left[index]
                      return (
                        <p key={`hover-left-${index}`} className="min-h-4 break-words">
                          {field?.label ? <span className="font-medium text-foreground">{field.label}: </span> : null}
                          <span>{field?.value || ''}</span>
                        </p>
                      )
                    })}
                  </div>
                  <div className="space-y-1 text-right">
                    {Array.from({
                      length: Math.max(
                        activeHoverCard.data.columns.left.length,
                        activeHoverCard.data.columns.right.length
                      ),
                    }).map((_, index) => {
                      const field = activeHoverCard.data.columns?.right[index]
                      return (
                        <p key={`hover-right-${index}`} className="min-h-4 break-words">
                          {field?.label ? <span className="font-medium text-foreground">{field.label}: </span> : null}
                          <span>{field?.value || ''}</span>
                        </p>
                      )
                    })}
                  </div>
                </div>
              ) : null}
              {activeHoverCard.data.fields.length ? (
                <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                  {activeHoverCard.data.fields.map(field => (
                    <p key={`hover-field-${field.label}`} className="break-words">
                      {field.label ? <span className="font-medium text-foreground">{field.label}: </span> : null}
                      <span>{field.value || 'N/A'}</span>
                    </p>
                  ))}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}

      {openFilterColumn && filterPopoverPosition
        ? createPortal(
            <div
              ref={filterPopoverRef}
              style={{
                position: 'fixed',
                top: `${filterPopoverPosition.top}px`,
                left: `${filterPopoverPosition.left}px`,
                width: `${FILTER_POPOVER_WIDTH}px`,
              }}
              className="z-[120] rounded-md border bg-popover p-2 text-xs text-popover-foreground shadow-lg"
            >
              <input
                type="text"
                value={openFilterSearchInput}
                onChange={event => {
                  const nextValue = event.target.value
                  setFilterSearch(prev => ({ ...prev, [openFilterColumn]: nextValue }))
                }}
                placeholder="Search options"
                aria-label="Search filter options"
                aria-describedby="filter-options-status"
                className="mb-2 h-8 w-full rounded border border-input bg-background px-2 text-xs"
              />

              <p id="filter-options-status" aria-live="polite" className="mb-2 text-muted-foreground">
                {openFilterStatusText}
              </p>

              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={selectVisibleFilterOptions}
                  disabled={!canRenderFilterOptionsList}
                  aria-label="Select all visible options"
                  className="rounded border border-input px-2 py-1 hover:bg-muted"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearOpenFilter}
                  disabled={!isOpenFilterApplied}
                  aria-label="Clear current filter"
                  className="rounded border border-input px-2 py-1 hover:bg-muted"
                >
                  Clear filter
                </button>
                <button
                  type="button"
                  onClick={clearVisibleFilterOptions}
                  disabled={!canRenderFilterOptionsList && !isOpenFilterApplied}
                  aria-label="Clear visible options"
                  className="rounded border border-input px-2 py-1 hover:bg-muted"
                >
                  Clear
                </button>
              </div>

              {canRenderFilterOptionsList ? (
                <div className="max-h-56 space-y-1 overflow-auto rounded border border-border/50 p-1" role="listbox">
                {visibleFilterOptions.map(option => {
                  const selected = openFilterSelectedValues.includes(option)
                  const labelText = displayFilterOption(option)
                  return (
                    <label
                      key={`${openFilterColumn}-${option || '__empty__'}`}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent"
                      title={labelText}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={event => {
                          const allOptionsForColumn = openFilterOptions
                          if (event.target.checked) {
                            updateFilterValues(
                              openFilterColumn,
                              [...openFilterSelectedValues, option],
                              allOptionsForColumn
                            )
                          } else {
                            updateFilterValues(
                              openFilterColumn,
                              openFilterSelectedValues.filter(value => value !== option),
                              allOptionsForColumn
                            )
                          }
                        }}
                      />
                      <span className="truncate">{labelText}</span>
                    </label>
                  )
                })}
                {visibleFilterOptions.length === 0 ? (
                  <p className="px-1 py-2 text-muted-foreground">No options</p>
                ) : null}
                </div>
              ) : null}
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
