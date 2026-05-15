import { expect, test } from '@playwright/test'

import { detectAddressMismatchSignal, detectNetworkDistanceSignal } from '../../app/lib/suspicious-signals'

test('detects address mismatch across family members', () => {
  const signal = detectAddressMismatchSignal([
    {
      id: 'guardian-1',
      role: 'guardian',
      firstname: 'Alex',
      surname: 'One',
      email: 'guardian@example.com',
      street_address: '123 Main St',
      city: 'Toronto',
      province: 'ON',
      postcode: 'M1M 1M1',
    },
    {
      id: 'student-1',
      role: 'student',
      firstname: 'Sam',
      surname: 'One',
      email: 'student@example.com',
      street_address: '999 Different Ave',
      city: 'Toronto',
      province: 'ON',
      postcode: 'M1M 1M1',
    },
  ])

  expect(signal).not.toBeNull()
  expect(signal?.summary).toContain('different addresses')
})

test('does not flag matching normalized addresses', () => {
  const signal = detectAddressMismatchSignal([
    {
      id: 'guardian-1',
      role: 'guardian',
      firstname: 'Alex',
      surname: 'One',
      email: 'guardian@example.com',
      street_address: '123 Main St',
      city: 'Toronto',
      province: 'ON',
      postcode: 'M1M 1M1',
    },
    {
      id: 'student-1',
      role: 'student',
      firstname: 'Sam',
      surname: 'One',
      email: 'student@example.com',
      street_address: '123   main st',
      city: 'Toronto',
      province: 'ON',
      postcode: 'm1m-1m1',
    },
  ])

  expect(signal).toBeNull()
})

test('detects suspicious network offset gap in short window', () => {
  const now = new Date('2026-05-15T16:00:00.000Z').toISOString()
  const tenMinAgo = new Date('2026-05-15T15:50:00.000Z').toISOString()

  const signal = detectNetworkDistanceSignal([
    {
      id: 'sub-1',
      profile_id: 'guardian-1',
      submitted_at: now,
      ip_address: '198.51.100.10',
      metadata: { client_offset_minutes: 240 },
    },
    {
      id: 'sub-2',
      profile_id: 'student-1',
      submitted_at: tenMinAgo,
      ip_address: '203.0.113.77',
      metadata: { client_offset_minutes: -120 },
    },
  ])

  expect(signal).not.toBeNull()
  expect(signal?.severity).toBe('high')
})
