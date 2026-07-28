import { Form, Link, redirect, useLoaderData, useLocation, useNavigation } from 'react-router'

import type { LoaderFunctionArgs } from 'react-router'
import { Download, Loader2 } from 'lucide-react'

import DeferredTableDisplay from './deferred-table-display'
import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import type { Json } from '@/lib/database.types'
import { EXPORT_TYPE_FORM_ID_ANSWERS_CSV } from '@/lib/exports/types'
import { resolveConnectedProfileIds } from '@/lib/family.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
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
  audience: 'all' | 'approved-families'
  returnTo: string
}

const ANSWER_BATCH_SIZE = 200
const ANSWER_PAGE_SIZE = 1000
const PROFILE_FILTER_BATCH_SIZE = 100

type SubmissionRow = {
  id: string
  profile_id: string
  submitted_at: string
  profile:
    | {
        id: string
        firstname: string | null
        surname: string | null
        email: string | null
      }
    | Array<{
        id: string
        firstname: string | null
        surname: string | null
        email: string | null
      }>
    | null
}

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

const parseAudience = (input: string | null): LoaderData['audience'] =>
  input === 'approved-families' ? 'approved-families' : 'all'

const loadApprovedFamilyProfileIds = async () => {
  const approvedProfileIds = new Set<string>()
  for (let from = 0; ; from += ANSWER_PAGE_SIZE) {
    const { data, error } = await adminClient
      .from('workshop_enrollment')
      .select('profile_id')
      .eq('status', 'approved')
      .not('profile_id', 'is', null)
      .order('profile_id', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + ANSWER_PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    const pageRows = data ?? []
    for (const row of pageRows) {
      if (row.profile_id) approvedProfileIds.add(row.profile_id)
    }
    if (pageRows.length < ANSWER_PAGE_SIZE) break
  }

  return resolveConnectedProfileIds(adminClient, Array.from(approvedProfileIds))
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
  const deferTable = url.searchParams.get('_deferTable') === '1'
  const submissionId = url.searchParams.get('submissionId')
  const audience = parseAudience(url.searchParams.get('audience'))
  const { data: formRow, error: formError } = await supabase
    .from('form')
    .select('id, name')
    .eq('id', formId)
    .maybeSingle()

  if (formError || !formRow) {
    throw redirect('/manage/form', { headers })
  }

  const label = `${formRow.name} answers${audience === 'approved-families' ? ' - accepted families' : ''}`
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
  if (!deferTable) {
    return {
      columns: ['profile_display', 'submitted_at'],
      rows: [],
      label,
      tableName: 'form-answers',
      tableVariant: 'pivot',
      columnMeta: {
        profile_display: { label: 'Profile', truncate: true },
        submitted_at: { label: 'Timestamp', truncate: false },
      },
      form: {
        id: formRow.id,
        name: formRow.name,
      },
      audience,
      returnTo,
    } satisfies LoaderData
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

  let approvedFamilyProfileIds: string[] | null = null
  if (audience === 'approved-families') {
    try {
      approvedFamilyProfileIds = await loadApprovedFamilyProfileIds()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load accepted families.'
      throw new Response(message, { status: 500, headers })
    }
  }

  const submissionRows: SubmissionRow[] = []
  if (approvedFamilyProfileIds === null || approvedFamilyProfileIds.length) {
    const profileIdChunks = approvedFamilyProfileIds
      ? chunkArray(approvedFamilyProfileIds, PROFILE_FILTER_BATCH_SIZE)
      : [null]

    for (const profileIdChunk of profileIdChunks) {
      for (let from = 0; ; from += ANSWER_PAGE_SIZE) {
        let submissionQuery = supabase
          .from('form_submission')
          .select('id, profile_id, submitted_at, profile:profile_id ( id, firstname, surname, email )')
          .eq('form_id', formId)

        if (profileIdChunk) {
          submissionQuery = submissionQuery.in('profile_id', profileIdChunk)
        }
        if (submissionId) {
          submissionQuery = submissionQuery.eq('id', submissionId)
        }

        const { data, error: submissionError } = await submissionQuery
          .order('submitted_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, from + ANSWER_PAGE_SIZE - 1)

        if (submissionError) {
          throw new Response(submissionError.message, { status: 500, headers })
        }

        const pageRows = (data ?? []) as SubmissionRow[]
        submissionRows.push(...pageRows)
        if (pageRows.length < ANSWER_PAGE_SIZE) break
      }
    }

    submissionRows.sort(
      (left, right) => right.submitted_at.localeCompare(left.submitted_at) || left.id.localeCompare(right.id)
    )
  }

  const submissionIds = submissionRows.map(row => row.id)
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

  const rows = submissionRows.map(row => {
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
    label,
    tableName: 'form-answers',
    tableVariant: 'pivot',
    columnMeta,
    form: {
      id: formRow.id,
      name: formRow.name,
    },
    audience,
    returnTo,
  } satisfies LoaderData
}

export default function ManageFormAnswersPage() {
  const { audience, form, returnTo } = useLoaderData() as LoaderData
  const location = useLocation()
  const navigation = useNavigation()
  const backLabel = returnTo.startsWith('/manage/person') ? 'Back to person' : 'Back to forms'
  const sourcePath = `${location.pathname}${location.search}`
  const isCreatingExport = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'create-export'
  const audienceSearch = (nextAudience: LoaderData['audience']) => {
    const search = new URLSearchParams(location.search)
    if (nextAudience === 'all') {
      search.delete('audience')
    } else {
      search.set('audience', nextAudience)
    }
    return search.toString()
  }

  return (
    <DeferredTableDisplay
      dataPath={`/manage/form/${form.id}/answers/table-data`}
      fallbackData={{
        columns: ['profile_display', 'submitted_at'],
        rows: [],
        label: `${form.name} answers${audience === 'approved-families' ? ' - accepted families' : ''}`,
        tableName: 'form-answers',
        tableVariant: 'pivot',
        columnMeta: {
          profile_display: { label: 'Profile', truncate: true },
          submitted_at: { label: 'Timestamp', truncate: false },
        },
      }}
      headerActions={
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-md border p-0.5" role="tablist" aria-label="Answer audience">
            {([
              ['all', 'All answers'],
              ['approved-families', 'Accepted families'],
            ] as const).map(([value, label]) => (
              <Link
                key={value}
                to={{ pathname: location.pathname, search: audienceSearch(value) }}
                role="tab"
                aria-selected={audience === value}
                className={`rounded-sm px-2 py-1 text-xs font-medium ${
                  audience === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {label}
              </Link>
            ))}
          </div>
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
