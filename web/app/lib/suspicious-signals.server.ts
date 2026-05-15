import { adminClient } from '@/lib/supabase/adminClient'
import { detectAddressMismatchSignal, detectNetworkDistanceSignal } from '@/lib/suspicious-signals'

import type { Json } from '@/lib/database.types'

type FamilyEdge = {
  guardian_profile_id: string
  child_profile_id: string
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
    adminClient
      .from('profile')
      .select('id, role, firstname, surname, email, street_address, city, province, postcode')
      .in('id', familyProfileIds),
    adminClient
      .from('form_submission')
      .select('id, profile_id, submitted_at, ip_address, metadata')
      .in('profile_id', familyProfileIds)
      .order('submitted_at', { ascending: false })
      .limit(40),
  ])

  const addressSignal = detectAddressMismatchSignal((profiles ?? []).map(profile => ({
    ...profile,
    role: profile.role ?? null,
  })))

  const networkSignal = detectNetworkDistanceSignal(
    (submissions ?? []).map(submission => ({
      id: submission.id,
      profile_id: submission.profile_id,
      submitted_at: submission.submitted_at,
      ip_address: typeof submission.ip_address === 'string' ? submission.ip_address : null,
      metadata: (submission.metadata ?? {}) as Json,
    }))
  )

  const signals: Array<{
    signal_type: 'address_mismatch' | 'network_distance_anomaly'
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

  await adminClient
    .from('suspicious_signal')
    .delete()
    .eq('status', 'open')
    .eq('subject_profile_id', profileId)
    .in('signal_type', ['address_mismatch', 'network_distance_anomaly'])

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
