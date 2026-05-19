import { expect, test } from '@playwright/test'

const PARTNER_PROGRAM = 'Taylor-Massey & Oakridge'

const uniqueSuffix = () => {
  const now = new Date()
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`
}

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

test('guardian signs up, completes pre-program survey, and enrolls', async ({ page }) => {
  const email = `e2e.guardian.${uniqueSuffix()}@gmail.com`
  const password = 'Password123456!'

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

    if ((await page.locator('select[name="question_partner_organization"]').count()) > 0) {
      await page.locator('select[name="question_partner_organization"]').selectOption({ label: PARTNER_PROGRAM })
    }

    if ((await page.getByText(/grocery gift card/i).count()) > 0) {
      await expect(page.getByText(/grocery gift card/i)).toBeVisible()
      await expect(page.getByText(/meal kit/i)).toHaveCount(0)
    }

    await fillRequiredFields(page)

    if ((await saveAndContinue.count()) === 0) {
      if (page.url().includes('/home')) break
      throw new Error('Save and continue button not found before onboarding completed')
    }

    await saveAndContinue.click()
    await page.waitForLoadState('networkidle')
  }

  await expect(page).toHaveURL(/\/home/)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('networkidle')

  const manageEnrollmentsLink = page.locator('a[href="/enroll"]').first()
  await expect(manageEnrollmentsLink).toBeVisible()
  await manageEnrollmentsLink.scrollIntoViewIfNeeded()
  await manageEnrollmentsLink.click()
  await expect(page).toHaveURL(/\/enroll/)

  if (page.url().match(/\/enroll\/[^/]+$/) && (await page.getByRole('button', { name: 'Complete pre-program survey' }).count()) === 0) {
    await page.getByRole('button', { name: 'Change semester' }).click()
  }

  if (page.url().endsWith('/enroll')) {
    const requiredRow = page
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name: 'Required' }) })
      .first()

    await expect(requiredRow).toBeVisible()
    await requiredRow.getByRole('link', { name: 'Select semester' }).click()
  }

  await expect(page.getByRole('button', { name: 'Complete pre-program survey' })).toBeVisible()
  await page.getByRole('button', { name: 'Complete pre-program survey' }).click()

  await fillRequiredFields(page)
  await page.getByRole('button', { name: 'Save and continue' }).click()

  const enrollAction = page.getByRole('button', { name: /Request enrollment|Join waitlist/ }).first()
  await expect(enrollAction).toBeVisible()
  await enrollAction.click()

  await expect(page.getByText(/Enrollment requested\.|Added to waitlist\./)).toBeVisible()
})
