import { requireAuth } from '@/lib/auth.server'
import { Constants, type Database } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import type { Route } from './+types/class-attendance'
import TableDisplay from './table-display'
import { createTableLoader } from './table-loader'

const baseLoader = createTableLoader('class-attendance')

type AttendanceRow = Record<string, unknown> & {
  class_display?: { label?: unknown; timestamp?: unknown } | string | null
  profile_display?: string | null
}

const timestampMs = (value: unknown) => {
  if (typeof value !== 'string' || !value) return Number.POSITIVE_INFINITY
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY
}

const classLabel = (value: AttendanceRow['class_display']) => {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && typeof value.label === 'string') return value.label
  return ''
}

const profileLabel = (value: unknown) => (typeof value === 'string' ? value : '')

export async function loader(args: Route.LoaderArgs) {
  const auth = await requireAuth(args.request)
  const base = await baseLoader(args)

  const sortedRows = [...((base.rows ?? []) as AttendanceRow[])].sort((left, right) => {
    const leftClassTimestamp =
      left.class_display && typeof left.class_display === 'object'
        ? timestampMs(left.class_display.timestamp)
        : Number.POSITIVE_INFINITY
    const rightClassTimestamp =
      right.class_display && typeof right.class_display === 'object'
        ? timestampMs(right.class_display.timestamp)
        : Number.POSITIVE_INFINITY

    if (leftClassTimestamp !== rightClassTimestamp) {
      return leftClassTimestamp - rightClassTimestamp
    }

    const leftClassLabel = classLabel(left.class_display)
    const rightClassLabel = classLabel(right.class_display)
    const byClassLabel = leftClassLabel.localeCompare(rightClassLabel)
    if (byClassLabel !== 0) return byClassLabel

    const leftProfile = profileLabel(left.profile_display)
    const rightProfile = profileLabel(right.profile_display)
    return leftProfile.localeCompare(rightProfile)
  })

  return {
    ...base,
    rows: sortedRows,
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

export default function ClassAttendanceTablePage() {
  return <TableDisplay />
}
