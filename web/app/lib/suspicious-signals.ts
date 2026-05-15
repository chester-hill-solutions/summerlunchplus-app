import type { Json } from '@/lib/database.types'

type AddressProfile = {
  id: string
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
  street_address: string | null
  city: string | null
  province: string | null
  postcode: string | null
}

type SubmissionSnapshot = {
  id: string
  profile_id: string
  submitted_at: string
  ip_address: string | null
  metadata: Json
}

const normalizeText = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const normalizePostcode = (value: string | null | undefined) =>
  normalizeText(value).replace(/[^a-z0-9]/g, '')

const profileLabel = (profile: Pick<AddressProfile, 'firstname' | 'surname' | 'email' | 'id'>) => {
  const fullName = [profile.firstname, profile.surname].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  if (profile.email) return profile.email
  return profile.id.slice(0, 8)
}

const normalizedAddressFingerprint = (profile: AddressProfile) => {
  const parts = [
    normalizeText(profile.street_address),
    normalizeText(profile.city),
    normalizeText(profile.province),
    normalizePostcode(profile.postcode),
  ]
  if (!parts.some(Boolean)) return ''
  return parts.join('|')
}

const parseClientOffset = (metadata: Json): number | null => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const value = (metadata as Record<string, Json>).client_offset_minutes
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return null
}

const formatLocalDateTime = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export const detectAddressMismatchSignal = (familyProfiles: AddressProfile[]) => {
  if (!familyProfiles.length) return null

  const normalized = familyProfiles
    .map(profile => ({
      profile,
      addressFingerprint: normalizedAddressFingerprint(profile),
    }))
    .filter(entry => entry.addressFingerprint)

  if (normalized.length < 2) return null

  const uniqueFingerprints = Array.from(new Set(normalized.map(entry => entry.addressFingerprint)))
  if (uniqueFingerprints.length <= 1) return null

  return {
    severity: 'medium',
    title: 'Family address mismatch',
    summary: 'Linked family members submitted different addresses.',
    details: {
      profiles: normalized.map(entry => ({
        profile_id: entry.profile.id,
        role: entry.profile.role,
        label: profileLabel(entry.profile),
        street_address: entry.profile.street_address,
        city: entry.profile.city,
        province: entry.profile.province,
        postcode: entry.profile.postcode,
      })),
      distinct_address_count: uniqueFingerprints.length,
    },
  }
}

export const detectNetworkDistanceSignal = (submissions: SubmissionSnapshot[]) => {
  if (submissions.length < 2) return null

  const sorted = submissions
    .map(submission => {
      const timestamp = new Date(submission.submitted_at).getTime()
      return {
        ...submission,
        timestamp,
        offset: parseClientOffset(submission.metadata),
      }
    })
    .filter(entry => Number.isFinite(entry.timestamp))
    .sort((a, b) => b.timestamp - a.timestamp)

  if (sorted.length < 2) return null

  const windowEnd = sorted[0].timestamp
  const windowStart = windowEnd - 2 * 60 * 60 * 1000
  const inWindow = sorted.filter(entry => entry.timestamp >= windowStart)
  const offsets = inWindow.map(entry => entry.offset).filter((value): value is number => value !== null)

  const distinctIps = new Set(inWindow.map(entry => entry.ip_address).filter((value): value is string => Boolean(value)))
  const offsetRange = offsets.length ? Math.max(...offsets) - Math.min(...offsets) : 0

  const hasLargeOffsetGap = offsetRange >= 180
  const hasManyIps = distinctIps.size >= 3
  if (!hasLargeOffsetGap && !hasManyIps) return null

  const recentEvidence = inWindow.slice(0, 4).map(entry => ({
    submission_id: entry.id,
    profile_id: entry.profile_id,
    submitted_at: entry.submitted_at,
    submitted_at_local: formatLocalDateTime(entry.submitted_at),
    ip_address: entry.ip_address,
    client_offset_minutes: entry.offset,
  }))

  return {
    severity: hasLargeOffsetGap ? 'high' : 'medium',
    title: 'Suspicious network/location pattern',
    summary: hasLargeOffsetGap
      ? 'Recent family submissions show a large timezone offset gap.'
      : 'Recent family submissions show multiple distinct IP addresses in a short window.',
    details: {
      offset_range_minutes: offsetRange,
      distinct_ip_count: distinctIps.size,
      evidence_window_hours: 2,
      recent_submissions: recentEvidence,
    },
  }
}
