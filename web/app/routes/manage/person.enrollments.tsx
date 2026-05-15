import { Link, useOutletContext } from 'react-router'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { PersonLoaderData } from './person.shared'
import { formatDateTime, profileLabel } from './person.shared'

const hasSignalForProfile = (
  profileId: string | null,
  signals: PersonLoaderData['suspiciousSignals']
) => {
  if (!profileId) return false
  return signals.some(signal => signal.status === 'open' && signal.family_profile_ids.includes(profileId))
}

export default function ManagePersonEnrollmentsPage() {
  const { enrollments, workshopById, semesterById, familyProfiles, suspiciousSignals } = useOutletContext<PersonLoaderData>()
  const profileById = new Map(familyProfiles.map(item => [item.id, item]))

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Workshop enrollments</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Profile</TableHead>
            <TableHead>Semester</TableHead>
            <TableHead>Workshop</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Requested</TableHead>
            <TableHead>Signal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {enrollments.map(enrollment => {
            const enrolledProfile = enrollment.profile_id ? profileById.get(enrollment.profile_id) : null
            const workshop = enrollment.workshop_id ? workshopById[enrollment.workshop_id] : null
            const semester = semesterById[enrollment.semester_id]
            const hasSignal = hasSignalForProfile(enrollment.profile_id, suspiciousSignals)

            return (
              <TableRow key={enrollment.id} className={hasSignal ? 'bg-amber-50' : ''}>
                <TableCell>{enrolledProfile ? profileLabel(enrolledProfile) : '-'}</TableCell>
                <TableCell>{semester?.name ?? enrollment.semester_id.slice(0, 8)}</TableCell>
                <TableCell>{workshop?.description ?? '-'}</TableCell>
                <TableCell className="capitalize">{enrollment.status}</TableCell>
                <TableCell>{formatDateTime(enrollment.requested_at)}</TableCell>
                <TableCell>
                  {hasSignal ? (
                    <Link
                      to={`/manage/person/discrepancies?profileId=${encodeURIComponent(enrollment.profile_id ?? '')}`}
                      className="font-medium text-amber-800 underline decoration-dotted underline-offset-2"
                    >
                      Review signal
                    </Link>
                  ) : (
                    '-'
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </section>
  )
}
