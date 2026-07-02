import { createClient } from '@/lib/supabase/server'
import { TABLE_DEFINITIONS } from './table-definitions'
import type { LoaderFunctionArgs } from 'react-router'

type ForeignKeyOption = {
  value: string
  label: string
}

const IN_CLAUSE_BATCH_SIZE = 150
const FETCH_BATCH_SIZE = 1000
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500, 1000, 1500] as const
const DEFAULT_PAGE_SIZE = 50
const FILTER_EMPTY_TOKEN = '__none__'
const CLASS_ENROLLMENT_STATUS_PRIORITY = ['pending', 'waitlisted', 'revoked', 'approved', 'rejected'] as const

type ParsedFilter = {
  values: string[]
  includeEmpty: boolean
}

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
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

const parsePaginationState = (request: Request) => {
  const searchParams = new URL(request.url).searchParams
  const pageRaw = Number(searchParams.get('page') ?? '1')
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1
  const pageSizeRaw = Number(searchParams.get('pageSize') ?? String(DEFAULT_PAGE_SIZE))
  const pageSize = PAGE_SIZE_OPTIONS.includes(pageSizeRaw as (typeof PAGE_SIZE_OPTIONS)[number])
    ? pageSizeRaw
    : DEFAULT_PAGE_SIZE

  return { page, pageSize, searchParams }
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

const fetchAllRowsInBatches = async ({
  supabase,
  table,
  select,
  order,
  ascending,
}: {
  supabase: ReturnType<typeof createClient>['supabase']
  table: string
  select: string
  order: string
  ascending: boolean
}) => {
  const rows: Record<string, unknown>[] = []
  for (let offset = 0; ; offset += FETCH_BATCH_SIZE) {
    const { data, error } = await fromQualifiedTable(supabase, table)
      .select(select)
      .order(order, { ascending })
      .range(offset, offset + FETCH_BATCH_SIZE - 1)

    if (error) {
      throw new Response(error.message, { status: 500 })
    }

    const chunk = ((data ?? []) as unknown as Record<string, unknown>[])
    rows.push(...chunk)
    if (chunk.length < FETCH_BATCH_SIZE) {
      break
    }
  }

  return rows
}

const applyParsedFilters = ({
  query,
  parsedFilters,
  selectableColumns,
  excludedColumns,
}: {
  query: any
  parsedFilters: Record<string, ParsedFilter>
  selectableColumns: Set<string>
  excludedColumns?: Set<string>
}) => {
  let nextQuery = query
  for (const [column, filter] of Object.entries(parsedFilters)) {
    if (excludedColumns?.has(column)) continue
    if (!selectableColumns.has(column)) continue
    if (filter.includeEmpty && filter.values.length === 0) {
      nextQuery = nextQuery.is(column, null)
      continue
    }
    if (filter.values.length === 1) {
      nextQuery = nextQuery.eq(column, filter.values[0])
      continue
    }
    if (filter.values.length > 1) {
      nextQuery = nextQuery.in(column, filter.values)
    }
  }
  return nextQuery
}

const fromQualifiedTable = (supabase: ReturnType<typeof createClient>['supabase'], qualifiedTable: string) => {
  const [schema, table, ...rest] = qualifiedTable.split('.')
  if (schema && table && rest.length === 0) {
    return supabase.schema(schema).from(table)
  }
  return supabase.from(qualifiedTable)
}

const normalizeLookupRow = (value: unknown) => {
  if (Array.isArray(value)) return value[0] ?? null
  return value as Record<string, unknown> | null
}

const profileDisplay = (profileRow: Record<string, unknown> | null, fallbackId: string) => {
  const firstname = typeof profileRow?.firstname === 'string' ? profileRow.firstname.trim() : ''
  const surname = typeof profileRow?.surname === 'string' ? profileRow.surname.trim() : ''
  const email = typeof profileRow?.email === 'string' ? profileRow.email.trim() : ''
  const fullName = [firstname, surname].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  if (email) return email
  return `ID ${fallbackId}`
}

const submissionDisplay = (formRow: Record<string, unknown> | null, profileRow: Record<string, unknown> | null, fallbackId: string, submittedAt: unknown) => {
  const formName = typeof formRow?.name === 'string' && formRow.name.trim() ? formRow.name.trim() : 'Form'
  const firstname = typeof profileRow?.firstname === 'string' ? profileRow.firstname.trim() : ''
  const surname = typeof profileRow?.surname === 'string' ? profileRow.surname.trim() : ''
  const email = typeof profileRow?.email === 'string' ? profileRow.email.trim() : ''
  const fullName = [firstname, surname].filter(Boolean).join(' ').trim()
  const profileLabel = fullName || email || `ID ${fallbackId}`

  let submittedDate = ''
  if (typeof submittedAt === 'string') {
    const date = new Date(submittedAt)
    submittedDate = Number.isNaN(date.getTime())
      ? submittedAt
      : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
  }

  return [formName, profileLabel, submittedDate].filter(Boolean).join(' - ')
}

const formatDateLabel = (value: unknown) => {
  if (typeof value !== 'string' || !value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

const semesterDisplay = (semesterRow: Record<string, unknown> | null, fallbackId: string) => {
  const name = typeof semesterRow?.name === 'string' ? semesterRow.name.trim() : ''
  if (name) return name
  const start = formatDateLabel(semesterRow?.starts_at)
  const end = formatDateLabel(semesterRow?.ends_at)
  const range = [start, end].filter(Boolean).join(' - ')
  return range || fallbackId
}

const semesterTitleDisplay = (semesterRow: Record<string, unknown> | null, fallbackId: string) => {
  const name = typeof semesterRow?.name === 'string' ? semesterRow.name.trim() : ''
  if (name) return name
  const description = typeof semesterRow?.description === 'string' ? semesterRow.description.trim() : ''
  if (description) return description
  return 'Unnamed semester'
}

const workshopDisplay = (workshopRow: Record<string, unknown> | null, fallbackId: string) => {
  const description = typeof workshopRow?.description === 'string' ? workshopRow.description.trim() : ''
  return description || fallbackId
}

const formDisplay = (formRow: Record<string, unknown> | null, fallbackId: string) => {
  const name = typeof formRow?.name === 'string' ? formRow.name.trim() : ''
  return name || `ID ${fallbackId}`
}

const userProfileDisplay = (profileRow: Record<string, unknown> | null, fallbackId: string) => {
  const email = typeof profileRow?.email === 'string' ? profileRow.email.trim() : ''
  const firstname = typeof profileRow?.firstname === 'string' ? profileRow.firstname.trim() : ''
  const surname = typeof profileRow?.surname === 'string' ? profileRow.surname.trim() : ''
  const fullName = [firstname, surname].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  if (email) return email
  return `ID ${fallbackId}`
}

const foreignKeyOptions = async (
  supabase: ReturnType<typeof createClient>['supabase'],
  tableName: string
): Promise<Record<string, ForeignKeyOption[]>> => {
  if (tableName === 'workshop') {
    const { data } = await supabase
      .from('semester')
      .select('id, name, starts_at, ends_at')
      .order('starts_at', { ascending: true })
    const options = ((data ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: semesterDisplay(row, id) }
    })
    return { semester_id: options.filter(option => option.value) }
  }

  if (tableName === 'class') {
    const { data } = await supabase
      .from('workshop')
      .select('id, description')
      .order('description', { ascending: true })
    const options = ((data ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: workshopDisplay(row, id) }
    })
    return { workshop_id: options.filter(option => option.value) }
  }

  if (tableName === 'class-enrollment') {
    const [{ data: workshops }, { data: profiles }] = await Promise.all([
      supabase
        .from('workshop')
        .select('id, description')
        .order('description', { ascending: true }),
      supabase
        .from('profile')
        .select('id, email, firstname, surname')
        .order('email', { ascending: true }),
    ])

    const workshopOptions = ((workshops ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: workshopDisplay(row, id) }
    })

    const profileOptions = ((profiles ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: profileDisplay(row, id) }
    })

    return {
      workshop_id: workshopOptions.filter(option => option.value),
      profile_id: profileOptions.filter(option => option.value),
    }
  }

  if (tableName === 'form-question-map') {
    const [{ data: forms }, { data: questions }] = await Promise.all([
      supabase.from('form').select('id, name').order('name', { ascending: true }),
      supabase.from('form_question').select('question_code, prompt').order('question_code', { ascending: true }),
    ])

    const formOptions = ((forms ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: formDisplay(row, id) }
    })

    const questionOptions = ((questions ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const code = typeof row.question_code === 'string' ? row.question_code : ''
      const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : ''
      return { value: code, label: prompt ? `${code} - ${prompt}` : code }
    })

    return {
      form_id: formOptions.filter(option => option.value),
      question_code: questionOptions.filter(option => option.value),
    }
  }

  if (tableName === 'form-assignment') {
    const [{ data: forms }, { data: profiles }] = await Promise.all([
      supabase.from('form').select('id, name').order('name', { ascending: true }),
      supabase
        .from('profile')
        .select('user_id, email, firstname, surname')
        .not('user_id', 'is', null)
        .order('email', { ascending: true }),
    ])

    const formOptions = ((forms ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: formDisplay(row, id) }
    })

    const userOptions = ((profiles ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const userId = typeof row.user_id === 'string' ? row.user_id : ''
      return { value: userId, label: userProfileDisplay(row, userId) }
    })

    return {
      form_id: formOptions.filter(option => option.value),
      user_id: userOptions.filter(option => option.value),
      assigned_by: userOptions.filter(option => option.value),
    }
  }

  if (tableName === 'form-submission') {
    const [{ data: forms }, { data: profiles }, { data: userProfiles }] = await Promise.all([
      supabase.from('form').select('id, name').order('name', { ascending: true }),
      supabase.from('profile').select('id, email, firstname, surname').order('email', { ascending: true }),
      supabase
        .from('profile')
        .select('user_id, email, firstname, surname')
        .not('user_id', 'is', null)
        .order('email', { ascending: true }),
    ])

    const formOptions = ((forms ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: formDisplay(row, id) }
    })

    const profileOptions = ((profiles ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: profileDisplay(row, id) }
    })

    const userOptions = ((userProfiles ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const userId = typeof row.user_id === 'string' ? row.user_id : ''
      return { value: userId, label: userProfileDisplay(row, userId) }
    })

    return {
      form_id: formOptions.filter(option => option.value),
      profile_id: profileOptions.filter(option => option.value),
      user_id: userOptions.filter(option => option.value),
    }
  }

  if (tableName === 'semester-form-requirement') {
    const [{ data: forms }, { data: semesters }] = await Promise.all([
      supabase.from('form').select('id, name').order('name', { ascending: true }),
      supabase
        .from('semester')
        .select('id, name, description, starts_at, ends_at')
        .order('starts_at', { ascending: true }),
    ])

    const formOptions = ((forms ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: formDisplay(row, id) }
    })

    const semesterOptions = ((semesters ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: semesterTitleDisplay(row, id) }
    })

    return {
      form_id: formOptions.filter(option => option.value),
      semester_id: semesterOptions.filter(option => option.value),
    }
  }

  if (tableName === 'form-answer') {
    const [{ data: questions }, { data: submissions }] = await Promise.all([
      supabase.from('form_question').select('question_code, prompt').order('question_code', { ascending: true }),
      supabase
        .from('form_submission')
        .select('id, submitted_at, form:form_id ( name ), profile:profile_id ( id, firstname, surname, email )')
        .order('submitted_at', { ascending: false }),
    ])

    const questionOptions = ((questions ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const code = typeof row.question_code === 'string' ? row.question_code : ''
      const prompt = typeof row.prompt === 'string' ? row.prompt.trim() : ''
      return { value: code, label: prompt ? `${code} - ${prompt}` : code }
    })

    const submissionOptions = ((submissions ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const formRow = normalizeLookupRow(row.form)
      const profileRow = normalizeLookupRow(row.profile)
      const profileId = typeof profileRow?.id === 'string' ? profileRow.id : id
      return { value: id, label: submissionDisplay(formRow, profileRow, profileId, row.submitted_at) }
    })

    return {
      question_code: questionOptions.filter(option => option.value),
      submission_id: submissionOptions.filter(option => option.value),
    }
  }

  if (tableName === 'class-zoom-meeting') {
    const [{ data: classes }, { data: zoomHosts }] = await Promise.all([
      supabase
        .from('class')
        .select('id, starts_at, workshop:workshop_id ( description )')
        .order('starts_at', { ascending: true }),
      supabase
        .from('zoom_host')
        .select('id, display_name, zoom_user_email, zoom_user_id')
        .order('priority', { ascending: true }),
    ])

    const classOptions = ((classes ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const workshop = normalizeLookupRow(row.workshop)
      const label =
        typeof workshop?.description === 'string' && workshop.description.trim()
          ? workshop.description.trim()
          : `Class ${id}`
      return { value: id, label }
    })

    const hostOptions = ((zoomHosts ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const displayName = typeof row.display_name === 'string' ? row.display_name.trim() : ''
      const email = typeof row.zoom_user_email === 'string' ? row.zoom_user_email.trim() : ''
      const userId = typeof row.zoom_user_id === 'string' ? row.zoom_user_id.trim() : ''
      return { value: id, label: displayName || email || userId || `Host ${id}` }
    })

    return {
      class_id: classOptions.filter(option => option.value),
      zoom_host_id: hostOptions.filter(option => option.value),
    }
  }

  if (tableName === 'class-zoom-registrant') {
    const [{ data: classes }, { data: profiles }, { data: meetings }] = await Promise.all([
      supabase
        .from('class')
        .select('id, starts_at, workshop:workshop_id ( description )')
        .order('starts_at', { ascending: true }),
      supabase
        .from('profile')
        .select('id, email, firstname, surname')
        .order('email', { ascending: true }),
      supabase
        .from('class_zoom_meeting')
        .select('id, zoom_meeting_id, topic')
        .order('created_at', { ascending: false }),
    ])

    const classOptions = ((classes ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const workshop = normalizeLookupRow(row.workshop)
      const label =
        typeof workshop?.description === 'string' && workshop.description.trim()
          ? workshop.description.trim()
          : `Class ${id}`
      return { value: id, label }
    })

    const profileOptions = ((profiles ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: profileDisplay(row, id) }
    })

    const meetingOptions = ((meetings ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const meetingId = typeof row.zoom_meeting_id === 'string' ? row.zoom_meeting_id.trim() : ''
      const topic = typeof row.topic === 'string' ? row.topic.trim() : ''
      return { value: id, label: meetingId || topic || id }
    })

    return {
      class_id: classOptions.filter(option => option.value),
      profile_id: profileOptions.filter(option => option.value),
      class_zoom_meeting_id: meetingOptions.filter(option => option.value),
    }
  }

  if (tableName === 'class-zoom-participant-sync') {
    const { data: meetings } = await supabase
      .from('class_zoom_meeting')
      .select('id, zoom_meeting_id, topic')
      .order('created_at', { ascending: false })

    const meetingOptions = ((meetings ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const meetingId = typeof row.zoom_meeting_id === 'string' ? row.zoom_meeting_id.trim() : ''
      const topic = typeof row.topic === 'string' ? row.topic.trim() : ''
      return { value: id, label: meetingId || topic || id }
    })

    return {
      class_zoom_meeting_id: meetingOptions.filter(option => option.value),
    }
  }

  if (tableName === 'class-zoom-participant') {
    const [{ data: classes }, { data: profiles }, { data: meetings }] = await Promise.all([
      supabase
        .from('class')
        .select('id, starts_at, workshop:workshop_id ( description )')
        .order('starts_at', { ascending: true }),
      supabase
        .from('profile')
        .select('id, email, firstname, surname')
        .order('email', { ascending: true }),
      supabase
        .from('class_zoom_meeting')
        .select('id, zoom_meeting_id, topic')
        .order('created_at', { ascending: false }),
    ])

    const classOptions = ((classes ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const workshop = normalizeLookupRow(row.workshop)
      const label =
        typeof workshop?.description === 'string' && workshop.description.trim()
          ? workshop.description.trim()
          : `Class ${id}`
      return { value: id, label }
    })

    const profileOptions = ((profiles ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: profileDisplay(row, id) }
    })

    const meetingOptions = ((meetings ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const meetingId = typeof row.zoom_meeting_id === 'string' ? row.zoom_meeting_id.trim() : ''
      const topic = typeof row.topic === 'string' ? row.topic.trim() : ''
      return { value: id, label: meetingId || topic || id }
    })

    return {
      class_id: classOptions.filter(option => option.value),
      profile_id: profileOptions.filter(option => option.value),
      class_zoom_meeting_id: meetingOptions.filter(option => option.value),
    }
  }

  if (tableName === 'zlr-click-event') {
    const [{ data: registrants }, { data: profiles }] = await Promise.all([
      supabase
        .from('class_zoom_registrant')
        .select('id, zoom_registrant_id, zlr_token_hash')
        .order('created_at', { ascending: false }),
      supabase
        .from('profile')
        .select('id, email, firstname, surname')
        .order('email', { ascending: true }),
    ])

    const registrantOptions = ((registrants ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      const registrantId = typeof row.zoom_registrant_id === 'string' ? row.zoom_registrant_id.trim() : ''
      const tokenHash = typeof row.zlr_token_hash === 'string' ? row.zlr_token_hash.slice(0, 8) : ''
      return { value: id, label: registrantId || (tokenHash ? `token:${tokenHash}` : id) }
    })

    const profileOptions = ((profiles ?? []) as unknown as Record<string, unknown>[]).map(row => {
      const id = typeof row.id === 'string' ? row.id : ''
      return { value: id, label: profileDisplay(row, id) }
    })

    return {
      class_zoom_registrant_id: registrantOptions.filter(option => option.value),
      profile_id: profileOptions.filter(option => option.value),
    }
  }

  return {}
}

export function createTableLoader(tableName: string) {
  return async function loader(
    { request }: LoaderFunctionArgs,
    options?: { includeForeignKeyOptions?: boolean }
  ) {
    const definition = TABLE_DEFINITIONS[tableName]
    if (!definition) {
      throw new Response('Table not found', { status: 404 })
    }

    const { supabase } = createClient(request)
    const { page, pageSize, searchParams } = parsePaginationState(request)
    const requestedSortColumn = (searchParams.get('sort') ?? '').trim()
    const requestedSortDirection = (searchParams.get('dir') ?? '').trim().toLowerCase()
    const requestedSortAscending = requestedSortDirection === 'asc'
    const orderAscending = definition.orderAscending ?? true
    const selectableColumns = new Set(parseTopLevelSelectColumns(definition.select))
    const parsedFilters = parseFiltersFromSearch(definition.columns, searchParams)

    const hasUnsupportedFilter = Object.keys(parsedFilters).some(column => !selectableColumns.has(column))
    const hasUnsupportedSort = requestedSortColumn.length > 0 && !selectableColumns.has(requestedSortColumn)
    const hasMixedEmptyAndExplicit = Object.values(parsedFilters).some(
      filter => filter.includeEmpty && filter.values.length > 0
    )
    const useServerSideQuery = !(hasUnsupportedFilter || hasUnsupportedSort || hasMixedEmptyAndExplicit)

    let rows: Record<string, unknown>[] = []
    let totalRows = 0

    if (useServerSideQuery) {
      const canUseClassEnrollmentPriorityDefault =
        tableName === 'class-enrollment' &&
        !requestedSortColumn &&
        (!parsedFilters.status || (!parsedFilters.status.includeEmpty && parsedFilters.status.values.length >= 0))

      if (canUseClassEnrollmentPriorityDefault) {
        const statusFilter = parsedFilters.status
        const allowedStatuses = statusFilter?.values.length
          ? CLASS_ENROLLMENT_STATUS_PRIORITY.filter(status => statusFilter.values.includes(status))
          : [...CLASS_ENROLLMENT_STATUS_PRIORITY]

        const excludedStatus = new Set<string>(['status'])
        let remainingOffset = (page - 1) * pageSize
        let remainingLimit = pageSize
        const orderedRows: Record<string, unknown>[] = []
        let orderedTotal = 0

        for (const status of allowedStatuses) {
          const countQueryBase = fromQualifiedTable(supabase, definition.table).select('id', { count: 'exact', head: true })
          const countQuery = applyParsedFilters({
            query: countQueryBase,
            parsedFilters,
            selectableColumns,
            excludedColumns: excludedStatus,
          }).eq('status', status)

          const { count, error: countError } = await countQuery
          if (countError) {
            throw new Response(countError.message, { status: 500 })
          }

          const statusCount = count ?? 0
          orderedTotal += statusCount

          if (remainingLimit <= 0) continue
          if (remainingOffset >= statusCount) {
            remainingOffset -= statusCount
            continue
          }

          const localFrom = remainingOffset
          const localTo = localFrom + remainingLimit - 1
          const rowQueryBase = fromQualifiedTable(supabase, definition.table).select(definition.select)
          const rowQuery = applyParsedFilters({
            query: rowQueryBase,
            parsedFilters,
            selectableColumns,
            excludedColumns: excludedStatus,
          })
            .eq('status', status)
            .order('requested_at', { ascending: false })
            .range(localFrom, localTo)

          const { data: statusRows, error: rowError } = await rowQuery
          if (rowError) {
            throw new Response(rowError.message, { status: 500 })
          }

          const chunk = (statusRows ?? []) as unknown as Record<string, unknown>[]
          orderedRows.push(...chunk)
          remainingLimit -= chunk.length
          remainingOffset = 0
        }

        rows = orderedRows
        totalRows = orderedTotal
      } else {
        const queryBase = fromQualifiedTable(supabase, definition.table)
          .select(definition.select, { count: 'exact' })
        const queryWithFilters = applyParsedFilters({
          query: queryBase,
          parsedFilters,
          selectableColumns,
        })

        const orderColumn =
          requestedSortColumn && selectableColumns.has(requestedSortColumn)
            ? requestedSortColumn
            : definition.order
        const ascending = requestedSortColumn
          ? requestedSortAscending
          : orderAscending

        const from = (page - 1) * pageSize
        const to = from + pageSize - 1

        const { data, error, count } = await queryWithFilters.order(orderColumn, { ascending }).range(from, to)

        if (error) {
          throw new Response(error.message, { status: 500 })
        }

        rows = (data ?? []) as unknown as Record<string, unknown>[]
        totalRows = count ?? rows.length
      }
    } else {
      rows = await fetchAllRowsInBatches({
        supabase,
        table: definition.table,
        select: definition.select,
        order: definition.order,
        ascending: orderAscending,
      })
      totalRows = rows.length
    }

    if (definition.lookupMappings?.length && rows.length) {
      for (const mapping of definition.lookupMappings) {
        const keyCol = mapping.keyColumn
        const ids = new Set<string>()
        for (const row of rows) {
          const value = row[keyCol]
          if (typeof value === 'string' && value) {
            ids.add(value)
          }
        }
        if (!ids.size) continue

        const keyColumn = mapping.keyColumnInTable ?? 'id'
        const selectColumns = mapping.select
          ? mapping.select
          : [keyColumn, ...(mapping.valueColumns ?? (mapping.valueColumn ? [mapping.valueColumn] : []))].join(', ')
        const lookupRows: Record<string, unknown>[] = []
        let lookupErrorMessage: string | null = null

        for (const idChunk of chunkArray(Array.from(ids), IN_CLAUSE_BATCH_SIZE)) {
          const { data: lookupRowsRaw, error: lookupError } = await fromQualifiedTable(supabase, mapping.table)
            .select(selectColumns)
            .in(keyColumn, idChunk)

          if (lookupError) {
            lookupErrorMessage = lookupError.message
            break
          }

          lookupRows.push(...((lookupRowsRaw ?? []) as unknown as Record<string, unknown>[]))
        }

        if (lookupErrorMessage) {
          console.error('[table-loader] lookup mapping failed', {
            tableName,
            sourceTable: definition.table,
            lookupTable: mapping.table,
            keyColumn,
            resultColumn: mapping.resultColumn,
            format: mapping.format ?? null,
            idsCount: ids.size,
            error: lookupErrorMessage,
          })

          if (mapping.format === 'profile_display') {
            for (const row of rows) {
              const idValue = row[keyCol]
              row[mapping.resultColumn] = typeof idValue === 'string' && idValue ? `ID ${idValue}` : ''
            }
          }

          continue
        }
        const valueById = new Map<string, string>()
        const valueObjectById = new Map<string, Record<string, unknown>>()
        for (const lookup of lookupRows) {
          const idValue = lookup[keyColumn] as string | undefined
          if (typeof idValue !== 'string') continue
          valueObjectById.set(idValue, lookup)
          if (mapping.valueColumn) {
            const displayValue = lookup[mapping.valueColumn] as string | undefined
            if (typeof displayValue === 'string') {
              valueById.set(idValue, displayValue)
            }
          }
        }
        for (const row of rows) {
          const idValue = row[keyCol] as string | undefined
          if (typeof idValue !== 'string') {
            row[mapping.resultColumn] = ''
            continue
          }
          if (mapping.format) {
            const lookupRow = valueObjectById.get(idValue) ?? null
            if (mapping.format === 'profile_display') {
              row[mapping.resultColumn] = profileDisplay(lookupRow, idValue)
              continue
            }
            if (mapping.format === 'semester_range') {
              row[mapping.resultColumn] = semesterDisplay(lookupRow, idValue)
              continue
            }
            if (mapping.format === 'semester_title') {
              row[mapping.resultColumn] = semesterTitleDisplay(lookupRow, idValue)
              continue
            }
            if (mapping.format === 'class_display') {
              const workshop = normalizeLookupRow(lookupRow?.workshop)
              row[mapping.resultColumn] = {
                label:
                  typeof workshop?.description === 'string' ? workshop.description : 'Workshop',
                timestamp: lookupRow?.starts_at ?? null,
                order: 'label_first',
              }
              continue
            }
            if (mapping.format === 'submission_display') {
              const formRow = normalizeLookupRow(lookupRow?.form)
              const profileRow = normalizeLookupRow(lookupRow?.profile)
              const profileId = typeof profileRow?.id === 'string' ? profileRow.id : idValue
              row[mapping.resultColumn] = submissionDisplay(formRow, profileRow, profileId, lookupRow?.submitted_at)
              continue
            }
          }
          const lookupValue = valueById.get(idValue) ?? ''
          row[mapping.resultColumn] = lookupValue
        }
      }
    }

    const editorConfig = definition.editor
    const includeForeignKeyOptions = options?.includeForeignKeyOptions ?? true
    const fkOptions = editorConfig && includeForeignKeyOptions ? await foreignKeyOptions(supabase, tableName) : {}

    return {
      columns: definition.columns,
      rows,
      totalRows,
      serverSideQuery: useServerSideQuery,
      label: definition.label,
      tableName,
      tableVariant: 'default' as const,
      columnMeta: {},
      editorConfig,
      foreignKeyOptions: fkOptions,
    }
  }
}
