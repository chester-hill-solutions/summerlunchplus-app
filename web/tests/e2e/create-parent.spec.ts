import { expect, test } from '@playwright/test'

test('guardian sign-up creates a parent profile', async ({ page }) => {
  const now = new Date()
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const email = `sai+SlpE2eParent${stamp}@chsolutions.ca`

  await page.goto('/')

  await page.locator('form').getByRole('link', { name: 'Sign up' }).click()
  await page.getByRole('button', { name: 'I am a Guardian' }).click()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('123456789123456')
  await page.getByLabel('Repeat Password').fill('123456789123456')

  await page.getByRole('button', { name: 'Next' }).click()

  const errorBanner = page.locator('form').locator('p.text-red-500')

  const result = await Promise.race([
    page.waitForURL(/\/auth\/sign-up-details/, { timeout: 10000 }).then(() => 'success'),
    errorBanner.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'error'),
  ])

  if (result === 'error') {
    const message = (await errorBanner.textContent())?.trim() || 'Unknown error'
    throw new Error(`Sign-up flow error: ${message}`)
  }

  await expect(page).toHaveURL(/\/auth\/sign-up-details/)
})
