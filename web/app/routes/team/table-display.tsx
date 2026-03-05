import { AdminDatatable } from '@/components/admin/datatable'
import { useLoaderData } from 'react-router'

export default function TableDisplay() {
  const { columns, rows, label } = useLoaderData()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{label}</h1>
        <p className="text-sm text-muted-foreground">Showing live entries from the {label.toLowerCase()} table.</p>
      </div>
      <AdminDatatable columns={columns} rows={rows as Record<string, unknown>[]} />
    </div>
  )
}
