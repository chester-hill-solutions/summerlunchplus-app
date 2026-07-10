import type { ActionFunctionArgs } from 'react-router'

import { createActionProfile } from '@/lib/action-profile.server'
import { requireAuth } from '@/lib/auth.server'
import { localDateTimeToUtcIso, parseOffsetMinutes } from '@/lib/datetime'
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

const parseFieldValue = (
  rawValue: FormDataEntryValue | null,
  fieldType: string,
  nullable?: boolean,
  rawOffset?: FormDataEntryValue | null
) => {
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

  if (fieldType === 'json') {
    try {
      return { value: JSON.parse(value), valid: true }
    } catch {
      return { value: null, valid: false }
    }
  }

  if (fieldType === 'datetime') {
    const offset = parseOffsetMinutes(typeof rawOffset === 'string' ? rawOffset : '')
    if (offset === null) {
      return { value: null, valid: false }
    }

    const utcIso = localDateTimeToUtcIso(value, offset)
    if (!utcIso) {
      return { value: null, valid: false }
    }
    return { value: utcIso, valid: true }
  }

  return { value, valid: true }
}

export const createTableAction = (tableName: string) => {
  return async function action({ request }: ActionFunctionArgs) {
    const profile = createActionProfile({
      name: `table_action_${tableName}`,
      request,
    })
    let intent = 'unknown'
    let outcome = 'unknown'
    let errorMessage: string | null = null

    try {
      const auth = await requireAuth(request)
      profile.mark('require_auth', { role: auth.claims.role })
      if (!isRoleAtLeast(auth.claims.role, 'staff')) {
        outcome = 'unauthorized'
        return new Response('Unauthorized', { status: 403, headers: auth.headers })
      }

      const definition = TABLE_DEFINITIONS[tableName]
      if (!definition?.editor) {
        outcome = 'editor_not_enabled'
        return { error: 'Editing is not enabled for this table.' }
      }

      const formData = await request.formData()
      intent = String(formData.get('intent') ?? '')
      profile.mark('parse_form_data', { intent })
      if (intent !== 'insert-row' && intent !== 'update-row') {
        outcome = 'unsupported_intent'
        return { error: 'Unsupported action.' }
      }

      const payload: Record<string, unknown> = {}
      for (const [fieldName, fieldConfig] of Object.entries(definition.editor.fields)) {
        const parsed = parseFieldValue(
          formData.get(`field_${fieldName}`),
          fieldConfig.type,
          fieldConfig.nullable,
          fieldConfig.type === 'datetime' ? formData.get(`field_${fieldName}__tz_offset`) : null
        )
        if (!parsed.valid) {
          outcome = 'invalid_field'
          return { error: `Invalid value for ${fieldConfig.label ?? fieldName}.` }
        }

        if (
          fieldConfig.required &&
          (parsed.value === '' || parsed.value === null || parsed.value === undefined)
        ) {
          outcome = 'missing_required_field'
          return { error: `${fieldConfig.label ?? fieldName} is required.` }
        }

        if (fieldConfig.type === 'number' && typeof parsed.value === 'number' && parsed.value < 0) {
          outcome = 'invalid_number'
          return { error: `${fieldConfig.label ?? fieldName} must be non-negative.` }
        }

        if (fieldConfig.type === 'enum' && parsed.value !== null && parsed.value !== '') {
          const enumValues = fieldConfig.enumValues ?? []
          if (!enumValues.includes(String(parsed.value))) {
            outcome = 'invalid_enum'
            return { error: `Invalid value for ${fieldConfig.label ?? fieldName}.` }
          }
        }

        payload[fieldName] = parsed.value === '' ? null : parsed.value
      }
      profile.mark('build_payload', {
        payloadFieldCount: Object.keys(payload).length,
      })

      const { supabase } = createClient(request)

      if (intent === 'insert-row') {
        const { error } = await fromQualifiedTable(supabase, definition.table).insert(payload)
        profile.mark('execute_insert', {
          table: definition.table,
          hasError: Boolean(error),
        })
        if (error) {
          outcome = 'insert_error'
          errorMessage = error.message
          return { error: error.message }
        }
        outcome = 'success'
        return { success: true }
      }

      const query = fromQualifiedTable(supabase, definition.table).update(payload)
      for (const keyColumn of definition.editor.primaryKey) {
        const raw = formData.get(`pk_${keyColumn}`)
        const keyValue = typeof raw === 'string' ? raw : ''
        if (!keyValue) {
          outcome = 'missing_primary_key'
          return { error: `Missing key field ${keyColumn}.` }
        }
        query.eq(keyColumn, keyValue)
      }
      profile.mark('build_update_query', {
        primaryKeyCount: definition.editor.primaryKey.length,
      })

      const { error } = await query
      profile.mark('execute_update', {
        table: definition.table,
        hasError: Boolean(error),
      })
      if (error) {
        outcome = 'update_error'
        errorMessage = error.message
        return { error: error.message }
      }

      outcome = 'success'
      return { success: true }
    } catch (error) {
      outcome = 'exception'
      errorMessage = error instanceof Error ? error.message : String(error)
      profile.log('table_action_exception', {
        intent,
        outcome,
        error: errorMessage,
      })
      throw error
    } finally {
      profile.complete({
        tableName,
        intent,
        outcome,
        error: errorMessage,
      })
    }
  }
}
