import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'

import { localDateTimeToUtcIso, parseOffsetMinutes } from '@/lib/datetime'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth.server'

import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'
import { TABLE_DEFINITIONS } from './table-definitions'

const baseLoader = createTableLoader('semester')

const parseSemesterField = (
  formData: FormData,
  fieldName: string,
  fieldType: string,
  nullable?: boolean
) => {
  const rawValue = formData.get(`field_${fieldName}`)
  if (rawValue === null) return { value: null as unknown, valid: true }

  const value = String(rawValue).trim()
  if (!value) {
    return { value: nullable ? null : '', valid: true }
  }

  if (fieldType === 'datetime') {
    const offset = parseOffsetMinutes(String(formData.get(`field_${fieldName}__tz_offset`) ?? ''))
    if (offset === null) return { value: null as unknown, valid: false }
    const utcIso = localDateTimeToUtcIso(value, offset)
    if (!utcIso) return { value: null as unknown, valid: false }
    return { value: utcIso, valid: true }
  }

  return { value, valid: true }
}

const setSemesterSurveyMapping = async (
  supabase: ReturnType<typeof createClient>['supabase'],
  semesterId: string,
  kind: 'pre_program_survey' | 'post_program_survey',
  formId: string | null
) => {
  if (!formId) {
    const { error } = await supabase
      .from('semester_form_requirement')
      .update({ is_active: false })
      .eq('semester_id', semesterId)
      .eq('kind', kind)
      .eq('is_active', true)
    return error
  }

  const { error: deactivateError } = await supabase
    .from('semester_form_requirement')
    .update({ is_active: false })
    .eq('semester_id', semesterId)
    .eq('kind', kind)
    .eq('is_active', true)
    .neq('form_id', formId)

  if (deactivateError) return deactivateError

  const { error: upsertError } = await supabase
    .from('semester_form_requirement')
    .upsert(
      {
        semester_id: semesterId,
        kind,
        form_id: formId,
        is_active: true,
      },
      { onConflict: 'semester_id,form_id,kind' }
    )

  if (upsertError) return upsertError

  const { error: cleanupError } = await supabase
    .from('semester_form_requirement')
    .update({ is_active: false })
    .eq('semester_id', semesterId)
    .eq('kind', kind)
    .eq('is_active', true)
    .neq('form_id', formId)

  return cleanupError
}

export async function loader(args: LoaderFunctionArgs) {
  const base = await baseLoader(args)
  const { supabase } = createClient(args.request)

  const rows = ((base.rows ?? []) as Record<string, unknown>[]).map(row => ({ ...row }))
  const semesterIds = rows
    .map(row => (typeof row.id === 'string' ? row.id : ''))
    .filter(Boolean)

  const { data: mappings } = semesterIds.length
    ? await supabase
        .from('semester_form_requirement')
        .select('semester_id, form_id, kind, is_active')
        .in('semester_id', semesterIds)
        .eq('is_active', true)
    : { data: [] }

  const formIds = Array.from(new Set((mappings ?? []).map(row => row.form_id).filter(Boolean)))
  const { data: forms } = formIds.length
    ? await supabase.from('form').select('id, name').in('id', formIds)
    : { data: [] }

  const formNameById = new Map((forms ?? []).map(form => [form.id, form.name]))
  const mappingBySemesterKind = new Map<string, { formId: string; formName: string }>()

  for (const mapping of mappings ?? []) {
    if (!mapping.semester_id || !mapping.form_id || !mapping.kind) continue
    mappingBySemesterKind.set(`${mapping.semester_id}:${mapping.kind}`, {
      formId: mapping.form_id,
      formName: formNameById.get(mapping.form_id) ?? mapping.form_id,
    })
  }

  for (const row of rows) {
    const semesterId = typeof row.id === 'string' ? row.id : ''
    const pre = mappingBySemesterKind.get(`${semesterId}:pre_program_survey`)
    const post = mappingBySemesterKind.get(`${semesterId}:post_program_survey`)
    row.pre_survey_form_id = pre?.formId ?? ''
    row.post_survey_form_id = post?.formId ?? ''
    row.pre_survey_form_name = pre?.formName ?? ''
    row.post_survey_form_name = post?.formName ?? ''
  }

  const { data: allForms } = await supabase.from('form').select('id, name').order('name', { ascending: true })
  const formOptions = (allForms ?? []).map(form => ({
    value: form.id,
    label: form.name,
  }))

  const columns = [...(base.columns ?? [])]
  if (!columns.includes('pre_survey_form_name')) columns.push('pre_survey_form_name')
  if (!columns.includes('post_survey_form_name')) columns.push('post_survey_form_name')

  return {
    ...base,
    rows,
    columns,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      pre_survey_form_name: { label: 'Pre-program survey form' },
      post_survey_form_name: { label: 'Post-program survey form' },
    },
    editorConfig: base.editorConfig
      ? {
          ...base.editorConfig,
          fields: {
            ...base.editorConfig.fields,
            pre_survey_form_id: {
              label: 'Pre-program survey form',
              type: 'foreign_key' as const,
              nullable: true,
            },
            post_survey_form_id: {
              label: 'Post-program survey form',
              type: 'foreign_key' as const,
              nullable: true,
            },
          },
        }
      : base.editorConfig,
    foreignKeyOptions: {
      ...(base.foreignKeyOptions ?? {}),
      pre_survey_form_id: formOptions,
      post_survey_form_id: formOptions,
    },
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const definition = TABLE_DEFINITIONS.semester
  if (!definition?.editor) {
    return { error: 'Editing is not enabled for semesters.' }
  }

  const formData = await request.formData()
  const intent = String(formData.get('intent') ?? '')
  if (intent !== 'insert-row' && intent !== 'update-row') {
    return { error: 'Unsupported action.' }
  }

  const payload: Record<string, unknown> = {}
  for (const [fieldName, fieldConfig] of Object.entries(definition.editor.fields)) {
    const parsed = parseSemesterField(formData, fieldName, fieldConfig.type, fieldConfig.nullable)
    if (!parsed.valid) {
      return { error: `Invalid value for ${fieldConfig.label ?? fieldName}.` }
    }
    if (
      fieldConfig.required &&
      (parsed.value === '' || parsed.value === null || parsed.value === undefined)
    ) {
      return { error: `${fieldConfig.label ?? fieldName} is required.` }
    }
    payload[fieldName] = parsed.value === '' ? null : parsed.value
  }

  const preSurveyFormId = String(formData.get('field_pre_survey_form_id') ?? '').trim() || null
  const postSurveyFormId = String(formData.get('field_post_survey_form_id') ?? '').trim() || null

  const { supabase } = createClient(request)

  if (intent === 'insert-row') {
    const { data: inserted, error: insertError } = await supabase
      .from('semester')
      .insert(payload)
      .select('id')
      .single()

    if (insertError || !inserted?.id) {
      return { error: insertError?.message ?? 'Unable to create semester.' }
    }

    const preError = await setSemesterSurveyMapping(
      supabase,
      inserted.id,
      'pre_program_survey',
      preSurveyFormId
    )
    if (preError) {
      return { error: preError.message }
    }

    const postError = await setSemesterSurveyMapping(
      supabase,
      inserted.id,
      'post_program_survey',
      postSurveyFormId
    )
    if (postError) {
      return { error: postError.message }
    }

    return { success: true }
  }

  const semesterId = String(formData.get('pk_id') ?? '')
  if (!semesterId) {
    return { error: 'Missing key field id.' }
  }

  const { error: updateError } = await supabase.from('semester').update(payload).eq('id', semesterId)
  if (updateError) {
    return { error: updateError.message }
  }

  const preError = await setSemesterSurveyMapping(
    supabase,
    semesterId,
    'pre_program_survey',
    preSurveyFormId
  )
  if (preError) {
    return { error: preError.message }
  }

  const postError = await setSemesterSurveyMapping(
    supabase,
    semesterId,
    'post_program_survey',
    postSurveyFormId
  )
  if (postError) {
    return { error: postError.message }
  }

  return { success: true }
}

export default function SemesterTablePage() {
  return <TableDisplay />
}
