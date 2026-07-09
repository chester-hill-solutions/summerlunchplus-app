import { expect, test } from '@playwright/test'

import {
  classWeekFridayNoonTorontoIso,
  isReleaseReadyNow,
  releaseReadyAtIso,
} from '../../app/lib/gift-cards/release.server'

test('class week Friday noon uses same week for Friday evening classes', async () => {
  const mondayClass = classWeekFridayNoonTorontoIso('2026-07-06T14:00:00.000Z')
  const fridayEveningClass = classWeekFridayNoonTorontoIso('2026-07-10T23:00:00.000Z')

  expect(mondayClass).toBe('2026-07-10T16:00:00.000Z')
  expect(fridayEveningClass).toBe('2026-07-10T16:00:00.000Z')
})

test('release ready time is max of Friday noon and qualified plus six hours', async () => {
  const beforeFridayNoon = releaseReadyAtIso({
    classAtIso: '2026-07-08T12:00:00.000Z',
    qualificationSinceAtIso: '2026-07-08T12:00:00.000Z',
  })
  const afterFridayNoon = releaseReadyAtIso({
    classAtIso: '2026-07-10T23:00:00.000Z',
    qualificationSinceAtIso: '2026-07-10T22:00:00.000Z',
  })

  expect(beforeFridayNoon).toBe('2026-07-10T16:00:00.000Z')
  expect(afterFridayNoon).toBe('2026-07-11T04:00:00.000Z')
})

test('Toronto noon conversion is stable across DST boundaries', async () => {
  const spring = classWeekFridayNoonTorontoIso('2026-03-09T14:00:00.000Z')
  const fall = classWeekFridayNoonTorontoIso('2026-11-02T15:00:00.000Z')

  expect(spring).toBe('2026-03-13T16:00:00.000Z')
  expect(fall).toBe('2026-11-06T17:00:00.000Z')
})

test('readiness check compares release_ready_at with now', async () => {
  expect(
    isReleaseReadyNow({
      releaseReadyAt: '2026-07-10T16:00:00.000Z',
      now: Date.parse('2026-07-10T15:59:59.000Z'),
    })
  ).toBeFalsy()
  expect(
    isReleaseReadyNow({
      releaseReadyAt: '2026-07-10T16:00:00.000Z',
      now: Date.parse('2026-07-10T16:00:00.000Z'),
    })
  ).toBeTruthy()
})
