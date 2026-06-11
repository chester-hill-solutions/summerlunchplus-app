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
