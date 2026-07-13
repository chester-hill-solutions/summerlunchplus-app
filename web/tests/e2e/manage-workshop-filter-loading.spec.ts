import { expect, test } from '@playwright/test'

import {
  ensureReusableAdminAccount,
  getAdminSupabaseClient,
  hasAdminServiceEnv,
  loginAsAdmin,
} from './helpers/admin-account'

const getRenderedColumnWidth = async (page: import('@playwright/test').Page, column: string) => {
  return page.evaluate(columnName => {
    const resizeHandle = document.querySelector(`button[aria-label="Resize ${columnName}"]`)
    if (!resizeHandle) return null
    const th = resizeHandle.closest('th')
    const headerRow = th?.parentElement
    if (!th || !headerRow) return null
    const headerCells = Array.from(headerRow.children)
    const columnIndex = headerCells.indexOf(th)
    if (columnIndex < 0) return null
    const col = document.querySelectorAll('table colgroup col')[columnIndex] as HTMLElement | undefined
    if (!col) return null
    return Number.parseFloat(col.style.width)
  }, column)
}

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

  test('persists manual column widths and supports reset', async ({ page }) => {
    const storageKey = 'manage-table-column-widths:class-enrollment'
    const targetColumn = 'profile_display'
    const seededWidth = 332

    await loginAsAdmin(page)
    await page.goto('/manage/workshop-enrollment')

    await page.evaluate(key => {
      window.localStorage.removeItem(key)
    }, storageKey)

    await page.evaluate(
      ({ key, column, width }) => {
        window.localStorage.setItem(key, JSON.stringify({ [column]: width }))
      },
      { key: storageKey, column: targetColumn, width: seededWidth }
    )

    await page.reload()

    const seededRenderedWidth = await getRenderedColumnWidth(page, targetColumn)
    expect(seededRenderedWidth).not.toBeNull()
    expect(Math.round(seededRenderedWidth ?? 0)).toBe(seededWidth)

    const resizeHandle = page.getByRole('button', { name: `Resize ${targetColumn}` })
    const resizeBox = await resizeHandle.boundingBox()
    expect(resizeBox).not.toBeNull()

    await page.mouse.move((resizeBox?.x ?? 0) + (resizeBox?.width ?? 0) / 2, (resizeBox?.y ?? 0) + (resizeBox?.height ?? 0) / 2)
    await page.mouse.down()
    await page.mouse.move((resizeBox?.x ?? 0) + (resizeBox?.width ?? 0) / 2 + 90, (resizeBox?.y ?? 0) + (resizeBox?.height ?? 0) / 2)
    await page.mouse.up()

    const resizedWidth = await getRenderedColumnWidth(page, targetColumn)
    expect(resizedWidth).not.toBeNull()
    expect((resizedWidth ?? 0) - seededWidth).toBeGreaterThan(40)

    await page.reload()

    const reloadedWidth = await getRenderedColumnWidth(page, targetColumn)
    expect(reloadedWidth).not.toBeNull()
    expect(Math.abs((reloadedWidth ?? 0) - (resizedWidth ?? 0))).toBeLessThanOrEqual(2)

    await page.getByRole('button', { name: 'Reset widths' }).click()

    await expect
      .poll(async () =>
        page.evaluate(key => window.localStorage.getItem(key), storageKey)
      )
      .toBeNull()

    const resetWidth = await getRenderedColumnWidth(page, targetColumn)
    expect(resetWidth).not.toBeNull()
    expect((reloadedWidth ?? 0) - (resetWidth ?? 0)).toBeGreaterThan(10)
  })
})
