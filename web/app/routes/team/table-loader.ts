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

    return { columns: definition.columns, rows: data ?? [], label: definition.label }
  }
}
