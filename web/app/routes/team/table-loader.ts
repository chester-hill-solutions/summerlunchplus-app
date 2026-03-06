import { createClient } from '@/lib/supabase/server'
import { TABLE_DEFINITIONS } from './table-definitions'
import type { LoaderFunctionArgs } from 'react-router'

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

        const { data: lookupRowsRaw } = await supabase
          .from(mapping.table)
          .select(`${mapping.keyColumnInTable ?? 'id'}, ${mapping.valueColumn}`)
          .in(mapping.keyColumnInTable ?? 'id', Array.from(ids))
        const valueById = new Map<string, string>()
        const tableKey = mapping.keyColumnInTable ?? 'id'
        const lookupRows = (lookupRowsRaw ?? []) as unknown as Record<string, unknown>[]
        for (const lookup of lookupRows) {
          const idValue = lookup[tableKey] as string | undefined
          const displayValue = lookup[mapping.valueColumn] as string | undefined
          if (typeof idValue === 'string' && typeof displayValue === 'string') {
            valueById.set(idValue, displayValue)
          }
        }
        for (const row of rows) {
          const idValue = row[keyCol] as string | undefined
          const lookupValue = typeof idValue === 'string' ? valueById.get(idValue) ?? '' : ''
          row[mapping.resultColumn] = lookupValue
        }
      }
    }

    return { columns: definition.columns, rows, label: definition.label }
  }
}
