import { useEffect, useRef, useState } from 'react'
import { Form, useLocation, useNavigation, useSearchParams } from 'react-router'

import { Check, ChevronDown, Download, Loader2 } from 'lucide-react'
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

  const columns = base.columns.includes('accepted') && base.columns.includes('families')
    ? base.columns
    : [
        'code',
        'name',
        'whitelist',
        'meal_kit',
        'total',
        'families',
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
      families: null,
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
      families: { label: 'families', numeric: true, minWidth: 90, preferredWidth: 90 },
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

const enrollmentStatusOptions = [
  ['pending', 'Pending'],
  ['waitlisted', 'Waitlisted'],
  ['approved', 'Accepted'],
  ['rejected', 'Rejected'],
  ['revoked', 'Revoked'],
] as const

function EnrollmentStatusFilter() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.getAll('enrollmentStatus')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(selected)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setDraft(selected)
  }, [open, searchParams])

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const apply = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('enrollmentStatus')
    enrollmentStatusOptions.forEach(([value]) => {
      if (draft.includes(value)) next.append('enrollmentStatus', value)
    })
    next.delete('page')
    setSearchParams(next, { replace: true })
    setOpen(false)
  }

  const summary = selected.length ? `${selected.length} selected` : 'All statuses'

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="federal-district-enrollment-status-filter"
        onClick={() => setOpen(previous => !previous)}
      >
        Enrollment status: {summary}
        <ChevronDown className="ml-1 size-4" />
      </Button>
      {open ? (
        <div
          id="federal-district-enrollment-status-filter"
          role="dialog"
          aria-label="Filter enrollment statuses"
          className="absolute right-0 z-50 mt-2 w-64 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg"
        >
          <div className="mb-2 text-xs text-muted-foreground">Select one or more current enrollment statuses.</div>
          <div className="space-y-1" role="group" aria-label="Enrollment statuses">
            {enrollmentStatusOptions.map(([value, label]) => {
              const checked = draft.includes(value)
              return (
                <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setDraft(previous => (checked ? previous.filter(item => item !== value) : [...previous, value]))}
                    className="sr-only"
                  />
                  <span className={`flex size-4 items-center justify-center rounded border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input'}`}>
                    {checked ? <Check className="size-3" /> : null}
                  </span>
                  {label}
                </label>
              )
            })}
          </div>
          <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setDraft([])}>
              Clear
            </button>
            <div className="flex gap-2">
              <button type="button" className="rounded px-2 py-1 hover:bg-muted" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="rounded bg-primary px-2 py-1 text-primary-foreground" onClick={apply}>
                Apply
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function FederalElectoralDistrictTablePage() {
  const location = useLocation()
  const navigation = useNavigation()
  const sourcePath = `/manage/federal-electoral-district${location.search}`
  const isCreatingExport = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'create-export'

  return (
    <TableDisplay
      filterOptionsMode="client"
      paginationActions={
        <div className="flex items-center gap-2">
          <EnrollmentStatusFilter />
          <Form method="post" action="/manage/exports" className="flex items-center gap-2">
            <input type="hidden" name="intent" value="create-export" />
            <input type="hidden" name="export_type" value={EXPORT_TYPE_FEDERAL_ELECTORAL_DISTRICT_CSV} />
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
        </div>
      }
    />
  )
}
