import { expect, test } from '@playwright/test'

import {
  ensureReusableAdminAccount,
  getAdminSupabaseClient,
  hasAdminServiceEnv,
  loginAsAdmin,
} from './helpers/admin-account'
import { uniqueSuffix } from './helpers/ids'
import { submitStepWithRetry } from './helpers/onboarding'

const guardianSignupAndRequestEnrollment = async (page: import('@playwright/test').Page) => {
  const suffix = uniqueSuffix()
  const email = `sai+tests${suffix}@chsolutions.ca`
  const password = 'Password123456!'
  const firstName = 'Sai'
  const surname = `tests${suffix}`

  await page.goto('/sign-up')
  await page.getByRole('button', { name: 'I am a Guardian' }).click()
  await page.getByLabel('Gmail').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Repeat Password').fill(password)
  await page.getByLabel(/I have read and agree to the/i).check()
  await page.getByRole('button', { name: 'Next' }).click()

  await expect(page).toHaveURL(/\/auth\/sign-up-details/)

  for (let step = 0; step < 20; step += 1) {
    if (page.url().includes('/home')) break

    const saveAndContinue = page.getByRole('button', { name: /Save and continue|Saving\.\.\./ })
    await Promise.race([
      page.waitForURL(/\/home/, { timeout: 10000 }),
      saveAndContinue.first().waitFor({ state: 'visible', timeout: 10000 }),
    ])

    if (page.url().includes('/home')) break

    if ((await page.locator('input[name="question_child_has_email"][value="No"]').count()) > 0) {
      await page.locator('input[name="question_child_has_email"][value="No"]').check()
    }

    if ((await page.locator('input[name="additional_guardian_choice"][value="no"]').count()) > 0) {
      await page.locator('input[name="additional_guardian_choice"][value="no"]').check()
    }

    await submitStepWithRetry(page, /Save and continue/i, 8, {
      firstName,
      surname,
      emailFactory: () => `sai+tests${uniqueSuffix()}@chsolutions.ca`,
    })
    await page.waitForLoadState('networkidle')
  }

  await expect(page).toHaveURL(/\/home/)

  const manageEnrollmentsLink = page.locator('a[href="/enroll"]').first()
  if ((await manageEnrollmentsLink.count()) > 0) {
    await manageEnrollmentsLink.click({ timeout: 5000 })
  } else {
    await page.goto('/enroll')
  }

  if (!page.url().includes('/enroll')) {
    await page.goto('/enroll')
  }
  await expect(page).toHaveURL(/\/enroll/)

  const preProgramLink = page.getByRole('link', { name: 'Complete pre-program survey' })

  if (page.url().match(/\/enroll\/[^/]+$/) && (await preProgramLink.count()) === 0) {
    const changeSemesterLink = page.getByRole('link', { name: 'Change semester' })
    if ((await changeSemesterLink.count()) > 0) {
      await changeSemesterLink.click()
      await expect(page).toHaveURL(/\/enroll$/)
    }
  }

  if (page.url().endsWith('/enroll')) {
    const rows = page.locator('tbody tr')
    const rowCount = await rows.count()
    let openedSurvey = false

    for (let index = 0; index < rowCount; index += 1) {
      const row = rows.nth(index)
      const selectSemesterLink = row.getByRole('link', { name: 'Select semester' })
      if ((await selectSemesterLink.count()) === 0) continue

      await selectSemesterLink.click()
      await expect(page).toHaveURL(/\/enroll\/[^/]+$/)

      if ((await preProgramLink.count()) > 0) {
        openedSurvey = true
        break
      }

      const changeSemesterLink = page.getByRole('link', { name: 'Change semester' })
      if ((await changeSemesterLink.count()) > 0) {
        await changeSemesterLink.click()
        await expect(page).toHaveURL(/\/enroll$/)
      }
    }

    if (!openedSurvey) {
      throw new Error('Could not find a semester with a pre-program survey link')
    }
  }

  await expect(preProgramLink).toBeVisible()
  await preProgramLink.click()
  await submitStepWithRetry(page, 'Save and continue', 4, {
    firstName,
    surname,
  })

  const enrollAction = page.getByRole('button', { name: /Request enrollment|Join waitlist/ }).first()
  await expect(enrollAction).toBeVisible()
  await enrollAction.click()

  await expect(page).toHaveURL(/\/home\?/)
  await expect(page).toHaveURL(/enrollmentStatus=success/)

  return { guardianEmail: email, firstName, surname }
}

const getLatestEnrollmentForGuardian = async (guardianEmail: string) => {
  const adminSupabase = getAdminSupabaseClient()

  const { data: guardianProfile, error: guardianProfileError } = await adminSupabase
    .from('profile')
    .select('id')
    .eq('email', guardianEmail)
    .single()

  if (guardianProfileError || !guardianProfile?.id) {
    throw new Error(guardianProfileError?.message ?? 'Guardian profile not found')
  }

  const { data: links, error: linksError } = await adminSupabase
    .from('person_guardian_child')
    .select('child_profile_id')
    .eq('guardian_profile_id', guardianProfile.id)

  if (linksError) {
    throw new Error(linksError.message)
  }

  const familyProfileIds = Array.from(
    new Set([
      guardianProfile.id,
      ...(links ?? []).map(link => link.child_profile_id).filter((id): id is string => Boolean(id)),
    ])
  )

  const { data: enrollments, error: enrollmentError } = await adminSupabase
    .from('workshop_enrollment')
    .select('id, status, requested_at')
    .in('profile_id', familyProfileIds)
    .order('requested_at', { ascending: false })
    .limit(25)

  if (enrollmentError) {
    throw new Error(enrollmentError?.message ?? 'Enrollment not found for guardian')
  }

  const enrollment = (enrollments ?? []).find(row => row.status === 'pending' || row.status === 'waitlisted')
    ?? (enrollments ?? [])[0]

  if (!enrollment?.id) {
    throw new Error('Enrollment not found for guardian')
  }

  return enrollment
}

const waitForEnrollmentStatus = async (guardianEmail: string, expectedStatus: 'approved') => {
  const enrollment = await getLatestEnrollmentForGuardian(guardianEmail)
  return waitForEnrollmentRecordStatus(enrollment.id, expectedStatus)
}

const waitForEnrollmentRecordStatus = async (enrollmentId: string, expectedStatus: 'approved') => {
  const adminSupabase = getAdminSupabaseClient()
  const started = Date.now()
  while (Date.now() - started < 20_000) {
    const { data, error } = await adminSupabase
      .from('workshop_enrollment')
      .select('id, status, requested_at')
      .eq('id', enrollmentId)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    if (data?.status === expectedStatus) return data
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`Enrollment did not reach status ${expectedStatus} in time`)
}

const waitForAcceptedEmailLog = async ({
  enrollmentId,
  recipientEmail,
}: {
  enrollmentId: string
  recipientEmail: string
}) => {
  const adminSupabase = getAdminSupabaseClient()
  const normalizedEmail = recipientEmail.toLowerCase()
  const started = Date.now()

  while (Date.now() - started < 20_000) {
    const { data, error } = await adminSupabase
      .from('email_message')
      .select('id, status, template_key, to_email, workshop_enrollment_id, error_message, created_at')
      .eq('workshop_enrollment_id', enrollmentId)
      .eq('template_key', 'family_enrollment_accepted_v1')
      .eq('to_email', normalizedEmail)
      .order('created_at', { ascending: false })
      .limit(1)

    if (error) throw new Error(error.message)
    if ((data ?? []).length > 0) {
      return data?.[0]
    }

    await new Promise(resolve => setTimeout(resolve, 500))
  }

  throw new Error('No accepted-email log row found for guardian after approval')
}

const assertGuardianProfileName = async ({
  guardianEmail,
  firstName,
  surname,
}: {
  guardianEmail: string
  firstName: string
  surname: string
}) => {
  const adminSupabase = getAdminSupabaseClient()
  const { data, error } = await adminSupabase
    .from('profile')
    .select('firstname, surname')
    .eq('email', guardianEmail)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Guardian profile not found for name verification')
  }

  expect(data.firstname).toBe(firstName)
  expect(data.surname).toBe(surname)
}

test.describe.serial('admin-managed enrollment lifecycle', () => {
  test.skip(!hasAdminServiceEnv(), 'Requires SUPABASE_URL and SUPABASE_SECRET_KEY for admin setup')

  test.beforeAll(async () => {
    await ensureReusableAdminAccount()
  })

  test('creates or reuses shared admin account for admin tests', async ({ page }) => {
    await loginAsAdmin(page)
    await expect(page).toHaveURL(/\/manage/)
  })

  test('guardian requests enrollment and admin accepts it', async ({ page }) => {
    const { guardianEmail, firstName, surname } = await guardianSignupAndRequestEnrollment(page)
    await assertGuardianProfileName({ guardianEmail, firstName, surname })

    const enrollment = await getLatestEnrollmentForGuardian(guardianEmail)

    await expect(['pending', 'waitlisted']).toContain(enrollment.status)

    await loginAsAdmin(page)

    const response = await page.request.post('/manage/workshop-enrollment', {
      form: {
        intent: 'update-status',
        enrollment_id: enrollment.id,
        status: 'approved',
      },
    })

    expect(response.ok()).toBeTruthy()

    const updated = await waitForEnrollmentRecordStatus(enrollment.id, 'approved')
    expect(updated.status).toBe('approved')

    const acceptedEmailLog = await waitForAcceptedEmailLog({
      enrollmentId: enrollment.id,
      recipientEmail: guardianEmail,
    })
    expect(acceptedEmailLog.template_key).toBe('family_enrollment_accepted_v1')
    expect(acceptedEmailLog.to_email).toBe(guardianEmail.toLowerCase())
  })
})
