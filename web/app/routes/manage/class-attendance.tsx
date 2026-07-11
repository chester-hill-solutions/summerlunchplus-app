import { requireAuth } from '@/lib/auth.server'
import { Button } from '@/components/ui/button'
import { createActionProfile } from '@/lib/action-profile.server'
import { Constants, type Database } from '@/lib/database.types'
import { EXPORT_TYPE_CLASS_ATTENDANCE_CSV } from '@/lib/exports/types'
import { createLoaderProfile } from '@/lib/loader-profile.server'
import {
  eligibleAfterIso,
  isEligibilityTimingEnabled,
  nextReleaseAtIso,
  releaseReadyAtIso,
  resolveGiftCardRelease,
  resolveGiftCardReleaseFromTiming,
} from '@/lib/gift-cards/release.server'
import { isRoleAtLeast } from '@/lib/roles'
import { adminClient } from '@/lib/supabase/adminClient'
import { createClient } from '@/lib/supabase/server'
import { runZoomRegistrantForStudent } from '@/lib/zoom-jobs/runner.server'
import { Download, Loader2 } from 'lucide-react'
import { Form, useLoaderData, useLocation, useNavigation } from 'react-router'
import type { Route } from './+types/class-attendance'
import DeferredTableDisplay from './deferred-table-display'

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
  metadata: {
    release_at?: string | null
    release_ready_at?: string | null
    qualification_since_at?: string | null
    eligible_after_at?: string | null
    availability_state?: string | null
  } | null
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

const IN_CLAUSE_BATCH_SIZE = 150
const CLASS_ATTENDANCE_FETCH_BATCH_SIZE = 1000
const RELATED_FETCH_BATCH_SIZE = 1000

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

const normalizeGiftCardAvailabilityState = (value: string | null | undefined) => {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized === 'available' || normalized === 'true') return 'true'
  if (normalized === 'unavailable' || normalized === 'false') return 'false'
  return 'false'
}

const fallbackProfileHoverContext = {
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

export async function loader({ request }: Route.LoaderArgs) {
  const profile = createLoaderProfile({
    name: 'class_attendance_loader',
    request,
  })

  const auth = await requireAuth(request)
  const url = new URL(request.url)
  const deferTable = url.searchParams.get('_deferTable') === '1'
  profile.mark('require_auth', {
    role: auth.claims.role,
    emailHint: auth.emailHint,
    deferTable,
  })

  if (!deferTable) {
    const shell = {
      label: 'Class attendance',
      tableName: 'class-attendance',
      columns: [
        'workshop_description',
        'class_starts_at',
        'profile_display',
        'status',
        'camera_on',
        'photo_status',
        'latest_geo',
        'giftcard_display',
      ],
      rows: [] as Record<string, unknown>[],
      columnMeta: {
        workshop_description: { label: 'Workshop', filterable: true, fitContentOnLoad: true },
        class_starts_at: { label: 'Class starts', filterable: true, fitContentOnLoad: true },
        profile_display: { label: 'Profile', filterable: true, fitContentOnLoad: true },
        status: { label: 'Attendance', filterable: true },
        camera_on: { label: 'Camera on', filterable: true },
        photo_status: { label: 'Photo status', filterable: true },
        latest_geo: { label: 'Geo', filterable: true, truncate: true },
        giftcard_display: { label: 'Provider', filterable: true, truncate: true },
      },
      canEditStatus: isRoleAtLeast(auth.claims.role, 'staff'),
    }
    profile.complete({
      deferredShell: true,
      columnCount: shell.columns.length,
      emailHint: auth.emailHint,
      role: auth.claims.role,
    })
    return shell
  }

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
  profile.mark('fetch_class_attendance_rows', {
    rowCount: attendanceRows.length,
  })

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
    for (let offset = 0; ; offset += RELATED_FETCH_BATCH_SIZE) {
      const { data, error } = await adminClient
        .from('class_zoom_registrant')
        .select('class_id, profile_id, zoom_registrant_id, zoom_join_url, last_sent_at')
        .in('class_id', chunk)
        .order('class_id', { ascending: true })
        .order('profile_id', { ascending: true })
        .range(offset, offset + RELATED_FETCH_BATCH_SIZE - 1)
      if (error) throw new Response(error.message, { status: 500 })
      const rows = (data ?? []) as RegistrantRow[]
      registrantRows.push(...rows)
      if (rows.length < RELATED_FETCH_BATCH_SIZE) break
    }
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
  profile.mark('fetch_class_related_records', {
    classIds: classIds.length,
    classRows: classRows.length,
    meetingRows: meetingRows.length,
    registrantRows: registrantRows.length,
    photoRows: photoRows.length,
    giftCardAllocations: allocationRowsRaw.length,
  })

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
  profile.mark('fetch_profile_lookups', {
    profileIds: profileIds.length,
    profilesById: profilesByIdRows.length,
    profilesByUserId: profilesByUserRows.length,
  })

  profile.mark('resolve_gift_card_preferences', {
    deferred_to_async_enrichment: true,
  })

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
  profile.mark('fetch_zoom_and_giftcard_details', {
    workshopRows: workshopRows.length,
    syncRows: syncRows.length,
    giftCardAssetRows: assetRowsRaw.length,
    giftCardClickRows: clickRowsRaw.length,
  })

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

  profile.mark('resolve_latest_network', {
    deferred_to_async_enrichment: true,
  })

  profile.mark('resolve_geoip', {
    deferred_to_async_enrichment: true,
  })

  const classById = new Map(classes.map(row => [row.id, row]))
  const workshopById = new Map(workshopRows.map(row => [row.id, row]))
  const profileRowsTyped = [...profilesByIdRows, ...profilesByUserRows]
  const familyContextByProfileId: Record<string, Partial<typeof fallbackProfileHoverContext>> = {}
  profile.mark('load_family_context', {
    profileIds: 0,
    familyContextProfiles: 0,
    deferred_to_async_enrichment: true,
  })
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
    const profileHoverContext = {
      ...fallbackProfileHoverContext,
      ...(familyContextByProfileId[row.profile_id] ?? {}),
    }
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
    const giftCardLinkOpened =
      Boolean(giftCardAllocation?.first_opened_at) ||
      Boolean(giftCardAllocation?.last_opened_at) ||
      Number(giftCardAllocation?.open_count ?? 0) > 0 ||
      giftCardAllocation?.status === 'opened'
    const giftCardRelease = resolveGiftCardRelease({
      metadata: giftCardAllocation?.metadata ?? null,
      classAt: classRow?.starts_at ?? classRow?.ends_at ?? null,
      classEndsAt: classRow?.ends_at ?? null,
    })
    const giftCardAvailable =
      giftCardAllocated &&
      !row.gift_card_blocked &&
      giftCardRelease.isReleased
    const giftCardAvailabilityReason = !giftCardAllocated
      ? 'missing_allocation'
      : row.gift_card_blocked
        ? 'blocked'
        : giftCardRelease.isReleased
          ? 'released'
          : `waiting_${giftCardRelease.source}`
    const registrantReady = Boolean(studentRegistrant?.zoom_registrant_id && studentRegistrant.zoom_join_url)
    const reminderSent = Boolean(studentRegistrant?.last_sent_at)

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
      ...profileHoverContext,
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
      giftcard_display: '...',
      latest_geo: '...',
      gift_card_allocated: giftCardAllocated,
      gift_card_available: giftCardAvailable,
      gift_card_available_state: normalizeGiftCardAvailabilityState(giftCardAllocation?.metadata?.availability_state),
      gift_card_availability_reason: giftCardAvailabilityReason,
      gift_card_release_source: giftCardRelease.source,
      gift_card_effective_release_at: giftCardRelease.effectiveReleaseAt,
      gift_card_release_ready_at: giftCardAllocation?.metadata?.release_ready_at ?? null,
      gift_card_qualification_since_at: giftCardAllocation?.metadata?.qualification_since_at ?? null,
      gift_card_eligible_after_at: giftCardAllocation?.metadata?.eligible_after_at ?? null,
      gift_card_reminder_sent: giftCardReminderSent,
      gift_card_link_opened: giftCardLinkOpened,
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

  profile.mark('build_and_sort_rows', {
    rowCount: rows.length,
  })
  profile.complete({
    classIdCount: classIds.length,
    profileIdCount: profileIds.length,
    emailHint: auth.emailHint,
    role: auth.claims.role,
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
      'gift_card_link_opened',
      'gift_card_provider',
      'gift_card_block_action',
      'gift_card_availability_reason',
      'gift_card_release_source',
      'gift_card_effective_release_at',
      'gift_card_release_ready_at',
      'gift_card_qualification_since_at',
      'gift_card_eligible_after_at',
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
      profile_display: {
        label: 'Profile',
        filterable: true,
        fitContentOnLoad: true,
        hoverCard: {
          titleField: 'profile_hover_name',
          titleFallback: 'N/A',
          columns: {
            rightTitleField: 'profile_hover_parent_name',
            rightTitleFallback: 'Parent',
            left: [
              { label: '', field: 'profile_hover_email', fallback: '' },
              { label: '', field: 'profile_hover_student_phone', fallback: '' },
              { label: '', field: 'profile_hover_student_geo', fallback: '' },
              { label: '', field: 'profile_hover_student_submitted_address', fallback: '' },
            ],
            right: [
              { label: '', field: 'profile_hover_parent_email', fallback: '' },
              { label: '', field: 'profile_hover_parent_phone', fallback: '' },
              { label: '', field: 'profile_hover_parent_geo', fallback: '' },
              { label: '', field: 'profile_hover_parent_address', fallback: '' },
            ],
          },
          fields: [
            { label: 'Top Discrepancy', field: 'profile_hover_top_discrepancy' },
            { label: 'More Open', field: 'profile_hover_more_discrepancies' },
          ],
        },
      },
      status: { label: 'Attendance', filterable: true },
      latest_geo: { label: 'Geo', filterable: true, truncate: true },
      giftcard_display: { label: 'Provider', filterable: true, truncate: true },
      gift_card_allocated: { label: 'Gift allocated', filterable: true },
      gift_card_available: { label: 'Gift available', filterable: true },
      gift_card_availability_reason: { label: 'Gift availability reason', filterable: true, truncate: true },
      gift_card_release_source: { label: 'Gift release source', filterable: true },
      gift_card_effective_release_at: { label: 'Gift effective release at', filterable: true },
      gift_card_release_ready_at: { label: 'Gift release_ready_at', filterable: true },
      gift_card_qualification_since_at: { label: 'Gift qualification since', filterable: true },
      gift_card_eligible_after_at: { label: 'Gift eligible after', filterable: true },
      gift_card_reminder_sent: { label: 'Gift reminder sent', filterable: true },
      gift_card_link_opened: { label: 'Gift link opened', filterable: true },
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
  const profile = createActionProfile({
    name: 'class_attendance_action',
    request,
  })
  let intent: string | null = null
  let outcome = 'unknown'
  let errorMessage: string | null = null
  let emailHint: string | null = null
  let role: string | null = null

  try {
    const auth = await requireAuth(request)
    emailHint = auth.emailHint
    role = auth.claims.role
    profile.mark('require_auth', {
      role: auth.claims.role,
      emailHint: auth.emailHint,
    })
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      outcome = 'unauthorized'
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const formData = await request.formData()
    intent = formData.get('intent') as string | null
    profile.mark('parse_form_data', {
      intent,
    })

    if (intent === 'register-student') {
      profile.mark('intent_register_student_start')
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    if (!classId || !profileId) {
      outcome = 'register_missing_identifiers'
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
      profile.mark('register_load_context', {
        classId,
        profileId,
      })

      if (classError) {
        outcome = 'register_class_context_error'
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load class context: ${classError.message}`,
        }
      }

      if (profileError) {
        outcome = 'register_profile_context_error'
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: `Failed to load profile context: ${profileError.message}`,
        }
      }

      if (registrantBeforeError) {
        outcome = 'register_existing_registrant_context_error'
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
        outcome = 'register_enrollment_lookup_error'
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
        outcome = 'register_guardian_edge_error'
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
        outcome = 'register_guardian_lookup_error'
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

      const runResult = await runZoomRegistrantForStudent({
        classId,
        profileId,
        runId: `manual-row-${Date.now().toString(36)}`,
      })
      profile.mark('register_run_zoom_registrant', {
        classId,
        profileId,
      })
      const provision = runResult.provision
      const firstRegistrantFailure =
        provision && typeof provision === 'object' && 'registrantFailures' in provision && Array.isArray(provision.registrantFailures)
          ? provision.registrantFailures.find(failure => failure.profileId === profileId) ?? provision.registrantFailures[0] ?? null
          : null
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
              `provision_registrant_failure=${firstRegistrantFailure?.error ?? 'none'}`,
              `meeting_recreated=${'meetingRecreated' in provision ? String(provision.meetingRecreated) : 'n/a'}`,
              `registrants_created=${'registrantsCreated' in provision ? String(provision.registrantsCreated) : 'n/a'}`,
              `registrants_updated=${'registrantsUpdated' in provision ? String(provision.registrantsUpdated) : 'n/a'}`,
              `registrants_skipped=${'registrantsSkipped' in provision ? String(provision.registrantsSkipped) : 'n/a'}`,
              `registrant_failures=${
                'registrantFailures' in provision && Array.isArray(provision.registrantFailures)
                  ? String(provision.registrantFailures.length)
                  : 'n/a'
              }`,
              `lock_owner_run_id=${'lockOwnerRunId' in provision ? String(provision.lockOwnerRunId ?? 'none') : 'none'}`,
              `lock_blocked_by_run_id=${
                'lockBlockedByOwnerRunId' in provision ? String(provision.lockBlockedByOwnerRunId ?? 'none') : 'none'
              }`,
              `lock_blocked_by_kind=${
                'lockBlockedByOwnerKind' in provision ? String(provision.lockBlockedByOwnerKind ?? 'none') : 'none'
              }`,
              `lock_blocked_expires_at=${
                'lockBlockedExpiresAt' in provision ? String(provision.lockBlockedExpiresAt ?? 'none') : 'none'
              }`,
              `lock_ttl_remaining_ms=${
                'lockTtlRemainingMs' in provision ? String(provision.lockTtlRemainingMs ?? 'none') : 'none'
              }`,
              `lock_wait_ms=${'lockWaitMs' in provision ? String(provision.lockWaitMs ?? 'none') : 'none'}`,
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
      profile.mark('register_fetch_registrant_after_run', {
        hasError: Boolean(error),
        hasRegistrant: Boolean(registrant),
      })

      if (error) {
        outcome = 'register_registrant_fetch_error'
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

        outcome = 'register_missing_join_url_after_run'
        return {
          ok: false,
          intent: 'register-student',
          class_id: classId,
          profile_id: profileId,
          error: [
            'Register run completed but this student still has no join link.',
            `root_cause=${rootCause}`,
            `candidate_scope=single_profile`,
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

      outcome = 'register_success'
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
      outcome = 'register_exception'
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
    profile.mark('intent_delete_attendance_row_start')
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    if (!classId || !profileId) {
      outcome = 'delete_missing_identifiers'
      return new Response('Missing identifiers', { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const { error } = await supabase.from('class_attendance').delete().eq('class_id', classId).eq('profile_id', profileId)
    profile.mark('delete_attendance_row_execute', {
      classId,
      profileId,
      hasError: Boolean(error),
    })

    if (error) {
      outcome = 'delete_error'
      return new Response(error.message, { status: 500, headers: auth.headers })
    }

    outcome = 'delete_success'
    return {
      ok: true,
      intent: 'delete-attendance-row',
      class_id: classId,
      profile_id: profileId,
    }
  }

  if (intent === 'allocate-gift-card') {
    profile.mark('intent_allocate_gift_card_start')
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    const preferredProviderRaw = String(formData.get('gift_card_preferred_provider') ?? '')
      .trim()
      .toLowerCase()
    const preferredProvider =
      preferredProviderRaw === 'sobeys' ? 'Sobeys' : preferredProviderRaw === 'pc' ? 'PC' : null

    if (!classId || !profileId) {
      outcome = 'allocate_missing_identifiers'
      return new Response('Missing identifiers', { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const [attendanceResult, allocationResult, classResult] = await Promise.all([
      supabase
        .from('class_attendance')
        .select('id, status, photo_status, camera_on, gift_card_blocked')
        .eq('class_id', classId)
        .eq('profile_id', profileId)
        .maybeSingle<{
          id: string
          status: 'unknown' | 'present' | 'absent' | null
          photo_status: 'uploaded' | 'accepted' | 'rejected' | null
          camera_on: boolean | null
          gift_card_blocked: boolean
        }>(),
      supabase.from('gift_card_allocation').select('id').eq('class_id', classId).eq('profile_id', profileId).maybeSingle<{ id: string }>(),
      supabase.from('class').select('starts_at, ends_at').eq('id', classId).maybeSingle<{ starts_at: string | null; ends_at: string | null }>(),
    ])
    profile.mark('allocate_load_context', {
      classId,
      profileId,
      attendanceError: Boolean(attendanceResult.error),
      allocationError: Boolean(allocationResult.error),
      classError: Boolean(classResult.error),
    })

    if (attendanceResult.error) {
      outcome = 'allocate_attendance_error'
      return new Response(attendanceResult.error.message, { status: 500, headers: auth.headers })
    }
    if (allocationResult.error) {
      outcome = 'allocate_existing_allocation_error'
      return new Response(allocationResult.error.message, { status: 500, headers: auth.headers })
    }
    if (classResult.error) {
      outcome = 'allocate_class_error'
      return new Response(classResult.error.message, { status: 500, headers: auth.headers })
    }

    const attendance = attendanceResult.data
    if (!attendance?.id) {
      outcome = 'allocate_attendance_missing'
      return new Response('Class attendance row not found for class/profile', { status: 409, headers: auth.headers })
    }
    if (attendance.gift_card_blocked) {
      outcome = 'allocate_blocked'
      return new Response('Gift card is blocked for this attendance row', { status: 409, headers: auth.headers })
    }

    if (allocationResult.data?.id) {
      outcome = 'allocate_already_allocated'
      return {
        ok: true,
        intent: 'allocate-gift-card',
        class_id: classId,
        profile_id: profileId,
        already_allocated: true,
      }
    }

    const pickAvailableAsset = async (provider: 'PC' | 'Sobeys' | null) => {
      let query = supabase
        .from('gift_card_asset')
        .select('id, provider')
        .eq('status', 'available')
        .order('created_at', { ascending: true })
        .limit(1)

      if (provider) {
        query = query.eq('provider', provider)
      }

      return await query.maybeSingle<{ id: string; provider: 'PC' | 'Sobeys' }>()
    }

    const providerFallbackOrder: Array<'PC' | 'Sobeys'> = preferredProvider
      ? [preferredProvider, preferredProvider === 'PC' ? 'Sobeys' : 'PC']
      : ['PC', 'Sobeys']

    let selectedAsset: { id: string; provider: 'PC' | 'Sobeys' } | null = null
    for (const provider of providerFallbackOrder) {
      const { data, error } = await pickAvailableAsset(provider)
      if (error) {
        return new Response(error.message, { status: 500, headers: auth.headers })
      }
      if (data?.id) {
        selectedAsset = data
        break
      }
    }

    if (!selectedAsset) {
      outcome = 'allocate_no_asset_available'
      return new Response('No available gift card asset found for allocation', { status: 409, headers: auth.headers })
    }

    const nowIso = new Date().toISOString()
    const { data: claimedAsset, error: claimError } = await supabase
      .from('gift_card_asset')
      .update({
        status: 'allocated',
        assigned_profile_id: profileId,
        allocated_at: nowIso,
      })
      .eq('id', selectedAsset.id)
      .eq('status', 'available')
      .select('id, provider')
      .maybeSingle<{ id: string; provider: 'PC' | 'Sobeys' }>()

    if (claimError || !claimedAsset?.id) {
      outcome = 'allocate_asset_claim_failed'
      return new Response(claimError?.message ?? 'Gift card asset claim failed', { status: 409, headers: auth.headers })
    }

    const classAt = classResult.data?.starts_at ?? classResult.data?.ends_at ?? null
    const classEndsAt = classResult.data?.ends_at ?? null
    const releaseAt = nextReleaseAtIso(classEndsAt)
    const eligibilityTimingEnabled = isEligibilityTimingEnabled()
    const hasAttendanceEvidence = attendance.camera_on === true || attendance.photo_status === 'accepted'
    const qualificationSinceAt = eligibilityTimingEnabled && hasAttendanceEvidence ? nowIso : null
    const releaseReadyAt = eligibilityTimingEnabled
      ? releaseReadyAtIso({ classAtIso: classAt, qualificationSinceAtIso: qualificationSinceAt })
      : null
    const timingResolution = resolveGiftCardReleaseFromTiming({
      metadata: {
        release_at: releaseAt,
        release_ready_at: releaseReadyAt,
        qualification_since_at: qualificationSinceAt,
      },
      classAt,
      classEndsAt,
      now: Date.parse(nowIso),
      eligibilityTimingEnabled,
    })

    const metadata = eligibilityTimingEnabled
      ? {
          release_at: releaseAt,
          qualification_since_at: qualificationSinceAt,
          eligible_after_at: eligibleAfterIso(qualificationSinceAt),
          release_ready_at: releaseReadyAt,
          availability_state: timingResolution.isReleased ? 'available' : 'unavailable',
        }
      : {
          release_at: releaseAt,
          availability_state: releaseAt && Date.parse(releaseAt) <= Date.parse(nowIso) ? 'available' : 'unavailable',
        }

    const { error: insertError } = await supabase.from('gift_card_allocation').insert({
      class_id: classId,
      profile_id: profileId,
      class_attendance_id: attendance.id,
      gift_card_asset_id: claimedAsset.id,
      status: 'allocated',
      metadata,
    })
    profile.mark('allocate_insert_allocation', {
      classId,
      profileId,
      hasError: Boolean(insertError),
    })

    if (insertError) {
      await supabase
        .from('gift_card_asset')
        .update({
          status: 'available',
          assigned_profile_id: null,
          allocated_at: null,
        })
        .eq('id', claimedAsset.id)

      outcome = 'allocate_insert_error'
      return new Response(insertError.message, { status: 500, headers: auth.headers })
    }

    outcome = 'allocate_success'
    return {
      ok: true,
      intent: 'allocate-gift-card',
      class_id: classId,
      profile_id: profileId,
      gift_card_allocated: true,
      gift_card_provider: claimedAsset.provider,
    }
  }

  if (intent === 'toggle-gift-card-block') {
    profile.mark('intent_toggle_gift_card_block_start')
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    const nextBlocked = String(formData.get('blocked') ?? '') === 'true'
    const reason = (formData.get('reason') as string | null)?.trim() ?? ''

    if (!classId || !profileId) {
      outcome = 'toggle_block_missing_identifiers'
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
    profile.mark('toggle_block_update_attendance', {
      classId,
      profileId,
      blocked: nextBlocked,
      hasError: Boolean(error),
    })

    if (error) {
      outcome = 'toggle_block_attendance_update_error'
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

  if (intent === 'update-gift-availability-state') {
    profile.mark('intent_update_gift_availability_state_start')
    const classId = formData.get('class_id') as string
    const profileId = formData.get('profile_id') as string
    const availabilityState = String(formData.get('gift_card_available_state') ?? '').trim().toLowerCase()

    if (!classId || !profileId) {
      outcome = 'gift_availability_missing_identifiers'
      return new Response('Missing identifiers', { status: 400, headers: auth.headers })
    }

    if (availabilityState !== 'true' && availabilityState !== 'false') {
      outcome = 'gift_availability_invalid_value'
      return new Response('Invalid availability state value', { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const { data: allocation, error: allocationError } = await supabase
      .from('gift_card_allocation')
      .select('id, metadata')
      .eq('class_id', classId)
      .eq('profile_id', profileId)
      .maybeSingle()
    profile.mark('gift_availability_load_allocation', {
      classId,
      profileId,
      hasError: Boolean(allocationError),
      hasAllocation: Boolean(allocation?.id),
    })

    if (allocationError) {
      outcome = 'gift_availability_lookup_error'
      return new Response(allocationError.message, { status: 500, headers: auth.headers })
    }

    if (!allocation?.id) {
      outcome = 'gift_availability_allocation_missing'
      return new Response('Gift card allocation not found for class/profile', { status: 409, headers: auth.headers })
    }

    const metadata =
      allocation.metadata && typeof allocation.metadata === 'object' && !Array.isArray(allocation.metadata)
        ? ({ ...allocation.metadata } as Record<string, unknown>)
        : {}

    metadata.availability_state = availabilityState === 'true' ? 'available' : 'unavailable'

    const { error: updateError } = await supabase
      .from('gift_card_allocation')
      .update({ metadata })
      .eq('id', allocation.id)
    profile.mark('gift_availability_update_allocation', {
      allocationId: allocation.id,
      availabilityState,
      hasError: Boolean(updateError),
    })

    if (updateError) {
      outcome = 'gift_availability_update_error'
      return new Response(updateError.message, { status: 500, headers: auth.headers })
    }

    outcome = 'gift_availability_success'
    return {
      ok: true,
      intent: 'update-gift-availability-state',
      class_id: classId,
      profile_id: profileId,
      gift_card_available_state: availabilityState,
    }
  }

  if (
    intent !== 'update-status' &&
    intent !== 'update-photo-status' &&
    intent !== 'update-camera-on'
  ) {
    outcome = 'unsupported_intent'
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

  const classId = formData.get('class_id') as string
  const profileId = formData.get('profile_id') as string
  if (!classId || !profileId) {
    outcome = 'update_missing_identifiers'
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
      outcome = 'update_status_invalid_value'
      return new Response('Invalid status', { status: 400, headers: auth.headers })
    }
    updates.status = status || null
  }

  if (intent === 'update-photo-status') {
    const photoStatus = (formData.get('photo_status') as string | null) ?? null
    const allowedPhotoStatuses =
      Constants.public.Enums.class_attendance_photo_status as readonly Database['public']['Enums']['class_attendance_photo_status'][]
    if (photoStatus && !allowedPhotoStatuses.includes(photoStatus as Database['public']['Enums']['class_attendance_photo_status'])) {
      outcome = 'update_photo_status_invalid_value'
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
  profile.mark('update_attendance_row', {
    intent,
    classId,
    profileId,
    hasError: Boolean(error),
  })

  if (error) {
    outcome = 'update_row_error'
    return new Response(error.message, { status: 500, headers: auth.headers })
  }

  outcome = 'update_row_success'
  return { ok: true }
  } catch (error) {
    outcome = 'exception'
    errorMessage = error instanceof Error ? error.message : String(error)
    profile.log('class_attendance_action_error', {
      intent,
      outcome,
      error: errorMessage,
    })
    throw error
  } finally {
    profile.complete({
      intent,
      outcome,
      error: errorMessage,
      emailHint,
      role,
    })
  }
}

export default function ClassAttendancePage() {
  const data = useLoaderData<typeof loader>()
  const location = useLocation()
  const navigation = useNavigation()
  const sourcePath = `/manage/class-attendance${location.search}`
  const isCreatingExport = navigation.state !== 'idle' && navigation.formData?.get('intent') === 'create-export'

  return (
    <DeferredTableDisplay
      dataPath="/manage/class-attendance/table-data"
      fallbackData={data}
      paginationActions={
        <Form method="post" action="/manage/exports" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="create-export" />
          <input type="hidden" name="export_type" value={EXPORT_TYPE_CLASS_ATTENDANCE_CSV} />
          <input type="hidden" name="source_path" value={sourcePath} />
          <Button
            type="submit"
            variant="outline"
            size="icon-sm"
            disabled={isCreatingExport}
            aria-label={isCreatingExport ? 'Exporting CSV' : 'Export CSV'}
            title={isCreatingExport ? 'Exporting CSV...' : 'Export CSV'}
          >
            {isCreatingExport ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
          </Button>
        </Form>
      }
    />
  )
}
