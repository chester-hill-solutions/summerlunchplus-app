import { Link, redirect, useLoaderData } from 'react-router'

import type { LoaderFunctionArgs } from 'react-router'

import TableDisplay from './table-display'
import { Button } from '@/components/ui/button'
import { requireAuth } from '@/lib/auth.server'
import type { Json } from '@/lib/database.types'
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

  const { data: submissionRows, error: submissionError } = await supabase
    .from('form_submission')
    .select('id, profile_id, submitted_at, profile:profile_id ( id, firstname, surname, email )')
    .eq('form_id', formId)
    .order('submitted_at', { ascending: false })

  if (submissionError) {
    throw new Response(submissionError.message, { status: 500, headers })
  }

  const submissionIds = (submissionRows ?? []).map(row => row.id)
  const { data: answerRowsRaw } = submissionIds.length
    ? await supabase
        .from('form_answer')
        .select('submission_id, question_code, value')
        .in('submission_id', submissionIds)
    : { data: [] }

  const answersBySubmission = (answerRowsRaw ?? []).reduce<Record<string, Record<string, string>>>((acc, row) => {
    if (!acc[row.submission_id]) acc[row.submission_id] = {}
    acc[row.submission_id][row.question_code] =
      typeof row.value === 'string' ? row.value : JSON.stringify(row.value as Json)
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

  return (
    <TableDisplay
      headerActions={
        <div className="flex items-center gap-2">
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
            <Link to={returnTo}>Back to forms</Link>
          </Button>
        </div>
      }
    />
  )
}
