import { expect, test } from '@playwright/test'

import { lowInventoryAlertEventKey, resolveLowInventoryTransition } from '../../app/lib/gift-cards/inventory-alerts'

test('low-inventory transition matrix covers enter, stay, recover, and ok states', async () => {
  expect(resolveLowInventoryTransition({ wasLow: false, isLow: true })).toBe('enter_low')
  expect(resolveLowInventoryTransition({ wasLow: true, isLow: true })).toBe('stay_low')
  expect(resolveLowInventoryTransition({ wasLow: true, isLow: false })).toBe('recover')
  expect(resolveLowInventoryTransition({ wasLow: false, isLow: false })).toBe('stay_ok')
})

test('low inventory event key is stable and normalizes recipient casing/spacing', async () => {
  expect(
    lowInventoryAlertEventKey({
      provider: 'Sobeys',
      threshold: 8,
      toEmail: ' Staff@Example.com ',
    })
  ).toBe('gift-card-inventory-low:Sobeys:8:staff@example.com')
})
