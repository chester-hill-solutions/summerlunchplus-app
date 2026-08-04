import { expect, test } from '@playwright/test'

import { ensureReusableAdminAccount, getAdminSupabaseClient, hasAdminServiceEnv, loginAsAdmin } from './helpers/admin-account'
import { uniqueSuffix } from './helpers/ids'

type DistrictCounts = {
  total: number
  families: number
  accepted: number
  pending: number
  waitlisted: number
  declined: number
  giftcard_pc: number
  giftcard_sobeys: number
  giftcard_meal_kit: number
  household_count: number
  household_child_count: number
}

test.describe.serial('federal electoral district metrics', () => {
  test.skip(!hasAdminServiceEnv(), 'Requires SUPABASE_URL and SUPABASE_SECRET_KEY for admin setup')

  test.beforeAll(async () => {
    await ensureReusableAdminAccount()
  })

  test('uses one bounded POST enrichment request and applies status filters', async ({ page }) => {
    const requests: Array<{ statuses: string[]; ridings: string[] }> = []

    await page.route('**/manage/federal-electoral-district/enrichment', async route => {
      const payload = route.request().postDataJSON() as { ridings?: string[]; enrollmentStatuses?: string[] }
      const ridings = payload.ridings ?? []
      const statuses = payload.enrollmentStatuses ?? []
      requests.push({ ridings, statuses })

      const byRiding = Object.fromEntries(
        ridings.map(riding => [riding, {
          total: statuses.length ? 1 : 2,
          families: 1,
          accepted: statuses.includes('approved') ? 1 : 0,
          pending: statuses.includes('pending') ? 1 : 0,
          waitlisted: 0,
          declined: 0,
          giftcard_pc: 0,
          giftcard_sobeys: 0,
          giftcard_meal_kit: 0,
          household_count: 0,
          household_child_count: 0,
        }])
      )

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ byRiding }) })
    })

    await loginAsAdmin(page)
    await page.goto('/manage/federal-electoral-district')
    await expect.poll(() => requests.length).toBe(1)
    expect(requests[0]?.ridings.length).toBeGreaterThan(0)
    expect(requests[0]?.ridings.length).toBeLessThan(1000)
    expect(requests[0]?.statuses).toEqual([])

    await expect(page.getByRole('cell', { name: '1' }).first()).toBeVisible()

    await page.getByRole('button', { name: /Enrollment status: All statuses/ }).click()
    await page.getByRole('dialog').getByText('Pending', { exact: true }).click()
    await page.getByRole('button', { name: 'Apply' }).click()

    await expect(page).toHaveURL(/enrollmentStatus=pending/)
    await expect.poll(() => requests.length).toBe(2)
    expect(requests[1]?.statuses).toEqual(['pending'])
  })

  test('live enrichment returns district metrics successfully', async ({ page }) => {
    test.setTimeout(120_000)
    await loginAsAdmin(page)
    const responsePromise = page.waitForResponse(
      response =>
        response.request().method() === 'POST' &&
        response.url().includes('/manage/federal-electoral-district/enrichment')
    )
    await page.goto('/manage/federal-electoral-district')
    const response = await responsePromise
    expect(response.status()).toBe(200)

    const payload = (await response.json()) as { byRiding?: Record<string, unknown> }
    expect(Object.keys(payload.byRiding ?? {}).length).toBeGreaterThan(0)
  })

  test('cross-references an isolated database enrollment against endpoint deltas', async ({ page }) => {
    test.setTimeout(120_000)
    const adminSupabase = getAdminSupabaseClient()
    await loginAsAdmin(page)

    const { data: district, error: districtError } = await adminSupabase
      .from('federal_electoral_district')
      .select('name')
      .order('name')
      .limit(1)
      .single()
    if (districtError || !district?.name) throw new Error(districtError?.message ?? 'No district fixture available')

    const readMetrics = async () => {
      const response = await page.request.post('/manage/federal-electoral-district/enrichment', {
        data: { ridings: [district.name] },
      })
      expect(response.status()).toBe(200)
      const payload = (await response.json()) as { byRiding?: Record<string, DistrictCounts> }
      const metrics = payload.byRiding?.[district.name]
      if (!metrics) throw new Error(`No metrics returned for ${district.name}`)
      return metrics
    }

    const baseline = await readMetrics()
    const suffix = uniqueSuffix()
    const email = `federal-district-cross-check-${suffix}@example.test`
    let profileId: string | null = null
    let semesterId: string | null = null
    let workshopId: string | null = null

    try {
      const { data: profile, error: profileError } = await adminSupabase
        .from('profile')
        .insert({
          role: 'guardian',
          email,
          firstname: 'Federal District Cross Check',
          surname: suffix,
          federal_electoral_district_name: district.name,
        })
        .select('id')
        .single()
      if (profileError || !profile?.id) throw new Error(profileError?.message ?? 'Unable to create profile fixture')
      profileId = profile.id

      const { data: semester, error: semesterError } = await adminSupabase
        .from('semester')
        .insert({
          name: `Federal district cross-check ${suffix}`,
          starts_at: '2026-01-01T00:00:00Z',
          ends_at: '2026-12-31T00:00:00Z',
        })
        .select('id')
        .single()
      if (semesterError || !semester?.id) throw new Error(semesterError?.message ?? 'Unable to create semester fixture')
      semesterId = semester.id

      const { data: workshop, error: workshopError } = await adminSupabase
        .from('workshop')
        .insert({ semester_id: semester.id, description: `Federal district cross-check ${suffix}` })
        .select('id')
        .single()
      if (workshopError || !workshop?.id) throw new Error(workshopError?.message ?? 'Unable to create workshop fixture')
      workshopId = workshop.id

      const { data: enrollment, error: enrollmentError } = await adminSupabase
        .from('workshop_enrollment')
        .insert({ profile_id: profile.id, semester_id: semester.id, workshop_id: workshop.id, status: 'approved' })
        .select('id, profile_id, status')
        .single()
      if (enrollmentError || !enrollment?.id) throw new Error(enrollmentError?.message ?? 'Unable to create enrollment fixture')
      expect(enrollment.profile_id).toBe(profile.id)
      expect(enrollment.status).toBe('approved')

      const after = await readMetrics()
      expect(after.total - baseline.total).toBe(1)
      expect(after.accepted - baseline.accepted).toBe(1)
      expect(after.families - baseline.families).toBe(1)
    } finally {
      if (profileId) await adminSupabase.from('workshop_enrollment').delete().eq('profile_id', profileId)
      if (workshopId) await adminSupabase.from('workshop').delete().eq('id', workshopId)
      if (semesterId) await adminSupabase.from('semester').delete().eq('id', semesterId)
      if (profileId) await adminSupabase.from('profile').delete().eq('id', profileId)
    }
  })
})
