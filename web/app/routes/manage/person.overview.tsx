import { useOutletContext } from 'react-router'

import type { PersonLoaderData } from './person.shared'
import { formatDate } from './person.shared'

export default function ManagePersonOverviewPage() {
  const { profile } = useOutletContext<PersonLoaderData>()

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Personal information</h2>
      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
        <p><span className="font-medium">Profile ID:</span> {profile.id}</p>
        <p><span className="font-medium">User ID:</span> {profile.user_id ?? '-'}</p>
        <p><span className="font-medium">Role:</span> {profile.role ?? '-'}</p>
        <p><span className="font-medium">Email:</span> {profile.email ?? '-'}</p>
        <p><span className="font-medium">Phone:</span> {profile.phone ?? '-'}</p>
        <p><span className="font-medium">DOB:</span> {formatDate(profile.date_of_birth)}</p>
        <p className="md:col-span-2"><span className="font-medium">Address:</span> {[profile.street_address, profile.city, profile.province, profile.postcode].filter(Boolean).join(', ') || '-'}</p>
      </div>
    </section>
  )
}
