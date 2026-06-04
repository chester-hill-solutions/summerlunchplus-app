import { useMemo } from 'react'
import { useOutletContext } from 'react-router'

import TableDisplay from './table-display'

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

  const rows = formSubmissions.map(submission => {
    const submittedBy =
      (submission.profile_id ? profileById.get(submission.profile_id) : null) ||
      (submission.user_id ? profileByUserId.get(submission.user_id) : null)

    const submittedByFallback = submission.profile_id ?? submission.user_id

    return {
      id: submission.id,
      form_id: submission.form_id,
      submitted_by: submittedBy
        ? profileLabel(submittedBy)
        : submittedByFallback
          ? submittedByFallback.slice(0, 8)
          : '-',
      form_name: formNameById[submission.form_id] ?? submission.form_id.slice(0, 8),
      submitted_at: formatDateTime(submission.submitted_at),
      submission_id: submission.id,
      view_answers: 'View answers',
    }
  })

  return (
    <TableDisplay
      data={{
        columns: ['submitted_by', 'form_name', 'submitted_at', 'submission_id', 'view_answers'],
        rows,
        label: 'Form submissions',
        tableName: 'person-form-submissions',
        columnMeta: {
          submitted_by: { label: 'Submitted by' },
          form_name: { label: 'Form' },
          submitted_at: { label: 'Submitted at' },
          submission_id: { label: 'Submission ID', truncate: true },
          view_answers: { label: 'Answers', filterable: false },
        },
      }}
    />
  )
}
