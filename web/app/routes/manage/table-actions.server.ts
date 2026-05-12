import type { ActionFunctionArgs } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import { TABLE_DEFINITIONS } from './table-definitions'

const fromQualifiedTable = (supabase: ReturnType<typeof createClient>['supabase'], qualifiedTable: string) => {
  const [schema, table, ...rest] = qualifiedTable.split('.')
  if (schema && table && rest.length === 0) {
    return supabase.schema(schema).from(table)
  }
  return supabase.from(qualifiedTable)
}

const parseFieldValue = (rawValue: FormDataEntryValue | null, fieldType: string, nullable?: boolean) => {
  if (rawValue === null) return { value: null, valid: true }
  const value = String(rawValue).trim()
  if (!value) return { value: nullable ? null : '', valid: true }

  if (fieldType === 'number') {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return { value: null, valid: false }
    return { value: numeric, valid: true }
  }

  if (fieldType === 'boolean') {
    return { value: value === 'true', valid: true }
  }

  return { value, valid: true }
}

export const createTableAction = (tableName: string) => {
  return async function action({ request }: ActionFunctionArgs) {
    const auth = await requireAuth(request)
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const definition = TABLE_DEFINITIONS[tableName]
    if (!definition?.editor) {
      return { error: 'Editing is not enabled for this table.' }
    }

    const formData = await request.formData()
    const intent = String(formData.get('intent') ?? '')
    if (intent !== 'insert-row' && intent !== 'update-row') {
      return { error: 'Unsupported action.' }
    }

    const payload: Record<string, unknown> = {}
    for (const [fieldName, fieldConfig] of Object.entries(definition.editor.fields)) {
      const parsed = parseFieldValue(formData.get(`field_${fieldName}`), fieldConfig.type, fieldConfig.nullable)
      if (!parsed.valid) {
        return { error: `Invalid value for ${fieldConfig.label ?? fieldName}.` }
      }

      if (
        fieldConfig.required &&
        (parsed.value === '' || parsed.value === null || parsed.value === undefined)
      ) {
        return { error: `${fieldConfig.label ?? fieldName} is required.` }
      }

      if (fieldConfig.type === 'number' && typeof parsed.value === 'number' && parsed.value < 0) {
        return { error: `${fieldConfig.label ?? fieldName} must be non-negative.` }
      }

      payload[fieldName] = parsed.value === '' ? null : parsed.value
    }

    const { supabase } = createClient(request)

    if (intent === 'insert-row') {
      const { error } = await fromQualifiedTable(supabase, definition.table).insert(payload)
      if (error) {
        return { error: error.message }
      }
      return { success: true }
    }

    const query = fromQualifiedTable(supabase, definition.table).update(payload)
    for (const keyColumn of definition.editor.primaryKey) {
      const raw = formData.get(`pk_${keyColumn}`)
      const keyValue = typeof raw === 'string' ? raw : ''
      if (!keyValue) {
        return { error: `Missing key field ${keyColumn}.` }
      }
      query.eq(keyColumn, keyValue)
    }

    const { error } = await query
    if (error) {
      return { error: error.message }
    }

    return { success: true }
  }
}
