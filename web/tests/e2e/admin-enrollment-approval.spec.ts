import { expect, test } from '@playwright/test'

import {
  ensureReusableAdminAccount,
  getAdminSupabaseClient,
  hasAdminServiceEnv,
  loginAsAdmin,
} from './helpers/admin-account'

const uniqueSuffix = () => {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`
}

const fillRequiredFields = async (
  page: import('@playwright/test').Page,
  context?: { firstName?: string; surname?: string }
) => {
  const form = page.locator('form').first()

  const requiredTextInputs = form.locator(
    'input[required]:not([type="hidden"]):not([type="radio"]):not([type="checkbox"])'
  )

  const inputCount = await requiredTextInputs.count()
  for (let index = 0; index < inputCount; index += 1) {
    const input = requiredTextInputs.nth(index)
    const currentValue = await input.inputValue()
    if (currentValue.trim()) continue

    const inputType = (await input.getAttribute('type')) ?? 'text'
    const inputName = ((await input.getAttribute('name')) ?? '').toLowerCase()

    if (inputType === 'date') {
      await input.fill('2012-05-10')
      continue
    }

    if (inputType === 'number') {
      await input.fill('2')
      continue
    }

    if (inputType === 'email') {
      await input.fill(`sai+tests${uniqueSuffix()}@chsolutions.ca`)
      continue
    }

    if (inputName.includes('postcode') || inputName.includes('postal')) {
      await input.fill('K1A 0B1')
      continue
    }

    if (inputName.includes('firstname') || inputName.includes('first_name')) {
      await input.fill(context?.firstName ?? 'Sai')
      continue
    }

    if (inputName.includes('surname') || inputName.includes('last_name') || inputName.includes('lastname')) {
      await input.fill(context?.surname ?? 'tests')
      continue
    }

    await input.fill('Auto value')
  }

  const requiredSelectNames = await form
    .locator('select[required]')
    .evaluateAll(selects =>
      Array.from(new Set(selects.map(select => select.getAttribute('name')).filter((name): name is string => Boolean(name))))
    )

  for (const name of requiredSelectNames) {
    const select = form.locator(`select[name="${name}"]`).first()
    if (!(await select.isVisible())) continue
    if (!(await select.isEnabled())) continue

    const value = await select.inputValue()
    if (value) continue

    const options = await select.locator('option').all()
    for (const option of options) {
      const optionValue = (await option.getAttribute('value')) ?? ''
      const disabled = (await option.getAttribute('disabled')) !== null
      if (!optionValue || disabled) continue
      await select.selectOption(optionValue)
      break
    }
  }

  const checkboxNames = await form
    .locator('input[type="checkbox"][name^="question_"], input[type="checkbox"][required]')
    .evaluateAll(inputs =>
      Array.from(new Set(inputs.map(input => input.getAttribute('name')).filter((name): name is string => Boolean(name))))
    )

  for (const name of checkboxNames) {
    const checkbox = form.locator(`input[type="checkbox"][name="${name}"]`).first()
    if (!(await checkbox.isVisible())) continue
    if (!(await checkbox.isEnabled())) continue
    await checkbox.check()
  }

  const radioNames = await form
    .locator('input[type="radio"][required]')
    .evaluateAll(inputs =>
      Array.from(new Set(inputs.map(input => input.getAttribute('name')).filter((name): name is string => Boolean(name))))
    )

  for (const name of radioNames) {
    const checked = await form.locator(`input[type="radio"][name="${name}"]:checked`).count()
    if (checked > 0) continue
    await form.locator(`input[type="radio"][name="${name}"]`).first().check()
  }
}

const countMissingRequiredFields = async (page: import('@playwright/test').Page) => {
  const form = page.locator('form').first()
  return form.evaluate(formEl => {
    const getVisible = (element: HTMLElement) => {
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null
    }

    let missing = 0

    const requiredInputs = Array.from(
      formEl.querySelectorAll<HTMLInputElement>('input[required]:not([type="hidden"])')
    ).filter(input => !input.disabled && getVisible(input))

    const handledRadioNames = new Set<string>()

    for (const input of requiredInputs) {
      if (input.type === 'radio') {
        if (!input.name || handledRadioNames.has(input.name)) continue
        handledRadioNames.add(input.name)
        const checked = formEl.querySelector(`input[type="radio"][name="${CSS.escape(input.name)}"]:checked`)
        if (!checked) missing += 1
        continue
      }

      if (input.type === 'checkbox') {
        if (!input.checked) missing += 1
        continue
      }

      if (!input.value.trim()) missing += 1
    }

    const requiredSelects = Array.from(formEl.querySelectorAll<HTMLSelectElement>('select[required]')).filter(
      select => !select.disabled && getVisible(select)
    )

    for (const select of requiredSelects) {
      if (!select.value) missing += 1
    }

    return missing
  })
}

const submitStepWithRetry = async (
  page: import('@playwright/test').Page,
  submitName: RegExp | string,
  maxAttempts = 3,
  context?: { firstName?: string; surname?: string }
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await fillRequiredFields(page, context)

    const missingBeforeSubmit = await countMissingRequiredFields(page)
    if (missingBeforeSubmit > 0) {
      await page.waitForTimeout(400)
      continue
    }

    const submitButton = page.getByRole('button', { name: submitName }).first()
    await submitButton.click()
    await page.waitForTimeout(500)

    const errorPrompt = page.locator('p.text-red-500').first()
    if ((await errorPrompt.count()) === 0 || !(await errorPrompt.isVisible())) {
      return
    }
  }

  throw new Error('Form could not be submitted cleanly after retries')
}

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

    await submitStepWithRetry(page, /Save and continue|Saving\.\.\./, 3, {
      firstName,
      surname,
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
