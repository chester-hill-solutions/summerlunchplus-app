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
import { formatDateTime } from './person.shared'

const geoStatusLabel: Record<PersonLoaderData['activityEvents'][number]['geo_status'], string> = {
  geo_available: 'Geo available',
  no_ip_captured: 'No IP captured',
  invalid_ip_value: 'Invalid IP value',
  geo_provider_disabled: 'Geo provider disabled',
  ip_present_not_cached: 'IP present, lookup not cached',
  cached_no_geo: 'Lookup cached, no geo result',
}

const classificationLabel: Record<string, string> = {
  client_confirmed: 'Client confirmed',
  likely_client: 'Likely client',
  ambiguous: 'Spectrum / ambiguous',
  likely_proxy: 'Likely proxy',
  proxy_confirmed: 'Proxy confirmed',
  unknown: 'Unknown',
}

export default function ManagePersonActivityPage() {
  const { activityEvents, formNameById } = useOutletContext<PersonLoaderData>()

  const rows = useMemo(
    () =>
      activityEvents.map(event => {
        const sourceLabel = event.source === 'form_submission' ? 'Form submission' : 'Login event'
        const sourceDetail =
          event.source === 'form_submission'
            ? event.form_id
              ? formNameById[event.form_id] ?? event.form_id.slice(0, 8)
              : '-'
            : event.login_method ?? '-'

        const successLabel = event.source === 'login_event'
          ? event.login_success === null
            ? '-'
            : event.login_success
              ? 'Yes'
              : 'No'
          : '-'

        const geoLabel = [event.city, event.region, event.country_code].filter(Boolean).join(', ') || '-'
        const reasonCodes = Array.isArray(event.ip_reason_codes)
          ? event.ip_reason_codes.filter(code => typeof code === 'string').join(', ')
          : '-'

        return {
          ...event,
          sourceLabel,
          sourceDetail,
          successLabel,
          geoLabel,
          reasonCodes,
          classificationLabel:
            classificationLabel[event.ip_classification ?? 'unknown'] ?? event.ip_classification ?? 'Unknown',
        }
      }),
    [activityEvents, formNameById]
  )

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Latest submission and login events</h2>
        <p className="text-xs text-muted-foreground">
          Shows raw IP capture fields, parsed IP, geolocation status, and explicit reason when location is unknown.
        </p>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Source detail</TableHead>
            <TableHead>Success</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>IP selected (v2)</TableHead>
            <TableHead>Source/confidence</TableHead>
            <TableHead>Classification</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Why</TableHead>
            <TableHead>Reason codes</TableHead>
            <TableHead>Proxy match</TableHead>
            <TableHead>Classifier</TableHead>
            <TableHead>IP legacy</TableHead>
            <TableHead>IP candidate</TableHead>
            <TableHead>Parsed IP</TableHead>
            <TableHead>Geo status</TableHead>
            <TableHead>Geo</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Forwarded chain</TableHead>
            <TableHead>Event ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={21} className="text-center text-sm text-muted-foreground">
                No recent submission or login events for this person.
              </TableCell>
            </TableRow>
          ) : (
            rows.map(row => (
              <TableRow key={`${row.source}-${row.event_id}-${row.occurred_at}`}>
                <TableCell>{formatDateTime(row.occurred_at)}</TableCell>
                <TableCell>{row.sourceLabel}</TableCell>
                <TableCell>{row.sourceDetail}</TableCell>
                <TableCell>{row.successLabel}</TableCell>
                <TableCell>{row.login_email ?? '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.ip_selected ?? '-'}</TableCell>
                <TableCell className="font-mono text-xs">
                  {[row.ip_selected_source, row.ip_parse_confidence].filter(Boolean).join(' / ') || '-'}
                </TableCell>
                <TableCell>{row.classificationLabel}</TableCell>
                <TableCell>{row.ip_confidence_level ?? '-'}</TableCell>
                <TableCell className="max-w-[24rem]" title={row.ip_reason_text ?? undefined}>
                  {row.ip_reason_text ?? '-'}
                </TableCell>
                <TableCell className="max-w-[16rem] truncate" title={row.reasonCodes}>
                  {row.reasonCodes}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.proxy_provider_match && row.proxy_match_cidr
                    ? `${row.proxy_provider_match} ${row.proxy_match_cidr}`
                    : '-'}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.ip_classifier_version ?? '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.ip_legacy ?? '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.ip_candidate ?? '-'}</TableCell>
                <TableCell className="font-mono text-xs">{row.ip_address ?? '-'}</TableCell>
                <TableCell>{geoStatusLabel[row.geo_status]}</TableCell>
                <TableCell>{row.geoLabel}</TableCell>
                <TableCell className="max-w-[22rem]">{row.geo_reason}</TableCell>
                <TableCell className="max-w-[18rem] truncate" title={row.forwarded_for ?? undefined}>
                  {row.forwarded_for ?? '-'}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.event_id.slice(0, 8)}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  )
}
