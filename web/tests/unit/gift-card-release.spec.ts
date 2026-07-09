import { expect, test } from '@playwright/test'

import {
  classWeekFridayNoonTorontoIso,
  isReleaseReadyNow,
  resolveGiftCardReleaseFromTiming,
  resolveGiftCardRelease,
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

test('release resolver does not release when availability state is missing even if release_ready_at is present', async () => {
  const release = resolveGiftCardRelease({
    metadata: {
      release_ready_at: '2026-07-10T16:00:00.000Z',
      qualification_since_at: null,
      release_at: '2026-07-14T16:00:00.000Z',
    },
    classAt: '2026-07-08T12:00:00.000Z',
    classEndsAt: '2026-07-08T13:00:00.000Z',
    now: Date.parse('2026-07-10T16:00:00.000Z'),
  })

  expect(release.source).toBe('missing_availability_state')
  expect(release.isReleased).toBeFalsy()
})

test('release resolver requires persisted availability state when metadata state is missing', async () => {
  const release = resolveGiftCardRelease({
    metadata: {
      release_at: '2026-07-14T16:00:00.000Z',
    },
    classAt: '2026-07-08T12:00:00.000Z',
    classEndsAt: '2026-07-08T13:00:00.000Z',
    now: Date.parse('2026-07-11T16:00:00.000Z'),
  })

  expect(release.source).toBe('missing_availability_state')
  expect(release.isReleased).toBeFalsy()
})

test('release resolver force-available override always releases', async () => {
  const release = resolveGiftCardRelease({
    metadata: {
      availability_state: 'available',
      release_at: '2099-07-14T16:00:00.000Z',
    },
    classAt: '2026-07-08T12:00:00.000Z',
    classEndsAt: '2026-07-08T13:00:00.000Z',
    now: Date.parse('2026-07-11T16:00:00.000Z'),
  })

  expect(release.source).toBe('availability_state')
  expect(release.isReleased).toBeTruthy()
})

test('release resolver force-unavailable override blocks release', async () => {
  const release = resolveGiftCardRelease({
    metadata: {
      availability_state: 'unavailable',
      release_ready_at: '2026-07-10T16:00:00.000Z',
    },
    classAt: '2026-07-08T12:00:00.000Z',
    classEndsAt: '2026-07-08T13:00:00.000Z',
    now: Date.parse('2026-07-11T16:00:00.000Z'),
  })

  expect(release.source).toBe('availability_state')
  expect(release.isReleased).toBeFalsy()
})

test('timing resolver still computes release readiness without persisted availability state', async () => {
  const release = resolveGiftCardReleaseFromTiming({
    metadata: {
      release_at: '2026-07-10T16:00:00.000Z',
    },
    classAt: '2026-07-08T12:00:00.000Z',
    classEndsAt: '2026-07-08T13:00:00.000Z',
    now: Date.parse('2026-07-10T16:00:00.000Z'),
  })

  expect(release.isReleased).toBeTruthy()
})
