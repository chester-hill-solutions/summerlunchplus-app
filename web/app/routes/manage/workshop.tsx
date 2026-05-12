import { Link } from 'react-router'

import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

export const loader = createTableLoader('workshop')
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
