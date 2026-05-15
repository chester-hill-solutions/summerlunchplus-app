import { useMemo } from 'react'
import { useOutletContext } from 'react-router'

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
                    <p className={`text-xs uppercase tracking-wide ${severityClassName(signal.severity)}`}>{signal.severity}</p>
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
                            <li key={`${signal.id}-${idx}`}>• {label}: {address || '-'}</li>
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
