import { expect, test } from '@playwright/test'

import { renderGiftCardInventoryLowEmail } from '../../app/lib/email/templates/gift-card-inventory-low'

test('gift card shortfall email template renders weekly shortfalls', async () => {
  const rendered = renderGiftCardInventoryLowEmail({
    provider: 'PC',
    availableCount: 5,
    thisWeekLabel: 'Aug 9-Aug 15',
    thisWeekNeeded: 4,
    thisWeekShortfall: 0,
    upcomingWeekLabel: 'Aug 16-Aug 22',
    upcomingWeekNeeded: 8,
    upcomingWeekShortfall: 7,
    manageUrl: 'https://hub.summerlunchplus.com/manage/gift-cards',
  })

  expect(rendered.subject).toContain('Gift card shortfall alert')
  expect(rendered.text).toContain('Available: 5')
  expect(rendered.text).toContain('Upcoming week shortfall: 7')
  expect(rendered.html).toContain('Review inventory in manage gift cards')
})
