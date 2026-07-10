import type { Page } from '@playwright/test'

import { uniqueSuffix } from './ids'

type OnboardingAutofillContext = {
  firstName?: string
  surname?: string
  emailFactory?: () => string
}

const defaultEmailFactory = () => `autofill+${uniqueSuffix()}@gmail.com`

const fillRequiredFields = async (page: Page, context?: OnboardingAutofillContext) => {
  const form = page.locator('form').first()

  if ((await form.count()) === 0) {
    return
  }

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
      const email = (context?.emailFactory ?? defaultEmailFactory)()
      await input.fill(email)
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
    if (await checkbox.isChecked()) continue
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

export const submitStepWithRetry = async (
  page: Page,
  submitName: RegExp | string,
  maxAttempts = 3,
  context?: OnboardingAutofillContext
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (page.url().includes('/home')) {
      return
    }

    await fillRequiredFields(page, context)

    const submitButton = page.getByRole('button', { name: submitName }).first()
    if ((await submitButton.count()) === 0) {
      await page.waitForTimeout(400)
      continue
    }

    const isEnabled = await submitButton.isEnabled({ timeout: 3000 }).catch(() => false)
    if (!isEnabled) {
      await page.waitForTimeout(400)
      continue
    }

    await submitButton.click()
    await page.waitForTimeout(500)

    const errorPrompt = page.locator('p.text-red-500').first()
    if ((await errorPrompt.count()) === 0 || !(await errorPrompt.isVisible())) {
      return
    }
  }

  if (page.url().includes('/home')) {
    return
  }

  throw new Error('Form could not be submitted cleanly after retries')
}
