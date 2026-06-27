import { useMemo } from 'react'
import { Link, useLocation, useOutletContext } from 'react-router'

import type { Json } from '@/lib/database.types'

import type { PersonLoaderData } from './person.shared'
import { formatDateTime, profileLabel } from './person.shared'

const toRecord = (value: Json) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, Json>
}

const severityClassName = (severity: string) => {
  if (severity === 'high') return 'text-red-700'
  if (severity === 'medium') return 'text-amber-700'
  return 'text-slate-700'
}

export default function ManagePersonDiscrepanciesPage() {
  const { suspiciousSignals, familyProfiles } = useOutletContext<PersonLoaderData>()
  const profileById = useMemo(() => new Map(familyProfiles.map(profile => [profile.id, profile])), [familyProfiles])
  const location = useLocation()
  const returnTo = `${location.pathname}${location.search}`

  const openSignals = suspiciousSignals.filter(signal => signal.status === 'open')
  const closedSignals = suspiciousSignals.filter(signal => signal.status !== 'open')

  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Open discrepancy signals</h2>
        {openSignals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open discrepancy signals for this family.</p>
        ) : (
          <div className="space-y-3">
            {openSignals.map(signal => {
              const details = toRecord(signal.details)
              const title = typeof details?.title === 'string' ? details.title : signal.signal_type.replace(/_/g, ' ')

              return (
                <article key={signal.id} className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{title}</p>
                    <p className={`text-xs uppercase tracking-wide ${severityClassName(signal.severity)}`}>
                      {signal.severity} · p{signal.priority_score}
                    </p>
                  </div>
                  <p className="mt-1 text-sm text-foreground">{signal.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Created {formatDateTime(signal.created_at)}</p>

                  {signal.signal_type === 'address_mismatch' ? (
                    <div className="mt-2 rounded border bg-background p-2 text-xs">
                      <p className="font-medium">Address evidence</p>
                      <ul className="mt-1 space-y-1">
                        {(Array.isArray(details?.profiles) ? details?.profiles : []).map((entry, idx) => {
                          const row = toRecord(entry as Json)
                          const profileId = typeof row?.profile_id === 'string' ? row.profile_id : ''
                          const profile = profileById.get(profileId)
                          const label = profile ? profileLabel(profile) : (typeof row?.label === 'string' ? row.label : profileId)
                          const address = [row?.street_address, row?.city, row?.province, row?.postcode]
                            .map(value => (typeof value === 'string' ? value : ''))
                            .filter(Boolean)
                            .join(', ')
                          return (
                            <li key={`${signal.id}-${idx}`}>
                              • {profileId ? (
                                <Link
                                  to={{
                                    pathname: '/manage/person',
                                    search: new URLSearchParams({ profileId, returnTo }).toString(),
                                  }}
                                  className="underline decoration-dotted underline-offset-2 hover:text-primary"
                                >
                                  {label}
                                </Link>
                              ) : (
                                label
                              )}: {address || '-'}
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {signal.signal_type === 'network_distance_anomaly' ? (
                    <div className="mt-2 rounded border bg-background p-2 text-xs">
                      <p className="font-medium">Network evidence</p>
                      <ul className="mt-1 space-y-1">
                        {(Array.isArray(details?.recent_submissions) ? details?.recent_submissions : []).map((entry, idx) => {
                          const row = toRecord(entry as Json)
                          const profileId = typeof row?.profile_id === 'string' ? row.profile_id : ''
                          const profile = profileById.get(profileId)
                          const label = profile ? profileLabel(profile) : profileId
                          const submittedAt = typeof row?.submitted_at_local === 'string' ? row.submitted_at_local : '-'
                          const ip = typeof row?.ip_address === 'string' ? row.ip_address : 'n/a'
                          const offset = typeof row?.client_offset_minutes === 'number' ? row.client_offset_minutes :
                            typeof row?.client_offset_minutes === 'string' ? row.client_offset_minutes : 'n/a'
                          return (
                            <li key={`${signal.id}-${idx}`}>• {label}: {submittedAt} (IP {ip}, offset {String(offset)})</li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {signal.signal_type === 'non_whitelisted_riding' ? (
                    <div className="mt-2 rounded border bg-background p-2 text-xs">
                      <p className="font-medium">Riding evidence</p>
                      <ul className="mt-1 space-y-1">
                        <li>
                          • Riding:{' '}
                          {typeof details?.district_name === 'string' ? details.district_name : 'Unknown'}
                        </li>
                        <li>
                          • Whitelisted:{' '}
                          {typeof details?.whitelist === 'boolean' ? String(details.whitelist) : 'Unknown'}
                        </li>
                      </ul>
                    </div>
                  ) : null}

                  {signal.signal_type === 'cross_family_exact_address' ? (
                    <div className="mt-2 rounded border bg-background p-2 text-xs">
                      <p className="font-medium">Cross-family address evidence</p>
                      <ul className="mt-1 space-y-1">
                        <li>
                          • Outside family matches:{' '}
                          {typeof details?.outside_family_match_count === 'number'
                            ? String(details.outside_family_match_count)
                            : 'Unknown'}
                        </li>
                        {(Array.isArray(details?.outside_family_profiles) ? details?.outside_family_profiles : []).map(
                          (entry, idx) => {
                            const row = toRecord(entry as Json)
                            const profileId = typeof row?.profile_id === 'string' ? row.profile_id : ''
                            const profile = profileById.get(profileId)
                            const label = profile ? profileLabel(profile) : (typeof row?.label === 'string' ? row.label : profileId)
                            const address = [row?.street_address, row?.city, row?.province, row?.postcode]
                              .map(value => (typeof value === 'string' ? value : ''))
                              .filter(Boolean)
                              .join(', ')
                            return (
                              <li key={`${signal.id}-cross-${idx}`}>
                                • {profileId ? (
                                  <Link
                                    to={{
                                      pathname: '/manage/person',
                                      search: new URLSearchParams({ profileId, returnTo }).toString(),
                                    }}
                                    className="underline decoration-dotted underline-offset-2 hover:text-primary"
                                  >
                                    {label}
                                  </Link>
                                ) : (
                                  label
                                )}: {address || '-'}
                              </li>
                            )
                          }
                        )}
                      </ul>
                    </div>
                  ) : null}

                  {signal.signal_type === 'ip_profile_location_mismatch' ? (
                    <div className="mt-2 rounded border bg-background p-2 text-xs">
                      <p className="font-medium">IP/profile location evidence</p>
                      <ul className="mt-1 space-y-1">
                        <li>
                          • Profile province:{' '}
                          {typeof toRecord(details?.profile_location as Json)?.province === 'string'
                            ? String(toRecord(details?.profile_location as Json)?.province)
                            : 'Unknown'}
                        </li>
                        <li>
                          • Mismatch count:{' '}
                          {typeof details?.mismatch_count === 'number' ? String(details.mismatch_count) : 'Unknown'}
                        </li>
                        {(Array.isArray(details?.evidence) ? details?.evidence : []).map((entry, idx) => {
                          const row = toRecord(entry as Json)
                          const source = typeof row?.source === 'string' ? row.source : 'event'
                          const occurredAt = typeof row?.occurred_at_local === 'string' ? row.occurred_at_local : '-'
                          const ip = typeof row?.ip_address === 'string' ? row.ip_address : 'n/a'
                          const region = typeof row?.region === 'string' ? row.region : 'unknown-region'
                          const country = typeof row?.country_code === 'string' ? row.country_code : '--'
                          return (
                            <li key={`${signal.id}-ip-${idx}`}>
                              • {source}: {occurredAt} (IP {ip}, {region}, {country})
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}

                  {signal.signal_type === 'ip_org_greylist' ? (
                    <div className="mt-2 rounded border bg-background p-2 text-xs">
                      <p className="font-medium">Greylist org evidence</p>
                      <ul className="mt-1 space-y-1">
                        <li>
                          • Matches:{' '}
                          {typeof details?.greylist_match_count === 'number'
                            ? String(details.greylist_match_count)
                            : 'Unknown'}
                        </li>
                        {(Array.isArray(details?.orgs) ? details?.orgs : []).map((entry, idx) => (
                          <li key={`${signal.id}-org-${idx}`}>• Org: {typeof entry === 'string' ? entry : 'Unknown'}</li>
                        ))}
                        {(Array.isArray(details?.evidence) ? details?.evidence : []).map((entry, idx) => {
                          const row = toRecord(entry as Json)
                          const source = typeof row?.source === 'string' ? row.source : 'event'
                          const occurredAt = typeof row?.occurred_at === 'string' ? formatDateTime(row.occurred_at) : '-'
                          const ip = typeof row?.ip_address === 'string' ? row.ip_address : 'n/a'
                          const org = typeof row?.org === 'string' ? row.org : 'Unknown'
                          return (
                            <li key={`${signal.id}-grey-${idx}`}>
                              • {source}: {occurredAt} (IP {ip}, org {org})
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Recently resolved</h2>
        {closedSignals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No resolved signals recorded.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {closedSignals.slice(0, 10).map(signal => (
              <li key={signal.id}>
                {signal.signal_type.replace(/_/g, ' ')} - {signal.summary} ({formatDateTime(signal.created_at)})
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
