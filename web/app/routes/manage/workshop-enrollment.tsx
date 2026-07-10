import { requireAuth } from '@/lib/auth.server'
import { createActionProfile } from '@/lib/action-profile.server'
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
import { createLoaderProfile } from '@/lib/loader-profile.server'
import { TABLE_DEFINITIONS } from './table-definitions'
import { Download } from 'lucide-react'

import type { Route } from './+types/workshop-enrollment'
import TableDisplay from './table-display'
import { EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV } from '@/lib/exports/types'
import { transitionWorkshopEnrollmentStatus } from '@/lib/workshop-enrollment-status.server'
import {
  GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE,
  loadEditableQuestionOptions,
  upsertAdminFamilyFormAnswer,
} from '@/lib/admin-form-answers.server'

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
  const profile = createLoaderProfile({
    name: 'workshop_enrollment_loader',
    request: args.request,
  })

  const base = await loadWorkshopEnrollmentData(args.request)
  profile.mark('load_workshop_enrollment_data', {
    rowCount: base.rows.length,
    totalRows: base.totalRows ?? base.rows.length,
  })

  let giftCardOptions: string[] = []
  let federalDistrictOptions: Array<{ value: string; label: string }> = []
  try {
    giftCardOptions = await loadEditableQuestionOptions(GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE)
  } catch (error) {
    console.error('[workshop enrollment] unable to load gift card question options', error)
  }
  profile.mark('load_gift_card_options', {
    optionCount: giftCardOptions.length,
  })

  try {
    const { data, error } = await adminClient
      .from('federal_electoral_district')
      .select('name')
      .order('name', { ascending: true })
    if (error) {
      console.error('[workshop enrollment] unable to load federal district options', error)
    } else {
      federalDistrictOptions = (data ?? [])
        .map(row => (typeof row.name === 'string' ? row.name.trim() : ''))
        .filter(Boolean)
        .map(name => ({ value: name, label: name }))
    }
  } catch (error) {
    console.error('[workshop enrollment] unable to load federal district options', error)
  }

  profile.mark('load_federal_district_options', {
    optionCount: federalDistrictOptions.length,
  })

  const result = {
    ...base,
    giftCardOptions,
    federalDistrictOptions,
  }

  profile.complete({
    rowCount: result.rows.length,
    giftCardOptionCount: giftCardOptions.length,
    districtOptionCount: federalDistrictOptions.length,
  })

  return result
}

export async function action({ request }: Route.ActionArgs) {
  const profile = createActionProfile({
    name: 'workshop_enrollment_action',
    request,
  })
  let intent: string | null = null
  let outcome = 'unknown'
  let errorMessage: string | null = null

  try {
    const auth = await requireAuth(request)
    profile.mark('require_auth', {
      role: auth.claims.role,
    })

    const formData = await request.formData()
    intent = formData.get('intent') as string | null
    profile.mark('parse_form_data', {
      intent,
    })

    if (intent === 'update-status') {
      profile.mark('intent_update_status_start')
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      outcome = 'update_status_unauthorized'
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const enrollmentId = formData.get('enrollment_id') as string
    const status = formData.get('status') as string | null
    if (!enrollmentId || !status) {
      outcome = 'update_status_missing_data'
      return new Response('Missing enrollment data', { status: 400, headers: auth.headers })
    }

    if (
      !Constants.public.Enums.workshop_enrollment_status.includes(
        status as Database['public']['Enums']['workshop_enrollment_status']
      )
    ) {
      outcome = 'update_status_invalid_value'
      return new Response('Invalid status', { status: 400, headers: auth.headers })
    }

    const transitionResult = await transitionWorkshopEnrollmentStatus({
      enrollmentId,
      nextStatus: status as Database['public']['Enums']['workshop_enrollment_status'],
      actorUserId: auth.user.id,
      scope: 'admin',
    })
    profile.mark('update_status_transition', {
      enrollmentId,
      status,
      ok: transitionResult.ok,
      code: transitionResult.code ?? null,
    })

    if (!transitionResult.ok || !transitionResult.enrollment) {
      outcome = 'update_status_transition_error'
      return new Response(transitionResult.error ?? 'Unable to update enrollment', {
        status: transitionResult.code === 'not_found' ? 404 : 500,
        headers: auth.headers,
      })
    }

    const enrollment = transitionResult.enrollment

    const transitionedToApproved = transitionResult.previousStatus !== 'approved' && status === 'approved'
    if (transitionedToApproved && enrollment.profile_id) {
      try {
        const familyContacts = await resolveFamilyContactsByProfileId(adminClient, enrollment.profile_id)
        const { data: workshopRow } = await adminClient
          .from('workshop')
          .select('description')
          .eq('id', enrollment.workshop_id)
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
               familyProfileId: enrollment.profile_id,
               workshopEnrollmentId: enrollmentId,
             })
          })
        )
        profile.mark('update_status_send_acceptance_emails', {
          enrollmentId,
          recipientCount: recipientEmails.length,
        })
      } catch (notificationError) {
        console.error('[workshop enrollment] accepted notification failed', {
          enrollmentId,
          error: notificationError,
        })
        profile.log('update_status_send_acceptance_emails_failed', {
          enrollmentId,
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        })
      }
    }

    outcome = 'update_status_success'
    return { ok: true }
  }

  if (intent === 'update-family-form-answer') {
    profile.mark('intent_update_family_form_answer_start')
    if (!isRoleAtLeast(auth.claims.role, 'staff')) {
      outcome = 'update_family_form_answer_unauthorized'
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const profileId = String(formData.get('profile_id') ?? '').trim()
    const questionCode = String(formData.get('question_code') ?? '').trim()
    const value = String(formData.get('value') ?? '').trim()

    if (!profileId || !questionCode) {
      outcome = 'update_family_form_answer_missing_data'
      return new Response('Missing profile or question code', { status: 400, headers: auth.headers })
    }

    const result = await upsertAdminFamilyFormAnswer({
      seedProfileId: profileId,
      questionCode,
      value,
      actorUserId: auth.user.id,
    })
    profile.mark('update_family_form_answer_upsert', {
      profileId,
      questionCode,
      ok: result.ok,
    })

    if (!result.ok) {
      outcome = 'update_family_form_answer_error'
      return new Response(result.error, { status: 400, headers: auth.headers })
    }

    outcome = 'update_family_form_answer_success'
    return {
      ok: true,
      intent,
      profile_id: profileId,
      question_code: questionCode,
      value: result.value,
      gift_card_question_code: GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE,
    }
  }

  if (intent === 'update-workshop-enrollment-modal') {
    profile.mark('intent_update_workshop_enrollment_modal_start')
    if (!isRoleAtLeast(auth.claims.role, 'admin')) {
      outcome = 'update_modal_unauthorized'
      return new Response('Unauthorized', { status: 403, headers: auth.headers })
    }

    const definition = TABLE_DEFINITIONS['class-enrollment']
    if (!definition?.editor) {
      outcome = 'update_modal_editor_not_enabled'
      return { error: 'Editing is not enabled for workshop enrollments.' }
    }

    const payload: Record<string, unknown> = {}
    for (const [fieldName, fieldConfig] of Object.entries(definition.editor.fields)) {
      if (fieldName === 'profile_id') continue
      const parsed = parseEnrollmentField(formData, fieldName, fieldConfig.type, fieldConfig.nullable)
      if (!parsed.valid) {
        outcome = 'update_modal_invalid_field'
        return { error: `Invalid value for ${fieldConfig.label ?? fieldName}.` }
      }
      if (
        fieldConfig.required &&
        (parsed.value === '' || parsed.value === null || parsed.value === undefined)
      ) {
        outcome = 'update_modal_missing_required_field'
        return { error: `${fieldConfig.label ?? fieldName} is required.` }
      }
      payload[fieldName] = parsed.value === '' ? null : parsed.value
    }

    const statusValueRaw = String(formData.get('status_value') ?? '').trim()
    if (!statusValueRaw) {
      outcome = 'update_modal_missing_status'
      return { error: 'Status is required.' }
    }
    if (
      !Constants.public.Enums.workshop_enrollment_status.includes(
        statusValueRaw as Database['public']['Enums']['workshop_enrollment_status']
      )
    ) {
      outcome = 'update_modal_invalid_status'
      return { error: 'Invalid status.' }
    }
    payload.status = statusValueRaw

    const enrollmentId = String(formData.get('pk_id') ?? '')
    if (!enrollmentId) {
      outcome = 'update_modal_missing_enrollment_id'
      return { error: 'Missing key field id.' }
    }

    const { supabase } = createClient(request)
    const { error: updateError } = await supabase
      .from('workshop_enrollment')
      .update(payload)
      .eq('id', enrollmentId)
    profile.mark('update_modal_update_enrollment', {
      enrollmentId,
      hasError: Boolean(updateError),
    })

    if (updateError) {
      outcome = 'update_modal_update_error'
      return { error: updateError.message }
    }

    const giftcardValue = String(formData.get('giftcard_value') ?? '').trim()
    const giftcardProfileId = String(formData.get('profile_id_for_giftcard') ?? '').trim()
    const ridingNameRaw = String(formData.get('riding_name') ?? '').trim()
    const ridingName = ridingNameRaw || null

    if (giftcardProfileId) {
      if (ridingName) {
        const { data: districtRow, error: districtError } = await adminClient
          .from('federal_electoral_district')
          .select('name')
          .eq('name', ridingName)
          .maybeSingle()

        if (districtError) {
          outcome = 'update_modal_district_lookup_error'
          return { error: districtError.message }
        }
        if (!districtRow?.name) {
          outcome = 'update_modal_district_missing'
          return { error: 'Selected riding does not exist.' }
        }
      }

      const { error: ridingUpdateError } = await adminClient
        .from('profile')
        .update({ federal_electoral_district_name: ridingName })
        .eq('id', giftcardProfileId)

      if (ridingUpdateError) {
        outcome = 'update_modal_riding_update_error'
        return { error: ridingUpdateError.message }
      }
    }

    if (giftcardValue && giftcardProfileId) {
      const giftcardResult = await upsertAdminFamilyFormAnswer({
        seedProfileId: giftcardProfileId,
        questionCode: GIFT_CARD_STORE_PREFERENCE_QUESTION_CODE,
        value: giftcardValue,
        actorUserId: auth.user.id,
      })

      if (!giftcardResult.ok) {
        outcome = 'update_modal_giftcard_answer_error'
        return { error: giftcardResult.error }
      }
    }

    outcome = 'update_modal_success'
    return { success: true }
  }

  if (intent !== 'insert-row' && intent !== 'update-row') {
    outcome = 'unsupported_intent'
    return new Response('Unsupported action', { status: 400, headers: auth.headers })
  }

  if (!isRoleAtLeast(auth.claims.role, 'admin')) {
    outcome = 'insert_update_unauthorized'
    return new Response('Unauthorized', { status: 403, headers: auth.headers })
  }

  const definition = TABLE_DEFINITIONS['class-enrollment']
  if (!definition?.editor) {
    outcome = 'insert_update_editor_not_enabled'
    return { error: 'Editing is not enabled for workshop enrollments.' }
  }

  const payload: Record<string, unknown> = {}
  for (const [fieldName, fieldConfig] of Object.entries(definition.editor.fields)) {
    const parsed = parseEnrollmentField(formData, fieldName, fieldConfig.type, fieldConfig.nullable)
    if (!parsed.valid) {
      outcome = 'insert_update_invalid_field'
      return { error: `Invalid value for ${fieldConfig.label ?? fieldName}.` }
    }
    if (
      fieldConfig.required &&
      (parsed.value === '' || parsed.value === null || parsed.value === undefined)
    ) {
      outcome = 'insert_update_missing_required_field'
      return { error: `${fieldConfig.label ?? fieldName} is required.` }
    }
    payload[fieldName] = parsed.value === '' ? null : parsed.value
  }

  const { supabase } = createClient(request)

  if (intent === 'insert-row') {
    const { error: insertError } = await supabase
      .from('workshop_enrollment')
      .insert(payload)
    profile.mark('insert_row_execute', {
      hasError: Boolean(insertError),
    })

    if (insertError) {
      outcome = 'insert_row_error'
      return { error: insertError.message }
    }

    outcome = 'insert_row_success'
    return { success: true }
  }

  const enrollmentId = String(formData.get('pk_id') ?? '')
  if (!enrollmentId) {
    outcome = 'update_row_missing_enrollment_id'
    return { error: 'Missing key field id.' }
  }

  const { error: updateError } = await supabase
    .from('workshop_enrollment')
    .update(payload)
    .eq('id', enrollmentId)
  profile.mark('update_row_execute', {
    enrollmentId,
    hasError: Boolean(updateError),
  })

  if (updateError) {
    outcome = 'update_row_error'
    return { error: updateError.message }
  }

  outcome = 'update_row_success'
  return { success: true }
  } catch (error) {
    outcome = 'exception'
    errorMessage = error instanceof Error ? error.message : String(error)
    profile.log('workshop_enrollment_action_error', {
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
    })
  }
}

export default function WorkshopEnrollmentPage() {
  const location = useLocation()
  const sourcePath = `/manage/workshop-enrollment${location.search}`

  return (
    <TableDisplay
      paginationActions={
        <Form method="post" action="/manage/exports" className="flex items-center gap-2">
          <input type="hidden" name="intent" value="create-export" />
          <input type="hidden" name="export_type" value={EXPORT_TYPE_WORKSHOP_ENROLLMENT_CSV} />
          <input type="hidden" name="source_path" value={sourcePath} />
          <Button type="submit" variant="outline" size="icon-sm" aria-label="Export CSV" title="Export CSV">
            <Download className="size-4" />
          </Button>
        </Form>
      }
    />
  )
}
