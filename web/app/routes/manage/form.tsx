import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

import type { LoaderFunctionArgs } from 'react-router'
import { createClient } from '@/lib/supabase/server'

const baseLoader = createTableLoader('form')

export async function loader(args: LoaderFunctionArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows as Record<string, unknown>[]).map(row => ({ ...row }))

  const { supabase } = createClient(args.request)
  const formIds = rows.map(row => String(row.id ?? '')).filter(Boolean)
  const { data: submissions } = formIds.length
    ? await supabase.from('form_submission').select('form_id').in('form_id', formIds)
    : { data: [] }

  const countByFormId = new Map<string, number>()
  for (const submission of submissions ?? []) {
    const formId = String(submission.form_id ?? '')
    if (!formId) continue
    countByFormId.set(formId, (countByFormId.get(formId) ?? 0) + 1)
  }

  for (const row of rows) {
    const formId = String(row.id ?? '')
    row.answers = String(countByFormId.get(formId) ?? 0)
  }

  const columns = [...(base.columns as string[])]
  if (!columns.includes('answers')) {
    columns.push('answers')
  }

  return {
    ...base,
    columns,
    rows,
  }
}

export const action = createTableAction('form')

export default function FormsTablePage() {
  return <TableDisplay />
}
