import type { Database } from '@/lib/database.types'
import { adminClient } from '@/lib/supabase/adminClient'

type EnrollmentStatus = Database['public']['Enums']['workshop_enrollment_status']

type TransitionScope = 'family' | 'admin'

type TransitionResult = {
  ok: boolean
  error?: string
  code?: 'not_found' | 'forbidden' | 'invalid_status' | 'update_failed'
  previousStatus?: EnrollmentStatus
  enrollment?: {
    id: string
    workshop_id: string | null
    semester_id: string
    profile_id: string | null
    status: EnrollmentStatus
  }
}

const FAMILY_REVOCABLE_STATUSES = new Set<EnrollmentStatus>(['pending', 'waitlisted'])

type EnrollmentRow = {
  id: string
  workshop_id: string | null
  semester_id: string
  profile_id: string | null
  status: EnrollmentStatus
}

export const transitionWorkshopEnrollmentStatus = async ({
  enrollmentId,
  nextStatus,
  actorUserId,
  scope,
  semesterId,
  familyProfileIds,
}: {
  enrollmentId: string
  nextStatus: EnrollmentStatus
  actorUserId: string
  scope: TransitionScope
  semesterId?: string
  familyProfileIds?: string[]
}): Promise<TransitionResult> => {
  const { data: enrollment, error } = await adminClient
    .from('workshop_enrollment')
    .select('id, workshop_id, semester_id, profile_id, status')
    .eq('id', enrollmentId)
    .single<EnrollmentRow>()

  if (error || !enrollment) {
    return { ok: false, error: error?.message ?? 'Enrollment not found', code: 'not_found' }
  }

  if (scope === 'family') {
    if (!semesterId || enrollment.semester_id !== semesterId) {
      return { ok: false, error: 'Enrollment does not belong to this semester', code: 'forbidden' }
    }

    if (!enrollment.profile_id || !familyProfileIds?.includes(enrollment.profile_id)) {
      return { ok: false, error: 'Enrollment is not in your family', code: 'forbidden' }
    }

    if (nextStatus !== 'revoked') {
      return { ok: false, error: 'Families can only revoke an enrollment request.', code: 'forbidden' }
    }

    if (!FAMILY_REVOCABLE_STATUSES.has(enrollment.status)) {
      return { ok: false, error: 'Only pending or waitlisted enrollments can be revoked.', code: 'invalid_status' }
    }
  }

  if (enrollment.status === nextStatus) {
    return { ok: true, previousStatus: enrollment.status, enrollment }
  }

  const { error: updateError } = await adminClient
    .from('workshop_enrollment')
    .update({ status: nextStatus, decided_by: actorUserId })
    .eq('id', enrollment.id)

  if (updateError) {
    return { ok: false, error: updateError.message, code: 'update_failed' }
  }

  return {
    ok: true,
    previousStatus: enrollment.status,
    enrollment: {
      ...enrollment,
      status: nextStatus,
    },
  }
}
