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

test('guardian sign-up creates a guardian profile', async ({ page }) => {
  const now = new Date()
  const stamp = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(
    now.getSeconds()
  ).padStart(2, '0')}${String(now.getMilliseconds()).padStart(3, '0')}`
  const email = `sai+SlpE2eGuardian${stamp}@chsolutions.ca`

  await page.goto('/')

  await page.locator('form').getByRole('link', { name: 'Sign up' }).click()
  await page.getByRole('button', { name: 'I am a Guardian' }).click()

  await page.getByLabel('Gmail').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('123456789123456')
  await page.getByLabel('Repeat Password').fill('123456789123456')

  await page.getByRole('button', { name: 'Next' }).click()

  await assertNoErrorAfterSubmit(page)
  await expect(page.getByLabel('Your first name')).toBeVisible()

  await page.getByLabel('Your first name').fill('Alex')
  await page.getByLabel('Your surname').fill('Rivera')
  await page.getByLabel('Your phone number').fill('4165550109')

  await page.getByRole('button', { name: 'Save and continue' }).click()

  await assertNoErrorAfterSubmit(page)

  await expect(page.getByLabel('Child first name')).toBeVisible()

  await page.getByLabel('Child first name').fill('Jamie')
  await page.getByLabel('Child surname').fill('Rivera')
  await page.getByLabel('Child date of birth').fill('2012-05-10')
  await page.getByLabel('No - this is their 1st summer').check()

  await page.getByRole('button', { name: 'Save and continue' }).click()

  await assertNoErrorAfterSubmit(page)

  await expect(page.getByText(/^Child Email$/)).toBeVisible()
})
