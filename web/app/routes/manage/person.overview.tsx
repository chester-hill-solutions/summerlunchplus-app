import { useOutletContext } from 'react-router'

import type { PersonLoaderData } from './person.shared'
import { formatDate, formatDateTime } from './person.shared'

export default function ManagePersonOverviewPage() {
  const { profile, ipEvidence } = useOutletContext<PersonLoaderData>()

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

      <div className="mt-4 border-t pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent IP and geo evidence</h3>
        {ipEvidence.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No recent IP records for this profile.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {ipEvidence.slice(0, 4).map((entry, index) => (
              <li key={`${entry.source}-${entry.occurred_at}-${index}`} className="rounded border bg-muted/20 p-2">
                <p>
                  <span className="font-medium">Source:</span> {entry.source === 'form_submission' ? 'Form submission' : 'Login event'}
                </p>
                <p><span className="font-medium">When:</span> {formatDateTime(entry.occurred_at)}</p>
                <p><span className="font-medium">IP:</span> {entry.ip_address}</p>
                <p>
                  <span className="font-medium">Geo:</span>{' '}
                  {[entry.city, entry.region, entry.country_code].filter(Boolean).join(', ') || 'Unknown'}
                </p>
                <p>
                  <span className="font-medium">Timezone:</span> {entry.timezone ?? 'Unknown'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
