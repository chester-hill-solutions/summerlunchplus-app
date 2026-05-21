import { adminClient } from '@/lib/supabase/adminClient'
import { detectAddressMismatchSignal, detectNetworkDistanceSignal } from '@/lib/suspicious-signals'

import type { Json } from '@/lib/database.types'

type FamilyEdge = {
  guardian_profile_id: string
  child_profile_id: string
}

type RidingRow = {
  name: string
  whitelist: boolean
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
  const familyProfileIds = await familyGraphForProfile(profileId)
  if (!familyProfileIds.length) return

  const [{ data: profiles }, { data: submissions }] = await Promise.all([
    (adminClient.from('profile') as any)
      .select('id, role, firstname, surname, email, street_address, city, province, postcode, federal_electoral_district_name')
      .in('id', familyProfileIds),
    adminClient
      .from('form_submission')
      .select('id, profile_id, submitted_at, ip_address, metadata')
      .in('profile_id', familyProfileIds)
      .order('submitted_at', { ascending: false })
      .limit(40),
  ])

  const normalizedProfiles = ((profiles ?? []) as Array<Record<string, unknown>>)
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
      ip_address: typeof submission.ip_address === 'string' ? submission.ip_address : null,
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
  const subjectDistrictName =
    typeof subjectProfile?.federal_electoral_district_name === 'string'
      ? subjectProfile.federal_electoral_district_name.trim()
      : ''
  const subjectDistrict = subjectDistrictName ? districtByName.get(subjectDistrictName) : null

  const signals: Array<{
    signal_type: 'address_mismatch' | 'network_distance_anomaly' | 'non_whitelisted_riding'
    severity: string
    summary: string
    title: string
    details: Record<string, Json>
  }> = []

  if (addressSignal) {
    signals.push({
      signal_type: 'address_mismatch',
      severity: addressSignal.severity,
      summary: addressSignal.summary,
      title: addressSignal.title,
      details: addressSignal.details,
    })
  }

  if (networkSignal) {
    signals.push({
      signal_type: 'network_distance_anomaly',
      severity: networkSignal.severity,
      summary: networkSignal.summary,
      title: networkSignal.title,
      details: networkSignal.details,
    })
  }

  if (subjectDistrictName && subjectDistrict && subjectDistrict.whitelist === false) {
    signals.push({
      signal_type: 'non_whitelisted_riding',
      severity: 'medium',
      summary: 'Profile riding is not currently whitelisted.',
      title: 'Non-whitelisted riding',
      details: {
        district_name: subjectDistrictName,
        whitelist: subjectDistrict.whitelist,
      },
    })
  }

  await adminClient
    .from('suspicious_signal')
    .delete()
    .eq('status', 'open')
    .eq('subject_profile_id', profileId)
    .in('signal_type', ['address_mismatch', 'network_distance_anomaly', 'non_whitelisted_riding'])

  if (!signals.length) return

  const payload = signals.map(signal => ({
    subject_profile_id: profileId,
    family_profile_ids: familyProfileIds,
    signal_type: signal.signal_type,
    severity: signal.severity,
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
  }
}
