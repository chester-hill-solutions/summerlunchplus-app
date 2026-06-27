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
          geo: geoLabel,
          org: event.org ?? '-',
          success: successLabel,
          email: event.login_email ?? '-',
          ip: event.ip_selected ?? event.ip_address ?? event.ip_candidate ?? event.ip_legacy ?? '-',
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
          geo_status: geoStatusLabel[event.geo_status],
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
    'geo',
    'org',
    'ip',
    'forwarded_chain',
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
    'geo_status',
    'geo_reason',
    'event_id',
  ]

  return <TableDisplay data={{
    columns,
    rows,
    label: 'Activity events',
    tableName: 'person-activity',
    enableCellClickFilter: false,
    columnMeta: {
      occurred_at: { label: 'When', preferredWidth: 190, fitContentOnLoad: true },
      source: { label: 'Source', preferredWidth: 150, fitContentOnLoad: true },
      source_detail: { label: 'Source detail', preferredWidth: 200, fitContentOnLoad: true },
      geo: { label: 'Geo', preferredWidth: 220, fitContentOnLoad: true },
      org: { label: 'Org', preferredWidth: 260, truncate: true, fitContentOnLoad: true },
      success: { label: 'Success', preferredWidth: 110, fitContentOnLoad: true },
      email: { label: 'Email', preferredWidth: 220, fitContentOnLoad: true },
      ip: { label: 'IP', preferredWidth: 170, fitContentOnLoad: true },
      ip_selected: { label: 'IP selected (v2)', preferredWidth: 180, fitContentOnLoad: true },
      source_confidence: { label: 'Source/confidence', preferredWidth: 220, fitContentOnLoad: true },
      classification: { label: 'Classification', preferredWidth: 180, fitContentOnLoad: true },
      confidence: { label: 'Confidence', preferredWidth: 130, fitContentOnLoad: true },
      why: { label: 'Why', preferredWidth: 360, truncate: true, fitContentOnLoad: true },
      reason_codes: { label: 'Reason codes', preferredWidth: 300, truncate: true, fitContentOnLoad: true },
      proxy_match: { label: 'Proxy match', preferredWidth: 220, fitContentOnLoad: true },
      classifier_version: { label: 'Classifier', preferredWidth: 120, fitContentOnLoad: true },
      ip_legacy: { label: 'IP legacy', preferredWidth: 180, fitContentOnLoad: true },
      geo_status: { label: 'Geo status', preferredWidth: 180, fitContentOnLoad: true },
      geo_reason: { label: 'Reason', preferredWidth: 320, truncate: true, fitContentOnLoad: true },
      forwarded_chain: { label: 'Forwarded chain', preferredWidth: 300, truncate: true, fitContentOnLoad: true },
      event_id: { label: 'Event ID', preferredWidth: 250, truncate: true, fitContentOnLoad: true },
    },
  }} />
}
