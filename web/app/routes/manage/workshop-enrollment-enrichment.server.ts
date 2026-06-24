import { adminClient } from '@/lib/supabase/adminClient'
import { loadFamilyContextByProfileIds } from '@/lib/family-context.server'
import { resolveIpGeolocation } from '@/lib/geoip.server'

const GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE = 'gift_card_store_preference'
const PRIOR_PARTICIPATION_QUESTION_CODE = 'onboarding_prior_participation'
const RELATIONSHIP_BATCH_SIZE = 100
const IN_CLAUSE_BATCH_SIZE = 250

type RidingProfileRow = {
  id: string
  user_id: string | null
  role: string | null
  firstname: string | null
  surname: string | null
  email: string | null
  federal_electoral_district_name: string | null
}

type GuardianChildEdge = {
  guardian_profile_id: string
  child_profile_id: string
  primary_child: boolean
}

type FormSubmissionRow = {
  id: string
  profile_id: string | null
  user_id: string | null
  submitted_at: string | null
}

type FormAnswerRow = {
  submission_id: string
  question_code: string
  value: unknown
}

type OpenDiscrepancyRow = {
  id: string
  family_profile_ids: string[] | null
  signal_type: string
  severity: string
  summary: string
  priority_score: number | null
  created_at: string
}

export type WorkshopEnrollmentEnrichment = {
  riding_display: string
  geo_locations_display: string
  giftcard_display: string
  prior_participation_display: string
  profile_hover_top_discrepancy: string
  profile_hover_more_discrepancies: string
  profile_hover_name: string
  profile_hover_parent_name: string
  profile_hover_email: string
  profile_hover_parent_email: string
  profile_hover_latest_ip: string
  profile_hover_latest_ip_geo: string
  profile_hover_parent_phone: string
  profile_hover_student_geo: string
  profile_hover_parent_geo: string
  profile_hover_student_submitted_address: string
  profile_hover_parent_address: string
}

const flagEmojiForCountryCode = (countryCode: string | null) => {
  if (!countryCode) return ''
  const normalized = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(normalized)) return ''
  return String.fromCodePoint(...Array.from(normalized).map(char => 127397 + char.charCodeAt(0)))
}

const parsePrimaryIp = (ipAddress: unknown, forwardedFor: unknown) => {
  if (typeof ipAddress === 'string' && ipAddress.trim()) return ipAddress.trim()
  if (typeof forwardedFor !== 'string' || !forwardedFor.trim()) return null
  return (
    forwardedFor
      .split(',')
      .map(part => part.trim())
      .find(Boolean) ?? null
  )
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

const normalizeRiding = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const normalizeText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const normalizePriorParticipation = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!trimmed) return null
  if (trimmed === 'yes') return 'Yes'
  if (trimmed === 'no') return 'No'
  return value.trim()
}

const fullNameFromProfile = (profile: RidingProfileRow | null | undefined) => {
  const firstname = normalizeText(profile?.firstname)
  const surname = normalizeText(profile?.surname)
  const fullName = [firstname, surname].filter(Boolean).join(' ').trim()
  return fullName || null
}

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  if (size <= 0 || !items.length) return []

  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const pushEdge = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string,
  profileId: string,
  primary: boolean
) => {
  const current = map.get(key) ?? []
  if (!current.some(item => item.profileId === profileId)) {
    current.push({ profileId, primary })
    current.sort((left, right) => Number(right.primary) - Number(left.primary))
    map.set(key, current)
  }
}

const preferredRelatedProfileId = (
  map: Map<string, Array<{ profileId: string; primary: boolean }>>,
  key: string
) => map.get(key)?.[0]?.profileId ?? null

export async function loadWorkshopEnrollmentEnrichment(profileIds: string[]) {
  const normalizedProfileIds = Array.from(new Set(profileIds.filter(Boolean)))
  const byProfileId: Record<string, WorkshopEnrollmentEnrichment> = {}

  if (!normalizedProfileIds.length) {
    return byProfileId
  }

  const familyContextByProfileId = await loadFamilyContextByProfileIds(normalizedProfileIds)

  let profileById = new Map<string, RidingProfileRow>()
  const profileIdsByUserId = new Map<string, string[]>()
  const guardiansByChildId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const childrenByGuardianId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const familyProfileIdsByProfileId = new Map<string, string[]>()
  const mealKitByProfileId = new Map<string, boolean>()
  let giftCardPreferenceByProfileId = new Map<string, string>()
  let priorParticipationByProfileId = new Map<string, string>()
  const discrepancyRowsByProfileId = new Map<string, OpenDiscrepancyRow[]>()

  const seen = new Set<string>(normalizedProfileIds)
  const queue = [...normalizedProfileIds]
  const familyEdges: GuardianChildEdge[] = []

  while (queue.length) {
    const batch = queue.splice(0, Math.min(queue.length, RELATIONSHIP_BATCH_SIZE))
    const { data: batchEdges, error: familyEdgesError } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id, primary_child')
      .or(`guardian_profile_id.in.(${batch.join(',')}),child_profile_id.in.(${batch.join(',')})`)

    if (familyEdgesError) {
      console.error('[workshop enrollment] enrichment failed to load family edges', {
        batchSize: batch.length,
        error: familyEdgesError.message,
      })
      break
    }

    for (const edge of (batchEdges ?? []) as GuardianChildEdge[]) {
      familyEdges.push(edge)
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

  for (const edge of familyEdges) {
    pushEdge(guardiansByChildId, edge.child_profile_id, edge.guardian_profile_id, edge.primary_child)
    pushEdge(childrenByGuardianId, edge.guardian_profile_id, edge.child_profile_id, edge.primary_child)
  }

  const profileScope = Array.from(seen)
  const familyAdjacency = new Map<string, Set<string>>()
  for (const profileId of profileScope) {
    if (!familyAdjacency.has(profileId)) {
      familyAdjacency.set(profileId, new Set())
    }
  }

  for (const edge of familyEdges) {
    if (!familyAdjacency.has(edge.guardian_profile_id)) {
      familyAdjacency.set(edge.guardian_profile_id, new Set())
    }
    if (!familyAdjacency.has(edge.child_profile_id)) {
      familyAdjacency.set(edge.child_profile_id, new Set())
    }
    familyAdjacency.get(edge.guardian_profile_id)?.add(edge.child_profile_id)
    familyAdjacency.get(edge.child_profile_id)?.add(edge.guardian_profile_id)
  }

  const profileRows: RidingProfileRow[] = []
  for (const profileChunk of chunkArray(profileScope, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, user_id, role, firstname, surname, email, federal_electoral_district_name')
      .in('id', profileChunk)

    if (error) {
      console.error('[workshop enrollment] enrichment failed to load profile rows', {
        chunkSize: profileChunk.length,
        error: error.message,
      })
      continue
    }

    profileRows.push(...((data ?? []) as RidingProfileRow[]))
  }

  if (!profileRows.length) {
    return byProfileId
  }

  const latestSubmissionByProfileId = new Map<string, { occurredAt: string; ip: string }>()
  for (const profileChunk of chunkArray(profileScope, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissions } = await (adminClient.from('form_submission' as any) as any)
      .select('profile_id, submitted_at, ip_address, forwarded_for')
      .in('profile_id', profileChunk)
      .order('submitted_at', { ascending: false })

    for (const submission of submissions ?? []) {
      const profileId = typeof submission.profile_id === 'string' ? submission.profile_id : ''
      const occurredAt = typeof submission.submitted_at === 'string' ? submission.submitted_at : ''
      const ip = parsePrimaryIp(submission.ip_address, submission.forwarded_for)
      if (!profileId || !occurredAt || !ip || latestSubmissionByProfileId.has(profileId)) continue
      latestSubmissionByProfileId.set(profileId, { occurredAt, ip })
    }
  }

  const { data: discrepancyRowsRaw } = await (adminClient.from('suspicious_signal') as any)
    .select('id, family_profile_ids, signal_type, severity, summary, priority_score, created_at')
    .eq('status', 'open')
    .overlaps('family_profile_ids', normalizedProfileIds)
    .order('priority_score', { ascending: false })
    .order('created_at', { ascending: false })

  for (const signal of (discrepancyRowsRaw ?? []) as OpenDiscrepancyRow[]) {
    for (const familyProfileId of signal.family_profile_ids ?? []) {
      if (!normalizedProfileIds.includes(familyProfileId)) continue
      const existing = discrepancyRowsByProfileId.get(familyProfileId) ?? []
      existing.push(signal)
      discrepancyRowsByProfileId.set(familyProfileId, existing)
    }
  }

  profileById = new Map(
    profileRows
      .filter(profile => typeof profile.id === 'string' && profile.id)
      .map(profile => [profile.id, profile])
  )

  for (const profile of profileRows) {
    if (typeof profile.user_id !== 'string' || !profile.user_id) continue
    const existing = profileIdsByUserId.get(profile.user_id) ?? []
    if (!existing.includes(profile.id)) {
      existing.push(profile.id)
      profileIdsByUserId.set(profile.user_id, existing)
    }
  }

  const userIds = Array.from(profileIdsByUserId.keys())
  const latestLoginByUserId = new Map<string, { occurredAt: string; ip: string }>()
  for (const userChunk of chunkArray(userIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: loginEvents } = await (adminClient.from('login_event' as any) as any)
      .select('user_id, event_at, ip_address, forwarded_for')
      .in('user_id', userChunk)
      .order('event_at', { ascending: false })

    for (const event of loginEvents ?? []) {
      const userId = typeof event.user_id === 'string' ? event.user_id : ''
      const occurredAt = typeof event.event_at === 'string' ? event.event_at : ''
      const ip = parsePrimaryIp(event.ip_address, event.forwarded_for)
      if (!userId || !occurredAt || !ip || latestLoginByUserId.has(userId)) continue
      latestLoginByUserId.set(userId, { occurredAt, ip })
    }
  }

  const latestIpByProfileId = new Map<string, { occurredAt: string; ip: string }>()
  for (const profileId of profileScope) {
    const profile = profileById.get(profileId)
    const submissionCandidate = latestSubmissionByProfileId.get(profileId) ?? null
    const loginCandidate =
      profile?.user_id && latestLoginByUserId.get(profile.user_id)
        ? latestLoginByUserId.get(profile.user_id)!
        : null

    if (submissionCandidate && loginCandidate) {
      latestIpByProfileId.set(
        profileId,
        submissionCandidate.occurredAt >= loginCandidate.occurredAt ? submissionCandidate : loginCandidate
      )
    } else if (submissionCandidate) {
      latestIpByProfileId.set(profileId, submissionCandidate)
    } else if (loginCandidate) {
      latestIpByProfileId.set(profileId, loginCandidate)
    }
  }

  const uniqueLatestIps = Array.from(new Set(Array.from(latestIpByProfileId.values()).map(entry => entry.ip)))
  const geoByIp = new Map<string, Awaited<ReturnType<typeof resolveIpGeolocation>>>()
  await Promise.all(
    uniqueLatestIps.map(async ip => {
      const geo = await resolveIpGeolocation(ip)
      geoByIp.set(ip, geo)
    })
  )

  const visited = new Set<string>()
  for (const rootProfileId of profileScope) {
    if (visited.has(rootProfileId)) continue

    const familyIds: string[] = []
    const bfsQueue = [rootProfileId]
    visited.add(rootProfileId)

    while (bfsQueue.length) {
      const currentProfileId = bfsQueue.shift()
      if (!currentProfileId) continue
      familyIds.push(currentProfileId)

      for (const neighbor of familyAdjacency.get(currentProfileId) ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        bfsQueue.push(neighbor)
      }
    }

    familyIds.sort((left, right) => left.localeCompare(right))
    for (const familyProfileId of familyIds) {
      familyProfileIdsByProfileId.set(familyProfileId, familyIds)
    }
  }

  const ridingNames = Array.from(
    new Set(
      profileRows
        .map(profile => normalizeRiding(profile.federal_electoral_district_name))
        .filter((riding): riding is string => Boolean(riding))
    )
  )

  const mealKitByRidingName = new Map<string, boolean>()
  if (ridingNames.length) {
    for (const ridingChunk of chunkArray(ridingNames, IN_CLAUSE_BATCH_SIZE)) {
      const { data: ridingRows, error: ridingRowsError } = await adminClient
        .from('federal_electoral_district')
        .select('name, meal_kit')
        .in('name', ridingChunk)

      if (ridingRowsError) {
        console.error('[workshop enrollment] enrichment failed to load riding meal-kit rows', {
          chunkSize: ridingChunk.length,
          error: ridingRowsError.message,
        })
        continue
      }

      for (const riding of ridingRows ?? []) {
        if (typeof riding.name !== 'string') continue
        mealKitByRidingName.set(riding.name, riding.meal_kit === true)
      }
    }
  }

  for (const profile of profileById.values()) {
    const ridingName = normalizeRiding(profile.federal_electoral_district_name)
    if (!ridingName) {
      mealKitByProfileId.set(profile.id, false)
      continue
    }

    mealKitByProfileId.set(profile.id, mealKitByRidingName.get(ridingName) === true)
  }

  const submissionsById = new Map<string, FormSubmissionRow>()
  for (const profileChunk of chunkArray(profileScope, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissionRows, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('profile_id', profileChunk)

    if (error) {
      console.error('[workshop enrollment] enrichment failed to load form submissions by profile', {
        chunkSize: profileChunk.length,
        error: error.message,
      })
      continue
    }

    for (const row of (submissionRows ?? []) as FormSubmissionRow[]) {
      submissionsById.set(row.id, row)
    }
  }

  const familyUserIds = Array.from(
    new Set(
      profileRows
        .map(profile => (typeof profile.user_id === 'string' ? profile.user_id : ''))
        .filter(Boolean)
    )
  )

  for (const userChunk of chunkArray(familyUserIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissionRows, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('user_id', userChunk)

    if (error) {
      console.error('[workshop enrollment] enrichment failed to load form submissions by user', {
        chunkSize: userChunk.length,
        error: error.message,
      })
      continue
    }

    for (const row of (submissionRows ?? []) as FormSubmissionRow[]) {
      submissionsById.set(row.id, row)
    }
  }

  const submissions = Array.from(submissionsById.values())

  if (submissions.length) {
    const submissionIds = submissions
      .map(submission => submission.id)
      .filter((submissionId): submissionId is string => Boolean(submissionId))

    if (submissionIds.length) {
      const answerRows: FormAnswerRow[] = []
      for (const submissionChunk of chunkArray(submissionIds, IN_CLAUSE_BATCH_SIZE)) {
        const { data, error } = await adminClient
          .from('form_answer')
          .select('submission_id, question_code, value')
          .in('question_code', [GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE, PRIOR_PARTICIPATION_QUESTION_CODE])
          .in('submission_id', submissionChunk)

        if (error) {
          console.error('[workshop enrollment] enrichment failed to load enrichment answers', {
            chunkSize: submissionChunk.length,
            error: error.message,
          })
          continue
        }

        answerRows.push(...((data ?? []) as FormAnswerRow[]))
      }

      if (answerRows.length) {
        const submissionById = new Map(submissions.map(submission => [submission.id, submission]))
        const latestGiftCardByProfileId = new Map<string, { value: string; submittedAt: number }>()
        const latestPriorParticipationByProfileId = new Map<string, { value: string; submittedAt: number }>()

        for (const answer of answerRows) {
          const submission = submissionById.get(answer.submission_id)
          const associatedProfileIds = new Set<string>()
          if (typeof submission?.profile_id === 'string' && submission.profile_id) {
            associatedProfileIds.add(submission.profile_id)
          }
          if (typeof submission?.user_id === 'string' && submission.user_id) {
            for (const relatedProfileId of profileIdsByUserId.get(submission.user_id) ?? []) {
              associatedProfileIds.add(relatedProfileId)
            }
          }
          if (!associatedProfileIds.size) continue

          const value = typeof answer.value === 'string' ? answer.value.trim() : ''
          if (!value) continue

          const submittedAt = Date.parse(submission?.submitted_at ?? '')
          const submittedAtTime = Number.isNaN(submittedAt) ? 0 : submittedAt
          if (answer.question_code === GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE) {
            for (const profileId of associatedProfileIds) {
              const existing = latestGiftCardByProfileId.get(profileId)
              if (!existing || submittedAtTime > existing.submittedAt) {
                latestGiftCardByProfileId.set(profileId, {
                  value,
                  submittedAt: submittedAtTime,
                })
              }
            }
            continue
          }

          if (answer.question_code === PRIOR_PARTICIPATION_QUESTION_CODE) {
            const normalized = normalizePriorParticipation(value)
            if (!normalized) continue
            for (const profileId of associatedProfileIds) {
              const existing = latestPriorParticipationByProfileId.get(profileId)
              if (!existing || submittedAtTime > existing.submittedAt) {
                latestPriorParticipationByProfileId.set(profileId, {
                  value: normalized,
                  submittedAt: submittedAtTime,
                })
              }
            }
          }
        }

        giftCardPreferenceByProfileId = new Map(
          Array.from(latestGiftCardByProfileId.entries()).map(([profileId, entry]) => [profileId, entry.value])
        )
        priorParticipationByProfileId = new Map(
          Array.from(latestPriorParticipationByProfileId.entries()).map(([profileId, entry]) => [profileId, entry.value])
        )
      }
    }
  }

  for (const profileId of normalizedProfileIds) {
    const enrollmentProfile = profileById.get(profileId) ?? null

    const inferredStudentProfileId = (() => {
      if (!profileId) return null
      if (enrollmentProfile?.role === 'student') return profileId
      if (enrollmentProfile?.role === 'guardian') {
        return preferredRelatedProfileId(childrenByGuardianId, profileId)
      }

      const directChild = preferredRelatedProfileId(childrenByGuardianId, profileId)
      if (directChild) return directChild
      return profileId
    })()

    const studentRiding = inferredStudentProfileId
      ? normalizeRiding(profileById.get(inferredStudentProfileId)?.federal_electoral_district_name)
      : null

    const inferredParentProfileId = (() => {
      if (!profileId) return null
      if (inferredStudentProfileId) {
        const guardianId = preferredRelatedProfileId(guardiansByChildId, inferredStudentProfileId)
        if (guardianId) return guardianId
      }
      if (enrollmentProfile?.role === 'guardian') return profileId
      return preferredRelatedProfileId(guardiansByChildId, profileId)
    })()

    const parentRiding = inferredParentProfileId
      ? normalizeRiding(profileById.get(inferredParentProfileId)?.federal_electoral_district_name)
      : null

    const ridingDisplay =
      studentRiding ?? parentRiding ?? normalizeRiding(enrollmentProfile?.federal_electoral_district_name) ?? ''

    const profileHoverName = fullNameFromProfile(enrollmentProfile) ?? 'N/A'
    const profileHoverEmail = normalizeText(enrollmentProfile?.email) ?? 'N/A'
    const profileHoverParentEmail = inferredParentProfileId
      ? normalizeText(profileById.get(inferredParentProfileId)?.email) ?? 'N/A'
      : 'N/A'

    const candidateProfileIds: string[] = []
    const addCandidate = (candidateId: string | null) => {
      if (!candidateId || candidateProfileIds.includes(candidateId)) return
      candidateProfileIds.push(candidateId)
    }

    addCandidate(inferredStudentProfileId)
    addCandidate(inferredParentProfileId)

    for (const familyProfileId of familyProfileIdsByProfileId.get(profileId) ?? []) {
      addCandidate(familyProfileId)
    }

    for (const candidateProfileId of [...candidateProfileIds]) {
      const candidateUserId = profileById.get(candidateProfileId)?.user_id
      if (typeof candidateUserId !== 'string' || !candidateUserId) continue
      for (const sameUserProfileId of profileIdsByUserId.get(candidateUserId) ?? []) {
        addCandidate(sameUserProfileId)
      }
    }

    addCandidate(profileId || null)

    const giftcardDisplay = (() => {
      for (const candidateProfileId of candidateProfileIds) {
        if (mealKitByProfileId.get(candidateProfileId) === true) {
          return 'Meal Kit'
        }

        const giftCardChoice = giftCardPreferenceByProfileId.get(candidateProfileId)
        if (giftCardChoice) {
          return giftCardChoice
        }
      }

      return 'N/A'
    })()

    const priorParticipationDisplay = (() => {
      for (const candidateProfileId of candidateProfileIds) {
        const value = priorParticipationByProfileId.get(candidateProfileId)
        if (value) {
          return value
        }
      }
      return 'N/A'
    })()

    const discrepancyInfo = (() => {
      const uniqueSignals = new Map<string, OpenDiscrepancyRow>()
      for (const candidateProfileId of candidateProfileIds) {
        for (const signal of discrepancyRowsByProfileId.get(candidateProfileId) ?? []) {
          if (!uniqueSignals.has(signal.id)) {
            uniqueSignals.set(signal.id, signal)
          }
        }
      }

      const sortedSignals = Array.from(uniqueSignals.values()).sort((left, right) => {
        const leftScore = typeof left.priority_score === 'number' ? left.priority_score : 0
        const rightScore = typeof right.priority_score === 'number' ? right.priority_score : 0
        if (leftScore !== rightScore) return rightScore - leftScore
        return right.created_at.localeCompare(left.created_at)
      })

      const top = sortedSignals[0] ?? null
      if (!top) {
        return {
          top: '',
          more: '',
        }
      }

      const topSeverity = typeof top.severity === 'string' ? top.severity.toUpperCase() : 'OPEN'
      return {
        top: `[${topSeverity}] ${top.summary}`,
        more:
          sortedSignals.length > 1
            ? `+${sortedSignals.length - 1} more open signal${sortedSignals.length - 1 === 1 ? '' : 's'}`
            : '',
      }
    })()

    const latestIpInfo = (() => {
      for (const candidateProfileId of candidateProfileIds) {
        const latest = latestIpByProfileId.get(candidateProfileId)
        if (!latest) continue
        const geo = geoByIp.get(latest.ip) ?? null
        return {
          ip: latest.ip,
          geo: formatGeoLabel(geo),
        }
      }

      return { ip: '', geo: '' }
    })()

    const geoLocationsDisplay = (() => {
      const uniqueLabels: string[] = []
      for (const candidateProfileId of candidateProfileIds) {
        const latest = latestIpByProfileId.get(candidateProfileId)
        if (!latest) continue
        const label = formatGeoLabel(geoByIp.get(latest.ip) ?? null)
        if (!uniqueLabels.includes(label)) {
          uniqueLabels.push(label)
        }
      }

      if (!uniqueLabels.length) return 'N/A'
      if (uniqueLabels.length <= 2) return uniqueLabels.join(' | ')
      return `${uniqueLabels.slice(0, 2).join(' | ')} +${uniqueLabels.length - 2} more`
    })()

    byProfileId[profileId] = {
      riding_display: ridingDisplay,
      geo_locations_display: geoLocationsDisplay,
      giftcard_display: giftcardDisplay,
      prior_participation_display: priorParticipationDisplay,
      profile_hover_top_discrepancy: discrepancyInfo.top,
      profile_hover_more_discrepancies: discrepancyInfo.more,
      profile_hover_name: familyContextByProfileId[profileId]?.profile_hover_name ?? profileHoverName,
      profile_hover_parent_name: familyContextByProfileId[profileId]?.profile_hover_parent_name ?? 'N/A',
      profile_hover_email: familyContextByProfileId[profileId]?.profile_hover_email ?? profileHoverEmail,
      profile_hover_parent_email:
        familyContextByProfileId[profileId]?.profile_hover_parent_email ?? profileHoverParentEmail,
      profile_hover_latest_ip: latestIpInfo.ip,
      profile_hover_latest_ip_geo: latestIpInfo.geo,
      profile_hover_parent_phone: familyContextByProfileId[profileId]?.profile_hover_parent_phone ?? 'N/A',
      profile_hover_student_geo: familyContextByProfileId[profileId]?.profile_hover_student_geo ?? 'N/A',
      profile_hover_parent_geo: familyContextByProfileId[profileId]?.profile_hover_parent_geo ?? 'N/A',
      profile_hover_student_submitted_address:
        familyContextByProfileId[profileId]?.profile_hover_student_submitted_address ?? 'N/A',
      profile_hover_parent_address: familyContextByProfileId[profileId]?.profile_hover_parent_address ?? 'N/A',
    }
  }

  return byProfileId
}
