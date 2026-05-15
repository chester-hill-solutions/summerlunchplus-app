import { Link, redirect, useLoaderData } from 'react-router'

import { requireAuth } from '@/lib/auth.server'
import type { Json } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'

import type { LoaderFunctionArgs } from 'react-router'

type LoaderData = {
  form: {
    id: string
    name: string
  }
  returnTo: string
  answerColumns: string[]
  answerRows: Array<{
    profile_label: string
    submitted_at: string
    values: Record<string, string>
  }>
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
    .select('id, submitted_at, profile:profile_id ( id, firstname, surname, email )')
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

  const answerRows = (submissionRows ?? []).map(row => {
    const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile
    const profileLabel =
      (typeof profile?.email === 'string' && profile.email) ||
      [profile?.firstname, profile?.surname].filter(Boolean).join(' ').trim() ||
      (typeof profile?.id === 'string' ? profile.id.slice(0, 8) : 'Unknown profile')

    return {
      profile_label: profileLabel,
      submitted_at: row.submitted_at,
      values: answersBySubmission[row.id] ?? {},
    }
  })

  return {
    form: { id: formRow.id, name: formRow.name },
    returnTo: safeReturnTo(url.searchParams.get('returnTo')),
    answerColumns,
    answerRows,
  } satisfies LoaderData
}

export default function ManageFormAnswersPage() {
  const { form, returnTo, answerColumns, answerRows } = useLoaderData() as LoaderData

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{form.name} answers</h1>
          <p className="text-sm text-muted-foreground">Profile, submission timestamp, and one column per question code.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to={{
              pathname: `/manage/form/${form.id}`,
              search: new URLSearchParams({ returnTo }).toString(),
            }}
            className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted"
          >
            Back to flow editor
          </Link>
          <Link to={returnTo} className="rounded-md border border-input px-3 py-2 text-sm hover:bg-muted">
            Back to forms
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full table-auto text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Profile</th>
                <th className="px-4 py-2 text-left">Submitted at</th>
                {answerColumns.map(code => (
                  <th key={code} className="px-4 py-2 text-left">{code}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {answerRows.map((row, index) => (
                <tr key={`${row.profile_label}-${row.submitted_at}-${index}`} className={index % 2 === 0 ? 'bg-card' : ''}>
                  <td className="max-w-xs truncate px-4 py-2 font-mono">{row.profile_label}</td>
                  <td className="whitespace-nowrap px-4 py-2 font-mono">{new Date(row.submitted_at).toLocaleString()}</td>
                  {answerColumns.map(code => (
                    <td key={`${row.submitted_at}-${code}`} className="max-w-sm truncate px-4 py-2 font-mono">
                      {row.values[code] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
