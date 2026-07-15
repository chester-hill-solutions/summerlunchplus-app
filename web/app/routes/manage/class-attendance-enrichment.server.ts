import { isIP } from 'node:net'

import { loadFamilyContextByProfileIds } from '@/lib/family-context.server'
import { resolveIpGeolocation } from '@/lib/geoip.server'
import { adminClient } from '@/lib/supabase/adminClient'

const GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE = 'gift_card_store_preference'
const IN_CLAUSE_BATCH_SIZE = 150

type ProfileRow = {
  id: string
  user_id: string | null
}

type GuardianChildEdge = {
  guardian_profile_id: string
  child_profile_id: string
}

type FormSubmissionPreferenceRow = {
  id: string
  profile_id: string | null
  user_id: string | null
  submitted_at: string | null
}

type FormAnswerPreferenceRow = {
  submission_id: string
  value: unknown
}

type FormSubmissionIpRow = {
  profile_id: string | null
  submitted_at: string | null
  ip_selected?: unknown
  ip_address: unknown
  forwarded_for: unknown
}

type LoginEventIpRow = {
  user_id: string | null
  event_at: string | null
  ip_selected?: unknown
  ip_address: unknown
  forwarded_for: unknown
}

type GiftCardClickRow = {
  profile_id: string | null
  ip_address: unknown
  created_at: string
}

type ClassAttendanceEnrichment = {
  latest_geo: string
  giftcard_display: string
  profile_hover_top_discrepancy: string
  profile_hover_more_discrepancies: string
  profile_hover_name: string
  profile_hover_parent_name: string
  profile_hover_email: string
  profile_hover_student_phone: string
  profile_hover_parent_email: string
  profile_hover_parent_phone: string
  profile_hover_student_geo: string
  profile_hover_parent_geo: string
  profile_hover_student_submitted_address: string
  profile_hover_parent_address: string
}

const CLASS_ATTENDANCE_ENRICHMENT_LANES = ['giftcard', 'geo', 'family'] as const
export type ClassAttendanceEnrichmentLane = (typeof CLASS_ATTENDANCE_ENRICHMENT_LANES)[number]

type ClassAttendanceEnrichmentOptions = {
  lanes?: ClassAttendanceEnrichmentLane[]
}

type ClassAttendanceEnrichmentFoundation = {
  normalizedProfileIds: string[]
  expandedRelatedProfilesByTarget: Map<string, Set<string>>
  preferenceSubmissionScopeProfileIds: string[]
  userIdsByProfileId: Map<string, string>
  profileIdsByUserId: Map<string, string[]>
  attendanceProfileByUserId: Map<string, string[]>
}

const FOUNDATION_CACHE_TTL_MS = 30_000
const foundationCache = new Map<
  string,
  {
    expiresAt: number
    promise: Promise<ClassAttendanceEnrichmentFoundation>
  }
>()

const fallbackProfileHoverContext: Omit<ClassAttendanceEnrichment, 'latest_geo' | 'giftcard_display'> = {
  profile_hover_top_discrepancy: '',
  profile_hover_more_discrepancies: '',
  profile_hover_name: 'N/A',
  profile_hover_parent_name: 'N/A',
  profile_hover_email: 'N/A',
  profile_hover_student_phone: '',
  profile_hover_parent_email: 'N/A',
  profile_hover_parent_phone: 'N/A',
  profile_hover_student_geo: 'N/A',
  profile_hover_parent_geo: 'N/A',
  profile_hover_student_submitted_address: 'N/A',
  profile_hover_parent_address: 'N/A',
}

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const flagEmojiForCountryCode = (countryCode: string | null) => {
  if (!countryCode) return ''
  const normalized = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return ''
  return String.fromCodePoint(...Array.from(normalized).map(char => 127397 + char.charCodeAt(0)))
}

const formatGeoLabel = (geo: Awaited<ReturnType<typeof resolveIpGeolocation>> | null) => {
  const countryCode = geo?.countryCode ?? null
  const flag = flagEmojiForCountryCode(countryCode)
  const geoParts = [geo?.city, geo?.region, countryCode].filter(Boolean)
  return geoParts.length
    ? `${flag ? `${flag} ` : ''}${geoParts.join(', ')}`
    : countryCode
      ? `${flag ? `${flag} ` : ''}${countryCode}`
      : 'Unknown location'
}

const normalizeGiftCardPreference = (value: string | null | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return 'N/A'
  if (normalized.includes('meal kit')) return 'Meal Kit'
  if (normalized.includes('sobeys')) return 'Sobeys'
  if (normalized.includes('pc') || normalized.includes('president')) return 'PC'
  return value?.trim() || 'N/A'
}

const parsePrimaryIp = (ipSelected: unknown, ipAddress: unknown, forwardedFor: unknown) => {
  const normalizeIp = (value: unknown) => {
    if (typeof value !== 'string') return ''
    const trimmed = value.trim()
    if (!trimmed || trimmed.length > 64) return ''
    return isIP(trimmed) ? trimmed : ''
  }

  const selected = normalizeIp(ipSelected)
  if (selected) return selected

  const direct = normalizeIp(ipAddress)
  if (direct) return direct

  if (typeof forwardedFor !== 'string' || !forwardedFor.trim()) return ''
  const first = forwardedFor
    .split(',')
    .map(part => part.trim())
    .find(Boolean)

  return normalizeIp(first)
}

const normalizeProfileIds = (profileIds: string[]) =>
  Array.from(new Set(profileIds.map(value => value.trim()).filter(Boolean)))

const profileIdsSignature = (profileIds: string[]) => profileIds.join('|')

const buildClassAttendanceEnrichmentFoundation = async (
  normalizedProfileIds: string[]
): Promise<ClassAttendanceEnrichmentFoundation> => {
  const relatedProfilesByTarget = new Map<string, Set<string>>()
  for (const profileId of normalizedProfileIds) {
    relatedProfilesByTarget.set(profileId, new Set([profileId]))
  }

  const guardianRowsByChild: GuardianChildEdge[] = []
  for (const chunk of chunkArray(normalizedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id')
      .in('child_profile_id', chunk)
    if (error) throw new Error(error.message)
    guardianRowsByChild.push(...((data ?? []) as GuardianChildEdge[]))
  }

  const childRowsByGuardian: GuardianChildEdge[] = []
  for (const chunk of chunkArray(normalizedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id')
      .in('guardian_profile_id', chunk)
    if (error) throw new Error(error.message)
    childRowsByGuardian.push(...((data ?? []) as GuardianChildEdge[]))
  }

  for (const edge of guardianRowsByChild) {
    const related = relatedProfilesByTarget.get(edge.child_profile_id)
    if (related) related.add(edge.guardian_profile_id)
  }
  for (const edge of childRowsByGuardian) {
    const related = relatedProfilesByTarget.get(edge.guardian_profile_id)
    if (related) related.add(edge.child_profile_id)
  }

  const preferenceProfileScopeIds = Array.from(
    new Set(Array.from(relatedProfilesByTarget.values()).flatMap(set => Array.from(set)))
  )

  const preferenceScopeProfiles: ProfileRow[] = []
  for (const chunk of chunkArray(preferenceProfileScopeIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: profileChunk, error: profileError } = await adminClient
      .from('profile')
      .select('id, user_id')
      .in('id', chunk)
    if (profileError) throw new Error(profileError.message)
    preferenceScopeProfiles.push(...((profileChunk ?? []) as ProfileRow[]))
  }

  const userIdsByProfileId = new Map<string, string>()
  const profileIdsByUserId = new Map<string, string[]>()
  for (const row of preferenceScopeProfiles) {
    if (typeof row.user_id !== 'string' || !row.user_id) continue
    userIdsByProfileId.set(row.id, row.user_id)
    const existing = profileIdsByUserId.get(row.user_id) ?? []
    if (!existing.includes(row.id)) {
      existing.push(row.id)
      profileIdsByUserId.set(row.user_id, existing)
    }
  }

  const expandedRelatedProfilesByTarget = new Map<string, Set<string>>()
  for (const profileId of normalizedProfileIds) {
    const expanded = new Set(relatedProfilesByTarget.get(profileId) ?? [profileId])
    for (const relatedProfileId of Array.from(expanded)) {
      const userId = userIdsByProfileId.get(relatedProfileId)
      if (!userId) continue
      for (const sameUserProfileId of profileIdsByUserId.get(userId) ?? []) {
        expanded.add(sameUserProfileId)
      }
    }
    expandedRelatedProfilesByTarget.set(profileId, expanded)
  }

  const preferenceSubmissionScopeProfileIds = Array.from(
    new Set(Array.from(expandedRelatedProfilesByTarget.values()).flatMap(set => Array.from(set)))
  )

  const attendanceProfileByUserId = new Map<string, string[]>()
  for (const profileId of normalizedProfileIds) {
    const userId = userIdsByProfileId.get(profileId)
    if (!userId) continue
    const bucket = attendanceProfileByUserId.get(userId) ?? []
    if (!bucket.includes(profileId)) {
      bucket.push(profileId)
      attendanceProfileByUserId.set(userId, bucket)
    }
  }

  return {
    normalizedProfileIds,
    expandedRelatedProfilesByTarget,
    preferenceSubmissionScopeProfileIds,
    userIdsByProfileId,
    profileIdsByUserId,
    attendanceProfileByUserId,
  }
}

const getClassAttendanceEnrichmentFoundation = async (normalizedProfileIds: string[]) => {
  const key = profileIdsSignature(normalizedProfileIds)
  const now = Date.now()
  const cached = foundationCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.promise
  }

  const promise = buildClassAttendanceEnrichmentFoundation(normalizedProfileIds)
  foundationCache.set(key, {
    expiresAt: now + FOUNDATION_CACHE_TTL_MS,
    promise,
  })
  return promise
}

const loadGiftCardLane = async (
  foundation: ClassAttendanceEnrichmentFoundation
): Promise<Record<string, Partial<ClassAttendanceEnrichment>>> => {
  const {
    normalizedProfileIds,
    expandedRelatedProfilesByTarget,
    preferenceSubmissionScopeProfileIds,
    userIdsByProfileId,
    profileIdsByUserId,
  } = foundation

  const submissionsById = new Map<string, FormSubmissionPreferenceRow>()
  for (const chunk of chunkArray(preferenceSubmissionScopeProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissionRows, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('profile_id', chunk)
    if (error) throw new Error(error.message)
    for (const row of (submissionRows ?? []) as FormSubmissionPreferenceRow[]) {
      submissionsById.set(row.id, row)
    }
  }

  const preferenceUserIds = Array.from(
    new Set(
      preferenceSubmissionScopeProfileIds
        .map(profileId => userIdsByProfileId.get(profileId) ?? '')
        .filter(Boolean)
    )
  )
  for (const chunk of chunkArray(preferenceUserIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissionRows, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('user_id', chunk)
    if (error) throw new Error(error.message)
    for (const row of (submissionRows ?? []) as FormSubmissionPreferenceRow[]) {
      submissionsById.set(row.id, row)
    }
  }

  const latestGiftCardPreferenceByProfileId = new Map<string, { value: string; submittedAtMs: number }>()
  const submissionIds = Array.from(submissionsById.keys())
  for (const chunk of chunkArray(submissionIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: answerRows, error } = await adminClient
      .from('form_answer')
      .select('submission_id, value')
      .eq('question_code', GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE)
      .in('submission_id', chunk)
    if (error) throw new Error(error.message)

    for (const row of (answerRows ?? []) as FormAnswerPreferenceRow[]) {
      const submission = submissionsById.get(row.submission_id)
      if (!submission) continue
      const value = typeof row.value === 'string' ? row.value.trim() : ''
      if (!value) continue
      const submittedAtMs = Number.isFinite(Date.parse(submission.submitted_at ?? ''))
        ? Date.parse(submission.submitted_at ?? '')
        : 0

      const associatedProfileIds = new Set<string>()
      if (
        typeof submission.profile_id === 'string' &&
        submission.profile_id &&
        preferenceSubmissionScopeProfileIds.includes(submission.profile_id)
      ) {
        associatedProfileIds.add(submission.profile_id)
      }
      if (typeof submission.user_id === 'string' && submission.user_id) {
        for (const profileId of profileIdsByUserId.get(submission.user_id) ?? []) {
          associatedProfileIds.add(profileId)
        }
      }

      for (const profileId of associatedProfileIds) {
        const existing = latestGiftCardPreferenceByProfileId.get(profileId)
        if (!existing || submittedAtMs > existing.submittedAtMs) {
          latestGiftCardPreferenceByProfileId.set(profileId, {
            value,
            submittedAtMs,
          })
        }
      }
    }
  }

  const latestGiftCardPreferenceByTargetProfileId = new Map<string, { value: string; submittedAtMs: number }>()
  for (const targetProfileId of normalizedProfileIds) {
    const relatedIds = expandedRelatedProfilesByTarget.get(targetProfileId) ?? new Set([targetProfileId])
    for (const relatedId of relatedIds) {
      const candidate = latestGiftCardPreferenceByProfileId.get(relatedId)
      if (!candidate) continue
      const existing = latestGiftCardPreferenceByTargetProfileId.get(targetProfileId)
      if (!existing || candidate.submittedAtMs > existing.submittedAtMs) {
        latestGiftCardPreferenceByTargetProfileId.set(targetProfileId, candidate)
      }
    }
  }

  return normalizedProfileIds.reduce<Record<string, Partial<ClassAttendanceEnrichment>>>((acc, profileId) => {
    acc[profileId] = {
      giftcard_display: normalizeGiftCardPreference(latestGiftCardPreferenceByTargetProfileId.get(profileId)?.value),
    }
    return acc
  }, {})
}

const loadGeoLane = async (
  foundation: ClassAttendanceEnrichmentFoundation
): Promise<Record<string, Partial<ClassAttendanceEnrichment>>> => {
  const { normalizedProfileIds, attendanceProfileByUserId } = foundation
  const latestNetworkByProfileId = new Map<string, { occurredAt: string; ip: string }>()
  const setLatestNetwork = (profileId: string, occurredAt: string, ip: string) => {
    if (!profileId || !occurredAt || !ip) return
    const existing = latestNetworkByProfileId.get(profileId)
    if (!existing || occurredAt > existing.occurredAt) {
      latestNetworkByProfileId.set(profileId, { occurredAt, ip })
    }
  }

  for (const chunk of chunkArray(normalizedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: clickRows, error } = await adminClient
      .from('gift_card_click_event')
      .select('profile_id, ip_address, created_at')
      .in('profile_id', chunk)
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    for (const row of (clickRows ?? []) as GiftCardClickRow[]) {
      const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
      const occurredAt = typeof row.created_at === 'string' ? row.created_at : ''
      const ip = parsePrimaryIp(row.ip_address, row.ip_address, null)
      setLatestNetwork(profileId, occurredAt, ip)
    }
  }

  let formSubmissionSelect = 'profile_id, submitted_at, ip_selected, ip_address, forwarded_for'
  for (const chunk of chunkArray(normalizedProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const query = (adminClient.from('form_submission' as any) as any)
      .select(formSubmissionSelect)
      .in('profile_id', chunk)
      .order('submitted_at', { ascending: false })

    let { data: submissionRows, error: submissionError } = await query

    if (submissionError && formSubmissionSelect.includes('ip_selected')) {
      const fallbackSelect = 'profile_id, submitted_at, ip_address, forwarded_for'
      const fallbackResult = await (adminClient.from('form_submission' as any) as any)
        .select(fallbackSelect)
        .in('profile_id', chunk)
        .order('submitted_at', { ascending: false })
      if (!fallbackResult.error) {
        formSubmissionSelect = fallbackSelect
        submissionRows = fallbackResult.data
        submissionError = null
      }
    }

    if (submissionError) throw new Error(submissionError.message)

    for (const row of (submissionRows ?? []) as FormSubmissionIpRow[]) {
      const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
      const occurredAt = typeof row.submitted_at === 'string' ? row.submitted_at : ''
      const ip = parsePrimaryIp(row.ip_selected, row.ip_address, row.forwarded_for)
      setLatestNetwork(profileId, occurredAt, ip)
    }
  }

  const userIds = Array.from(attendanceProfileByUserId.keys())
  let loginEventSelect = 'user_id, event_at, ip_selected, ip_address, forwarded_for'
  for (const chunk of chunkArray(userIds, IN_CLAUSE_BATCH_SIZE)) {
    const query = (adminClient.from('login_event' as any) as any)
      .select(loginEventSelect)
      .in('user_id', chunk)
      .order('event_at', { ascending: false })

    let { data: loginRows, error: loginError } = await query

    if (loginError && loginEventSelect.includes('ip_selected')) {
      const fallbackSelect = 'user_id, event_at, ip_address, forwarded_for'
      const fallbackResult = await (adminClient.from('login_event' as any) as any)
        .select(fallbackSelect)
        .in('user_id', chunk)
        .order('event_at', { ascending: false })
      if (!fallbackResult.error) {
        loginEventSelect = fallbackSelect
        loginRows = fallbackResult.data
        loginError = null
      }
    }

    if (loginError) throw new Error(loginError.message)

    for (const row of (loginRows ?? []) as LoginEventIpRow[]) {
      const userId = typeof row.user_id === 'string' ? row.user_id : ''
      const occurredAt = typeof row.event_at === 'string' ? row.event_at : ''
      const ip = parsePrimaryIp(row.ip_selected, row.ip_address, row.forwarded_for)
      if (!userId) continue
      for (const profileId of attendanceProfileByUserId.get(userId) ?? []) {
        setLatestNetwork(profileId, occurredAt, ip)
      }
    }
  }

  const uniqueIps = Array.from(new Set(Array.from(latestNetworkByProfileId.values()).map(entry => entry.ip)))
  const geoByIp = new Map<string, Awaited<ReturnType<typeof resolveIpGeolocation>>>()
  await Promise.all(
    uniqueIps.map(async ip => {
      const geo = await resolveIpGeolocation(ip)
      if (geo) {
        geoByIp.set(ip, geo)
      }
    })
  )

  return normalizedProfileIds.reduce<Record<string, Partial<ClassAttendanceEnrichment>>>((acc, profileId) => {
    const latestProfileNetwork = latestNetworkByProfileId.get(profileId)
    const latestGeo = (() => {
      const ip = latestProfileNetwork?.ip ?? ''
      if (!ip) return 'N/A'
      const geo = geoByIp.get(ip)
      if (!geo) return 'Unknown location'
      return formatGeoLabel(geo)
    })()
    acc[profileId] = {
      latest_geo: latestGeo,
    }
    return acc
  }, {})
}

const loadFamilyLane = async (
  normalizedProfileIds: string[]
): Promise<Record<string, Partial<ClassAttendanceEnrichment>>> => {
  const familyContextByProfileId = await loadFamilyContextByProfileIds(normalizedProfileIds)
  return normalizedProfileIds.reduce<Record<string, Partial<ClassAttendanceEnrichment>>>((acc, profileId) => {
    acc[profileId] = {
      ...fallbackProfileHoverContext,
      ...(familyContextByProfileId[profileId] ?? {}),
    }
    return acc
  }, {})
}

export async function loadClassAttendanceEnrichment(
  profileIds: string[],
  options: ClassAttendanceEnrichmentOptions = {}
) {
  const normalizedProfileIds = normalizeProfileIds(profileIds)
  const byProfileId: Record<string, ClassAttendanceEnrichment> = {}

  if (!normalizedProfileIds.length) {
    return byProfileId
  }

  const lanes = (options.lanes?.length ? options.lanes : [...CLASS_ATTENDANCE_ENRICHMENT_LANES]).filter(
    (lane, index, array) => CLASS_ATTENDANCE_ENRICHMENT_LANES.includes(lane) && array.indexOf(lane) === index
  )

  const needsFoundation = lanes.includes('giftcard') || lanes.includes('geo')
  const foundationPromise = needsFoundation
    ? getClassAttendanceEnrichmentFoundation(normalizedProfileIds)
    : Promise.resolve(null)

  const laneResults = await Promise.all(
    lanes.map(async lane => {
      if (lane === 'giftcard') {
        const foundation = await foundationPromise
        if (!foundation) return {} as Record<string, Partial<ClassAttendanceEnrichment>>
        return loadGiftCardLane(foundation)
      }
      if (lane === 'geo') {
        const foundation = await foundationPromise
        if (!foundation) return {} as Record<string, Partial<ClassAttendanceEnrichment>>
        return loadGeoLane(foundation)
      }
      return loadFamilyLane(normalizedProfileIds)
    })
  )

  for (const profileId of normalizedProfileIds) {
    byProfileId[profileId] = {
      ...fallbackProfileHoverContext,
      latest_geo: 'N/A',
      giftcard_display: 'N/A',
    }
  }

  for (const laneResult of laneResults) {
    for (const profileId of normalizedProfileIds) {
      byProfileId[profileId] = {
        ...byProfileId[profileId],
        ...(laneResult[profileId] ?? {}),
      }
    }
  }

  return byProfileId
}
