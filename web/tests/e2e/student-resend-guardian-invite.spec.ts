import { expect, test } from '@playwright/test'

import { generateInviteLinkForEmail } from './helpers/invite-links'
import { getAdminSupabaseClient, hasAdminServiceEnv } from './helpers/admin-account'
import { uniqueSuffix } from './helpers/ids'

const fillRequiredFields = async (page: import('@playwright/test').Page) => {
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
      await input.fill(`autofill+${uniqueSuffix()}@gmail.com`)
      continue
    }

    if (inputName.includes('postcode') || inputName.includes('postal')) {
      await input.fill('K1A 0B1')
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

const submitStepWithRetry = async (page: import('@playwright/test').Page, maxAttempts = 3) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await fillRequiredFields(page)

    const missingBeforeSubmit = await countMissingRequiredFields(page)
    if (missingBeforeSubmit > 0) {
      await page.waitForTimeout(400)
      continue
    }

    const submitButton = page.locator('form button[type="submit"]').first()
    if ((await submitButton.count()) === 0) {
      await page.waitForTimeout(400)
      continue
    }

    await expect(submitButton).toBeEnabled({ timeout: 10000 })
    await submitButton.click()
    await page.waitForTimeout(500)

    const errorPrompt = page.locator('p.text-red-500').first()
    if ((await errorPrompt.count()) === 0 || !(await errorPrompt.isVisible())) {
      return
    }
  }

  throw new Error('Form could not be submitted cleanly after retries')
}

const findAuthUserByEmail = async (email: string) => {
  const adminSupabase = getAdminSupabaseClient()
  let pageNumber = 1

  while (true) {
    const { data, error } = await adminSupabase.auth.admin.listUsers({ page: pageNumber, perPage: 200 })
    if (error) throw new Error(error.message)

    const users = data?.users ?? []
    const found = users.find(user => (user.email ?? '').toLowerCase() === email.toLowerCase())
    if (found) return found

    if (users.length < 200) break
    pageNumber += 1
  }

  return null
}

test.describe.serial('student resend guardian invite', () => {
  test.skip(!hasAdminServiceEnv(), 'Requires SUPABASE_URL and SUPABASE_SECRET_KEY for admin setup')

  test('resend invite works after student re-login and guardian can complete password setup', async ({ page }) => {
    const suffix = uniqueSuffix()
    const studentEmail = `e2e.student.${suffix}@gmail.com`
    const studentPassword = 'Password123456!'
    const guardianPassword = 'Password123456!'
    const origin = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173'
    const adminSupabase = getAdminSupabaseClient()

    await page.goto('/sign-up')
    await page.getByRole('button', { name: 'I am a Student' }).click()
    await page.getByLabel('Gmail').fill(studentEmail)
    await page.getByLabel('Password', { exact: true }).fill(studentPassword)
    await page.getByLabel('Repeat Password').fill(studentPassword)
    await page.getByLabel(/I have read and agree to the/i).check()
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page).toHaveURL(/\/auth\/sign-up-details/)

    for (let step = 0; step < 25; step += 1) {
      if (page.url().includes('/auth/waiting-on-guardian')) break

      const saveAndContinue = page.getByRole('button', { name: /Save and continue|Saving\.\.\./ })
      await Promise.race([
        page.waitForURL(/\/auth\/waiting-on-guardian/, { timeout: 10000 }),
        saveAndContinue.first().waitFor({ state: 'visible', timeout: 10000 }),
      ])

      if (page.url().includes('/auth/waiting-on-guardian')) break

      if ((await page.locator('input[name="question_child_has_email"][value="No"]').count()) > 0) {
        await page.locator('input[name="question_child_has_email"][value="No"]').check()
      }

      if ((await page.locator('input[name="additional_guardian_choice"][value="no"]').count()) > 0) {
        await page.locator('input[name="additional_guardian_choice"][value="no"]').check()
      }

      await submitStepWithRetry(page)
      await page.waitForLoadState('networkidle')
    }

    await expect(page).toHaveURL(/\/auth\/waiting-on-guardian/)

    const studentUser = await findAuthUserByEmail(studentEmail)
    if (!studentUser?.id) {
      throw new Error('Unable to find created student auth user')
    }

    await expect
      .poll(
        async () => {
          const { data } = await adminSupabase
            .from('invites')
            .select('invitee_email')
            .eq('inviter_user_id', studentUser.id)
            .eq('role', 'guardian')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          return Boolean(data?.invitee_email)
        },
        { timeout: 15000 }
      )
      .toBeTruthy()

    const { data: guardianInviteRow, error: guardianInviteError } = await adminSupabase
      .from('invites')
      .select('invitee_email')
      .eq('inviter_user_id', studentUser.id)
      .eq('role', 'guardian')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (guardianInviteError || !guardianInviteRow?.invitee_email) {
      throw new Error(guardianInviteError?.message ?? 'Unable to find guardian invite email')
    }

    const guardianEmail = guardianInviteRow.invitee_email

    await page.goto('/logout')
    await page.goto('/login')
    await page.getByLabel('Email').fill(studentEmail)
    await page.getByLabel('Password').fill(studentPassword)
    await page.getByRole('button', { name: 'Login' }).click()

    await expect(page).toHaveURL(/\/auth\/waiting-on-guardian/)

    await page.getByRole('button', { name: /Save \+ resend|Resend invite/ }).first().click()
    await expect(page.getByText(`Invite resent to ${guardianEmail}`)).toBeVisible()

    const inviteLink = await generateInviteLinkForEmail({
      email: guardianEmail,
      origin,
      role: 'guardian',
    })

    await page.goto(inviteLink)
    await expect(page).toHaveURL(/\/sign-up\/invite/)

    await page.getByLabel('Password', { exact: true }).fill(guardianPassword)
    await page.getByLabel('Repeat Password').fill(guardianPassword)
    await page.getByRole('button', { name: 'Set password' }).click()

    await expect(page).toHaveURL(/\/auth\/sign-up-details|\/home|\/my-forms/)

    const guardianUser = await findAuthUserByEmail(guardianEmail)
    if (!guardianUser?.id) {
      throw new Error('Unable to find invited guardian auth user')
    }

    const { data: guardianProfile, error: guardianProfileError } = await adminSupabase
      .from('profile')
      .select('user_id, password_set')
      .eq('email', guardianEmail)
      .eq('role', 'guardian')
      .maybeSingle()

    if (guardianProfileError) {
      throw new Error(guardianProfileError.message)
    }

    expect(guardianProfile?.user_id).toBe(guardianUser.id)
    expect(guardianProfile?.password_set).toBeTruthy()
  })
})
