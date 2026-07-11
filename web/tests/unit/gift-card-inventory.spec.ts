import { expect, test } from '@playwright/test'

import { renderGiftCardInventoryLowEmail } from '../../app/lib/email/templates/gift-card-inventory-low'

const loadInventoryModule = async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? 'test-service-role-key'
  return import('../../app/lib/gift-cards/inventory.server')
}

test('low-threshold env parsing uses defaults and rejects invalid values', async () => {
  const { resolveGiftCardLowThresholds } = await loadInventoryModule()
  const previousPc = process.env.GIFT_CARD_LOW_THRESHOLD_PC
  const previousSobeys = process.env.GIFT_CARD_LOW_THRESHOLD_SOBEYS

  try {
    delete process.env.GIFT_CARD_LOW_THRESHOLD_PC
    delete process.env.GIFT_CARD_LOW_THRESHOLD_SOBEYS
    expect(resolveGiftCardLowThresholds()).toEqual({ PC: 0, Sobeys: 0 })

    process.env.GIFT_CARD_LOW_THRESHOLD_PC = '12'
    process.env.GIFT_CARD_LOW_THRESHOLD_SOBEYS = ' 9 '
    expect(resolveGiftCardLowThresholds()).toEqual({ PC: 12, Sobeys: 9 })

    process.env.GIFT_CARD_LOW_THRESHOLD_PC = '-1'
    process.env.GIFT_CARD_LOW_THRESHOLD_SOBEYS = 'nope'
    expect(resolveGiftCardLowThresholds()).toEqual({ PC: 0, Sobeys: 0 })
  } finally {
    if (previousPc === undefined) {
      delete process.env.GIFT_CARD_LOW_THRESHOLD_PC
    } else {
      process.env.GIFT_CARD_LOW_THRESHOLD_PC = previousPc
    }

    if (previousSobeys === undefined) {
      delete process.env.GIFT_CARD_LOW_THRESHOLD_SOBEYS
    } else {
      process.env.GIFT_CARD_LOW_THRESHOLD_SOBEYS = previousSobeys
    }
  }
})

test('demand horizon env parsing uses default when invalid', async () => {
  const { resolveGiftCardDemandHorizonDays } = await loadInventoryModule()
  const previous = process.env.GIFT_CARD_DEMAND_HORIZON_DAYS

  try {
    delete process.env.GIFT_CARD_DEMAND_HORIZON_DAYS
    expect(resolveGiftCardDemandHorizonDays()).toBe(14)

    process.env.GIFT_CARD_DEMAND_HORIZON_DAYS = '21'
    expect(resolveGiftCardDemandHorizonDays()).toBe(21)

    process.env.GIFT_CARD_DEMAND_HORIZON_DAYS = '-2'
    expect(resolveGiftCardDemandHorizonDays()).toBe(14)
  } finally {
    if (previous === undefined) {
      delete process.env.GIFT_CARD_DEMAND_HORIZON_DAYS
    } else {
      process.env.GIFT_CARD_DEMAND_HORIZON_DAYS = previous
    }
  }
})

test('provider parsing maps meal kit to null and defaults unknown to PC', async () => {
  const { parseGiftCardProviderFromDisplay } = await loadInventoryModule()
  expect(parseGiftCardProviderFromDisplay('Sobeys')).toBe('Sobeys')
  expect(parseGiftCardProviderFromDisplay('PC Financial')).toBe('PC')
  expect(parseGiftCardProviderFromDisplay('Meal Kit')).toBeNull()
  expect(parseGiftCardProviderFromDisplay('something else')).toBe('PC')
  expect(parseGiftCardProviderFromDisplay(null)).toBe('PC')
})

test('low inventory email template renders key inventory metrics', async () => {
  const rendered = renderGiftCardInventoryLowEmail({
    provider: 'PC',
    availableCount: 5,
    threshold: 8,
    nearTermDemand: 10,
    upcomingDemand: 4,
    projectedDemand: 14,
    projectedShortfall: 9,
    manageUrl: 'https://hub.summerlunchplus.com/manage/gift-cards',
  })

  expect(rendered.subject).toContain('Low gift card inventory alert')
  expect(rendered.text).toContain('Available: 5')
  expect(rendered.text).toContain('Projected shortfall: 9')
  expect(rendered.html).toContain('Review inventory in manage gift cards')
})
