import { createClient } from '@/lib/supabase/server'
import { TABLE_DEFINITIONS } from './table-definitions'
import type { LoaderFunctionArgs } from 'react-router'

type ForeignKeyOption = {
  value: string
  label: string
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
  if (email) return email
  if (firstname && surname) return `${firstname} ${surname}`
  return `ID ${fallbackId}`
}

const submissionDisplay = (formRow: Record<string, unknown> | null, profileRow: Record<string, unknown> | null, fallbackId: string, submittedAt: unknown) => {
  const formName = typeof formRow?.name === 'string' && formRow.name.trim() ? formRow.name.trim() : 'Form'
  const firstname = typeof profileRow?.firstname === 'string' ? profileRow.firstname.trim() : ''
  const surname = typeof profileRow?.surname === 'string' ? profileRow.surname.trim() : ''
  const email = typeof profileRow?.email === 'string' ? profileRow.email.trim() : ''
  const profileLabel = email || (firstname && surname ? `${firstname} ${surname}` : `ID ${fallbackId}`)

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
  if (email) return email
  if (firstname && surname) return `${firstname} ${surname}`
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

  return {}
}

export function createTableLoader(tableName: string) {
  return async function loader({ request }: LoaderFunctionArgs) {
    const definition = TABLE_DEFINITIONS[tableName]
    if (!definition) {
      throw new Response('Table not found', { status: 404 })
    }

    const { supabase } = createClient(request)
    const { data, error } = await fromQualifiedTable(supabase, definition.table)
      .select(definition.select)
      .order(definition.order, { ascending: true })

    if (error) {
      throw new Response(error.message, { status: 500 })
    }

    const rows = (data ?? []) as unknown as Record<string, unknown>[]
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
        const { data: lookupRowsRaw, error: lookupError } = await fromQualifiedTable(supabase, mapping.table)
          .select(selectColumns)
          .in(keyColumn, Array.from(ids))
        if (lookupError) {
          continue
        }
        const valueById = new Map<string, string>()
        const valueObjectById = new Map<string, Record<string, unknown>>()
        const lookupRows = (lookupRowsRaw ?? []) as unknown as Record<string, unknown>[]
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
    const fkOptions = editorConfig ? await foreignKeyOptions(supabase, tableName) : {}

    return {
      columns: definition.columns,
      rows,
      label: definition.label,
      tableName,
      editorConfig,
      foreignKeyOptions: fkOptions,
    }
  }
}
