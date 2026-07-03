import { requireAuth } from '@/lib/auth.server'
import { Button } from '@/components/ui/button'
import { Constants, type Database } from '@/lib/database.types'
import { EXPORT_TYPE_CLASS_ATTENDANCE_CSV } from '@/lib/exports/types'
import { resolveIpGeolocation } from '@/lib/geoip.server'
import { isGiftCardReleasedNow } from '@/lib/gift-cards/release.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'
import { runZoomJobsForClass } from '@/lib/zoom-jobs/runner.server'
import { Download } from 'lucide-react'
import { Form, useLocation } from 'react-router'
import type { Route } from './+types/class-attendance'
import TableDisplay from './table-display'
import { isIP } from 'node:net'

type AttendanceRow = {
  id: string
  class_id: string
  profile_id: string
  status: 'unknown' | 'present' | 'absent' | null
  photo_status: 'uploaded' | 'accepted' | 'rejected' | null
  camera_on: boolean | null
  gift_card_blocked: boolean
  gift_card_block_reason: string | null
  gift_card_blocked_at: string | null
  gift_card_blocked_by: string | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

type ClassRow = {
  id: string
  workshop_id: string | null
  starts_at: string
  ends_at: string
}

type WorkshopRow = {
  id: string
  description: string | null
}

type ProfileRow = {
  id: string
  firstname: string | null
  surname: string | null
  email: string | null
}

type MeetingRow = {
  id: string
  class_id: string
  status: string
  error_message: string | null
  last_synced_at: string | null
  zoom_meeting_id: string | null
  topic: string | null
  start_time: string | null
  duration_minutes: number | null
  join_url: string | null
  host_zoom_user_email: string | null
}

type RegistrantRow = {
  class_id: string
  profile_id: string
  zoom_registrant_id: string | null
  zoom_join_url: string | null
  last_sent_at: string | null
}

type AttendancePhotoRow = {
  class_id: string
  profile_id: string
  uploaded_at: string
}

type SyncRunRow = {
  id: string
  class_zoom_meeting_id: string
  status: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  payload: unknown
}

type GiftCardAllocationRow = {
  id: string
  class_id: string
  profile_id: string
  gift_card_asset_id: string
  status: 'allocated' | 'sent' | 'opened'
  blocked: boolean
  blocked_reason: string | null
  reminder_sent_at: string | null
  first_opened_at: string | null
  last_opened_at: string | null
  open_count: number
  metadata: { release_at?: string | null } | null
}

type GiftCardAssetRow = {
  id: string
  provider: 'PC' | 'Sobeys'
  asset_url: string
  value: number
}

type GiftCardClickRow = {
  gift_card_allocation_id: string
  profile_id: string | null
  ip_address: string | null
  created_at: string
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

const IN_CLAUSE_BATCH_SIZE = 150
const CLASS_ATTENDANCE_FETCH_BATCH_SIZE = 1000

const isSchemaMismatchError = (error: { code?: string | null; message?: string | null } | null) => {
  if (!error) return false
  if (typeof error.code === 'string' && error.code.startsWith('PGRST2')) return true
  if (error.code === '42703' || error.code === '42P01') return true
  const message = (error.message ?? '').toLowerCase()
  return (
    message.includes('column') && message.includes('does not exist')
  ) ||
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('schema cache') ||
    message.includes('could not find the table') ||
    message.includes('could not find the')
}

const chunkArray = <T,>(items: T[], size: number) => {
  if (size <= 0 || !items.length) return [] as T[][]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}

const displayName = (profile: ProfileRow | null) => {
  const first = (profile?.firstname ?? '').trim()
  const last = (profile?.surname ?? '').trim()
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  if (profile?.email) return profile.email
  return ''
}

const displayNameOrId = (profile: ProfileRow | null, fallbackId: string) => {
  const label = displayName(profile)
  return label || `Unknown student (${fallbackId.slice(0, 8)})`
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

const normalizeGiftCardPreference = (value: string | null | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (!normalized) return 'N/A'
  if (normalized.includes('meal kit')) return 'Meal Kit'
  if (normalized.includes('sobeys')) return 'Sobeys'
  if (normalized.includes('pc') || normalized.includes('president')) return 'PC'
  return value?.trim() || 'N/A'
}

export async function loader({ request }: Route.LoaderArgs) {
  const auth = await requireAuth(request)
  const attendanceRows: AttendanceRow[] = []
  let classAttendanceSelect =
    'id, class_id, profile_id, status, photo_status, camera_on, gift_card_blocked, gift_card_block_reason, gift_card_blocked_at, gift_card_blocked_by, recorded_by, created_at, updated_at'
  let hasGiftCardSchema = true
  for (let offset = 0; ; offset += CLASS_ATTENDANCE_FETCH_BATCH_SIZE) {
    let { data, error } = await adminClient
      .from('class_attendance')
      .select(classAttendanceSelect)
      .order('created_at', { ascending: false })
      .range(offset, offset + CLASS_ATTENDANCE_FETCH_BATCH_SIZE - 1)

    if (error && hasGiftCardSchema && classAttendanceSelect.includes('gift_card_blocked') && isSchemaMismatchError(error)) {
      hasGiftCardSchema = false
      classAttendanceSelect =
        'id, class_id, profile_id, status, photo_status, camera_on, recorded_by, created_at, updated_at'
      const fallbackResult = await adminClient
        .from('class_attendance')
        .select(classAttendanceSelect)
        .order('created_at', { ascending: false })
        .range(offset, offset + CLASS_ATTENDANCE_FETCH_BATCH_SIZE - 1)
      data = fallbackResult.data
      error = fallbackResult.error
    }

    if (error) {
      throw new Response(error.message, { status: 500 })
    }

    const chunk = ((data ?? []) as unknown as Array<
      Omit<AttendanceRow, 'gift_card_blocked' | 'gift_card_block_reason' | 'gift_card_blocked_at' | 'gift_card_blocked_by'> &
        Partial<Pick<AttendanceRow, 'gift_card_blocked' | 'gift_card_block_reason' | 'gift_card_blocked_at' | 'gift_card_blocked_by'>>
    >).map(row => ({
      ...row,
      gift_card_blocked: row.gift_card_blocked === true,
      gift_card_block_reason: row.gift_card_block_reason ?? null,
      gift_card_blocked_at: row.gift_card_blocked_at ?? null,
      gift_card_blocked_by: row.gift_card_blocked_by ?? null,
    })) as AttendanceRow[]
    attendanceRows.push(...chunk)
    if (chunk.length < CLASS_ATTENDANCE_FETCH_BATCH_SIZE) {
      break
    }
  }
  const classIds = Array.from(new Set(attendanceRows.map(row => row.class_id).filter(Boolean)))
  const profileIds = Array.from(new Set(attendanceRows.map(row => row.profile_id).filter(Boolean)))
  const recordedByIds = Array.from(new Set(attendanceRows.map(row => row.recorded_by).filter((id): id is string => Boolean(id))))

  let giftCardSchemaAvailable = hasGiftCardSchema
  const classRows: ClassRow[] = []
  const meetingRows: MeetingRow[] = []
  const registrantRows: RegistrantRow[] = []
  const photoRows: AttendancePhotoRow[] = []
  const allocationRowsRaw: GiftCardAllocationRow[] = []

  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('class')
      .select('id, workshop_id, starts_at, ends_at')
      .in('id', chunk)
    if (error) throw new Response(error.message, { status: 500 })
    classRows.push(...((data ?? []) as ClassRow[]))
  }

  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('class_zoom_meeting')
      .select('id, class_id, status, error_message, last_synced_at, zoom_meeting_id, topic, start_time, duration_minutes, join_url, host_zoom_user_email')
      .in('class_id', chunk)
    if (error) throw new Response(error.message, { status: 500 })
    meetingRows.push(...((data ?? []) as MeetingRow[]))
  }

  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('class_zoom_registrant')
      .select('class_id, profile_id, zoom_registrant_id, zoom_join_url, last_sent_at')
      .in('class_id', chunk)
    if (error) throw new Response(error.message, { status: 500 })
    registrantRows.push(...((data ?? []) as RegistrantRow[]))
  }

  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await (adminClient.from('class_attendance_photo' as any) as any)
      .select('class_id, profile_id, uploaded_at')
      .in('class_id', chunk)
    if (error) throw new Response(error.message, { status: 500 })
    photoRows.push(...((data ?? []) as AttendancePhotoRow[]))
  }

  for (const chunk of chunkArray(classIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('gift_card_allocation')
      .select('id, class_id, profile_id, gift_card_asset_id, status, blocked, blocked_reason, reminder_sent_at, first_opened_at, last_opened_at, open_count, metadata')
      .in('class_id', chunk)

    if (error) {
      if (isSchemaMismatchError(error)) {
        giftCardSchemaAvailable = false
        break
      }
      throw new Response(error.message, { status: 500 })
    }

    allocationRowsRaw.push(...((data ?? []) as GiftCardAllocationRow[]))
  }

  const profilesByIdRows: Array<ProfileRow & { user_id?: string | null }> = []
  for (const chunk of chunkArray(profileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: profileChunk, error: profileError } = await adminClient
      .from('profile')
      .select('id, firstname, surname, email, user_id')
      .in('id', chunk)
    if (profileError) throw new Response(profileError.message, { status: 500 })
    profilesByIdRows.push(...((profileChunk ?? []) as Array<ProfileRow & { user_id?: string | null }>))
  }

  const profilesByUserRows: Array<ProfileRow & { user_id?: string | null }> = []
  for (const chunk of chunkArray(recordedByIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: profileChunk, error: profileError } = await adminClient
      .from('profile')
      .select('id, firstname, surname, email, user_id')
      .in('user_id', chunk)
    if (profileError) throw new Response(profileError.message, { status: 500 })
    profilesByUserRows.push(...((profileChunk ?? []) as Array<ProfileRow & { user_id?: string | null }>))
  }

  const relatedProfilesByTarget = new Map<string, Set<string>>()
  for (const profileId of profileIds) {
    relatedProfilesByTarget.set(profileId, new Set([profileId]))
  }

  const guardianRowsByChild: GuardianChildEdge[] = []
  for (const chunk of chunkArray(profileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id')
      .in('child_profile_id', chunk)
    if (error) throw new Response(error.message, { status: 500 })
    guardianRowsByChild.push(...((data ?? []) as GuardianChildEdge[]))
  }

  const childRowsByGuardian: GuardianChildEdge[] = []
  for (const chunk of chunkArray(profileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('person_guardian_child')
      .select('guardian_profile_id, child_profile_id')
      .in('guardian_profile_id', chunk)
    if (error) throw new Response(error.message, { status: 500 })
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
    new Set(
      Array.from(relatedProfilesByTarget.values()).flatMap(set => Array.from(set))
    )
  )

  const preferenceScopeProfiles: Array<ProfileRow & { user_id?: string | null }> = []
  for (const chunk of chunkArray(preferenceProfileScopeIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: profileChunk, error: profileError } = await adminClient
      .from('profile')
      .select('id, firstname, surname, email, user_id')
      .in('id', chunk)
    if (profileError) throw new Response(profileError.message, { status: 500 })
    preferenceScopeProfiles.push(...((profileChunk ?? []) as Array<ProfileRow & { user_id?: string | null }>))
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
  for (const profileId of profileIds) {
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

  const submissionsById = new Map<string, FormSubmissionPreferenceRow>()
  for (const chunk of chunkArray(preferenceSubmissionScopeProfileIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data: submissionRows, error } = await adminClient
      .from('form_submission')
      .select('id, profile_id, user_id, submitted_at')
      .in('profile_id', chunk)

    if (error) throw new Response(error.message, { status: 500 })
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

    if (error) throw new Response(error.message, { status: 500 })
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
      .eq('question_code', 'gift_card_store_preference')
      .in('submission_id', chunk)

    if (error) throw new Response(error.message, { status: 500 })

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
  for (const targetProfileId of profileIds) {
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

  const classes = classRows
  const workshopsIds = Array.from(new Set(classes.map(row => row.workshop_id).filter((id): id is string => Boolean(id))))
  const meetingIds = Array.from(new Set(meetingRows.map(row => row.id)))

  const workshopRows: WorkshopRow[] = []
  for (const chunk of chunkArray(workshopsIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient.from('workshop').select('id, description').in('id', chunk)
    if (error) throw new Response(error.message, { status: 500 })
    workshopRows.push(...((data ?? []) as WorkshopRow[]))
  }

  const syncRows: SyncRunRow[] = []
  for (const chunk of chunkArray(meetingIds, IN_CLAUSE_BATCH_SIZE)) {
    const { data, error } = await adminClient
      .from('class_zoom_participant_sync')
      .select('id, class_zoom_meeting_id, status, created_at, started_at, completed_at, error_message, payload')
      .in('class_zoom_meeting_id', chunk)
      .order('created_at', { ascending: false })
    if (error) throw new Response(error.message, { status: 500 })
    syncRows.push(...((data ?? []) as SyncRunRow[]))
  }

  const allocationRows = giftCardSchemaAvailable ? allocationRowsRaw : []
  const assetIds = Array.from(new Set(allocationRows.map(row => row.gift_card_asset_id).filter(Boolean)))

  let assetRowsRaw: GiftCardAssetRow[] = []
  let clickRowsRaw: GiftCardClickRow[] = []

  if (giftCardSchemaAvailable) {
    for (const chunk of chunkArray(assetIds, IN_CLAUSE_BATCH_SIZE)) {
      const { data, error } = await adminClient.from('gift_card_asset').select('id, provider, asset_url, value').in('id', chunk)
      if (error) {
        if (isSchemaMismatchError(error)) {
          giftCardSchemaAvailable = false
          assetRowsRaw = []
          clickRowsRaw = []
          break
        }
        throw new Response(error.message, { status: 500 })
      }
      assetRowsRaw.push(...((data ?? []) as GiftCardAssetRow[]))
    }

    if (giftCardSchemaAvailable) {
      const allocationIds = allocationRows.map(row => row.id)
      for (const chunk of chunkArray(allocationIds, IN_CLAUSE_BATCH_SIZE)) {
        const { data, error } = await adminClient
          .from('gift_card_click_event')
          .select('gift_card_allocation_id, profile_id, ip_address, created_at')
          .in('gift_card_allocation_id', chunk)
          .order('created_at', { ascending: false })
        if (error) {
          if (isSchemaMismatchError(error)) {
            giftCardSchemaAvailable = false
            assetRowsRaw = []
            clickRowsRaw = []
            break
          }
          throw new Response(error.message, { status: 500 })
        }
        clickRowsRaw.push(...((data ?? []) as GiftCardClickRow[]))
      }
    }
  }

  const assetById = new Map(assetRowsRaw.map(row => [row.id, row]))
  const allocationByClassProfile = new Map<string, GiftCardAllocationRow>()
  for (const row of allocationRows) {
    allocationByClassProfile.set(`${row.class_id}::${row.profile_id}`, row)
  }

  const latestClickByAllocationId = new Map<string, GiftCardClickRow>()
  const clickRows = clickRowsRaw
  for (const row of clickRows) {
    if (!latestClickByAllocationId.has(row.gift_card_allocation_id)) {
      latestClickByAllocationId.set(row.gift_card_allocation_id, row)
    }
  }

  const attendanceProfileByUserId = new Map<string, string[]>()
  for (const profile of profilesByIdRows) {
    if (typeof profile.user_id !== 'string' || !profile.user_id) continue
    const bucket = attendanceProfileByUserId.get(profile.user_id) ?? []
    if (!bucket.includes(profile.id)) {
      bucket.push(profile.id)
      attendanceProfileByUserId.set(profile.user_id, bucket)
    }
  }

  const latestNetworkByProfileId = new Map<string, { occurredAt: string; ip: string }>()
  const setLatestNetwork = (profileId: string, occurredAt: string, ip: string) => {
    if (!profileId || !occurredAt || !ip) return
    const existing = latestNetworkByProfileId.get(profileId)
    if (!existing || occurredAt > existing.occurredAt) {
      latestNetworkByProfileId.set(profileId, { occurredAt, ip })
    }
  }

  for (const row of clickRows) {
    const profileId = typeof row.profile_id === 'string' ? row.profile_id : ''
    const occurredAt = typeof row.created_at === 'string' ? row.created_at : ''
    const ip = parsePrimaryIp(row.ip_address, row.ip_address, null)
    setLatestNetwork(profileId, occurredAt, ip)
  }

  let formSubmissionSelect = 'profile_id, submitted_at, ip_selected, ip_address, forwarded_for'
  for (const chunk of chunkArray(profileIds, IN_CLAUSE_BATCH_SIZE)) {
    let query = (adminClient.from('form_submission' as any) as any)
      .select(formSubmissionSelect)
      .in('profile_id', chunk)
      .order('submitted_at', { ascending: false })

    let { data: submissionRows, error: submissionError } = await query

    if (submissionError && formSubmissionSelect.includes('ip_selected')) {
      const fallbackSelect = 'profile_id, submitted_at, ip_address, forwarded_for'
      let fallbackQuery = (adminClient.from('form_submission' as any) as any)
        .select(fallbackSelect)
        .in('profile_id', chunk)
        .order('submitted_at', { ascending: false })
      const fallbackResult = await fallbackQuery
      if (!fallbackResult.error) {
        formSubmissionSelect = fallbackSelect
        submissionRows = fallbackResult.data
        submissionError = null
      }
    }

    if (submissionError) throw new Response(submissionError.message, { status: 500 })

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
    let query = (adminClient.from('login_event' as any) as any)
      .select(loginEventSelect)
      .in('user_id', chunk)
      .order('event_at', { ascending: false })

    let { data: loginRows, error: loginError } = await query

    if (loginError && loginEventSelect.includes('ip_selected')) {
      const fallbackSelect = 'user_id, event_at, ip_address, forwarded_for'
      let fallbackQuery = (adminClient.from('login_event' as any) as any)
        .select(fallbackSelect)
        .in('user_id', chunk)
        .order('event_at', { ascending: false })
      const fallbackResult = await fallbackQuery
      if (!fallbackResult.error) {
        loginEventSelect = fallbackSelect
        loginRows = fallbackResult.data
        loginError = null
      }
    }

    if (loginError) throw new Response(loginError.message, { status: 500 })

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

  const uniqueClickIps = Array.from(new Set(Array.from(latestNetworkByProfileId.values()).map(entry => entry.ip)))
  const geoByIp = new Map<string, Awaited<ReturnType<typeof resolveIpGeolocation>>>()
  await Promise.all(
    uniqueClickIps.map(async ip => {
      const geo = await resolveIpGeolocation(ip)
      if (geo) {
        geoByIp.set(ip, geo)
      }
    })
  )

  const classById = new Map(classes.map(row => [row.id, row]))
  const workshopById = new Map(workshopRows.map(row => [row.id, row]))
  const profileRowsTyped = [...profilesByIdRows, ...profilesByUserRows]
  const profileById = new Map(profileRowsTyped.map(row => [row.id, row]))
  const profileByUserId = new Map(
    profileRowsTyped
      .map(row => (typeof row.user_id === 'string' && row.user_id ? [row.user_id, row] : null))
      .filter((entry): entry is [string, ProfileRow & { user_id?: string | null }] => Boolean(entry))
  )

  const meetingByClassId = new Map<string, MeetingRow>()
  for (const row of (meetingRows ?? []) as MeetingRow[]) {
    if (!meetingByClassId.has(row.class_id)) meetingByClassId.set(row.class_id, row)
  }

  const latestSyncByMeetingId = new Map<
    string,
    {
      id: string
      status: string
      created_at: string
      started_at: string | null
      completed_at: string | null
      error_message: string | null
      payload: unknown
    }
  >()
  for (const row of syncRows) {
    if (!latestSyncByMeetingId.has(row.class_zoom_meeting_id)) {
      latestSyncByMeetingId.set(row.class_zoom_meeting_id, {
        id: row.id,
        status: row.status,
        created_at: row.created_at,
        started_at: row.started_at,
        completed_at: row.completed_at,
        error_message: row.error_message,
        payload: row.payload,
      })
    }
  }

  const registrantsByClassId = new Map<string, RegistrantRow[]>()
  for (const row of (registrantRows ?? []) as RegistrantRow[]) {
    const bucket = registrantsByClassId.get(row.class_id) ?? []
    bucket.push(row)
    registrantsByClassId.set(row.class_id, bucket)
  }

  const photoSummaryByAttendanceKey = new Map<string, { count: number; latestUploadedAt: string | null }>()
  for (const row of (photoRows ?? []) as AttendancePhotoRow[]) {
    const key = `${row.class_id}::${row.profile_id}`
    const current = photoSummaryByAttendanceKey.get(key)
    if (!current) {
      photoSummaryByAttendanceKey.set(key, { count: 1, latestUploadedAt: row.uploaded_at })
      continue
    }

    const currentMs = current.latestUploadedAt ? new Date(current.latestUploadedAt).getTime() : Number.NaN
    const nextMs = row.uploaded_at ? new Date(row.uploaded_at).getTime() : Number.NaN
    photoSummaryByAttendanceKey.set(key, {
      count: current.count + 1,
      latestUploadedAt:
        Number.isFinite(nextMs) && (!Number.isFinite(currentMs) || nextMs > currentMs)
          ? row.uploaded_at
          : current.latestUploadedAt,
    })
  }

  const rows = attendanceRows.map(row => {
    const classRow = classById.get(row.class_id) ?? null
    const workshop = classRow?.workshop_id ? workshopById.get(classRow.workshop_id) ?? null : null
    const profile = profileById.get(row.profile_id) ?? null
    const meeting = meetingByClassId.get(row.class_id) ?? null
    const registrants = registrantsByClassId.get(row.class_id) ?? []

    const endsAt = classRow?.ends_at ? new Date(classRow.ends_at) : null
    const classEnded = Boolean(endsAt && Number.isFinite(endsAt.getTime()) && endsAt.getTime() <= Date.now())
    const latestSync = meeting ? latestSyncByMeetingId.get(meeting.id) : null

    const zoomEndAt =
      meeting?.start_time && typeof meeting.duration_minutes === 'number'
        ? new Date(new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60_000).toISOString()
        : null

    const studentRegistrant = registrants.find(item => item.profile_id === row.profile_id)
    const photoSummary = photoSummaryByAttendanceKey.get(`${row.class_id}::${row.profile_id}`)
    const giftCardAllocation = allocationByClassProfile.get(`${row.class_id}::${row.profile_id}`)
    const giftCardAsset = giftCardAllocation ? assetById.get(giftCardAllocation.gift_card_asset_id) ?? null : null
    const latestGiftCardClick = giftCardAllocation ? latestClickByAllocationId.get(giftCardAllocation.id) ?? null : null
    const giftCardAllocated = Boolean(giftCardAllocation)
    const giftCardReminderSent = Boolean(giftCardAllocation?.reminder_sent_at)
    const giftCardAvailable =
      giftCardAllocated &&
      !row.gift_card_blocked &&
      Boolean(
        isGiftCardReleasedNow({
          releaseAt: giftCardAllocation?.metadata?.release_at,
          classEndsAt: classRow?.ends_at ?? null,
        })
      )
    const latestProfileNetwork = latestNetworkByProfileId.get(row.profile_id)
    const registrantReady = Boolean(studentRegistrant?.zoom_registrant_id && studentRegistrant.zoom_join_url)
    const reminderSent = Boolean(studentRegistrant?.last_sent_at)

    const latestGeo = (() => {
      const ip = latestProfileNetwork?.ip ?? ''
      if (!ip) return ''
      const geo = geoByIp.get(ip)
      if (!geo) return 'Unknown location'
      return formatGeoLabel(geo)
    })()

    let stepAttendanceSync = 'Pending'
    if (!meeting || meeting.status !== 'created') {
      stepAttendanceSync = 'Blocked (meeting missing)'
    } else if (!classEnded) {
      stepAttendanceSync = 'Not due yet'
    } else if (row.status === 'present' || row.status === 'absent') {
      stepAttendanceSync = 'Done'
    } else if (!latestSync) {
      stepAttendanceSync = 'Missing'
    } else if (latestSync.status === 'completed') {
      stepAttendanceSync = 'Pending review'
    } else if (latestSync.status === 'pending' || latestSync.status === 'running') {
      stepAttendanceSync = 'In progress'
    } else {
      stepAttendanceSync = 'Failed'
    }

    const stepMeetingDetail = [
      `status=${meeting?.status ?? 'missing'}`,
      `zoom_meeting_id=${meeting?.zoom_meeting_id ?? 'none'}`,
      `host=${meeting?.host_zoom_user_email ?? 'none'}`,
      `meeting_error=${meeting?.error_message ?? 'none'}`,
      `meeting_last_synced=${meeting?.last_synced_at ?? 'none'}`,
    ].join(' | ')

    const stepRegistrantDetail = [
      `zoom_registrant_id=${studentRegistrant?.zoom_registrant_id ?? 'none'}`,
      `join_url=${studentRegistrant?.zoom_join_url ?? 'none'}`,
      `registrant_last_updated=${studentRegistrant ? 'present' : 'none'}`,
    ].join(' | ')

    const stepReminderDetail = [
      `last_sent_at=${studentRegistrant?.last_sent_at ?? 'none'}`,
      `eligible=${studentRegistrant ? 'yes' : 'no'}`,
    ].join(' | ')

    const latestSyncPayload =
      latestSync?.payload && typeof latestSync.payload === 'object'
        ? JSON.stringify(latestSync.payload)
        : latestSync?.payload == null
          ? ''
          : String(latestSync.payload)

    const stepAttendanceSyncDetail = [
      `sync_status=${latestSync?.status ?? 'none'}`,
      `sync_id=${latestSync?.id ?? 'none'}`,
      `sync_started=${latestSync?.started_at ?? 'none'}`,
      `sync_completed=${latestSync?.completed_at ?? 'none'}`,
      `sync_error=${latestSync?.error_message ?? 'none'}`,
    ].join(' | ')

    return {
      ...row,
      workshop_description: workshop?.description ?? 'Workshop',
      class_starts_at: classRow?.starts_at ?? null,
      class_ends_at: classRow?.ends_at ?? null,
      profile_display: displayNameOrId(profile, row.profile_id),
      student_join_url: studentRegistrant?.zoom_join_url ?? null,
      zoom_meeting_id: meeting?.zoom_meeting_id ?? null,
      zoom_topic: meeting?.topic ?? null,
      zoom_start_at: meeting?.start_time ?? null,
      zoom_end_at: zoomEndAt,
      zoom_host_email: meeting?.host_zoom_user_email ?? null,
      zoom_join_url: meeting?.join_url ?? null,
      step_meeting: meeting && meeting.status === 'created' && meeting.join_url ? 'Done' : 'Missing',
      step_registrants: registrantReady ? 'Done' : 'Missing',
      step_attendance_rows: 'Done',
      step_reminder: reminderSent ? '✓' : '✗',
      step_attendance_sync: stepAttendanceSync === 'Done' ? '✓' : '✗',
      step_meeting_detail: stepMeetingDetail,
      step_registrants_detail: stepRegistrantDetail,
      step_reminder_detail: stepReminderDetail,
      step_attendance_sync_detail: stepAttendanceSyncDetail,
      latest_sync_payload: latestSyncPayload,
      latest_sync_error: latestSync?.error_message ?? null,
      giftcard_display: normalizeGiftCardPreference(latestGiftCardPreferenceByTargetProfileId.get(row.profile_id)?.value),
      latest_geo: latestGeo || 'N/A',
      gift_card_allocated: giftCardAllocated,
      gift_card_available: giftCardAvailable,
      gift_card_reminder_sent: giftCardReminderSent,
      gift_card_provider: giftCardAsset?.provider ?? null,
      gift_card_join_url: giftCardAsset?.asset_url ?? null,
      gift_card_value: giftCardAsset?.value ?? null,
      gift_card_reminder_sent_at: giftCardAllocation?.reminder_sent_at ?? null,
      gift_card_first_opened_at: giftCardAllocation?.first_opened_at ?? null,
      gift_card_last_opened_at: giftCardAllocation?.last_opened_at ?? null,
      gift_card_open_count: giftCardAllocation?.open_count ?? 0,
      gift_card_last_click_at: latestGiftCardClick?.created_at ?? null,
      gift_card_blocked: row.gift_card_blocked,
      gift_card_block_reason: row.gift_card_block_reason,
      gift_card_block_action: row.gift_card_blocked ? 'Unblock' : 'Block',
      photo_count: photoSummary?.count ?? 0,
      latest_photo_uploaded_at: photoSummary?.latestUploadedAt ?? null,
      recorded_by_email:
        typeof row.recorded_by === 'string' && row.recorded_by
          ? displayName(profileByUserId.get(row.recorded_by) ?? null) || row.recorded_by
          : null,
    }
  })

  rows.sort((left, right) => {
    const leftStart = typeof left.class_starts_at === 'string' ? new Date(left.class_starts_at).getTime() : Number.POSITIVE_INFINITY
    const rightStart = typeof right.class_starts_at === 'string' ? new Date(right.class_starts_at).getTime() : Number.POSITIVE_INFINITY
    if (leftStart !== rightStart) return leftStart - rightStart

    const leftWorkshop = typeof left.workshop_description === 'string' ? left.workshop_description : ''
    const rightWorkshop = typeof right.workshop_description === 'string' ? right.workshop_description : ''
    const workshopCompare = leftWorkshop.localeCompare(rightWorkshop)
    if (workshopCompare !== 0) return workshopCompare

    const leftProfile = typeof left.profile_display === 'string' ? left.profile_display : ''
    const rightProfile = typeof right.profile_display === 'string' ? right.profile_display : ''
    return leftProfile.localeCompare(rightProfile)
  })

  return {
    label: 'Class attendance',
    tableName: 'class-attendance',
    columns: [
      'workshop_description',
      'class_starts_at',
      'profile_display',
      'status',
      'camera_on',
      'photo_status',
      'photo_count',
      'student_join_url',
      'step_reminder',
      'step_attendance_sync',
      'latest_geo',
      'giftcard_display',
      'gift_card_allocated',
      'gift_card_available',
      'gift_card_reminder_sent',
      'gift_card_provider',
      'gift_card_block_action',
      'gift_card_join_url',
      'gift_card_value',
      'gift_card_reminder_sent_at',
      'gift_card_first_opened_at',
      'gift_card_last_opened_at',
      'gift_card_open_count',
      'gift_card_last_click_at',
      'gift_card_blocked',
      'gift_card_block_reason',
      'class_ends_at',
      'latest_photo_uploaded_at',
      'zoom_meeting_id',
      'zoom_topic',
      'zoom_start_at',
      'zoom_end_at',
      'zoom_host_email',
      'zoom_join_url',
      'step_meeting',
      'step_registrants',
      'step_attendance_rows',
      'step_meeting_detail',
      'step_registrants_detail',
      'step_reminder_detail',
      'step_attendance_sync_detail',
      'latest_sync_error',
      'latest_sync_payload',
      'recorded_by_email',
      'created_at',
      'updated_at',
      'class_id',
      'profile_id',
      'id',
      'delete_row',
    ],
    rows,
    columnMeta: {
      workshop_description: { label: 'Workshop', filterable: true, fitContentOnLoad: true },
      class_starts_at: { label: 'Class starts', filterable: true, fitContentOnLoad: true },
      class_ends_at: { label: 'Class ends', filterable: true },
      profile_display: { label: 'Profile', filterable: true, fitContentOnLoad: true },
      status: { label: 'Attendance', filterable: true },
      latest_geo: { label: 'Geo', filterable: true, truncate: true },
      giftcard_display: { label: 'Provider', filterable: true, truncate: true },
      gift_card_allocated: { label: 'Gift allocated', filterable: true },
      gift_card_available: { label: 'Gift available', filterable: true },
      gift_card_reminder_sent: { label: 'Gift reminder sent', filterable: true },
      gift_card_provider: { label: 'Gift card provider', filterable: true },
      gift_card_join_url: { label: 'Gift card link', filterable: true, truncate: true },
      gift_card_value: { label: 'Gift card value', filterable: true },
      gift_card_reminder_sent_at: { label: 'Gift reminder sent', filterable: true },
      gift_card_first_opened_at: { label: 'Gift first opened', filterable: true },
      gift_card_last_opened_at: { label: 'Gift last opened', filterable: true },
      gift_card_open_count: { label: 'Gift opens', filterable: true },
      gift_card_last_click_at: { label: 'Gift last click', filterable: true },
      gift_card_blocked: { label: 'Gift blocked', filterable: true },
      gift_card_block_reason: { label: 'Gift block reason', filterable: true, truncate: true },
      gift_card_block_action: { label: 'Gift block action', filterable: false },
      photo_status: { label: 'Photo status', filterable: true },
      photo_count: { label: 'Photos', filterable: true },
      latest_photo_uploaded_at: { label: 'Latest photo upload', filterable: true },
      camera_on: { label: 'Camera on', filterable: true },
      student_join_url: { label: 'Student join link', truncate: true, filterable: true },
      zoom_meeting_id: { label: 'Zoom meeting ID', filterable: true },
      zoom_topic: { label: 'Zoom topic', truncate: true, filterable: true },
      zoom_start_at: { label: 'Zoom start (UTC)', filterable: true },
      zoom_end_at: { label: 'Zoom end (UTC)', filterable: true },
      zoom_host_email: { label: 'Zoom host', filterable: true },
      zoom_join_url: { label: 'Zoom join URL', truncate: true, filterable: false },
      step_meeting: { label: 'Step 1: Meeting', filterable: true },
      step_registrants: { label: 'Step 2: Zoom registrant', filterable: true },
      step_attendance_rows: { label: 'Step 3: Attendance row', filterable: true },
      step_reminder: { label: 'Reminder', filterable: true },
      step_attendance_sync: { label: 'Attendance sync', filterable: true },
      step_meeting_detail: { label: 'Step 1 detail', filterable: true, truncate: true },
      step_registrants_detail: { label: 'Step 2 detail', filterable: true, truncate: true },
      step_reminder_detail: { label: 'Step 4 detail', filterable: true, truncate: true },
      step_attendance_sync_detail: { label: 'Step 5 detail', filterable: true, truncate: true },
      latest_sync_error: { label: 'Latest sync error', filterable: true, truncate: true },
      latest_sync_payload: { label: 'Latest sync payload', filterable: false, truncate: true },
      recorded_by_email: { label: 'Recorded by', filterable: true, truncate: true },
      created_at: { label: 'Created', filterable: true },
      updated_at: { label: 'Updated', filterable: true },
      class_id: { label: 'Class ID', filterable: true },
      profile_id: { label: 'Profile ID', filterable: true },
      id: { label: 'Attendance ID', filterable: true },
      delete_row: { label: 'Delete', filterable: false },
    },
    canEditStatus: isRoleAtLeast(auth.claims.role, 'staff'),
  }
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)
  if (!isRoleAtLeast(auth.claims.role, 'staff')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const formData = await request.formData()
  const intent = formData.get('intent') as string | null

  if (intent === 'register-student') {
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    if (!classId || !profileId) {
      return {
        ok: false,
        intent: 'register-student',
        class_id: classId,
        profile_id: profileId,
        error: 'Missing identifiers',
      }
    }

    try {
      const [{ data: classRow, error: classError }, { data: profileRow, error: profileError }, { data: registrantBefore, error: registrantBeforeError }] =
        await Promise.all([
          adminClient.from('class').select('workshop_id').eq('id', classId).maybeSingle<{ workshop_id: string | null }>(),
          adminClient.from('profile').select('email').eq('id', profileId).maybeSingle<{ email: string | null }>(),
          adminClient
            .from('class_zoom_registrant')
            .select('zoom_registrant_id, zoom_join_url')
            .eq('class_id', classId)
            .eq('profile_id', profileId)
            .maybeSingle<{ zoom_registrant_id: string | null; zoom_join_url: string | null }>(),
        ])

      if (classError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load class context: ${classError.message}`,
        }
      }

      if (profileError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load profile context: ${profileError.message}`,
        }
      }

      if (registrantBeforeError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load existing registrant context: ${registrantBeforeError.message}`,
        }
      }

      const workshopId = classRow?.workshop_id ?? null
      const { data: approvedEnrollment, error: enrollmentError } = workshopId
        ? await adminClient
            .from('workshop_enrollment')
            .select('id')
            .eq('workshop_id', workshopId)
            .eq('profile_id', profileId)
            .eq('status', 'approved')
            .limit(1)
            .maybeSingle<{ id: string }>()
        : { data: null, error: null }

      if (enrollmentError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to verify approved enrollment: ${enrollmentError.message}`,
        }
      }

      const profileEmail = (profileRow?.email ?? '').trim().toLowerCase()
      const hasProfileEmail = Boolean(profileEmail)

      const { data: guardianEdges, error: guardianEdgeError } = await adminClient
        .from('person_guardian_child')
        .select('guardian_profile_id')
        .eq('child_profile_id', profileId)

      if (guardianEdgeError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load guardian relation context: ${guardianEdgeError.message}`,
        }
      }

      const guardianIds = Array.from(
        new Set((guardianEdges ?? []).map(edge => edge.guardian_profile_id).filter((id): id is string => Boolean(id)))
      )

      const { data: guardians, error: guardianError } = guardianIds.length
        ? await adminClient.from('profile').select('email').in('id', guardianIds)
        : { data: [] as Array<{ email: string | null }>, error: null }

      if (guardianError) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load guardian email context: ${guardianError.message}`,
        }
      }

      const guardianEmailCount = (guardians ?? []).filter(guardian => Boolean((guardian.email ?? '').trim().toLowerCase())).length
      const hasGuardianFallbackEmail = guardianEmailCount > 0
      const identitySource = hasProfileEmail ? 'profile' : hasGuardianFallbackEmail ? 'guardian_fallback' : 'none'

      const appOrigin = new URL(request.url).origin
      const runResult = await runZoomJobsForClass({ classId, appOrigin, runId: `manual-row-${Date.now().toString(36)}` })
      const provision = runResult.provision
      const candidateCountFromProvision =
        provision && typeof provision === 'object'
          ? Number('registrantsCreated' in provision ? provision.registrantsCreated : 0) +
            Number('registrantsUpdated' in provision ? provision.registrantsUpdated : 0) +
            Number('registrantsSkipped' in provision ? provision.registrantsSkipped : 0)
          : 0
      const provisionSkipped = Boolean(provision && typeof provision === 'object' && 'skipped' in provision && provision.skipped)
      const provisionSkipReason =
        provision && typeof provision === 'object' && 'skipReason' in provision ? String(provision.skipReason ?? 'none') : 'none'
      const provisionSummary =
        provision && typeof provision === 'object'
          ? [
              `provision_error=${'error' in provision ? String(provision.error ?? 'none') : 'none'}`,
              `meeting_recreated=${'meetingRecreated' in provision ? String(provision.meetingRecreated) : 'n/a'}`,
              `registrants_created=${'registrantsCreated' in provision ? String(provision.registrantsCreated) : 'n/a'}`,
              `registrants_updated=${'registrantsUpdated' in provision ? String(provision.registrantsUpdated) : 'n/a'}`,
              `registrants_skipped=${'registrantsSkipped' in provision ? String(provision.registrantsSkipped) : 'n/a'}`,
              `provision_skipped=${String(provisionSkipped)}`,
              `provision_skip_reason=${provisionSkipReason}`,
            ].join(' | ')
          : 'provision=unknown'

      const { data: registrant, error } = await adminClient
        .from('class_zoom_registrant')
        .select('zoom_registrant_id, zoom_join_url')
        .eq('class_id', classId)
        .eq('profile_id', profileId)
        .maybeSingle<{ zoom_registrant_id: string | null; zoom_join_url: string | null }>()

      if (error) {
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `${error.message} | ${provisionSummary}`,
          run_result: runResult,
        }
      }

      if (!registrant?.zoom_registrant_id || !registrant.zoom_join_url) {
        const profileApproved = Boolean(approvedEnrollment?.id)
        const registrantBeforeState =
          registrantBefore && (registrantBefore.zoom_registrant_id || registrantBefore.zoom_join_url)
            ? `before_registrant_id=${registrantBefore.zoom_registrant_id ?? 'none'} before_join_url=${registrantBefore.zoom_join_url ?? 'none'}`
            : 'before_registrant=none'
        const registrantAfterState = registrant
          ? `after_registrant_id=${registrant.zoom_registrant_id ?? 'none'} after_join_url=${registrant.zoom_join_url ?? 'none'}`
          : 'after_registrant=none'

        let rootCause = 'unknown_registration_failure'
        if (!workshopId) rootCause = 'class_missing_workshop'
        else if (!profileApproved) rootCause = 'profile_not_approved_for_class_workshop'
        else if (identitySource === 'none') rootCause = 'no_student_or_guardian_email_for_zoom_identity'
        else if (provisionSkipped && provisionSkipReason === 'lock_not_acquired') rootCause = 'class_provision_lock_not_acquired'
        else if (registrant?.zoom_registrant_id && !registrant.zoom_join_url) rootCause = 'zoom_registrant_created_without_join_url'
        else if (!registrant) rootCause = 'registrant_row_not_created_for_profile'

        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: [
            'Register run completed but this student still has no join link.',
            `root_cause=${rootCause}`,
            `candidate_scope=class_wide_approved_profiles`,
            `candidate_count=${candidateCountFromProvision}`,
            `profile_approved_for_class_workshop=${String(profileApproved)}`,
            `identity_source=${identitySource}`,
            `profile_email_present=${String(hasProfileEmail)}`,
            `guardian_email_count=${guardianEmailCount}`,
            registrantBeforeState,
            registrantAfterState,
            provisionSummary,
          ].join(' | '),
          run_result: runResult,
        }
      }

      return {
        ok: true,
        intent: 'register-student',
        class_id: classId,
        profile_id: profileId,
        zoom_join_url: registrant.zoom_join_url,
        message: `Zoom join link created. | ${provisionSummary}`,
        run_result: runResult,
      }
    } catch (error) {
      return {
        ok: false,
        intent: 'register-student',
        class_id: classId,
        profile_id: profileId,
        error: error instanceof Error ? error.message : 'Failed to register student.',
      }
    }
  }

  if (intent === 'delete-attendance-row') {
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    if (!classId || !profileId) {
      return new Response('Missing identifiers', { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const { error } = await supabase.from('class_attendance').delete().eq('class_id', classId).eq('profile_id', profileId)

    if (error) {
      return new Response(error.message, { status: 500, headers: auth.headers })
    }

    return {
      ok: true,
      intent: 'delete-attendance-row',
      class_id: classId,
      profile_id: profileId,
    }
  }

  if (intent === 'toggle-gift-card-block') {
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    const nextBlocked = String(formData.get('blocked') ?? '') === 'true'
    const reason = (formData.get('reason') as string | null)?.trim() ?? ''

    if (!classId || !profileId) {
      return new Response('Missing identifiers', { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const nowIso = new Date().toISOString()
    const { error } = await supabase
      .from('class_attendance')
      .update({
        gift_card_blocked: nextBlocked,
        gift_card_block_reason: nextBlocked ? reason || 'Blocked by staff' : null,
        gift_card_blocked_at: nextBlocked ? nowIso : null,
        gift_card_blocked_by: nextBlocked ? auth.user.id : null,
      })
      .eq('class_id', classId)
      .eq('profile_id', profileId)

    if (error) {
      return new Response(error.message, { status: 500, headers: auth.headers })
    }

    if (nextBlocked) {
      await supabase
        .from('gift_card_allocation')
        .update({
          blocked: true,
          blocked_reason: reason || 'Blocked by staff',
          blocked_at: nowIso,
          blocked_by: auth.user.id,
        })
        .eq('class_id', classId)
        .eq('profile_id', profileId)
    } else {
      await supabase
        .from('gift_card_allocation')
        .update({
          blocked: false,
          blocked_reason: null,
          blocked_at: null,
          blocked_by: null,
        })
        .eq('class_id', classId)
        .eq('profile_id', profileId)
    }

    return {
      ok: true,
      intent: 'toggle-gift-card-block',
      class_id: classId,
      profile_id: profileId,
      blocked: nextBlocked,
    }
  }

  if (intent !== 'update-status' && intent !== 'update-photo-status' && intent !== 'update-camera-on') {
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

  const classId = formData.get('class_id') as string
  const profileId = formData.get('profile_id') as string
  if (!classId || !profileId) {
    return new Response('Missing identifiers', { status: 400, headers: auth.headers })
  }

  const updates: {
    status?: string | null
    photo_status?: string | null
    camera_on?: boolean | null
    recorded_by: string
  } = {
    recorded_by: auth.user.id,
  }

  if (intent === 'update-status') {
    const status = (formData.get('status') as string | null) ?? null
    const allowedStatuses = Constants.public.Enums.class_attendance_status as readonly Database['public']['Enums']['class_attendance_status'][]
    if (status && !allowedStatuses.includes(status as Database['public']['Enums']['class_attendance_status'])) {
      return new Response('Invalid status', { status: 400, headers: auth.headers })
    }
    updates.status = status || null
  }

  if (intent === 'update-photo-status') {
    const photoStatus = (formData.get('photo_status') as string | null) ?? null
    const allowedPhotoStatuses =
      Constants.public.Enums.class_attendance_photo_status as readonly Database['public']['Enums']['class_attendance_photo_status'][]
    if (photoStatus && !allowedPhotoStatuses.includes(photoStatus as Database['public']['Enums']['class_attendance_photo_status'])) {
      return new Response('Invalid photo status', { status: 400, headers: auth.headers })
    }
    updates.photo_status = photoStatus || null
  }

  if (intent === 'update-camera-on') {
    const rawCameraOn = (formData.get('camera_on') as string | null) ?? ''
    if (rawCameraOn === 'true') {
      updates.camera_on = true
    } else if (rawCameraOn === 'false') {
      updates.camera_on = false
    } else {
      updates.camera_on = null
    }
  }

  const { supabase } = createClient(request)
  const { error } = await supabase
    .from('class_attendance')
    .update(updates)
    .eq('class_id', classId)
    .eq('profile_id', profileId)

  if (error) {
    return new Response(error.message, { status: 500, headers: auth.headers })
  }

  return { ok: true }
}

export default function ClassAttendancePage() {
  const location = useLocation()
  const sourcePath = `/manage/class-attendance${location.search}`

  return (
    <TableDisplay
      paginationActions={
        <Form method="post" action="/manage/exports" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="create-export" />
          <input type="hidden" name="export_type" value={EXPORT_TYPE_CLASS_ATTENDANCE_CSV} />
          <input type="hidden" name="source_path" value={sourcePath} />
          <Button type="submit" variant="outline" size="icon-sm" aria-label="Export CSV" title="Export CSV">
            <Download className="size-4" />
          </Button>
        </Form>
      }
    />
  )
}
