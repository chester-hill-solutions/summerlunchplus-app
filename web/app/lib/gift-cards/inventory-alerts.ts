import type { GiftCardProvider } from '@/lib/gift-cards/inventory.server'

export type LowInventoryTransition = 'enter_low' | 'stay_low' | 'recover' | 'stay_ok'

export const resolveLowInventoryTransition = ({ wasLow, isLow }: { wasLow: boolean; isLow: boolean }): LowInventoryTransition => {
  if (!wasLow && isLow) return 'enter_low'
  if (wasLow && isLow) return 'stay_low'
  if (wasLow && !isLow) return 'recover'
  return 'stay_ok'
}

export const lowInventoryAlertEventKey = ({
  provider,
  threshold,
  toEmail,
}: {
  provider: GiftCardProvider
  threshold: number
  toEmail: string
}) => `gift-card-inventory-low:${provider}:${threshold}:${toEmail.trim().toLowerCase()}`
