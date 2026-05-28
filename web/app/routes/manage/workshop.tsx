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

  let statusCountsByWorkshopId = new Map<
    string,
    { pending: number; accepted: number; waitlisted: number }
  >()
  if (workshopIds.length) {
    const { supabase } = createClient(args.request)
    const { data: enrollmentRows, error: enrollmentError } = await supabase
      .from('workshop_enrollment')
      .select('workshop_id, status')
      .in('workshop_id', workshopIds)

    if (!enrollmentError) {
      statusCountsByWorkshopId = (enrollmentRows ?? []).reduce((acc, row) => {
        if (!row.workshop_id) {
          return acc
        }
        const current = acc.get(row.workshop_id) ?? {
          pending: 0,
          accepted: 0,
          waitlisted: 0,
        }

        if (row.status === 'pending') {
          current.pending += 1
        } else if (row.status === 'approved') {
          current.accepted += 1
        } else if (row.status === 'waitlisted') {
          current.waitlisted += 1
        }

        acc.set(row.workshop_id, current)
        return acc
      }, new Map<string, { pending: number; accepted: number; waitlisted: number }>())
    }
  }

  const enrichedRows = rows.map(row => {
    const workshopId = typeof row.id === 'string' ? row.id : ''
    const counts =
      workshopId
        ? statusCountsByWorkshopId.get(workshopId) ?? {
            pending: 0,
            accepted: 0,
            waitlisted: 0,
          }
        : {
            pending: 0,
            accepted: 0,
            waitlisted: 0,
          }

    return {
      ...row,
      pending: counts.pending,
      accepted: counts.accepted,
      waitlisted: counts.waitlisted,
    }
  })

  let columns = base.columns.filter(column => column !== 'enrolled_capacity')

  const insertBefore = (target: string, ...inserted: string[]) => {
    const cleanInserted = inserted.filter(column => !columns.includes(column))
    if (!cleanInserted.length) return
    const targetIndex = columns.indexOf(target)
    if (targetIndex === -1) {
      columns = [...columns, ...cleanInserted]
      return
    }
    columns = [
      ...columns.slice(0, targetIndex),
      ...cleanInserted,
      ...columns.slice(targetIndex),
    ]
  }

  insertBefore('capacity', 'pending', 'accepted')
  insertBefore('wait_list_capacity', 'waitlisted')

  return {
    ...base,
    rows: enrichedRows,
    columns,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      pending: {
        label: 'pending',
        numeric: true,
      },
      accepted: {
        label: 'accepted',
        numeric: true,
      },
      capacity: {
        label: 'cap',
        numeric: true,
      },
      waitlisted: {
        label: 'waitlisted',
        numeric: true,
      },
      wait_list_capacity: {
        label: 'waitlist cap',
        numeric: true,
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
