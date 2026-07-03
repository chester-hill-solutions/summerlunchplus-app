import { Form, useLocation } from 'react-router'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV } from '@/lib/exports/types'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

import type { Route } from './+types/federal-electoral-district'

const baseLoader = createTableLoader('federal-electoral-district')

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)

  const columns = base.columns.includes('accepted')
    ? base.columns
    : ['code', 'name', 'total', 'accepted', 'pending', 'waitlisted', 'declined', ...base.columns.filter(column => !['code', 'name'].includes(column))]

  const rows = (base.rows ?? []).map(row => {
    return {
      ...row,
      total: null,
      accepted: null,
      pending: null,
      waitlisted: null,
      declined: null,
    }
  })

  return {
    ...base,
    columns,
    rows,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      total: { label: 'total', numeric: true },
      accepted: { label: 'accepted', numeric: true },
      pending: { label: 'pending', numeric: true },
      waitlisted: { label: 'waitlisted', numeric: true },
      declined: { label: 'declined', numeric: true },
    },
  }
}

export const action = createTableAction('federal-electoral-district')

export default function FederalElectoralDistrictTablePage() {
  const location = useLocation()
  const sourcePath = `/manage/federal-electoral-district${location.search}`

  return (
    <TableDisplay
      paginationActions={
        <Form method="post" action="/manage/exports" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="create-export" />
          <input type="hidden" name="export_type" value={EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV} />
          <input type="hidden" name="source_path" value={sourcePath} />
          <Button type="submit" variant="outline" size="icon-sm" aria-label="Export CSV" title="Export CSV">
            <Download className="size-4" />
          </Button>
        </Form>
      }
    />
  )
}
