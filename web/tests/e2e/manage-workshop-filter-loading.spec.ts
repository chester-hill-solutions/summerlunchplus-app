import { expect, test } from '@playwright/test'

import {
  ensureReusableAdminAccount,
  getAdminSupabaseClient,
  hasAdminServiceEnv,
  loginAsAdmin,
} from './helpers/admin-account'

const seedPriorParticipationAnswer = async () => {
  const adminSupabase = getAdminSupabaseClient()

  const { data: enrollmentRow, error: enrollmentError } = await adminSupabase
    .from('workshop_enrollment')
    .select('profile_id')
    .not('profile_id', 'is', null)
    .limit(1)
    .maybeSingle()

  if (enrollmentError || !enrollmentRow?.profile_id) {
    throw new Error(enrollmentError?.message ?? 'Unable to find workshop enrollment with profile_id')
  }

  const { data: formRow, error: formError } = await adminSupabase
    .from('form')
    .select('id')
    .limit(1)
    .maybeSingle()

  if (formError || !formRow?.id) {
    throw new Error(formError?.message ?? 'Unable to find form for submission fixture')
  }

  const { data: submissionRow, error: submissionError } = await adminSupabase
    .from('form_submission')
    .insert({
      form_id: formRow.id,
      profile_id: enrollmentRow.profile_id,
      submitted_at: new Date().toISOString(),
      ip_address: '203.0.113.10',
      metadata: { source: 'e2e-manage-workshop-filter-loading' },
    })
    .select('id')
    .single()

  if (submissionError || !submissionRow?.id) {
    throw new Error(submissionError?.message ?? 'Unable to create submission fixture')
  }

  const { error: answerError } = await adminSupabase.from('form_answer').upsert(
    {
      submission_id: submissionRow.id,
      question_code: 'child_prior_participation',
      value: 'Yes',
    },
    { onConflict: 'submission_id,question_code' }
  )

  if (answerError) {
    throw new Error(answerError.message)
  }
}

test.describe.serial('manage workshop filter loading behavior', () => {
  test.skip(!hasAdminServiceEnv(), 'Requires SUPABASE_URL and SUPABASE_SECRET_KEY for admin setup')

  test.beforeAll(async () => {
    await ensureReusableAdminAccount()
    await seedPriorParticipationAnswer()
  })

  test('can clear an applied filter while options are still loading', async ({ page }) => {
    await page.route('**/manage/workshop-enrollment/enrichment*', async route => {
      await new Promise(resolve => setTimeout(resolve, 900))
      await route.continue()
    })

    await loginAsAdmin(page)
    await page.goto('/manage/workshop-enrollment?f_prior_participation_display=N/A')
    await page.getByLabel('Filter prior_participation_display').click()

    await expect(page.getByText('Loading...')).toBeVisible()

    const clearFilterButton = page.getByRole('button', { name: 'Clear current filter' })
    await expect(clearFilterButton).toBeEnabled()
    await clearFilterButton.click()
    await page.getByRole('button', { name: 'Apply' }).click()

    await expect(page).not.toHaveURL(/f_prior_participation_display=N%2FA|f_prior_participation_display=N\/A/)
  })

  test('URL-applied enrichment filter still renders rows and profile hover title', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/manage/workshop-enrollment?f_prior_participation_display=N/A')

    const rows = page.locator('tbody tr')
    await expect.poll(async () => await rows.count(), { timeout: 15000 }).toBeGreaterThan(0)

    const hoverTriggers = page.locator('tbody [data-hovercard-cell-id]')
    await expect.poll(async () => await hoverTriggers.count(), { timeout: 15000 }).toBeGreaterThan(0)
    const hoverTrigger = hoverTriggers.first()
    await hoverTrigger.hover()

    const hoverPanel = page.locator('div[class*="bg-popover"][class*="text-popover-foreground"]').first()
    await expect(hoverPanel).toBeVisible({ timeout: 5000 })

    const hoverTitle = hoverPanel.locator('p.font-semibold').first()
    await expect(hoverTitle).toBeVisible()
    await expect(hoverTitle).not.toHaveText(/^\s*$/)
  })
})
