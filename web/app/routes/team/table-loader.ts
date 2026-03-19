import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'
import { TABLE_DEFINITIONS } from './table-definitions'
import type { LoaderFunctionArgs } from 'react-router'

const normalizeLookupRow = (value: unknown) => {
  if (Array.isArray(value)) return value[0] ?? null
  return value as Record<string, unknown> | null
}

const profileDisplay = (profileRow: Record<string, unknown> | null, fallbackId: string) => {
  const firstname = typeof profileRow?.firstname === 'string' ? profileRow.firstname.trim() : ''
  const surname = typeof profileRow?.surname === 'string' ? profileRow.surname.trim() : ''
  const email = typeof profileRow?.email === 'string' ? profileRow.email.trim() : ''
  if (firstname && surname) return `${firstname}-${surname}`
  if (email) return email
  return fallbackId
}

const submissionDisplay = (profileRow: Record<string, unknown> | null, fallbackId: string) => {
  const firstname = typeof profileRow?.firstname === 'string' ? profileRow.firstname.trim() : ''
  const surname = typeof profileRow?.surname === 'string' ? profileRow.surname.trim() : ''
  const email = typeof profileRow?.email === 'string' ? profileRow.email.trim() : ''
  if (firstname && surname) return `${firstname}-${surname}`
  if (email) return email
  return fallbackId
}

export function createTableLoader(tableName: string) {
  return async function loader({ request }: LoaderFunctionArgs) {
    const definition = TABLE_DEFINITIONS[tableName]
    if (!definition) {
      throw new Response('Table not found', { status: 404 })
    }

    const { supabase } = createClient(request)
    const { data, error } = await supabase
      .from(definition.table)
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
        const { data: lookupRowsRaw } = await adminClient
          .from(mapping.table)
          .select(selectColumns)
          .in(keyColumn, Array.from(ids))
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
              row[mapping.resultColumn] = {
                start: lookupRow?.starts_at ?? null,
                end: lookupRow?.ends_at ?? null,
              }
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
              const profileRow = normalizeLookupRow(lookupRow?.profile)
              const profileId = typeof profileRow?.id === 'string' ? profileRow.id : idValue
              row[mapping.resultColumn] = {
                label: submissionDisplay(profileRow, profileId),
                timestamp: lookupRow?.submitted_at ?? null,
                order: 'timestamp_first',
              }
              continue
            }
          }
          const lookupValue = valueById.get(idValue) ?? ''
          row[mapping.resultColumn] = lookupValue
        }
      }
    }

    return { columns: definition.columns, rows, label: definition.label, tableName }
  }
}
