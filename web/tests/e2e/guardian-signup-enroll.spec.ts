import { expect, test } from '@playwright/test'

import { uniqueSuffix } from './helpers/ids'
import { submitStepWithRetry } from './helpers/onboarding'

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

    if ((await page.getByText(/grocery gift card/i).count()) > 0) {
      await expect(page.getByText(/grocery gift card/i)).toBeVisible()
      await expect(page.getByText(/meal kit/i)).toHaveCount(0)

      // Give the UI a moment on consent step before submit.
      await page.waitForTimeout(1500)
    }

    if ((await saveAndContinue.count()) === 0) {
      if (page.url().includes('/home')) break
      throw new Error('Save and continue button not found before onboarding completed')
    }

    await submitStepWithRetry(page, /Save and continue/i, 8, {
      emailFactory: () => `autofill+${uniqueSuffix()}@gmail.com`,
    })
    await page.waitForLoadState('networkidle')
  }

  await expect(page).toHaveURL(/\/home/)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForLoadState('networkidle')

  const manageEnrollmentsLink = page.locator('a[href="/enroll"]').first()
  if ((await manageEnrollmentsLink.count()) > 0) {
    await expect(manageEnrollmentsLink).toBeVisible()
    await manageEnrollmentsLink.scrollIntoViewIfNeeded()
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

  await submitStepWithRetry(page, /Save and continue/i, 6, {
    emailFactory: () => `autofill+${uniqueSuffix()}@gmail.com`,
  })

  const enrollAction = page.getByRole('button', { name: /Request enrollment|Join waitlist/ }).first()
  await expect(enrollAction).toBeVisible()
  await enrollAction.click()

  await expect(page).toHaveURL(/\/home\?/)
  await expect(page).toHaveURL(/enrollmentStatus=success/)
  await expect(page.getByText(/Thank you for registering for summerlunch\+!/)).toBeVisible()
})
