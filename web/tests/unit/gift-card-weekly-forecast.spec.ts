import { expect, test } from '@playwright/test'

const loadForecastModule = async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? 'test-service-role-key'
  return import('../../app/lib/gift-cards/forecast.server')
}

test('weekly gift-card ranges are consecutive Sunday-Saturday Toronto weeks', async () => {
  const { buildGiftCardWeekRanges } = await loadForecastModule()

  const weeks = buildGiftCardWeekRanges(new Date('2026-08-10T16:00:00.000Z'))

  expect(weeks).toEqual([
    { startsAt: '2026-08-09T04:00:00.000Z', endsAt: '2026-08-16T04:00:00.000Z' },
    { startsAt: '2026-08-16T04:00:00.000Z', endsAt: '2026-08-23T04:00:00.000Z' },
    { startsAt: '2026-08-23T04:00:00.000Z', endsAt: '2026-08-30T04:00:00.000Z' },
  ])
})

test('weekly gift-card ranges preserve Toronto midnight through fall DST', async () => {
  const { buildGiftCardWeekRanges } = await loadForecastModule()

  const [thisWeek, nextWeek] = buildGiftCardWeekRanges(new Date('2026-11-01T18:00:00.000Z'))

  expect(thisWeek).toEqual({ startsAt: '2026-11-01T04:00:00.000Z', endsAt: '2026-11-08T05:00:00.000Z' })
  expect(nextWeek.startsAt).toBe(thisWeek.endsAt)
})
