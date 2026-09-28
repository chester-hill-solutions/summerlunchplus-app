import { expect, test } from '@playwright/test'

import { isSemesterAccessExpired, semesterAccessExpiresAt } from '../../app/lib/semester-access.server'

test('semester access expires one calendar month after the semester ends', async () => {
  expect(semesterAccessExpiresAt('2026-07-15T14:30:45.123Z')?.toISOString()).toBe('2026-08-15T14:30:45.123Z')
})

test('semester access clamps calendar month expiry to the target month', async () => {
  expect(semesterAccessExpiresAt('2026-01-31T14:30:45.123Z')?.toISOString()).toBe('2026-02-28T14:30:45.123Z')
  expect(semesterAccessExpiresAt('2028-01-31T14:30:45.123Z')?.toISOString()).toBe('2028-02-29T14:30:45.123Z')
})

test('semester access expires at the exact deadline', async () => {
  expect(
    isSemesterAccessExpired({
      semesterEndsAt: '2026-07-15T14:30:45.123Z',
      now: Date.parse('2026-08-15T14:30:45.123Z'),
    }),
  ).toBeTruthy()
  expect(
    isSemesterAccessExpired({
      semesterEndsAt: '2026-07-15T14:30:45.123Z',
      now: Date.parse('2026-08-15T14:30:45.122Z'),
    }),
  ).toBeFalsy()
})

test('invalid semester end dates do not expire access', async () => {
  expect(isSemesterAccessExpired({ semesterEndsAt: null })).toBeFalsy()
  expect(isSemesterAccessExpired({ semesterEndsAt: 'not-a-date' })).toBeFalsy()
})
