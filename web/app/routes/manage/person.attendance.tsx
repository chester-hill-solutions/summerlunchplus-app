import { useOutletContext } from 'react-router'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { PersonLoaderData } from './person.shared'
import { formatDateTime } from './person.shared'

export default function ManagePersonAttendancePage() {
  const { classByWorkshop, attendanceByClass, workshopById } = useOutletContext<PersonLoaderData>()

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Class schedule and attendance</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Workshop</TableHead>
            <TableHead>Class starts</TableHead>
            <TableHead>Class ends</TableHead>
            <TableHead>Attendance present</TableHead>
            <TableHead>Attendance absent</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Object.entries(classByWorkshop).flatMap(([workshopId, classes]) =>
            classes.map(classRow => {
              const attendanceRows = attendanceByClass[classRow.id] ?? []
              const present = attendanceRows.filter(row => row.status === 'present').length
              const absent = attendanceRows.filter(row => row.status === 'absent').length
              return (
                <TableRow key={classRow.id}>
                  <TableCell>{workshopById[workshopId]?.description ?? workshopId.slice(0, 8)}</TableCell>
                  <TableCell>{formatDateTime(classRow.starts_at)}</TableCell>
                  <TableCell>{formatDateTime(classRow.ends_at)}</TableCell>
                  <TableCell>{present}</TableCell>
                  <TableCell>{absent}</TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </section>
  )
}
