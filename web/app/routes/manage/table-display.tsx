import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Link, useFetcher, useLoaderData, useLocation, useSearchParams } from 'react-router'
import { Filter, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Constants, type Database } from '@/lib/database.types'
import { getOffsetMinutesForLocalDateTime, toLocalDateTimeInputValue } from '@/lib/datetime'
import {
  filterClauseSignature,
  matchesFilterClause,
  parseFilterClausesFromSearchParams,
  serializeFilterClause,
  type FilterClause,
} from '@/lib/table-filter-params'

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

type ClassAttendanceEnrichment = {
  latest_geo: string
  giftcard_display: string
} & FamilyContextEnrichment

type ClassAttendanceEnrichmentResponse = {
  byProfileId: Record<string, ClassAttendanceEnrichment>
}

type ProfileEnrichment = Partial<WorkshopEnrollmentEnrichment & ClassAttendanceEnrichment>

type FederalDistrictCounts = {
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

type FederalDistrictEnrichmentResponse = {
  byRiding: Record<string, FederalDistrictCounts>
}

export type LoaderData = {
  columns: string[]
  rows: Record<string, unknown>[]
  totalRows?: number
  serverSideQuery?: boolean
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
  giftCardOptions?: string[]
  federalDistrictOptions?: Array<{ value: string; label: string }>
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

type RegisterStatusResponse = {
  state?: 'no_attempt' | 'attempt_found'
  message?: string
  detail?: string
  attemptedAt?: string | null
}

type AttendancePhotoResource = {
  id: string
  file_name: string | null
  mime_type: string | null
  byte_size: number | null
  uploaded_at: string
  signed_url: string | null
  signed_url_error: string | null
}

type AttendancePhotoResponse = {
  photos?: AttendancePhotoResource[]
  error?: string
}

const timestampColumns = new Set(['starts_at', 'ends_at', 'submitted_at'])
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500, 1000, 1500] as const
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
const CLASS_ATTENDANCE_ENRICHMENT_COLUMNS = new Set([
  'latest_geo',
  'giftcard_display',
])
const CLASS_ATTENDANCE_FILTER_ENRICHMENT_COLUMNS = new Set([
  ...Array.from(CLASS_ATTENDANCE_ENRICHMENT_COLUMNS),
  ...Array.from(FAMILY_CONTEXT_COLUMNS),
])

const hasHydratedFamilyContext = (enrichment?: ProfileEnrichment) =>
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

const TABLE_DISPLAY_LOCALE = 'en-US'
const displayTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local time'

const formatTimestamp = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(TABLE_DISPLAY_LOCALE, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  }).format(date)
}

const formatDateOnly = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(TABLE_DISPLAY_LOCALE, { dateStyle: 'medium' }).format(date)
}

const formatCompactLocalDateTime = (value: string) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(TABLE_DISPLAY_LOCALE, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date)
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
  if (tableName === 'class' && column === 'step_meeting' && typeof value === 'string' && value) {
    return formatCompactLocalDateTime(value)
  }
  return (value ?? '').toString()
}

const getFilterQueryValue = (column: string, row: Record<string, unknown>, tableName?: string) => {
  const value = row[column]
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    return getCellValue(column, row, tableName)
  }
  return String(value)
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

const toFilterClauseForSelectedValues = ({
  selectedValues,
  allOptions,
}: {
  selectedValues: string[]
  allOptions: string[]
}): FilterClause | null => {
  const normalizedSelected = normalizeFilterValues(selectedValues)
  const normalizedAll = normalizeFilterValues(allOptions)
  const allSet = new Set(normalizedAll)
  const uniqueSelected = normalizedSelected.filter(value => allSet.has(value))

  if (uniqueSelected.length === normalizedAll.length) {
    return null
  }

  const isEmptyOnly = uniqueSelected.length === 1 && uniqueSelected[0] === ''
  if (isEmptyOnly) {
    return { op: 'is_empty' }
  }

  const nonEmptyOptions = normalizedAll.filter(option => option !== '')
  const nonEmptySelected = uniqueSelected.filter(option => option !== '')
  if (nonEmptyOptions.length > 0 && nonEmptySelected.length === nonEmptyOptions.length && !uniqueSelected.includes('')) {
    return { op: 'is_not_empty' }
  }

  const deselected = normalizedAll.filter(option => !uniqueSelected.includes(option))
  if (deselected.length > 0 && deselected.length < uniqueSelected.length) {
    return { op: 'not_in', values: deselected }
  }

  return { op: 'in', values: uniqueSelected }
}

const selectedValuesForClause = ({
  clause,
  allOptions,
}: {
  clause: FilterClause | undefined
  allOptions: string[]
}) => {
  if (!clause) return allOptions
  if (clause.op === 'is_empty') return allOptions.filter(option => option === '')
  if (clause.op === 'is_not_empty') return allOptions.filter(option => option !== '')
  if (clause.op === 'in') return clause.values
  return allOptions.filter(option => !clause.values.includes(option))
}

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

const filterKeySignature = (input: Record<string, FilterClause>, excludedColumn: string) => {
  const keys = Object.keys(input)
    .filter(key => key !== excludedColumn)
    .sort((left, right) => left.localeCompare(right))
  return keys
    .map(key => `${key}:${filterClauseSignature(input[key])}`)
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
  if (tableName === 'class' && column === 'workshop_description') {
    const workshopDescription = typeof row.workshop_description === 'string' ? row.workshop_description : ''
    return withReturnTo('/manage/workshop', {
      ...(workshopDescription ? { f_description: workshopDescription } : {}),
    })
  }
  if (tableName === 'class' && column === 'step_meeting' && typeof row.id === 'string' && row.id) {
    return withReturnTo('/manage/class-zoom-meeting', {
      f_class_id: String(row.id),
    })
  }
  if (tableName === 'class' && column === 'step_registrants' && typeof row.id === 'string' && row.id) {
    const workshopDescription = typeof row.workshop_description === 'string' ? row.workshop_description : ''
    const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
    return withReturnTo('/manage/class-zoom-registrant', {
      f_class_id: row.id,
      ...(workshopDescription ? { f_workshop_description: workshopDescription } : {}),
      ...(startsAt ? { f_class_starts_at: formatTimestamp(startsAt) } : {}),
      ...(typeof row.ends_at === 'string' && row.ends_at ? { f_class_ends_at: formatTimestamp(row.ends_at) } : {}),
    })
  }
  if (tableName === 'class' && column === 'step_attendance_rows' && typeof row.id === 'string' && row.id) {
    const workshopDescription = typeof row.workshop_description === 'string' ? row.workshop_description : ''
    const startsAt = typeof row.starts_at === 'string' ? row.starts_at : ''
    const endsAt = typeof row.ends_at === 'string' ? row.ends_at : ''
    return withReturnTo('/manage/class-attendance', {
      f_class_id: row.id,
      ...(workshopDescription ? { f_workshop_description: workshopDescription } : {}),
      ...(startsAt ? { f_class_starts_at: formatTimestamp(startsAt) } : {}),
      ...(endsAt ? { f_class_ends_at: formatTimestamp(endsAt) } : {}),
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
  filterOptionsMode?: 'auto' | 'client' | 'server'
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

export default function TableDisplay({
  headerActions,
  paginationActions,
  data,
  filterOptionsMode = 'auto',
}: TableDisplayProps = {}) {
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
  const hasStickyTopBar =
    tableName === 'class-enrollment' ||
    tableName === 'workshop-enrollment' ||
    tableName === 'class-attendance'
  const location = useLocation()

  const statusFetcher = useFetcher()
  const editorFetcher = useFetcher<{ error?: string; success?: boolean }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortStage, setSortStage] = useState<0 | 1 | 2>(0)
  const [filters, setFilters] = useState<Record<string, FilterClause>>({})
  const [filterDraftByColumn, setFilterDraftByColumn] = useState<Record<string, string[]>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(50)
  const [openFilterColumn, setOpenFilterColumn] = useState<string | null>(null)
  const [filterSearch, setFilterSearch] = useState<Record<string, string>>({})
  const [filterPopoverPosition, setFilterPopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [createValues, setCreateValues] = useState<Record<string, string>>({})
  const [editingRowKey, setEditingRowKey] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [enrichmentByProfileId, setEnrichmentByProfileId] = useState<Record<string, ProfileEnrichment>>({})
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
  const hoverCardCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const [attendanceRegisterStatusByKey, setAttendanceRegisterStatusByKey] = useState<
    Record<string, { message: string; detail: string; attemptedAt: string | null }>
  >({})
  const [attendanceRegisterStatusLoadingByKey, setAttendanceRegisterStatusLoadingByKey] = useState<Record<string, boolean>>({})
  const [attendanceRegisterStatusErrorByKey, setAttendanceRegisterStatusErrorByKey] = useState<Record<string, string>>({})
  const [attendanceRegisterStatusOpenKey, setAttendanceRegisterStatusOpenKey] = useState<string | null>(null)
  const [attendancePhotoModalRow, setAttendancePhotoModalRow] = useState<Record<string, unknown> | null>(null)
  const [attendancePhotoCache, setAttendancePhotoCache] = useState<Record<string, AttendancePhotoResource[]>>({})
  const [attendancePhotoLoading, setAttendancePhotoLoading] = useState(false)
  const [attendancePhotoError, setAttendancePhotoError] = useState<string | null>(null)
  const [attendancePhotoIndex, setAttendancePhotoIndex] = useState(0)
  const [attendancePhotoStatusOverrides, setAttendancePhotoStatusOverrides] = useState<Record<string, string>>({})
  const [attendanceModalPhotoStatus, setAttendanceModalPhotoStatus] = useState('')
  const [attendanceModalInitialPhotoStatus, setAttendanceModalInitialPhotoStatus] = useState('')
  const [attendanceModalSavingStatus, setAttendanceModalSavingStatus] = useState(false)
  const [workshopEditModalRow, setWorkshopEditModalRow] = useState<Record<string, unknown> | null>(null)
  const [workshopEditGiftcardValue, setWorkshopEditGiftcardValue] = useState('')
  const [workshopEditStatusValue, setWorkshopEditStatusValue] = useState('')
  const [workshopEditRidingValue, setWorkshopEditRidingValue] = useState('')
  const isClassAttendance = tableName === 'class-attendance'
  const isWorkshopEnrollmentTable = tableName === 'class-enrollment'
  const supportsFamilyContextHover = isWorkshopEnrollmentTable || isClassAttendance
  const isFederalDistrictTable = tableName === 'federal-electoral-district'
  const serverSideQuery = Boolean(source?.serverSideQuery)
  const giftCardOptions = Array.isArray(source?.giftCardOptions)
    ? source.giftCardOptions.filter(option => typeof option === 'string' && option.trim())
    : []
  const federalDistrictOptions = Array.isArray(source?.federalDistrictOptions)
    ? source.federalDistrictOptions.filter(
        option => option && typeof option.value === 'string' && typeof option.label === 'string'
      )
    : []
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

      if (supportsFamilyContextHover) {
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
            giftcard_pc: '...',
            giftcard_sobeys: '...',
            giftcard_meal_kit: '...',
            household_count: '...',
            household_child_count: '...',
          }
        }
      }

      return nextRow
    })
  }, [
    districtCountsByRiding,
    enrichmentByProfileId,
    isFederalDistrictTable,
    rows,
    supportsFamilyContextHover,
  ])

  const canUseClientFilterOptions =
    !serverSideQuery ||
    (typeof source?.totalRows === 'number' && source.totalRows > 0 && rowsWithEnrichment.length >= source.totalRows)
  const shouldUseServerFilterOptions =
    filterOptionsMode === 'server' ||
    (filterOptionsMode === 'auto' && serverSideQuery && !canUseClientFilterOptions)

  useEffect(() => {
    const nextSort = searchParams.get('sort')
    const nextDir = searchParams.get('dir')
    const nextFilters = parseFilterClausesFromSearchParams(searchParams, columns)
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
    setWorkshopEditModalRow(null)
    setWorkshopEditGiftcardValue('')
    setWorkshopEditStatusValue('')
    setWorkshopEditRidingValue('')
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

  const cancelHoverCardClose = () => {
    if (!hoverCardCloseTimeoutRef.current) return
    clearTimeout(hoverCardCloseTimeoutRef.current)
    hoverCardCloseTimeoutRef.current = null
  }

  const scheduleHoverCardClose = (cellId: string) => {
    cancelHoverCardClose()
    hoverCardCloseTimeoutRef.current = setTimeout(() => {
      setHoveredHoverCardCellId(prev => (prev === cellId ? null : prev))
      hoverCardCloseTimeoutRef.current = null
    }, 160)
  }

  useEffect(
    () => () => {
      cancelHoverCardClose()
    },
    []
  )

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
    nextFilters: Record<string, FilterClause>,
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
      next.set(`f_${column}`, serializeFilterClause(nextFilters[column]))
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
    nextFilters: Record<string, FilterClause>,
    excludedColumn?: string
  ) =>
    columns.every(column => {
      if (column === excludedColumn) return true
      if (!hasOwn(nextFilters, column)) return true
      const clause = nextFilters[column]
      const cellValue = getCellValue(column, row, tableName)
      return matchesFilterClause(cellValue, clause)
    })

  const filterDataRevision = useMemo(
    () =>
      serverSideQuery
        ? 'server'
        : [
            rowsWithEnrichment.length,
            Object.keys(enrichmentByProfileId).length,
            Object.keys(districtCountsByRiding).length,
          ].join(':'),
    [districtCountsByRiding, enrichmentByProfileId, rowsWithEnrichment.length, serverSideQuery]
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

  const computeAllOptionsForColumn = (column: string, nextFilters: Record<string, FilterClause>) => {
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

    if (shouldUseServerFilterOptions) {
      void (async () => {
        const activeRequestId = filterActiveRequestRef.current.get(openFilterCacheKey)
        if (activeRequestId !== requestId) return

        const query = new URLSearchParams()
        query.set('table', tableName)
        query.set('column', openFilterColumn)
        for (const column of columns) {
          if (!hasOwn(filters, column)) continue
          query.set(`f_${column}`, serializeFilterClause(filters[column]))
        }

        try {
          const response = await fetch(`/manage/table-filter-options?${query.toString()}`)
          if (!response.ok) {
            throw new Error(`Failed to load filter options (${response.status})`)
          }

          const payload = (await response.json()) as {
            status?: string
            allOptions?: string[]
            totalCount?: number
          }

          const activeAfterFetch = filterActiveRequestRef.current.get(openFilterCacheKey)
          if (activeAfterFetch !== requestId) return

          if (payload.status === 'loaded') {
            const serverOptions = sortFilterOptions(payload.allOptions ?? [])
            const localOptions = computeAllOptionsForColumn(openFilterColumn, filters)
            const serverOnlyEmpty = serverOptions.length === 1 && serverOptions[0] === ''
            const localHasNonEmpty = localOptions.some(option => option !== '')
            const allOptions =
              (serverOptions.length === 0 || serverOnlyEmpty) && localHasNonEmpty
                ? localOptions
                : serverOptions
            const loadedEntry: FilterOptionsCacheEntry = {
              status: 'loaded',
              allOptions,
              totalCount: typeof payload.totalCount === 'number' ? payload.totalCount : allOptions.length,
              updatedAt: Date.now(),
            }
            writeFilterCache(openFilterCacheKey, loadedEntry)
            if (openFilterCacheKeyRef.current === openFilterCacheKey) {
              setOpenFilterCacheEntry(loadedEntry)
            }
            filterActiveRequestRef.current.delete(openFilterCacheKey)
            return
          }
        } catch (error) {
          console.error('[table display] server filter options fetch failed', error)
        }

        const localOptions = computeAllOptionsForColumn(openFilterColumn, filters)
        const fallbackEntry: FilterOptionsCacheEntry = {
          status: 'loaded',
          allOptions: localOptions,
          totalCount: localOptions.length,
          updatedAt: Date.now(),
        }
        writeFilterCache(openFilterCacheKey, fallbackEntry)
        if (openFilterCacheKeyRef.current === openFilterCacheKey) {
          setOpenFilterCacheEntry(fallbackEntry)
        }
        filterActiveRequestRef.current.delete(openFilterCacheKey)
      })()

      return () => {
        const activeRequestId = filterActiveRequestRef.current.get(openFilterCacheKey)
        if (activeRequestId === requestId) {
          filterActiveRequestRef.current.delete(openFilterCacheKey)
        }
      }
    }

    void (async () => {
      const activeRequestId = filterActiveRequestRef.current.get(openFilterCacheKey)
      if (activeRequestId !== requestId) return

      let mergedEnrichmentByProfileId = enrichmentByProfileId
      if (
        (isWorkshopEnrollmentTable &&
          (WORKSHOP_ENRICHMENT_COLUMNS.has(openFilterColumn) || FAMILY_CONTEXT_COLUMNS.has(openFilterColumn))) ||
        (isClassAttendance &&
          (CLASS_ATTENDANCE_ENRICHMENT_COLUMNS.has(openFilterColumn) || FAMILY_CONTEXT_COLUMNS.has(openFilterColumn)))
      ) {
        const shouldLoadWorkshopValues = isWorkshopEnrollmentTable && WORKSHOP_ENRICHMENT_COLUMNS.has(openFilterColumn)
        const shouldLoadClassAttendanceValues =
          isClassAttendance &&
          (CLASS_ATTENDANCE_ENRICHMENT_COLUMNS.has(openFilterColumn) || FAMILY_CONTEXT_COLUMNS.has(openFilterColumn))
        const shouldLoadFamilyContext =
          isWorkshopEnrollmentTable && FAMILY_CONTEXT_COLUMNS.has(openFilterColumn)

        const allProfileIds = Array.from(
          new Set(
            rows
              .map(row => (typeof row.profile_id === 'string' ? row.profile_id : ''))
              .filter(profileId => Boolean(profileId) && !mergedEnrichmentByProfileId[profileId])
          )
        )

        if (allProfileIds.length) {
          const fetchedByProfileId: Record<string, ProfileEnrichment> = {}
          for (let i = 0; i < allProfileIds.length; i += 40) {
            const requestProfileIds = allProfileIds.slice(i, i + 40)
            const query = new URLSearchParams()
            requestProfileIds.forEach(profileId => query.append('profileId', profileId))

            const [workshopPayload, classAttendancePayload, familyPayload] = await Promise.all([
              shouldLoadWorkshopValues
                ? fetch(`/manage/workshop-enrollment/enrichment?${query.toString()}`)
                    .then(async response =>
                      response.ok
                        ? ((await response.json()) as WorkshopEnrollmentEnrichmentResponse)
                        : ({ byProfileId: {} } as WorkshopEnrollmentEnrichmentResponse)
                    )
                : Promise.resolve({ byProfileId: {} } as WorkshopEnrollmentEnrichmentResponse),
              shouldLoadClassAttendanceValues
                ? fetch(`/manage/class-attendance/enrichment?${query.toString()}`)
                    .then(async response =>
                      response.ok
                        ? ((await response.json()) as ClassAttendanceEnrichmentResponse)
                        : ({ byProfileId: {} } as ClassAttendanceEnrichmentResponse)
                    )
                : Promise.resolve({ byProfileId: {} } as ClassAttendanceEnrichmentResponse),
              shouldLoadFamilyContext
                ? fetch(`/manage/family-context/enrichment?${query.toString()}`)
                    .then(async response =>
                      response.ok
                        ? ((await response.json()) as FamilyContextEnrichmentResponse)
                        : ({ byProfileId: {} } as FamilyContextEnrichmentResponse)
                    )
                : Promise.resolve({ byProfileId: {} } as FamilyContextEnrichmentResponse),
            ])

            const fallbackEnrichment: ProfileEnrichment = {
              riding_display: 'Not looked up',
              geo_locations_display: 'N/A',
              giftcard_display: 'N/A',
              prior_participation_display: 'N/A',
              latest_geo: 'N/A',
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
                ...(classAttendancePayload?.byProfileId?.[profileId] ?? {}),
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

      const rowsWithFullEnrichment = rowsWithEnrichment.map(row => {
        if (!isWorkshopEnrollmentTable && !isClassAttendance) return row
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
  }, [
    shouldUseServerFilterOptions,
    columns,
    filters,
    isClassAttendance,
    isWorkshopEnrollmentTable,
    openFilterCacheKey,
    openFilterColumn,
    rowsWithEnrichment,
    serverSideQuery,
    tableName,
  ])

  const derivedRows = useMemo(() => {
    let adjustedRows = serverSideQuery
      ? rowsWithEnrichment
      : rowsWithEnrichment.filter(row => rowMatchesFilters(row, filters))
    if (!serverSideQuery && sortColumn && sortStage > 0) {
      adjustedRows.sort((a, b) => {
        const aValue = getCellValue(sortColumn, a)
        const bValue = getCellValue(sortColumn, b)
        if (aValue === bValue) return 0
        const order = sortStage === 2 ? 1 : -1
        return aValue.localeCompare(bValue) * order
      })
    }

    if (isFederalDistrictTable) {
      const districtRows = adjustedRows.filter(row => row.__is_total_row !== true)
      const unresolvedCountColumns = districtRows.some(
        row =>
          typeof row.total !== 'number' ||
          typeof row.accepted !== 'number' ||
          typeof row.pending !== 'number' ||
          typeof row.waitlisted !== 'number' ||
          typeof row.declined !== 'number' ||
          typeof row.giftcard_pc !== 'number' ||
          typeof row.giftcard_sobeys !== 'number' ||
          typeof row.giftcard_meal_kit !== 'number' ||
          typeof row.household_count !== 'number' ||
          typeof row.household_child_count !== 'number'
      )

      const totals = unresolvedCountColumns
        ? {
            total: '...',
            accepted: '...',
            pending: '...',
            waitlisted: '...',
            declined: '...',
            giftcard_pc: '...',
            giftcard_sobeys: '...',
            giftcard_meal_kit: '...',
            household_count: '...',
            household_child_count: '...',
          }
        : districtRows.reduce<FederalDistrictCounts>(
            (acc, row) => {
              acc.total += Number(row.total)
              acc.accepted += Number(row.accepted)
              acc.pending += Number(row.pending)
              acc.waitlisted += Number(row.waitlisted)
              acc.declined += Number(row.declined)
              acc.giftcard_pc += Number(row.giftcard_pc)
              acc.giftcard_sobeys += Number(row.giftcard_sobeys)
              acc.giftcard_meal_kit += Number(row.giftcard_meal_kit)
              acc.household_count += Number(row.household_count)
              acc.household_child_count += Number(row.household_child_count)
              return acc
            },
            {
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
          )

      adjustedRows = [
        {
          __is_total_row: true,
          _row_class: 'sticky top-0 z-20 bg-muted font-semibold',
          code: '',
          name: 'Total',
          ...totals,
        },
        ...districtRows,
      ]
    }

    return adjustedRows
  }, [
    rowsWithEnrichment,
    serverSideQuery,
    columns,
    filters,
    sortColumn,
    sortStage,
    tableName,
    isFederalDistrictTable,
  ])

  const disablePaginationForTable = isFederalDistrictTable
  const totalRows = isFederalDistrictTable
    ? Math.max(0, derivedRows.length - 1)
    : serverSideQuery
      ? Number(source?.totalRows ?? rowsWithEnrichment.length)
      : derivedRows.length
  const totalPages = disablePaginationForTable ? 1 : Math.max(1, Math.ceil(totalRows / pageSize))
  const effectivePage = disablePaginationForTable ? 1 : Math.min(page, totalPages)
  const hasActiveEnrichmentBackedFilters = useMemo(
    () =>
      Object.keys(filters).some(column =>
        isWorkshopEnrollmentTable
          ? WORKSHOP_FILTER_ENRICHMENT_COLUMNS.has(column)
          : isClassAttendance
            ? CLASS_ATTENDANCE_FILTER_ENRICHMENT_COLUMNS.has(column)
            : false
      ),
    [filters, isClassAttendance, isWorkshopEnrollmentTable]
  )
  const hasActiveFamilyContextFilters = useMemo(
    () => Object.keys(filters).some(column => FAMILY_CONTEXT_COLUMNS.has(column)),
    [filters]
  )
  const baseFiltersForEnrichmentFetch = useMemo(() => {
    const next: Record<string, FilterClause> = {}
    for (const [column, clause] of Object.entries(filters)) {
      if (
        WORKSHOP_FILTER_ENRICHMENT_COLUMNS.has(column) ||
        CLASS_ATTENDANCE_FILTER_ENRICHMENT_COLUMNS.has(column)
      ) {
        continue
      }
      next[column] = clause
    }
    return next
  }, [filters])

  useEffect(() => {
    if (disablePaginationForTable) return
    if (effectivePage === page) return
    setPage(effectivePage)
    syncSearch(filters, sortColumn, sortStage, effectivePage, pageSize)
  }, [disablePaginationForTable, effectivePage, page, filters, sortColumn, sortStage, pageSize])

  const paginatedRows = useMemo(() => {
    if (disablePaginationForTable) return derivedRows
    if (serverSideQuery) return derivedRows
    const start = (effectivePage - 1) * pageSize
    return derivedRows.slice(start, start + pageSize)
  }, [disablePaginationForTable, serverSideQuery, derivedRows, effectivePage, pageSize])

  useEffect(() => {
    if (!isWorkshopEnrollmentTable && !isClassAttendance) return

    const shouldLoadWorkshopValues =
      isWorkshopEnrollmentTable && columns.some(column => WORKSHOP_ENRICHMENT_COLUMNS.has(column))
    const shouldLoadClassAttendanceValues =
      isClassAttendance && columns.some(column => CLASS_ATTENDANCE_ENRICHMENT_COLUMNS.has(column))
    const shouldLoadFamilyContext = hasActiveFamilyContextFilters || Boolean(openFilterColumn && FAMILY_CONTEXT_COLUMNS.has(openFilterColumn))
    const shouldLoadWorkshopFamilyContext = isWorkshopEnrollmentTable && shouldLoadFamilyContext
    const shouldLoadClassAttendancePayload = isClassAttendance && (shouldLoadClassAttendanceValues || shouldLoadFamilyContext)

    if (!shouldLoadWorkshopValues && !shouldLoadClassAttendancePayload && !shouldLoadWorkshopFamilyContext) return

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
        const [workshopPayload, classAttendancePayload, familyPayload] = await Promise.all([
          shouldLoadWorkshopValues
            ? fetch(`/manage/workshop-enrollment/enrichment?${searchParams.toString()}`, {
                signal: abortController.signal,
              }).then(async response =>
                response.ok
                  ? ((await response.json()) as WorkshopEnrollmentEnrichmentResponse)
                  : ({ byProfileId: {} } as WorkshopEnrollmentEnrichmentResponse)
              )
            : Promise.resolve({ byProfileId: {} } as WorkshopEnrollmentEnrichmentResponse),
          shouldLoadClassAttendancePayload
            ? fetch(`/manage/class-attendance/enrichment?${searchParams.toString()}`, {
                signal: abortController.signal,
              }).then(async response =>
                response.ok
                  ? ((await response.json()) as ClassAttendanceEnrichmentResponse)
                  : ({ byProfileId: {} } as ClassAttendanceEnrichmentResponse)
              )
            : Promise.resolve({ byProfileId: {} } as ClassAttendanceEnrichmentResponse),
          shouldLoadWorkshopFamilyContext
            ? fetch(`/manage/family-context/enrichment?${searchParams.toString()}`, {
                signal: abortController.signal,
              }).then(async response =>
                response.ok
                  ? ((await response.json()) as FamilyContextEnrichmentResponse)
                  : ({ byProfileId: {} } as FamilyContextEnrichmentResponse)
              )
            : Promise.resolve({ byProfileId: {} } as FamilyContextEnrichmentResponse),
        ])
        const fallbackEnrichment: ProfileEnrichment = {
          riding_display: 'Not looked up',
          geo_locations_display: 'N/A',
          giftcard_display: 'N/A',
          prior_participation_display: 'N/A',
          latest_geo: 'N/A',
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

        const resolvedByProfileId = requestProfileIds.reduce<Record<string, ProfileEnrichment>>(
          (acc, profileId) => {
            acc[profileId] = {
              ...fallbackEnrichment,
              ...(workshopPayload?.byProfileId?.[profileId] ?? {}),
              ...(classAttendancePayload?.byProfileId?.[profileId] ?? {}),
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
          console.info('[table-display] row enrichment loaded', {
            requestedProfiles: requestProfileIds.length,
            workshopValues: shouldLoadWorkshopValues,
            classAttendanceValues: shouldLoadClassAttendancePayload,
            familyContext: shouldLoadWorkshopFamilyContext,
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
    isClassAttendance,
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
              riding !== 'Total' &&
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
            giftcard_pc: 0,
            giftcard_sobeys: 0,
            giftcard_meal_kit: 0,
            household_count: 0,
            household_child_count: 0,
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

      if (!normalized.length && emptyBehavior === 'all') {
        delete next[column]
      } else {
        const clause = toFilterClauseForSelectedValues({
          selectedValues: normalized,
          allOptions: allOptionsForColumn,
        })
        if (!clause) {
          delete next[column]
        } else {
          next[column] = clause
        }
      }
      setPage(1)
      syncSearch(next, sortColumn, sortStage, 1, pageSize)
      return next
    })
  }

  const appendFilter = (column: string, row: Record<string, unknown>) => {
    const value = serverSideQuery
      ? getFilterQueryValue(column, row, tableName)
      : getCellValue(column, row, tableName)
    const allOptionsForColumn = computeAllOptionsForColumn(column, filters)
    const current = selectedValuesForClause({
      clause: filters[column],
      allOptions: allOptionsForColumn,
    })
    if (current.includes(value)) return
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
    if (!supportsFamilyContextHover || !profileId) return
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
    return selectedValuesForClause({
      clause: hasOwn(filters, column) ? filters[column] : undefined,
      allOptions: allOptionsForColumn,
    })
  }

  const openFilterOptions = openFilterCacheEntry?.allOptions ?? []

  const openFilterSelectedValues = openFilterColumn
    ? effectiveSelectedValuesForColumn(openFilterColumn, openFilterOptions)
    : []

  const openFilterDraftValues = openFilterColumn
    ? (hasOwn(filterDraftByColumn, openFilterColumn)
        ? filterDraftByColumn[openFilterColumn]
        : openFilterSelectedValues)
    : []

  const setOpenFilterDraft = (values: string[]) => {
    if (!openFilterColumn) return
    setFilterDraftByColumn(prev => ({
      ...prev,
      [openFilterColumn]: normalizeFilterValues(values),
    }))
  }

  const discardOpenFilterDraft = () => {
    if (!openFilterColumn) return
    setFilterDraftByColumn(prev => {
      if (!hasOwn(prev, openFilterColumn)) return prev
      const next = { ...prev }
      delete next[openFilterColumn]
      return next
    })
  }

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
        setFilterDraftByColumn(prev => {
          if (!hasOwn(prev, openFilterColumn)) return prev
          const next = { ...prev }
          delete next[openFilterColumn]
          return next
        })
        setOpenFilterColumn(null)
      }
    }
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      const button = filterButtonRefs.current[openFilterColumn]
      const popover = filterPopoverRef.current
      if (button?.contains(target) || popover?.contains(target)) return
      setFilterDraftByColumn(prev => {
        if (!hasOwn(prev, openFilterColumn)) return prev
        const next = { ...prev }
        delete next[openFilterColumn]
        return next
      })
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
    setAttendancePhotoStatusOverrides(prev => ({ ...prev, [`${classId}::${profileId}`]: value }))
    const formData = new FormData()
    formData.set('intent', 'update-photo-status')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    formData.set('photo_status', value)
    statusFetcher.submit(formData, { method: 'post' })
  }

  const attendancePhotoModalKey = (row: Record<string, unknown> | null) => {
    if (!row) return ''
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    return classId && profileId ? `${classId}::${profileId}` : ''
  }

  const openAttendancePhotoModal = async (row: Record<string, unknown>) => {
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return

    const key = `${classId}::${profileId}`
    setAttendancePhotoModalRow(row)
    setAttendancePhotoError(null)
    setAttendancePhotoIndex(0)

    const initialPhotoStatus = typeof row.photo_status === 'string' ? row.photo_status : ''
    setAttendanceModalPhotoStatus(initialPhotoStatus)
    setAttendanceModalInitialPhotoStatus(initialPhotoStatus)

    if (attendancePhotoCache[key]) return

    setAttendancePhotoLoading(true)
    try {
      const query = new URLSearchParams({ classId, profileId })
      const response = await fetch(`/manage/class-attendance/photos?${query.toString()}`)
      const payload = (await response.json()) as AttendancePhotoResponse
      if (!response.ok || payload.error) {
        setAttendancePhotoError(payload.error ?? 'Failed to load photos.')
        return
      }
      setAttendancePhotoCache(prev => ({ ...prev, [key]: payload.photos ?? [] }))
    } catch (error) {
      setAttendancePhotoError(error instanceof Error ? error.message : 'Failed to load photos.')
    } finally {
      setAttendancePhotoLoading(false)
    }
  }

  const closeAttendancePhotoModal = () => {
    if (attendanceModalSavingStatus) return
    if (attendanceModalPhotoStatus !== attendanceModalInitialPhotoStatus) {
      setAttendancePhotoError('Save photo status before closing this modal.')
      return
    }
    setAttendancePhotoModalRow(null)
    setAttendancePhotoError(null)
    setAttendancePhotoIndex(0)
  }

  const saveAttendanceModalPhotoStatus = async () => {
    if (!attendancePhotoModalRow) return
    const classId = typeof attendancePhotoModalRow.class_id === 'string' ? attendancePhotoModalRow.class_id : ''
    const profileId = typeof attendancePhotoModalRow.profile_id === 'string' ? attendancePhotoModalRow.profile_id : ''
    if (!classId || !profileId) return

    setAttendanceModalSavingStatus(true)
    setAttendancePhotoError(null)
    const formData = new FormData()
    formData.set('intent', 'update-photo-status')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    formData.set('photo_status', attendanceModalPhotoStatus)

    try {
      const response = await fetch(location.pathname + location.search, {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Failed to update photo status.')
      }

      setAttendanceModalInitialPhotoStatus(attendanceModalPhotoStatus)
      setAttendancePhotoModalRow(prev => (prev ? { ...prev, photo_status: attendanceModalPhotoStatus || null } : prev))
      const key = `${classId}::${profileId}`
      setAttendancePhotoStatusOverrides(prev => ({ ...prev, [key]: attendanceModalPhotoStatus }))
    } catch (error) {
      setAttendancePhotoError(error instanceof Error ? error.message : 'Failed to update photo status.')
    } finally {
      setAttendanceModalSavingStatus(false)
    }
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

  const requestAttendanceRegisterStatus = async (row: Record<string, unknown>) => {
    if (!isClassAttendance) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    const key = attendanceRowKey(row)
    if (!classId || !profileId || !key) return
    if (attendanceRegisterStatusByKey[key] || attendanceRegisterStatusLoadingByKey[key]) return

    setAttendanceRegisterStatusLoadingByKey(prev => ({ ...prev, [key]: true }))
    setAttendanceRegisterStatusErrorByKey(prev => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

    try {
      const query = new URLSearchParams({ classId, profileId })
      const response = await fetch(`/manage/class-attendance/register-status?${query.toString()}`)
      const payload = (await response.json()) as RegisterStatusResponse
      if (!response.ok) {
        throw new Error(payload.detail || payload.message || 'Failed to load register status.')
      }

      setAttendanceRegisterStatusByKey(prev => ({
        ...prev,
        [key]: {
          message: payload.message ?? 'No attempt recorded yet.',
          detail: payload.detail ?? '',
          attemptedAt: payload.attemptedAt ?? null,
        },
      }))
    } catch (error) {
      setAttendanceRegisterStatusErrorByKey(prev => ({
        ...prev,
        [key]: error instanceof Error ? error.message : 'Failed to load register status.',
      }))
    } finally {
      setAttendanceRegisterStatusLoadingByKey(prev => ({ ...prev, [key]: false }))
    }
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

  const toggleAttendanceGiftCardBlock = (row: Record<string, unknown>, blocked: boolean) => {
    if (!isClassAttendance || !canEditStatus) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return

    const formData = new FormData()
    formData.set('intent', 'toggle-gift-card-block')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    formData.set('blocked', blocked ? 'true' : 'false')
    if (blocked) {
      const reason = window.prompt('Optional reason for blocking this gift card?', '')
      if (reason == null) return
      formData.set('reason', reason.trim())
    }
    statusFetcher.submit(formData, { method: 'post' })
  }

  const updateAttendanceGiftCardAvailabilityOverride = (row: Record<string, unknown>, value: string) => {
    if (!isClassAttendance || !canEditStatus) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return

    const formData = new FormData()
    formData.set('intent', 'update-gift-availability-state')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    formData.set('gift_card_available_state', value)
    statusFetcher.submit(formData, { method: 'post' })
  }

  const allocateAttendanceGiftCard = (row: Record<string, unknown>) => {
    if (!isClassAttendance || !canEditStatus) return
    const classId = typeof row.class_id === 'string' ? row.class_id : ''
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    if (!classId || !profileId) return

    const preferredProviderRaw = typeof row.giftcard_display === 'string' ? row.giftcard_display.trim().toLowerCase() : ''
    const preferredProvider =
      preferredProviderRaw.includes('sobeys') ? 'sobeys' : preferredProviderRaw.includes('pc') ? 'pc' : ''

    const formData = new FormData()
    formData.set('intent', 'allocate-gift-card')
    formData.set('class_id', classId)
    formData.set('profile_id', profileId)
    if (preferredProvider) {
      formData.set('gift_card_preferred_provider', preferredProvider)
    }
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

  const beginWorkshopEditModal = (row: Record<string, unknown>) => {
    beginEdit(row)
    const currentGiftcard = typeof row.giftcard_display === 'string' ? row.giftcard_display : ''
    const currentStatus = typeof row.status === 'string' ? row.status : ''
    const currentRiding = typeof row.riding_display === 'string' ? row.riding_display : ''
    setWorkshopEditGiftcardValue(currentGiftcard === 'N/A' ? '' : currentGiftcard)
    setWorkshopEditStatusValue(currentStatus)
    setWorkshopEditRidingValue(currentRiding === 'N/A' || currentRiding === '...' ? '' : currentRiding)
    setWorkshopEditModalRow(row)
  }

  const closeWorkshopEditModal = () => {
    if (editorFetcher.state === 'submitting') return
    setWorkshopEditModalRow(null)
    setEditingRowKey(null)
    setEditValues({})
    setWorkshopEditGiftcardValue('')
    setWorkshopEditStatusValue('')
    setWorkshopEditRidingValue('')
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

  const submitWorkshopEnrollmentModalUpdate = (row: Record<string, unknown>) => {
    if (!editorConfig || !isWorkshopEnrollment) return
    const formData = new FormData()
    formData.set('intent', 'update-workshop-enrollment-modal')
    for (const fieldName of fieldKeys) {
      if (fieldName === 'profile_id') continue
      const value = editValues[fieldName] ?? ''
      formData.set(`field_${fieldName}`, value)
      if (editorConfig.fields[fieldName]?.type === 'datetime') {
        formData.set(`field_${fieldName}__tz_offset`, value ? getOffsetMinutesForLocalDateTime(value) : '')
      }
    }
    for (const keyColumn of editorConfig.primaryKey) {
      formData.set(`pk_${keyColumn}`, String(row[keyColumn] ?? ''))
    }

    const currentProfileId =
      (typeof editValues.profile_id === 'string' && editValues.profile_id) ||
      (typeof row.profile_id === 'string' ? row.profile_id : '')
    formData.set('profile_id_for_giftcard', currentProfileId)
    formData.set('giftcard_value', workshopEditGiftcardValue.trim())
    formData.set('status_value', workshopEditStatusValue)
    formData.set('riding_name', workshopEditRidingValue)
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
  const clearOpenFilter = () => {
    if (!openFilterColumn) return
    setOpenFilterDraft(openFilterOptions)
  }

  const selectVisibleFilterOptions = () => {
    if (!openFilterColumn) return
    const current = openFilterDraftValues
    const next = normalizeFilterValues([...current, ...visibleFilterOptions])
    setOpenFilterDraft(next)
  }

  const clearVisibleFilterOptions = () => {
    if (!openFilterColumn) return
    if (!canRenderFilterOptionsList) {
      clearOpenFilter()
      return
    }
    const current = openFilterDraftValues
    const visibleSet = new Set(visibleFilterOptions)
    const next = current.filter(value => !visibleSet.has(value))
    setOpenFilterDraft(next)
  }

  const applyOpenFilter = () => {
    if (!openFilterColumn) return
    const allOptionsForColumn = openFilterOptions
    const next = hasOwn(filterDraftByColumn, openFilterColumn)
      ? filterDraftByColumn[openFilterColumn]
      : openFilterSelectedValues
    updateFilterValues(openFilterColumn, next, allOptionsForColumn)
    discardOpenFilterDraft()
    setOpenFilterColumn(null)
  }

  const cancelOpenFilter = () => {
    if (!openFilterColumn) return
    discardOpenFilterDraft()
    setOpenFilterColumn(null)
  }

  const normalizedAppliedSignature = openFilterSelectedValues.slice().sort((a, b) => a.localeCompare(b)).join('|')
  const normalizedDraftSignature = openFilterDraftValues.slice().sort((a, b) => a.localeCompare(b)).join('|')
  const hasOpenFilterChanges = normalizedAppliedSignature !== normalizedDraftSignature

  return (
    <div className="-mx-6 flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-6">
        <div>
          <h1 className="text-2xl font-semibold">{label}</h1>
          <p className="text-sm text-muted-foreground">
            Showing live entries from the {label.toLowerCase()} table.
          </p>
          <p className="text-xs text-muted-foreground">Time values shown in {displayTimeZone}.</p>
        </div>
        {headerActions ? <div className="ml-auto">{headerActions}</div> : null}
      </div>

      {canInlineInsert && showCreate ? (
        <section className="relative z-30 mx-6 overflow-visible rounded-lg border bg-card p-4">
          <div className="space-y-3">
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
        </section>
      ) : null}

      {editorFetcher.data?.error ? <p className="px-6 text-sm text-destructive">{editorFetcher.data.error}</p> : null}

      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-6 ${
          hasStickyTopBar
            ? 'sticky top-16 z-20 border-y bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80'
            : ''
        }`}
      >
        <p className="text-xs text-muted-foreground">Page {effectivePage} of {totalPages} ({totalRows} rows)</p>
        <div className="flex items-center gap-2 text-xs">
          {paginationActions ? <div className="mr-1">{paginationActions}</div> : null}
          {canInlineInsert ? (
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={showCreate ? 'Hide new row form' : 'New row'}
              title={showCreate ? 'Hide new row form' : 'New row'}
              onClick={() => setShowCreate(prev => !prev)}
            >
              <Plus className="size-4" />
            </Button>
          ) : null}
          {disablePaginationForTable ? null : (
            <>
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
            </>
          )}
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
                    className={`${isNumericColumn(column) ? 'w-24' : ''} relative px-4 py-2 text-left ${hasStickyTopBar ? 'sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80' : ''}`}
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
                            if (openFilterColumn === column) {
                              setFilterDraftByColumn(prev => {
                                if (!hasOwn(prev, column)) return prev
                                const next = { ...prev }
                                delete next[column]
                                return next
                              })
                              setOpenFilterColumn(null)
                              return
                            }
                            if (openFilterColumn) {
                              setFilterDraftByColumn(prev => {
                                if (!hasOwn(prev, openFilterColumn)) return prev
                                const next = { ...prev }
                                delete next[openFilterColumn]
                                return next
                              })
                            }
                            setOpenFilterColumn(column)
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
              {canInlineUpdate ? (
                <th
                  className={`px-4 py-2 text-left ${hasStickyTopBar ? 'sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80' : ''}`}
                >
                  actions
                </th>
              ) : null}
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
                                <div className="relative inline-flex items-center gap-1">
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
                                  {classId && profileId && key ? (
                                    <button
                                      type="button"
                                      aria-label="Why no zoom link"
                                      className="inline-flex size-5 items-center justify-center rounded-full border border-input text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                                      onClick={event => event.stopPropagation()}
                                      onMouseEnter={() => {
                                        setAttendanceRegisterStatusOpenKey(key)
                                        void requestAttendanceRegisterStatus(row)
                                      }}
                                      onMouseLeave={() => {
                                        setAttendanceRegisterStatusOpenKey(prev => (prev === key ? null : prev))
                                      }}
                                    >
                                      ?
                                    </button>
                                  ) : null}
                                  {attendanceRegisterStatusOpenKey === key ? (
                                    <div
                                      className="absolute left-full top-1/2 z-30 ml-2 w-80 -translate-y-1/2 rounded border bg-popover p-2 text-xs shadow-lg"
                                      onMouseEnter={() => setAttendanceRegisterStatusOpenKey(key)}
                                      onMouseLeave={() => setAttendanceRegisterStatusOpenKey(null)}
                                      onClick={event => event.stopPropagation()}
                                    >
                                      {attendanceRegisterStatusLoadingByKey[key] ? (
                                        <p className="text-muted-foreground">Loading register status...</p>
                                      ) : attendanceRegisterStatusErrorByKey[key] ? (
                                        <p className="text-destructive">{attendanceRegisterStatusErrorByKey[key]}</p>
                                      ) : attendanceRegisterStatusByKey[key] ? (
                                        <div className="space-y-1">
                                          <p className="font-medium">{attendanceRegisterStatusByKey[key].message}</p>
                                          {attendanceRegisterStatusByKey[key].attemptedAt ? (
                                            <p className="text-muted-foreground">Attempted at: {formatTimestamp(attendanceRegisterStatusByKey[key].attemptedAt)}</p>
                                          ) : null}
                                          {attendanceRegisterStatusByKey[key].detail ? (
                                            <p className="whitespace-normal text-muted-foreground">{attendanceRegisterStatusByKey[key].detail}</p>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <p className="text-muted-foreground">No status loaded.</p>
                                      )}
                                    </div>
                                  ) : null}
                                </div>
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

                      if (isClassAttendance && column === 'photo_count') {
                        const rawCount = row.photo_count
                        const count = typeof rawCount === 'number' ? rawCount : Number(rawCount ?? 0)
                        const hasPhotos = Number.isFinite(count) && count > 0

                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2 font-mono" title={String(count || 0)}>
                            <div className="flex items-center gap-2">
                              <span>{Number.isFinite(count) ? count : 0}</span>
                              <button
                                type="button"
                                disabled={!hasPhotos}
                                onClick={event => {
                                  event.stopPropagation()
                                  void openAttendancePhotoModal(row)
                                }}
                                className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                View photos
                              </button>
                            </div>
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
                        const rowKey = attendanceRowKey(row)
                        const override = rowKey ? attendancePhotoStatusOverrides[rowKey] : undefined
                        const photoStatusValue =
                          typeof override === 'string'
                            ? override
                            : typeof row.photo_status === 'string'
                              ? row.photo_status
                              : ''
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

                      if (isClassAttendance && column === 'gift_card_block_action' && canEditStatus) {
                        const classId = typeof row.class_id === 'string' ? row.class_id : ''
                        const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
                        const blocked = row.gift_card_blocked === true || row.gift_card_blocked === 'true'
                        const isSubmitting =
                          statusFetcher.state === 'submitting' &&
                          statusFetcher.formData?.get('intent') === 'toggle-gift-card-block' &&
                          statusFetcher.formData?.get('class_id') === classId &&
                          statusFetcher.formData?.get('profile_id') === profileId

                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2" title="Toggle gift card block">
                            <button
                              type="button"
                              disabled={!classId || !profileId || isSubmitting}
                              onClick={event => {
                                event.stopPropagation()
                                toggleAttendanceGiftCardBlock(row, !blocked)
                              }}
                              className={`rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-60 ${
                                blocked
                                  ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                  : 'border-destructive/40 text-destructive hover:bg-destructive/10'
                              }`}
                            >
                              {isSubmitting ? 'Saving...' : blocked ? 'Unblock' : 'Block'}
                            </button>
                          </td>
                        )
                      }

                      if (isClassAttendance && column === 'gift_card_allocated' && canEditStatus) {
                        const classId = typeof row.class_id === 'string' ? row.class_id : ''
                        const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
                        const allocated = row.gift_card_allocated === true || row.gift_card_allocated === 'true'
                        const blocked = row.gift_card_blocked === true || row.gift_card_blocked === 'true'
                        const isSubmitting =
                          statusFetcher.state === 'submitting' &&
                          statusFetcher.formData?.get('intent') === 'allocate-gift-card' &&
                          statusFetcher.formData?.get('class_id') === classId &&
                          statusFetcher.formData?.get('profile_id') === profileId

                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2" title={allocated ? 'gift card allocated' : 'gift card not allocated'}>
                            {allocated ? (
                              <span className="font-mono text-xs">true</span>
                            ) : (
                              <button
                                type="button"
                                disabled={!classId || !profileId || blocked || isSubmitting}
                                onClick={event => {
                                  event.stopPropagation()
                                  allocateAttendanceGiftCard(row)
                                }}
                                className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isSubmitting ? 'Allocating...' : blocked ? 'Blocked' : 'Allocate'}
                              </button>
                            )}
                          </td>
                        )
                      }

                      if (isClassAttendance && column === 'gift_card_available' && canEditStatus) {
                        const classId = typeof row.class_id === 'string' ? row.class_id : ''
                        const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
                        const hasAllocation = row.gift_card_allocated === true || row.gift_card_allocated === 'true'
                        const isSubmitting =
                          statusFetcher.state === 'submitting' &&
                          statusFetcher.formData?.get('intent') === 'update-gift-availability-state' &&
                          statusFetcher.formData?.get('class_id') === classId &&
                          statusFetcher.formData?.get('profile_id') === profileId

                        const overrideRaw = typeof row.gift_card_available_state === 'string' ? row.gift_card_available_state : 'false'
                        const overrideValue = overrideRaw === 'true' || overrideRaw === 'false' ? overrideRaw : 'false'
                        const released = row.gift_card_available === true || row.gift_card_available === 'true'

                        return (
                          <td key={`cell-${absoluteRowIndex}-${column}`} className="overflow-hidden px-4 py-2 font-mono" title={released ? 'currently available' : 'currently unavailable'}>
                            <div className="flex items-center gap-2">
                              <select
                                value={overrideValue}
                                disabled={!hasAllocation || !classId || !profileId || isSubmitting}
                                onChange={event => updateAttendanceGiftCardAvailabilityOverride(row, event.target.value)}
                                className={TABLE_SELECT_CLASS_NAME}
                              >
                                <option value="true">true</option>
                                <option value="false">false</option>
                              </select>
                              <span className="text-[10px] text-muted-foreground">{released ? 'now: true' : 'now: false'}</span>
                            </div>
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

                      if (tableName === 'class' && column === 'step_meeting') {
                        const classId = typeof row.id === 'string' ? row.id : ''
                        const hasGeneratedMeeting =
                          typeof row.class_zoom_meeting_id === 'string' && row.class_zoom_meeting_id.length > 0

                        if (!hasGeneratedMeeting) {
                          const isGenerating =
                            statusFetcher.state === 'submitting' &&
                            statusFetcher.formData?.get('intent') === 'generate-meeting' &&
                            statusFetcher.formData?.get('class_id') === classId

                          return (
                            <td key={`cell-${absoluteRowIndex}-${column}`} className="px-4 py-2 font-mono" title="Meeting generation status">
                              <button
                                type="button"
                                disabled={!classId || isGenerating}
                                onClick={event => {
                                  event.stopPropagation()
                                  if (!classId) return
                                  const formData = new FormData()
                                  formData.set('intent', 'generate-meeting')
                                  formData.set('class_id', classId)
                                  statusFetcher.submit(formData, { method: 'post' })
                                }}
                                className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {isGenerating ? 'Generating...' : 'Generate'}
                              </button>
                            </td>
                          )
                        }
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
                      const linkClassName = `underline decoration-dotted underline-offset-2 hover:text-primary ${extraCellClass}`.trim()
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
                          className={linkClassName}
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
                          className={linkClassName}
                        >
                          <span className={shouldTruncate ? 'block max-w-full truncate' : 'whitespace-normal break-words'}>
                            {displayValue}
                          </span>
                        </Link>
                      ) : personLink ? (
                        <Link
                          to={personLink}
                          onClick={event => event.stopPropagation()}
                          className={linkClassName}
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
                          className={linkClassName}
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
                            appendFilter(column, row)
                          }}
                          onMouseEnter={() => {
                            if (!supportsFamilyContextHover || column !== 'profile_display') return
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
                                cancelHoverCardClose()
                                if (pinnedHoverCardCellId && pinnedHoverCardCellId !== hoverCardCellId) return
                                setHoveredHoverCardCellId(hoverCardCellId)
                                setActiveHoverCard({ cellId: hoverCardCellId, data: hoverCardData })
                              }}
                              onMouseLeave={event => {
                                if (pinnedHoverCardCellId === hoverCardCellId) return
                                const nextTarget = event.relatedTarget as Node | null
                                if (nextTarget && hoverCardPopoverRef.current?.contains(nextTarget)) {
                                  return
                                }
                                scheduleHoverCardClose(hoverCardCellId)
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
                      <td className="px-4 py-2" title={isEditing ? (isWorkshopEnrollment ? 'Close edit modal' : 'Cancel editing row') : 'Edit row'}>
                        <button
                          type="button"
                          className="rounded border border-input px-2 py-1 text-xs"
                          onClick={() => {
                            if (isEditing) {
                              if (isWorkshopEnrollment) {
                                closeWorkshopEditModal()
                              } else {
                                setEditingRowKey(null)
                                setEditValues({})
                              }
                              return
                            }
                            if (isWorkshopEnrollment) {
                              beginWorkshopEditModal(row)
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

                  {isEditing && editorConfig && !isWorkshopEnrollment ? (
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

      {workshopEditModalRow && editorConfig && isWorkshopEnrollment
        ? (() => {
            const editableFieldKeys = new Set([...fieldKeys.filter(fieldName => fieldName !== 'profile_id'), 'status', 'riding_display', 'giftcard_display'])
            const editableFormFieldKeys = fieldKeys.filter(fieldName => fieldName !== 'profile_id')
            const readableColumns = columns.filter(column => !editableFieldKeys.has(column))
            const profileIdForGiftcard =
              (typeof editValues.profile_id === 'string' && editValues.profile_id) ||
              (typeof workshopEditModalRow.profile_id === 'string' ? workshopEditModalRow.profile_id : '')
            const profileDisplayValue =
              typeof workshopEditModalRow.profile_display === 'string' && workshopEditModalRow.profile_display
                ? workshopEditModalRow.profile_display
                : profileIdForGiftcard || 'N/A'

            return createPortal(
              <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
                <div className="w-full max-w-6xl rounded-md border bg-card p-4 shadow-2xl">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Edit workshop enrollment</h2>
                      <p className="text-xs text-muted-foreground">Editable fields plus read-only context from this row.</p>
                    </div>
                    <button
                      type="button"
                      onClick={closeWorkshopEditModal}
                      className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
                      disabled={editorFetcher.state === 'submitting'}
                    >
                      Close
                    </button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded border bg-muted/10 p-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Editable</h3>
                      <div className="mb-3 grid gap-1 text-xs">
                        <span className="text-muted-foreground">Profile</span>
                        <div className="rounded border bg-background px-2 py-2 font-mono">{profileDisplayValue}</div>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {editableFormFieldKeys.map(fieldName => renderField(fieldName, editorConfig.fields[fieldName], editValues, setEditValues))}
                      </div>

                      <div className="mt-3 grid gap-1 text-xs">
                        <span className="text-muted-foreground">Status</span>
                        <select
                          value={workshopEditStatusValue}
                          onChange={event => setWorkshopEditStatusValue(event.target.value)}
                          className={FORM_SELECT_CLASS_NAME}
                          disabled={editorFetcher.state === 'submitting'}
                        >
                          {Constants.public.Enums.workshop_enrollment_status.map(
                            (status: Database['public']['Enums']['workshop_enrollment_status']) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      <div className="mt-3 grid gap-1 text-xs">
                        <span className="text-muted-foreground">Riding</span>
                        <Combobox
                          value={workshopEditRidingValue}
                          onChange={setWorkshopEditRidingValue}
                          options={[{ value: '', label: 'Unassigned' }, ...federalDistrictOptions]}
                          placeholder="Select riding"
                          disabled={editorFetcher.state === 'submitting'}
                        />
                      </div>

                      <div className="mt-3 grid gap-1 text-xs">
                        <span className="text-muted-foreground">Gift card preference</span>
                        <Combobox
                          value={workshopEditGiftcardValue}
                          onChange={setWorkshopEditGiftcardValue}
                          options={giftCardOptions.map(option => ({ value: option, label: option }))}
                          placeholder="Select gift card"
                          disabled={giftCardOptions.length === 0 || editorFetcher.state === 'submitting'}
                        />
                        {giftCardOptions.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No configured options found for gift card preference.</p>
                        ) : null}
                        {!profileIdForGiftcard ? (
                          <p className="text-xs text-muted-foreground">Gift card updates require a profile id on this row.</p>
                        ) : null}
                      </div>
                    </section>

                    <section className="rounded border bg-muted/10 p-3">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Read only</h3>
                      <div className="grid max-h-[50vh] gap-2 overflow-auto pr-1 text-xs">
                        {readableColumns.map(column => {
                          const labelText = (columnMeta[column]?.label ?? column).replace(/_/g, ' ')
                          const valueText = getCellValue(column, workshopEditModalRow, tableName) || 'N/A'
                          return (
                            <div key={`readonly-${column}`} className="rounded border bg-background/80 px-2 py-1">
                              <span className="font-medium text-muted-foreground">{labelText}: </span>
                              <span className="font-mono">{valueText}</span>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => submitWorkshopEnrollmentModalUpdate(workshopEditModalRow)}
                      disabled={editorFetcher.state === 'submitting'}
                      className="rounded bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
                    >
                      {editorFetcher.state === 'submitting' ? 'Saving...' : 'Save changes'}
                    </button>
                    <button
                      type="button"
                      onClick={closeWorkshopEditModal}
                      disabled={editorFetcher.state === 'submitting'}
                      className="rounded border border-input px-3 py-2 text-xs"
                    >
                      Cancel
                    </button>
                  </div>

                  {editorFetcher.data?.error ? <p className="mt-2 text-xs text-destructive">{editorFetcher.data.error}</p> : null}
                </div>
              </div>,
              document.body
            )
          })()
        : null}

      {attendancePhotoModalRow
        ? (() => {
            const modalKey = attendancePhotoModalKey(attendancePhotoModalRow)
            const photos = modalKey ? attendancePhotoCache[modalKey] ?? [] : []
            const boundedIndex = Math.max(0, Math.min(attendancePhotoIndex, Math.max(photos.length - 1, 0)))
            const currentPhoto = photos[boundedIndex]
            const profileLabel =
              typeof attendancePhotoModalRow.profile_display === 'string'
                ? attendancePhotoModalRow.profile_display
                : 'Student'
            const classStart =
              typeof attendancePhotoModalRow.class_starts_at === 'string' && attendancePhotoModalRow.class_starts_at
                ? formatTimestamp(attendancePhotoModalRow.class_starts_at)
                : 'Class'

            return createPortal(
              <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
                <div className="w-full max-w-4xl rounded-md border bg-card p-4 shadow-2xl">
                  <div className="mb-3 flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Class photos</h2>
                      <p className="text-xs text-muted-foreground">{profileLabel} - {classStart}</p>
                    </div>
                    <button
                      type="button"
                      onClick={closeAttendancePhotoModal}
                      className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
                    >
                      Close
                    </button>
                  </div>

                  <div className="mb-3 grid gap-4 md:grid-cols-[1fr_220px]">
                    <div className="rounded border bg-muted/20 p-2">
                      {attendancePhotoLoading ? (
                        <p className="p-8 text-center text-sm text-muted-foreground">Loading photos...</p>
                      ) : currentPhoto?.signed_url ? (
                        <img
                          src={currentPhoto.signed_url}
                          alt={currentPhoto.file_name ?? 'Class photo'}
                          className="max-h-[60vh] w-full rounded object-contain"
                        />
                      ) : (
                        <p className="p-8 text-center text-sm text-muted-foreground">
                          {photos.length === 0 ? 'No photos uploaded yet.' : currentPhoto?.signed_url_error ?? 'Photo URL unavailable.'}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={attendancePhotoLoading || photos.length <= 1 || boundedIndex === 0}
                          onClick={() => setAttendancePhotoIndex(prev => Math.max(0, prev - 1))}
                          className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Previous
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {photos.length === 0 ? '0 / 0' : `${boundedIndex + 1} / ${photos.length}`}
                        </p>
                        <button
                          type="button"
                          disabled={attendancePhotoLoading || photos.length <= 1 || boundedIndex >= photos.length - 1}
                          onClick={() => setAttendancePhotoIndex(prev => Math.min(photos.length - 1, prev + 1))}
                          className="rounded border border-input px-2 py-1 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Next
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3 rounded border bg-background p-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Photo status</p>
                        <select
                          value={attendanceModalPhotoStatus}
                          onChange={event => setAttendanceModalPhotoStatus(event.target.value)}
                          className={`${TABLE_SELECT_CLASS_NAME} mt-1`}
                        >
                          <option value="">(none)</option>
                          {Constants.public.Enums.class_attendance_photo_status.map(
                            (status: Database['public']['Enums']['class_attendance_photo_status']) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            )
                          )}
                        </select>
                      </div>

                      <button
                        type="button"
                        disabled={attendanceModalSavingStatus || attendanceModalPhotoStatus === attendanceModalInitialPhotoStatus}
                        onClick={() => void saveAttendanceModalPhotoStatus()}
                        className="rounded border border-input px-3 py-2 text-xs hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {attendanceModalSavingStatus ? 'Saving...' : 'Save status'}
                      </button>

                      {currentPhoto ? (
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>File: {currentPhoto.file_name ?? 'Untitled'}</p>
                          <p>MIME: {currentPhoto.mime_type ?? 'unknown'}</p>
                          <p>Size: {typeof currentPhoto.byte_size === 'number' ? `${currentPhoto.byte_size} bytes` : 'unknown'}</p>
                          <p>Uploaded: {formatTimestamp(currentPhoto.uploaded_at)}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {attendancePhotoError ? <p className="text-xs text-destructive">{attendancePhotoError}</p> : null}
                </div>
              </div>,
              document.body
            )
          })()
        : null}

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
                cancelHoverCardClose()
                if (!pinnedHoverCardCellId) {
                  setHoveredHoverCardCellId(visibleHoverCardCellId)
                }
              }}
              onMouseLeave={event => {
                if (!pinnedHoverCardCellId) {
                  const nextTarget = event.relatedTarget as HTMLElement | null
                  const nextHoverCardCellId = nextTarget?.closest('[data-hovercard-cell-id]')?.getAttribute('data-hovercard-cell-id')
                  if (nextHoverCardCellId === visibleHoverCardCellId) {
                    return
                  }
                  scheduleHoverCardClose(visibleHoverCardCellId)
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
                  disabled={openFilterDraftValues.length === openFilterOptions.length}
                  aria-label="Clear current filter"
                  className="rounded border border-input px-2 py-1 hover:bg-muted"
                >
                  Clear filter
                </button>
                <button
                  type="button"
                  onClick={clearVisibleFilterOptions}
                  disabled={!canRenderFilterOptionsList && openFilterDraftValues.length === openFilterOptions.length}
                  aria-label="Clear visible options"
                  className="rounded border border-input px-2 py-1 hover:bg-muted"
                >
                  Clear
                </button>
              </div>

              {canRenderFilterOptionsList ? (
                <div className="max-h-56 space-y-1 overflow-auto rounded border border-border/50 p-1" role="listbox">
                {visibleFilterOptions.map(option => {
                  const selected = openFilterDraftValues.includes(option)
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
                          if (event.target.checked) {
                            setOpenFilterDraft([...openFilterDraftValues, option])
                          } else {
                            setOpenFilterDraft(openFilterDraftValues.filter(value => value !== option))
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

              <div className="mt-2 flex items-center justify-end gap-2 border-t border-border/50 pt-2">
                <button
                  type="button"
                  onClick={cancelOpenFilter}
                  className="rounded border border-input px-3 py-1.5 hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyOpenFilter}
                  disabled={!hasOpenFilterChanges}
                  className="rounded bg-primary px-3 py-1.5 text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Apply
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  )
}
