import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/zoom-job-run'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('zoom-job-run')

type RunRow = Record<string, unknown> & {
  actor_user_id?: string | null
  status?: string
  error_message?: string | null
  summary?: Record<string, unknown> | null
}

const actorDisplay = (row: { firstname: string | null; surname: string | null; email: string | null }, fallback: string) => {
  const first = (row.firstname ?? '').trim()
  const last = (row.surname ?? '').trim()
  const fullName = [first, last].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  const email = (row.email ?? '').trim()
  return email || fallback
}

const toOutcomeMessage = (row: RunRow) => {
  if (typeof row.error_message === 'string' && row.error_message.trim()) return row.error_message
  if (row.status !== 'skipped') return ''
  const summary = row.summary
  if (summary && typeof summary === 'object') {
    const skipReason = summary.skipReason
    if (typeof skipReason === 'string' && skipReason.trim()) return skipReason
  }
  return 'No skip reason recorded'
}

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as RunRow[]

  const actorUserIds = Array.from(
    new Set(rows.map(row => (typeof row.actor_user_id === 'string' ? row.actor_user_id : '')).filter(Boolean))
  )

  const { supabase } = createClient(args.request)
  const { data: actorRows } = actorUserIds.length
    ? await supabase.from('profile').select('user_id, firstname, surname, email').in('user_id', actorUserIds)
    : { data: [] as Array<{ user_id: string; firstname: string | null; surname: string | null; email: string | null }> }

  const actorByUserId = new Map((actorRows ?? []).map(row => [row.user_id, row]))

  return {
    ...base,
    rows: rows.map(row => {
      const userId = typeof row.actor_user_id === 'string' ? row.actor_user_id : ''
      const actor = actorByUserId.get(userId)
      return {
        ...row,
        actor_display: actor ? actorDisplay(actor, userId) : userId,
        outcome_message: toOutcomeMessage(row),
      }
    }),
    columns: [
      'run_id',
      'trigger_source',
      'trigger_kind',
      'actor_display',
      'actor_role',
      'status',
      'outcome_message',
      'started_at',
      'completed_at',
      'summary',
      'context',
      'created_at',
    ],
    columnMeta: {
      ...(base.columnMeta ?? {}),
      actor_display: { label: 'Actor', filterable: true },
      outcome_message: { label: 'Error / skip reason', filterable: true },
    },
  }
}

export const action = createTableAction('zoom-job-run')

export default function ZoomJobRunTablePage() {
  return <TableDisplay />
}
