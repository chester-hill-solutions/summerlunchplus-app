import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-attendance-audit')

export async function loader(args: Parameters<typeof baseLoader>[0]) {
  const base = await baseLoader(args)
  const baseColumnMeta = (base.columnMeta ?? {}) as Record<string, unknown>

  return {
    ...base,
    columnMeta: {
      ...baseColumnMeta,
      changed_fields: {
        label: 'Changed fields',
        filterable: false,
        truncate: false,
        preferredWidth: 520,
        minWidth: 340,
      },
    },
  }
}

export default function ClassAttendanceAuditTablePage() {
  return <TableDisplay />
}
