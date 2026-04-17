import { expect, test } from '@playwright/test'

const assertNoErrorAfterSubmit = async (page: import('@playwright/test').Page) => {
  const errorBanner = page.locator('form').locator('p.text-red-500')
  const result = await Promise.race([
    errorBanner.waitFor({ state: 'visible', timeout: 10000 }).then(() => 'error'),
    page.waitForTimeout(1000).then(() => 'idle'),
  ])

  if (result === 'error') {
    const message = (await errorBanner.textContent())?.trim() || 'Unknown error'
    throw new Error(`Sign-up flow error: ${message}`)
  }
}

test('guardian sign-up creates a parent profile', async ({ page }) => {
  const now = new Date()
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  const email = `sai+SlpE2eGuardian${stamp}@chsolutions.ca`

  await page.goto('/')

  await page.locator('form').getByRole('link', { name: 'Sign up' }).click()
  await page.getByRole('button', { name: 'I am a Guardian' }).click()

  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('123456789123456')
  await page.getByLabel('Repeat Password').fill('123456789123456')

  await page.getByRole('button', { name: 'Next' }).click()

  await assertNoErrorAfterSubmit(page)
  await expect(page.getByLabel('Guardian First Name')).toBeVisible()

  await page.getByLabel('Guardian First Name').fill('Alex')
  await page.getByLabel('Guardian Surname').fill('Rivera')
  await page.getByLabel('Guardian Phone Number').fill('4165550109')
  await page
    .getByLabel('Please select which site you are attending from')
    .selectOption('Thorncliffe Park -TNO')
  await page.getByLabel('Guardian Postal Code').fill('A1A 1A1')

  await page.getByRole('button', { name: 'Next' }).click()

  await assertNoErrorAfterSubmit(page)

  await expect(
    page.getByText('Will your child attend using their own email address?')
  ).toBeVisible()

  await page.getByLabel('No, they do not have their own email').check()
  await page.getByLabel('Child first name').fill('Jamie')
  await page.getByLabel('Child surname').fill('Rivera')

  await page.getByRole('button', { name: 'Next' }).click()

  await assertNoErrorAfterSubmit(page)

  await expect(page).toHaveURL(/step=forms/)
})
