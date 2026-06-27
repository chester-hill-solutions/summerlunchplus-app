import { useMemo } from 'react'
import { useOutletContext } from 'react-router'

import TableDisplay from './table-display'

import type { PersonLoaderData } from './person.shared'

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
          : ''

        return {
          occurred_at: event.occurred_at,
          source: sourceLabel,
          source_detail: sourceDetail,
          success: successLabel,
          email: event.login_email ?? '-',
          ip_selected: event.ip_selected ?? '-',
          source_confidence: [event.ip_selected_source, event.ip_parse_confidence].filter(Boolean).join(' / ') || '-',
          classification:
            classificationLabel[event.ip_classification ?? 'unknown'] ?? event.ip_classification ?? 'Unknown',
          confidence: event.ip_confidence_level ?? '-',
          why: event.ip_reason_text ?? '-',
          reason_codes: reasonCodes || '-',
          proxy_match:
            event.proxy_provider_match && event.proxy_match_cidr
              ? `${event.proxy_provider_match} ${event.proxy_match_cidr}`
              : '-',
          classifier_version: event.ip_classifier_version ?? '-',
          ip_legacy: event.ip_legacy ?? '-',
          ip_candidate: event.ip_candidate ?? '-',
          parsed_ip: event.ip_address ?? '-',
          geo_status: geoStatusLabel[event.geo_status],
          geo: geoLabel,
          geo_reason: event.geo_reason,
          forwarded_chain: event.forwarded_for ?? '-',
          event_id: event.event_id,
        }
      }),
    [activityEvents, formNameById]
  )

  const columns = [
    'occurred_at',
    'source',
    'source_detail',
    'success',
    'email',
    'ip_selected',
    'source_confidence',
    'classification',
    'confidence',
    'why',
    'reason_codes',
    'proxy_match',
    'classifier_version',
    'ip_legacy',
    'ip_candidate',
    'parsed_ip',
    'geo_status',
    'geo',
    'geo_reason',
    'forwarded_chain',
    'event_id',
  ]

  return <TableDisplay data={{
    columns,
    rows,
    label: 'Activity events',
    tableName: 'person-activity',
    columnMeta: {
      occurred_at: { label: 'When', preferredWidth: 190 },
      source: { label: 'Source', preferredWidth: 150 },
      source_detail: { label: 'Source detail', preferredWidth: 200 },
      success: { label: 'Success', preferredWidth: 110 },
      email: { label: 'Email', preferredWidth: 220 },
      ip_selected: { label: 'IP selected (v2)', preferredWidth: 180 },
      source_confidence: { label: 'Source/confidence', preferredWidth: 220 },
      classification: { label: 'Classification', preferredWidth: 180 },
      confidence: { label: 'Confidence', preferredWidth: 130 },
      why: { label: 'Why', preferredWidth: 360, truncate: true },
      reason_codes: { label: 'Reason codes', preferredWidth: 300, truncate: true },
      proxy_match: { label: 'Proxy match', preferredWidth: 220 },
      classifier_version: { label: 'Classifier', preferredWidth: 120 },
      ip_legacy: { label: 'IP legacy', preferredWidth: 180 },
      ip_candidate: { label: 'IP candidate', preferredWidth: 180 },
      parsed_ip: { label: 'Parsed IP', preferredWidth: 170 },
      geo_status: { label: 'Geo status', preferredWidth: 180 },
      geo: { label: 'Geo', preferredWidth: 220 },
      geo_reason: { label: 'Reason', preferredWidth: 320, truncate: true },
      forwarded_chain: { label: 'Forwarded chain', preferredWidth: 300, truncate: true },
      event_id: { label: 'Event ID', preferredWidth: 250, truncate: true },
    },
  }} />
}
