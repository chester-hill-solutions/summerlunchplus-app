import type { Json } from '@/lib/database.types'

export type SuspiciousSignalType =
  | 'address_mismatch'
  | 'network_distance_anomaly'
  | 'non_whitelisted_riding'
  | 'cross_family_exact_address'
  | 'ip_profile_location_mismatch'

export type SignalSeverity = 'low' | 'medium' | 'high'

type AddressProfile = {
  id: string
  user_id?: string | null
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
  street_address: string | null
  city: string | null
  province: string | null
  postcode: string | null
  address_fingerprint?: string | null
}

type SubmissionSnapshot = {
  id: string
  profile_id: string
  submitted_at: string
  ip_address: string | null
  metadata: Json
}

export type IpLocationEvidence = {
  event_id: string
  source: 'form_submission' | 'login_event'
  occurred_at: string
  ip_address: string
  country_code: string | null
  region: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  provider: string | null
}

const SEVERITY_PRIORITY: Record<SignalSeverity, number> = {
  low: 100,
  medium: 200,
  high: 300,
}

const SIGNAL_PRIORITY_BONUS: Record<SuspiciousSignalType, number> = {
  address_mismatch: 10,
  network_distance_anomaly: 20,
  non_whitelisted_riding: 5,
  cross_family_exact_address: 30,
  ip_profile_location_mismatch: 40,
}

const PROVINCE_CANONICAL_BY_INPUT: Record<string, string> = {
  ab: 'ab',
  alberta: 'ab',
  bc: 'bc',
  britishcolumbia: 'bc',
  mb: 'mb',
  manitoba: 'mb',
  nb: 'nb',
  newbrunswick: 'nb',
  nl: 'nl',
  newfoundlandandlabrador: 'nl',
  ns: 'ns',
  novascotia: 'ns',
  nt: 'nt',
  northwestterritories: 'nt',
  nu: 'nu',
  nunavut: 'nu',
  on: 'on',
  ontario: 'on',
  pe: 'pe',
  princeedwardisland: 'pe',
  qc: 'qc',
  quebec: 'qc',
  sk: 'sk',
  saskatchewan: 'sk',
  yt: 'yt',
  yukon: 'yt',
}

const CANADIAN_PROVINCE_CODES = new Set(['ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'nt', 'nu', 'on', 'pe', 'qc', 'sk', 'yt'])

const normalizeText = (value: string | null | undefined) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const normalizePostcode = (value: string | null | undefined) =>
  normalizeText(value).replace(/[^a-z0-9]/g, '')

const normalizeProvince = (value: string | null | undefined) =>
  normalizeText(value).replace(/[^a-z0-9]/g, '')

const canonicalProvince = (value: string | null | undefined) => {
  const normalized = normalizeProvince(value)
  if (!normalized) return ''
  return PROVINCE_CANONICAL_BY_INPUT[normalized] ?? normalized
}

const profileLabel = (profile: Pick<AddressProfile, 'firstname' | 'surname' | 'email' | 'id'>) => {
  const fullName = [profile.firstname, profile.surname].filter(Boolean).join(' ').trim()
  if (fullName) return fullName
  if (profile.email) return profile.email
  return profile.id.slice(0, 8)
}

const normalizedAddressFingerprint = (profile: AddressProfile) => {
  const generatedFingerprint = normalizeText(profile.address_fingerprint)
  if (generatedFingerprint) return generatedFingerprint

  const parts = [
    normalizeText(profile.street_address),
    normalizeText(profile.city),
    normalizeText(profile.province),
    normalizePostcode(profile.postcode),
  ]
  if (!parts.some(Boolean)) return ''
  return parts.join('|')
}

export const computeSignalPriority = (
  signalType: SuspiciousSignalType,
  severity: SignalSeverity,
  details?: Record<string, Json>
) => {
  const base = SEVERITY_PRIORITY[severity] + SIGNAL_PRIORITY_BONUS[signalType]
  const detailBoost =
    signalType === 'cross_family_exact_address' && typeof details?.outside_family_match_count === 'number'
      ? Math.min(25, Math.max(0, Number(details.outside_family_match_count) * 3))
      : signalType === 'ip_profile_location_mismatch' && typeof details?.mismatch_count === 'number'
        ? Math.min(25, Math.max(0, Number(details.mismatch_count) * 4))
        : 0

  const score = base + detailBoost
  return {
    score,
    reason: `severity=${severity};type=${signalType};detail_boost=${detailBoost}`,
  }
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
    severity: 'medium' as SignalSeverity,
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
    severity: (hasLargeOffsetGap ? 'high' : 'medium') as SignalSeverity,
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

export const detectCrossFamilyExactAddressSignal = (args: {
  subjectProfile: AddressProfile | null
  outsideFamilyMatches: AddressProfile[]
}) => {
  const { subjectProfile, outsideFamilyMatches } = args
  if (!subjectProfile || !outsideFamilyMatches.length) return null

  const subjectFingerprint = normalizedAddressFingerprint(subjectProfile)
  if (!subjectFingerprint) return null

  const uniqueOutsideMatches = Array.from(
    new Map(
      outsideFamilyMatches
        .filter(profile => profile.id && normalizedAddressFingerprint(profile) === subjectFingerprint)
        .map(profile => [profile.id, profile])
    ).values()
  )

  if (!uniqueOutsideMatches.length) return null

  const severity: SignalSeverity = uniqueOutsideMatches.length >= 3 ? 'high' : 'medium'

  return {
    severity,
    title: 'Cross-family exact address match',
    summary:
      uniqueOutsideMatches.length === 1
        ? 'Exact normalized address is shared with 1 profile outside this family graph.'
        : `Exact normalized address is shared with ${uniqueOutsideMatches.length} profiles outside this family graph.`,
    details: {
      address_fingerprint: subjectFingerprint,
      outside_family_match_count: uniqueOutsideMatches.length,
      outside_family_profiles: uniqueOutsideMatches.slice(0, 10).map(profile => ({
        profile_id: profile.id,
        role: profile.role,
        label: profileLabel(profile),
        street_address: profile.street_address,
        city: profile.city,
        province: profile.province,
        postcode: profile.postcode,
      })),
    },
  }
}

export const detectIpProfileLocationMismatchSignal = (args: {
  subjectProfile: AddressProfile | null
  events: IpLocationEvidence[]
}) => {
  const { subjectProfile, events } = args
  if (!subjectProfile || !events.length) return null

  const profileProvince = canonicalProvince(subjectProfile.province)
  if (!profileProvince) return null
  const profileCountryCode = CANADIAN_PROVINCE_CODES.has(profileProvince) ? 'ca' : null

  const mismatches = events
    .map(event => {
      const eventProvince = canonicalProvince(event.region)
      const eventCountryCode = normalizeText(event.country_code)
      const provinceMismatch = Boolean(eventProvince && eventProvince !== profileProvince)
      const countryMismatch = Boolean(profileCountryCode && eventCountryCode && eventCountryCode !== profileCountryCode)
      if (!provinceMismatch && !countryMismatch) return null
      return {
        ...event,
        distance_km: null as number | null,
        province_mismatch: provinceMismatch,
        country_mismatch: countryMismatch,
      }
    })
    .filter(
      (
        event
      ): event is IpLocationEvidence & {
        distance_km: number | null
        province_mismatch: boolean
        country_mismatch: boolean
      } => Boolean(event)
    )

  if (!mismatches.length) return null

  const uniqueRegions = new Set(mismatches.map(event => normalizeProvince(event.region)))
  const countryMismatchCount = mismatches.filter(event => event.country_mismatch).length
  const explicitDistances = mismatches
    .map(event => event.distance_km)
    .filter((distance): distance is number => typeof distance === 'number' && Number.isFinite(distance))
  const maxDistanceKm = explicitDistances.length ? Math.round(Math.max(...explicitDistances)) : null
  const hasLargeDistance = typeof maxDistanceKm === 'number' && maxDistanceKm > 1000

  const severity: SignalSeverity =
    countryMismatchCount > 0 || hasLargeDistance || (mismatches.length >= 3 && uniqueRegions.size >= 2)
      ? 'high'
      : 'medium'

  return {
    severity,
    title: 'IP location mismatch vs profile location',
    summary:
      severity === 'high'
        ? 'Recent request IP geolocation repeatedly conflicts with the profile location.'
        : 'Recent request IP geolocation conflicts with the profile location.',
    details: {
      profile_location: {
        province: subjectProfile.province,
        normalized_province: profileProvince,
        inferred_country_code: profileCountryCode,
      },
      mismatch_count: mismatches.length,
      country_mismatch_count: countryMismatchCount,
      distinct_mismatch_regions: uniqueRegions.size,
      max_distance_km: maxDistanceKm,
      evidence: mismatches.slice(0, 6).map(event => ({
        event_id: event.event_id,
        source: event.source,
        occurred_at: event.occurred_at,
        occurred_at_local: formatLocalDateTime(event.occurred_at),
        ip_address: event.ip_address,
        region: event.region,
        country_code: event.country_code,
        city: event.city,
        provider: event.provider,
        distance_km: event.distance_km,
      })),
    },
  }
}
