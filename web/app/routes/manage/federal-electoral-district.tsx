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
  const url = new URL(args.request.url)
  const normalizedSearch = new URLSearchParams(url.searchParams)
  if (!url.searchParams.has('pageSize')) {
    normalizedSearch.set('page', '1')
    normalizedSearch.set('pageSize', '1000')
  }

  url.search = normalizedSearch.toString()
  const request = new Request(url.toString(), args.request)
  const base = await baseLoader({ ...args, request })

  const columns = base.columns.includes('accepted')
    ? base.columns
    : [
        'code',
        'name',
        'whitelist',
        'meal_kit',
        'total',
        'accepted',
        'pending',
        'waitlisted',
        'declined',
        'giftcard_pc',
        'giftcard_sobeys',
        'giftcard_meal_kit',
        'household_count',
        'household_child_count',
        ...base.columns.filter(column => !['code', 'name', 'whitelist', 'meal_kit'].includes(column)),
      ]

  const rows = (base.rows ?? []).map(row => {
    return {
      ...row,
      total: null,
      accepted: null,
      pending: null,
      waitlisted: null,
      declined: null,
      giftcard_pc: null,
      giftcard_sobeys: null,
      giftcard_meal_kit: null,
      household_count: null,
      household_child_count: null,
    }
  })

  return {
    ...base,
    serverSideQuery: false,
    // This page computes the totals row from the full in-memory dataset.
    // That approach does not work for typical server-side query tables that only load one page.
    totalRows: rows.length,
    columns,
    rows,
    columnMeta: {
      ...(base.columnMeta ?? {}),
      name: {
        label: 'name',
        fitContentOnLoad: true,
        minWidth: 240,
        preferredWidth: 360,
      },
      total: { label: 'total', numeric: true },
      accepted: { label: 'accepted', numeric: true, minWidth: 90, preferredWidth: 90 },
      pending: { label: 'pending', numeric: true, minWidth: 90, preferredWidth: 90 },
      waitlisted: { label: 'waitlisted', numeric: true, minWidth: 90, preferredWidth: 90 },
      declined: { label: 'declined', numeric: true, minWidth: 90, preferredWidth: 90 },
      giftcard_pc: { label: 'PC', numeric: true, minWidth: 90, preferredWidth: 90 },
      giftcard_sobeys: { label: 'Sobeys', numeric: true, minWidth: 90, preferredWidth: 90 },
      giftcard_meal_kit: { label: 'Meal Kit', numeric: true, minWidth: 90, preferredWidth: 90 },
      household_count: { label: 'people', numeric: true, minWidth: 90, preferredWidth: 90 },
      household_child_count: { label: 'children', numeric: true, minWidth: 90, preferredWidth: 90 },
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
