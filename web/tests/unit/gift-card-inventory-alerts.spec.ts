import { expect, test } from '@playwright/test'

import {
  giftCardInventoryAlertEventKey,
  hasGiftCardShortfall,
  resolveGiftCardShortfall,
} from '../../app/lib/gift-cards/inventory-alerts'

test('reserves this-week cards before evaluating the upcoming-week shortfall', () => {
  expect(resolveGiftCardShortfall({ available: 5, thisWeekNeeded: 4, upcomingWeekNeeded: 4 })).toEqual({
    available: 5,
    thisWeekNeeded: 4,
    thisWeekShortfall: 0,
    upcomingWeekNeeded: 4,
    upcomingWeekShortfall: 3,
  })
})

test('reports a shortfall when either week cannot be covered', () => {
  expect(hasGiftCardShortfall(resolveGiftCardShortfall({ available: 3, thisWeekNeeded: 4, upcomingWeekNeeded: 0 }))).toBe(true)
  expect(hasGiftCardShortfall(resolveGiftCardShortfall({ available: 8, thisWeekNeeded: 4, upcomingWeekNeeded: 4 }))).toBe(false)
})

test('alert event key is stable within a scheduler slot and normalizes recipient email', () => {
  expect(
    giftCardInventoryAlertEventKey({
      provider: 'Sobeys',
      slot: '2026-08-10-09',
      toEmail: ' Staff@Example.com ',
    })
  ).toBe('gift-card-inventory-shortfall:Sobeys:2026-08-10-09:staff@example.com')
})
