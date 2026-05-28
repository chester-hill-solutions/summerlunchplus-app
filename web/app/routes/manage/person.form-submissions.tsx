import { useMemo } from 'react'
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
import { formatDateTime, profileLabel } from './person.shared'

export default function ManagePersonFormSubmissionsPage() {
  const { formSubmissions, formNameById, familyProfiles } = useOutletContext<PersonLoaderData>()
  const profileById = useMemo(() => new Map(familyProfiles.map(profile => [profile.id, profile])), [familyProfiles])
  const profileByUserId = useMemo(
    () =>
      familyProfiles.reduce<Map<string, PersonLoaderData['familyProfiles'][number]>>((map, profile) => {
        if (profile.user_id) {
          map.set(profile.user_id, profile)
        }
        return map
      }, new Map()),
    [familyProfiles]
  )

  return (
    <section className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Form submissions</h2>
      {formSubmissions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No form submissions found for this family.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Submitted by</TableHead>
              <TableHead>Form</TableHead>
              <TableHead>Submitted at</TableHead>
              <TableHead>Submission ID</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {formSubmissions.map(submission => {
              const submittedBy =
                (submission.profile_id ? profileById.get(submission.profile_id) : null) ||
                (submission.user_id ? profileByUserId.get(submission.user_id) : null)

              const submittedByFallback = submission.profile_id ?? submission.user_id

              return (
                <TableRow key={submission.id}>
                  <TableCell>{submittedBy ? profileLabel(submittedBy) : submittedByFallback ? submittedByFallback.slice(0, 8) : '-'}</TableCell>
                  <TableCell>{formNameById[submission.form_id] ?? submission.form_id.slice(0, 8)}</TableCell>
                  <TableCell>{formatDateTime(submission.submitted_at)}</TableCell>
                  <TableCell className="font-mono text-xs">{submission.id}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </section>
  )
}
