import { expect, test } from '@playwright/test'

import { isSemesterAccessExpired, semesterAccessExpiresAt } from '../../app/lib/semester-access.server'

test('semester access expires 40 days after the semester ends', async () => {
  expect(semesterAccessExpiresAt('2026-07-15T14:30:45.123Z')?.toISOString()).toBe('2026-08-24T14:30:45.123Z')
})

test('semester access uses elapsed days across month boundaries', async () => {
  expect(semesterAccessExpiresAt('2026-01-31T14:30:45.123Z')?.toISOString()).toBe('2026-03-12T14:30:45.123Z')
})

test('semester access expires at the exact deadline', async () => {
  expect(
    isSemesterAccessExpired({
      semesterEndsAt: '2026-07-15T14:30:45.123Z',
      now: Date.parse('2026-08-24T14:30:45.123Z'),
    }),
  ).toBeTruthy()
  expect(
    isSemesterAccessExpired({
      semesterEndsAt: '2026-07-15T14:30:45.123Z',
      now: Date.parse('2026-08-24T14:30:45.122Z'),
    }),
  ).toBeFalsy()
})

test('invalid semester end dates do not expire access', async () => {
  expect(isSemesterAccessExpired({ semesterEndsAt: null })).toBeFalsy()
  expect(isSemesterAccessExpired({ semesterEndsAt: 'not-a-date' })).toBeFalsy()
})
