import { adminClient } from '@/lib/supabase/adminClient'
import { resolveIpGeolocation } from '@/lib/geoip.server'
import {
  computeSignalPriority,
  detectAddressMismatchSignal,
  detectCrossFamilyExactAddressSignal,
  detectIpProfileLocationMismatchSignal,
  detectNetworkDistanceSignal,
  type IpLocationEvidence,
  type SignalSeverity,
  type SuspiciousSignalType,
} from '@/lib/suspicious-signals'

import type { Json } from '@/lib/database.types'

type FamilyEdge = {
  guardian_profile_id: string
  child_profile_id: string
}

type RidingRow = {
  name: string
  whitelist: boolean
}

type LoginEventRow = {
  id: string
  event_at: string
  ip_address: unknown
  ip_selected: unknown
  ip_chain: unknown
  forwarded_for: string | null
  metadata: Json
}

type OrgPolicyClass = 'infra_proxy' | 'consumer_isp' | 'vpn_hosting_datacenter' | 'trusted_enterprise' | 'unknown'

type OrgPolicyRow = {
  org_pattern: string
  match_mode: 'exact' | 'contains' | 'regex'
  policy_class: OrgPolicyClass
  note: string | null
  priority: number
}

const parseForwardedFirstIp = (value: string | null) => {
  if (!value) return null
  const first = value
    .split(',')
    .map(part => part.trim())
    .find(Boolean)
  return first || null
}

const parseIpChain = (value: unknown) => {
  if (!Array.isArray(value)) return [] as string[]
  return value
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
}

const collectCandidateIps = (input: {
  ip_chain?: unknown
  ip_selected?: unknown
  ip_address?: unknown
  forwarded_for?: string | null
}) => {
  const seen = new Set<string>()
  const values: string[] = []
  for (const ip of [
    ...parseIpChain(input.ip_chain),
    typeof input.ip_selected === 'string' ? input.ip_selected.trim() : '',
    typeof input.ip_address === 'string' ? input.ip_address.trim() : '',
    parseForwardedFirstIp(input.forwarded_for ?? null) ?? '',
  ]) {
    if (!ip || seen.has(ip)) continue
    seen.add(ip)
    values.push(ip)
  }
  return values
}

const matchOrgPolicy = (org: string | null, policies: OrgPolicyRow[]) => {
  if (!org) return null
  const normalized = org.trim().toLowerCase()
  if (!normalized) return null

  for (const policy of policies) {
    const pattern = policy.org_pattern.trim().toLowerCase()
    if (!pattern) continue
    if (policy.match_mode === 'exact' && normalized === pattern) return policy
    if (policy.match_mode === 'contains' && normalized.includes(pattern)) return policy
    if (policy.match_mode === 'regex') {
      try {
        if (new RegExp(pattern, 'i').test(org)) return policy
      } catch {
        continue
      }
    }
  }
  return null
}

const orgPolicyRank = (policyClass: OrgPolicyClass | null) => {
  switch (policyClass) {
    case 'consumer_isp':
      return 40
    case 'trusted_enterprise':
      return 35
    case 'unknown':
      return 25
    case 'vpn_hosting_datacenter':
      return 15
    case 'infra_proxy':
      return 5
    default:
      return 20
  }
}

const detectIpOrgGreylistSignal = (args: {
  evidence: Array<{
    event_id: string
    source: 'form_submission' | 'login_event'
    occurred_at: string
    ip_address: string
    org: string | null
    policy: OrgPolicyRow | null
  }>
}) => {
  const matches = args.evidence.filter(entry => entry.policy?.policy_class === 'vpn_hosting_datacenter')
  if (!matches.length) return null

  const uniqueOrgs = Array.from(new Set(matches.map(match => (match.org ?? '').trim()).filter(Boolean)))
  const severity: SignalSeverity = matches.length >= 3 ? 'high' : 'medium'

  return {
    severity,
    title: 'Network org greylist match',
    summary:
      uniqueOrgs.length === 1
        ? `Recent activity matched greylisted network org: ${uniqueOrgs[0]}.`
        : `Recent activity matched ${uniqueOrgs.length} greylisted network orgs.`,
    details: {
      greylist_match_count: matches.length,
      orgs: uniqueOrgs,
      evidence: matches.slice(0, 8).map(match => ({
        event_id: match.event_id,
        source: match.source,
        occurred_at: match.occurred_at,
        ip_address: match.ip_address,
        org: match.org,
        policy_pattern: match.policy?.org_pattern ?? null,
        policy_note: match.policy?.note ?? null,
      })),
    } satisfies Record<string, Json>,
  }
}

const familyGraphForProfile = async (profileId: string) => {
  const seen = new Set<string>([profileId])
  const queue: string[] = [profileId]

  while (queue.length) {
    const batch = queue.splice(0, queue.length)
    const { data: edges } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id')
      .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)

    for (const edge of (edges ?? []) as FamilyEdge[]) {
      if (!seen.has(edge.guardian_profile_id)) {
        seen.add(edge.guardian_profile_id)
        queue.push(edge.guardian_profile_id)
      }
      if (!seen.has(edge.child_profile_id)) {
        seen.add(edge.child_profile_id)
        queue.push(edge.child_profile_id)
      }
    }
  }

  return Array.from(seen)
}

export const refreshSuspiciousSignalsForProfile = async (profileId: string) => {
  return refreshSuspiciousSignalsForProfileWithOptions(profileId, {})
}

type RefreshSignalOptions = {
  familyProfileIds?: string[]
  fanoutDepth?: number
}

const refreshSuspiciousSignalsForProfileWithOptions = async (
  profileId: string,
  options: RefreshSignalOptions
) => {
  const familyProfileIds = options.familyProfileIds ?? (await familyGraphForProfile(profileId))
  if (!familyProfileIds.length) return

  const [{ data: profiles }, { data: submissions }] = await Promise.all([
    (adminClient.from('profile') as any)
      .select('id, user_id, role, firstname, surname, email, street_address, city, province, postcode, address_fingerprint, federal_electoral_district_name')
      .in('id', familyProfileIds),
    adminClient
      .from('form_submission')
      .select('id, profile_id, submitted_at, ip_address, ip_selected, ip_chain, forwarded_for, metadata')
      .in('profile_id', familyProfileIds)
      .order('submitted_at', { ascending: false })
      .limit(40),
  ])

  const normalizedProfiles = ((profiles ?? []) as Array<Record<string, unknown>>)
    .map(profile => ({
      id: typeof profile.id === 'string' ? profile.id : '',
      user_id: typeof profile.user_id === 'string' ? profile.user_id : null,
      role: typeof profile.role === 'string' ? profile.role : null,
      firstname: typeof profile.firstname === 'string' ? profile.firstname : null,
      surname: typeof profile.surname === 'string' ? profile.surname : null,
      email: typeof profile.email === 'string' ? profile.email : null,
      street_address: typeof profile.street_address === 'string' ? profile.street_address : null,
      city: typeof profile.city === 'string' ? profile.city : null,
      province: typeof profile.province === 'string' ? profile.province : null,
      postcode: typeof profile.postcode === 'string' ? profile.postcode : null,
      address_fingerprint: typeof profile.address_fingerprint === 'string' ? profile.address_fingerprint : null,
      federal_electoral_district_name:
        typeof profile.federal_electoral_district_name === 'string'
          ? profile.federal_electoral_district_name
          : null,
    }))
    .filter(profile => Boolean(profile.id))

  const addressSignal = detectAddressMismatchSignal(normalizedProfiles)

  const networkSignal = detectNetworkDistanceSignal(
    (submissions ?? []).map(submission => ({
      id: submission.id,
      profile_id: submission.profile_id,
      submitted_at: submission.submitted_at,
      ip_address:
        (typeof submission.ip_selected === 'string' && submission.ip_selected) ||
        (typeof submission.ip_address === 'string' ? submission.ip_address : null),
      metadata: (submission.metadata ?? {}) as Json,
    }))
  )

  const districtNames = new Set(
    normalizedProfiles
      .map(profile =>
        typeof profile.federal_electoral_district_name === 'string'
          ? profile.federal_electoral_district_name.trim()
          : ''
      )
      .filter(Boolean)
  )

  const districtByName = new Map<string, RidingRow>()
  if (districtNames.size > 0) {
    const { data: districts } = await adminClient
      .from('federal_electoral_district' as any)
      .select('name, whitelist')
      .in('name', Array.from(districtNames))

    for (const district of (districts ?? []) as RidingRow[]) {
      districtByName.set(district.name, district)
    }
  }

  const subjectProfile = normalizedProfiles.find(profile => profile.id === profileId)

  const subjectAddressFingerprint = typeof subjectProfile?.address_fingerprint === 'string'
    ? subjectProfile.address_fingerprint
    : null

  let crossFamilyAddressSignal: ReturnType<typeof detectCrossFamilyExactAddressSignal> = null
  let crossFamilyMatchedProfileIds: string[] = []
  if (subjectAddressFingerprint) {
    const { data: sameAddressProfiles } = await (adminClient.from('profile') as any)
      .select('id, role, firstname, surname, email, street_address, city, province, postcode, address_fingerprint')
      .eq('address_fingerprint', subjectAddressFingerprint)
      .neq('id', profileId)
      .limit(50)

    const familySet = new Set(familyProfileIds)
    const outsideFamilyMatches = ((sameAddressProfiles ?? []) as Array<Record<string, unknown>>)
      .map(profile => ({
        id: typeof profile.id === 'string' ? profile.id : '',
        role: typeof profile.role === 'string' ? profile.role : null,
        firstname: typeof profile.firstname === 'string' ? profile.firstname : null,
        surname: typeof profile.surname === 'string' ? profile.surname : null,
        email: typeof profile.email === 'string' ? profile.email : null,
        street_address: typeof profile.street_address === 'string' ? profile.street_address : null,
        city: typeof profile.city === 'string' ? profile.city : null,
        province: typeof profile.province === 'string' ? profile.province : null,
        postcode: typeof profile.postcode === 'string' ? profile.postcode : null,
        address_fingerprint: typeof profile.address_fingerprint === 'string' ? profile.address_fingerprint : null,
      }))
      .filter(profile => profile.id && !familySet.has(profile.id))

    crossFamilyMatchedProfileIds = outsideFamilyMatches.map(profile => profile.id)

    crossFamilyAddressSignal = detectCrossFamilyExactAddressSignal({
      subjectProfile: subjectProfile ?? null,
      outsideFamilyMatches,
    })
  }

  let ipMismatchSignal: ReturnType<typeof detectIpProfileLocationMismatchSignal> = null
  let ipOrgGreylistSignal: ReturnType<typeof detectIpOrgGreylistSignal> = null
  if (subjectProfile) {
    const subjectUserId = typeof subjectProfile.user_id === 'string' ? subjectProfile.user_id : null
    const subjectSubmissions = (submissions ?? [])
      .filter(submission => submission.profile_id === profileId)
      .slice(0, 20)

    const { data: loginEvents } = subjectUserId
      ? await adminClient
          .from('login_event')
          .select('id, event_at, ip_address, ip_selected, ip_chain, forwarded_for, metadata')
          .eq('user_id', subjectUserId)
          .order('event_at', { ascending: false })
          .limit(20)
      : { data: [] }

    const { data: orgPolicyRows } = await (adminClient.from('ip_org_policy' as any) as any)
      .select('org_pattern, match_mode, policy_class, note, priority')
      .eq('enabled', true)
      .order('priority', { ascending: true })

    const orgPolicies: OrgPolicyRow[] = ((orgPolicyRows ?? []) as Array<Record<string, unknown>>)
      .map(row => {
        const matchMode: OrgPolicyRow['match_mode'] =
          row.match_mode === 'exact' || row.match_mode === 'contains' || row.match_mode === 'regex'
            ? row.match_mode
            : 'contains'
        const policyClass: OrgPolicyRow['policy_class'] =
          row.policy_class === 'infra_proxy' ||
          row.policy_class === 'consumer_isp' ||
          row.policy_class === 'vpn_hosting_datacenter' ||
          row.policy_class === 'trusted_enterprise' ||
          row.policy_class === 'unknown'
            ? row.policy_class
            : 'unknown'

        return {
          org_pattern: typeof row.org_pattern === 'string' ? row.org_pattern : '',
          match_mode: matchMode,
          policy_class: policyClass,
          note: typeof row.note === 'string' ? row.note : null,
          priority: typeof row.priority === 'number' ? row.priority : 100,
        }
      })
      .filter(row => Boolean(row.org_pattern))

    const eventCandidates: Array<{
      eventId: string
      source: 'form_submission' | 'login_event'
      occurredAt: string
      ips: string[]
      selectedIp: string | null
    }> = []

    for (const submission of subjectSubmissions) {
      const ips = collectCandidateIps({
        ip_chain: (submission as Record<string, unknown>).ip_chain,
        ip_selected: submission.ip_selected,
        ip_address: submission.ip_address,
        forwarded_for: typeof submission.forwarded_for === 'string' ? submission.forwarded_for : null,
      })
      if (!ips.length || !submission.id || !submission.submitted_at) continue
      eventCandidates.push({
        eventId: submission.id,
        source: 'form_submission',
        occurredAt: submission.submitted_at,
        ips,
        selectedIp: typeof submission.ip_selected === 'string' ? submission.ip_selected : null,
      })
    }

    for (const event of (loginEvents ?? []) as LoginEventRow[]) {
      const ips = collectCandidateIps({
        ip_chain: event.ip_chain,
        ip_selected: event.ip_selected,
        ip_address: event.ip_address,
        forwarded_for: event.forwarded_for,
      })
      if (!ips.length || !event.id || !event.event_at) continue
      eventCandidates.push({
        eventId: event.id,
        source: 'login_event',
        occurredAt: event.event_at,
        ips,
        selectedIp: typeof event.ip_selected === 'string' ? event.ip_selected : null,
      })
    }

    const uniqueIps = Array.from(new Set(eventCandidates.flatMap(event => event.ips)))
    const locationByIp = new Map<string, Awaited<ReturnType<typeof resolveIpGeolocation>>>()
    await Promise.all(
      uniqueIps.map(async ip => {
        const location = await resolveIpGeolocation(ip)
        locationByIp.set(ip, location)
      })
    )

    const greylistEvidence: Array<{
      event_id: string
      source: 'form_submission' | 'login_event'
      occurred_at: string
      ip_address: string
      org: string | null
      policy: OrgPolicyRow | null
    }> = []

    const ipEvents = eventCandidates
      .map((candidate): IpLocationEvidence | null => {
        const evaluated = candidate.ips
          .map(ip => {
            const location = locationByIp.get(ip) ?? null
            const org = location?.org ?? null
            const policy = matchOrgPolicy(org, orgPolicies)
            if (policy?.policy_class === 'vpn_hosting_datacenter') {
              greylistEvidence.push({
                event_id: candidate.eventId,
                source: candidate.source,
                occurred_at: candidate.occurredAt,
                ip_address: ip,
                org,
                policy,
              })
            }
            const score =
              (policy ? orgPolicyRank(policy.policy_class) : 20) +
              (candidate.selectedIp === ip ? 8 : 0) +
              (location ? 10 : 0)
            return {
              ip,
              location,
              score,
            }
          })
          .sort((left, right) => right.score - left.score)

        const best = evaluated.find(entry => entry.location) ?? evaluated[0]
        if (!best?.location) return null

        return {
          event_id: candidate.eventId,
          source: candidate.source,
          occurred_at: candidate.occurredAt,
          ip_address: best.ip,
          country_code: best.location.countryCode,
          region: best.location.region,
          city: best.location.city,
          latitude: best.location.latitude,
          longitude: best.location.longitude,
          provider: best.location.source ?? null,
        }
      })
      .filter((event): event is IpLocationEvidence => event !== null)

    ipMismatchSignal = detectIpProfileLocationMismatchSignal({
      subjectProfile,
      events: ipEvents,
    })

    ipOrgGreylistSignal = detectIpOrgGreylistSignal({ evidence: greylistEvidence })
  }

  const subjectDistrictName =
    typeof subjectProfile?.federal_electoral_district_name === 'string'
      ? subjectProfile.federal_electoral_district_name.trim()
      : ''
  const subjectDistrict = subjectDistrictName ? districtByName.get(subjectDistrictName) : null

  const signals: Array<{
    signal_type: SuspiciousSignalType
    severity: string
    summary: string
    title: string
    details: Record<string, Json>
    priority_score: number
    priority_reason: string
  }> = []

  if (addressSignal) {
    const priority = computeSignalPriority('address_mismatch', addressSignal.severity, addressSignal.details)
    signals.push({
      signal_type: 'address_mismatch',
      severity: addressSignal.severity,
      summary: addressSignal.summary,
      title: addressSignal.title,
      details: addressSignal.details,
      priority_score: priority.score,
      priority_reason: priority.reason,
    })
  }

  if (networkSignal) {
    const priority = computeSignalPriority('network_distance_anomaly', networkSignal.severity, networkSignal.details)
    signals.push({
      signal_type: 'network_distance_anomaly',
      severity: networkSignal.severity,
      summary: networkSignal.summary,
      title: networkSignal.title,
      details: networkSignal.details,
      priority_score: priority.score,
      priority_reason: priority.reason,
    })
  }

  if (crossFamilyAddressSignal) {
    const priority = computeSignalPriority(
      'cross_family_exact_address',
      crossFamilyAddressSignal.severity,
      crossFamilyAddressSignal.details
    )
    signals.push({
      signal_type: 'cross_family_exact_address',
      severity: crossFamilyAddressSignal.severity,
      summary: crossFamilyAddressSignal.summary,
      title: crossFamilyAddressSignal.title,
      details: crossFamilyAddressSignal.details,
      priority_score: priority.score,
      priority_reason: priority.reason,
    })
  }

  if (ipMismatchSignal) {
    const priority = computeSignalPriority('ip_profile_location_mismatch', ipMismatchSignal.severity, ipMismatchSignal.details)
    signals.push({
      signal_type: 'ip_profile_location_mismatch',
      severity: ipMismatchSignal.severity,
      summary: ipMismatchSignal.summary,
      title: ipMismatchSignal.title,
      details: ipMismatchSignal.details,
      priority_score: priority.score,
      priority_reason: priority.reason,
    })
  }

  if (ipOrgGreylistSignal) {
    const priority = computeSignalPriority('ip_org_greylist', ipOrgGreylistSignal.severity, ipOrgGreylistSignal.details)
    signals.push({
      signal_type: 'ip_org_greylist',
      severity: ipOrgGreylistSignal.severity,
      summary: ipOrgGreylistSignal.summary,
      title: ipOrgGreylistSignal.title,
      details: ipOrgGreylistSignal.details,
      priority_score: priority.score,
      priority_reason: priority.reason,
    })
  }

  if (subjectDistrictName && subjectDistrict && subjectDistrict.whitelist === false) {
    const ridingDetails = {
      district_name: subjectDistrictName,
      whitelist: subjectDistrict.whitelist,
    } satisfies Record<string, Json>
    const priority = computeSignalPriority('non_whitelisted_riding', 'medium', ridingDetails)
    signals.push({
      signal_type: 'non_whitelisted_riding',
      severity: 'medium',
      summary: 'Profile riding is not currently whitelisted.',
      title: 'Non-whitelisted riding',
      details: ridingDetails,
      priority_score: priority.score,
      priority_reason: priority.reason,
    })
  }

  if (!signals.length) {
    return
  }

  await adminClient
    .from('suspicious_signal')
    .delete()
    .eq('status', 'open')
    .eq('subject_profile_id', profileId)
    .in('signal_type', [
      'address_mismatch',
      'network_distance_anomaly',
      'non_whitelisted_riding',
      'cross_family_exact_address',
      'ip_profile_location_mismatch',
      'ip_org_greylist',
    ])

  const payload = signals.map(signal => ({
    subject_profile_id: profileId,
    family_profile_ids: familyProfileIds,
      signal_type: signal.signal_type,
      severity: signal.severity,
      priority_score: signal.priority_score,
      priority_reason: signal.priority_reason,
      summary: signal.summary,
      details: {
        title: signal.title,
      ...signal.details,
    },
    status: 'open',
  }))

  const { error } = await adminClient.from('suspicious_signal').insert(payload)
  if (error) {
    console.error('[suspicious-signal] insert failed', error)
    return
  }

  const fanoutDepth = options.fanoutDepth ?? 0
  if (crossFamilyMatchedProfileIds.length && fanoutDepth < 1) {
    await Promise.all(
      Array.from(new Set(crossFamilyMatchedProfileIds))
        .filter(candidateId => candidateId !== profileId)
        .slice(0, 10)
        .map(candidateId =>
          refreshSuspiciousSignalsForProfileWithOptions(candidateId, {
            fanoutDepth: fanoutDepth + 1,
          }).catch(refreshError => {
            console.error('[suspicious-signal] cross-family fanout refresh failed', {
              sourceProfileId: profileId,
              candidateId,
              error: refreshError,
            })
          })
        )
    )
  }
}
