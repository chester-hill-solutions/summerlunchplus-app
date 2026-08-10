import type { GiftCardAllocationForecastSnapshot, GiftCardProvider } from '@/lib/gift-cards/forecast.server'

export type GiftCardShortfall = {
  available: number
  thisWeekNeeded: number
  thisWeekShortfall: number
  upcomingWeekNeeded: number
  upcomingWeekShortfall: number
}

export const resolveGiftCardShortfall = ({
  available,
  thisWeekNeeded,
  upcomingWeekNeeded,
}: {
  available: number
  thisWeekNeeded: number
  upcomingWeekNeeded: number
}): GiftCardShortfall => {
  const thisWeekShortfall = Math.max(0, thisWeekNeeded - available)
  const availableAfterThisWeek = Math.max(0, available - thisWeekNeeded)
  const upcomingWeekShortfall = Math.max(0, upcomingWeekNeeded - availableAfterThisWeek)
  return { available, thisWeekNeeded, thisWeekShortfall, upcomingWeekNeeded, upcomingWeekShortfall }
}

export const resolveGiftCardShortfallForProvider = (
  snapshot: GiftCardAllocationForecastSnapshot,
  provider: GiftCardProvider
) =>
  resolveGiftCardShortfall({
    available: snapshot.available[provider],
    thisWeekNeeded: snapshot.weeks[0].stillNeeded[provider],
    upcomingWeekNeeded: snapshot.weeks[1].stillNeeded[provider],
  })

export const hasGiftCardShortfall = (shortfall: GiftCardShortfall) =>
  shortfall.thisWeekShortfall > 0 || shortfall.upcomingWeekShortfall > 0

export const giftCardInventoryAlertEventKey = ({
  provider,
  slot,
  toEmail,
}: {
  provider: GiftCardProvider
  slot: string
  toEmail: string
}) => `gift-card-inventory-shortfall:${provider}:${slot}:${toEmail.trim().toLowerCase()}`
