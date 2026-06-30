import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/attendance'
import TableDisplay from './table-display'

type AttendanceRow = {
  id: string
  class_id: string
  profile_id: string
  status: 'unknown' | 'present' | 'absent' | null
  photo_status: 'accepted' | 'declined' | null
  camera_on: boolean | null
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

type EnrollmentRow = {
  workshop_id: string
  profile_id: string | null
}

type SyncRunRow = {
  class_zoom_meeting_id: string
  status: string
  created_at: string
}

const displayName = (profile: ProfileRow | null) => {
  const first = (profile?.firstname ?? '').trim()
  const last = (profile?.surname ?? '').trim()
  const full = [first, last].filter(Boolean).join(' ').trim()
  if (full) return full
  if (profile?.email) return profile.email
  return ''
}

const statusLabel = ({ done, total }: { done: number; total: number }) => {
  if (total <= 0) return 'N/A'
  if (done >= total) return `Done (${done}/${total})`
  if (done <= 0) return `Missing (0/${total})`
  return `Partial (${done}/${total})`
}

export async function loader({ request }: Route.LoaderArgs) {
  const { supabase } = createClient(request)
  const { data, error } = await supabase
    .from('class_attendance')
    .select('id, class_id, profile_id, status, photo_status, camera_on, recorded_by, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Response(error.message, { status: 500 })
  }

  const attendanceRows = (data ?? []) as AttendanceRow[]
  const classIds = Array.from(new Set(attendanceRows.map(row => row.class_id).filter(Boolean)))
  const profileIds = Array.from(new Set(attendanceRows.map(row => row.profile_id).filter(Boolean)))

  const [{ data: classRows }, { data: profileRows }, { data: meetingRows }, { data: registrantRows }] = await Promise.all([
    classIds.length
      ? supabase.from('class').select('id, workshop_id, starts_at, ends_at').in('id', classIds)
      : Promise.resolve({ data: [] as ClassRow[] }),
    profileIds.length
      ? supabase.from('profile').select('id, firstname, surname, email').in('id', profileIds)
      : Promise.resolve({ data: [] as ProfileRow[] }),
    classIds.length
      ? supabase
          .from('class_zoom_meeting')
          .select('id, class_id, status, zoom_meeting_id, topic, start_time, duration_minutes, join_url, host_zoom_user_email')
          .in('class_id', classIds)
      : Promise.resolve({ data: [] as MeetingRow[] }),
    classIds.length
      ? supabase
          .from('class_zoom_registrant')
          .select('class_id, profile_id, zoom_registrant_id, zoom_join_url, last_sent_at')
          .in('class_id', classIds)
      : Promise.resolve({ data: [] as RegistrantRow[] }),
  ])

  const classes = (classRows ?? []) as ClassRow[]
  const workshopsIds = Array.from(new Set(classes.map(row => row.workshop_id).filter((id): id is string => Boolean(id))))
  const meetingIds = Array.from(new Set(((meetingRows ?? []) as MeetingRow[]).map(row => row.id)))

  const [{ data: workshopRows }, { data: enrollmentRows }, { data: syncRows }] = await Promise.all([
    workshopsIds.length
      ? supabase.from('workshop').select('id, description').in('id', workshopsIds)
      : Promise.resolve({ data: [] as WorkshopRow[] }),
    workshopsIds.length
      ? supabase
          .from('workshop_enrollment')
          .select('workshop_id, profile_id')
          .in('workshop_id', workshopsIds)
          .eq('status', 'approved')
          .not('profile_id', 'is', null)
      : Promise.resolve({ data: [] as EnrollmentRow[] }),
    meetingIds.length
      ? supabase
          .from('class_zoom_participant_sync')
          .select('class_zoom_meeting_id, status, created_at')
          .in('class_zoom_meeting_id', meetingIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as SyncRunRow[] }),
  ])

  const classById = new Map(classes.map(row => [row.id, row]))
  const workshopById = new Map(((workshopRows ?? []) as WorkshopRow[]).map(row => [row.id, row]))
  const profileById = new Map(((profileRows ?? []) as ProfileRow[]).map(row => [row.id, row]))

  const meetingByClassId = new Map<string, MeetingRow>()
  for (const row of (meetingRows ?? []) as MeetingRow[]) {
    if (!meetingByClassId.has(row.class_id)) meetingByClassId.set(row.class_id, row)
  }

  const latestSyncByMeetingId = new Map<string, { status: string; created_at: string }>()
  for (const row of (syncRows ?? []) as SyncRunRow[]) {
    if (!latestSyncByMeetingId.has(row.class_zoom_meeting_id)) {
      latestSyncByMeetingId.set(row.class_zoom_meeting_id, { status: row.status, created_at: row.created_at })
    }
  }

  const approvedByWorkshopId = new Map<string, Set<string>>()
  for (const row of (enrollmentRows ?? []) as EnrollmentRow[]) {
    if (!row.workshop_id || !row.profile_id) continue
    const bucket = approvedByWorkshopId.get(row.workshop_id) ?? new Set<string>()
    bucket.add(row.profile_id)
    approvedByWorkshopId.set(row.workshop_id, bucket)
  }

  const registrantsByClassId = new Map<string, RegistrantRow[]>()
  for (const row of (registrantRows ?? []) as RegistrantRow[]) {
    const bucket = registrantsByClassId.get(row.class_id) ?? []
    bucket.push(row)
    registrantsByClassId.set(row.class_id, bucket)
  }

  const attendanceByClassId = new Map<string, Set<string>>()
  for (const row of attendanceRows) {
    const bucket = attendanceByClassId.get(row.class_id) ?? new Set<string>()
    bucket.add(row.profile_id)
    attendanceByClassId.set(row.class_id, bucket)
  }

  const rows = attendanceRows.map(row => {
    const classRow = classById.get(row.class_id) ?? null
    const workshop = classRow?.workshop_id ? workshopById.get(classRow.workshop_id) ?? null : null
    const profile = profileById.get(row.profile_id) ?? null
    const meeting = meetingByClassId.get(row.class_id) ?? null
    const registrants = registrantsByClassId.get(row.class_id) ?? []
    const approvedProfiles = classRow?.workshop_id ? approvedByWorkshopId.get(classRow.workshop_id) ?? new Set<string>() : new Set<string>()
    const attendanceProfiles = attendanceByClassId.get(row.class_id) ?? new Set<string>()
    const registrantsReady = registrants.filter(item => Boolean(item.zoom_registrant_id && item.zoom_join_url)).length
    const remindersSent = registrants.filter(item => Boolean(item.last_sent_at)).length
    const attendanceRowsReady = Array.from(approvedProfiles).filter(profileId => attendanceProfiles.has(profileId)).length

    const endsAt = classRow?.ends_at ? new Date(classRow.ends_at) : null
    const classEnded = Boolean(endsAt && Number.isFinite(endsAt.getTime()) && endsAt.getTime() <= Date.now())
    const latestSync = meeting ? latestSyncByMeetingId.get(meeting.id) : null

    let stepAttendanceSync = 'Pending'
    if (!meeting || meeting.status !== 'created') {
      stepAttendanceSync = 'Blocked (meeting missing)'
    } else if (!classEnded) {
      stepAttendanceSync = 'Not due yet'
    } else if (!latestSync) {
      stepAttendanceSync = 'Missing'
    } else if (latestSync.status === 'completed') {
      stepAttendanceSync = 'Done'
    } else if (latestSync.status === 'pending' || latestSync.status === 'running') {
      stepAttendanceSync = 'In progress'
    } else {
      stepAttendanceSync = 'Failed'
    }

    const zoomEndAt =
      meeting?.start_time && typeof meeting.duration_minutes === 'number'
        ? new Date(new Date(meeting.start_time).getTime() + meeting.duration_minutes * 60_000).toISOString()
        : null

    const studentRegistrant = registrants.find(item => item.profile_id === row.profile_id)

    return {
      ...row,
      workshop_description: workshop?.description ?? 'Workshop',
      class_starts_at: classRow?.starts_at ?? null,
      class_ends_at: classRow?.ends_at ?? null,
      profile_display: displayName(profile),
      student_join_url: studentRegistrant?.zoom_join_url ?? null,
      zoom_meeting_id: meeting?.zoom_meeting_id ?? null,
      zoom_topic: meeting?.topic ?? null,
      zoom_start_at: meeting?.start_time ?? null,
      zoom_end_at: zoomEndAt,
      zoom_host_email: meeting?.host_zoom_user_email ?? null,
      zoom_join_url: meeting?.join_url ?? null,
      step_meeting: meeting && meeting.status === 'created' && meeting.join_url ? 'Done' : 'Missing',
      step_registrants: statusLabel({ done: registrantsReady, total: approvedProfiles.size }),
      step_attendance_rows: statusLabel({ done: attendanceRowsReady, total: approvedProfiles.size }),
      step_reminder: statusLabel({ done: remindersSent, total: approvedProfiles.size }),
      step_attendance_sync: stepAttendanceSync,
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
    label: 'Attendance',
    tableName: 'attendance-raw',
    columns: [
      'workshop_description',
      'class_starts_at',
      'class_ends_at',
      'profile_display',
      'status',
      'photo_status',
      'camera_on',
      'student_join_url',
      'zoom_meeting_id',
      'zoom_topic',
      'zoom_start_at',
      'zoom_end_at',
      'zoom_host_email',
      'zoom_join_url',
      'step_meeting',
      'step_registrants',
      'step_attendance_rows',
      'step_reminder',
      'step_attendance_sync',
      'recorded_by',
      'created_at',
      'updated_at',
      'class_id',
      'profile_id',
      'id',
    ],
    rows,
    columnMeta: {
      workshop_description: { label: 'Workshop', filterable: true },
      class_starts_at: { label: 'Class starts', filterable: true },
      class_ends_at: { label: 'Class ends', filterable: true },
      profile_display: { label: 'Profile', filterable: true },
      status: { label: 'Attendance', filterable: true },
      photo_status: { label: 'Photo status', filterable: true },
      camera_on: { label: 'Camera on', filterable: true },
      student_join_url: { label: 'Student join link', truncate: true, filterable: false },
      zoom_meeting_id: { label: 'Zoom meeting ID', filterable: true },
      zoom_topic: { label: 'Zoom topic', truncate: true, filterable: true },
      zoom_start_at: { label: 'Zoom start (UTC)', filterable: true },
      zoom_end_at: { label: 'Zoom end (UTC)', filterable: true },
      zoom_host_email: { label: 'Zoom host', filterable: true },
      zoom_join_url: { label: 'Zoom join URL', truncate: true, filterable: false },
      step_meeting: { label: 'Step 1: Meeting', filterable: true },
      step_registrants: { label: 'Step 2: Zoom Registrants', filterable: true },
      step_attendance_rows: { label: 'Step 3: Attendance Rows', filterable: true },
      step_reminder: { label: 'Step 4: Reminder', filterable: true },
      step_attendance_sync: { label: 'Step 5: Attendance Sync', filterable: true },
      recorded_by: { label: 'Recorded by user_id', filterable: true, truncate: true },
      created_at: { label: 'Created', filterable: true },
      updated_at: { label: 'Updated', filterable: true },
      class_id: { label: 'Class ID', filterable: true },
      profile_id: { label: 'Profile ID', filterable: true },
      id: { label: 'Attendance ID', filterable: true },
    },
  }
}

export default function AttendanceRawTablePage() {
  return <TableDisplay />
}
