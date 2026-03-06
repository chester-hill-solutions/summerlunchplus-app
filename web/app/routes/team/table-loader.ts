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
    if (definition.userEmailMappings?.length && rows.length) {
      const userIds = new Set<string>()
      for (const row of rows) {
        for (const mapping of definition.userEmailMappings!) {
          const value = row[mapping.key]
          if (typeof value === 'string' && value) {
            userIds.add(value)
          }
        }
      }

      if (userIds.size > 0) {
        const { data: users } = await supabase
          .from('auth.users')
          .select('id, email')
          .in('id', Array.from(userIds))
        const emailById = new Map<string, string>()
        for (const user of users ?? []) {
          if (user?.id && typeof user.email === 'string') {
            emailById.set(user.id, user.email)
          }
        }

        for (const row of rows) {
          for (const mapping of definition.userEmailMappings!) {
            const value = row[mapping.key]
            const email = typeof value === 'string' ? emailById.get(value) ?? '' : ''
            row[mapping.column] = email
          }
        }
      }
    }

    return { columns: definition.columns, rows, label: definition.label }
  }
}
