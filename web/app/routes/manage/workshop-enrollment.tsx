import { requireAuth } from '@/lib/auth.server'
import { localDateTimeToUtcIso, parseOffsetMinutes } from '@/lib/datetime'
import { sendTemplateEmail } from '@/lib/email/send-email.server'
import { Button } from '@/components/ui/button'
import { Form, useLocation } from 'react-router'
import { resolveFamilyContactsByProfileId } from '@/lib/family.server'
import { adminClient } from '@/lib/supabase/adminClient'
import { Constants, type Database } from '@/lib/database.types'
import { isRoleAtLeast } from '@/lib/roles'
import { createClient } from '@/lib/supabase/server'
import { loadWorkshopEnrollmentData } from '@/lib/exports/workshop-enrollment-query.server'
import { TABLE_DEFINITIONS } from './table-definitions'

import type { Route } from './+types/workshop-enrollment'
import TableDisplay from './table-display'
import { EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV } from '@/lib/exports/types'

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const parseEnrollmentField = (
  formData: FormData,
  fieldName: string,
  fieldType: string,
  nullable?: boolean
) => {
  const rawValue = formData.get(`field_${fieldName}`)
  if (rawValue === null) return { value: null as unknown, valid: true }

  const value = String(rawValue).trim()
  if (!value) {
    return { value: nullable ? null : '', valid: true }
  }

  if (fieldType === 'datetime') {
    const offset = parseOffsetMinutes(String(formData.get(`field_${fieldName}__tz_offset`) ?? ''))
    if (offset === null) return { value: null as unknown, valid: false }
    const utcIso = localDateTimeToUtcIso(value, offset)
    if (!utcIso) return { value: null as unknown, valid: false }
    return { value: utcIso, valid: true }
  }

  return { value, valid: true }
}

export async function loader(args: Route.LoaderArgs) {
  return loadWorkshopEnrollmentData(args.request)
}

export async function action({ request }: Route.ActionArgs) {
  const auth = await requireAuth(request)

  const formData = await request.formData()
  const intent = formData.get('intent') as string | null

  if (intent === 'update-status') {
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const enrollmentId = formData.get('enrollment_id') as string
    const status = formData.get('status') as string | null
    if (!enrollmentId || !status) {
      return new Response('Missing enrollment data', { status: 400, headers: auth.headers })
    }

    if (
      !Constants.public.Enums.workshop_enrollment_status.includes(
        status as Database['public']['Enums']['workshop_enrollment_status']
      )
    ) {
      return new Response('Invalid status', { status: 400, headers: auth.headers })
    }

    const { supabase } = createClient(request)
    const { data: existingEnrollment, error: existingEnrollmentError } = await supabase
      .from('workshop_enrollment')
      .select('id, profile_id, workshop_id, status')
      .eq('id', enrollmentId)
      .single()

    if (existingEnrollmentError || !existingEnrollment) {
      return new Response(existingEnrollmentError?.message ?? 'Enrollment not found', {
        status: 404,
        headers: auth.headers,
      })
    }

    const { error } = await supabase
      .from('workshop_enrollment')
      .update({ status, decided_by: auth.user.id })
      .eq('id', enrollmentId)

    if (error) {
      return new Response(error.message, { status: 500, headers: auth.headers })
    }

    const transitionedToApproved = existingEnrollment.status !== 'approved' && status === 'approved'
    if (transitionedToApproved && existingEnrollment.profile_id) {
      try {
        const familyContacts = await resolveFamilyContactsByProfileId(adminClient, existingEnrollment.profile_id)
        const { data: workshopRow } = await adminClient
          .from('workshop')
          .select('description')
          .eq('id', existingEnrollment.workshop_id)
          .single()

        const workshopName = workshopRow?.description?.trim() || 'selected workshop'
        const recipientEmails = Array.from(
          new Set(
            familyContacts
              .map(contact => contact.email?.trim().toLowerCase())
              .filter((value): value is string => Boolean(value && isLikelyEmail(value)))
          )
        )

        const eventKey = `workshop_enrollment:${enrollmentId}:family_accepted:v1`

        await Promise.all(
          recipientEmails.map(async email => {
            const recipient = familyContacts.find(contact => contact.email?.trim().toLowerCase() === email) ?? null
            return sendTemplateEmail({
              toEmail: email,
              templateKey: 'family_enrollment_accepted_v1',
              templateData: {
                workshopName,
              },
              eventKey,
              triggeredByUserId: auth.user.id,
              recipientUserId: recipient?.user_id ?? null,
              profileId: recipient?.id ?? null,
              familyProfileId: existingEnrollment.profile_id,
              workshopEnrollmentId: enrollmentId,
            })
          })
        )
      } catch (notificationError) {
        console.error('[workshop enrollment] accepted notification failed', {
          enrollmentId,
          error: notificationError,
        })
      }
    }

    return { ok: true }
  }

  if (intent !== 'insert-row' && intent !== 'update-row') {
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const definition = TABLE_DEFINITIONS['class-enrollment']
  if (!definition?.editor) {
    return { error: 'Editing is not enabled for workshop enrollments.' }
  }

  const payload: Record<string, unknown> = {}
  for (const [fieldName, fieldConfig] of Object.entries(definition.editor.fields)) {
    const parsed = parseEnrollmentField(formData, fieldName, fieldConfig.type, fieldConfig.nullable)
    if (!parsed.valid) {
      return { error: `Invalid value for ${fieldConfig.label ?? fieldName}.` }
    }
    if (
      fieldConfig.required &&
      (parsed.value === '' || parsed.value === null || parsed.value === undefined)
    ) {
      return { error: `${fieldConfig.label ?? fieldName} is required.` }
    }
    payload[fieldName] = parsed.value === '' ? null : parsed.value
  }

  const { supabase } = createClient(request)

  if (intent === 'insert-row') {
    const { error: insertError } = await supabase
      .from('workshop_enrollment')
      .insert(payload)

    if (insertError) {
      return { error: insertError.message }
    }

    return { success: true }
  }

  const enrollmentId = String(formData.get('pk_id') ?? '')
  if (!enrollmentId) {
    return { error: 'Missing key field id.' }
  }

  const { error: updateError } = await supabase
    .from('workshop_enrollment')
    .update(payload)
    .eq('id', enrollmentId)

  if (updateError) {
    return { error: updateError.message }
  }

  return { success: true }
}

export default function WorkshopEnrollmentPage() {
  const location = useLocation()
  const sourcePath = `/manage/workshop-enrollment${location.search}`

  return (
    <TableDisplay
      headerActions={
        <Form method="post" action="/manage/exports" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="create-export" />
          <input type="hidden" name="export_type" value={EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV} />
          <input type="hidden" name="source_path" value={sourcePath} />
          <Button type="submit" variant="outline" size="sm">Export CSV</Button>
        </Form>
      }
    />
  )
}
