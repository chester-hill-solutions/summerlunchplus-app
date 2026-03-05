import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Row = Record<string, unknown>

export function AdminDatatable({ columns, rows }: { columns: string[]; rows: Row[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {columns.map(column => (
            <TableHead key={column}>{column.replace(/_/g, ' ')}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, rowIndex) => (
          <TableRow key={`row-${rowIndex}`}>
            {columns.map(column => (
              <TableCell key={`${rowIndex}-${column}`}>
                {typeof row[column] === 'object'
                  ? JSON.stringify(row[column])
                  : row[column]?.toString() ?? ''}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
