import { AdminDatatable } from '@/components/admin/datatable'
import { useLoaderData } from 'react-router'

const getEmailFromValue = (value?: unknown) => {
  if (!value || typeof value !== 'object') return ''
  return (value as { email?: string }).email ?? ''
}

const getRowValue = (column: string, row: Record<string, unknown>) => {
  if (column === 'user_email') {
    return getEmailFromValue(row.user) || (typeof row.user_email === 'string' ? row.user_email : '')
  }
  if (column === 'assigned_by_email') {
    return getEmailFromValue(row.assigned_by) || (typeof row.assigned_by_email === 'string' ? row.assigned_by_email : '')
  }
  if (column === 'decided_by_email') {
    return getEmailFromValue(row.decided_by) || (typeof row.decided_by_email === 'string' ? row.decided_by_email : '')
  }
  if (column === 'inviter_user_email') return getEmailFromValue(row.inviter_user)
  if (column === 'invitee_user_email') return getEmailFromValue(row.invitee_user)
  const value = row[column]
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return value?.toString() ?? ''
}

export default function TableDisplay() {
  const { columns, rows, label } = useLoaderData()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{label}</h1>
        <p className="text-sm text-muted-foreground">Showing live entries from the {label.toLowerCase()} table.</p>
      </div>
      <AdminDatatable columns={columns} rows={rows as Record<string, unknown>[]} getCellValue={getRowValue} />
    </div>
  )
}
