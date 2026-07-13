import { enforceOnboardingGuard } from '@/lib/auth.server'
import { resolveFamilyGraph } from '@/lib/family.server'
import { createClient } from '@/lib/supabase/server'
import { adminClient } from '@/lib/supabase/adminClient'

import type { Route } from './+types/home.class-photos.upload'

const PHOTO_BUCKET = 'class-attendance-photos'
const nowMs = () => Date.now()

const sanitizeFileName = (input: string) => {
  const trimmed = input.trim().toLowerCase()
  const safe = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return safe || 'photo.jpg'
}

const isImageFile = (file: File) => {
  if (typeof file.type === 'string' && file.type.startsWith('image/')) return true
  const normalized = file.name.toLowerCase()
  return ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif'].some(ext => normalized.endsWith(ext))
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await enforceOnboardingGuard(request)
  const { supabase } = createClient(request)
  const family = await resolveFamilyGraph(supabase, auth.user.id)

  const formData = await request.formData()
  const classId = String(formData.get('class_id') ?? '').trim()
  const profileId = String(formData.get('profile_id') ?? '').trim()
  const files = formData.getAll('photos').filter((entry): entry is File => entry instanceof File && entry.size > 0)

  if (!classId || !profileId) {
    return Response.json({ error: 'Missing class or profile id.' }, { status: 400, headers: auth.headers })
  }

  if (!family.familyProfileIds.includes(profileId)) {
    return Response.json({ error: 'You can only upload images for your own family.' }, { status: 403, headers: auth.headers })
  }

  if (!files.length) {
    return Response.json({ error: 'Please choose at least one image.' }, { status: 400, headers: auth.headers })
  }

  const { data: classRow, error: classError } = await adminClient
    .from('class')
    .select('id, workshop_id, ends_at')
    .eq('id', classId)
    .maybeSingle<{ id: string; workshop_id: string | null; ends_at: string }>()

  if (classError || !classRow) {
    return Response.json({ error: classError?.message ?? 'Class not found.' }, { status: 404, headers: auth.headers })
  }

  if (!classRow.workshop_id) {
    return Response.json({ error: 'Class workshop is missing.' }, { status: 409, headers: auth.headers })
  }

  const classEndMs = new Date(classRow.ends_at).getTime()
  if (!Number.isFinite(classEndMs) || Date.now() <= classEndMs + 15 * 60_000) {
    return Response.json(
      { error: 'Photos can only be uploaded after class is closed (15 minutes after end time).' },
      { status: 409, headers: auth.headers }
    )
  }

  const { data: approvedEnrollment, error: enrollmentError } = await adminClient
    .from('workshop_enrollment')
    .select('id')
    .eq('workshop_id', classRow.workshop_id)
    .eq('profile_id', profileId)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (enrollmentError || !approvedEnrollment?.id) {
    return Response.json(
      { error: enrollmentError?.message ?? 'Profile is not approved for this workshop.' },
      { status: 403, headers: auth.headers }
    )
  }

  const { data: attendanceRow, error: attendanceError } = await adminClient
    .from('class_attendance')
    .select('id')
    .eq('class_id', classId)
    .eq('profile_id', profileId)
    .maybeSingle<{ id: string }>()

  let attendanceId = attendanceRow?.id ?? null
  if (attendanceError) {
    return Response.json({ error: attendanceError.message }, { status: 500, headers: auth.headers })
  }

  if (!attendanceId) {
    const insertAttendanceStartedAt = nowMs()
    const { data: insertedAttendance, error: insertAttendanceError } = await adminClient
      .from('class_attendance')
      .insert({
        class_id: classId,
        profile_id: profileId,
        recorded_by: auth.user.id,
      })
      .select('id')
      .single<{ id: string }>()
    console.info('[class-attendance][mutation]', {
      intent: 'photo-upload',
      mutation: 'insert_attendance_row',
      classId,
      profileId,
      duration_ms: nowMs() - insertAttendanceStartedAt,
      hasError: Boolean(insertAttendanceError),
    })

    if (insertAttendanceError || !insertedAttendance?.id) {
      return Response.json(
        { error: insertAttendanceError?.message ?? 'Failed to create class attendance row.' },
        { status: 500, headers: auth.headers }
      )
    }
    attendanceId = insertedAttendance.id
  }

  const requestId = crypto.randomUUID()
  const results: Array<{ fileName: string; ok: boolean; error?: string }> = []

  for (const file of files) {
    const fileName = sanitizeFileName(file.name)

    const { data: attemptRow, error: attemptInsertError } = await adminClient
      .from('class_attendance_photo_upload_attempt' as any)
      .insert({
        class_id: classId,
        profile_id: profileId,
        class_attendance_id: attendanceId,
        uploaded_by: auth.user.id,
        file_name: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        status: 'started',
        request_metadata: {
          request_id: requestId,
          source: 'home_upload_modal',
          user_role: family.profileRole,
        },
      })
      .select('id')
      .single<{ id: string }>()

    const attemptId = attemptRow?.id
    if (attemptInsertError || !attemptId) {
      results.push({ fileName, ok: false, error: attemptInsertError?.message ?? 'Failed to log upload attempt.' })
      continue
    }

    if (!isImageFile(file)) {
      await adminClient
        .from('class_attendance_photo_upload_attempt' as any)
        .update({
          status: 'failed',
          error_message: 'Unsupported file type.',
        })
        .eq('id', attemptId)
      results.push({ fileName, ok: false, error: 'Unsupported file type.' })
      continue
    }

    const objectPath = `class-attendance/${classId}/${profileId}/${attemptId}-${fileName}`

    try {
      const { error: uploadError } = await adminClient.storage.from(PHOTO_BUCKET).upload(objectPath, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      const { error: photoError } = await adminClient.from('class_attendance_photo' as any).insert({
        class_id: classId,
        profile_id: profileId,
        class_attendance_id: attendanceId,
        storage_bucket: PHOTO_BUCKET,
        storage_path: objectPath,
        file_name: file.name,
        mime_type: file.type || null,
        byte_size: file.size,
        uploaded_by: auth.user.id,
        metadata: {
          request_id: requestId,
          upload_attempt_id: attemptId,
        },
      })

      if (photoError) {
        throw new Error(photoError.message)
      }

      const markUploadedStartedAt = nowMs()
      await Promise.all([
        adminClient
          .from('class_attendance_photo_upload_attempt' as any)
          .update({
            status: 'succeeded',
            storage_bucket: PHOTO_BUCKET,
            storage_path: objectPath,
            error_message: null,
          })
          .eq('id', attemptId),
        adminClient
          .from('class_attendance')
          .update({
            photo_status: 'uploaded',
            recorded_by: auth.user.id,
          })
          .eq('class_id', classId)
          .eq('profile_id', profileId),
      ])
      console.info('[class-attendance][mutation]', {
        intent: 'photo-upload',
        mutation: 'mark_photo_uploaded',
        classId,
        profileId,
        attemptId,
        duration_ms: nowMs() - markUploadedStartedAt,
        hasError: false,
      })

      results.push({ fileName, ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed.'
      await adminClient
        .from('class_attendance_photo_upload_attempt' as any)
        .update({
          status: 'failed',
          storage_bucket: PHOTO_BUCKET,
          storage_path: objectPath,
          error_message: message,
        })
        .eq('id', attemptId)

      results.push({ fileName, ok: false, error: message })
    }
  }

  const uploadedCount = results.filter(item => item.ok).length
  return Response.json(
    {
      ok: uploadedCount > 0,
      uploadedCount,
      failedCount: results.length - uploadedCount,
      results,
      message: uploadedCount > 0 ? `Uploaded ${uploadedCount} image(s).` : 'No images were uploaded.',
    },
    { headers: auth.headers }
  )
}
