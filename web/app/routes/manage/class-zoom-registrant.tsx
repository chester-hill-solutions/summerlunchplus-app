import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/class-zoom-registrant'
import TableDisplay from './table-display'
import { createTableAction } from './table-actions.server'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-zoom-registrant')

type RegistrantRow = Record<string, unknown> & {
  class_id?: string
  class_display?: { label?: unknown; timestamp?: unknown } | string | null
}

const classLabel = (value: RegistrantRow['class_display']) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof value.label === 'string') return value.label
  return 'Workshop'
}

const classTimestamp = (value: RegistrantRow['class_display']) => {
  if (value && typeof value === 'object' && typeof value.timestamp === 'string') return value.timestamp
  return null
}

export async function loader(args: Route.LoaderArgs) {
  const base = await baseLoader(args)
  const rows = (base.rows ?? []) as RegistrantRow[]
  const classIds = Array.from(new Set(rows.map(row => (typeof row.class_id === 'string' ? row.class_id : '')).filter(Boolean)))
  const { supabase } = createClient(args.request)

  const { data: classRows } = classIds.length
    ? await supabase.from('class').select('id, ends_at').in('id', classIds)
    : { data: [] as Array<{ id: string; ends_at: string | null }> }
  const classById = new Map((classRows ?? []).map(row => [row.id, row]))

  return {
    ...base,
    rows: rows.map(row => ({
      ...row,
      workshop_description: classLabel(row.class_display),
      class_starts_at: classTimestamp(row.class_display),
      class_ends_at:
        typeof row.class_id === 'string' && classById.get(row.class_id)?.ends_at
          ? classById.get(row.class_id)?.ends_at ?? null
          : null,
    })),
    columns: [
      'workshop_description',
      'class_starts_at',
      'class_ends_at',
      ...(base.columns ?? []).filter(column => column !== 'class_display'),
    ],
    columnMeta: {
      ...(base.columnMeta ?? {}),
      workshop_description: { label: 'Workshop', filterable: true },
      class_starts_at: { label: 'Class starts', filterable: true },
      class_ends_at: { label: 'Class ends', filterable: true },
    },
  }
}

export const action = createTableAction('class-zoom-registrant')

export default function ClassZoomRegistrantTablePage() {
  return <TableDisplay />
}
