import { useOutletContext } from 'react-router'

import type { PersonLoaderData } from './person.shared'
import { formatDate, formatDateTime } from './person.shared'

const geoStatusLabel: Record<PersonLoaderData['ipEvidence'][number]['geo_status'], string> = {
  geo_available: 'Geo available',
  no_ip_captured: 'No IP captured',
  invalid_ip_value: 'Invalid IP value',
  geo_provider_disabled: 'Geo provider disabled',
  ip_present_not_cached: 'IP present, lookup not cached',
  cached_no_geo: 'Lookup cached, no geo result',
}

export default function ManagePersonOverviewPage() {
  const { profile, ipEvidence, familyProfiles, primaryChildByGuardian } = useOutletContext<PersonLoaderData>()
  const familyProfileById = new Map(familyProfiles.map(item => [item.id, item]))

  const relatedProfile = (() => {
    if (profile.role === 'guardian') {
      const childId = primaryChildByGuardian[profile.id]
      return childId ? familyProfileById.get(childId) ?? null : null
    }

    if (profile.role === 'student') {
      const primaryGuardian = familyProfiles.find(
        member => member.role === 'guardian' && primaryChildByGuardian[member.id] === profile.id
      )
      return primaryGuardian ?? familyProfiles.find(member => member.role === 'guardian') ?? null
    }

    return familyProfiles.find(member => member.id !== profile.id) ?? null
  })()

  const profileAddress = [profile.street_address, profile.city, profile.province, profile.postcode]
    .filter(Boolean)
    .join(', ')
  const relatedAddress = relatedProfile
    ? [relatedProfile.street_address, relatedProfile.city, relatedProfile.province, relatedProfile.postcode]
        .filter(Boolean)
        .join(', ')
    : ''

  return (
    <section className="rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Personal information</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Selected profile</h3>
          <div className="grid gap-2">
            <p><span className="font-medium">Profile ID:</span> {profile.id}</p>
            <p><span className="font-medium">User ID:</span> {profile.user_id ?? '-'}</p>
            <p><span className="font-medium">Role:</span> {profile.role ?? '-'}</p>
            <p><span className="font-medium">Email:</span> {profile.email ?? '-'}</p>
            <p><span className="font-medium">Phone:</span> {profile.phone ?? '-'}</p>
            <p><span className="font-medium">DOB:</span> {formatDate(profile.date_of_birth)}</p>
            <p><span className="font-medium">Address:</span> {profileAddress || '-'}</p>
          </div>
        </div>

        <div className="rounded-md border bg-muted/20 p-3 text-sm">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {profile.role === 'guardian' ? 'Primary child profile' : 'Related guardian profile'}
          </h3>
          {relatedProfile ? (
            <div className="grid gap-2">
              <p><span className="font-medium">Profile ID:</span> {relatedProfile.id}</p>
              <p><span className="font-medium">User ID:</span> {relatedProfile.user_id ?? '-'}</p>
              <p><span className="font-medium">Role:</span> {relatedProfile.role ?? '-'}</p>
              <p><span className="font-medium">Email:</span> {relatedProfile.email ?? '-'}</p>
              <p><span className="font-medium">Phone:</span> {relatedProfile.phone ?? '-'}</p>
              <p><span className="font-medium">DOB:</span> {formatDate(relatedProfile.date_of_birth)}</p>
              <p><span className="font-medium">Address:</span> {relatedAddress || '-'}</p>
            </div>
          ) : (
            <p className="text-muted-foreground">No related child/guardian profile found.</p>
          )}
        </div>
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
                <p><span className="font-medium">IP candidate:</span> {entry.ip_candidate ?? '-'}</p>
                <p><span className="font-medium">Parsed IP:</span> {entry.ip_address ?? '-'}</p>
                <p>
                  <span className="font-medium">Geo:</span>{' '}
                  {[entry.city, entry.region, entry.country_code].filter(Boolean).join(', ') || '-'}
                </p>
                <p><span className="font-medium">Geo status:</span> {geoStatusLabel[entry.geo_status]}</p>
                <p><span className="font-medium">Reason:</span> {entry.geo_reason}</p>
                <p>
                  <span className="font-medium">Timezone:</span> {entry.timezone ?? '-'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
