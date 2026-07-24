import { Form, Link, redirect, useLoaderData, useLocation, useNavigation } from 'react-router'

import type { LoaderFunctionArgs } from 'react-router'
import { Download, Loader2 } from 'lucide-react'

import TableDisplay from './table-display'
import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import type { Json } from '@/lib/database.types'
import { EXPORT_TYPE_FORM_ID_ANSWERS_CSV } from '@/lib/exports/types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

type LoaderData = {
  columns: string[]
  rows: Record<string, unknown>[]
  label: string
  tableName: string
  tableVariant: 'pivot'
  columnMeta: Record<string, { label?: string; truncate?: boolean; filterable?: boolean }>
  form: {
    id: string
    name: string
  }
  returnTo: string
}

const ANSWER_BATCH_SIZE = 200
const ANSWER_PAGE_SIZE = 1000

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0 || !items.length) return []
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const toAnswerDisplayValue = (value: unknown) => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item : JSON.stringify(item as Json)))
      .join(', ')
  }
  if (value === null || typeof value === 'undefined') return ''
  return JSON.stringify(value as Json)
}

const safeReturnTo = (input: string | null) => {
  if (!input) return '/manage/form'
  if (!input.startsWith('/')) return '/manage/form'
  if (input.startsWith('//')) return '/manage/form'
  if (input.includes('://')) return '/manage/form'
  return input
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    throw redirect('/home', { headers: auth.headers })
  }

  const formId = params.formID
  if (!formId) {
    throw redirect('/manage/form', { headers: auth.headers })
  }

  const { supabase, headers } = createClient(request)
  const url = new URL(request.url)
  const submissionId = url.searchParams.get('submissionId')
  const { data: formRow, error: formError } = await supabase
    .from('form')
    .select('id, name')
    .eq('id', formId)
    .maybeSingle()

  if (formError || !formRow) {
    throw redirect('/manage/form', { headers })
  }

  const { data: questionRows, error: questionError } = await supabase
    .from('form_question_map')
    .select('question_code')
    .eq('form_id', formId)
    .order('position', { ascending: true })

  if (questionError) {
    throw new Response(questionError.message, { status: 500, headers })
  }

  const answerColumns = (questionRows ?? []).map(row => String(row.question_code ?? ''))

  let submissionQuery = supabase
    .from('form_submission')
    .select('id, profile_id, submitted_at, profile:profile_id ( id, firstname, surname, email )')
    .eq('form_id', formId)

  if (submissionId) {
    submissionQuery = submissionQuery.eq('id', submissionId)
  }

  const { data: submissionRows, error: submissionError } = await submissionQuery
    .order('submitted_at', { ascending: false })

  if (submissionError) {
    throw new Response(submissionError.message, { status: 500, headers })
  }

  const submissionIds = (submissionRows ?? []).map(row => row.id)
  const answerRowsRaw: Array<{ submission_id: string; question_code: string; value: unknown }> = []
  for (const submissionChunk of chunkArray(submissionIds, ANSWER_BATCH_SIZE)) {
    let from = 0
    while (true) {
      const to = from + ANSWER_PAGE_SIZE - 1
      const { data, error: answerError } = await supabase
        .from('form_answer')
        .select('submission_id, question_code, value')
        .in('submission_id', submissionChunk)
        .order('id', { ascending: true })
        .range(from, to)

      if (answerError) {
        throw new Response(answerError.message, { status: 500, headers })
      }

      const pageRows = data ?? []
      if (!pageRows.length) break
      answerRowsRaw.push(...pageRows)
      if (pageRows.length < ANSWER_PAGE_SIZE) break
      from += ANSWER_PAGE_SIZE
    }
  }

  const answersBySubmission = (answerRowsRaw ?? []).reduce<Record<string, Record<string, string>>>((acc, row) => {
    if (!acc[row.submission_id]) acc[row.submission_id] = {}
    acc[row.submission_id][row.question_code] = toAnswerDisplayValue(row.value)
    return acc
  }, {})

  const rows = (submissionRows ?? []).map(row => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
    const profileLabel =
      (typeof profile?.email === 'string' && profile.email) ||
      [profile?.firstname, profile?.surname].filter(Boolean).join(' ').trim() ||
      (typeof profile?.id === 'string' ? profile.id.slice(0, 8) : 'Unknown profile')

    const values = answersBySubmission[row.id] ?? {}
    return {
      profile_display: profileLabel,
      profile_id: row.profile_id,
      submitted_at: row.submitted_at,
      ...Object.fromEntries(answerColumns.map(code => [code, values[code] ?? ''])),
    }
  })

  const columns = ['profile_display', 'submitted_at', ...answerColumns]
  const columnMeta: LoaderData['columnMeta'] = {
    profile_display: { label: 'Profile', truncate: true },
    submitted_at: { label: 'Timestamp', truncate: false },
  }
  for (const code of answerColumns) {
    columnMeta[code] = { label: code, truncate: false }
  }

  return {
    columns,
    rows,
    label: `${formRow.name} answers`,
    tableName: 'form-answers',
    tableVariant: 'pivot',
    columnMeta,
    form: {
      id: formRow.id,
      name: formRow.name,
    },
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
  } satisfies LoaderData
}

export default function ManageFormAnswersPage() {
  const { form, returnTo } = useLoaderData() as LoaderData
  const location = useLocation()
  const navigation = useNavigation()
  const backLabel = returnTo.startsWith('/manage/person') ? 'Back to person' : 'Back to forms'
  const sourcePath = `${location.pathname}${location.search}`
  const isCreatingExport = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'create-export'

  return (
    <TableDisplay
      headerActions={
        <div className="flex items-center gap-2">
          <Form method="post" action="/manage/exports" className="flex items-center gap-2">
            <input type="hidden" name="intent" value="create-export" />
            <input type="hidden" name="export_type" value={EXPORT_TYPE_FORM_ID_ANSWERS_CSV} />
            <input type="hidden" name="source_path" value={sourcePath} />
            <Button
              type="submit"
              variant="outline"
              size="icon-sm"
              disabled={isCreatingExport}
              aria-label={isCreatingExport ? 'Exporting CSV' : 'Export CSV'}
              title={isCreatingExport ? 'Exporting CSV...' : 'Export CSV'}
            >
              {isCreatingExport ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            </Button>
          </Form>
          <Button asChild variant="outline" size="sm">
            <Link
              to={{
                pathname: `/manage/form/${form.id}`,
                search: new URLSearchParams({ returnTo }).toString(),
              }}
            >
              Back to flow editor
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to={returnTo}>{backLabel}</Link>
          </Button>
        </div>
      }
    />
  )
}
