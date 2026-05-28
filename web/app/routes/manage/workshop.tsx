import { Link } from 'react-router'

import { createClient } from '@/lib/supabase/server'

import type { Route } from './+types/workshop'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('workshop')

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as Array<Record<string, unknown>>

  const workshopIds = Array.from(
    new Set(rows.map(row => (typeof row.id === 'string' ? row.id : '')).filter(Boolean))
  )

  let approvedByWorkshopId = new Map<string, number>()
  if (workshopIds.length) {
    const { supabase } = createClient(args.request)
    const { data: approvedEnrollmentRows, error: approvedEnrollmentError } = await supabase
      .from('workshop_enrollment')
      .select('workshop_id')
      .in('workshop_id', workshopIds)
      .eq('status', 'approved')

    if (!approvedEnrollmentError) {
      approvedByWorkshopId = (approvedEnrollmentRows ?? []).reduce((acc, row) => {
        if (!row.workshop_id) {
          return acc
        }
        acc.set(row.workshop_id, (acc.get(row.workshop_id) ?? 0) + 1)
        return acc
      }, new Map<string, number>())
    }
  }

  const enrichedRows = rows.map(row => {
    const workshopId = typeof row.id === 'string' ? row.id : ''
    const approved = workshopId ? approvedByWorkshopId.get(workshopId) ?? 0 : 0
    const capacity = typeof row.capacity === 'number' ? row.capacity : null

    return {
      ...row,
      enrolled_capacity: capacity === null ? `${approved}/-` : `${approved}/${capacity}`,
    }
  })

  let columns = base.columns.includes('enrolled_capacity')
    ? base.columns
    : [...base.columns]

  if (!columns.includes('enrolled_capacity')) {
    const descriptionIndex = columns.indexOf('description')
    if (descriptionIndex >= 0) {
      columns = [
        ...columns.slice(0, descriptionIndex + 1),
        'enrolled_capacity',
        ...columns.slice(descriptionIndex + 1),
      ]
    } else {
      columns = [...columns, 'enrolled_capacity']
    }
  }

  return {
    ...base,
    rows: enrichedRows,
    columns,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      enrolled_capacity: {
        label: 'enrolled/capacity',
      },
    },
  }
}

export const action = createTableAction('workshop')

export default function WorkshopTablePage() {
  return (
    <TableDisplay
      headerActions={
        <Link
          to="/manage/workshop/setup?returnTo=/manage/workshop"
          className="inline-flex h-11 items-center rounded-md bg-[var(--brand-pink)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Setup a Workshop
        </Link>
      }
    />
  )
}
