import type { Json } from '@/lib/database.types'

export type ProfileRow = {
  id: string
  user_id: string | null
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
  phone: string | null
  street_address: string | null
  city: string | null
  province: string | null
  postcode: string | null
  date_of_birth: string | null
  federal_electoral_district_name?: string | null
  riding_lookup_status?: string | null
  riding_lookup_last_attempt_at?: string | null
  riding_lookup_error?: string | null
}

export type SuspiciousSignalRow = {
  id: string
  subject_profile_id: string
  family_profile_ids: string[]
  signal_type: string
  severity: string
  priority_score: number
  priority_reason: string | null
  summary: string
  details: Json
  status: string
  created_at: string
  resolved_at: string | null
  resolution_note: string | null
}

export type PersonLoaderData = {
  profile: ProfileRow
  activityEvents: Array<{
    source: 'form_submission' | 'login_event'
    event_id: string
    occurred_at: string
    form_id: string | null
    login_method: string | null
    login_success: boolean | null
    login_email: string | null
    ip_selected: string | null
    ip_selected_source: string | null
    ip_parse_confidence: string | null
    ip_classification: string | null
    ip_confidence_level: string | null
    ip_reason_codes: Json
    ip_reason_text: string | null
    ip_classifier_version: number | null
    proxy_provider_match: string | null
    proxy_match_cidr: string | null
    cf_connecting_ip: string | null
    forwarded_for: string | null
    ip_legacy: string | null
    ip_candidate: string | null
    ip_address: string | null
    geo_status:
      | 'geo_available'
      | 'no_ip_captured'
      | 'invalid_ip_value'
      | 'geo_provider_disabled'
      | 'ip_present_not_cached'
      | 'cached_no_geo'
    geo_reason: string
    country_code: string | null
    region: string | null
    city: string | null
    org: string | null
    timezone: string | null
    latitude: number | null
    longitude: number | null
  }>
  ipEvidence: Array<{
    source: 'form_submission' | 'login_event'
    occurred_at: string
    ip_candidate: string | null
    ip_address: string | null
    geo_status:
      | 'geo_available'
      | 'no_ip_captured'
      | 'invalid_ip_value'
      | 'geo_provider_disabled'
      | 'ip_present_not_cached'
      | 'cached_no_geo'
    geo_reason: string
    country_code: string | null
    region: string | null
    city: string | null
    org: string | null
    timezone: string | null
    latitude: number | null
    longitude: number | null
  }>
  familyProfiles: ProfileRow[]
  primaryChildByGuardian: Record<string, string>
  enrollments: Array<{
    id: string
    profile_id: string | null
    workshop_id: string | null
    semester_id: string
    status: string
    requested_at: string
  }>
  workshopById: Record<string, { id: string; description: string | null; semester_id: string }>
  semesterById: Record<string, { id: string; name: string | null; starts_at: string; ends_at: string }>
  classByWorkshop: Record<string, Array<{ id: string; starts_at: string; ends_at: string }>>
  attendanceByClass: Record<string, Array<{ profile_id: string; status: string | null }>>
  formSubmissions: Array<{
    id: string
    profile_id: string | null
    user_id: string | null
    form_id: string
    submitted_at: string
  }>
  formNameById: Record<string, string>
  suspiciousSignals: SuspiciousSignalRow[]
  federalDistrictOptions: Array<{ value: string; label: string }>
  familyFormAnswers: {
    giftcard_display: string
    prior_participation_display: string
  }
}

export const formatDate = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

export const formatDateTime = (value: string | null) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export const profileLabel = (profile: ProfileRow) => {
  const fullName = [profile.firstname, profile.surname].filter(Boolean).join(' ').trim()
  return fullName || profile.email || profile.id.slice(0, 8)
}
