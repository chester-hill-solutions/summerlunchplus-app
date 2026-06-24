import { resolveIpGeolocation } from '@/lib/geoip.server'
import { adminClient } from '@/lib/supabase/adminClient'

const RELATIONSHIP_BATCH_SIZE = 100
const IN_CLAUSE_BATCH_SIZE = 250

const ADDRESS_QUESTION_TO_FIELD = {
  address_street: 'street_address',
  address_city: 'city',
  address_province: 'province',
  address_postal_code: 'postcode',
} as const

type AddressField = (typeof ADDRESS_QUESTION_TO_FIELD)[keyof typeof ADDRESS_QUESTION_TO_FIELD]

type ProfileRow = {
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

type AddressDraft = {
  submittedAt: number
  street_address?: string
  city?: string
  province?: string
  postcode?: string
}

export type FamilyContextEnrichment = {
  profile_hover_name: string
  profile_hover_email: string
  profile_hover_parent_email: string
  profile_hover_parent_phone: string
  profile_hover_student_geo: string
  profile_hover_parent_geo: string
  profile_hover_student_submitted_address: string
  profile_hover_parent_address: string
}

const normalizeText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const formatAddress = (input: {
  street_address?: string | null
  city?: string | null
  province?: string | null
  postcode?: string | null
}) => {
  const parts = [input.street_address, input.city, input.province, input.postcode]
    .map(part => normalizeText(part))
    .filter((part): part is string => Boolean(part))
  return parts.length ? parts.join(', ') : null
}

const fullNameFromProfile = (profile: ProfileRow | null | undefined) => {
  const firstname = normalizeText(profile?.firstname)
  const surname = normalizeText(profile?.surname)
  const fullName = [firstname, surname].filter(Boolean).join(' ').trim()
  return fullName || null
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

const upsertAddressDraft = (
  addressDraftsByProfileId: Map<string, Map<string, AddressDraft>>,
  profileId: string,
  submissionId: string,
  submittedAt: number,
  field: AddressField,
  value: string
) => {
  const draftsBySubmission = addressDraftsByProfileId.get(profileId) ?? new Map<string, AddressDraft>()
  const current = draftsBySubmission.get(submissionId) ?? { submittedAt }
  current.submittedAt = submittedAt
  current[field] = value
  draftsBySubmission.set(submissionId, current)
  addressDraftsByProfileId.set(profileId, draftsBySubmission)
}

const submittedAddressForProfile = (
  addressDraftsByProfileId: Map<string, Map<string, AddressDraft>>,
  profileId: string
) => {
  const drafts = Array.from(addressDraftsByProfileId.get(profileId)?.values() ?? [])
    .filter(draft =>
      Boolean(
        draft.street_address ||
          draft.city ||
          draft.province ||
          draft.postcode
      )
    )
    .sort((left, right) => right.submittedAt - left.submittedAt)
  if (!drafts.length) return null
  return formatAddress(drafts[0])
}

export async function loadFamilyContextByProfileIds(profileIds: string[]) {
  const normalizedProfileIds = Array.from(new Set(profileIds.filter(Boolean)))
  const byProfileId: Record<string, FamilyContextEnrichment> = {}

  if (!normalizedProfileIds.length) {
    return byProfileId
  }

  const guardiansByChildId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const childrenByGuardianId = new Map<string, Array<{ profileId: string; primary: boolean }>>()
  const profileIdsByUserId = new Map<string, string[]>()

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
      console.error('[family-context] failed to load family edges', {
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
  const profileRows: ProfileRow[] = []
  for (const profileChunk of chunkArray(profileScope, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('profile')
      .select('id, user_id, role, firstname, surname, email, phone, street_address, city, province, postcode')
      .in('id', profileChunk)

    if (error) {
      console.error('[family-context] failed to load profile rows', {
        chunkSize: profileChunk.length,
        error: error.message,
      })
      continue
    }

    profileRows.push(...((data ?? []) as ProfileRow[]))
  }

  const profileById = new Map(
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

  const submissionsById = new Map<string, FormSubmissionRow>()
  for (const profileChunk of chunkArray(profileScope, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissionRows } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('profile_id', profileChunk)

    for (const row of (submissionRows ?? []) as FormSubmissionRow[]) {
      submissionsById.set(row.id, row)
    }
  }

  for (const userChunk of chunkArray(userIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissionRows } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('user_id', userChunk)

    for (const row of (submissionRows ?? []) as FormSubmissionRow[]) {
      submissionsById.set(row.id, row)
    }
  }

  const submissionIds = Array.from(submissionsById.keys())
  const addressDraftsByProfileId = new Map<string, Map<string, AddressDraft>>()
  if (submissionIds.length) {
    const answerRows: FormAnswerRow[] = []
    const addressQuestionCodes = Object.keys(ADDRESS_QUESTION_TO_FIELD)
    for (const submissionChunk of chunkArray(submissionIds, IN_CLAUSE_BATCH_SIZE)) {
      const { data, error } = await adminClient
        .from('form_answer')
        .select('submission_id, question_code, value')
        .in('question_code', addressQuestionCodes)
        .in('submission_id', submissionChunk)

      if (error) {
        console.error('[family-context] failed to load address answers', {
          chunkSize: submissionChunk.length,
          error: error.message,
        })
        continue
      }

      answerRows.push(...((data ?? []) as FormAnswerRow[]))
    }

    for (const answer of answerRows) {
      if (!(answer.question_code in ADDRESS_QUESTION_TO_FIELD)) continue
      const submission = submissionsById.get(answer.submission_id)
      const value = normalizeText(answer.value)
      if (!submission || !value) continue

      const associatedProfileIds = new Set<string>()
      if (typeof submission.profile_id === 'string' && submission.profile_id) {
        associatedProfileIds.add(submission.profile_id)
      }
      if (typeof submission.user_id === 'string' && submission.user_id) {
        for (const relatedProfileId of profileIdsByUserId.get(submission.user_id) ?? []) {
          associatedProfileIds.add(relatedProfileId)
        }
      }
      if (!associatedProfileIds.size) continue

      const submittedAt = Date.parse(submission.submitted_at ?? '')
      const submittedAtTime = Number.isNaN(submittedAt) ? 0 : submittedAt
      const field = ADDRESS_QUESTION_TO_FIELD[answer.question_code as keyof typeof ADDRESS_QUESTION_TO_FIELD]
      for (const associatedProfileId of associatedProfileIds) {
        upsertAddressDraft(
          addressDraftsByProfileId,
          associatedProfileId,
          answer.submission_id,
          submittedAtTime,
          field,
          value
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

    const inferredParentProfileId = (() => {
      if (!profileId) return null
      if (inferredStudentProfileId) {
        const guardianId = preferredRelatedProfileId(guardiansByChildId, inferredStudentProfileId)
        if (guardianId) return guardianId
      }
      if (enrollmentProfile?.role === 'guardian') return profileId
      return preferredRelatedProfileId(guardiansByChildId, profileId)
    })()

    const parentProfile = inferredParentProfileId ? profileById.get(inferredParentProfileId) ?? null : null
    const studentProfile = inferredStudentProfileId ? profileById.get(inferredStudentProfileId) ?? null : null

    const profileHoverName = fullNameFromProfile(enrollmentProfile) ?? 'N/A'
    const profileHoverEmail = normalizeText(enrollmentProfile?.email) ?? 'N/A'
    const profileHoverParentEmail = normalizeText(parentProfile?.email) ?? 'N/A'
    const profileHoverParentPhone = normalizeText(parentProfile?.phone) ?? 'N/A'

    const parentGeo = (() => {
      if (!inferredParentProfileId) return null
      const latestParentIp = latestIpByProfileId.get(inferredParentProfileId)
      if (!latestParentIp) return null
      return formatGeoLabel(geoByIp.get(latestParentIp.ip) ?? null)
    })()

    const studentGeo = (() => {
      if (!inferredStudentProfileId) return null
      const latestStudentIp = latestIpByProfileId.get(inferredStudentProfileId)
      if (!latestStudentIp) return null
      return formatGeoLabel(geoByIp.get(latestStudentIp.ip) ?? null)
    })()

    const profileHoverParentAddress =
      formatAddress({
        street_address: parentProfile?.street_address,
        city: parentProfile?.city,
        province: parentProfile?.province,
        postcode: parentProfile?.postcode,
      }) ?? 'N/A'

    const profileHoverStudentSubmittedAddress =
      (inferredStudentProfileId ? submittedAddressForProfile(addressDraftsByProfileId, inferredStudentProfileId) : null) ??
      formatAddress({
        street_address: studentProfile?.street_address,
        city: studentProfile?.city,
        province: studentProfile?.province,
        postcode: studentProfile?.postcode,
      }) ??
      'N/A'

    byProfileId[profileId] = {
      profile_hover_name: profileHoverName,
      profile_hover_email: profileHoverEmail,
      profile_hover_parent_email: profileHoverParentEmail,
      profile_hover_parent_phone: profileHoverParentPhone,
      profile_hover_student_geo: studentGeo ?? 'N/A',
      profile_hover_parent_geo: parentGeo ?? 'N/A',
      profile_hover_student_submitted_address: profileHoverStudentSubmittedAddress,
      profile_hover_parent_address: profileHoverParentAddress,
    }
  }

  return byProfileId
}
